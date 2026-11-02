# Design decisions

Owner decisions that refine or override `rework-3.1.md`. Newest last. Agents: add your own decisions here too.

1. **Heavy attack = charged attack.** One move: hold the attack button, release to strike. Tapping stays the normal
   combo. Every "heavy" or "charged" in the spec refers to this move. Combo finishers are not heavy attacks.
2. **No "choose what to replace" screen** (overrides the spec's "At full capacity, players explicitly choose what to
   replace"). Legendary and cursed blessings replace the current one in their slot automatically, with a banner.
   Regular blessings are never removed; when the 6 regular slots are full, regular blessings stop being offered.
3. **Ordinary enemies can drop a 1-mask heal pickup.** This is the "healing resource" Hunger of the Void disables.
   Drop chance is a tunable number (start around 10%).
4. **Relics.** A blessing that gets replaced drops on the ground as a small relic instead of disappearing. Standing
   on it and pressing interact ("Swap") puts it back in its slot, and the blessing it displaces drops as a relic in
   turn, so the player can always undo a swap. Relics last until the player leaves the floor and show on the minimap.
