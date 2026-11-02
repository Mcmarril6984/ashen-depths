// DOM HUD: masks, flask, gold, boss bar, prompts, banners. Only touches the DOM when values change.
const $ = (s) => document.querySelector(s);

export class Hud {
  constructor() {
    this.el = { hud: $('#hud'), hp: $('#hp'), flask: $('#flask'), gold: $('#gold'), depth: $('#depth'), boss: $('#bossbar'),
      bossFill: $('#bossbar .fill'), banner: $('#banner'), fps: $('#fps'), interact: $('#b-interact'), kprompt: $('#kprompt'),
      special: $('#b-special'), item2: $('#b-item2'), attack: $('#b-attack'), vignette: $('#hurtvignette'), combo: $('#combo'), loadout: $('#loadout') };
    this.last = {};
  }
  show(on) { this.el.hud.classList.toggle('hidden', !on); }

  update(world, view, inputIsTouch) {
    const p = world.player, L = this.last, el = this.el;
    const hpKey = p.hp + '/' + p.stats.maxHp + (p.shield ? 's' : '');
    if (L.hp !== hpKey) {
      const lost = L.hpNum !== undefined && p.hp < L.hpNum;
      el.hp.innerHTML = '';
      for (let i = 0; i < p.stats.maxHp; i++) {
        const m = document.createElement('div');
        m.className = 'mask' + (i >= p.hp ? ' empty' : '') + (lost && i >= p.hp && i < L.hpNum ? ' lost' : '');
        el.hp.appendChild(m);
      }
      if (p.shield) { const s = document.createElement('div'); s.className = 'mask shield'; s.title = 'Shield: blocks one hit'; el.hp.appendChild(s); }
      if (lost) { el.vignette.style.opacity = 1; setTimeout(() => (el.vignette.style.opacity = p.hp <= 1 ? 0.5 : 0), 250); }
      L.hp = hpKey; L.hpNum = p.hp;
    }
    const fk = p.flask + '/' + p.stats.flaskCharges;
    if (L.flask !== fk) {
      el.flask.innerHTML = '';
      for (let i = 0; i < p.stats.flaskCharges; i++) {
        const v = document.createElement('div'); v.className = 'vial' + (i >= p.flask ? ' empty' : ''); el.flask.appendChild(v);
      }
      L.flask = fk;
    }
    if (L.gold !== p.gold) { el.gold.textContent = p.gold; L.gold = p.gold; }

    const boss = world.enemies.find((e) => e.boss && e.alive);
    const showBoss = !!boss && !boss.intro && Math.abs(boss.x - p.x) < 40;
    el.boss.classList.toggle('hidden', !showBoss);
    document.body.classList.toggle('boss-on', showBoss); // tips move below the boss bar
    if (showBoss) {
      if (L.bossName !== boss.bossName) { el.boss.querySelector('.name').textContent = boss.bossName || 'The Ash Demon'; L.bossName = boss.bossName; }
      const pct = (100 * boss.hp / boss.maxHp).toFixed(1) + '%';
      el.bossFill.style.width = pct;
      el.boss.querySelector('.chip').style.width = pct; // trails behind via its delayed transition
      el.boss.classList.toggle('p2', boss.phase === 2);
    }

    const prompt = world.prompt ? world.prompt.label : '';
    if (L.prompt !== prompt) {
      el.interact.textContent = prompt;
      el.interact.classList.toggle('hidden', !prompt);
      el.kprompt.textContent = prompt ? `${prompt} — W / ↑ / E` : '';
      el.kprompt.classList.toggle('hidden', !prompt);
      L.prompt = prompt;
    }
    // The Last Flame's danger meter: fills as the flames burn; full costs a mask
    const danger = p.stats.bless?.the_last_flame ? Math.round(p.b?.danger || 0) : -1;
    if (L.danger !== danger) {
      L.danger = danger;
      el.danger ||= Object.assign(document.createElement('div'), { id: 'danger', innerHTML: '<i></i><span>Danger</span>' });
      if (!el.danger.parentNode) el.hud.appendChild(el.danger);
      el.danger.classList.toggle('hidden', danger < 0);
      el.danger.querySelector('i').style.width = Math.max(0, danger) + '%';
    }
    // charge ring on the attack button while holding for a heavy attack
    const ch = p.state === 'charge' ? Math.round(p.charge * 100) : 0;
    if (L.charge !== ch) { L.charge = ch; el.attack.style.setProperty('--charge', ch + '%'); el.attack.classList.toggle('charging', ch > 0); el.attack.classList.toggle('charged', ch >= 100); }
    // item buttons: icon, cooldown ring, dim when the slot is empty
    for (const [i, b] of [[0, el.special], [1, el.item2]]) {
      if (!b) continue;
      const id = p.stats.items?.[i] || null, def = id && this.itemDef?.(id);
      const key = id + ':' + Math.ceil((p.itemCd?.[i] || 0) * 10);
      if (L['item' + i] === key) continue;
      L['item' + i] = key;
      b.classList.toggle('off', !def);
      const pic = def && this.itemPic?.(def.id);
      b.querySelector('.ic').innerHTML = pic ? `<img src="${pic}" alt="">` : def ? def.icon : '';
      b.querySelector('.cd').style.setProperty('--p', def && def.cd ? (100 * (p.itemCd?.[i] || 0) / def.cd).toFixed(0) + '%' : '0%');
      b.setAttribute('aria-label', def ? def.name : 'Empty item slot');
    }
    // combo counter: appears from 3 hits, pops on every hit, fades when the chain drops
    const c = world.combo;
    if (L.combo !== c) {
      if (c >= 3) {
        el.combo.querySelector('b').textContent = c;
        el.combo.classList.remove('pop'); void el.combo.offsetWidth; el.combo.classList.add('pop');
        el.combo.classList.add('on');
        el.combo.classList.toggle('hot', c >= 10);
      } else el.combo.classList.remove('on');
      L.combo = c;
    }
    // current weapon + blessing icons (top left, under the flask)
    const lk = p.stats.weapon + '|' + (this.blessingIcons || '');
    if (L.loadout !== lk) {
      el.loadout.querySelector('.wp').textContent = '⚔ ' + (this.weaponName?.(p.stats.weapon) || p.stats.weapon);
      el.loadout.querySelector('.bl').textContent = this.blessingIcons || '';
      L.loadout = lk;
    }
    if (view.fps && L.fps !== view.fps) { el.fps.textContent = view.fps + ' fps'; L.fps = view.fps; }
  }

  setDepth(text) { this.el.depth.textContent = text; }

  banner(sub, main, ms = 2200) {
    const b = this.el.banner;
    b.querySelector('.sub').textContent = sub;
    b.querySelector('.main').textContent = main;
    b.classList.add('show');
    clearTimeout(this.bannerT);
    this.bannerT = setTimeout(() => b.classList.remove('show'), ms);
  }
  reset() { this.last = {}; }
}
