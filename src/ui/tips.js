import { assetUrl } from '../assetUrl.js';
// Onboarding prompts: tutorial lessons + one-time "just in time" tips during real runs.
// Glyphs match the device in use (Synty input icons for keyboard/gamepad; on phones the real button pulses).
const K = (letter) => ({ key: letter });
const LESSONS = {
  move: { title: 'Move', text: 'Walk to the right.', keys: [K('A'), K('D')], pad: ['stick'], touch: { stick: true } },
  jump: { title: 'Jump', text: 'Hold jump to leap higher; tap for a short hop.', keys: ['space'], pad: ['a'], touch: { btn: 'jump' } },
  drop: { title: 'Drop down', text: 'Hold down and jump to fall through wooden ledges.', keys: [K('S'), '+', 'space'], pad: ['stick_down', '+', 'a'], touch: { stick: true, btn: 'jump', text: 'Pull the stick down, then jump.' } },
  dash: { title: 'Dash', text: 'Jump, then dash across. You cannot be hurt mid-dash.', keys: [K('L')], pad: ['rb'], touch: { btn: 'dash' } },
  walljump: { title: 'Wall jump', text: 'Push into a wall to slide, then jump to kick off it.', keys: ['space'], pad: ['a'], touch: { btn: 'jump' } },
  attack: { title: 'Attack', text: 'Strike the training dummies.', keys: [K('J')], pad: ['x'], touch: { btn: 'attack' } },
  combo: { title: 'Combo', text: 'Attack three times in a row — the third blow is a heavy finisher.', keys: [K('J'), K('J'), K('J')], pad: ['x', 'x', 'x'], touch: { btn: 'attack' } },
  upslash: { title: 'Up-slash', text: 'Hold up while attacking to strike above you.', keys: [K('W'), '+', K('J')], pad: ['stick_up', '+', 'x'], touch: { stick: true, btn: 'attack', text: 'Push the stick up and attack.' } },
  pogo: { title: 'Pogo', text: 'In the air, hold down and attack to bounce off spikes and foes.', keys: [K('S'), '+', K('J')], pad: ['stick_down', '+', 'x'], touch: { stick: true, btn: 'attack', text: 'Mid-air: stick down + attack.' } },
  heal: { title: 'Heal', text: 'Stand still and drink your flask.', keys: [K('H')], pad: ['lb'], touch: { btn: 'flask' } },
  shrine: { title: 'Shrines', text: 'Pray at shrines for blessings — each one changes how you fight.', keys: [K('W')], pad: ['y'], touch: { text: 'Tap Pray when it appears.' } },
  exit: { title: 'Descend', text: 'Step onto the lift to go deeper. There is no other way down.', keys: [], pad: [], touch: {} },
};
const JIT = {
  jit_shrine: { title: 'A shrine', text: 'Pray to choose a blessing. Blessings stack into builds.' },
  jit_merchant: { title: 'A trader', text: 'Spend gold on healing, weapons and blessings.' },
  jit_weapon: { title: 'A weapon altar', text: 'Swap weapons — your old one stays on the altar.' },
  jit_lowhp: { title: 'Last mask', text: 'Back off and drink your flask (stand still).' },
  jit_lift: { title: 'The way down', text: 'Follow the lanterns to the lift. Stand on it to descend.' },
};
const FOES = {
  skeleton: 'Swings after a short wind-up. Dodge, then punish.', skeleton_thrower: 'Lobs bones from range. Close in fast.',
  dwarf_undead: 'Charges in a line. Jump over or dash through.', undead_knight: 'Blocks from the front. Hit it after it attacks.',
  wisp: 'Dives at you. Strike it as it comes in.', goblin: 'Fast pouncer. Sidestep the leap, punish the landing.',
  goblin_shaman: 'Blinks away and casts homing orbs. Slash the orbs.', rock_golem: 'Armoured. Hit it during its long recovery.',
  ghost: 'Only solid while attacking. Strike when it lunges.', dwarf_bomber: 'Throws bombs. Watch the fuse, step out of the blast.',
  crystal_turret: 'Fires bursts of bolts. Close in between volleys.',
};
const NAMES = { skeleton: 'Skeleton', skeleton_thrower: 'Bone Thrower', dwarf_undead: 'Undead Dwarf', undead_knight: 'Undead Knight', wisp: 'Ash Wisp',
  goblin: 'Goblin', goblin_shaman: 'Goblin Shaman', rock_golem: 'Rock Golem', ghost: 'Ghost', dwarf_bomber: 'Dwarf Bomber', crystal_turret: 'Crystal Sentry' };

export class Tips {
  constructor(el, isTouch) {
    this.el = el; this.isTouch = isTouch; this.t = 0; this.current = null; this.sessionSeen = new Set();
  }

  show({ title, text, glyphs = [], foe = false, ms = 5500, touch = null }) {
    const el = this.el;
    el.classList.remove('hidden'); el.classList.toggle('foe', foe);
    el.querySelector('b').textContent = title;
    el.querySelector('span').textContent = text;
    const g = el.querySelector('.glyphs'); g.innerHTML = '';
    for (const x of glyphs) g.appendChild(this.glyph(x));
    // restart the entry animation
    el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
    this.clearTeach();
    if (touch?.btn) document.querySelector('#b-' + touch.btn)?.classList.add('teach');
    if (touch?.stick && !document.body.classList.contains('stick-used')) document.querySelector('#stick-zone')?.classList.add('teach');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), ms);
  }

  hide() { this.el.classList.add('hidden'); this.clearTeach(); }
  clearTeach() { document.querySelectorAll('.teach').forEach((n) => n.classList.remove('teach')); }

  glyph(x) {
    if (x === '+') { const s = document.createElement('span'); s.className = 'plus'; s.textContent = '+'; return s; }
    if ((typeof x === 'object' && x.key) || x === 'space') { // keycap
      const k = document.createElement('kbd'); k.className = 'cap' + (x === 'space' ? ' wide' : ''); k.textContent = x === 'space' ? 'SPACE' : x.key; return k;
    }
    const wrap = document.createElement('span');
    wrap.style.cssText = 'position:relative;display:inline-flex;align-items:center;justify-content:center';
    const img = document.createElement('img');
    let label = '';
    if (false) { /* keycaps handled above */ }
    else if (x === 'stick' || x === 'stick_up' || x === 'stick_down') { img.src = assetUrl(`assets/ui/keys/arrow_${x === 'stick_up' ? 'up' : x === 'stick_down' ? 'down' : 'right'}.png`); }
    else img.src = assetUrl(`assets/ui/keys/pad_${x}.png`);
    wrap.appendChild(img);
    if (label) {
      const t = document.createElement('b');
      t.textContent = label;
      t.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 15px Cinzel,serif;color:#1a1010;margin-top:-3px';
      wrap.appendChild(t);
    }
    return wrap;
  }

  device() {
    if (this.isTouch()) return 'touch';
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    return pads.length ? 'pad' : 'keys';
  }

  lesson(id) {
    const L = LESSONS[id]; if (!L) return;
    const dev = this.device();
    const glyphs = dev === 'touch' ? [] : dev === 'pad' ? L.pad : L.keys;
    const text = dev === 'touch' && L.touch?.text ? L.touch.text : L.text;
    this.show({ title: L.title, text, glyphs, touch: dev === 'touch' ? L.touch : null, ms: 9000 });
  }

  // Called every frame while playing.
  update(world, run, meta, markSeen) {
    const p = world.player;
    for (const ev of world.events) {
      if (ev.t === 'tip') {
        this.lesson(ev.id);
        if (ev.id === 'heal' && p.hp > 3) { p.hp = 3; p.flask = Math.max(1, p.flask); } // give the flask something to fix
      }
    }
    if (run?.tutorial) return;
    if (world.time < 3.2) return; // let the floor title banner finish first
    const seen = meta.tipsSeen || {};
    const once = (id, cond) => {
      if (!cond || seen[id] || this.sessionSeen.has(id)) return;
      this.sessionSeen.add(id); markSeen(id);
      const t = JIT[id]; this.show({ title: t.title, text: t.text });
    };
    const pk = world.prompt?.kind;
    once('jit_shrine', pk === 'shrine');
    once('jit_merchant', pk === 'shop');
    once('jit_weapon', pk === 'weapon');
    once('jit_lowhp', p.hp === 1 && !p.dead && p.flask > 0);
    once('jit_lift', run.depth === 1 && world.time > 25);
    // first sighting of each enemy type: a short "how to beat it" card
    for (const e of world.enemies) {
      if (!e.alive || e.offscreen || e.boss || !FOES[e.type]) continue;
      const id = 'foe_' + e.type;
      if (seen[id] || this.sessionSeen.has(id) || (meta.bestiary?.[e.type] > 0)) continue;
      this.sessionSeen.add(id); markSeen(id);
      this.show({ title: 'New foe: ' + NAMES[e.type], text: FOES[e.type], foe: true, ms: 5000 });
      break;
    }
  }
}
