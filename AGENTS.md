# Ashen Depths — handoff for coding agents

Read this whole file and `design/decisions.md` (owner decisions that override the spec) before changing anything.
The current task is the **weapon & blessing rework** in
`design/rework-3.1.md` (the owner's design doc; treat it as the spec, keep its names and numbers).

## What the game is

A 3D side-view action roguelike in plain ES modules + three.js (loaded from jsDelivr via an import map in
`docs/index.html`). No build step, no package.json, no npm. 20 floors in 4 biomes, a boss every 5th floor, shrines
offer blessings, a merchant sells blessings/weapons, the Hearth (between runs) spends Ember on unlocks. Health is
**masks** (integer HP, `PLAYER.maxHp = 5`), plus flask charges for healing.

The owner plays mostly on an **iPhone, in landscape, launched from the home screen**. Every change must work with
touch controls on phones. Desktop keyboard and gamepad also work.

## Where things live

| Path | What |
|---|---|
| `docs/` | The whole game; GitHub Pages serves it. `docs/index.html` holds all CSS and overlay HTML. |
| `docs/src/main.js` | Boot, game loop (fixed 60 Hz step), state machine (`title/play/pause/choice/shop/hearth/dead/victory`), run flow, settings, save (`localStorage` keys `ad.save`, `ad.settings`). |
| `docs/src/game/upgrades.js` | **Blessing + weapon catalogue.** `makeStats()` = per-run flag object; `definitions` rows `[id,name,desc,rarity,icon,statField,value,tags]`; `rollChoices` (weighted, first slot favours tag synergy); `WEAPONS` rows; `rollShop`. |
| `docs/src/game/mechanics.js` | **Blessing/weapon behaviour hooks** called by world.js: `shapeDamage`, `onHit`, `onKill`, `tick`, `onSwing`, `onDashStart`, `dashTick`, `onPogo`, `onFlask`, `preventHurt`, `tryRevive`, `reflect`. Procs pass `{ fromProc: true }` to `w._hit` so they don't re-trigger player-hit effects. Keep that rule. |
| `docs/src/game/world.js` | Simulation: player swings/hitboxes (`playerSwing`), `_hit`, projectiles, pickups, events (`w.events` → renderer/audio). |
| `docs/src/game/player.js` | Player controller: move/jump/wall-jump/dash (i-frames), 3-hit combo + up/down slashes + pogo, special, flask, `hurtPlayer`. |
| `docs/src/game/enemies.js` | Enemy types (`ENEMY_TYPES`, hp/size/AI), bosses and their phases. Some enemies have `elite`, `armored`, `boss` flags. |
| `docs/src/game/meta.js` | Persistent progression: `UNLOCKS` (Hearth catalogue, **references blessing and weapon ids**), `BASE_BLESSINGS`, `BASE_WEAPONS`, loadout, vows, `recordRun`. |
| `docs/src/render/view.js` | three.js renderer (large). Characters, weapon pieces attached to `Hand_R` (`attachPiece`, piece names like `sword`, `sword_small`, `sword_large`, `axe`, `mace`, `hammer` come from `assets/kit.gltf.json`), event FX, camera. |
| `docs/src/ui/` | `hud.js`, `input.js` (touch stick + buttons, keyboard, gamepad → one snapshot per frame), `tips.js` (tutorial prompts), `minimap.js`, `hearth.js`. |
| `docs/assets/` | Models (glTF as `.gltf.json`), textures, UI images. ~24 MB. Synty-style store assets: don't redistribute elsewhere. |
| `tools/publish.sh` | Copies `docs/` to the `gh-pages` branch and pushes (deploys the live site). |
| `tools/device-matrix.js` | Playwright check across 13 phones/tablets in landscape: overlaps, off-screen HUD, canvas aspect. |

## Run and test

```sh
cd docs && python3 -m http.server 8123
# open http://localhost:8123/            dev tools: ?dev  (N = next floor, B = debug), ?dev&depth=14, ?autostart&seed=5, ?tutorial
node tools/device-matrix.js                # needs the server above and Playwright with Chromium
```

There is no unit-test suite. Verify by running the game (Playwright + `window.__game` exposes `{world, view, run, state()}`),
and run `tools/device-matrix.js` after any HUD/CSS/menu change. Fix every reported overlap or off-screen element.

## Deploying (important)

The live site is **https://mcmarril6984.github.io/ashen-depths/**, served from the **`gh-pages` branch root**, which
is a plain copy of `docs/`. After changes are merged and tested, publish with:

```sh
tools/publish.sh   # copies docs/ from the current branch to the gh-pages root and pushes
```

Simpler long-term option: in repo Settings → Pages, deploy from `main` + `/docs` and stop maintaining `gh-pages`.
GitHub Pages caches for ~10 min; the home-screen app needs a full close and reopen to pick up changes.

Work branch so far: `claude/game-development-5pau92` (all work through the "fit any phone" change). `main` has only the
initial README; merge the work branch into `main` before building on it. The older private repo `Mcmarril6984/claude`
holds a duplicate copy and is no longer the source of truth.

## Mobile rules already in place (don't regress)

- The 3D view sizes itself from the canvas's real box every frame (`View.checkSize`); never size from `innerWidth/innerHeight` alone.
- `--ui` (set in `main.js` `fitUi`) scales the touch-button cluster (`#pad`) and stick on big screens; layout below 460 px tall is tuned by `@media (max-height: 460px)` rules.
- Safe-area insets are `--sl/--sr/--st/--sb`. Overlays scroll when they don't fit (`.overlay` spacer pseudo-elements).
- Pause menu has Quit (tap twice). The tap that opens the pause menu fires a stray click; `pauseOpenedAt` guards Quit against it.
- New touch buttons go inside `#pad` with `right/bottom` offsets in px; check them with the device matrix.

## The rework: what exists vs. what the design needs

Current: 6 weapons (`sword, dagger, greatsword, axe, mace, hammer`), 28 blessings, one attack button with a 3-hit combo,
dash with i-frames (no "perfect dodge"), burn, bleed, marks, stun; no poison/chill/freeze, no charged or heavy attack,
no slots (blessings just accumulate, max 1 stack each), no shields except Warding Sigil/Warding Tonic, no summons.

New systems the spec depends on (build these first, in this order):

1. **Heavy / charged attack (decided: they are the same move).** Tap attack = normal combo. **Hold** attack =
   charge; releasing fires the heavy/charged attack. Every "heavy attack" and "charged attack" in the spec means this
   one move. Combo finishers are NOT heavy attacks. "Fully charged" = held to the end of the charge; "perfectly
   timed" (Cinderwake) = released in a short window right at full charge. Needs hold timing in `input.js`
   (`held.attack` exists; add a release event), a charge state + animation in `player.js`, and a charge ring on the
   touch attack button. A tap must still feel instant: start charging only after ~0.18 s of holding.
2. **Perfect dodge.** A dash that starts within a short window (~0.12 s) before an enemy hit would land. Detect in
   `hurtPlayer`/enemy attack resolution while dashing; emit an event, slow-mo flash, and set a `perfectDodge` timer the
   blessings read. Many blessings key off it (Reversal, Phantom Step, Second Skin, Hourglass, Perfect Storm, Hollowpoint, Ashen Fists).
3. **Stagger** on enemies (a meter that breaks into a staggered state). "Staggered", "minor", "elite", "boss" must be
   explicit flags. Bosses get diminishing crowd-control (resist repeated freezes/stuns).
4. **Status effects as data**: burn (exists), bleed (exists), poison, chill → freeze, marks, armor fracture. One
   module with apply/tick/consume, caps, and a per-target cooldown for procs.
5. **Shields** separate from masks (one shield at a time; absorbs one hit), shown in the HUD next to the masks.
6. **Slots (decided: no replace screen).** 6 regular, 1 legendary, 1 cursed. A new legendary or cursed blessing
   **automatically replaces** the one in its slot (tell the player with a banner: "X replaces Y"). Regular
   blessings keep being offered when all 6 regular slots are full: taking one asks the player which of their 6 to
   drop (a quick pick from their current blessings, with a Cancel). The dropped one becomes a relic (below).
   **Relics (decided):** a replaced blessing is never lost. It drops at the player's feet as a small floating relic
   (the blessing's icon in a glowing reliquary). Standing on it shows the interact button ("Swap"); interacting
   swaps it back into its slot, and the blessing it displaces drops as a relic in its place. Relics stay until the
   player leaves the floor, show on the minimap, and an evolution that depended on the swapped-out blessing is
   lost while that blessing is out of its slot. Show slots in the pause menu's Blessings
   tab. Rarity becomes category: offensive/movement/defensive/cursed/legendary.
7. **Evolutions**: when weapon + the two listed blessings are owned, offer the evolution (doesn't use a slot). Leave a
   hook for the spec's "weapon-mastery alternative".
8. **Summons / echoes** (blood shades, spectral knight, Hollow King copy, Thousandfold copies, Crimson Echo):
   one generic "spectral repeat" helper that replays a hit at X% damage with `fromProc: true` and can never
   trigger itself.
9. **Heal drops (decided).** Ordinary (non-elite, non-boss) enemies sometimes drop a small pickup that heals
   **1 mask** when touched (not above max). Start around a 10% drop chance, keep it in the balance table. Hunger of
   the Void's curse turns these drops off.

Then weapons (8). Map onto the existing visual pieces where possible:
Cinderwake → `sword_large`, Bloodletter → `sword_small` (dual), Oathbreaker → `hammer`, Hollowpoint → `sword_small`
(or a thinner piece if one exists in the kit), Mourning Reaper / Gravehook / Wraithstring / Ashen Fists probably need
new pieces: search `docs/assets/kit.gltf.json` node names first; if nothing fits, build simple procedural meshes in
`view.js` and say so. The bow needs projectile arrows and an aim direction (stick direction).

Then blessings by category, then legendaries, then curses, then evolutions. After each batch: play a seeded run on a
phone viewport with that build, check the FX are readable, and keep the old tutorial working.

### Migration (old saves and old content)

- Old blessing/weapon ids are stored in saves (`meta.unlocked`, `meta.loadout.weapon`, `BASE_*`, Hearth `UNLOCKS`).
  `normalizeMeta`/`sanitizeLoadout` in `meta.js` must map or drop unknown ids, so returning players keep their Ember.
  Refund Ember spent on removed unlocks.
- Rewrite the Hearth catalogue (`UNLOCKS`) for the new weapons/blessings: a starter set free (Cinderwake + a few
  blessings per category), the rest bought with Ember.
- Tutorial (`level/tutorial.js`, `ui/tips.js`) must teach charged attacks and perfect dodges once they exist.

### Balance and safety rules (from the spec, enforced in code)

- Percent heals convert to masks with explicit rounding; write the rule once in a helper.
- Procs, echoes, explosions and status ticks pass `fromProc: true` and never re-trigger "on primary hit" effects.
- Caps: damage multipliers, attack speed, slow-mo duration, number of active clouds, summons, shields.
- Every blessing needs visible feedback (an event in `w.events` that `view.js` turns into FX, plus an icon in the HUD/pause list).
- All numbers are provisional: keep them in one table per category so they're easy to tune.

## Working conventions

- Code style: small focused modules, short comments only where the "why" isn't obvious. Match the existing terse style.
- Don't add dependencies or a build step. three.js version is pinned (`0.170.0`) in the import map.
- Keep `docs/index.html` valid as a standalone page (real `<head>`, manifest, icons). It is also republished to a
  claude.ai artifact by the owner sometimes; relative asset paths must keep working.
- Commit in small steps with clear messages. Don't push to `gh-pages` until a batch is playable end to end.
- When something in the spec conflicts with the existing game (mask health, single attack button, no heal drops),
  pick the reading that keeps the game playable on a phone, note the decision in `design/decisions.md`, and continue.

## Progress log (keep this current; newest last)

Each entry: what's done, where, and what's next. Whoever stops work updates this before stopping.

1. **Combat foundation (done).**
   - Heavy = charged attack: `player.js` states `charge` → `heavy`; hold attack after a swing (or from idle) for
     `COMBAT.chargeDelay`, full at `chargeTime`; release inside `perfectWindow` after full = perfect.
     `world.playerHeavy(pl, {charge, full, perfect})` does the hit; hook `M.onHeavy(w, pl, h)` (optional, add in mechanics.js).
     Hit opts now carry `heavy/full/perfect` into `M.onHit`.
   - Perfect dodge: `damagePlayer(..., attack=true)` from enemy hitboxes/projectiles during the first
     `perfectDodgeWindow` s of a dash → `perfectDodge()`: no damage, slow-mo, dash refreshed, `pl.counterT` set.
     Hook `M.onPerfectDodge(w, pl, src)`. Contact damage never counts.
   - Stagger: `addStagger(w, e, amount)` (exported from world.js) fills `e.poise` to `poiseOf(e)`; full = `e.staggerT`
     (also sets `stunT`), `e.staggered` flag each frame, bosses' poise grows ×1.5 per stagger. Hook `M.onStagger(w, e)`.
     `stats.staggerMul` scales stagger (for Burden of Kings etc.).
   - Heal drops: ordinary foes drop a heart (1 mask) at `COMBAT.healDropChance`; `stats.noHealDrops` disables.
   - FX events: `heavy`, `chargeFull`, `perfectDodge`, `staggered` (view.js). Attack button shows a charge ring (hud.js + CSS).
   - All tunables: `COMBAT` in `constants.js`.
   Next: status module (poison, chill/freeze), shields, slots + relics, then weapons.

2. **Weapons (done, first pass).** `docs/src/game/weapons.js` holds all 8 (`WEAPON_DEFS`, starter `cinderwake`) and their
   move sets via hooks: `weaponSwing` (reshape/skip the melee box, bow fires arrows), `weaponHeavy` (custom heavies;
   return true to replace the default strike; may set `w.heavyBox`), `onWeaponHit`, `weaponDamage` (multipliers/crit),
   `onWeaponKill`, `onWeaponDash`/`weaponDashTick` (dodge-through), `onWeaponPerfectDodge`, `weaponTick`.
   `upgrades.js` `WEAPONS` now derives from `WEAPON_DEFS`; shops and floors no longer offer weapons (one per run).
   Hearth: weapons bought under Weapons, picked under Loadout (free). Old saves: retired weapon unlocks and the
   Armory Rack are refunded once (`RETIRED` in meta.js). New models (scythe, sickle, rapier, bow, gauntlet) are built
   in `assets.js` `buildWeaponPieces`; off-hand pieces via `offhand`.
   Not done yet: evolutions; Bloodletter blood shades etc. come with evolutions. Balance untested beyond smoke tests.
   Next: status effects (poison, chill/freeze), shields, then the 59 blessings, slots + relics, evolutions.

3. **Blessings, slots and relics (done, first pass).** `docs/src/game/blessings.js`: all 59 (`BLESSINGS`, categories
   offense/movement/defense/cursed/legendary), stat changes that undo cleanly (`addBlessing`/`removeBlessing`, needed
   for relic swaps), `rollBlessings` (cursed from floor 2, legendary from floor 4, first card favours weapon synergy),
   and hooks: `damageMul`, `critMul`, `onHit`, `onSwing({hits})`, `onHeavy`, `onKill`, `onDash`, `dashThrough`,
   `onPerfectDodge`, `incoming` (shields/armour/curses, `roundMasks` = chance-rounding of fractional mask damage),
   `onHurt`, `steadfast`, `onLethal`, `onRevive`, `onBossBeaten`, `flaskHeal`, `canHeal`, `onBleed`, `onCrit`, `tick`
   (poison, chill/freeze, slows, clouds, seekers, delayed hits, spectral allies, decoy).
   Stats: `stats.bless` = owned ids. Old 28 blessings retired (their stat flags still exist in makeStats but nothing
   grants them; old Hearth unlocks refunded via `RETIRED`). Hearth: 12 free starters (`BASE_BLESSINGS`), 47 for Ember.
   Slots/relics in `main.js` (`takeBlessing`, `dropBlessing`, `takeRelic`); relic prompt in world.js; relic sprites,
   allies, clouds, decoy and status glows in view.js; shield mask and Last Flame danger meter in hud.js.
   Decisions made while building (also in decisions.md): Plaguebearer's heavies are the poison source (nothing
   else poisons); Featherless Wings grants the second jump it modifies; "elite" = generator elite flag (now
   ×1.8 HP) or any non-boss with 8+ max HP; spectral allies are drawn as light particles (no model yet).
   Tested: each blessing alone and all 59 together through scripted combat (no errors); slot picker, relic swap,
   legendary auto-replace via the real UI.
   Next: weapon evolutions (spec list), tutorial lessons for heavy attack and perfect dodge, relics on the minimap,
   proper models for spectral allies, balance passes on a phone.

4. **Weapon evolutions (done).** `EVOLUTIONS` + `updateEvolution(stats)` in weapons.js (`stats.evolved`), checked in
   main.js after every blessing gain/drop (`checkEvolution`, banner). Effects live in weapons.js behind `evolved(pl, id)`.
   Pause → Blessings lists the weapon's evolution and what it needs. The spec's "weapon-mastery alternative" route
   is not built. Next: tutorial tips for heavy attack + perfect dodge, relics on the minimap, ally models, balance.
