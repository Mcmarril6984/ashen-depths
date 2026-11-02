// Shared constants. 1 tile = 1 world unit (metre). World y points up; tile row 0 is the bottom row.

export const T = {
  EMPTY: 0,
  SOLID: 1,
  PLATFORM: 2, // one-way: solid only from above
  SPIKES: 3,   // hazard: damages and knocks back
  LAVA: 4,     // hazard: damages and respawns player at last safe ground
};

export const PLAYER = {
  w: 0.8,
  h: 1.7,
  runSpeed: 7.5,
  groundAccel: 70,
  airAccel: 45,
  gravity: 46,
  maxFall: 22,
  jumpVel: 17.5,       // apex ≈ 3.3 tiles
  jumpCutMul: 0.45,    // vy multiplier when jump released early
  coyote: 0.1,
  jumpBuffer: 0.12,
  dashTime: 0.18,
  dashSpeed: 18,
  dashCooldown: 0.6,
  wallSlideMax: 4,
  wallJumpVx: 9,
  wallJumpVy: 15.5,
  wallJumpLock: 0.14,
  attackTime: 0.28,
  comboWindow: 0.35,
  maxHp: 5,
  invulnAfterHit: 0.9,
  flaskCharges: 2,
  flaskHeal: 2,
  flaskTime: 0.8,
};

// What the level generator must guarantee is reachable with the base kit (no upgrades).
export const REACH = {
  maxJumpUp: 3,        // tiles a single jump can rise onto
  maxGapFlat: 5,       // tiles of horizontal gap crossable with jump + dash at the same height
};
