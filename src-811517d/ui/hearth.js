// The Hearth: spend Ember on unlocks, set the loadout (weapon, flask, vows), browse records.
import { UNLOCKS, isUnlocked, canBuy, buy, vowMods, sanitizeLoadout, allowedWeapons, allowedItems } from '../game/meta.js';
import { ITEM_DEFS } from '../game/items.js';
const BIOMES = [['halls', 'The Dwarven Halls', '🏛️', null], ['forge', 'The Forge', '🔥', 'start_forge'], ['crypt', 'The Sunken Crypt', '💀', 'start_crypt'], ['hell', 'The Hell Gate', '😈', 'start_hell']];
import { WEAPONS } from '../game/upgrades.js';
import { ENEMY_TYPES } from '../game/enemies.js';

const TABS = [
  ['blessing', 'Blessings'], ['weapon', 'Weapons'], ['item', 'Items'], ['feature', 'Features'], ['flask', 'Flasks'], ['loadout', 'Loadout'], ['records', 'Records'],
];
const ENEMY_NAMES = {
  skeleton: 'Skeleton', skeleton_thrower: 'Bone Thrower', dwarf_undead: 'Undead Dwarf', undead_knight: 'Undead Knight', wisp: 'Ash Wisp',
  demon: 'The Ash Demon', goblin: 'Goblin', goblin_shaman: 'Goblin Shaman', rock_golem: 'Rock Golem', ghost: 'Ghost',
  dwarf_bomber: 'Dwarf Bomber', crystal_turret: 'Crystal Sentry',
};
const FLASKS = [
  { id: 'heal', name: 'Healing Flask', icon: '🧪', desc: 'Heals 2' },
  { id: 'rage_flask', name: 'Rage Draught', icon: '🔥', desc: 'Heals 1; for 5 s your hits explode' },
  { id: 'ward_flask', name: 'Warding Tonic', icon: '🛡️', desc: 'Heals 1 and blocks the next hit' },
];

export class Hearth {
  constructor(root, { getMeta, setMeta, onClose, onStart, sfx }) {
    Object.assign(this, { root, getMeta, setMeta, onClose, onStart, sfx });
    this.tab = 'blessing';
    root.querySelector('#hearthclose').addEventListener('click', () => { sfx('select'); onClose(); });
    root.querySelector('#hearthstart').addEventListener('click', () => { sfx('select'); onStart(); });
  }

  open(tab) { if (tab) this.tab = tab; this.render(); }

  render() {
    const meta = this.getMeta(), root = this.root;
    root.querySelector('#hearthember').textContent = meta.ember;
    const tabs = root.querySelector('.tabs');
    tabs.innerHTML = '';
    for (const [id, label] of TABS) {
      const b = document.createElement('button');
      b.className = 'tab' + (id === this.tab ? ' on' : '');
      const affordable = UNLOCKS.filter((u) => u.cat === id && canBuy(meta, u.id).ok).length;
      b.innerHTML = label + (affordable ? ` <i>${affordable}</i>` : '');
      b.addEventListener('click', () => { this.sfx('select'); this.tab = id; this.render(); });
      tabs.appendChild(b);
    }
    const body = root.querySelector('.hbody');
    body.innerHTML = '';
    if (this.tab === 'loadout') return this.renderLoadout(body, meta);
    if (this.tab === 'records') return this.renderRecords(body, meta);
    const grid = document.createElement('div'); grid.className = 'cards';
    for (const u of UNLOCKS.filter((x) => x.cat === this.tab)) {
      const owned = isUnlocked(meta, u.id), check = canBuy(meta, u.id);
      const c = document.createElement('div');
      c.className = 'card' + (owned ? ' owned-card' : check.ok ? ' buyable' : ' poor');
      let foot;
      if (owned) foot = '<div class="price owned-tag">Unlocked</div>';
      else if (check.reason === 'locked') foot = `<div class="price lock">Needs ${(u.requires || []).map((r) => UNLOCKS.find((x) => x.id === r)?.name || r).join(', ')}</div>`;
      else if (check.reason === 'condition') foot = `<div class="price lock">Reach floor ${u.condition?.best}</div>`;
      else foot = `<div class="price">${u.cost} ember</div>`;
      c.innerHTML = `<div class="icon">${u.icon || '✦'}</div><div class="name">${u.name}</div><div class="desc">${u.desc}</div>${foot}`;
      c.addEventListener('click', () => {
        if (!canBuy(this.getMeta(), u.id).ok) { this.sfx('block'); return; }
        this.setMeta(buy(this.getMeta(), u.id));
        this.sfx('chest');
        this.render();
      });
      grid.appendChild(c);
    }
    body.appendChild(grid);
  }

  renderLoadout(body, meta) {
    const lo = sanitizeLoadout(meta);
    const set = (patch) => { const m = this.getMeta(); m.loadout = { ...lo, ...patch }; this.setMeta(m); this.sfx('select'); this.render(); };
    const section = (title, note) => { const h = document.createElement('div'); h.className = 'hsec'; h.innerHTML = `<h3>${title}</h3>${note ? `<p>${note}</p>` : ''}`; body.appendChild(h); const row = document.createElement('div'); row.className = 'pickrow'; body.appendChild(row); return row; };
    // starting biome (unlocked by beating the previous biome's boss)
    const brow = section('Begin at', 'Beat a biome\'s guardian to start your descent past it.');
    for (const [id, name, icon, unlock] of BIOMES) {
      const ok = !unlock || isUnlocked(meta, unlock);
      const b = document.createElement('button');
      b.className = 'pick' + ((lo.startBiome || 'halls') === id ? ' on' : '') + (ok ? '' : ' off');
      b.innerHTML = `<span>${icon}</span>${name}<small>${ok ? (id === 'halls' ? 'Floor 1' : 'Floor ' + { forge: 6, crypt: 11, hell: 16 }[id]) : 'Defeat its guardian first'}</small>`;
      b.addEventListener('click', () => { if (ok) set({ startBiome: id }); else this.sfx('block'); });
      brow.appendChild(b);
    }
    // starting weapon
    const canPick = true; // one weapon per run (3.1): choose any weapon you own
    const wrow = section('Weapon', 'You carry one weapon for the whole run. Buy more under Weapons.');
    const allowed = allowedWeapons(meta);
    for (const wp of WEAPONS) {
      if (!allowed.has(wp.id)) continue;
      const b = document.createElement('button');
      b.className = 'pick' + (lo.weapon === wp.id ? ' on' : '') + '';
      b.innerHTML = `<span>${wp.icon || '⚔'}</span>${wp.name}<small>${wp.kind || ''}</small>`;
      b.addEventListener('click', () => { if (canPick) set({ weapon: wp.id }); else this.sfx('block'); });
      wrow.appendChild(b);
    }
    // starting item (slot 1); more are found on altars during the run
    const irow = section('Starting item', 'Your first item slot. Find more on altars and at the trader.');
    const owned = allowedItems(meta);
    for (const it of ITEM_DEFS) {
      if (!owned.has(it.id)) continue;
      const b = document.createElement('button');
      b.className = 'pick' + (lo.item === it.id ? ' on' : '');
      b.innerHTML = `<span>${it.icon}</span>${it.name}<small>${it.kind}</small>`;
      b.addEventListener('click', () => set({ item: it.id }));
      irow.appendChild(b);
    }
    // flask
    const frow = section('Flask');
    for (const f of FLASKS) {
      const ok = f.id === 'heal' || isUnlocked(meta, f.id);
      const b = document.createElement('button');
      b.className = 'pick' + (lo.flask === f.id ? ' on' : '') + (ok ? '' : ' off');
      b.innerHTML = `<span>${f.icon}</span>${f.name}<small>${ok ? f.desc : 'Unlock in Flasks'}</small>`;
      b.addEventListener('click', () => { if (ok) set({ flask: f.id }); else this.sfx('block'); });
      frow.appendChild(b);
    }
    // vows
    const vows = UNLOCKS.filter((u) => u.cat === 'vow');
    const mods = vowMods(lo.vows);
    const vrow = section('Vows', `Harder runs, more ember. Current ember bonus: ×${mods.emberMul.toFixed(2)}`);
    for (const v of vows) {
      const ok = isUnlocked(meta, v.id), on = lo.vows.includes(v.id);
      const b = document.createElement('button');
      b.className = 'pick vow' + (on ? ' on' : '') + (ok ? '' : ' off');
      b.innerHTML = `<span>${v.icon || '🕯️'}</span>${v.name}<small>${ok ? v.desc : 'Reach floor ' + (v.condition?.best || 3)}</small>`;
      b.addEventListener('click', () => { if (!ok) { this.sfx('block'); return; } set({ vows: on ? lo.vows.filter((x) => x !== v.id) : [...lo.vows, v.id] }); });
      vrow.appendChild(b);
    }
  }

  renderRecords(body, meta) {
    const s = document.createElement('div');
    s.className = 'stats records';
    const rows = { 'Best floor': meta.best, Runs: meta.runs, Victories: meta.wins, 'Total kills': meta.kills, 'Ember on hand': meta.ember };
    s.innerHTML = Object.entries(rows).map(([k, v]) => `<span>${k}</span><span>${v}</span>`).join('');
    body.appendChild(s);
    const h = document.createElement('div'); h.className = 'hsec'; h.innerHTML = '<h3>Bestiary</h3>'; body.appendChild(h);
    const list = document.createElement('div'); list.className = 'bestiary';
    for (const type of Object.keys(ENEMY_TYPES)) {
      const n = meta.bestiary?.[type] || 0;
      const d = document.createElement('div');
      d.className = 'beast' + (n ? '' : ' unknown');
      d.innerHTML = `<b>${n ? ENEMY_NAMES[type] || type : '???'}</b><span>${n ? n + ' slain' : 'Not yet met'}</span>`;
      list.appendChild(d);
    }
    body.appendChild(list);
  }
}
