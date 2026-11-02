// Dead Cells–style map: fog of war revealed as you explore, a corner minimap that follows you,
// and a full map (pause menu / tap the minimap). The explored layer is a 1px-per-tile canvas scaled up crisp.
import { T } from '../game/constants.js';

const COL = {
  air: [92, 76, 62], platform: [196, 164, 112], spikes: [190, 60, 44], lava: [255, 110, 40], edge: [40, 30, 28],
};
const ICON = { lift: '#7dffa8', liftSealed: '#ff5a4a', shrine: '#7ad8ff', merchant: '#ffd27a', chest: '#ffe066', weapon: '#ffa04a', relic: '#e8a0ff' };

export class MapView {
  constructor(mini, full) {
    this.mini = mini; this.full = full;
    this.frame = 0;
  }

  reset(world) {
    const L = world.level;
    this.world = world;
    this.explored = new Uint8Array(L.w * L.h);
    this.layer = document.createElement('canvas');
    this.layer.width = L.w; this.layer.height = L.h;
    this.lctx = this.layer.getContext('2d');
    this.img = this.lctx.createImageData(L.w, L.h);
    this.dirty = true;
    this.roomsSeen = new Set();
    this.explore(); // the starting area is known from the first frame
    this.lctx.putImageData(this.img, 0, 0); this.dirty = false;
  }

  // reveal a radius around the player, plus the whole room they are standing in
  explore() {
    const w = this.world, L = w.level, p = w.player;
    const px = Math.floor(p.x), py = Math.floor(p.y + 0.9), R = 7;
    for (let y = py - R; y <= py + R; y++) for (let x = px - R; x <= px + R; x++) {
      if ((x - px) ** 2 + ((y - py) * 1.3) ** 2 <= R * R) this.reveal(x, y);
    }
    const room = (L.rooms || []).find((r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h);
    if (room && !this.roomsSeen.has(room)) {
      this.roomsSeen.add(room);
      for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) this.reveal(x, y);
    }
  }

  reveal(x, y) {
    const L = this.world.level;
    if (x < 0 || y < 0 || x >= L.w || y >= L.h) return;
    const i = y * L.w + x;
    if (this.explored[i]) return;
    this.explored[i] = 1;
    const t = L.tiles[i];
    // solid tiles show only where they border explored space (outline of the cave)
    const c = t === T.SOLID ? COL.edge : t === T.PLATFORM ? COL.platform : t === T.SPIKES ? COL.spikes : t === T.LAVA ? COL.lava : COL.air;
    const o = ((L.h - 1 - y) * L.w + x) * 4; // flip: tile row 0 is the bottom
    this.img.data[o] = c[0]; this.img.data[o + 1] = c[1]; this.img.data[o + 2] = c[2]; this.img.data[o + 3] = t === T.SOLID ? 150 : 235;
    this.dirty = true;
  }

  update() {
    if (!this.world) return;
    this.explore();
    if (++this.frame % 4) return; // the minimap redraws at 15 fps
    if (this.dirty) { this.lctx.putImageData(this.img, 0, 0); this.dirty = false; }
    this.drawMini();
  }

  markers(ctx, toX, toY, size, viewAll) {
    const w = this.world, L = w.level, seen = (x, y) => viewAll || this.explored[Math.floor(y) * L.w + Math.floor(x)];
    const dot = (x, y, color, r) => { if (!seen(x, y + 0.5)) return; ctx.fillStyle = color; ctx.beginPath(); ctx.arc(toX(x), toY(y + 0.6), r, 0, Math.PI * 2); ctx.fill(); };
    const square = (x, y, color, r) => { if (!seen(x, y + 0.5)) return; ctx.fillStyle = color; ctx.fillRect(toX(x) - r, toY(y + 0.6) - r, r * 2, r * 2); };
    for (const s of w.shrines) if (!s.used) square(s.x, s.y, ICON.shrine, size * 1.1);
    for (const c of w.chests) if (!c.open) square(c.x, c.y, ICON.chest, size);
    for (const d of w.weaponDrops || []) square(d.x, d.y, ICON.weapon, size);
    for (const r of w.relics || []) square(r.x, r.y + 0.5, ICON.relic, size);
    if (w.merchant) square(w.merchant.x, w.merchant.y, ICON.merchant, size * 1.1);
    if (w.lift) square(w.lift.x, w.lift.y, w.exit.open ? ICON.lift : ICON.liftSealed, size * 1.4);
    const p = w.player;
    for (const e of w.enemies) if (e.alive && Math.abs(e.x - p.x) < 16 && Math.abs(e.y - p.y) < 10) dot(e.x, e.y + e.h * 0.3, e.boss ? '#ff2a2a' : '#ff6a5a', e.boss ? size * 1.6 : size * 0.8);
    ctx.fillStyle = '#fff4d0'; ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 6;
    ctx.beginPath(); ctx.arc(toX(p.x), toY(p.y + 0.9), size * 1.25, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
  }

  drawMini() {
    const c = this.mini, ctx = c.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
    if (!W) return;
    if (c.width !== W * dpr) { c.width = W * dpr; c.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const L = this.world.level, p = this.world.player, S = 3; // pixels per tile
    const cx = p.x, cy = p.y + 0.9;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.layer, W / 2 - cx * S, H / 2 - (L.h - cy) * S, L.w * S, L.h * S);
    this.markers(ctx, (x) => W / 2 + (x - cx) * S, (y) => H / 2 - (y - cy) * S, 2.2, false);
  }

  drawFull() {
    const c = this.full, ctx = c.getContext('2d');
    const dpr = Math.min(devicePixelRatio || 1, 2), W = c.clientWidth, H = c.clientHeight;
    if (!W || !this.world) return;
    c.width = W * dpr; c.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.dirty) { this.lctx.putImageData(this.img, 0, 0); this.dirty = false; }
    const L = this.world.level;
    // fit the explored bounds, not the whole (mostly solid) floor
    let x0 = L.w, x1 = 0, y0 = L.h, y1 = 0;
    for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) if (this.explored[y * L.w + x]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < x0) return;
    x0 -= 4; y0 -= 4; x1 += 4; y1 += 4;
    const S = Math.min(W / (x1 - x0), H / (y1 - y0), 9);
    const ox = (W - (x1 - x0) * S) / 2, oy = (H - (y1 - y0) * S) / 2;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.layer, x0, L.h - 1 - y1, x1 - x0, y1 - y0, ox, oy, (x1 - x0) * S, (y1 - y0) * S);
    this.markers(ctx, (x) => ox + (x - x0) * S, (y) => oy + (y1 - y) * S, Math.max(2.5, S * 0.55), false);
  }
}
