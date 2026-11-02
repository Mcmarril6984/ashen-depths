// Loads the Synty GLBs exported by tools/build_assets.py and shares one atlas material across everything.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { assetUrl, embeddedText } from '../assetUrl.js';

const CHAR_IDS = ['hero', 'skeleton', 'skeleton2', 'dwarf_undead', 'undead_knight', 'demon', 'dwarf_miner', 'dwarf_king', 'skeleton3', 'goblin', 'goblin_shaman', 'rock_golem', 'ghost'];
// characters from the older POLYGON Dungeon Pack use that pack's own texture atlas
const DP_CHARS = new Set(['goblin', 'goblin_shaman', 'rock_golem', 'ghost']);

export const assets = {
  material: null,      // lit atlas material (world + characters)
  bgMaterial: null,    // darker copy for background walls
  pieces: {},          // id -> BufferGeometry (pivot as authored, metres, y up)
  chars: {},           // id -> { scene, bones }
};

// Models ship as glTF JSON with the binary buffer embedded as base64 (JSON is servable everywhere).
// We decode the buffer ourselves and hand GLTFLoader an in-memory GLB, so nothing ever fetches a data: URI —
// strict content-security policies (like the claude.ai Artifact frame) block data: fetches.
async function loadModel(loader, url) {
  let doc;
  const inline = embeddedText(url);
  if (inline) doc = JSON.parse(inline);
  else {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    doc = await res.json();
  }
  let bin = new Uint8Array(0);
  const buf = doc.buffers?.[0];
  if (buf?.uri?.startsWith('data:')) {
    const b64 = buf.uri.slice(buf.uri.indexOf(',') + 1);
    const raw = atob(b64);
    bin = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bin[i] = raw.charCodeAt(i);
    delete buf.uri;
    buf.byteLength = bin.length;
  }
  const glb = packGlb(doc, bin);
  return loader.parseAsync(glb, '');
}

function packGlb(doc, bin) {
  const enc = new TextEncoder();
  let json = enc.encode(JSON.stringify(doc));
  const pad = (n) => (4 - (n % 4)) % 4;
  const jsonLen = json.length + pad(json.length), binLen = bin.length + pad(bin.length);
  const total = 12 + 8 + jsonLen + (bin.length ? 8 + binLen : 0);
  const out = new ArrayBuffer(total), dv = new DataView(out), u8 = new Uint8Array(out);
  dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true); dv.setUint32(16, 0x4e4f534a, true);
  u8.set(json, 20); u8.fill(0x20, 20 + json.length, 20 + jsonLen);
  if (bin.length) {
    const o = 20 + jsonLen;
    dv.setUint32(o, binLen, true); dv.setUint32(o + 4, 0x004e4942, true);
    u8.set(bin, o + 8);
  }
  return out;
}

export async function loadAssets(onProgress = () => {}) {
  const tex = new THREE.TextureLoader();
  const gltf = new GLTFLoader();

  // Every file is wrapped so a failure names the file that broke (shown on the loading screen).
  const named = (url, p) => p.catch((err) => { throw new Error(`${url}: ${err?.message || err}`); });
  const tracked = (url, p) => { total++; return named(url, p).then((v) => { onProgress(++done / total); return v; }); };
  let total = 0, done = 0;
  // On normal web hosts (itch.io) the compact binary .glb files ship instead of the embedded-JSON copies.
  const model = (url) => globalThis.AD_GLB
    ? tracked(url, gltf.loadAsync(url.replace('.gltf.json', '.glb')))
    : tracked(url, loadModel(gltf, url));
  const image = (url) => tracked(url, tex.loadAsync(assetUrl(url)));

  const [atlasDp, atlas, emission, kit, anims, rigRef, ...chars] = await Promise.all([
    image('assets/tex/atlas_dp.png'),
    image('assets/tex/atlas.png'),
    image('assets/tex/emission.png'),
    model('assets/kit.gltf.json'),
    model('assets/anims.gltf.json'),
    model('assets/rig_ref.gltf.json'), // T-pose character on the animation rig = the rig's true rest
    ...CHAR_IDS.map((id) => model(`assets/chars/${id}.gltf.json`)),
  ]);

  assets.atlasDp = atlasDp;
  for (const t of [atlas, emission, atlasDp]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.flipY = false; // glTF UV convention
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 4;
  }
  assets.material = new THREE.MeshLambertMaterial({
    map: atlas, emissiveMap: emission, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.4,
  });
  assets.bgMaterial = new THREE.MeshLambertMaterial({
    map: atlas, emissiveMap: emission, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 1.0,
    color: new THREE.Color(0.22, 0.23, 0.3), // background: darker and cooler than the playfield
  });

  kit.scene.updateMatrixWorld(true);
  kit.scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    g.computeBoundingBox();
    // node names: mesh may be the node itself or a child of a named node
    const id = o.name in assets.pieces ? o.name : (o.parent && o.parent !== kit.scene ? o.parent.name : o.name);
    assets.pieces[id] = g;
  });

  buildWeaponPieces();

  CHAR_IDS.forEach((id, i) => {
    const scene = chars[i].scene;
    scene.traverse((o) => {
      if (o.isMesh) { o.material = assets.material; o.frustumCulled = false; o.castShadow = false; }
    });
    // The Synty animation rig and the Dungeon Realms characters share bone names but not bone axes,
    // so every clip is retargeted in world space onto each character's own rest pose.
    scene.traverse((o) => { if (o.isBone) o.userData.rest = { p: o.position.clone(), q: o.quaternion.clone() }; });
    const clips = {};
    for (const clip of anims.animations) clips[clip.name] = retargetClip(anims.scene, rigRef.scene, scene, clip);
    assets.chars[id] = { scene, clips, map: DP_CHARS.has(id) ? atlasDp : atlas };
  });
  measureStrikes();
  return assets;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3();

function boneMap(root) {
  const map = {}, order = [];
  root.traverse((o) => { if (o.isBone) { map[o.name] = o; order.push(o); } });
  return { map, order };
}

function retargetClip(srcRoot, refRoot, dstRoot, clip) {
  const S = boneMap(srcRoot), D = boneMap(dstRoot), R = boneMap(refRoot);
  srcRoot.updateMatrixWorld(true);
  refRoot.updateMatrixWorld(true);
  dstRoot.updateMatrixWorld(true);
  // rest snapshots
  const srcRestLocal = new Map(S.order.map((b) => [b, { q: b.quaternion.clone(), p: b.position.clone() }]));
  // rest orientation of each source bone, taken from the T-posed reference character on the same rig
  const srcRestWorldInv = new Map(S.order.map((b) => [b.name, (R.map[b.name] || b).getWorldQuaternion(new THREE.Quaternion()).invert()]));
  const dstRestWorld = new Map(D.order.map((b) => [b.name, b.getWorldQuaternion(new THREE.Quaternion())]));
  const tracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion') || t.name.endsWith('.position'));
  let times = [];
  for (const t of tracks) if (t.times.length > times.length) times = Array.from(t.times);
  if (!times.length) times = [0];
  const interps = tracks.map((t) => {
    const [bone, prop] = t.name.split('.');
    return { bone: S.map[bone], prop, it: t.createInterpolant() };
  }).filter((x) => x.bone);

  const outQ = new Map(D.order.map((b) => [b.name, []]));
  let hipsRef = null;
  const hipsPos = [];
  const dstWorld = new Map();
  const dstParentWorldQ = (b) => {
    const p = b.parent;
    if (dstWorld.has(p?.name) && p.isBone) return dstWorld.get(p.name).clone(); // copy: callers mutate it
    return p ? p.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
  };
  for (const time of times) {
    for (const { bone, prop, it } of interps) {
      const v = it.evaluate(time);
      if (prop === 'quaternion') bone.quaternion.set(v[0], v[1], v[2], v[3]);
      else if (prop === 'position' && bone.name === 'Hips') bone.position.set(v[0], v[1], v[2]);
    }
    srcRoot.updateMatrixWorld(true);
    dstWorld.clear();
    for (const b of D.order) {
      const sb = S.map[b.name];
      let w;
      if (sb) {
        // world delta from the source rest, applied on top of the destination rest
        w = sb.getWorldQuaternion(new THREE.Quaternion()).multiply(srcRestWorldInv.get(b.name)).multiply(dstRestWorld.get(b.name));
      } else {
        w = dstParentWorldQ(b).multiply(b.quaternion);
      }
      dstWorld.set(b.name, w);
      const local = dstParentWorldQ(b).invert().multiply(w);
      outQ.get(b.name).push(local.x, local.y, local.z, local.w);
    }
    // hips height/bob: same offset from rest in the hips' parent space
    const sh = S.map.Hips, dh = D.map.Hips;
    if (sh && dh && !hipsRef) {
      const rw = (R.map.Hips || sh).getWorldPosition(new THREE.Vector3()), dw = dh.getWorldPosition(new THREE.Vector3());
      hipsRef = { rw, dw, ratio: dw.y / Math.max(0.01, rw.y) };
    }
    if (sh && dh) {
      // world-space offset from the reference rest, scaled to this character's hip height
      _v.copy(sh.getWorldPosition(new THREE.Vector3())).sub(hipsRef.rw).multiplyScalar(hipsRef.ratio).add(hipsRef.dw);
      dh.parent.worldToLocal(_v);
      hipsPos.push(_v.x, _v.y, _v.z);
    }
  }
  // restore the source rig
  for (const [b, r] of srcRestLocal) { b.quaternion.copy(r.q); b.position.copy(r.p); }
  srcRoot.updateMatrixWorld(true);

  const out = [];
  for (const b of D.order) {
    if (b.name === 'Root') continue;
    out.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, outQ.get(b.name)));
  }
  if (hipsPos.length) out.push(new THREE.VectorKeyframeTrack('Hips.position', times, hipsPos));
  return new THREE.AnimationClip(clip.name, clip.duration, out);
}

export function pieceSize(id) {
  const bb = assets.pieces[id].boundingBox;
  return bb.getSize(new THREE.Vector3());
}

// A posable character: clone of a Synty character with its own mixer and named actions.
export function makeCharacter(id) {
  const root = SkeletonUtils.clone(assets.chars[id].scene);
  const bones = {};
  root.traverse((o) => { if (o.isBone) bones[o.name] = o; });
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [name, clip] of Object.entries(assets.chars[id].clips)) actions[name] = mixer.clipAction(clip);
  return { root, bones, mixer, actions, current: null };
}

// Attach a kit piece (weapon etc.) to a bone.
export function attachPiece(ch, boneName, pieceId, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) {
  const bone = ch.bones[boneName];
  if (!bone || !assets.pieces[pieceId]) return null;
  const m = new THREE.Mesh(assets.pieces[pieceId], assets.material);
  m.position.set(...pos);
  m.rotation.set(...rot);
  // bones live under an armature scaled 0.01 → compensate so the piece keeps metre scale
  const ws = new THREE.Vector3();
  bone.updateWorldMatrix(true, false);
  bone.getWorldScale(ws);
  m.scale.setScalar(scale / (ws.x || 1));
  m.frustumCulled = false;
  bone.add(m);
  return m;
}

const ONE_SHOT = new Set(['attack1', 'attack2', 'attack3', 'heavy1', 'heavy2', 'heavy3', 'stab', 'leap', 'flourish_attack',
  'fencing', 'dodge', 'roll', 'hurt', 'stagger', 'death', 'death_f', 'land', 'jump', 'knockdown']);

// Cross-fade to an animation. speed scales playback; restart forces replay of a one-shot.
export function playAnim(ch, name, { fade = 0.12, speed = 1, restart = false, from = 0 } = {}) {
  const next = ch.actions[name];
  if (!next) return;
  if (ch.current === name && !restart) { next.timeScale = speed; return; }
  const prev = ch.current ? ch.actions[ch.current] : null;
  next.reset();
  next.time = from * next.getClip().duration; // skip slow wind-ups so hits land on the button press
  next.timeScale = speed;
  if (ONE_SHOT.has(name)) { next.setLoop(THREE.LoopOnce, 1); next.clampWhenFinished = true; }
  else next.setLoop(THREE.LoopRepeat, Infinity);
  next.play();
  if (prev && prev !== next) prev.crossFadeTo(next, fade, false);
  ch.current = name;
}

// For each attack clip, find when the sword hand moves fastest: that's the visual moment of impact.
// The game starts attack clips just before it so the blade connects on the frame the hit registers.
export const strike = {};
const PREROLL_CLIPS = ['attack1', 'attack2', 'attack3', 'heavy1', 'heavy2', 'heavy3', 'stab', 'leap', 'flourish_attack', 'fencing'];
function measureStrikes() {
  const ch = makeCharacter('hero');
  const hand = ch.bones.Hand_R, p0 = new THREE.Vector3(), p1 = new THREE.Vector3();
  for (const name of PREROLL_CLIPS) {
    const a = ch.actions[name]; if (!a) continue;
    const dur = a.getClip().duration;
    ch.mixer.stopAllAction(); a.reset().play();
    let best = 0, bestT = dur * 0.4;
    ch.mixer.setTime(0); ch.root.updateMatrixWorld(true); hand.getWorldPosition(p0);
    for (let i = 1; i <= 40; i++) {
      const t = (i / 40) * dur * 0.85;
      ch.mixer.setTime(t); ch.root.updateMatrixWorld(true); hand.getWorldPosition(p1);
      const v = p1.distanceTo(p0); if (v > best) { best = v; bestT = t; }
      p0.copy(p1);
    }
    strike[name] = { t: bestT, dur };
  }
}

// Attach a piece authored in the character's model space (e.g. wings): at rest it sits exactly where it was
// modelled, then it follows the bone. Returns a pivot group whose local axes match the character's axes.
export function attachInModelSpace(ch, boneName, pieceId, { pos = [0, 0, 0], scale = 1 } = {}) {
  const bone = ch.bones[boneName];
  if (!bone || !assets.pieces[pieceId]) return null;
  const savedPos = ch.root.position.clone(), savedRot = ch.root.rotation.clone(), savedScale = ch.root.scale.clone();
  ch.root.position.set(0, 0, 0); ch.root.rotation.set(0, 0, 0); ch.root.scale.set(1, 1, 1);
  ch.mixer.stopAllAction();
  // userData is deep-copied as plain JSON when characters are cloned, so read fields explicitly
  ch.root.traverse((o) => {
    const r = o.isBone && o.userData.rest; if (!r) return;
    o.position.set(r.p.x, r.p.y, r.p.z);
    if (Array.isArray(r.q)) o.quaternion.fromArray(r.q); else o.quaternion.set(r.q._x ?? r.q.x, r.q._y ?? r.q.y, r.q._z ?? r.q.z, r.q._w ?? r.q.w);
  });
  ch.root.updateMatrixWorld(true);
  const pivot = new THREE.Group();
  const m = new THREE.Matrix4().copy(bone.matrixWorld).invert()
    .multiply(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion(), new THREE.Vector3(scale, scale, scale)));
  m.decompose(pivot.position, pivot.quaternion, pivot.scale);
  const mesh = new THREE.Mesh(assets.pieces[pieceId], assets.material);
  mesh.frustumCulled = false;
  pivot.add(mesh);
  bone.add(pivot);
  ch.root.position.copy(savedPos); ch.root.rotation.copy(savedRot); ch.root.scale.copy(savedScale);
  return mesh; // rotate this (character-space axes) to flap
}

// Weapons the kit doesn't have (scythe, sickle, bow, rapier, gauntlet), built from primitives in the kit's
// sword space: grip at the origin, blade up +Y, flat in the YZ plane. Colours come from texels of the sword.
function buildWeaponPieces() {
  const sw = assets.pieces.sword; if (!sw) return;
  const pos = sw.attributes.position, uv = sw.attributes.uv;
  let hi = 0, lo = 0;
  for (let i = 0; i < pos.count; i++) { if (pos.getY(i) > pos.getY(hi)) hi = i; if (pos.getY(i) < pos.getY(lo)) lo = i; }
  const steel = [uv.getX(hi), uv.getY(hi)], grip = [uv.getX(lo), uv.getY(lo)];
  const paint = (g, t) => { g = g.index ? g.toNonIndexed() : g; const a = new Float32Array(g.attributes.position.count * 2); for (let i = 0; i < a.length; i += 2) { a[i] = t[0]; a[i + 1] = t[1]; } g.setAttribute('uv', new THREE.BufferAttribute(a, 2)); g.deleteAttribute('normal'); g.computeVertexNormals(); return g; };
  const merge = (parts) => { // tiny merge: positions + uvs + normals of non-indexed parts
    const n = parts.reduce((s, g) => s + g.attributes.position.count, 0), P = new Float32Array(n * 3), U = new Float32Array(n * 2), N = new Float32Array(n * 3);
    let o = 0; for (const g of parts) { P.set(g.attributes.position.array, o * 3); U.set(g.attributes.uv.array, o * 2); N.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.BufferAttribute(U, 2)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.computeBoundingBox(); return g;
  };
  const cyl = (r, y0, y1, t, seg = 6) => paint(new THREE.CylinderGeometry(r, r, y1 - y0, seg).translate(0, (y0 + y1) / 2, 0), t);
  // crescent blade in the YZ plane: outer arc minus inner arc, extruded thin along X
  const crescent = (R, thick, a0, a1, cx, cy, t) => {
    const sh = new THREE.Shape(), steps = 14;
    for (let i = 0; i <= steps; i++) { const a = a0 + (a1 - a0) * i / steps; const p = [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; i ? sh.lineTo(...p) : sh.moveTo(...p); }
    for (let i = steps; i >= 0; i--) { const a = a0 + (a1 - a0) * i / steps, r = R - thick * Math.sin(Math.PI * i / steps); sh.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    return paint(new THREE.ExtrudeGeometry(sh, { depth: 0.02, bevelEnabled: false }).translate(0, 0, -0.01).rotateY(Math.PI / 2), t);
  };
  assets.pieces.scythe = merge([cyl(0.025, -0.45, 1.25, grip), crescent(0.62, 0.16, Math.PI * 0.5, Math.PI * 1.05, 0, 0.62, steel)]);
  assets.pieces.sickle = merge([cyl(0.022, -0.12, 0.28, grip), crescent(0.3, 0.09, Math.PI * 0.35, Math.PI * 1.2, 0, 0.2, steel)]);
  assets.pieces.rapier = merge([cyl(0.022, -0.16, 0.0, grip), paint(new THREE.TorusGeometry(0.07, 0.012, 4, 10).rotateY(Math.PI / 2), steel), paint(new THREE.ConeGeometry(0.018, 1.05, 4).translate(0, 0.53, 0), steel)]);
  assets.pieces.bow = merge([paint(new THREE.TorusGeometry(0.62, 0.028, 5, 18, Math.PI * 0.8).rotateZ(Math.PI * 0.1).rotateY(Math.PI / 2).translate(0, 0, 0.52), grip),
    cyl(0.006, -0.36, 0.36, steel, 3), cyl(0.03, -0.08, 0.08, grip)]);
  assets.pieces.gauntlet = merge([paint(new THREE.DodecahedronGeometry(0.11, 0).scale(1, 1.2, 1.1).translate(0, 0.05, 0), steel), cyl(0.07, -0.18, -0.02, grip)]);
  for (const k of ['scythe', 'sickle', 'rapier', 'bow', 'gauntlet']) assets.pieces[k].computeBoundingBox();
}
