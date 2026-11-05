# T0013-F2 — Imported Anatomy/Phrenology Critical Hits and Target Conditions: Verification

**Status:** Implemented for product-owner review on `feature/t0013-f2-critical-hits`, based on `main` at `3aff873` (T0008-F2, PR #39). Not merged. **No Project Gorgon in-game measurement was performed by this implementation.** Synthetic tests check that the implementation is consistent; they do not validate the game formulas.

## What is implemented

A separate pure critical stage after the existing normal-hit engine:

```text
calculateAbilityDamage (T0013, unchanged) → applyTargetDummy (T0014, unchanged) → calculateCriticalHit (T0013-F2)
```

`calculateCriticalHit(result, target, { creatureType, skillLevel }, repository)` reads the T0014 per-target hits and never changes the T0013/T0014 results. It returns:

- the ability's critical system;
- the selected creature and the relevant sub-skill, with its level and origin;
- the chance and multiplier terms, each with ordered named steps and its own confidence;
- per-hit normal, critical and expected values, both per target and in totals;
- the decision for every critical modifier, plus assumptions and warnings.

| Area | Files |
|---|---|
| Official critical rules: creature types, chance tables, ability systems | `src/core/calculation/critical-rules.ts` |
| Imported/manual sub-skill levels and precedence | `src/core/calculation/critical-skills.ts` |
| Critical stage | `src/core/calculation/critical-damage.ts` |
| Registry mappings for critical attributes; target conditions in aggregation | `registry.ts`, `modifiers.ts`, `aggregate.ts`, `report.ts` |
| Curated exact-power rules (critical chance/damage, creature type and Elite) | `src/core/calculation/critical-treasure-rules.ts`, `treasure-effect-rules.ts` |
| Coverage snapshots kept byte-identical | `treasure-coverage.ts` (T0013-F1 rules and registry pinned) |
| Session scenario state (never stored in BuildDocument) | `src/persistence/local/critical-scenario.ts`, `src/app/App.tsx` |
| UI | `TargetDummy.tsx`, `AbilityResults.tsx`, `target-dummy.css`, `results.css` |
| Tests and smoke | `critical.test.ts` (20), `CriticalResults.test.tsx` (6), updated `registry`/`aggregate`/`AbilityResults` tests, `critical.smoke.mjs` |

BuildDocument v1, the saved schema, the pinned v490 data, Sparks, DoTs, pets, rotation and DPS are unchanged.

## Sources and rules (v490, with confidence)

| Rule | Source | Confidence / use |
|---|---|---|
| **Critical system per ability:** static keyword `PhrenologyCriticals` (Psychology 71, Mentalism 72, Fairy Magic 34 abilities) or `AnatomyCriticals` (Archery 241, Crossbow 54). | `abilities.json` Keywords | Source fact. Both keywords → unresolved. |
| **Conditional systems** (shown as Unavailable, not simulated). Knife gets `AnatomyCriticals` only through `MeleeKnifeAnatomyCriticals`/`ThrownKnifeAnatomyCriticals` effects. Vampirism Eclipse of Shadows/Willbreaker/Embrace of Despair get `PhrenologyCriticals` only through `TSys…Crits` effects. | `ConditionalKeywords` | Source fact; stateful. |
| **No critical system:** no keyword and no `CritDamageMod` (e.g. Sword) shows "No critical-hit system". A `CritDamageMod` without a keyword (16 Archery Restorative Arrow records) is **unresolved**. | `abilities.json` | Source fact. |
| **Critical hooks:** `abilitykeywords` record 0 (`AnatomyCriticals`) adds `DELTA_ANATOMY_CRITICAL_CHANCE` (chance) and `MOD_CRITICAL_HIT_DAMAGE_ANATOMY` (damage). Record 1 (`PhrenologyCriticals`) adds `MOD_CRITICAL_HIT_DAMAGE` (damage only; no Phrenology chance attribute exists). Ability-specific hooks: `ABILITY_CRIT_CHANCE_DELTA_AIMEDSHOT/BLITZSHOT` (top-level), `SKILL_CRIT_CHANCE_DELTA_CROSSBOW`, `SKILL_CRIT_DAMAGE_MOD_CROSSBOW` and `ABILITY_CRITICAL_HIT_DAMAGE_MOD_SYSTEMSHOCK`. | `abilitykeywords.json`, `abilities.json` | Source facts. These are the only critical modifier applicability rules. |
| **Creature categories:** the 27 official Anatomy sub-skills (`Anatomy_<Category>`). Labels come from the official name minus " Anatomy". The 11 Phrenology sub-skills are paired by ID suffix, with one reviewed alias, `Phrenology_Fae` ↔ `Anatomy_Fey` (both named "Fae"). Tests verify every pair. | `skills.json` | Source facts. No monsters, stats or new taxonomy. |
| **Chance by level:** each sub-skill publishes reward `Notes`. Phrenology: "Mentalism/Psychology critical hit chance: +1% (total N%)" at levels 6, 12, … 48, reaching 8%. Anatomy: "Archery/Crossbow chance of critical hit: +1% (total N%)" at levels 8, 16, … 48, reaching 6%. Notes can hold several newline-separated lines and are read line by line. The running total must equal the published "(total N%)" or the table is unresolved. | `skills.json`; the wiki [Combat](https://wiki.projectgorgon.com/wiki/Combat) page (edited 2026-10-05) agrees on 1%→8% and 1%→6% | `partially_validated`. Chance = cumulative published total at the effective level; levels above 48 keep the last total. |
| **Chance applies only to the skills the notes name.** Fairy Magic carries `PhrenologyCriticals`, but the notes name Mentalism/Psychology only, so its chance is Unavailable. | `skills.json` | Conservative. |
| **No Phrenology sub-skill** (e.g. Canine): Phrenology chance is a valid 0%. | Phrenology descriptions ("against the corresponding type of creature"); wiki ("only thinking and feeling beings") | `assumed`. |
| **Base multiplier = published `PvE.CritDamageMod`:** 1.25 for Psychology, Mentalism, Fairy Magic and Archery; 1.5 for Crossbow. | `abilities.json`; wiki: "Phrenology Based Crits … damage multiplier of 1.25" | Phrenology `partially_validated`. **Anatomy conflict:** the wiki says Anatomy crits default to ×1.5, but v490 Archery publishes 1.25. The published value is used, labeled `assumed` with an explicit conflict assumption. |
| **Additive critical damage:** M = CritDamageMod + Σ applicable (+X% → X/100). | Consistent with the wiki: L100 Psychology + Mentalism gear makes the multiplier 5.05 = 1.25 + 2.1 (`power_4009` id_18) + 1.7 (`power_9009` id_17) | `assumed`; verified by arithmetic only. |
| **Additive chance:** p = sub-skill chance + Σ applicable chance bonuses, in percentage points. Values outside 0–100% are Unavailable (no cap is published). | Wiki: "Archery can get crit chance through mods … with no Anatomy levels" | `assumed`. |
| **Critical hit = per-target normal hit × M**, applied after the ability multiplier, Burst falloff and target damage-type modifier (all multiplicative). | — | `assumed`. |
| **Expected per successful hit = N × (1 − p) + C × p.** With p = 0 it is N even when C is unknown. | Mathematical identity | Used only with a resolved p. |
| **Gear mods bind to their skill:** `{MOD_CRITICAL_HIT_DAMAGE}{x}{Psychology}` requires Psychology active, through the existing T0012 condition. The dev forum says Psychology/Mentalism crit mods affect only Phrenology crits; the hooks enforce this. | `tsysclientinfo.json`; [forum](https://forum.projectgorgon.com/showthread.php?p=2961) | Source + existing rule. |

Not inferred: a universal base chance, a cap, monster crits, Elite crit effects, Knife crit multipliers, or pet crits.

### Mapped equipment critical effects

- **Token (registry, `partially_validated` mapping):**
  - `DELTA_ANATOMY_CRITICAL_CHANCE`: ArcheryBoost `power_10001` tiers 6–12, +1% to +4%, plus one fixed item effect.
  - `MOD_CRITICAL_HIT_DAMAGE`: PsychologyCritBoost `power_4009`, MentalismBoostCrit `power_9009`, BrewingCrits `power_31485` (slot None) and one item effect.
  - `MOD_CRITICAL_HIT_DAMAGE_ANATOMY`: ArcheryCritDamage `power_10009`, BrewingCrits and one item effect.
  - `ABILITY_CRITICAL_HIT_DAMAGE_MOD_SYSTEMSHOCK`: SystemShockCrit `power_9035`.
- **Curated exact-power prose (`assumed`):**
  - BlitzShotBoost `power_10402`: "Blitz Shot Damage +X%[ and Critical Hit Chance +Y%]", using `MOD_ABILITY_BLITZSHOT` and `ABILITY_CRIT_CHANCE_DELTA_BLITZSHOT`.
  - AimedShotBoostCrit `power_10045`: Aimed Shot flat damage and its own chance. The grant to the next Archery attack is a stateful remainder.
  - SharpenedBowCritDamage `power_32302`: "Anatomy Critical Hit Damage +X%", restricted to Archery abilities.
- **Unsupported, kept as explicit records:**
  - Knife honing "Critical Hit Damage +X%" (`power_32122`, `power_32142`): Knife crits are conditional and have no published multiplier.
  - Crit-triggered effects such as ArcheryCritFaster/Poison/AcidBomb, and pet crits.
  - KnifeThrowingCrits and DuelistsSlashCrits (they grant the system conditionally).
  - ConditioningShockCritDebuff (monster crit).

### Target creature type and Elite (curated, statically evaluable)

| Power | Template | Condition |
|---|---|---|
| `power_1253` FlashingStrikeExtraVsUndead | "Flashing Strike deals +N damage to undead" | Undead Anatomy → met; Incorporeal → unevaluated (ambiguous wording); others → not met |
| `power_1024` ManyCutsDebilitatingBlowKillArthropods | "Many Cuts and Debilitating Blow deal +X% damage to Arthropods (…)" | Arthropods |
| `power_1203` DecapitateKillNonElites | "Decapitate deals +N damage to non-Elite targets" | Elite = Not Elite |
| `power_3134` BodyslamBoostNonElites | "Bodyslam deals +N damage to non-Elite enemies" | Elite = Not Elite |

These rules add new condition kinds, `target-creature-type` and `target-elite`, through the existing T0013 decision path:

- **met:** the modifier is added;
- **not met:** the modifier is excluded;
- **Unknown:** the condition is unevaluated, and the modifier is shown as uncertain but not added.

Left out, with reasons:

- "sentient" (Wave of Darkness): not a published category.
- "Pigs" (PigSticker): not a published category.
- "+33% total damage against Demons" (Pixie Flare): unclear multiplier semantics.
- "+41% Direct Damage to Elite" (Backstab): which category it belongs to is ambiguous.
- Astral Strike Elite: Fairy Magic has no applicable hit.
- Gourmand "Your attacks deal +N damage to <type>" brewing powers: slot None, not equipment; listed for a follow-up.

All templates match every published tier (25/25/25/25) and are tested.

### Coverage report

`npm run coverage:treasure -- --check` is **byte-identical**. The three historical snapshots (T0014, T0013-F1 first commit, T0013-F1 final) use the pre-F2 curated rules and registry, so their published figures do not change. The F2 rules are scenario-dependent and documented here. In the runtime build they cover:

- 100 conditional entries across 4 powers;
- the critical entries for the 7 tokenized and 3 curated critical powers above.

## Imported and manual skills

- **Import:** the existing local CharacterSheet parser and resolver are used, and the snapshot stays in memory. A sub-skill resolves when exactly one entry is `resolved` to that official ID with a matching game-data version. The exported **`Level` is used directly**; `BonusLevels` is evidence only (customer-verified rule in `src/features/import/skill-levels.md`).
- **When no level is used:** a missing, ambiguous, invalid, version-mismatched or unresolved entry gives no level. It is never treated as 0. The combat-only `importedSkillLevel` helper is not used.
- **Precedence:** a manual level wins → otherwise the imported level → otherwise Unavailable. **Use imported** (or clearing the field) removes the manual override. Clear appears when there is no import.
- **Persistence:** creature type, Elite and manual levels are browser-session state (`gorgonbuilder.session.critical-scenario`). A reimport changes only the snapshot, so manual choices survive. BuildDocument v1 and autosave are unchanged. The controls stay usable on read-only builds because they are scenario state.

## UI

- **Target dummy** (shown only when Damage analysis is on):
  - **Creature**: Unknown plus 27 official categories.
  - **Elite**: Unknown, Elite or Not Elite.
  - A collapsed **Critical skills** disclosure lists the selected creature's Anatomy and Phrenology sub-skills, with a level input, the source (Imported / Manual / Not set / Not in import) and Use imported / Clear.
- **Ability results:**
  - **Critical chance**, with the creature and sub-skill source;
  - **Critical hit** for each published hit component;
  - **Expected per hit**.
  - Missing inputs show `Unavailable · select a creature type` or `Unavailable · enter <sub-skill> level`. Abilities without a system show **No critical-hit system**.
- **Damage breakdown** (collapsed by default) gains a **Critical hit** section:
  - the sub-skill chance (level and origin) and each named chance bonus (slot) → critical chance;
  - the published multiplier and each named damage bonus → critical multiplier;
  - critical = N × M, and expected = N × (1 − p) + C × p with the numbers filled in.
- **Development-only `?debugDamage=1`:** system/keyword/hook diagnostics, excluded and uncertain decisions, warnings and assumptions. Production ignores the flag (checked in Chromium preview).

## Exact fixture results (synthetic; v490 IDs)

| Fixture | p | M | Normal | Critical | Expected |
|---|---:|---:|---:|---:|---:|
| Mock 11 `ability_6553`, no gear, Human Phrenology 30 | 5% | 1.25 | 178 | 222.5 | 180.225 |
| Mock 11, `psychologyFixture` (+90% planned `power_4009/id_9`), Human Phrenology 48 | 8% | 2.15 | 526.7 | 1,132.405 | 575.156 |
| Same, Canine (no Phrenology sub-skill) | 0% | 2.15 | 526.7 | 1,132.405 | 526.7 |
| Same, Orc (no level) / Unknown creature | Unavailable | 2.15 | 526.7 | 1,132.405 | Unavailable |
| Mock 11, Psychology + Mentalism, `power_4009/id_25` + `power_9009/id_25` (high critical damage) | 8% | 6.9 | 178 | 1,228.2 | 262.016 |
| Same, tiers id_18 + id_17 (wiki 5.05 arithmetic check) | — | 5.05 | — | — | — |
| Smoke draft: `power_4009/id_20` + `power_9009/id_20`, Human Phrenology 30 | 5% | 5.65 | 178 | 1,005.7 | 219.385 |
| Archery Aimed Shot 5 `ability_2535`, ArcheryBoost id_10 (+3% chance, +50% Skill Base), ArcheryCritDamage id_20 (+48.5%), Undead Anatomy 24 | 3%+3% = 6% | 1.735 | 346.5 | 601.1775 | 361.78065 |
| Crossbow Shoot Crossbow 1 `ability_8301`, Undead Anatomy 48 | 6% | 1.5 | 186 | 279 | 191.58 |
| Mentalism System Shock 1 `ability_2330`, SystemShockCrit id_11 (+36, +22%), Goblin Phrenology 24 | 4% | 1.47 | 59 | 86.73 | 60.1092 |
| Blitz Shot 1 + BlitzShotBoost id_25 / Aimed Shot 5 + AimedShotBoostCrit id_25, Human Anatomy 0 | 15% / 16% | 1.25 | — | — | — |
| Mock 20 m Burst (`power_4032/id_18`), 5 enemies, Psychic vulnerability 20%, Human Phrenology 30 | 5% | 1.25 | 106.8 | 133.5 | 108.135 (×5 totals) |

Other tested properties:

- Working imported `power_4009/id_20` (+2.4) plus planned `id_19` (+2.25) are two separate sources: M = 5.9. Removing either restores the earlier value.
- Anatomy crit-damage gear on a Phrenology ability is excluded.
- Removing a crit modifier restores the previous critical result. Normal hits are unchanged in every case.

## Commands and results

| Command | Result |
|---|---|
| `npm ci` | Passed |
| `npm run data:update -- --check` | Passed; all pinned v490 datasets validated |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npx vitest run src/core/calculation` | 288 passed / 10 files |
| `npm test` (`--maxWorkers=2 --testTimeout=20000`) | **1,096 passed / 56 files** |
| `npm run coverage:treasure -- --check` | Passed, byte-identical |
| `npm run build` | Passed |
| `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` | Passed |
| `git diff --check` | Clean |
| `node src/features/abilities/critical.smoke.mjs --mode dev` and `--mode preview` | Passed at 1440×900, 375×812 and 320×812 (12 scenarios per mode) |
| `node src/features/abilities/popover-scroll.smoke.mjs` (dev, public) and `--url …/?debugDamage=1` (debug) | Passed at 1440×900, 1920×1080, 375×812 and 320×812 |

**Chromium smoke checks:**

- keyboard selection of the creature type, Enter on the Critical skills disclosure, and keyboard level entry (manual origin);
- Human/Canine/Orc/Unknown values;
- the normal hit stays unchanged;
- the breakdown is collapsed by default and contains the multiplier step;
- the debug gate: present in dev, absent in production preview;
- no diagnostic text in the public view;
- Remove is reachable and the popover stays within the viewport;
- the session scenario survives a reload and the saved BuildDocument is unchanged;
- no horizontal overflow beyond the documented pre-existing 2 px at 320 px;
- zero console or page errors.

Results: [dev](verification/t0013-f2/dev-results.json), [preview](verification/t0013-f2/preview-results.json), [scroll public](verification/t0013-f2/popover-scroll-public.json), [scroll debug](verification/t0013-f2/popover-scroll-debug.json).

| Mode | 1440 | 375 | 320 |
|---|---|---|---|
| Preview results | [image](verification/t0013-f2/preview-1440-results.png) | [image](verification/t0013-f2/preview-375-results.png) | [image](verification/t0013-f2/preview-320-results.png) |
| Preview target | [image](verification/t0013-f2/preview-1440-target.png) | [image](verification/t0013-f2/preview-375-target.png) | [image](verification/t0013-f2/preview-320-target.png) |
| Dev results (debug) | [image](verification/t0013-f2/dev-1440-results.png) | [image](verification/t0013-f2/dev-375-results.png) | [image](verification/t0013-f2/dev-320-results.png) |

### Pre-existing smoke-script staleness

- `popover-scroll.smoke.mjs` failed identically on untouched `main` (`3aff873`). T0010-F2 made Technical details debug-only and gave the public breakdown the same `.calc-breakdown` class. This branch applies a **selector-only** fix: it expands whichever disclosures exist in the current mode.
- `burst-estimate.smoke.mjs` and `prose-grammar.smoke.mjs` also fail identically on `main`. In production preview they wait for debug-only elements (`[data-falloff]`, unmodeled-effect lists). They were **not changed** and are reported as a follow-up.
- Their arithmetic assertions that run before the debug step (Mock 1/5/6 enemies) passed.

## Controlled in-game comparison (product owner)

1. **Record the setup.** Note the game version (v490 or newer), the exact ability and rank, both skill levels, gear with exact powers and tiers, buffs and the target. Use a repeatable training target of a known category, for example a Human or Goblin for Phrenology and an Undead for Anatomy.
2. **Import and read the levels.** Import a fresh CharacterSheet locally, turn on Damage analysis and select the target's creature type. In Critical skills, compare the imported sub-skill level with the in-game skill window; it must match the exported Level without adding BonusLevels.
3. **Phrenology (Psychology or Mentalism, e.g. Mock).**
   - Record at least 200 hits on one target type and count the critical hits. Compare the observed rate with the chance shown; with 200 hits a 5% chance has a standard error of about 1.5 points.
   - Record several non-critical and critical values from the combat log. Compare critical ÷ normal with the shown multiplier, with no crit-damage gear first, then with one `power_4009`/`power_9009` source.
4. **Anatomy (Archery, e.g. Aimed Shot).**
   - Repeat step 3 with the matching Anatomy sub-skill and target.
   - Check whether the observed base critical multiplier is **1.25 (v490 CritDamageMod) or 1.5 (wiki)**. This is the main open question.
   - Add and remove ArcheryBoost tiers 6+ (+chance) and ArcheryCritDamage (+multiplier) one at a time.
5. **Change the target type.** Switch to a type whose sub-skill is low or absent (Phrenology vs a canine) and confirm whether crits occur.
6. **Elite and creature conditions.** Test Decapitate + `power_1203` on a non-Elite and an Elite target, and Flashing Strike + `power_1253` on an undead and a non-undead target.
7. **Report.** Return a sanitized table: input change, predicted and observed chance and multiplier, number of samples and game version. Record mismatches as evidence; do not change formulas or confidence without it. Keep exports private.

## Remaining validation questions

1. Anatomy base multiplier: 1.25 (v490 data) or 1.5 (wiki)?
2. Does critical damage stack additively into the multiplier, and does it multiply the whole final hit, including vulnerability and Burst?
3. Do bonus levels above 48 matter? Is critical chance capped?
4. Does the Phrenology chance apply to Fairy Magic `PhrenologyCriticals` abilities, which the notes do not name?
5. Should Incorporeal targets satisfy "undead"?
6. Do DoT ticks (Archery poison on crit) or health and armor components crit separately?

## Follow-ups

- Stateful critical grants: Aimed Shot's next-attack chance, ArcheryCritFaster and the Knife conditional systems (which need a multiplier source). Crit-triggered effects.
- Gourmand brewing creature-type and Elite bonuses (consumables), and the remaining ambiguous conditional families.
- Update `burst-estimate.smoke.mjs` and `prose-grammar.smoke.mjs` for the T0010-F2 debug split.
