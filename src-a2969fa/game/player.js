// Player controller. Pure logic: reads an input snapshot, moves with physics.js, asks the world to resolve attacks.
import { PLAYER as P, T, COMBAT as C } from './constants.js';
import { moveBody } from './physics.js';
import { weaponDef } from './weapons.js';

export function createPlayer(x, y, stats) {
  return {
    x, y, w: P.w, h: P.h, vx: 0, vy: 0, facing: 1,
    onGround: false, hitWallL: false, hitWallR: false,
    stats, hp: stats.maxHp,
    state: 'move', stateTime: 0,
    coyote: 0, jumpBuffer: 0, jumpsUsed: 0, wallLock: 0, wallDir: 0,
    dashLeft: stats.dashes, dashCd: 0, dashDir: 1,
    combo: 0, comboTimer: 0, attackDir: 'side', swingDone: false, queuedAttack: false,
    invuln: 0, flask: stats.flaskCharges, specialCd: 0, itemCd: [0, 0],
    lastSafe: { x, y }, safeTimer: 0,
    anim: 'idle', animSpeed: 1, animRestart: false, landTimer: 0, airTime: 0,
    dead: false, kills: 0, gold: 0, killsSinceHeal: 0,
    atkHeld: 0, charge: 0, chargeFull: false, counterT: 0, perfectThisDash: false,
  };
}

function setState(p, s) { p.state = s; p.stateTime = 0; }

export function updatePlayer(p, input, dt, world) {
  const st = p.stats;
  p.stateTime += dt;
  p.invuln = Math.max(0, p.invuln - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.specialCd = Math.max(0, p.specialCd - dt);
  p.comboTimer = Math.max(0, p.comboTimer - dt);
  p.wallLock = Math.max(0, p.wallLock - dt);
  p.counterT = Math.max(0, p.counterT - dt);
  p.atkHeld = input.attack ? p.atkHeld + dt : 0;
  p.animRestart = false;
  if (p.dead) { p.vx *= 0.9; p.vy -= P.gravity * dt; moveBody(world.level, p, dt); p.anim = 'death'; return; }

  if (input.jumpPressed) p.jumpBuffer = P.jumpBuffer; else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  const moveX = Math.abs(input.x) > 0.25 ? Math.sign(input.x) * Math.min(1, Math.abs(input.x) * 1.3) : 0;
  const speed = (st.moveSpeed > 3 ? st.moveSpeed : P.runSpeed * st.moveSpeed) * (p.speedMul || 1); // stats store m/s
  p.jumpHeld = input.jump;

  // --- state transitions from input -------------------------------------------------------------
  const canAct = p.state === 'move' || (p.state === 'attack' && p.swingDone);
  if (input.dashPressed && p.dashLeft > 0 && p.dashCd <= 0 && (p.state === 'move' || p.state === 'attack' || p.state === 'charge' || p.state === 'block')) {
    p.dashLeft--; p.dashCd = p.dashLeft > 0 ? 0.12 : P.dashCooldown * (st.dashCdMul || 1);
    p.dashDur = P.dashTime * (p.dashBoost ? 1.6 : 1); p.dashBoost = false;
    p.dashDir = moveX || p.facing; p.facing = p.dashDir;
    p.invuln = Math.max(p.invuln, P.dashTime + 0.05);
    p.dashHit = new Set(); p.perfectThisDash = false; p.charge = 0;
    setState(p, 'dash'); world.sfx('dash'); world.dashFx(p);
  } else if (input.attackPressed && (canAct || p.state === 'attack')) {
    if (canAct) startAttack(p, input, world); else p.queuedAttack = true;
  } else if (input.attack && p.atkHeld >= C.chargeDelay && p.state === 'move') {
    startCharge(p);
  } else if ((input.specialPressed || input.item2Pressed) && (p.state === 'move' || (p.state === 'attack' && p.swingDone))) {
    const slot = input.specialPressed ? 0 : 1, next = world.useItem?.(p, slot);
    if (next === 'block') { setState(p, 'block'); p.anim = 'block'; }
    else if (next) { setState(p, 'cast'); p.anim = 'stab'; p.animRestart = true; }
  } else if (input.flaskPressed && p.flask > 0 && p.hp < st.maxHp && p.onGround && p.state === 'move' && (world.canHeal?.() ?? true)) {
    setState(p, 'flask'); world.sfx('flask');
  }

  // --- per-state movement ----------------------------------------------------------------------
  let gravityMul = 1;
  switch (p.state) {
    case 'dash': {
      p.vx = p.dashDir * P.dashSpeed; p.vy = 0; gravityMul = 0;
      if (world.dashTick) world.dashTick(p); else if (st.dashDamage) world.dashDamage(p);
      if (p.stateTime >= (p.dashDur || P.dashTime)) { p.vx = p.dashDir * speed * 0.6; setState(p, 'move'); }
      break;
    }
    case 'attack': {
      const dur = P.attackTime / (st.attackSpeed * (p.atkMul || 1));
      const t = p.stateTime / dur;
      if (!p.swingDone && t >= 0.15) { p.swingDone = true; world.playerSwing(p); }
      // light steering while attacking; full control in the air
      const accel = p.onGround ? P.groundAccel * 0.5 : P.airAccel;
      const target = p.onGround ? moveX * speed * 0.35 : moveX * speed;
      p.vx = approach(p.vx, target, accel * dt);
      if (t >= 1 && input.attack && p.atkHeld >= C.chargeDelay && !p.queuedAttack) { startCharge(p); break; }
      if (t >= 1) {
        setState(p, 'move'); p.comboTimer = P.comboWindow;
        if (p.queuedAttack) { p.queuedAttack = false; startAttack(p, input, world); }
      }
      break;
    }
    case 'charge': {
      const full = C.chargeTime * weaponDef(st.weapon).charge / (st.chargeSpeed || 1);
      p.charge = Math.min(1, p.stateTime / full);
      if (p.charge >= 1 && !p.chargeFull) { p.chargeFull = true; world.chargeFx?.(p); }
      if (moveX) p.facing = Math.sign(moveX);
      const accel = p.onGround ? P.groundAccel : P.airAccel;
      p.vx = approach(p.vx, moveX * speed * (p.onGround ? 0.25 : 0.6), accel * dt);
      if (!input.attack) { // release: the heavy strike
        const perfect = p.chargeFull && p.stateTime - full <= C.perfectWindow;
        p.heavy = { charge: p.charge, full: p.chargeFull, perfect };
        p.attackDir = input.y > 0.5 ? 'up' : (input.y < -0.5 && !p.onGround ? 'down' : 'side');
        setState(p, 'heavy'); p.swingDone = false;
        p.anim = p.attackDir === 'down' ? 'leap' : 'heavy3'; p.animRestart = true; world.sfx('swing');
        if (p.onGround && p.attackDir === 'side') p.vx = p.facing * 7;
      }
      break;
    }
    case 'heavy': {
      const dur = C.heavyTime / (st.attackSpeed * (p.atkMul || 1));
      if (!p.swingDone && p.stateTime >= dur * 0.3) { p.swingDone = true; world.playerHeavy(p, p.heavy); }
      p.vx = approach(p.vx, p.onGround ? 0 : moveX * speed * 0.6, P.groundAccel * 0.6 * dt);
      if (p.stateTime >= dur) { setState(p, 'move'); p.charge = 0; p.chargeFull = false; p.combo = 0; }
      break;
    }
    case 'hurt':
      if (p.stateTime > 0.22) setState(p, 'move');
      break;
    case 'flask':
      p.vx = approach(p.vx, 0, P.groundAccel * dt);
      if (p.stateTime >= P.flaskTime / (st.flaskSpeed || 1)) {
        const base = st.flaskType && st.flaskType !== 'heal' ? 1 : P.flaskHeal;
        p.flask--; p.hp = Math.min(st.maxHp, p.hp + (world.flaskHeal ? world.flaskHeal(base) : base));
        world.healFx(p); world.onFlask?.(p); setState(p, 'move');
      }
      break;
    case 'block': { // buckler raised: slow walk, facing locked, lowered when the button is let go
      p.vx = approach(p.vx, moveX * speed * 0.3, P.groundAccel * dt);
      if (!(p.blockSlot ? input.item2 : input.special)) setState(p, 'move');
      break;
    }
    case 'cast':
      p.vx = approach(p.vx, 0, P.groundAccel * dt);
      if (p.stateTime > 0.3) setState(p, 'move');
      break;
    default: { // move
      if (p.wallLock <= 0) {
        const accel = p.onGround ? P.groundAccel : P.airAccel;
        p.vx = approach(p.vx, moveX * speed, accel * dt);
        if (moveX) p.facing = Math.sign(moveX);
      }
    }
  }

  // --- jumping (allowed in move and attack-recovery) -------------------------------------------
  const wallDir = !p.onGround ? (p.hitWallL ? -1 : p.hitWallR ? 1 : 0) : 0;
  const sliding = wallDir !== 0 && Math.sign(moveX) === wallDir && p.vy < 0 && p.state === 'move';
  if (p.onGround) { p.coyote = P.coyote; p.jumpsUsed = 0; p.dashLeft = st.dashes; }
  else p.coyote = Math.max(0, p.coyote - dt);

  if (p.jumpBuffer > 0 && (p.state === 'move' || (p.state === 'attack' && p.swingDone))) {
    if (input.y < -0.5 && p.onGround && standingOnPlatform(p, world.level)) {
      p.dropTimer = 0.25; p.jumpBuffer = 0;           // drop through one-way platform
    } else if (p.coyote > 0) {
      doJump(p, P.jumpVel); p.coyote = 0; world.sfx('jump');
    } else if (sliding || (wallDir && p.hitWallTime < 0.12)) {
      const d = wallDir || p.wallDir;
      p.vx = -d * P.wallJumpVx; p.vy = P.wallJumpVy; p.facing = -d;
      p.wallLock = P.wallJumpLock; p.jumpBuffer = 0; setState(p, 'move'); world.sfx('jump');
    } else if (p.jumpsUsed < st.jumps - 1) {
      p.jumpsUsed++; doJump(p, P.jumpVel * 0.9); world.sfx('jump'); world.dashFx(p, true);
    }
  }
  if (!input.jump && p.vy > 0 && p.jumpHeldPhase) { p.vy *= P.jumpCutMul; p.jumpHeldPhase = false; }
  if (p.vy <= 0) p.jumpHeldPhase = false;

  // gravity
  p.vy -= P.gravity * gravityMul * dt;
  if (sliding) p.vy = Math.max(p.vy, -P.wallSlideMax);
  p.vy = Math.max(p.vy, -P.maxFall);
  p.dropTimer = Math.max(0, (p.dropTimer || 0) - dt);
  p.dropThrough = p.dropTimer > 0;

  const wasGround = p.onGround, fallSpeed = p.vy;
  moveBody(world.level, p, dt);
  if (p.hitWallL || p.hitWallR) { p.wallDir = p.hitWallL ? -1 : 1; p.hitWallTime = 0; }
  else p.hitWallTime = (p.hitWallTime || 0) + dt;
  if (!wasGround && p.onGround && fallSpeed < -8) { p.landTimer = 0.12; world.landFx(p, fallSpeed); }
  p.landTimer = Math.max(0, p.landTimer - dt);
  p.airTime = p.onGround ? 0 : p.airTime + dt;

  // remember safe ground for hazard respawns
  if (p.onGround && !p.hazard) {
    p.safeTimer += dt;
    if (p.safeTimer > 0.25) { p.lastSafe.x = p.x; p.lastSafe.y = p.y; }
  } else p.safeTimer = 0;
  if (p.hazard) world.playerHazard(p, p.hazard);

  pickAnim(p, moveX, sliding);
}

function startCharge(p) {
  setState(p, 'charge'); p.charge = 0; p.chargeFull = false; p.queuedAttack = false;
}

function doJump(p, v) { p.vy = v; p.jumpBuffer = 0; p.jumpHeldPhase = true; p.animRestart = true; }

function startAttack(p, input, world) {
  p.attackDir = input.y > 0.5 ? 'up' : (input.y < -0.5 && !p.onGround ? 'down' : 'side');
  if (Math.abs(input.x) > 0.3) p.facing = Math.sign(input.x);
  const len = weaponDef(p.stats.weapon).combo || 3;
  p.combo = p.comboTimer > 0 && p.attackDir === 'side' ? (p.combo % len) + 1 : 1;
  p.swingDone = false; p.queuedAttack = false;
  setState(p, 'attack');
  if (p.onGround && p.attackDir === 'side') p.vx = p.facing * 5; // small lunge
  world.sfx('swing');
  p.anim = p.attackDir === 'down' ? 'leap' : p.attackDir === 'up' ? 'heavy2' : 'attack' + (((p.combo - 1) % 3) + 1);
  p.animRestart = true;
}

function pickAnim(p, moveX, sliding) {
  const st = p.stats;
  if (p.state === 'attack') { p.animSpeed = 1.6 * st.attackSpeed * (p.atkMul || 1); return; }
  if (p.state === 'cast') { p.animSpeed = 2; return; }
  if (p.state === 'charge') { p.anim = 'block'; p.animSpeed = 0.6; return; }
  if (p.state === 'block') { p.anim = 'block'; p.animSpeed = 1; return; }
  if (p.state === 'heavy') { p.animSpeed = 1.5 * st.attackSpeed * (p.atkMul || 1); return; }
  if (p.state === 'dash') { p.anim = 'dodge'; p.animSpeed = 2.2; return; }
  if (p.state === 'hurt') { p.anim = 'hurt'; p.animSpeed = 1.6; return; }
  if (p.state === 'flask') { p.anim = 'flourish'; p.animSpeed = 1.2; return; }
  p.animSpeed = 1;
  if (!p.onGround) {
    if (sliding) { p.anim = 'block'; return; }
    p.anim = p.vy > 1 ? 'jump' : 'fall';
    p.animSpeed = p.anim === 'jump' ? 1.2 : 1;
    return;
  }
  if (p.landTimer > 0 && !moveX) { p.anim = 'land'; p.animSpeed = 1.5; return; }
  // sprint cycle matched to ground speed so feet don't skate; slow walk-in uses the run cycle
  const v = Math.abs(p.vx);
  if (v > 0.5) { p.anim = v > 4.5 ? 'sprint' : 'run'; p.animSpeed = p.anim === 'sprint' ? v / 6.6 : Math.max(0.7, v / 4.2); return; }
  p.anim = 'idle';
}

function standingOnPlatform(p, level) {
  const ty = Math.floor(p.y - 0.1);
  for (let tx = Math.floor(p.x - p.w / 2); tx <= Math.floor(p.x + p.w / 2); tx++) {
    const t = level.tiles[ty * level.w + tx];
    if (t === T.SOLID) return false;
  }
  return true;
}

function approach(v, target, step) {
  return v < target ? Math.min(target, v + step) : Math.max(target, v - step);
}

// Damage from enemies/hazards. Returns true if it landed.
export function hurtPlayer(p, dmg, dirX, world, { ignoreInvuln = false, steadfast = false } = {}) {
  if (p.dead || (p.invuln > 0 && !ignoreInvuln)) return false;
  p.hp -= dmg;
  p.invuln = P.invulnAfterHit;
  if (steadfast && p.hp > 0) return true; // Undying Will / Unbroken Oath: the blow lands but doesn't interrupt
  p.vx = (dirX || -p.facing) * 9; p.vy = 9;
  if (p.state === 'flask' || p.state === 'attack' || p.state === 'cast' || p.state === 'charge' || p.state === 'heavy') p.queuedAttack = false;
  p.charge = 0; p.chargeFull = false;
  setState(p, 'hurt');
  if (p.hp <= 0) { p.hp = 0; p.dead = true; p.animRestart = true; }
  return true;
}
