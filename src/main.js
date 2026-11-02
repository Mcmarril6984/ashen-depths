// Boot, game loop and run flow: title → floors → shrine choices → death / victory.
import { loadAssets } from './render/assets.js';
import { View } from './render/view.js';
import { createInput } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { createWorld, updateWorld } from './game/world.js';
import { makeStats, rollChoices, applyUpgrade, dropUpgrade, UPGRADES, WEAPONS, rollShop, equipWeapon } from './game/upgrades.js';
import { slotOf, regularSlots, blessingDef } from './game/blessings.js';
import { updateEvolution, EVOLUTIONS } from './game/weapons.js';
import { makeRng } from './game/rng.js';
import { unlockAudio, sfx, toggleMute, isMuted, setCombo } from './audio.js';
import * as META from './game/meta.js';
import { normalizeMeta, sanitizeLoadout, allowedBlessings, allowedWeapons, allowedItems, vowMods, recordRun, isUnlocked, UNLOCKS } from './game/meta.js';
import { itemDef } from './game/items.js';
import { generateTutorial } from './game/level/tutorial.js';
import { Tips } from './ui/tips.js';
import { MapView } from './ui/minimap.js';
import { Hearth } from './ui/hearth.js';

const $ = (s) => document.querySelector(s);
const LAST_FLOOR = 20;
const BIOME_NAMES = { halls: 'The Dwarven Halls', forge: 'The Forge', crypt: 'The Sunken Crypt', hell: 'The Hell Gate' };
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];
const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const DEV = params.has('dev');

let meta = normalizeMeta(loadSave()); // persistent progression (ember, unlocks, loadout, records)
let view, input, hud, world, hearth, tips, mapView, run = null;
let pauseTab = 'map';
let pauseOpenedAt = 0;
const settings = loadSettings();
let lastMenu = 'title';
let state = 'loading';
let acc = 0, lastT = 0, deadTimer = 0;

if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('coarse');

// Scale on-screen controls to the device: 1 on ordinary phones (whose layout is tuned by CSS), larger on
// big phones, foldables and tablets, capped so the button cluster never takes more than ~40% of the width.
function fitUi() {
  const W = innerWidth, H = innerHeight;
  const ui = H <= 460 ? 1 : Math.max(1, Math.min(1.4, H / 560, (W * 0.4) / 320));
  document.documentElement.style.setProperty('--ui', ui.toFixed(3));
}
fitUi();
addEventListener('resize', fitUi);
addEventListener('orientationchange', () => setTimeout(fitUi, 300));

boot();

async function boot() {
  try {
    window.__booted = true; // the code loaded; from here asset errors are shown by the catch below
    await loadAssets((f) => { window.__loadingProgress = f; $('#loadbar div').style.width = Math.round(f * 100) + '%'; });
  } catch (err) {
    $('#loading p').textContent = 'Could not load the game files (' + err.message + '). Check your connection and tap Reload.';
    const rb = $('#reloadbtn'); rb.classList.remove('hidden'); rb.onclick = () => location.replace(location.pathname + '?fresh=' + Date.now());
    throw err;
  }
  view = new View($('#game'));
  view.weaponList = WEAPONS;
  view.blessingIcon = (id) => blessingDef(id)?.icon;
  view.itemIcon = (id) => itemDef(id)?.icon;
  view.itemPiece = (id) => itemDef(id)?.piece;
  // Synty prop renders as icons for items (falls back to the emoji when an item has no prop)
  const itemPic = (id) => { const d = itemDef(id); return d?.piece ? view.pieceIcon(d.piece) : null; };
  window.__itemIconHtml = (id) => { const pic = itemPic(id); return pic ? `<img class="pic" src="${pic}" alt="">` : null; };
  // Any blessing, item or weapon id → its Synty prop icon (<img>), or null if it has none.
  window.__iconHtml = (id, cls = 'pic') => {
    const d = blessingDef(id) || itemDef(id) || WEAPONS.find((w) => w.id === id);
    const pic = d?.piece ? view.pieceIcon(d.piece) : null;
    return pic ? `<img class="${cls}" src="${pic}" alt="">` : null;
  };
  view.blessingPic = (id) => { const d = blessingDef(id); return d?.piece ? view.pieceIcon(d.piece) : null; };
  view.touchUI = matchMedia('(pointer: coarse)').matches;
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') view.touchUI = true; });
  input = createInput(document.body);
  hud = new Hud();
  wireUi();
  hearth = new Hearth($('#hearth'), { getMeta: () => meta, setMeta: (m) => { meta = m; writeSave(); updateTitleMeta(); }, onClose: () => setState(lastMenu), onStart: () => newRun(), sfx });
  hearth.iconHtml = (id) => window.__iconHtml?.(id);
  hud.weaponName = (id) => WEAPONS.find((w) => w.id === id)?.name || id;
  hud.itemDef = itemDef;
  hud.blessingHtml = (ids) => ids.split(',').filter(Boolean).map((id) => window.__iconHtml?.(id, 'mini') || UPGRADES.find((u) => u.id === id)?.icon || '').join('');
  hud.itemPic = (id) => { const d = itemDef(id); return d?.piece ? view.pieceIcon(d.piece) : null; };
  tips = new Tips($('#tip'), () => input.touch || matchMedia('(pointer: coarse)').matches);
  mapView = new MapView($('#minimap'), $('#fullmap'));
  applySettings();
  $('#loading').classList.add('hidden');
  if (params.has('tutorial')) startTutorial();
  else if (params.has('autostart')) newRun(Number(params.get('seed')) || undefined);
  else showTitle();
  requestAnimationFrame(loop);
}

function wireUi() {
  const tap = (sel, fn) => $(sel).addEventListener('click', (e) => { unlockAudio(); sfx('select'); fn(e); });
  tap('#startbtn', () => (meta.tutorialDone ? newRun() : startTutorial()));
  tap('#tutorialbtn', () => startTutorial());
  tap('#retrybtn', () => newRun());
  tap('#againbtn', () => newRun());
  for (const id of ['#hearthbtn', '#deadhearth', '#winhearth']) tap(id, () => openHearth());
  tap('#shrinereroll', () => rerollShrine());
  tap('#shopreroll', () => rerollShop());
  tap('#resumebtn', () => setState('play'));
  tap('#abandon', () => { die(true); });
  tap('#portraitok', () => document.body.classList.add('portrait-ok'));
  tap('#fsbtn', () => goFullscreen());
  const mute = () => { const m = toggleMute(); $('#mutebtn').textContent = 'Sound: ' + (m ? 'off' : 'on'); };
  tap('#mutebtn', mute);
  $('#mutebtn').textContent = 'Sound: ' + (isMuted() ? 'off' : 'on');
  tap('#quittitle', () => { finishRun(false); tips.hide(); showTitle(); });
  // Quit from the pause header: first tap arms it, second tap within 3s ends the run and returns to the title.
  const quitBtn = $('#quitbtn');
  const disarmQuit = () => { clearTimeout(disarmQuit.t); quitBtn.classList.remove('armed'); quitBtn.textContent = 'Quit'; };
  tap('#quitbtn', () => {
    if (performance.now() - pauseOpenedAt < 450) return; // the tap that opened the menu also fires a stray click here
    if (!quitBtn.classList.contains('armed')) {
      quitBtn.classList.add('armed'); quitBtn.textContent = 'Tap again to quit';
      disarmQuit.t = setTimeout(disarmQuit, 3000);
      return;
    }
    disarmQuit(); finishRun(false); tips.hide(); showTitle();
  });
  quitBtn.disarm = disarmQuit;
  for (const b of document.querySelectorAll('#ptabs .tab')) b.addEventListener('click', () => { sfx('select'); renderPause(b.dataset.ptab); });
  $('#minimap').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (state === 'play') { setState('pause'); renderPause('map'); } });
  $('#pausebtn').addEventListener('pointerdown', (e) => { e.stopPropagation(); if (state === 'play') setState('pause'); });
  tap('#leaveshop', () => setState('play'));
  tap('#refill', () => {
    const p = world.player;
    if (p.gold >= 20 && p.flask < p.stats.flaskCharges) { p.gold -= 20; p.flask = p.stats.flaskCharges; sfx('heal'); updateRefill(); }
  });
  addEventListener('keydown', (e) => {
    if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') setState('pause'); else if (state === 'pause') setState('play'); }
    if (e.code === 'F3' || (DEV && e.code === 'KeyB')) { view.debug = !view.debug; if (!view.debug) view.debugGroup?.clear(); }
    if (DEV && e.code === 'KeyN' && state === 'play') nextFloor();
    if (state === 'choice' && /^Digit[123]$/.test(e.code)) $('#choice .cards').children[+e.code.slice(-1) - 1]?.click();
    if ((state === 'title' || state === 'dead' || state === 'victory') && (e.code === 'Enter' || e.code === 'Space')) { unlockAudio(); newRun(); }
    if (state === 'hearth' && e.code === 'Escape') setState(lastMenu);
  });
  // first touch anywhere unlocks audio on iOS
  addEventListener('pointerdown', () => unlockAudio(), { once: true });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play' && !DEV) setState('pause'); }); // dev links keep running for automated checks
  const touch = matchMedia('(pointer: coarse)').matches;
  $('#ctlhelp').innerHTML = touch
    ? '<b>Left thumb</b> move · <b>Right</b> attack, jump, dash · <b>hold attack</b> for a heavy strike<br>Hold up/down while attacking to slash up/down · down-slash bounces off enemies'
    : '<b>A/D</b> move · <b>Space</b> jump · <b>J</b> attack (hold: heavy) · <b>L/Shift</b> dash · <b>I</b>/<b>O</b> items · <b>H</b> heal · <b>W/E</b> interact<br>Hold W/S while attacking to slash up/down · down-slash bounces off enemies · gamepad works too';
  updateTitleMeta();
  if (isStandaloneApp()) $('#fsbtn').classList.add('hidden'); // already running full screen from the home screen
}

function updateTitleMeta() {
  const affordable = UNLOCKS.filter((u) => !isUnlocked(meta, u.id) && u.cost <= meta.ember && u.cost > 0).length;
  $('#meta').textContent = meta.runs ? `Ember ${meta.ember} · Best floor ${meta.best} · Victories ${meta.wins}` : '';
  $('#hearthbtn').innerHTML = 'The Hearth' + (affordable ? ` <i class="dot">${affordable}</i>` : '');
}

function openHearth(tab) {
  if (state === 'title' || state === 'dead' || state === 'victory') lastMenu = state;
  setState('hearth');
  hearth.open(tab);
}

// Real full screen where the browser allows it; iPhones only allow it for home-screen apps, so explain that instead.
function goFullscreen() {
  const el = document.documentElement;
  const req = el.requestFullscreen || el.webkitRequestFullscreen;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const help = () => tips.show({ title: 'Full screen', ms: 7000, text: ios
    ? 'On iPhone: tap Share, then "Add to Home Screen". Open Ashen Depths from your home screen and it runs full screen like an app.'
    : 'This page is not allowed to go full screen here. Open the game in its own browser tab, or install it from the browser menu ("Add to Home screen").' });
  if (!req || ios) return help();
  try {
    Promise.resolve(req.call(el, { navigationUI: 'hide' }))
      .then(() => screen.orientation?.lock?.('landscape').catch(() => {}))
      .catch(help);
  } catch { help(); }
}
const isStandaloneApp = () => matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;

function showTitle() {
  setState('title');
  // a live floor behind the title
  run = { seed: 1234, depth: 1, stats: makeStats(), owned: {} };
  world = createWorld({ seed: 1234, depth: 1, stats: run.stats });
  view.buildWorld(world);
}

function setState(s) {
  state = s;
  for (const id of ['title', 'choice', 'pause', 'dead', 'victory', 'shop', 'hearth']) $('#' + id).classList.toggle('hidden', id !== s);
  hud?.show(s === 'play' || s === 'choice' || s === 'shop' || s === 'transition');
  document.body.classList.toggle('playing', s === 'play' || s === 'transition');
  $('#quitbtn')?.disarm?.();
  if (s === 'pause') pauseOpenedAt = performance.now();
  if (s === 'pause') renderPause(pauseTab);
  input?.clear();
}

function newRun(seed) {
  const lo = sanitizeLoadout(meta);
  const mods = vowMods(lo.vows);
  run = { seed: seed ?? (Math.random() * 1e9) | 0, depth: 1, stats: makeStats(), owned: {}, kills: 0, time: 0,
    vows: lo.vows, mods, killsByType: {}, allowed: { blessings: allowedBlessings(meta), weapons: allowedWeapons(meta), items: allowedItems(meta) } };
  run.rng = makeRng(run.seed ^ 0x5bd1e995);
  equipWeapon(run.stats, lo.weapon);
  run.stats.flaskType = lo.flask;
  run.stats.items = [lo.item || null, null];
  if (mods.noFlask) run.stats.flaskCharges = 0;
  if (mods.maxHp) run.stats.maxHp = mods.maxHp;
  run.bossesBeaten = [];
  if (lo.startBiome && META.startDepth) run.depth = META.startDepth(lo.startBiome); // biome start unlocked by beating its predecessor's boss
  if (DEV && params.get('depth')) run.depth = Math.max(1, Math.min(LAST_FLOOR, +params.get('depth'))); // dev: jump to a floor
  startFloor(null);
}

function startFloor(carry) {
  world = createWorld({ seed: run.seed, depth: run.depth, stats: run.stats, carry, mods: run.mods, allowedWeapons: run.allowed.weapons, allowedItems: run.allowed.items });
  world.onShrine = openShrine;
  world.onExit = nextFloor;
  world.onVictory = victory;
  world.onShop = openShop;
  world.onRelic = takeRelic;
  view.buildWorld(world);
  hud.reset();
  mapView.reset(world);
  world.isLastFloor = run.tutorial ? true : run.depth >= LAST_FLOOR;
  if (run.tutorial) { world.onVictory = finishTutorial; world.onExit = finishTutorial; }
  const biome = BIOME_NAMES[world.level.biome] || '';
  const sub = run.tutorial ? 'Before the descent' : `Floor ${ROMAN[run.depth] || run.depth} · ${biome}`;
  const main = run.tutorial ? 'The Threshold' : world.level.floorName || biome;
  hud.setDepth(run.tutorial ? 'THRESHOLD' : `FLOOR ${ROMAN[run.depth] || run.depth}`);
  setState('play');
  fade(false);
  setTimeout(() => hud.banner(sub, main, 2600), 250);
  if (world.enemies.some((e) => e.boss)) setTimeout(() => sfx('boss'), 600);
  window.__game = { world, view, run, mapView, state: () => state };
}

// First-run tutorial floor: one lesson per room, prompts match the player's device.
function startTutorial() {
  run = { seed: 7, depth: 1, stats: makeStats(), owned: {}, kills: 0, vows: [], mods: {}, killsByType: {}, bossesBeaten: [], tutorial: true,
    allowed: { blessings: allowedBlessings(meta), weapons: allowedWeapons(meta) } };
  run.rng = makeRng(99);
  run.stats.items = ['cinder_flask', null]; // the tutorial hands you a flask to try
  world = createWorld({ seed: 7, depth: 1, stats: run.stats, level: generateTutorial() });
  world.onShrine = openShrine; world.onShop = openShop;
  view.buildWorld(world);
  hud.reset();
  mapView.reset(world);
  startFloorCommon();
}
function startFloorCommon() {
  world.isLastFloor = true;
  world.onVictory = finishTutorial; world.onExit = finishTutorial;
  hud.setDepth('THE THRESHOLD');
  setState('play'); fade(false);
  setTimeout(() => hud.banner('Before the descent', 'The Threshold', 2600), 250);
  window.__game = { world, view, run, mapView, state: () => state };
}
function finishTutorial() {
  meta.tutorialDone = true; writeSave();
  tips.hide();
  fade(true);
  setTimeout(() => newRun(), 600);
}

function nextFloor() {
  if (state !== 'play') return;
  sfx('door');
  setState('transition');
  fade(true);
  const p = world.player;
  const carry = { hp: p.hp, flask: p.flask, gold: p.gold, kills: p.kills };
  run.bossesBeaten.push(...(world.bossesBeaten || []));
  setTimeout(() => { run.depth++; startFloor(carry); }, 500);
}

function openShrine() {
  setState('choice');
  sfx('shrine');
  renderShrine(run.shrineChoices = rollChoices(run.rng, run.owned, 3, run.stats, run.allowed, run.depth));
  run.shrineRerolled = false;
  $('#shrinereroll').classList.toggle('hidden', !isUnlocked(meta, 'shrine_reroll'));
  updateRefill();
}

function rerollShrine() {
  if (run.shrineRerolled) return;
  run.shrineRerolled = true;
  $('#shrinereroll').classList.add('hidden');
  renderShrine(run.shrineChoices = rollChoices(run.rng, run.owned, 3, run.stats, run.allowed, run.depth));
}

function renderShrine(choices) {
  const box = $('#choice .cards');
  box.innerHTML = '';
  setChoiceHeader('Shrine of embers', 'Choose a blessing');
  for (const u of choices) {
    const c = document.createElement('div');
    c.className = 'card ' + u.rarity;
    c.innerHTML = blessingCard(u);
    c.addEventListener('click', () => takeBlessing(u.id, () => { setState('play'); hud.banner(CAT_NAME[u.cat] || 'Blessing', u.name, 1500); }, () => renderShrine(choices)));
    box.appendChild(c);
  }
}

// Merchant: four offers per floor (heal, a weapon, two blessings), bought with gold.
function openShop(merchant) {
  world.prompt = null;
  setState('shop');
  sfx('chest');
  merchant.offers ||= rollShop(run.rng, run.owned, run.stats, run.depth, run.allowed).map((o) => ({ ...o, sold: false }));
  $('#shopreroll').classList.toggle('hidden', !isUnlocked(meta, 'merchant_reroll') || merchant.rerolled);
  run.merchant = merchant;
  renderShop(merchant);
}
function rerollShop() {
  const m = run.merchant;
  if (!m || m.rerolled) return;
  m.rerolled = true;
  m.offers = rollShop(run.rng, run.owned, run.stats, run.depth, run.allowed).map((o) => ({ ...o, sold: false }));
  $('#shopreroll').classList.add('hidden');
  renderShop(m);
}

function renderShop(merchant) {
  const p = world.player, box = $('#shop .cards');
  $('#shopgold').textContent = p.gold;
  box.innerHTML = '';
  for (const o of merchant.offers) {
    const c = document.createElement('div');
    const afford = p.gold >= o.price && !o.sold;
    const rarity = o.kind === 'item' ? (itemDef(o.id)?.rarity || 'common') : o.kind === 'weapon' ? (WEAPONS.find((x) => x.id === o.id)?.rarity || 'common') : (UPGRADES.find((x) => x.id === o.id)?.rarity || 'common');
    c.className = 'card ' + rarity + (afford ? '' : ' poor');
    const tag = o.kind === 'weapon' ? 'Weapon' : o.kind === 'heal' ? 'Provision' : o.kind === 'item' ? 'Item' : 'Blessing';
    c.innerHTML = `<div class="icon">${window.__iconHtml?.(o.id) || o.icon || '✦'}</div><div class="name">${o.name}</div><div class="desc">${o.desc}</div>` +
      `<div class="rar">${tag}</div><div class="price">${o.sold ? 'Sold' : o.price + ' gold'}</div>`;
    c.addEventListener('click', () => {
      if (o.sold || p.gold < o.price) { sfx('block'); return; }
      const pay = () => { p.gold -= o.price; o.sold = true; sfx('heal'); hud.banner(tag, o.name, 1200); setState('shop'); renderShop(merchant); };
      if (o.kind === 'heal') { p.hp = Math.min(p.stats.maxHp, p.hp + 3); pay(); }
      else if (o.kind === 'weapon') { equipWeapon(run.stats, o.id); pay(); }
      else if (o.kind === 'item') { // into an empty slot, else replacing slot 2
        const items = run.stats.items ||= [null, null], free = items.indexOf(null);
        items[free < 0 ? 1 : free] = o.id; p.itemCd[free < 0 ? 1 : free] = 0; pay(); }
      else takeBlessing(o.id, pay, () => { setState('shop'); renderShop(merchant); });
    });
    box.appendChild(c);
  }
}

// ---- blessing slots and relics (3.1) ----------------------------------------------------------------
// 6 regular slots (7 with Fragile Divinity), 1 legendary, 1 cursed. A new legendary/cursed blessing replaces the
// old one automatically; a new regular one with full slots asks which to drop. Dropped blessings become relics
// on the floor that can be swapped back in.
const CAT_NAME = { offense: 'Offensive blessing', movement: 'Movement blessing', defense: 'Defensive blessing', cursed: 'Cursed blessing', legendary: 'Legendary blessing' };
function blessingCard(u) {
  return `<div class="icon">${window.__iconHtml?.(u.id) || u.icon}</div><div class="name">${u.name}</div><div class="desc">${u.desc}</div><div class="rar">${CAT_NAME[u.cat] || u.rarity}</div>`;
}
function setChoiceHeader(tag, title) { $('#choice .tag').textContent = tag; $('#choice h2').textContent = title; }
function grantBlessing(id) {
  const p = world.player, before = { ...run.stats };
  applyUpgrade(run.stats, id); run.owned[id] = 1;
  if (run.stats.dashes > before.dashes) p.dashLeft = run.stats.dashes;
  if (run.stats.maxHp > before.maxHp) p.hp += run.stats.maxHp - before.maxHp;
  p.hp = Math.min(p.hp, run.stats.maxHp);
  sfx('heal');
  checkEvolution();
}
// Weapon evolutions switch on when the weapon's two blessings are held, and off while one is out of its slot.
function checkEvolution() {
  const was = run.stats.evolved, evo = updateEvolution(run.stats);
  if (evo) { setTimeout(() => { hud.banner('Your weapon evolves', evo.name, 2400); sfx('boss'); world.events.push({ t: 'nova', x: world.player.x, y: world.player.y + 1, r: 3.5, color: 0xffc070 }); }, 900); }
  else if (was && !run.stats.evolved) setTimeout(() => hud.banner('Evolution lost', EVOLUTIONS.find((e) => e.id === was)?.name || '', 1600), 900);
}
function dropBlessing(id) {
  const p = world.player;
  dropUpgrade(run.stats, id); delete run.owned[id];
  p.hp = Math.min(p.hp, run.stats.maxHp);
  (world.relics ||= []).push({ x: p.x - p.facing * 1.2, y: p.y, id, t: 0 });
  checkEvolution();
  world.events.push({ t: 'relicdrop', x: p.x - p.facing * 1.2, y: p.y });
}
function takeBlessing(id, onDone, onCancel) {
  const slot = slotOf(id), owned = Object.keys(run.stats.bless || {});
  if (slot !== 'regular') {
    const old = owned.find((o) => slotOf(o) === slot);
    if (old) { dropBlessing(old); setTimeout(() => hud.banner('Left as a relic', blessingDef(old).name, 1600), 1600); }
    grantBlessing(id); return onDone();
  }
  const regular = owned.filter((o) => slotOf(o) === 'regular');
  if (regular.length < regularSlots(run.stats)) { grantBlessing(id); return onDone(); }
  // full: choose one to drop (it becomes a relic you can swap back later)
  setState('choice');
  setChoiceHeader('Your blessing slots are full', 'Drop one for ' + blessingDef(id).name + '?');
  const box = $('#choice .cards'); box.innerHTML = '';
  for (const o of regular) {
    const u = blessingDef(o), c = document.createElement('div');
    c.className = 'card ' + u.rarity; c.innerHTML = blessingCard(u) + '<div class="owned">Drop this</div>';
    c.addEventListener('click', () => { sfx('select'); dropBlessing(o); grantBlessing(id); onDone(); });
    box.appendChild(c);
  }
  const cancel = document.createElement('div');
  cancel.className = 'card'; cancel.innerHTML = '<div class="icon">↩</div><div class="name">Keep my blessings</div><div class="desc">Go back without taking it.</div>';
  cancel.addEventListener('click', () => { sfx('select'); onCancel(); });
  box.appendChild(cancel);
}
function takeRelic(relic) {
  world.relics = world.relics.filter((r) => r !== relic);
  takeBlessing(relic.id, () => { setState('play'); hud.banner('Relic', blessingDef(relic.id).name, 1200); },
    () => { world.relics.push(relic); setState('play'); });
}

function updateRefill() {
  const p = world.player;
  const b = $('#refill');
  b.classList.toggle('hidden', p.stats.flaskCharges === 0); // Vow of Ash: no flask
  const can = p.gold >= 20 && p.flask < p.stats.flaskCharges;
  b.disabled = !can;
  b.style.opacity = can ? 1 : 0.4;
  b.textContent = p.flask >= p.stats.flaskCharges ? 'Flask is full' : `Refill flask · 20 gold (you have ${p.gold})`;
}

function die(abandon = false) {
  const res = finishRun(false);
  $('#deadtitle').textContent = abandon ? 'You turned back' : run.depth >= 4 ? 'The demon endures' : 'The depths claim another';
  fillStats($('#deadstats'), { 'Ember earned': '+' + res.reward, 'Ember total': meta.ember });
  showUnlockHints('#deadnews', res);
  sfx('death');
  setState('dead');
}

function victory() {
  const res = finishRun(true);
  fillStats($('#winstats'), { 'Ember earned': '+' + res.reward, 'Ember total': meta.ember });
  showUnlockHints('#winnews', res);
  sfx('chest');
  setState('victory');
}

// Bank the run into persistent progression.
function finishRun(won) {
  const p = world.player;
  const bossesBeaten = [...(run.bossesBeaten || []), ...(world.bossesBeaten || [])];
  const res = recordRun(meta, { depth: run.depth, kills: p.kills, gold: p.gold, won, killsByType: run.killsByType, bossesBeaten }, run.vows);
  meta = res.meta;
  writeSave();
  updateTitleMeta();
  return res;
}

function showUnlockHints(sel, res) {
  const names = (ids) => ids.map((id) => UNLOCKS.find((u) => u.id === id)?.name || id);
  const parts = [];
  if (res.newlyUnlocked?.length) parts.push('New vows: ' + names(res.newlyUnlocked).join(', '));
  if (res.newlyAffordable?.length) parts.push('You can now afford: ' + names(res.newlyAffordable).slice(0, 4).join(', '));
  $(sel).textContent = parts.join(' · ');
  $(sel).classList.toggle('hidden', !parts.length);
}

function fillStats(el, extra = {}) {
  const p = world.player;
  const blessings = Object.entries(run.owned || {}).map(([id, n]) => {
    const u = UPGRADES.find((x) => x.id === id); return u ? u.icon + (n > 1 ? '×' + n : '') : '';
  }).join(' ') || '—';
  const vows = (run.vows || []).map((v) => UNLOCKS.find((u) => u.id === v)?.icon || '').join(' ');
  const rows = { 'Floor reached': run.depth, Kills: p.kills, Gold: p.gold, Blessings: blessings, ...(vows ? { Vows: vows } : {}), ...extra };
  el.innerHTML = Object.entries(rows).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
}

function fade(on) { $('#fade').classList.toggle('on', on); }

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (t - lastT) / 1000 || STEP);
  lastT = t;
  if (!world) return;

  if (state === 'play' || state === 'title' || state === 'transition') {
    handleBossEvents();
    if (world.cutscene > 0) world.cutscene -= dt;
    const snap = state === 'play' && !(world.cutscene > 0) ? input.snapshot() : idleInput();
    let simDt = dt;
    if (world.slowmo > 0) { world.slowmo -= dt; simDt = dt * 0.3; }
    acc += simDt;
    let steps = 0;
    while (acc >= STEP && steps < 4) {
      updateWorld(world, snap, STEP);
      // one-frame presses only count on the first sub-step
      for (const k of Object.keys(snap)) if (k.endsWith('Pressed')) snap[k] = false;
      acc -= STEP; steps++;
    }
    if (steps === 4) acc = 0;
    if (state === 'play' && world.player.dead) {
      deadTimer += dt;
      if (deadTimer > 1.6) { deadTimer = 0; die(); }
    }
  }
  view.render(world, state === 'pause' || state === 'choice' || state === 'shop' ? 0 : (world.slowmo > 0 ? dt * 0.3 : dt));
  if (tips && state === 'play') tips.update(world, run, meta, (id) => { (meta.tipsSeen ||= {})[id] = true; writeSave(); });
  if (run?.killsByType) for (const ev of world.events) if (ev.t === 'kill') run.killsByType[ev.e.type] = (run.killsByType[ev.e.type] || 0) + 1;
  setCombo(world.combo);
  if (run?.owned) hud.blessingIds = Object.keys(run.owned).join(',');
  world.events.length = 0;
  if (state === 'play' || state === 'choice' || state === 'shop') hud.update(world, view, input.touch);
  if (state === 'play' && mapView.world === world) mapView.update();
}

function flash() {
  const f = $('#flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
}
function cinema(ms) {
  document.body.classList.add('cinema');
  clearTimeout(cinema.t); cinema.t = setTimeout(() => document.body.classList.remove('cinema'), ms);
}
// Boss beats: intro cutscene, phase change, death finale (events come from enemies.js)
function handleBossEvents() {
  for (const ev of world.events) {
    if (ev.t === 'bossIntro') {
      world.cutscene = 1.9; cinema(1900); sfx('boss'); world.shake(0.6);
      const titles = { dwarf_king: ['The Hollow King', 'Lord of the fallen hold'], forge_golem: ['The Forge Colossus', 'Fire given a body'], bone_lord: ['The Bone Lord', 'Keeper of the sunken dead'], demon: ['The Ash Demon', 'Last flame of the hold'] };
      const [bt, bs] = titles[ev.e.type] || [ev.e.bossName || 'Guardian', ''];
      $('#bosscard .t').textContent = ev.e.bossName || bt; $('#bosscard .s').textContent = bs;
      $('#bosscard').classList.add('show'); setTimeout(() => $('#bosscard').classList.remove('show'), 2000);
    } else if (ev.t === 'bossPhase') {
      flash(); sfx('boss'); world.shake(0.9); world.slowmo = 0.5;
      hud.banner('The flame rises', 'Phase two', 1600);
    } else if (ev.t === 'bossDying') {
      flash(); sfx('slam'); world.slowmo = 1.6; world.cutscene = 2.6; cinema(3000);
      setTimeout(() => { sfx('chest'); hud.banner('Victory', 'The fire is out', 2600); }, 2400);
    }
  }
}

function idleInput() {
  return { x: 0, y: 0, jump: false, jumpPressed: false, attack: false, attackPressed: false, dash: false, dashPressed: false,
    special: false, specialPressed: false, item2: false, item2Pressed: false, flask: false, flaskPressed: false, interact: false, interactPressed: false, upPressed: false };
}

// ---------------- pause menu: map / blessings / settings / run ----------------
function renderPause(tab) {
  pauseTab = tab;
  for (const b of document.querySelectorAll('#ptabs .tab')) b.classList.toggle('on', b.dataset.ptab === tab);
  for (const p of document.querySelectorAll('.ppanel')) p.classList.toggle('hidden', p.dataset.panel !== tab);
  if (tab === 'map') requestAnimationFrame(() => mapView.drawFull());
  if (tab === 'run') fillStats($('#pausestats'));
  if (tab === 'build') renderBuild();
  if (tab === 'settings') renderSettings();
}

function renderBuild() {
  const box = $('#buildlist');
  const wp = WEAPONS.find((w) => w.id === run.stats.weapon);
  const items = [];
  if (wp) items.push({ ic: window.__iconHtml?.(wp.id, 'pic sm') || wp.icon || '⚔', name: wp.name, desc: wp.desc || '' });
  const evo = EVOLUTIONS.find((e) => e.id === run.stats.evolved);
  if (evo) items.push({ ic: evo.icon, name: 'Evolved: ' + evo.name, desc: evo.desc });
  else for (const e of EVOLUTIONS.filter((e) => e.weapon === run.stats.weapon)) items.push({ ic: '🔒', name: 'Evolution: ' + e.name, desc: 'Hold ' + e.needs.map((n) => blessingDef(n)?.name).join(' + ') + '. ' + e.desc });
  for (const [id, n] of Object.entries(run.owned || {})) {
    const u = UPGRADES.find((x) => x.id === id);
    if (u) items.push({ ic: window.__iconHtml?.(u.id, 'pic sm') || u.icon, name: u.name + (n > 1 ? ' ×' + n : ''), desc: u.desc });
  }
  box.innerHTML = items.length ? items.map((i) => `<div class="bl-item"><div class="ic">${i.ic}</div><div><b>${i.name}</b><span>${i.desc}</span></div></div>`).join('')
    : '<p>No blessings yet. Pray at a shrine to choose one.</p>';
}

const SETTINGS = [
  { id: 'sound', label: 'Sound', opts: [['on', 'On'], ['off', 'Off']] },
  { id: 'vibration', label: 'Vibration', hint: 'Phones only', opts: [['on', 'On'], ['off', 'Off']] },
  { id: 'shake', label: 'Screen shake', opts: [['full', 'Full'], ['low', 'Low'], ['off', 'Off']] },
  { id: 'zoom', label: 'Camera', hint: 'How much of the room you see', opts: [['close', 'Close'], ['normal', 'Normal'], ['far', 'Far']] },
  { id: 'buttons', label: 'Touch buttons', opts: [['small', 'Small'], ['normal', 'Normal'], ['large', 'Large']] },
  { id: 'quality', label: 'Graphics', hint: 'Low turns off glow and grading for older phones', opts: [['high', 'High'], ['low', 'Low']] },
  { id: 'fps', label: 'Frame counter', opts: [['off', 'Hide'], ['on', 'Show']] },
];
function renderSettings() {
  const box = $('#settingslist');
  box.innerHTML = '';
  for (const s of SETTINGS) {
    const row = document.createElement('div'); row.className = 'set-row';
    row.innerHTML = `<label>${s.label}${s.hint ? `<small>${s.hint}</small>` : ''}</label>`;
    const seg = document.createElement('div'); seg.className = 'seg';
    for (const [v, t] of s.opts) {
      const b = document.createElement('button'); b.textContent = t; b.className = settings[s.id] === v ? 'on' : '';
      b.addEventListener('click', () => { settings[s.id] = v; saveSettings(); applySettings(); sfx('select'); renderSettings(); });
      seg.appendChild(b);
    }
    row.appendChild(seg); box.appendChild(row);
  }
}
function loadSettings() {
  const d = { sound: 'on', vibration: 'on', shake: 'full', zoom: 'normal', buttons: 'normal', quality: 'high', fps: 'off' };
  try { return { ...d, ...JSON.parse(localStorage.getItem('ad.settings') || '{}') }; } catch { return d; }
}
function saveSettings() { try { localStorage.setItem('ad.settings', JSON.stringify(settings)); } catch { /* storage blocked */ } }
function applySettings() {
  if ((settings.sound === 'off') !== isMuted()) toggleMute();
  $('#mutebtn').textContent = 'Sound: ' + (isMuted() ? 'off' : 'on');
  globalThis.AD_NO_VIBRATE = settings.vibration === 'off';
  view.shakeMul = { full: 1, low: 0.45, off: 0 }[settings.shake];
  view.zoomMul = { close: 0.85, normal: 1, far: 1.2 }[settings.zoom];
  $('#touch').style.setProperty('--btn-scale', { small: 0.82, normal: 1, large: 1.18 }[settings.buttons]);
  view.post.enabled = settings.quality === 'high';
  view.renderer.setPixelRatio(settings.quality === 'high' ? view.dpr : 1);
  document.body.classList.toggle('hide-fps', settings.fps === 'off');
}

function loadSave() {
  try { return JSON.parse(localStorage.getItem('ad.save') || '{}'); } catch { return {}; }
}
function writeSave() {
  try { localStorage.setItem('ad.save', JSON.stringify(meta)); } catch { /* storage blocked */ }
}
