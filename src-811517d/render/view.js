// Three.js view of a world: Synty terrain built from the tile map, characters, effects, camera.
import * as THREE from 'three';
import { assets, makeCharacter, attachPiece, attachInModelSpace, playAnim, strike } from './assets.js';
import { Particles, glowTexture } from './particles.js';
import { T } from '../game/constants.js';
import { swingBox } from '../game/world.js';
import { THEMES, themeFor, pickWeighted } from './themes.js';
import { Post } from './post.js';
import { assetUrl } from '../assetUrl.js';

const Z_FRONT = 0.7;     // front plane of the terrain (player walks at z = 0)
const BLOCK_DEPTH = 3;   // terrain depth into the screen
const Z_BACK = -2.4;     // background wall plane
const CHUNK = 24;        // terrain is split into horizontal chunks so off-screen parts are culled

const BIOME = {
  halls: { fog: 0x0e0b10, hemiSky: 0x9a8aa8, hemiGround: 0x2a1c14, key: 0xffd9b0, torch: 0xff9a4a, bg: 0x6a6070 },
  forge: { fog: 0x170a06, hemiSky: 0xb08070, hemiGround: 0x3a1408, key: 0xffc49a, torch: 0xff7a2a, bg: 0x7a5048 },
  crypt: { fog: 0x081012, hemiSky: 0x7a9aa8, hemiGround: 0x18222a, key: 0xd8ecff, torch: 0x6ad8c0, bg: 0x405058 },
  hell: { fog: 0x120809, hemiSky: 0x9a7a80, hemiGround: 0x3a1a14, key: 0xffe0d0, torch: 0xff6a3a, bg: 0x603838 },
};

const ENEMY_LOOK = {
  skeleton: { char: 'skeleton', weapon: 'sword_small', scale: 1 },
  skeleton_thrower: { char: 'skeleton2', weapon: null, scale: 1 },
  dwarf_undead: { char: 'dwarf_undead', weapon: 'axe', scale: 1.05 },
  undead_knight: { char: 'undead_knight', weapon: 'sword_large', scale: 1.12 },
  demon: { char: 'demon', weapon: null, scale: 1.55, wings: true },
  // newer types are scaled to their gameplay height (fit) so models match hitboxes
  goblin: { char: 'goblin', weapon: 'sword_small', fit: 1.1 },
  goblin_shaman: { char: 'goblin_shaman', weapon: null, fit: 1.12, rim: [0.7, 0.45, 1.0] },
  rock_golem: { char: 'rock_golem', weapon: null, fit: 1.05 },
  ghost: { char: 'ghost', weapon: null, fit: 1.05, rim: [0.55, 0.9, 1.0], ghost: true },
  dwarf_bomber: { char: 'dwarf_miner', weapon: null, fit: 1.08 },
  dummy: { char: 'skeleton3', weapon: null, fit: 1.0, rim: [0.8, 0.8, 0.75] },
  // biome bosses
  dwarf_king: { char: 'dwarf_king', weapon: 'hammer', fit: 1.02 },
  forge_golem: { char: 'rock_golem', weapon: null, fit: 1.0, lava: true },
  bone_lord: { char: 'undead_knight', weapon: 'sword_large', fit: 1.0, crown: true, rim: [0.6, 0.95, 1.0] },
};
// Animation used for each logical enemy anim (name, speed)
const PROJ_COLOR = { fireball: 0xff5a2a, wave: 0x9ad8ff, firebolt: 0xffb040, orb: 0xb46aff, bolt: 0x6ae8ff, windblade: 0xe0f4ff,
  arrow: 0xd8f0ff, crescent: 0xb48aff, hook: 0xc8c0b0, flamewave: 0xff7a2a, spirit: 0x9ae8ff, ember: 0xff8a3a, darkslash: 0x6a3aaa,
  flask: 0xff7a2a, shard: 0xbfe8ff, xbolt: 0xf0e0c0 };
const ENEMY_ANIM = {
  idle: ['idle_menace', 1], walk: ['walk', 1.1], run: ['run', 1], windup: ['heavy1', 0.45], attack: ['attack1', 1.9],
  attack2: ['attack2', 1.9], throw: ['attack3', 2], hurt: ['hurt', 1.6], death: ['death', 1.1], block: ['block', 1],
  fly: ['idle_menace', 1.2], slam: ['heavy3', 1.8], cast: ['stab', 1.6],
};

// Sword grip on the POLYGON rig's Hand_R (tuned by eye)
const GRIP = { pos: [0.0, 0.09, 0.02], rot: [0, 0, -Math.PI / 2], scale: 1 };

export class View {
  constructor(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, innerWidth * innerHeight > 900000 ? 1.25 : 1.6);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(dpr);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.dpr = dpr;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 1, 120);
    this.camPos = new THREE.Vector3();
    this.particles = new Particles(900);
    this.scene.add(this.particles.points);
    this.glowTex = glowTexture();
    this.charMat = new THREE.MeshLambertMaterial({ map: assets.material.map });
    this.shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.shadowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: 0x000000, transparent: true, opacity: 0.6, depthWrite: false, fog: false });
    this.beamTex = new THREE.TextureLoader().load(assetUrl('assets/tex/sunbeam.png'));
    rimify(this.charMat);
    this.levelGroup = null;
    this.debug = false;
    this.frameTimes = [];
    this.post = new Post(this.renderer, this.scene, this.camera);
    this.resize();
    addEventListener('resize', () => this.resize());
    addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  // Size the drawing buffer from the canvas's real on-screen box. iPhones (home-screen mode, rotation) can
  // report innerWidth/innerHeight that differ from the CSS size, which squashes or stretches the picture.
  canvasSize() {
    const c = this.renderer.domElement;
    const w = Math.round(c.clientWidth) || innerWidth, h = Math.round(c.clientHeight) || innerHeight;
    return [Math.max(1, w), Math.max(1, h)];
  }

  // Cheap per-frame check: resize events on iOS often fire before the new size is known, or not at all.
  checkSize() {
    const [w, h] = this.canvasSize();
    if (w !== this._w || h !== this._h) this.resize();
  }

  resize() {
    const [w, h] = this.canvasSize();
    this._w = w; this._h = h;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    // show ~9.5 tiles tall (and at least 15 wide) so characters read well on a phone
    const t = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    this.camDist = Math.max(8.6 / (2 * t), 14 / (2 * t * this.camera.aspect));
    this.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- level
  buildWorld(world) {
    if (this.levelGroup) this.disposeLevel();
    this.world = world;
    const g = (this.levelGroup = new THREE.Group());
    this.scene.add(g);
    const look = BIOME[world.level.biome] || BIOME.halls;
    this.look = look;
    this.scene.background = new THREE.Color(look.fog);
    this.scene.fog = new THREE.Fog(look.fog, 22, 44);
    this.post.setBiome(world.level.biome);

    const hemi = new THREE.HemisphereLight(look.hemiSky, look.hemiGround, 1.5);
    const key = new THREE.DirectionalLight(look.key, 1.25);
    key.position.set(-6, 10, 14);
    const fill = new THREE.DirectionalLight(0x8a9cd0, 0.22);
    fill.position.set(8, 3, 10);
    g.add(hemi, key, key.target, fill);
    this.hemi = hemi; this.hemiTarget = new THREE.Color(look.hemiSky);
    this.key = key;

    this.torchLights = [];
    for (let i = 0; i < 4; i++) {
      const l = new THREE.PointLight(look.torch, 0, 11, 1.4);
      g.add(l); this.torchLights.push(l);
    }
    this.playerLight = new THREE.PointLight(0xffe2c0, 7, 8, 1.5);
    g.add(this.playerLight);

    // All scenery lives in envGroup, pushed back behind the play layer (z = 0), so terrain, props and walls can never
    // draw over the hero, enemies or projectiles. Characters/FX stay in the level group at z >= 0.
    const env = (this.envGroup = new THREE.Group());
    env.position.z = -1.1;
    g.add(env);
    const playLayer = g;
    this.levelGroup = env; // placePiece() defaults to levelGroup, so env builders place into env
    this.buildTerrain(world.level, env);
    // give every room a theme
    const trand = mulberry(world.seed * 13 + world.depth);
    let lastCombat = null;
    this.roomTheme = new Map((world.level.rooms || []).map((r) => {
      let name = themeFor(r, world.level.biome, trand);
      // no two combat rooms in a row share a theme
      for (let k = 0; k < 6 && r.type === 'combat' && !r.connector && name === lastCombat; k++) name = themeFor(r, world.level.biome, trand);
      if (r.type === 'combat' && !r.connector) lastCombat = name;
      return [r, THEMES[name]];
    }));
    this.onRoomChange = (r) => { const th = r && this.roomTheme.get(r); if (th) this.hemiTarget.setHex(th.hemi); };
    this.lightSources = [];
    this.deepFloor = this.findDeepFloors(world.level);
    this.buildBackground(world.level, env);
    this.buildDepth(world, env);
    this.buildProps(world, env);
    this.buildRoomDecor(world, env);
    this.levelGroup = playLayer;

    this.player = this.makePlayerView();
    g.add(this.player.ch.root);
    this.enemyViews = new Map();
    for (const e of world.enemies) this.addEnemy(e);

    this.coinMesh = new THREE.InstancedMesh(assets.pieces.gold_coins, assets.material, 300);
    const cs = fitScale('gold_coins', 0.35, null, null);
    this.coinScale = cs;
    this.coinMesh.count = 0;
    this.coinMesh.frustumCulled = false;
    g.add(this.coinMesh);

    this.projViews = new Map();
    this.fx = new CombatFx(g, this.glowTex);
    this.bossFx = null; this.finaleT = 0; this.finaleBoss = null; this.beams = [];
    this.merchantView = null; this.dropViews = null; this.orbSprites = null; this.altarsPlaced = null;
    this.room = null; this.camTarget = null; this.groundY = undefined; this.roomSwitchT = 0; this.camVel = null; this.velAhead = 0;
    this.camPos.set(world.player.x, world.player.y + 2, this.camDist);
    this.debugGroup = new THREE.Group(); g.add(this.debugGroup);
  }

  disposeLevel() {
    this.scene.remove(this.levelGroup);
    this.levelGroup.traverse((o) => { if (o.isInstancedMesh) o.dispose(); if (o.geometry && o.userData.ownGeo) o.geometry.dispose(); });
    this.particles.clear();
  }

  buildTerrain(level, g) {
    const { w, h, tiles } = level;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? T.SOLID : tiles[y * w + x]);
    const solid = (x, y) => at(x, y) === T.SOLID;
    const exposed = (x, y) => {
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!solid(x + dx, y + dy)) return true;
      return false;
    };
    const chunks = new Map(); // key -> {piece -> [matrices]}
    const push = (cx, piece, m, k = 1) => {
      if (!chunks.has(cx)) chunks.set(cx, {});
      const c = chunks.get(cx); (c[piece] ||= []).push({ m: m.clone(), k });
    };
    const m = new THREE.Matrix4();
    const blockS = fitScale('block', 1.0, 1.0, BLOCK_DEPTH);
    const capS = fitScale('floor', 1.0, 0.18, BLOCK_DEPTH * 0.9);
    const plankS = fitScale('plank', 1.08, 0.28, 1.6);
    const spikeS = fitScale('spikes', 1.0, 0.9, 1.6);
    const lavaS = fitScale('lava', 1.0, null, BLOCK_DEPTH);
    const interior = [];
    const rand = mulberry(level.w * 131 + level.h);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const t = tiles[y * w + x];
        const cx = Math.floor(x / CHUNK);
        if (t === T.SOLID) {
          if (exposed(x, y)) {
            // block, randomly flipped so the stone pattern doesn't repeat
            const flip = false;
            m.makeScale(blockS.x * (flip ? -1 : 1), blockS.y, blockS.z);
            m.setPosition(x + (flip ? 1 : 0) - blockS.ox * (flip ? -1 : 1), y - blockS.oy, Z_FRONT - BLOCK_DEPTH - blockS.oz);
            // value hierarchy: walkable tops brightest, walls mid, ceilings darkest
            const top = !solid(x, y + 1), under = !solid(x, y - 1);
            push(cx, 'block', m, top ? 0.85 : under ? 0.42 : 0.55 + rand() * 0.06);
            if (!solid(x, y + 1) && at(x, y + 1) !== T.LAVA) {
              m.makeScale(capS.x, capS.y, capS.z);
              m.setPosition(x - capS.ox, y + 1 - capS.oy - 0.06, Z_FRONT - BLOCK_DEPTH * 0.9 - capS.oz + 0.05);
              push(cx, 'floor', m, 1.3);
            }
          } else interior.push(x, y);
        } else if (t === T.PLATFORM) {
          m.makeScale(plankS.x, plankS.y, plankS.z);
          m.setPosition(x - 0.04 - plankS.ox, y + 1 - 0.28 - plankS.oy, -0.8 - plankS.oz);
          push(cx, 'plank', m, 1.15);
        } else if (t === T.SPIKES) {
          m.makeScale(spikeS.x, spikeS.y, spikeS.z);
          m.setPosition(x - spikeS.ox, y - spikeS.oy, -0.8 - spikeS.oz);
          push(cx, 'spikes', m);
        } else if (t === T.LAVA) {
          m.makeScale(lavaS.x, 1, lavaS.z);
          m.setPosition(x - lavaS.ox, y + 0.7 - lavaS.oy, Z_FRONT - BLOCK_DEPTH - lavaS.oz);
          push(cx, 'lava', m);
        }
      }
    }
    for (const [, c] of chunks) {
      for (const [piece, mats] of Object.entries(c)) {
        const im = new THREE.InstancedMesh(assets.pieces[piece], assets.material, mats.length);
        const col = new THREE.Color();
        mats.forEach((mm, i) => { im.setMatrixAt(i, mm.m); im.setColorAt(i, col.setRGB(mm.k, mm.k * 0.97, mm.k * 0.94)); });
        im.instanceMatrix.needsUpdate = true;
        im.computeBoundingSphere();
        g.add(im);
      }
    }
    this.buildRockFill(level, isInteriorFn(level, exposed), g);
    // interior rock backstop: one merged mesh of dark front quads (behind the masonry), row runs merged
    const pos = [];
    const isInterior = new Uint8Array(w * h);
    for (let i = 0; i < interior.length; i += 2) isInterior[interior[i + 1] * w + interior[i]] = 1;
    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (!isInterior[y * w + x]) { x++; continue; }
        const x0 = x; while (x < w && isInterior[y * w + x]) x++;
        const z = Z_FRONT - 0.02;
        pos.push(x0, y, z, x, y, z, x, y + 1, z, x0, y, z, x, y + 1, z, x0, y + 1, z);
      }
    }
    // pad the outside of the map so the camera never sees the void
    const pad = 30, z = Z_FRONT - 0.02;
    pos.push(-pad, -pad, z, 0, -pad, z, 0, h + pad, z, -pad, -pad, z, 0, h + pad, z, -pad, h + pad, z);
    pos.push(w, -pad, z, w + pad, -pad, z, w + pad, h + pad, z, w, -pad, z, w + pad, h + pad, z, w, h + pad, z);
    pos.push(0, -pad, z, w, -pad, z, w, 0, z, 0, -pad, z, w, 0, z, 0, 0, z);
    pos.push(0, h, z, w, h, z, w, h + pad, z, 0, h, z, w, h + pad, z, 0, h + pad, z);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const rock = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x0c0909, fog: false }));
    rock.position.z = -0.6;
    rock.userData.ownGeo = true;
    g.add(rock);
  }

  // Solid rock is drawn as dark dwarven masonry (Synty wall blocks): 3x3 blocks where possible, 1x1 at the edges,
  // tinted darker the deeper they sit from open air so the rock reads as depth instead of a flat black void.
  buildRockFill(level, isInterior, g) {
    const { w, h } = level;
    const dist = new Float32Array(w * h).fill(99);
    const q = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!isInterior(x, y)) { dist[y * w + x] = 0; q.push(x, y); }
    for (let i = 0; i < q.length; i += 2) { // BFS distance from the nearest non-interior tile
      const x = q[i], y = q[i + 1], d = dist[y * w + x] + 1;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || dist[ny * w + nx] <= d) continue;
        dist[ny * w + nx] = d; q.push(nx, ny);
      }
    }
    const shade = (d) => { const k = Math.min(1, (d - 1) / 5); return 0.24 * (1 - k) * (1 - k) + 0.03; };
    const big = [], small = [];
    const taken = new Uint8Array(w * h);
    for (let y = 0; y + 2 < h; y += 3) for (let x = 0; x + 2 < w; x += 3) {
      let ok = true;
      for (let yy = y; yy < y + 3 && ok; yy++) for (let xx = x; xx < x + 3; xx++) if (!isInterior(xx, yy)) { ok = false; break; }
      if (!ok) continue;
      for (let yy = y; yy < y + 3; yy++) for (let xx = x; xx < x + 3; xx++) taken[yy * w + xx] = 1;
      big.push(x, y, shade(dist[(y + 1) * w + x + 1]));
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (isInterior(x, y) && !taken[y * w + x]) small.push(x, y, shade(dist[y * w + x]));
    const mk = (list, size) => {
      const n = list.length / 3; if (!n) return;
      const s = fitScale('block', size, size, 0.6);
      const im = new THREE.InstancedMesh(assets.pieces.block, this.rockMat ||= new THREE.MeshLambertMaterial({ map: assets.material.map }), n);
      const m = new THREE.Matrix4(), c = new THREE.Color();
      for (let i = 0; i < n; i++) {
        const x = list[i * 3], y = list[i * 3 + 1], k = list[i * 3 + 2];
        m.makeScale(s.x, s.y, s.z);
        m.setPosition(x - s.ox, y - s.oy, Z_FRONT - 0.6 - s.oz);
        im.setMatrixAt(i, m);
        im.setColorAt(i, c.setRGB(k * 1.05, k * 0.92, k * 0.86));
      }
      im.computeBoundingSphere();
      g.add(im);
    };
    mk(big, 3); mk(small, 1);
  }

  // The floor height each room's deep hall sits at (most common floor level; null for corridors / tiny rooms).
  findDeepFloors(level) {
    const { w, tiles } = level, at = (x, y) => tiles[y * w + x];
    const out = new Map();
    for (const r of level.rooms || []) {
      if (r.connector || r.w < 14) { out.set(r, null); continue; }
      const count = new Map();
      for (let y = r.y + 1; y < r.y + r.h - 3; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++)
        if (at(x, y) !== T.SOLID && at(x, y - 1) === T.SOLID) count.set(y, (count.get(y) || 0) + 1);
      let best = null, bc = 0;
      for (const [y, c] of count) if (c > bc || (c === bc && y < best)) { best = y; bc = c; }
      out.set(r, bc >= 6 ? best : null);
    }
    return out;
  }

  // A deep hall behind each room: receding floor, two rows of pillars, a far wall and distant braziers.
  // Seen through openings in the near back wall, it parallaxes as the camera moves and gives the scene real depth.
  buildDepth(world, g) {
    const L = world.level;
    const groups = {};
    const m = new THREE.Matrix4();
    const add = (id, x, y, z, sx, sy, sz, tint) => (groups[id] ||= []).push({ m: m.clone().makeScale(sx, sy, sz).setPosition(x, y, z), tint });
    const rnd = mulberry(world.seed * 31 + world.depth * 5 + 3);
    const ZFAR = -14;
    for (const r of L.rooms || []) {
      const fy = this.deepFloor.get(r);
      if (fy === null || fy === undefined) continue;
      const th = this.roomTheme.get(r);
      const tint = th ? th.tint.map((c) => c * 0.8) : [0.8, 0.8, 0.8];
      const top = r.y + r.h;
      const boss = r.type === 'boss';
      // receding floor (lava lake behind the boss arena)
      const fs = fitScale(boss ? 'lava' : 'floor', 5, null, 5);
      for (let x = r.x; x < r.x + r.w; x += 5) for (let z = Z_BACK; z > ZFAR; z -= 5) {
        add(boss ? 'lava' : 'floor', x - fs.ox, fy - (boss ? 0.6 : 0.05) - fs.oy, z - 5 - fs.oz, fs.x, boss ? 1 : fs.y, fs.z, tint);
      }
      // far wall
      const kinds = th ? th.panels : ['wall'];
      for (let x = r.x; x < r.x + r.w; x += 5) for (let y = fy; y < top + 4; y += 5) {
        const kind = kinds[Math.floor(rnd() * kinds.length)];
        const ws = fitScale(kind, 5, 5, null);
        add(kind, x - ws.ox, y - ws.oy, ZFAR - ws.oz, ws.x, ws.y, ws.x, tint.map((c) => c * 0.8));
      }
      // colonnades at two depths
      for (const [z, step] of [[-5.5, 6], [-9.5, 7]]) {
        for (let x = r.x + 2 + rnd() * 2; x < r.x + r.w - 1; x += step) {
          const ps = fitScale(boss ? 'hell_pillar' : 'pillar', null, top - fy + 1, null);
          add(boss ? 'hell_pillar' : 'pillar', x - ps.ox - 0.6, fy - ps.oy, z - ps.oz, ps.x, ps.y, ps.x, tint);
        }
      }
      // distant braziers give warm points of light in the depth
      for (let x = r.x + 4 + rnd() * 4; x < r.x + r.w - 3; x += 9 + rnd() * 6) {
        const z = -7.5 - rnd() * 3;
        const bid = boss || L.biome === 'hell' ? 'hell_brazier' : 'brazier';
        this.placePiece(bid, x, fy, z, { h: 1.6, mat: assets.bgMaterial });
        const glow = this.sprite(0xff9a4a, 3.2, 0.5); glow.position.set(x, fy + 1.8, z + 0.3); g.add(glow);
      }
      if (th?.centerpiece) { const [id, size] = th.centerpiece; this.placePiece(id, r.x + r.w / 2, fy - 1, ZFAR + 2, { ...size, mat: assets.bgMaterial }); }
    }
    for (const [piece, list] of Object.entries(groups)) {
      const mat = piece === 'lava' ? assets.material : assets.bgMaterial;
      const im = new THREE.InstancedMesh(assets.pieces[piece], mat, list.length);
      const c = new THREE.Color();
      list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, c.setRGB(...it.tint)); });
      im.computeBoundingSphere();
      g.add(im);
    }
  }

  buildBackground(level, g) {
    const { w, h, tiles } = level;
    const P = 3; // panel size in tiles
    const kinds = ['wall', 'wall', 'wall_b', 'wall', 'arch', 'window', 'alcove', 'wall_b'];
    const rand = mulberry(w * 7 + h * 3 + 11);
    const groups = {};
    const m = new THREE.Matrix4();
    const air = (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] !== T.SOLID;
    for (let cy = 0; cy * P < h; cy++) {
      for (let cx = 0; cx * P < w; cx++) {
        let any = false;
        for (let y = cy * P - 1; y < cy * P + P + 1 && !any; y++) for (let x = cx * P - 1; x < cx * P + P + 1; x++) if (air(x, y)) { any = true; break; }
        if (!any) continue;
        const room = this.roomAtTile(cx * P + 1.5, cy * P + 1.5);
        const theme = room ? this.roomTheme.get(room) : null;
        const band = room && this.deepFloor?.get(room);
        if (band !== undefined && band !== null && cy * P >= band - 1 && cy * P < band + 6 && rand() < 0.7) continue; // opening
        const pool = theme ? theme.panels : kinds;
        let kind = pool[Math.floor(rand() * pool.length)];
        // archways and windows only where there is floor below so they read as architecture
        if ((kind === 'arch' || kind === 'window') && air(cx * P + 1, cy * P - 1)) kind = 'wall';
        const s = fitScale(kind, P, P, null);
        m.makeScale(s.x, s.y, s.x);
        m.setPosition(cx * P - s.ox, cy * P - s.oy, Z_BACK - s.oz * s.x / s.x);
        (groups[kind] ||= []).push({ m: m.clone(), tint: theme ? theme.tint : [1, 1, 1] });
        // pillars between some panels
        if (rand() < 0.22 && air(cx * P, cy * P) && !theme?.noPillars) {
          const ps = fitScale('pillar', 0.9, P, 0.9);
          m.makeScale(ps.x, ps.y, ps.z);
          m.setPosition(cx * P - ps.ox - 0.45 + 0.45, cy * P - ps.oy, Z_BACK + 0.5 - ps.oz);
          (groups.pillar ||= []).push({ m: m.clone(), tint: theme ? theme.tint : [1, 1, 1] });
        }
      }
    }
    for (const [piece, mats] of Object.entries(groups)) {
      const im = new THREE.InstancedMesh(assets.pieces[piece], assets.bgMaterial, mats.length);
      const c = new THREE.Color();
      mats.forEach((mm, i) => { im.setMatrixAt(i, mm.m); im.setColorAt(i, c.setRGB(...mm.tint)); });
      im.computeBoundingSphere();
      g.add(im);
    }
  }

  // dark hanging chains close to the camera: cheap parallax depth (Hollow Knight style foreground)
  buildForeground(level, g) {
    const { w, h, tiles } = level;
    const mat = new THREE.MeshBasicMaterial({ color: 0x050304, fog: false });
    const rand = mulberry(w * 17 + 5);
    for (let x = 6; x < w - 6; x += 9 + Math.floor(rand() * 10)) {
      // find an air column under a ceiling
      for (let y = h - 2; y > 2; y--) {
        const here = tiles[y * w + x], above = tiles[(y + 1) * w + x];
        if (here !== T.SOLID && above === T.SOLID) {
          // only in corridors, so nothing ever hangs in front of the hero during a fight
          const r = this.roomAtTile(x + 0.5, y);
          if (!r || !r.connector) break;
          const len = 2 + rand() * 3;
          const c = this.placePiece('chain', x + 0.5, y + 1 - len, 3.2, { w: 0.35, h: len + 0.5, d: 0.35, mat });
          c.rotation.y = rand() * Math.PI;
          break;
        }
      }
    }
  }

  placePiece(id, x, y, z, { w = null, h = null, d = null, rotY = 0, mat = assets.material, group = this.levelGroup } = {}) {
    const s = fitScale(id, w, h, d);
    const mesh = new THREE.Mesh(assets.pieces[id], mat);
    const holder = new THREE.Group();
    mesh.scale.set(s.x, s.y, s.z);
    // centre horizontally, sit on y
    const bb = assets.pieces[id].boundingBox;
    mesh.position.set(-(bb.min.x + bb.max.x) / 2 * s.x, -bb.min.y * s.y, -(bb.min.z + bb.max.z) / 2 * s.z);
    holder.add(mesh);
    holder.position.set(x, y, z);
    holder.rotation.y = rotY;
    group.add(holder);
    return holder;
  }

  roomAtTile(x, y) {
    return (this.world.level.rooms || []).find((r) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) || null;
  }

  // Props behind the playfield that make each room read differently (no collision).
  buildRoomDecor(world, g) {
    const L = world.level, { w, tiles } = L;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= L.h ? 1 : tiles[y * w + x]);
    const rnd = mulberry(world.seed * 97 + world.depth * 7);
    const busy = [...world.torches.map((t) => t.x), ...world.shrines.map((s) => s.x), ...world.chests.map((c) => c.x), world.exit.x];
    for (const r of L.rooms || []) {
      const th = this.roomTheme.get(r);
      if (!th) continue;
      const used = [];
      const free = (x, gap) => !used.some((u) => Math.abs(u - x) < gap) && !busy.some((b) => Math.abs(b - x) < 1.6);
      // floor spots: air tile with solid floor under it and 3 tiles of air above
      const floors = [], ceils = [];
      for (let y = r.y + 1; y < r.y + r.h - 1; y++) for (let x = r.x + 1; x < r.x + r.w - 1; x++) {
        if (at(x, y) === 0 && at(x, y - 1) === 1 && at(x, y + 1) === 0 && at(x, y + 2) === 0) floors.push([x + 0.5, y]);
        if (at(x, y) === 0 && at(x, y + 1) === 1 && at(x, y - 1) === 0 && at(x, y - 2) === 0 && at(x, y - 3) === 0) ceils.push([x + 0.5, y + 1]);
      }
      if (th.centerpiece) {
        const [id, size] = th.centerpiece;
        const cx = r.x + r.w / 2, base = floors.filter((f) => Math.abs(f[0] - cx) < 3).sort((a, b) => a[1] - b[1])[0];
        void base; // centerpiece now lives in the deep hall (buildDepth)
      }
      this.dressShape(r, th, floors, ceils, used, rnd);
      const nFloor = Math.round(floors.length * 0.06 * th.density); // light random scatter on top of the composed dressing
      for (let i = 0; i < nFloor && floors.length; i++) {
        const [fx, fy] = floors[Math.floor(rnd() * floors.length)];
        if (!free(fx, 2.6)) continue;
        if (th.sidesOnly && fx > r.x + 5 && fx < r.x + r.w - 5) continue; // keep the fighting floor clear
        used.push(fx);
        const [id, size] = pickWeighted(th.floor, rnd);
        const z = -1.25 - rnd() * 0.6;
        const holder = this.placePiece(id, fx, fy, z, { ...size });
        holder.rotation.y = (rnd() - 0.5) * 0.6;
        const glow = th.glow?.[id];
        if (glow) this.addGlow(fx, fy + 1, z + 0.6, glow, 2.6);
      }
      const nCeil = th.ceiling.length ? Math.min(3, Math.round(ceils.length * 0.06)) : 0;
      const usedC = [];
      for (let i = 0; i < nCeil && ceils.length; i++) {
        const [cx, cy] = ceils[Math.floor(rnd() * ceils.length)];
        if (usedC.some((u) => Math.abs(u - cx) < 5)) continue;
        usedC.push(cx);
        const [id, size] = pickWeighted(th.ceiling, rnd);
        const holder = this.placePiece(id, cx, cy, -1.0, { ...size });
        // hang it from the ceiling: move down by its height
        const bb = new THREE.Box3().setFromObject(holder);
        holder.position.y -= bb.max.y - cy;
        if (id === 'chandelier') this.addGlow(cx, holder.position.y + 0.3, -0.6, 0xffc070, 3);
      }
      // god rays from the top of the room (Synty sun-beam texture), with dust motes drifting in them
      if (th.shafts && r.h >= 8) {
        for (let i = 0; i < 2; i++) {
          const bx = r.x + 3 + rnd() * (r.w - 6), len = r.h + 2;
          const beam = new THREE.Mesh(new THREE.PlaneGeometry(2.6, len), new THREE.MeshBasicMaterial({ map: this.beamTex, color: th.shafts,
            transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
          beam.position.set(bx, r.y + r.h - len / 2, -1.7);
          beam.rotation.z = -0.32;
          g.add(beam);
          (this.beams ||= []).push({ beam, base: 0.14, phase: rnd() * 6, x: bx, y0: r.y + 1, y1: r.y + r.h - 1, color: th.shafts });
        }
      }
      // torches in this room take the theme's flame colour
      for (const t of this.torches) if (t.x >= r.x && t.x < r.x + r.w && t.y >= r.y && t.y < r.y + r.h && th.torch) {
        t.color = th.torch; t.glow.material.color.setHex(th.torch);
      }
    }
  }

  // Composed dressing by room shape: rhythm and symmetry read as designed, random scatter reads as clutter.
  dressShape(r, th, floors, ceils, used, rnd) {
    const band = this.deepFloor?.get(r) ?? null;
    const floorAt = (x) => floors.filter((f) => Math.abs(f[0] - x) < 0.6).sort((a, b) => (band === null ? a[1] - b[1] : Math.abs(a[1] - band) - Math.abs(b[1] - band)))[0];
    const cx = r.x + r.w / 2, shape = r.shape || (r.connector ? 'corridor' : r.w >= 24 ? 'arena' : 'pair');
    const pairAt = (dx, id, size, z = -1.5) => {
      for (const s of [-1, 1]) {
        const f = floorAt(Math.round(cx + s * dx) + 0.5); if (!f) continue;
        const h = this.placePiece(id, f[0], f[1], z, { ...size }); h.rotation.y = -s * 0.25; used.push(f[0]);
        const glow = th.glow?.[id]; if (glow) this.addGlow(f[0], f[1] + 1.4, z + 0.6, glow, 2.6);
      }
    };
    const fp = th.floor.find(([id]) => ['brazier', 'hell_brazier', 'statue', 'statue_m', 'obelisk_glow'].includes(id)) || th.floor[0];
    if (shape === 'colonnade') {
      for (let x = r.x + 3; x < r.x + r.w - 2; x += 4) {
        const f = floorAt(x + 0.5); if (!f) continue;
        this.placePiece(th.panels.includes('hell') ? 'hell_pillar' : 'pillar', f[0], f[1], -1.9, { h: Math.min(6, r.y + r.h - f[1]), mat: assets.bgMaterial }); used.push(f[0]);
      }
    } else if (shape === 'arena' || shape === 'balcony' || shape === 'stairs') {
      pairAt(Math.min(r.w / 2 - 3, 7), fp[0], fp[1]);
      pairAt(Math.min(r.w / 2 - 2, 10), 'banner', { h: 2.6 }, -2.1);
    } else if (shape === 'canopy') {
      for (const c of ceils.filter((_, i) => i % 5 === 0).slice(0, 4)) this.placePiece('chain', c[0], c[1] - 3, -1.2, { w: 0.35, h: 3, d: 0.35 });
      pairAt(Math.min(r.w / 2 - 3, 6), fp[0], fp[1]);
    } else if (shape === 'pit') {
      const low = floors.reduce((m, f) => Math.min(m, f[1]), Infinity);
      if (Number.isFinite(low)) this.addGlow(cx, low + 0.6, -1.2, th.torch || 0xff7a3a, 5);
      for (const c of ceils.filter((_, i) => i % 6 === 0).slice(0, 3)) this.placePiece('chain', c[0], c[1] - 4, -1.0, { w: 0.35, h: 4, d: 0.35 });
    } else if (shape === 'corridor') {
      for (let x = r.x + 2; x < r.x + r.w - 1; x += 5) {
        const f = floorAt(x + 0.5); if (!f) continue;
        this.placePiece('lantern', f[0], f[1] + 2.2, -1.6, { h: 0.6 });
        this.addGlow(f[0], f[1] + 2.5, -1.2, th.torch || 0xffb060, 1.8);
      }
    } else {
      pairAt(Math.min(r.w / 2 - 3, 6), fp[0], fp[1]);
    }
  }

  addGlow(x, y, z, color, size) {
    const s = this.sprite(color, size, 0.55);
    s.position.set(x, y, z);
    this.levelGroup.add(s);
    this.lightSources.push({ x, y, z: z + 1.2, color, glow: s, phase: Math.random() * 10 });
  }

  buildProps(world, g) {
    // torches on the back wall + flame glow
    this.torches = world.torches.map((t) => {
      const holder = this.placePiece('torch', t.x, t.y - 0.4, Z_BACK + 0.25, { h: 0.9 });
      const glow = this.sprite(0xffa050, 1.6, 0.9);
      glow.position.set(t.x, t.y + 0.35, Z_BACK + 0.8);
      g.add(glow);
      return { ...t, holder, glow, phase: Math.random() * 10 };
    });
    // shrines
    this.shrines = world.shrines.map((s) => {
      const holder = this.placePiece('shrine', s.x, s.y, -1.6, { h: 3.4 });
      const glow = this.sprite(0x7ad8ff, 3.2, 0.8);
      glow.position.set(s.x, s.y + 1.6, -0.6);
      g.add(glow);
      const light = { intensity: 0 }; // glow sprite only (keeps the light count low for phones)
      return { s, holder, glow, light };
    });
    this.chests = world.chests.map((c) => {
      const holder = this.placePiece('chest', c.x, c.y, -0.3, { w: 1.7 });
      const lid = this.placePiece('chest_lid', 0, 0, 0, { w: 1.7, group: holder });
      const bb = holder.children[0].geometry.boundingBox;
      lid.position.set(0, (bb.max.y - bb.min.y) * holder.children[0].scale.y * 0.62, -0.3);
      return { c, holder, lid };
    });
    this.saws = world.saws.map((s) => {
      const holder = new THREE.Group();
      const sc = fitScale('saw', null, s.r * 2.2, s.r * 2.2);
      const mesh = new THREE.Mesh(assets.pieces.saw, assets.material);
      const bb = assets.pieces.saw.boundingBox;
      mesh.scale.setScalar(sc.y);
      mesh.position.set(-(bb.min.x + bb.max.x) / 2 * sc.y, -(bb.min.y + bb.max.y) / 2 * sc.y, -(bb.min.z + bb.max.z) / 2 * sc.y);
      const spin = new THREE.Group(); spin.add(mesh); mesh.rotation.y = 0;
      spin.rotation.y = Math.PI / 2;
      const roll = new THREE.Group(); roll.add(spin);
      holder.add(roll);
      g.add(holder);
      // rail showing the path
      const len = Math.hypot(s.x1 - s.x0, s.y1 - s.y0);
      if (len > 0.5) {
        const rail = this.placePiece('beam', (s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2 - 0.1, -0.7, { w: len + 1, h: 0.2, d: 0.3 });
        rail.rotation.z = Math.atan2(s.y1 - s.y0, s.x1 - s.x0);
      }
      return { s, holder, roll };
    });
    const DECOR = {
      pillar: ['pillar', { h: 4.5, w: 1 }, -1.2], barrel: ['barrel', { h: 1.0 }, -0.2], crate: ['crate', { h: 0.95 }, -0.2],
      bones: ['bones', { w: 1.2 }, -0.5], banner: ['banner', { h: 2.6 }, Z_BACK + 0.4], statue: ['statue', { h: 3.2 }, -1.4],
    };
    this.breakables = world.breakables.map((b) => {
      const [id, size, z] = DECOR[b.name];
      return { b, holder: this.placePiece(id, b.x, b.y, z, size) };
    });
    for (const d of world.decor) {
      const spec = DECOR[d.name];
      if (!spec) continue;
      const [id, size, z] = spec;
      this.placePiece(id, d.x, d.y, z, { ...size, mat: z < -1 ? assets.bgMaterial : assets.material });
    }
    // the descent lift: a chained hanging platform set into the floor, glowing once it's open
    const L = world.lift;
    this.liftView = this.placePiece('lift', L.x, L.y - 0.35, 0.2, { w: L.w + 0.6 });
    this.liftView.scale.y = 1; this.liftBaseY = L.y - 0.35;
    this.exitGlow = this.sprite(0xffc070, 4.5, 0.0);
    this.exitGlow.position.set(L.x, L.y + 1.2, -0.2);
    g.add(this.exitGlow);
    this.liftSeal = this.sprite(0xff3a2a, 2.6, 0); this.liftSeal.position.set(L.x, L.y + 1.2, 0); g.add(this.liftSeal);
    // lanterns along the critical path so the way forward reads at a glance
    for (const pt of world.pathlights || []) {
      this.placePiece('lantern', pt.x, pt.y - 0.3, -0.7, { h: 0.7 });
      const glow = this.sprite(0xffc070, 1.6, 0.55); glow.position.set(pt.x, pt.y + 0.05, -0.4); g.add(glow);
      this.lightSources.push({ x: pt.x, y: pt.y, z: 0.6, color: 0xffc070, glow, phase: Math.random() * 6 });
    }
    this.exitLight = new THREE.PointLight(0xffb060, 0, 8, 1.4);
    this.exitLight.position.set(L.x, L.y + 2, 0.8);
    g.add(this.exitLight);
  }

  // A camera-facing sprite showing an emoji (blessing icons on relics).
  emojiSprite(ch, size) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'); g.font = '96px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 72);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false }));
    s.scale.setScalar(size); return s;
  }

  sprite(color, size, opacity) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color, transparent: true, opacity,
      blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    s.scale.setScalar(size);
    return s;
  }

  // ---------------------------------------------------------------- characters
  makePlayerView() {
    const ch = makeCharacter('hero');
    const mat = rimify(this.charMat.clone(), [1.0, 0.8, 0.55]);
    ch.root.traverse((o) => { if (o.isMesh) o.material = mat; });
    ch.mat = mat;
    ch.sword = attachPiece(ch, 'Hand_R', 'sword', GRIP);
    playAnim(ch, 'idle');
    const trail = new SwordTrail(this.glowTex);
    this.levelGroup?.add(trail.mesh);
    return { ch, trail, lastAnim: null };
  }

  addEnemy(e) {
    let v;
    if (e.type === 'wisp') {
      const root = new THREE.Group();
      const skull = this.placePiece('wisp_skull', 0, 0, 0, { h: 0.65, group: root });
      skull.position.y = -0.1;
      const glow = this.sprite(0x8affc8, 2.2, 0.8);
      glow.position.y = 0.3;
      root.add(glow);
      const mat = this.charMat.clone();
      skull.traverse((o) => { if (o.isMesh) o.material = mat; });
      v = { root, mat, wisp: true, glow };
    } else if (e.type === 'crystal_turret') {
      const root = new THREE.Group();
      const body = this.placePiece('crystals', 0, 0, 0, { h: e.h * 1.15, group: root });
      const mat = rimify(this.charMat.clone(), [0.5, 0.9, 1.0]);
      mat.emissive.setRGB(0.05, 0.25, 0.35);
      body.traverse((o) => { if (o.isMesh) o.material = mat; });
      const glow = this.sprite(0x5ae0ff, 2.4, 0.5);
      glow.position.y = e.h * 0.6;
      root.add(glow);
      v = { root, mat, turret: true, glow };
    } else {
      const look = ENEMY_LOOK[e.type] || ENEMY_LOOK.skeleton;
      const ch = makeCharacter(look.char);
      const mat = rimify(this.charMat.clone(), look.rim || [1.0, 0.42, 0.32]);
      mat.map = assets.chars[look.char].map; // Dungeon Pack characters use their own atlas
      if (look.ghost) { mat.transparent = true; mat.depthWrite = false; }
      ch.root.traverse((o) => { if (o.isMesh) o.material = mat; });
      if (look.weapon) attachPiece(ch, 'Hand_R', look.weapon, GRIP);
      if (look.wings) {
        ch.wingL = attachInModelSpace(ch, 'Spine_03', 'wings_l', { pos: [0.12, 1.5, -0.22], scale: 1.35 });
        ch.wingR = attachInModelSpace(ch, 'Spine_03', 'wings_r', { pos: [-0.12, 1.5, -0.22], scale: 1.35 });
        for (const w of [ch.wingL, ch.wingR]) if (w) w.material = mat;
      }
      let scale = look.scale || 1;
      if (look.fit) { // fit model height to the gameplay body
        ch.root.updateMatrixWorld(true);
        const hgt = new THREE.Box3().setFromObject(ch.root).getSize(new THREE.Vector3()).y || 1.8;
        scale = (e.h * look.fit) / hgt;
      }
      ch.root.scale.setScalar(scale);
      if (look.crown) { const c = attachInModelSpace(ch, 'Head', 'crown', { pos: [0, 0, 0] }); if (c) c.material = mat; }
      if (look.lava) mat.emissive.setRGB(0.35, 0.1, 0.02);
      playAnim(ch, 'idle_menace');
      // stagger idle cycles
      ch.mixer.update(Math.random() * 2);
      v = { root: ch.root, ch, mat, look, scale };
    }
    this.levelGroup.add(v.root);
    this.enemyViews.set(e, v);
  }

  // ---------------------------------------------------------------- per frame
  render(world, dt, alpha = 1) {
    this.checkSize();
    this.trackFps(dt);
    const p = world.player;
    this.handleEvents(world);
    // charging a heavy attack: embers gather around the hero, brighter at full charge
    if (p.state === 'charge' && Math.random() < 0.6) {
      const full = p.chargeFull, a = Math.random() * Math.PI * 2, rr = full ? 0.9 : 1.4 - p.charge * 0.6;
      this.particles.emit(p.x + Math.cos(a) * rr, p.y + 1 + Math.sin(a) * rr, 0.1, 1, full ? 0xfff0c0 : 0xffa040, { speed: 1, life: 0.3, size: full ? 0.3 : 0.22 });
    }

    // player
    const pv = this.player, ch = pv.ch;
    ch.root.position.set(p.x, p.y - (world.liftDrop || 0), 0);
    const targetRot = p.facing * (Math.PI / 2 - 0.3);
    ch.root.rotation.y += (targetRot - ch.root.rotation.y) * Math.min(1, dt * 40);
    if (p.anim !== pv.lastAnim || p.animRestart) {
      playAnim(ch, p.anim, { restart: p.animRestart, fade: fadeFor(p), speed: p.animSpeed, from: startFor(p.anim, p.animSpeed) });
      pv.lastAnim = p.anim;
    } else if (ch.actions[p.anim]) ch.actions[p.anim].timeScale = p.animSpeed;
    ch.mixer.update(world.hitStop > 0 ? dt * 0.05 : dt);
    // lean into dashes and runs; squash on landing
    const lean = p.state === 'dash' ? 0.35 : p.anim === 'sprint' ? 0.12 : 0;
    pv.lean = (pv.lean || 0) + (lean - (pv.lean || 0)) * Math.min(1, dt * 14);
    ch.root.rotation.z = -pv.lean * p.facing;
    const sq = p.landTimer > 0 ? p.landTimer / 0.12 : 0;
    ch.root.scale.set(1 + sq * 0.12, 1 - sq * 0.15, 1 + sq * 0.12);
    ch.root.visible = !(p.invuln > 0 && p.state !== 'dash' && !p.dead && Math.floor(world.time * 20) % 2 === 0);
    const dg = p.state === 'dash' ? 1 : 0; // faint violet tint while dashing (invulnerable)
    ch.mat.emissive.setRGB(0.06 * dg, 0.04 * dg, 0.14 * dg);
    if (p.state === 'flask') ch.mat.emissive.setRGB(0.15, 0.4, 0.3);
    // Ashen Cloak: the hero fades to a faint shimmer
    const cloaked = p.cloakT > 0;
    if (ch.mat.transparent !== cloaked) { ch.mat.transparent = cloaked; ch.mat.needsUpdate = true; }
    ch.mat.opacity = cloaked ? 0.22 + Math.sin(world.time * 12) * 0.05 : 1;
    // Bronze Buckler raised: a bronze disc in front of the hero
    pv.buckler ||= (() => { const s = this.sprite(0xd8a050, 1.5, 0); this.levelGroup.add(s); return s; })();
    pv.buckler.position.set(p.x + p.facing * 0.55, p.y + 1.05, 0.6);
    pv.buckler.material.opacity = p.state === 'block' ? 0.75 : 0;
    if (p.rageT > 0) { ch.mat.emissive.setRGB(0.35, 0.08, 0.02); if (Math.random() < 0.4) this.particles.emit(p.x, p.y + Math.random() * 1.6, 0.4, 1, 0xff6a2a, { speed: 0.5, up: 2, life: 0.4, size: 0.25 }); }
    pv.trail.update(ch.sword, (p.state === 'attack' && p.stateTime < 0.3 / p.stats.attackSpeed) || (p.state === 'heavy' && p.stateTime < 0.35), dt);
    if (p.state === 'dash') for (let i = 0; i < 3; i++) this.particles.emit(p.x - p.facing * 0.3, p.y + 0.2 + Math.random() * 1.5, 0, 1, 0xb8a8ff, { speed: 0.4, life: 0.22, size: 0.45, dir: -p.facing * 0.3 });
    this.fx.update(dt, this.camera);
    this.playerLight.position.set(p.x + p.facing * 0.5, p.y + 2.2, 2.5);
    this.placeShadow(pv, world, p.x, p.y, 1.1);
    if (pv.weaponId !== p.stats.weapon) { // swap the weapon model in the hero's hand
      const wp = this.weaponPiece(p.stats.weapon);
      if (ch.sword) ch.sword.parent.remove(ch.sword);
      if (ch.offhand) { ch.offhand.parent.remove(ch.offhand); ch.offhand = null; }
      ch.sword = attachPiece(ch, 'Hand_R', wp, GRIP);
      const off = (this.weaponList || []).find((w) => w.id === p.stats.weapon)?.offhand;
      if (off) ch.offhand = attachPiece(ch, 'Hand_L', off, { ...GRIP, rot: [0, 0, Math.PI / 2] });
      pv.weaponId = p.stats.weapon;
    }
    if (p.stats.ward || p.tonicWard || p.shield !== undefined) {
      pv.ward ||= (() => { const s = this.sprite(0x8ac8ff, 2.6, 0); this.levelGroup.add(s); return s; })();
      pv.ward.position.set(p.x, p.y + 0.95, 0.4);
      pv.ward.material.opacity = p.wardReady || p.tonicWard || p.shield ? 0.22 + Math.sin(world.time * 3) * 0.06 : 0;
    }

    // enemies
    for (const e of world.enemies) {
      if (!this.enemyViews.has(e)) this.addEnemy(e);
      const v = this.enemyViews.get(e);
      const far = Math.abs(e.x - this.camPos.x) > 22 || Math.abs(e.y - this.camPos.y) > 14;
      v.root.visible = !far;
      if (far && v.shadow) v.shadow.visible = false;
      if (far) continue;
      v.punch = Math.max(0, (v.punch || 0) - dt * 7);
      v.root.position.set(e.x + (v.shove || 0) * v.punch, e.y + (e.boss ? Math.sin(world.time * 3) * 0.15 : 0), e.flying && !e.boss ? 0.2 : 0);
      if (v.wisp) {
        v.root.rotation.y = e.facing * 0.6;
        v.root.position.y = e.y + e.h * 0.4;
        v.glow.material.opacity = 0.5 + e.telegraph * 0.5;
        v.glow.material.color.setHex(e.telegraph > 0 ? 0xff6a4a : 0x8affc8);
        v.root.visible = e.alive || Math.floor(world.time * 15) % 2 === 0;
        v.root.scale.setScalar(e.alive ? 1 : Math.max(0.01, 1 - (1.2 - (e.timer || 0))));
      } else if (v.turret) {
        v.root.position.z = -0.2;
        v.glow.material.opacity = 0.35 + e.telegraph * 0.65;
        v.glow.scale.setScalar(2.2 + e.telegraph * 1.6);
        v.root.visible = e.alive || Math.floor(world.time * 15) % 2 === 0;
        if (!e.alive) v.root.scale.setScalar(Math.max(0.01, (e.timer || 0) / 1.2));
      } else {
        const tr = e.facing * (Math.PI / 2 - 0.35);
        v.root.rotation.y += (tr - v.root.rotation.y) * Math.min(1, dt * 12);
        const [clip, spd] = ENEMY_ANIM[e.anim] || ENEMY_ANIM.idle;
        const speed = e.anim === 'windup' && e.windupTime ? spd * (0.5 / e.windupTime) : spd;
        if (v.lastAnim !== e.anim) { playAnim(v.ch, clip, { speed, restart: true, fade: 0.08, from: e.anim === 'windup' ? 0 : startFor(clip, speed) }); v.lastAnim = e.anim; }
        v.ch.mixer.update(world.hitStop > 0 ? dt * 0.05 : dt);
        const base = v.scale, pk = v.punch * v.punch;
        v.root.scale.set(base * (1 + pk * 0.16), base * (1 - pk * 0.12), base * (1 + pk * 0.16));
        if (v.ch.wingL) {
          const flap = Math.sin(world.time * (e.phase === 2 ? 14 : 9)) * 0.45;
          v.ch.wingL.rotation.y = flap; v.ch.wingR.rotation.y = -flap;
        }
      }
      if (e.boss) this.updateBossFx(e, world, dt, v);
      if (v.look?.ghost) { const a = e.alive ? (e.alpha ?? 1) : Math.max(0, e.timer || 0); v.mat.opacity = 0.15 + 0.8 * a; }
      if (e.type === 'rock_golem') this.updateSlamMarks(v, e, world);
      this.statusFx(e, v, world, dt);
      this.placeShadow(v, world, e.x, e.y, e.w * 1.4, e.alive ? 1 : Math.max(0, e.timer || 0));
      const f = e.hurtFlash || 0, tg = e.telegraph || 0;
      const xg = v.extraGlow || 0;
      const tgk = e.boss ? 0.35 : 0.9;
      const lv = v.look?.lava ? 0.3 + Math.sin(world.time * 3) * 0.06 : 0;
      if (!(e.boss && this.finaleT > 0)) v.mat.emissive.setRGB(f * 1.2 + tg * tgk + xg * 0.5 + lv, f * 1.2 + tg * tgk * 0.17 + xg * 0.18 + lv * 0.3, f * 1.2 + tg * 0.05);
      if (e.frozenT > 0 && e.alive) v.mat.emissive.setRGB(0.2 + f, 0.5 + f, 0.95);
    }
    for (const [e, v] of this.enemyViews) {
      if (!world.enemies.includes(e)) {
        this.levelGroup.remove(v.root); if (v.shadow) this.levelGroup.remove(v.shadow); if (v.badge) this.levelGroup.remove(v.badge);
        for (const m of v.marks || []) this.levelGroup.remove(m);
        this.enemyViews.delete(e);
      }
    }

    // projectiles
    const live = new Set(world.projectiles);
    for (const pr of world.projectiles) {
      let v = this.projViews.get(pr);
      if (!v) {
        if (pr.kind === 'bone') {
          v = this.placePiece('bones', 0, 0, 0, { w: 0.7 });
        } else if (pr.kind === 'bomb') {
          v = this.placePiece('barrel', 0, 0, 0, { h: 0.55 });
        } else if (pr.kind === 'blade') {
          v = new THREE.Group(); this.placePiece(pr.piece || 'sword', 0, -0.5, 0, { h: 1.1, group: v });
        } else {
          const color = PROJ_COLOR[pr.kind] || 0xffb040;
          v = this.sprite(color, pr.r * 4.5, 1);
        }
        this.projViews.set(pr, v);
        if (!v.parent) this.levelGroup.add(v);
      }
      v.position.set(pr.x, pr.y - (pr.kind === 'bone' ? 0.15 : 0), 0.3);
      if (pr.kind === 'bone' || pr.kind === 'blade') { v.rotation.z += dt * (pr.kind === 'blade' ? 22 : 14); if (pr.kind === 'blade' && Math.random() < 0.6) this.particles.emit(pr.x, pr.y, 0.3, 1, 0xfff0d0, { speed: 0.5, life: 0.25, size: 0.3 }); }
      else if (pr.kind === 'xbolt') { v.material.rotation = Math.atan2(pr.vy, pr.vx); v.scale.set(1.5, 0.28, 1); }
      else if (pr.kind === 'flask' || pr.kind === 'shard') { if (Math.random() < 0.7) this.particles.emit(pr.x, pr.y, 0.1, 1, pr.kind === 'flask' ? 0xff8a3a : 0xd8f4ff, { speed: 0.4, life: 0.3, size: 0.24 }); }
      else if (pr.kind === 'arrow') { // stretched streak aimed along its flight
        v.material.rotation = Math.atan2(pr.vy, pr.vx); v.scale.set(pr.big ? 2.6 : 1.8, pr.big ? 0.5 : 0.32, 1);
        if (Math.random() < (pr.spectral ? 0.9 : 0.5)) this.particles.emit(pr.x, pr.y, 0.1, 1, pr.spectral ? 0x9ae8ff : 0xe8f4ff, { speed: 0.3, life: 0.2, size: 0.22 }); }
      else if (pr.kind === 'crescent') { v.scale.set(1.2, 2.4, 1); if (Math.random() < 0.9) this.particles.emit(pr.x, pr.y, 0.5, 1, 0xc8a0ff, { speed: 0.6, life: 0.3, size: 0.3 }); }
      else if (pr.kind === 'hook') { // chain back to the hand
        const pl = world.player; for (let i = 0; i < 4; i++) { const k = Math.random(); this.particles.emit(pl.x + (pr.x - pl.x) * k, pl.y + 1 + (pr.y - pl.y - 1) * k, 0, 1, 0xb8b0a0, { speed: 0, life: 0.08, size: 0.14 }); } }
      else if (pr.kind === 'windblade') { v.scale.set(2.4, 0.7, 1); if (Math.random() < 0.8) this.particles.emit(pr.x, pr.y, 0.3, 1, 0xe0f4ff, { speed: 0.8, life: 0.2, size: 0.3 }); }
      else if (pr.kind === 'bomb') {
        v.rotation.z -= pr.vx * dt * 2;
        v.position.y = pr.y - 0.28;
        // fuse sparks, blinking faster as it's about to blow
        if (Math.random() < 0.8) this.particles.emit(pr.x, pr.y + 0.35, 0.4, 1, 0xffd060, { speed: 2, life: 0.2, size: 0.18 });
        v.visible = pr.fuse > 0.45 || Math.floor(pr.fuse * 16) % 2 === 0;
      }
      else if (Math.random() < 0.7) this.particles.emit(pr.x, pr.y, 0.3, 1, PROJ_COLOR[pr.kind] || 0xffb040, { speed: 1.5, life: 0.35, size: 0.35 });
    }
    for (const [pr, v] of this.projViews) if (!live.has(pr)) { this.levelGroup.remove(v); this.projViews.delete(pr); }

    // coins
    const cm = this.coinMesh, m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    const coins = world.pickups.filter((c) => !c.heart);
    cm.count = Math.min(300, coins.length);
    for (let i = 0; i < cm.count; i++) {
      const c = coins[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), world.time * 6 + i);
      sc.setScalar(this.coinScale.x * (c.value >= 5 ? 1.3 : 0.9));
      m4.compose(new THREE.Vector3(c.x, c.y - 0.05, 0.2), q, sc);
      cm.setMatrixAt(i, m4);
    }
    cm.instanceMatrix.needsUpdate = true;

    this.updateItems(world, dt);

    // props
    for (const s of this.saws) {
      s.holder.position.set(s.s.x, s.s.y, -0.2);
      s.roll.rotation.z = -s.s.angle;
    }
    for (const c of this.chests) c.lid.rotation.x = -c.c.openT * 1.6;
    for (const b of this.breakables) b.holder.visible = b.b.alive;
    for (const s of this.shrines) {
      const used = s.s.used;
      s.glow.material.opacity = used ? 0.15 : 0.6 + Math.sin(world.time * 2.5) * 0.2;
      s.light.intensity = used ? 2 : 10;
      if (!used && Math.random() < 0.15) this.particles.emit(s.s.x + (Math.random() - 0.5) * 1.6, s.s.y + 0.5, -0.5, 1, 0x7ad8ff, { speed: 0.4, up: 1.6, life: 1.4, size: 0.25 });
    }
    const open = world.exit.open;
    this.exitGlow.material.opacity = open ? 0.55 + Math.sin(world.time * 3) * 0.15 : 0.0;
    this.exitLight.intensity = open ? 9 : 0;
    this.liftSeal.material.opacity = open ? 0 : 0.35 + Math.sin(world.time * 4) * 0.15;
    this.liftView.position.y = this.liftBaseY - (world.liftDrop || 0);
    if (open && Math.random() < 0.2) this.particles.emit(world.exit.x + (Math.random() - 0.5) * 2, world.exit.y + 0.2, -0.6, 1, 0xffc070, { speed: 0.3, up: 1.4, life: 1.6, size: 0.22 });

    // ---- room camera: lock to the current room; small rooms are framed whole, big rooms scroll inside their walls
    const t = Math.tan(THREE.MathUtils.degToRad(15)); // half of the base 30° fov
    const cur = this.currentRoom(world, p);
    const room = cur && cur.connector ? null : cur; // corridors scroll freely between rooms
    const A = this.camera.aspect;
    let H, cxT, cyT, scroll = true;
    if (room) {
      const fitH = Math.max(room.h - 1, (room.w - 1) / A);
      if (room.type === 'boss') H = 13;
      else if (fitH <= 12.5) { H = Math.max(10, fitH); scroll = false; }
      else H = 10.5;
    } else H = 10.5;
    H *= this.zoomMul || 1; // camera zoom setting
    const halfH = H / 2, halfW = halfH * A;
    // what we would look at inside the room
    if (!scroll && room) { cxT = room.x + room.w / 2; cyT = room.y + room.h / 2; }
    else {
      // dead-zone follow: the camera only moves once the hero leaves a window around the centre
      const ref = this.camTarget || { x: p.x, y: p.y + 1.6 };
      // soft look-ahead from smoothed velocity (no hard dead-zone edges)
      this.velAhead = (this.velAhead || 0) + (clamp(p.vx, -8, 8) * 0.22 - (this.velAhead || 0)) * (1 - Math.exp(-dt * 1.5));
      let fx = p.x + this.velAhead;
      if (this.groundY === undefined || p.onGround || p.dead) this.groundY = p.y;
      let fy = this.groundY + 1.6;
      if (!p.onGround && (p.y + 0.9 > ref.y + 3 || p.y + 0.9 < ref.y - 2.5)) fy = p.y + 0.9;
      const boss = room?.type === 'boss' ? world.enemies.find((e) => e.boss && e.alive) : null;
      if (boss) { fx = p.x * 0.65 + boss.x * 0.35; fy = Math.max(fy, (p.y + boss.y) / 2 + 1); }
      const showcase = world.cutscene > 0 && (boss || this.finaleBoss);
      if (showcase) { const b = boss || this.finaleBoss; fx = b.x; fy = b.y + 1.2; }
      cxT = fx; cyT = fy;
      this.camTarget = { x: fx, y: fy };
      if (room) {
        cxT = clamp(cxT, room.x + halfW - 0.5, room.x + room.w - halfW + 0.5);
        cyT = clamp(cyT, room.y + halfH - 0.5, room.y + room.h - halfH + 0.5);
      }
    }
    if (!scroll) this.camTarget = { x: p.x, y: p.y + 1.6 };
    if (this.touchUI) cyT -= 1.1; // keep the hero above the touch controls
    // slide quickly between rooms, glide within one
    // critically-damped springs: eases in and out, never snaps
    this.roomSwitchT = Math.max(0, (this.roomSwitchT || 0) - dt);
    const cv = (this.camVel ||= { x: 0, y: 0, d: 0 });
    this.camPos.x = smoothDamp(this.camPos.x, cxT, cv, 'x', this.roomSwitchT > 0 ? 0.6 : 0.32, dt);
    this.camPos.y = smoothDamp(this.camPos.y, cyT, cv, 'y', this.roomSwitchT > 0 ? 0.6 : 0.4, dt);
    this.camDist = smoothDamp(this.camDist, H / (2 * t), cv, 'd', 0.9, dt);
    const cx = this.camPos.x, cy = this.camPos.y;
    const shk = this.shakeMul ?? 1; // screen shake setting
    const sh = world.shakeAmt * world.shakeAmt * 0.12 * shk;
    const kick = world.shakeAmt * world.shakeAmt * 0.3 * shk;
    this.zoomPunch = Math.max(0, (this.zoomPunch || 0) - dt * 3);
    const fov = 30 - this.zoomPunch * 1.2;
    if (Math.abs(this.camera.fov - fov) > 0.01) { this.camera.fov = fov; this.camera.updateProjectionMatrix(); }
    this.camera.position.set(cx + world.shakeX * kick + (Math.random() - 0.5) * sh, cy + 0.6 + world.shakeY * kick + (Math.random() - 0.5) * sh, this.camDist);
    this.camera.lookAt(cx + world.shakeX * kick, cy + world.shakeY * kick, 0);
    const vh = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camDist, vw = vh * A;
    world.viewRect = { x0: cx - vw, x1: cx + vw, y0: cy - vh, y1: cy + vh };
    if (this.finaleT > 0) { // death finale: chained ember explosions around the falling demon
      this.finaleT -= dt;
      const b = this.finaleBoss;
      if (Math.random() < 0.35) {
        const ex = b.x + (Math.random() - 0.5) * 3, ey = b.y + Math.random() * 4;
        this.particles.emit(ex, ey, 0.5, 26, Math.random() < 0.5 ? 0xff7a2a : 0xffd060, { speed: 8, life: 0.7, size: 0.45, gravity: 3 });
        this.fx.impact(ex, ey, 2.5 + Math.random() * 2, 0xffc080);
        world.shake(0.5);
      }
      const v = this.enemyViews.get(b);
      if (v) { const k = Math.max(0, this.finaleT / 2.8); v.root.scale.setScalar(v.scale * (0.4 + 0.6 * k)); v.mat.emissive.setRGB(1.5 * (1 - k), 0.5 * (1 - k), 0.1); }
    }
    const liveBoss = world.enemies.find((e) => e.boss && e.alive);
    if (liveBoss && liveBoss.phase === 2) this.hemiTarget.setHex(0xa86858);
    this.hemi.color.lerp(this.hemiTarget, 1 - Math.exp(-dt * 2.5));
    this.key.position.set(cx - 6, cy + 10, 14);
    this.key.target.position.set(cx, cy, 0);

    // torch light pool → nearest torches to the camera
    const near = [...this.torches, ...this.lightSources]
      .map((t) => ({ t, d: Math.abs(t.x - cx) + Math.abs(t.y - cy) * 1.3 }))
      .sort((a, b) => a.d - b.d).slice(0, this.torchLights.length);
    this.torchLights.forEach((l, i) => {
      const n = near[i];
      if (!n || n.d > halfW + 8) { l.intensity = 0; return; }
      const fl = 0.85 + Math.sin(world.time * 11 + n.t.phase) * 0.08 + Math.sin(world.time * 23 + n.t.phase * 2) * 0.05;
      l.position.set(n.t.x, n.t.y + 0.4, n.t.z ?? Z_BACK + 1.6);
      l.color.setHex(n.t.color || this.look.torch);
      l.intensity = 14 * fl;
    });
    for (const t of this.torches) {
      t.glow.material.opacity = 0.6 + Math.sin(world.time * 13 + t.phase) * 0.12;
      if (Math.abs(t.x - cx) < halfW + 2 && Math.random() < 0.04) this.particles.emit(t.x, t.y + 0.5, Z_BACK + 0.9, 1, 0xffa040, { speed: 0.3, up: 1.5, life: 1.0, size: 0.16 });
    }
    // drifting ash near the camera
    if (Math.random() < 0.5) {
      const col = world.level.biome === 'halls' ? 0xb0a090 : 0xff7a3a;
      this.particles.emit(cx + (Math.random() - 0.5) * halfW * 2.2, cy - halfH, 1 + Math.random() * 3, 1, col, { speed: 0.2, up: 1.2, life: 6, size: 0.09, drift: true });
    }

    for (const b of this.beams || []) {
      b.beam.material.opacity = b.base * (0.75 + 0.25 * Math.sin(world.time * 0.7 + b.phase));
      if (Math.abs(b.x - cx) < halfW + 3 && Math.random() < 0.12) {
        const t = Math.random(), yy = b.y0 + (b.y1 - b.y0) * t;
        this.particles.emit(b.x + (b.y1 - yy) * 0.33 + (Math.random() - 0.5) * 1.6, yy, -1.5, 1, b.color, { speed: 0.12, life: 4, size: 0.07, drift: true });
      }
    }
    this.particles.update(dt);
    if (this.debug) this.drawDebug(world);
    if (this.post.enabled) this.post.render(dt, world.player.hp <= 1 && !world.player.dead ? 0.25 + Math.sin(world.time * 4) * 0.1 : 0);
    else this.renderer.render(this.scene, this.camera);
  }

  // Telegraphs for the Ash Demon, read from the fields enemies.js exposes (see COLLAB.md boss contract).
  updateBossFx(e, world, dt, v) {
    const B = (this.bossFx ||= this.makeBossFx());
    const winding = e.state === 'windup' && e.alive;
    const tg = e.telegraph || 0;
    // swoop: glowing dive line through the locked aim point
    const sw = winding && ['swoop', 'charge', 'dash'].includes(e.telegraphKind) && e.aim;
    B.line.visible = !!sw;
    if (sw) {
      const ox = e.x, oy = e.y + e.h * 0.5, dx = e.aim.x - ox, dy = e.aim.y + 1 - oy;
      const len = Math.hypot(dx, dy) * 1.8 + 2;
      B.line.position.set(ox + (dx / Math.hypot(dx, dy)) * len / 2, oy + (dy / Math.hypot(dx, dy)) * len / 2, 0.5);
      B.line.rotation.z = Math.atan2(dy, dx);
      B.line.scale.set(len, 2.2, 1);
      B.line.material.uniforms.a.value = 0.25 + tg * 0.75;
      B.line.material.uniforms.t.value = world.time;
    }
    // slam: floor glows where the shockwaves will erupt
    const sl = winding && ['slam', 'erupt', 'spikes'].includes(e.telegraphKind) && e.slamXs;
    const markColor = e.telegraphKind === 'spikes' ? 0xe8e0c8 : e.telegraphKind === 'erupt' ? 0xff8a2a : 0xff4a1a;
    B.marks.forEach((m, i) => {
      const x = sl ? e.slamXs[i] : undefined;
      m.visible = x !== undefined;
      if (!m.visible) return;
      m.position.set(x, e.slamY + 0.35, 0.6);
      m.material.color.setHex(markColor);
      m.scale.set(1.8 + tg * 1.2, (e.telegraphKind === 'erupt' ? 2.2 : 0.9) + tg * 0.8, 1);
      m.material.opacity = 0.35 + tg * 0.65 * (0.8 + Math.sin(world.time * 30) * 0.2);
      if (Math.random() < 0.25) this.particles.emit(x, e.slamY + 0.1, 0.5, 1, 0xff5a2a, { speed: 0.6, up: 3 + tg * 3, life: 0.5, size: 0.3 });
    });
    // fire: a charging orb in front of the chest
    const fi = winding && e.telegraphKind === 'fire';
    B.orb.visible = fi;
    if (fi) { B.orb.position.set(e.x + e.facing * 0.8, e.y + e.h * 0.62, 0.8); B.orb.scale.setScalar(0.6 + tg * 2.2); B.orb.material.opacity = 0.5 + tg * 0.5;
      if (Math.random() < 0.6) this.particles.emit(B.orb.position.x + (Math.random() - 0.5) * 3, B.orb.position.y + (Math.random() - 0.5) * 3, 0.8, 1, 0xffa040, { speed: 0.5, life: 0.3, size: 0.25 }); }
    // summon: purple sigil under the demon
    const su = winding && e.telegraphKind === 'summon';
    B.sigil.visible = su;
    if (su) { B.sigil.position.set(e.x, e.y + 0.2, 0.4); B.sigil.scale.setScalar(2 + tg * 3); B.sigil.material.rotation += dt * 3; }
    // stunned: sparks circling the head — the punish window
    if (e.stunned && Math.random() < 0.5) {
      const a = world.time * 8;
      this.particles.emit(e.x + Math.cos(a) * 1.2, e.y + e.h + 0.2 + Math.sin(a) * 0.3, 0.8, 1, 0xfff07a, { speed: 0.2, life: 0.35, size: 0.3 });
    }
    // phase shift / roar: hot glow
    if (e.state === 'phaseshift' || e.state === 'roar') v.extraGlow = 0.6 + Math.sin(world.time * 20) * 0.3; else v.extraGlow = 0;
  }

  updateSlamMarks(v, e, world) {
    if (!v.marks) { v.marks = []; for (let i = 0; i < 8; i++) { const m = this.sprite(0xff6a2a, 1, 0); m.visible = false; this.levelGroup.add(m); v.marks.push(m); } }
    const on = e.alive && e.state === 'windup' && e.telegraphKind === 'slam' && e.slamXs;
    v.marks.forEach((m, i) => {
      const x = on ? e.slamXs[i] : undefined;
      m.visible = x !== undefined;
      if (!m.visible) return;
      m.position.set(x, e.slamY + 0.3, 0.6); m.scale.set(1.4 + e.telegraph, 0.7 + e.telegraph * 0.6, 1);
      m.material.opacity = 0.3 + e.telegraph * 0.6;
    });
  }

  makeBossFx() {
    const g = this.levelGroup;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { a: { value: 0 }, t: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float a; uniform float t; varying vec2 vUv;
        void main(){ float edge = 1.0 - abs(vUv.y - 0.5) * 2.0; float core = pow(edge, 3.0);
          float dash = 0.6 + 0.4 * step(0.5, fract(vUv.x * 10.0 - t * 4.0));
          float fade = smoothstep(0.0, 0.15, vUv.x) * (1.0 - smoothstep(0.8, 1.0, vUv.x));
          float al = (core * dash + edge * 0.25) * fade * a; gl_FragColor = vec4(vec3(1.0, 0.25, 0.1) * al * 1.5, al); }`,
    }));
    line.visible = false; g.add(line);
    const marks = [];
    for (let i = 0; i < 12; i++) { const m = this.sprite(0xff4a1a, 1, 0); m.visible = false; g.add(m); marks.push(m); }
    const orb = this.sprite(0xffa040, 1, 0); orb.visible = false; g.add(orb);
    const sigil = this.sprite(0xb060ff, 1, 0.7); sigil.visible = false; g.add(sigil);
    return { line, marks, orb, sigil };
  }

  weaponPiece(id) {
    return (this.weaponList || []).find((w) => w.id === id)?.piece || 'sword';
  }

  // Status effects read straight from enemy state set by mechanics.js
  statusFx(e, v, world, dt) {
    if (!e.alive) return;
    const P = this.particles;
    if (e.burnT > 0 && Math.random() < 0.5) P.emit(e.x + (Math.random() - 0.5) * e.w, e.y + Math.random() * e.h, 0.4, 1, 0xff7a2a, { speed: 0.6, up: 2.2, life: 0.45, size: 0.3 });
    if (e.bleed > 0 && Math.random() < 0.12 * e.bleed) P.emit(e.x, e.y + e.h * 0.6, 0.4, 1, 0xa01010, { speed: 0.8, life: 0.6, size: 0.22, gravity: 10 });
    if (e.poisonT > 0 && Math.random() < 0.35) P.emit(e.x + (Math.random() - 0.5) * e.w, e.y + e.h * Math.random(), 0.3, 1, 0x7ae84a, { speed: 0.4, up: 1, life: 0.6, size: 0.26 });
    if (e.chill > 0 && Math.random() < 0.06 * e.chill) P.emit(e.x + (Math.random() - 0.5) * e.w, e.y + e.h * Math.random(), 0.3, 1, 0xbfe8ff, { speed: 0.3, life: 0.5, size: 0.2 });
    if (e.chainT > 0 && Math.random() < 0.25) P.emit(e.x, e.y + e.h * 0.6, 0.3, 1, 0xff9a3a, { speed: 1, life: 0.3, size: 0.22 });
    if (e.frozenT > 0 && v.mat) v.mat.emissive.setRGB(0.25, 0.55, 0.9);
    if (e.stunT > 0 && !(e.frozenT > 0) && Math.random() < 0.4) { const a = world.time * 9; P.emit(e.x + Math.cos(a) * 0.6, e.y + e.h + 0.2, 0.5, 1, 0xfff07a, { speed: 0.1, life: 0.3, size: 0.24 }); }
    if (!v.badge) { v.badge = this.sprite(0xc890ff, 0.9, 0); this.levelGroup.add(v.badge); }
    const badge = e.marked || e.ghostMark ? 0xc890ff : e.executable ? 0xff2a2a : e.prey ? 0xffb030 : e.penanceT > 0 ? 0xfff0c0 : null;
    v.badge.visible = !!badge && v.root.visible;
    if (badge) { v.badge.material.color.setHex(badge); v.badge.position.set(e.x, e.y + e.h + 0.45, 0.6); v.badge.material.opacity = 0.7 + Math.sin(world.time * 10) * 0.25; }
    if (e.executable && v.mat) v.mat.emissive.r = Math.max(v.mat.emissive.r, 0.35 + Math.sin(world.time * 10) * 0.2);
  }

  // Merchant, weapon altars, hearts, souls, dash trails, special projectiles
  updateItems(world, dt) {
    const P = this.particles;
    this.itemViews ||= new Map();
    const live = new Set([...(world.turrets || []), ...(world.snares || [])]);
    for (const t of live) {
      let v = this.itemViews.get(t);
      if (!v) { v = this.emojiSprite(world.turrets?.includes(t) ? '🗼' : '🪤', world.turrets?.includes(t) ? 1.1 : 0.7); this.levelGroup.add(v); this.itemViews.set(t, v); }
      v.position.set(t.x, t.y + (world.turrets?.includes(t) ? 0.55 : 0.3), 0.4);
      if (world.turrets?.includes(t) && Math.random() < 0.3) P.emit(t.x, t.y + 1.1, 0.2, 1, 0xff8a3a, { speed: 0.4, up: 1, life: 0.4, size: 0.2 });
    }
    for (const [t, v] of this.itemViews) if (!live.has(t)) { this.levelGroup.remove(v); this.itemViews.delete(t); }
    for (const pool of world.pools || []) if (Math.random() < 0.8) P.emit(pool.x + (Math.random() - 0.5) * 2.6, pool.y + 0.1, 0.1, 1, 0xff6a1a, { speed: 0.3, up: 1.6, life: 0.5, size: 0.35 });
    for (const c of world.clouds || []) if (Math.random() < 0.7) P.emit(c.x + (Math.random() - 0.5) * 3, c.y + Math.random() * 1.5, 0.2, 1, 0x6ad83a, { speed: 0.3, up: 0.3, life: 0.9, size: 0.6 });
    for (const a of world.allies || []) { // spectral fighters: a shimmering silhouette of light
      for (let i = 0; i < 3; i++) P.emit(a.x + (Math.random() - 0.5) * 0.7, a.y + Math.random() * 1.9, 0.05, 1, a.kind === 'hollow' ? 0xc8a0ff : a.kind === 'shade' ? 0xff3a3a : 0x9ae8ff, { speed: 0.3, up: 0.6, life: 0.35, size: 0.32 });
    }
    if (world.decoy) for (let i = 0; i < 2; i++) P.emit(world.decoy.x + (Math.random() - 0.5) * 0.6, world.decoy.y + Math.random() * 1.7, 0.05, 1, 0xc8c8ff, { speed: 0.2, life: 0.3, size: 0.32 });
    this.relicViews ||= new Map();
    for (const r of world.relics || []) {
      let v = this.relicViews.get(r);
      if (!v) { v = this.emojiSprite(r.icon || this.blessingIcon?.(r.id) || '✦', 0.9); this.levelGroup.add(v); this.relicViews.set(r, v); }
      v.position.set(r.x, r.y + 1 + Math.sin(world.time * 2.5 + r.x) * 0.12, 0.5);
      if (Math.random() < 0.3) P.emit(r.x, r.y + 0.9, 0.4, 1, 0xffd27a, { speed: 0.5, up: 1, life: 0.6, size: 0.22 });
    }
    for (const [r, v] of this.relicViews) if (!(world.relics || []).includes(r)) { this.levelGroup.remove(v); this.relicViews.delete(r); }
    if (world.merchant && !this.merchantView) {
      const ch = makeCharacter('dwarf_miner');
      const mat = rimify(this.charMat.clone(), [1, 0.85, 0.6]); mat.map = assets.chars.dwarf_miner.map;
      ch.root.traverse((o) => { if (o.isMesh) o.material = mat; });
      ch.root.position.set(world.merchant.x, world.merchant.y, -0.4);
      ch.root.rotation.y = 0.5;
      ch.root.updateMatrixWorld(true);
      const hgt = new THREE.Box3().setFromObject(ch.root).getSize(new THREE.Vector3()).y || 1.6;
      ch.root.scale.setScalar(1.45 / hgt);
      playAnim(ch, 'idle');
      this.levelGroup.add(ch.root);
      const lamp = this.sprite(0xffc070, 2.6, 0.55); lamp.position.set(world.merchant.x + 0.7, world.merchant.y + 1.4, 0); this.levelGroup.add(lamp);
      this.placePiece('crate_stack', world.merchant.x - 1.3, world.merchant.y, -1.1, { h: 1.4 });
      this.lightSources.push({ x: world.merchant.x, y: world.merchant.y + 1.2, z: 1.2, color: 0xffc070, glow: lamp, phase: 0 });
      this.merchantView = ch;
    }
    if (this.merchantView) this.merchantView.mixer.update(dt);
    // weapon altars: the weapon floats and turns above a glow
    this.dropViews ||= new Map();
    for (const d of world.weaponDrops) {
      let dv = this.dropViews.get(d);
      if (!dv || dv.id !== d.id) {
        if (dv) this.levelGroup.remove(dv.holder);
        const holder = new THREE.Group();
        if (d.item) { const ic = this.emojiSprite(this.itemIcon?.(d.id) || '✦', 1); ic.position.y = 0.3; holder.add(ic); }
        else this.placePiece(this.weaponPiece(d.id), 0, 0, 0, { h: 1.2, group: holder });
        const glow = this.sprite(0xffd27a, 2.4, 0.5); glow.position.y = 0.6; holder.add(glow);
        this.levelGroup.add(holder);
        dv = { holder, id: d.id }; this.dropViews.set(d, dv);
        if (!this.altarsPlaced?.has(d)) { (this.altarsPlaced ||= new Set()).add(d); this.placePiece('obelisk', d.x, d.y - 0.6, -0.9, { h: 1.0 }); }
      }
      dv.holder.position.set(d.x, d.y + 0.7 + Math.sin(world.time * 2 + d.t) * 0.12, 0);
      dv.holder.rotation.y = world.time * 1.5;
      if (Math.random() < 0.08) P.emit(d.x, d.y + 0.5, 0.2, 1, 0xffd27a, { speed: 0.3, up: 1.2, life: 1, size: 0.15 });
    }
    // hearts and soul orbs as glows
    this.orbSprites ||= [];
    const orbs = [...world.pickups.filter((c) => c.heart).map((c) => ({ x: c.x, y: c.y, color: 0xff4a5a, size: 1.1 })),
      ...(world.souls || []).map((s) => ({ x: s.x, y: s.y, color: 0x8af0ff, size: 0.9 }))];
    while (this.orbSprites.length < orbs.length) { const s = this.sprite(0xffffff, 1, 0.9); this.levelGroup.add(s); this.orbSprites.push(s); }
    this.orbSprites.forEach((s, i) => {
      const o = orbs[i]; s.visible = !!o; if (!o) return;
      s.position.set(o.x, o.y + 0.1, 0.4); s.material.color.setHex(o.color); s.scale.setScalar(o.size * (0.9 + Math.sin(world.time * 8 + i) * 0.1));
    });
    // ember trail flames
    for (const t of world.trails || []) if (Math.random() < 0.35) P.emit(t.x + (Math.random() - 0.5) * 0.6, t.y + 0.1, 0.2, 1, 0xff7a2a, { speed: 0.4, up: 1.8, life: 0.5, size: 0.3 });
  }

  // Soft contact shadow on the floor below a character: grounds it and shows where it will land.
  placeShadow(v, world, x, y, size, fade = 1) {
    if (!v.shadow) { v.shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat.clone()); v.shadow.renderOrder = 1; this.levelGroup.add(v.shadow); }
    const L = world.level;
    let fy = null;
    for (let ty = Math.floor(y + 0.05); ty > Math.floor(y) - 9 && ty >= 0; ty--) {
      const t = L.tiles[(ty - 1) * L.w + Math.floor(x)];
      if (t === T.SOLID || t === T.PLATFORM) { fy = ty; break; }
    }
    if (fy === null) { v.shadow.visible = false; return; }
    const hgt = Math.max(0, y - fy), k = Math.max(0, 1 - hgt / 6);
    v.shadow.visible = k > 0.02 && fade > 0;
    v.shadow.position.set(x, fy + 0.03, -1.0); // on the floor surface (scenery sits 1.1 behind the play layer)
    v.shadow.scale.set(size * (0.6 + 0.4 * k), 1, size * 0.55 * (0.6 + 0.4 * k));
    v.shadow.material.opacity = 0.7 * k * Math.min(1, fade);
  }

  currentRoom(world, p) {
    const rooms = world.level.rooms || [];
    const px = p.x, py = p.y + 0.9;
    const inside = (r, m) => px >= r.x - m && px < r.x + r.w + m && py >= r.y - m && py < r.y + r.h + m;
    if (this.room && rooms.includes(this.room) && inside(this.room, 0.4)) return this.room;
    const r = rooms.find((rr) => inside(rr, 0)) || this.room || null;
    if (r !== this.room) { if (this.room) this.roomSwitchT = 0.7; this.room = r; this.onRoomChange?.(r); }
    return r;
  }

  handleEvents(world) {
    const P = this.particles;
    for (const ev of world.events) {
      switch (ev.t) {
        case 'hit': {
          const d = ev.vertical ? 0 : ev.dir, dy = ev.vertical || 0;
          const big = ev.crit || ev.finisher || ev.killed;
          P.emit(ev.x, ev.y, 0.5, big ? 26 : 14, ev.crit ? 0xfff07a : 0xffe6c0, { speed: big ? 11 : 8, life: 0.28, size: 0.26, gravity: 4, dir: d, dirY: dy });
          P.emit(ev.x, ev.y, 0.4, big ? 10 : 6, 0xb02020, { speed: 5, life: 0.6, size: 0.32, gravity: 16, dir: d * 0.6, dirY: dy * 0.6 });
          this.fx.impact(ev.x, ev.y, big ? 2.2 : 1.5, ev.crit ? 0xfff0a0 : 0xffffff);
          this.fx.number(ev.x + (Math.random() - 0.5) * 0.4, ev.y + 0.9, ev.dmg, ev.crit);
          const v = this.enemyViews.get(ev.e);
          if (v) { v.punch = 1; v.shove = (d || 0) * 0.35; }
          if (big) this.zoomPunch = Math.max(this.zoomPunch || 0, ev.killed ? 1 : 0.5);
          vibrate(ev.killed ? 25 : 12);
          break;
        }
        case 'swing': this.fx.slash(ev); break;
        case 'blocked':
          P.emit(ev.x, ev.y, 0.5, 14, 0x9fd0ff, { speed: 7, life: 0.25, size: 0.25, dir: -ev.dir });
          this.fx.impact(ev.x, ev.y, 1.6, 0x9fd0ff); vibrate(15); break;
        case 'pogo':
          P.emit(ev.x, ev.y, 0.3, 18, 0xffffff, { speed: 6, life: 0.3, size: 0.28, flat: true });
          this.fx.impact(ev.x, ev.y, 1.8, 0xffffff); vibrate(10); break;
        case 'kill':
          P.emit(ev.e.x, ev.e.y + ev.e.h * 0.5, 0.3, 30, 0xc8b8a0, { speed: 7, life: 0.8, size: 0.32, gravity: 12 });
          P.emit(ev.e.x, ev.e.y + ev.e.h * 0.5, 0.3, 18, 0xff8a3a, { speed: 3, up: 3, life: 1.3, size: 0.28 });
          break;
        case 'spark': P.emit(ev.x, ev.y, 0.4, ev.n || 8, ev.color, { speed: 5, life: 0.25, size: 0.22 }); break;
        case 'burn': P.emit(ev.x, ev.y, 0.4, 20, 0xff5a1a, { speed: 4, up: 3, life: 0.7, size: 0.4 }); break;
        case 'hurt': P.emit(ev.x, ev.y, 0.5, 22, 0xff3030, { speed: 7, life: 0.45, size: 0.32, gravity: 8 }); this.fx.impact(ev.x, ev.y, 2.4, 0xff5050); vibrate(45); break;
        case 'dash': P.emit(ev.x, ev.y + 0.9, 0, ev.air ? 10 : 14, ev.air ? 0xffffff : 0xb0a0ff, { speed: 2.5, life: 0.35, size: 0.35 }); break;
        case 'land': P.emit(ev.x, ev.y + 0.05, 0.3, 8, 0x9a8a7a, { speed: 3, life: 0.4, size: 0.3, gravity: 4, flat: true }); break;
        case 'heal': P.emit(ev.x, ev.y + 1, 0.3, 24, 0x6aff9a, { speed: 2, up: 3, life: 0.9, size: 0.3 }); break;
        case 'coin': P.emit(ev.x, ev.y, 0.3, 3, 0xffd040, { speed: 2, life: 0.25, size: 0.18 }); break;
        case 'chest': P.emit(ev.c.x, ev.c.y + 1, 0.3, 30, 0xffd040, { speed: 5, up: 3, life: 0.8, size: 0.25, gravity: 6 }); break;
        case 'break': P.emit(ev.b.x, ev.b.y + 0.5, 0.2, 16, 0x8a6a4a, { speed: 5, life: 0.6, size: 0.3, gravity: 14 }); break;
        case 'shrine': P.emit(ev.s.x, ev.s.y + 1.5, 0, 40, 0x7ad8ff, { speed: 4, up: 2, life: 1.2, size: 0.3 }); break;
        case 'respawn': P.emit(ev.x, ev.y + 1, 0.3, 20, 0xffffff, { speed: 2.5, life: 0.5, size: 0.3 }); break;
        case 'bossDead': P.emit(ev.e.x, ev.e.y + 2, 0.3, 120, 0xff6a2a, { speed: 9, life: 1.6, size: 0.45, gravity: 2 }); break;
        case 'tick': if (Math.random() < 0.5) this.fx.number(ev.x, ev.y + 0.4, ev.dmg, false); break;
        case 'lightning': this.fx.lightning(ev.pts); for (const pt of ev.pts) { P.emit(pt.x, pt.y, 0.6, 10, 0xb0e0ff, { speed: 5, life: 0.25, size: 0.25 }); this.fx.impact(pt.x, pt.y, 1.8, 0xc8e8ff); } break;
        case 'bleedburst': P.emit(ev.x, ev.y, 0.5, 34, 0xc01818, { speed: 7, life: 0.6, size: 0.36, gravity: 12 }); this.fx.impact(ev.x, ev.y, 2.6, 0xff4040); break;
        case 'mark': P.emit(ev.e.x, ev.e.y + ev.e.h + 0.2, 0.5, 10, 0xc890ff, { speed: 2, life: 0.4, size: 0.25 }); break;
        case 'markpop': P.emit(ev.x, ev.y, 0.5, 18, 0xd0a0ff, { speed: 5, life: 0.4, size: 0.3 }); break;
        case 'stun': P.emit(ev.e.x, ev.e.y + ev.e.h, 0.5, 12, 0xfff07a, { speed: 3, life: 0.4, size: 0.25 }); break;
        case 'parry': this.fx.impact(ev.x, ev.y, 3.4, 0xffffff); P.emit(ev.x, ev.y, 0.6, 30, 0xfff4c0, { speed: 9, life: 0.35, size: 0.3 }); this.zoomPunch = Math.max(this.zoomPunch || 0, 1); vibrate(30); break;
        case 'nova': this.fx.ring(ev.x, ev.y, ev.r, ev.color); P.emit(ev.x, ev.y, 0.5, 40, ev.color, { speed: ev.r * 3, life: 0.45, size: 0.35 }); break;
        case 'revive': P.emit(ev.x, ev.y + 1, 0.5, 60, 0xffa040, { speed: 5, up: 4, life: 1.2, size: 0.4 }); break;
        case 'soul': P.emit(ev.x, ev.y, 0.4, 8, 0x8af0ff, { speed: 2, life: 0.4, size: 0.25 }); break;
        case 'bloodlust': P.emit(ev.x, ev.y + 1, 0.3, 14, 0xff3a3a, { speed: 3, life: 0.4, size: 0.28 }); break;
        case 'deflect': this.fx.impact(ev.x, ev.y, 1.8, 0xfff0a0); break;
        case 'wardup': P.emit(ev.x, ev.y + 1, 0.4, 16, 0x8ac8ff, { speed: 2, life: 0.5, size: 0.25 }); break;
        case 'execute': this.fx.impact(ev.x, ev.y, 3.2, 0xff3030); P.emit(ev.x, ev.y, 0.5, 40, 0xff2a2a, { speed: 8, life: 0.5, size: 0.35, gravity: 6 }); this.zoomPunch = 1; break;
        case 'weaponSwap': P.emit(ev.x, ev.y + 1, 0.3, 30, 0xffd27a, { speed: 4, up: 2, life: 0.8, size: 0.3 }); break;
        case 'heavy':
          this.fx.impact(ev.x, ev.y, ev.perfect ? 4.2 : ev.full ? 3.2 : 2.4, ev.perfect ? 0xffffff : 0xffc070);
          P.emit(ev.x, ev.y, 0.6, ev.full ? 36 : 20, ev.perfect ? 0xfff4c0 : 0xffa040, { speed: 8, life: 0.4, size: 0.32, dir: ev.facing });
          if (ev.full) this.zoomPunch = Math.max(this.zoomPunch || 0, ev.perfect ? 1 : 0.5);
          vibrate(ev.perfect ? 40 : 20); break;
        case 'echo': this.fx.impact(ev.x, ev.y, 1.6, ev.kind === 'crimson' ? 0xff4a4a : ev.kind === 'shade' ? 0x9a7aff : 0xd0e8ff); P.emit(ev.x, ev.y, 0.4, 10, ev.kind === 'crimson' ? 0xff3a3a : 0xc8d8ff, { speed: 4, life: 0.3, size: 0.25 }); break;
        case 'judgment': this.fx.impact(ev.x, ev.y, 2.8, 0xfff0b0); P.emit(ev.x, ev.y + 2, 0.2, 20, 0xfff0c0, { speed: 2, life: 0.4, size: 0.3, gravity: -10 }); break;
        case 'shatter': this.fx.impact(ev.e.x, ev.e.y + ev.e.h / 2, 3, 0xbfe8ff); P.emit(ev.e.x, ev.e.y + ev.e.h / 2, 0.5, 34, 0xd8f4ff, { speed: 8, life: 0.6, size: 0.3, gravity: 12 }); break;
        case 'frozen': P.emit(ev.e.x, ev.e.y + ev.e.h / 2, 0.6, 24, 0xbfe8ff, { speed: 3, life: 0.6, size: 0.3 }); break;
        case 'chilled': case 'slowed': P.emit(ev.e.x, ev.e.y + ev.e.h, 0.5, 12, ev.t === 'chilled' ? 0xbfe8ff : 0xe0d0ff, { speed: 2, life: 0.5, size: 0.25 }); break;
        case 'cloud': P.emit(ev.x, ev.y, 0.8, 30, 0x7ae84a, { speed: 1.5, up: 0.5, life: 1.2, size: 0.5 }); break;
        case 'emberchain': this.fx.lightning(ev.pts); for (const pt of ev.pts) P.emit(pt.x, pt.y, 0.4, 10, 0xff8a3a, { speed: 3, life: 0.4, size: 0.25 }); break;
        case 'bell': this.fx.impact(ev.x, ev.y + 1, 5, 0xd8e8ff); this.fx.ring(ev.x, ev.y + 0.5, 3, 0xc8d8ff); this.zoomPunch = 1; vibrate(40); break;
        case 'eclipse': this.fx.ring(ev.x, ev.y + 1, 3, 0x6a3aaa); P.emit(ev.x, ev.y + 1, 0.5, 40, 0x4a1a8a, { speed: 5, life: 0.8, size: 0.4 }); break;
        case 'stormcharge': P.emit(ev.x, ev.y, 0.5, 6 * ev.n, 0xc8f0ff, { speed: 3, life: 0.4, size: 0.24 }); break;
        case 'decoy': P.emit(ev.x, ev.y + 0.9, 0.4, 24, 0xc8c8ff, { speed: 1.5, life: 0.6, size: 0.35 }); break;
        case 'summon': this.fx.ring(ev.x, ev.y + 1, 2, 0x9ae8ff); P.emit(ev.x, ev.y + 1, 0.5, 30, 0x9ae8ff, { speed: 3, up: 2, life: 0.8, size: 0.35 }); break;
        case 'allyhit': this.fx.impact(ev.x, ev.y, 1.6, 0x9ae8ff); break;
        case 'fragment': P.emit(ev.x, ev.y, 0.3, 14, 0x6aff9a, { speed: 2, up: 2, life: 0.8, size: 0.3 }); break;
        case 'debt': P.emit(ev.x, ev.y + 1, 0.4, 20, 0x8a0a0a, { speed: 3, life: 0.6, size: 0.3, gravity: 8 }); break;
        case 'relicdrop': this.fx.ring(ev.x, ev.y + 0.6, 1.4, 0xffd27a); break;
        case 'deploy': this.fx.ring(ev.x, ev.y + 0.3, 1, ev.kind === 'turret' ? 0xff9a3a : 0xc8b8a0); break;
        case 'snare': this.fx.impact(ev.x, ev.y + 0.4, 2, 0xd0c0a0); P.emit(ev.x, ev.y + 0.3, 0.3, 18, 0xa01818, { speed: 4, up: 2, life: 0.5, size: 0.25, gravity: 10 }); break;
        case 'cloak': P.emit(ev.x, ev.y + 1, 0.5, 30, 0x9a9aaa, { speed: 2, up: 1, life: 0.8, size: 0.5 }); break;
        case 'itemUse': break;
        case 'counter': this.fx.impact(ev.x, ev.y, 2.8, 0xfff4c0); P.emit(ev.x, ev.y, 0.4, 20, 0xfff0a0, { speed: 6, life: 0.35, size: 0.28 }); break;
        case 'soulspend': this.fx.ring(ev.x, ev.y, 2, 0xb48aff); P.emit(ev.x, ev.y, 0.5, 30, 0xc8a0ff, { speed: 5, up: 2, life: 0.6, size: 0.3 }); break;
        case 'hooked': for (let i = 0; i <= 10; i++) P.emit(ev.px + (ev.x - ev.px) * i / 10, ev.py + (ev.y - ev.py) * i / 10, 0.05, 1, 0xd0c8b8, { speed: 0.3, life: 0.25, size: 0.18 }); this.fx.impact(ev.x, ev.y, 1.6, 0xe8e0d0); break;
        case 'fracture': P.emit(ev.e.x, ev.e.y + ev.e.h * 0.6, 0.5, 10 + 6 * (ev.e.fracture || 1), 0xb0a090, { speed: 4, life: 0.5, size: 0.28, gravity: 10 }); break;
        case 'armorbreak': this.fx.impact(ev.e.x, ev.e.y + ev.e.h * 0.6, 3.4, 0xffe0a0); P.emit(ev.e.x, ev.e.y + ev.e.h * 0.6, 0.6, 40, 0x9a8a7a, { speed: 7, life: 0.8, size: 0.35, gravity: 12 }); break;
        case 'chargeFull': this.fx.ring(ev.x, ev.y + 1, 1.2, 0xffd27a); P.emit(ev.x, ev.y + 1, 0.3, 18, 0xffe0a0, { speed: 3, life: 0.35, size: 0.25 }); vibrate(12); break;
        case 'perfectDodge':
          this.fx.ring(ev.x, ev.y + 0.9, 2.2, 0xb8e8ff); this.fx.impact(ev.x, ev.y + 0.9, 3, 0xe0f4ff);
          P.emit(ev.x, ev.y + 0.9, 0.4, 30, 0xc8f0ff, { speed: 6, life: 0.45, size: 0.28 }); this.zoomPunch = Math.max(this.zoomPunch || 0, 0.6); vibrate(25); break;
        case 'staggered':
          P.emit(ev.e.x, ev.e.y + ev.e.h + 0.3, 0.5, 22, 0xffe070, { speed: 4, life: 0.6, size: 0.3 });
          this.fx.impact(ev.e.x, ev.e.y + ev.e.h * 0.6, 2.6, 0xfff0a0); break;
        case 'blink': P.emit(ev.x, ev.y + 0.7, 0.3, 26, 0xb46aff, { speed: 4, life: 0.45, size: 0.3 }); this.fx.impact(ev.x, ev.y + 0.7, 1.8, 0xc890ff); break;
        case 'explode':
          P.emit(ev.x, ev.y, 0.5, 40, 0xffa040, { speed: ev.r * 5, life: 0.5, size: 0.45, gravity: 4 });
          P.emit(ev.x, ev.y, 0.5, 20, 0x4a3a30, { speed: ev.r * 2.5, up: 1.5, life: 1.2, size: 0.6 });
          this.fx.impact(ev.x, ev.y, ev.r * 2.4, 0xffc070); this.zoomPunch = Math.max(this.zoomPunch || 0, 0.5); vibrate(35); break;
        case 'bossDying': this.finaleT = 2.8; this.finaleBoss = ev.e; this.fx.impact(ev.e.x, ev.e.y + 2, 6, 0xffffff); break;
        case 'bossPhase': P.emit(ev.e.x, ev.e.y + 2, 0.3, 90, 0xff8a3a, { speed: 10, life: 1.2, size: 0.45 }); this.fx.impact(ev.e.x, ev.e.y + 2, 5, 0xffb060); break;
        case 'bossIntro': P.emit(ev.e.x, ev.e.y + 2, 0.3, 60, 0xff5a2a, { speed: 6, up: 2, life: 1.5, size: 0.4 }); break;
      }
    }
  }

  trackFps(dt) {
    // adaptive resolution: drop pixel ratio if the device is struggling
    if (dt <= 0) return; // paused frames don't count
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 90) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      this.fps = Math.round(1 / avg);
      if (avg > 1 / 40 && this.post.enabled) { this.post.enabled = false; return; } // drop post-fx first
      if (avg > 1 / 45 && this.dpr > 1) { this.dpr = Math.max(1, this.dpr - 0.25); this.renderer.setPixelRatio(this.dpr); this.resize(); }
    }
  }

  drawDebug(world) {
    this.debugGroup.clear();
    const box = (b, color) => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(b.w, b.h), new THREE.MeshBasicMaterial({ color, wireframe: true }));
      mesh.position.set(b.x, b.y + b.h / 2, 1); this.debugGroup.add(mesh);
    };
    box(world.player, 0x00ff00);
    for (const e of world.enemies) box(e, 0xff0000);
    for (const h of world.hitboxes) box(h, 0xffff00);
    if (world.player.state === 'attack') box(swingBox(world.player), 0x00ffff);
  }
}

// Scale that fits a kit piece to a target size (null = keep proportion of the first given axis).
function fitScale(id, w, h, d) {
  const bb = assets.pieces[id].boundingBox;
  const sx = bb.max.x - bb.min.x || 1, sy = bb.max.y - bb.min.y || 1, sz = bb.max.z - bb.min.z || 1;
  const ref = w ? w / sx : h ? h / sy : d / sz;
  const x = w ? w / sx : ref, y = h ? h / sy : ref, z = d ? d / sz : ref;
  return { x, y, z, ox: bb.min.x * x, oy: bb.min.y * y, oz: bb.min.z * z };
}

function isInteriorFn(level, exposed) {
  const { w, h, tiles } = level;
  return (x, y) => x >= 0 && y >= 0 && x < w && y < h && tiles[y * w + x] === T.SOLID && !exposed(x, y);
}

function clamp(v, a, b) { return a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)); }

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Short additive ribbon following the sword tip during swings.
class SwordTrail {
  constructor(tex) {
    this.n = 10;
    this.pts = [];
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.n * 2 * 3);
    this.alpha = new Float32Array(this.n * 2);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const idx = [];
    for (let i = 0; i < this.n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      vertexShader: 'attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(vec3(1.0,0.92,0.75) * vA, vA); }',
    }));
    this.mesh.frustumCulled = false;
    this.base = new THREE.Vector3(); this.tip = new THREE.Vector3();
  }
  update(sword, active, dt) {
    if (!sword) return;
    if (active) {
      sword.updateWorldMatrix(true, false);
      const bb = sword.geometry.boundingBox;
      this.base.set(0, bb.min.y + (bb.max.y - bb.min.y) * 0.3, 0).applyMatrix4(sword.matrixWorld);
      this.tip.set(0, bb.max.y, 0).applyMatrix4(sword.matrixWorld);
      this.pts.unshift({ b: this.base.clone(), t: this.tip.clone(), life: 1 });
    }
    for (const p of this.pts) p.life -= dt * 7;
    this.pts = this.pts.filter((p) => p.life > 0).slice(0, this.n);
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[i] || this.pts[this.pts.length - 1];
      const o = i * 6;
      if (!p) { this.alpha[i * 2] = this.alpha[i * 2 + 1] = 0; continue; }
      this.pos.set([p.b.x, p.b.y, p.b.z, p.t.x, p.t.y, p.t.z], o);
      const a = this.pts[i] ? p.life * (1 - i / this.n) * 0.8 : 0;
      this.alpha[i * 2] = a * 0.2; this.alpha[i * 2 + 1] = a;
    }
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }
}

// Fresnel rim light so characters separate from the dark walls.
function rimify(mat, color = [1.0, 0.8, 0.55]) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <dithering_fragment>',
      `float rimF = 1.0 - abs(dot(normalize(normal), normalize(vViewPosition)));
       gl_FragColor.rgb += vec3(${color.map((c) => c.toFixed(2)).join(',')}) * pow(rimF, 2.5) * 0.55;
       #include <dithering_fragment>`);
  };
  mat.customProgramCacheKey = () => 'rim' + color.join(',');
  return mat;
}

// browsers only allow vibration after the player has touched the page
let touched = false;
addEventListener('pointerdown', () => { touched = true; }, { once: true });
function vibrate(ms) { if (!touched || globalThis.AD_NO_VIBRATE) return; try { navigator.vibrate?.(ms); } catch { /* unsupported */ } }

// Slash arcs, impact flashes and floating damage numbers, all pooled.
class CombatFx {
  constructor(group, glowTex) {
    this.group = group;
    this.arcs = [];
    for (let i = 0; i < 4; i++) {
      const mat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        uniforms: { t: { value: 1 }, color: { value: new THREE.Color(1, 0.9, 0.7) } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        // bright leading edge along the arc, fading tail, softened inner/outer rims
        fragmentShader: `uniform float t; uniform vec3 color; varying vec2 vUv;
          void main(){
            float along = vUv.x;                        // 0 = tail, 1 = head of the swing
            float head = smoothstep(t - 0.05, t + 0.35, along) * (1.0 - smoothstep(t + 0.35, t + 0.55, along));
            float tail = smoothstep(0.0, 1.0, along) * (1.0 - t);
            float rim = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.75, 1.0, vUv.y));
            float a = clamp(max(head, tail * 0.6) * rim, 0.0, 1.0) * (1.0 - t * t);
            gl_FragColor = vec4(color * a * 1.05, a * 0.8);
          }`,
      });
      const mesh = new THREE.Mesh(arcGeometry(0.75, 2.05, 2.6), mat);
      mesh.visible = false; mesh.frustumCulled = false;
      group.add(mesh);
      this.arcs.push({ mesh, mat, life: 0 });
    }
    this.stars = [];
    const starTex = starTexture();
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      s.visible = false; group.add(s);
      this.stars.push({ s, life: 0, size: 1 });
    }
    this.nums = [];
    for (let i = 0; i < 10; i++) {
      const c = document.createElement('canvas'); c.width = 128; c.height = 64;
      const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false }));
      s.visible = false; s.renderOrder = 10; group.add(s);
      this.nums.push({ s, c, tex, life: 0, vy: 0 });
    }
    this.ai = this.si = this.ni = 0;
  }

  slash(ev) {
    const a = this.arcs[this.ai++ % this.arcs.length];
    a.life = 1; a.mesh.visible = true;
    const m = a.mesh;
    m.position.set(ev.x, ev.y + 0.95, 0.7);
    m.rotation.set(0, 0, 0); m.scale.setScalar(1);
    const f = ev.facing;
    // arc geometry spans angles -1.3..+1.3 rad around +X; orient it for each swing
    if (ev.dir === 'up') { m.rotation.z = Math.PI / 2; m.scale.set(1, f, 1); }
    else if (ev.dir === 'down') { m.rotation.z = -Math.PI / 2; m.scale.set(1, -f, 1); m.position.y = ev.y + 0.3; }
    else {
      m.scale.set(f, ev.combo === 2 ? -1 : 1, 1);          // 1 swings top→down, 2 bottom→up
      if (ev.finisher) { m.scale.multiplyScalar(1.35); m.rotation.z = f * 0.15; }
    }
    a.mat.uniforms.color.value.set(ev.finisher ? 0xffc070 : 0xfff0d8);
    a.dur = ev.finisher ? 0.2 : 0.14;
  }

  lightning(pts) {
    const pos = [];
    for (let i = 0; i < pts.length - 1; i++) { // jagged segments between targets
      const a = pts[i], b = pts[i + 1];
      let px = a.x, py = a.y;
      for (let k = 1; k <= 6; k++) {
        const t = k / 6, nx = a.x + (b.x - a.x) * t + (k < 6 ? (Math.random() - 0.5) * 0.7 : 0), ny = a.y + (b.y - a.y) * t + (k < 6 ? (Math.random() - 0.5) * 0.7 : 0);
        pos.push(px, py, 0.8, nx, ny, 0.8); px = nx; py = ny;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const line = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xd8f0ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.group.add(line);
    (this.bolts ||= []).push({ line, life: 1 });
  }

  ring(x, y, r, color) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, y, 0.7); this.group.add(m);
    (this.rings ||= []).push({ m, life: 1, r });
  }

  impact(x, y, size, color) {
    const st = this.stars[this.si++ % this.stars.length];
    st.life = 1; st.size = size * 0.65; // restrained: flashes must not hide the fight
     st.s.visible = true;
    st.s.position.set(x, y, 0.9);
    st.s.material.color.setHex(color);
    st.s.material.rotation = Math.random() * Math.PI;
  }

  number(x, y, dmg, crit) {
    const n = this.nums[this.ni++ % this.nums.length];
    const ctx = n.c.getContext('2d');
    ctx.clearRect(0, 0, 128, 64);
    ctx.font = `900 ${crit ? 46 : 38}px Cinzel, Georgia, serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(20,8,4,0.9)';
    const txt = crit ? dmg + '!' : String(dmg);
    ctx.strokeText(txt, 64, 34);
    ctx.fillStyle = crit ? '#ffe066' : '#fff4e6';
    ctx.fillText(txt, 64, 34);
    n.tex.needsUpdate = true;
    n.life = 1; n.vy = 2.4; n.crit = crit; n.s.visible = true;
    n.s.position.set(x, y, 1);
  }

  update(dt) {
    for (const b of this.bolts || []) { b.life -= dt * 5; b.line.material.opacity = Math.max(0, b.life); if (b.life <= 0) { this.group.remove(b.line); b.line.geometry.dispose(); } }
    this.bolts = (this.bolts || []).filter((b) => b.life > 0);
    for (const r of this.rings || []) { r.life -= dt * 3; const k = 1 - Math.max(0, r.life); r.m.scale.setScalar(0.3 + r.r * k); r.m.material.opacity = Math.max(0, r.life); if (r.life <= 0) { this.group.remove(r.m); r.m.geometry.dispose(); } }
    this.rings = (this.rings || []).filter((r) => r.life > 0);
    for (const a of this.arcs) {
      if (!a.mesh.visible) continue;
      a.life -= dt / (a.dur || 0.14);
      a.mat.uniforms.t.value = 1 - Math.max(0, a.life);
      if (a.life <= 0) a.mesh.visible = false;
    }
    for (const st of this.stars) {
      if (!st.s.visible) continue;
      st.life -= dt * 9;
      const k = Math.max(0, st.life);
      st.s.scale.setScalar(st.size * (1.2 - k * 0.6));
      st.s.material.opacity = k;
      if (st.life <= 0) st.s.visible = false;
    }
    for (const n of this.nums) {
      if (!n.s.visible) continue;
      n.life -= dt * 1.5;
      n.vy -= dt * 6;
      n.s.position.y += n.vy * dt;
      const pop = n.life > 0.85 ? 1 + (n.life - 0.85) * 3 : 1;
      const sz = (n.crit ? 1.25 : 0.95) * pop;
      n.s.scale.set(sz, sz * 0.5, 1);
      n.s.material.opacity = Math.min(1, n.life * 2.5);
      if (n.life <= 0) n.s.visible = false;
    }
  }
}

// Ring segment from -span/2..+span/2 around +X; uv.x runs along the swing (tail→head), uv.y inner→outer.
function arcGeometry(r0, r1, span, seg = 24) {
  const pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = i / seg, a = span / 2 - u * span;   // starts high, sweeps down
    const c = Math.cos(a), s = Math.sin(a);
    pos.push(c * r0, s * r0, 0, c * r1, s * r1, 0);
    uv.push(u, 0, u, 1);
    if (i < seg) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function starTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,0.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {           // four long + four short spikes
    const a = (i / 8) * Math.PI * 2, r = i % 2 ? 22 : 64;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
    const b = a + Math.PI / 8; ctx.lineTo(64 + Math.cos(b) * 7, 64 + Math.sin(b) * 7);
  }
  ctx.closePath(); ctx.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Where to start a clip: attacks start just before their measured strike so the blade lands on time;
// jumps skip the ground crouch; dodges skip the wind-up step.
function startFor(name, speed = 1) {
  const s = strike[name];
  if (s) return Math.max(0, s.t - 0.07 * speed) / s.dur;
  if (name === 'jump') return 0.28;
  if (name === 'dodge') return 0.12;
  if (name === 'land') return 0.1;
  return 0;
}
function fadeFor(p) {
  if (p.state === 'attack' || p.state === 'dash') return 0.04;
  if (p.anim === 'jump' || p.anim === 'land') return 0.06;
  return 0.12;
}

// Unity-style SmoothDamp: critically damped spring toward target. vel[key] holds the velocity.
function smoothDamp(cur, target, vel, key, smoothTime, dt) {
  const omega = 2 / Math.max(0.0001, smoothTime);
  const x = omega * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target;
  const temp = (vel[key] + omega * change) * dt;
  vel[key] = (vel[key] - omega * temp) * e;
  return target + (change + temp) * e;
}
