// Room themes: every room gets its own look from Synty pieces (background walls, tint, props, light colour).
// floor: [piece, {h|w}, weight] placed behind the playfield on floor spots; ceiling: hung from ceilings;
// glow: pieces that also emit light (colour) and get a glow sprite.
export const THEMES = {
  hall: {
    panels: ['wall', 'arch', 'window', 'wall_b', 'wall'], tint: [1, 0.96, 0.92], hemi: 0x9a8aa8,
    floor: [['pillar', { h: 5 }, 3], ['statue_m', { h: 3.2 }, 1], ['banner', { h: 2.6 }, 2], ['brazier', { h: 1.4 }, 1]],
    ceiling: [['chandelier', { w: 2.2 }, 1]], density: 0.5, shafts: 0xffd8a0,
  },
  crypt: {
    panels: ['alcove', 'alcove', 'wall_b'], tint: [0.7, 0.82, 0.95], hemi: 0x6a8aa0,
    floor: [['sarcophagus', { w: 2.2 }, 3], ['bones', { w: 1.2 }, 3], ['statue', { h: 3 }, 1], ['pillar_broken', { h: 2.4 }, 2], ['dead_dwarf', { w: 1.6 }, 1]],
    ceiling: [['chain', { w: 0.35, h: 3, d: 0.35 }, 1]], density: 0.6, torch: 0x7ad0ff, shafts: 0x9ad0ff,
  },
  armory: {
    panels: ['wall', 'fireplace', 'wall_b'], tint: [1.08, 0.92, 0.78], hemi: 0xb08a70,
    floor: [['weapon_rack', { h: 2 }, 3], ['barrel_stack', { h: 1.8 }, 2], ['crate_stack', { h: 1.8 }, 2], ['banner_torn', { h: 2.6 }, 2]],
    ceiling: [['chain', { w: 0.35, h: 2.5, d: 0.35 }, 1]], density: 0.6,
  },
  mine: {
    panels: ['block', 'wall_b', 'block'], tint: [0.8, 0.78, 0.76], hemi: 0x6a9aa0,
    floor: [['cart', { w: 2 }, 2], ['crystals', { h: 1.8 }, 3], ['rubble', { w: 2 }, 2], ['cog', { w: 2 }, 1]],
    ceiling: [], density: 0.55, glow: { crystals: 0x5ae0ff },
  },
  vault: {
    panels: ['arch', 'wall', 'window'], tint: [1.15, 1.0, 0.75], hemi: 0xc8a060,
    floor: [['gold_pile', { w: 1.6 }, 3], ['gold_coins', { w: 1 }, 2], ['statue_m', { h: 3.2 }, 1], ['obelisk', { h: 3 }, 1]],
    ceiling: [['chandelier', { w: 2.2 }, 1]], density: 0.6, glow: { gold_pile: 0xffc860 }, shafts: 0xffe0a0,
  },
  shrine: {
    panels: ['window', 'arch', 'window'], tint: [0.8, 0.9, 1.15], hemi: 0x7a9ad0,
    floor: [['obelisk_glow', { h: 3 }, 2], ['statue', { h: 3 }, 1], ['pillar', { h: 5 }, 2]],
    ceiling: [], density: 0.45, glow: { obelisk_glow: 0x7ad8ff }, torch: 0x8ad0ff, shafts: 0xa0d8ff,
  },
  gate: {
    panels: ['arch', 'wall', 'wall_b'], tint: [1, 0.95, 0.9], hemi: 0xa08a90,
    floor: [['statue_m', { h: 3.4 }, 2], ['brazier', { h: 1.4 }, 2], ['pillar', { h: 5 }, 1]],
    ceiling: [], density: 0.45,
  },
  tunnel: {
    panels: ['block'], tint: [0.65, 0.62, 0.62], hemi: 0x6a6070,
    floor: [['rubble', { w: 1.6 }, 2], ['bones', { w: 1 }, 1]], ceiling: [['chain', { w: 0.3, h: 2, d: 0.3 }, 1]], density: 0.4,
  },
  forge: {
    panels: ['wall_b', 'block', 'fireplace'], tint: [1.2, 0.85, 0.68], hemi: 0xc07050,
    floor: [['brazier', { h: 1.5 }, 2], ['cog', { w: 2.2 }, 2], ['barrel_stack', { h: 1.8 }, 1], ['cart', { w: 2 }, 1]],
    ceiling: [['chain', { w: 0.35, h: 3, d: 0.35 }, 2]], density: 0.55, glow: { brazier: 0xff8a3a }, torch: 0xff7a2a,
  },
  foundry: {
    panels: ['wall', 'block', 'wall_b'], tint: [1.05, 0.8, 0.7], hemi: 0xb06a50,
    floor: [['cog', { w: 2.6 }, 3], ['crate_stack', { h: 1.8 }, 2], ['weapon_rack', { h: 2 }, 1]],
    ceiling: [['chain', { w: 0.35, h: 3.5, d: 0.35 }, 2]], density: 0.55,
  },
  hell: {
    panels: ['wall_b', 'block'], tint: [0.85, 0.66, 0.64], hemi: 0x8a6a70,
    floor: [['hell_pillar', { h: 4 }, 2], ['hell_brazier', { h: 1.8 }, 2], ['hell_spike_skull', { h: 2 }, 2], ['hell_obelisk', { h: 3 }, 1]],
    ceiling: [['hell_chains', { h: 3 }, 1]], density: 0.55, glow: { hell_brazier: 0xff5a2a }, torch: 0xff4a2a,
  },
  bone: {
    panels: ['block', 'alcove'], tint: [0.8, 0.66, 0.62], hemi: 0x806468,
    floor: [['bones', { w: 1.4 }, 3], ['hell_spike_skull', { h: 2 }, 2], ['hell_symbol', { h: 2.2 }, 1]],
    ceiling: [['hell_chains', { h: 3 }, 1]], density: 0.55,
  },
  // ---- Sunken Crypt biome
  ossuary: {
    panels: ['alcove', 'alcove', 'block'], tint: [0.62, 0.78, 0.8], hemi: 0x5a8a90,
    floor: [['bones', { w: 1.4 }, 3], ['sarcophagus', { w: 2.2 }, 2], ['statue_broken', { h: 2.6 }, 1], ['bone_skull', { w: 0.8 }, 2]],
    ceiling: [['chain', { w: 0.35, h: 3, d: 0.35 }, 1]], density: 0.6, torch: 0x6ad8c0,
  },
  tombs: {
    panels: ['arch', 'alcove', 'wall_b'], tint: [0.6, 0.72, 0.78], hemi: 0x5a7a90,
    floor: [['sarcophagus', { w: 2.2 }, 3], ['statue', { h: 3 }, 1], ['pillar_broken', { h: 2.4 }, 2], ['tree_dead', { h: 3.5 }, 1]],
    ceiling: [], density: 0.55, torch: 0x6ad8c0, shafts: 0x8ae0d0,
  },
  // ---- boss arenas (open, readable: props only at the sides)
  throne: {
    panels: ['arch', 'window', 'wall'], tint: [1, 0.92, 0.82], hemi: 0x9a8a80,
    floor: [['brazier', { h: 1.6 }, 1], ['banner', { h: 3 }, 1]], sidesOnly: true, noPillars: true, ceiling: [], density: 0.25,
    glow: { brazier: 0xffa04a }, centerpiece: ['throne', { h: 4 }],
  },
  foundry_boss: {
    panels: ['wall_b', 'fireplace', 'block'], tint: [1.1, 0.8, 0.66], hemi: 0xb06a4a,
    floor: [['anvil', { h: 1.2 }, 1], ['brazier', { h: 1.6 }, 1]], sidesOnly: true, noPillars: true, ceiling: [], density: 0.25,
    glow: { brazier: 0xff8a3a }, torch: 0xff7a2a, centerpiece: ['obelisk', { h: 7 }],
  },
  nave: {
    panels: ['arch', 'window', 'alcove'], tint: [0.66, 0.8, 0.86], hemi: 0x6a8a98,
    floor: [['statue', { h: 3.4 }, 1]], sidesOnly: true, noPillars: true, ceiling: [], density: 0.25, torch: 0x6ad8c0, shafts: 0x9ae8e0,
    centerpiece: ['skull_huge', { h: 8 }],
  },
  boss: {
    // open, readable arena: tall arches and windows, braziers only at the sides, the giant skull far behind
    panels: ['arch', 'window', 'arch', 'wall'], tint: [0.95, 0.8, 0.78], hemi: 0x9a7a80,
    floor: [['hell_brazier', { h: 1.8 }, 1]], sidesOnly: true, noPillars: true, noForeground: true,
    ceiling: [], density: 0.25, glow: { hell_brazier: 0xff6a3a }, torch: 0xff8a50,
    centerpiece: ['skull_huge', { h: 9 }],
  },
};

// Pick a theme for a room (deterministic per room).
export function themeFor(room, biome, rnd) {
  if (room.type === 'boss') return { halls: 'throne', forge: 'foundry_boss', crypt: 'nave', hell: 'boss' }[biome] || 'boss';
  if (room.type === 'shrine') return 'shrine';
  if (room.type === 'treasure') return 'vault';
  if (room.connector) return 'tunnel';
  if (room.type === 'exit') return biome === 'hell' ? 'hell' : 'gate';
  if (room.type === 'start') return biome === 'forge' ? 'forge' : biome === 'hell' ? 'hell' : biome === 'crypt' ? 'tombs' : 'hall';
  const pool = biome === 'forge' ? ['forge', 'foundry', 'mine'] : biome === 'hell' ? ['hell', 'bone'] : biome === 'crypt' ? ['ossuary', 'tombs', 'crypt'] : ['hall', 'crypt', 'armory', 'mine'];
  return pool[Math.floor(rnd() * pool.length)];
}

export function pickWeighted(list, rnd) {
  const total = list.reduce((s, x) => s + x[2], 0);
  let r = rnd() * total;
  for (const x of list) { r -= x[2]; if (r <= 0) return x; }
  return list[list.length - 1];
}
