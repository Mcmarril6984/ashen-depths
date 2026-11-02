// Tile collision for axis-aligned bodies. Pure logic, no rendering.
// Body: { x, y, w, h, vx, vy } where x = centre, y = feet (bottom). Filled in by moveBody:
//   onGround, hitWallL, hitWallR, hitCeil, hazard (T.SPIKES / T.LAVA / 0)
// Set body.dropThrough = true to fall through one-way platforms this frame.
import { T } from './constants.js';

export function tileAt(level, tx, ty) {
  if (tx < 0 || tx >= level.w || ty < 0) return T.SOLID; // walls and floor outside the map
  if (ty >= level.h) return T.EMPTY;                       // open sky above
  return level.tiles[ty * level.w + tx];
}

export function isSolid(level, tx, ty) {
  return tileAt(level, tx, ty) === T.SOLID;
}

const EPS = 1e-4;

export function moveBody(level, b, dt) {
  b.onGround = false;
  b.hitWallL = b.hitWallR = b.hitCeil = false;
  b.hazard = 0;

  // Horizontal
  let nx = b.x + b.vx * dt;
  const hw = b.w / 2;
  const y0 = Math.floor(b.y + EPS);
  const y1 = Math.floor(b.y + b.h - EPS);
  if (b.vx > 0) {
    const tx = Math.floor(nx + hw);
    for (let ty = y0; ty <= y1; ty++) {
      if (isSolid(level, tx, ty)) { nx = tx - hw - EPS; b.vx = 0; b.hitWallR = true; break; }
    }
  } else if (b.vx < 0) {
    const tx = Math.floor(nx - hw);
    for (let ty = y0; ty <= y1; ty++) {
      if (isSolid(level, tx, ty)) { nx = tx + 1 + hw + EPS; b.vx = 0; b.hitWallL = true; break; }
    }
  }
  b.x = nx;

  // Vertical
  let ny = b.y + b.vy * dt;
  const x0 = Math.floor(b.x - hw + EPS);
  const x1 = Math.floor(b.x + hw - EPS);
  if (b.vy <= 0) {
    const ty = Math.floor(ny);
    const wasAbove = b.y >= ty + 1 - 0.05;
    for (let tx = x0; tx <= x1; tx++) {
      const t = tileAt(level, tx, ty);
      if (t === T.SOLID || (t === T.PLATFORM && wasAbove && !b.dropThrough)) {
        ny = ty + 1; b.vy = 0; b.onGround = true; break;
      }
    }
  } else {
    const ty = Math.floor(ny + b.h);
    for (let tx = x0; tx <= x1; tx++) {
      if (isSolid(level, tx, ty)) { ny = ty - b.h - EPS; b.vy = 0; b.hitCeil = true; break; }
    }
  }
  b.y = ny;

  // Hazards overlapping the body
  const hx0 = Math.floor(b.x - hw + 0.1), hx1 = Math.floor(b.x + hw - 0.1);
  const hy0 = Math.floor(b.y + 0.05), hy1 = Math.floor(b.y + b.h * 0.5);
  for (let ty = hy0; ty <= hy1 && !b.hazard; ty++) {
    for (let tx = hx0; tx <= hx1; tx++) {
      const t = tileAt(level, tx, ty);
      if (t === T.SPIKES || t === T.LAVA) { b.hazard = t; break; }
    }
  }
  return b;
}

// Is there ground directly under the body's leading edge? (for patrol AI: "don't walk off ledges")
export function groundAhead(level, b, dir) {
  const tx = Math.floor(b.x + dir * (b.w / 2 + 0.1));
  const t = tileAt(level, tx, Math.floor(b.y - 0.1));
  return t === T.SOLID || t === T.PLATFORM;
}

export function wallAhead(level, b, dir) {
  const tx = Math.floor(b.x + dir * (b.w / 2 + 0.1));
  return isSolid(level, tx, Math.floor(b.y + 0.2)) || isSolid(level, tx, Math.floor(b.y + b.h - 0.2));
}

export function overlaps(a, b) {
  // a and b use the body convention (x centre, y bottom)
  return Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// Line of sight between two points, stepping through tiles.
export function lineOfSight(level, x0, y0, x1, y1) {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isSolid(level, Math.floor(x0 + (x1 - x0) * t), Math.floor(y0 + (y1 - y0) * t))) return false;
  }
  return true;
}
