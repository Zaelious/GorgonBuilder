# T0012 — Build Modifier Aggregation Engine: Verification

**Status:** Implemented. Awaiting architect review and product-owner approval. Not merged.
**Base:** latest `main` `0675f7b` (includes T0011-F2/F3, T0008-F1 and T0010-F1).
**Scope:** `src/core/calculation/` only (contracts, registry, aggregator, report formatter, fixtures, tests, README) and this document. No React UI, damage formula, Spark, import-parser, official-data or BuildDocument change.

## What was verified

| Check | Result |
|---|---|
| `npm ci` | passed |
| `npm run data:update -- --check` | passed (pinned v490 snapshot valid offline) |
| `npm run lint` | passed (0 warnings) |
| `npm run typecheck` | passed |
| `npm test` | **773 passed / 35 files** (727 baseline + 46 new T0012) |
| `npx vitest run src/core/calculation` | 46 passed / 2 files |
| `npm run build` | passed |
| `git diff --check` | clean |

Regression cases (from `src/core/calculation/aggregate.test.ts`):

1. Psychology-only progression and equipment sources
2. Cow/Unarmed with two distinct active skills and tables
3. Same skill in A and B, same level: skill-wide rewards appear once, `slots: ['A','B']`
4. Same skill in A and B at different levels: explicit `skill-level-conflict`, nothing aggregated
5. Fixed effects from several items stay separate
6. Database, manual and imported items (plus a manual item with no base)
7. Imported existing powers keep their exact original tiers
8. An imported tier edit (via `editExistingMods`) changes only that record
9. Removing an imported existing power removes only its record. The planned copy of the same power stays.
10. `metadata.sourceItem` / `originalWorkingPowers` add nothing and are never duplicated
11. A candidate and an existing power with the same identity stay two records
12. Unknown power, unknown tier, null tier, unknown item, no-base item, prose and unmapped attributes are all reported
13. Removing one item changes only that item's records
14. Deep-frozen inputs; repeated runs give identical output
15. Empty and partial builds

Additional cases cover required-active-skill conditions (met / not met), level above the table, invalid and unknown skills, non-combat skills, a game-data version mismatch, summary consistency and source ordering. Extending or narrowing the registry needs no aggregation change. `registry.test.ts` covers the token grammar, 17 positive and 7 negative mapping examples, and a check over all 2,189 official attributes: no attribute matches two rules, and every rule maps something.

## Reproduce

```sh
npm ci
npx vitest run src/core/calculation
```

The reports below come from `formatAggregationReport(aggregateBuildModifiers(fixture, repository), title)`, run with the committed v490 repository (`loadPlannerFixture`). The fixtures are synthetic and contain no customer exports.

## Coverage of v490 effects by the initial registry

Counts are published effect lines, for orientation only:

| Source | Mapped | Unmapped attribute | Prose |
|---|---|---|---|
| TSys tier effect lines (52,039) | 9,987 | 10,662 | 31,390 |
| Item fixed-effect lines (8,460) | 3,623 | 4,625 | 212 |

## Controlled aggregation reports

### Psychology fixture (`psychologyFixture`)

Game data v490 (build saved with v490); active skills: Psychology
Modifiers 11 · unsupported 12 · warnings 0
By confidence: validated 0, partially_validated 9, assumed 2, unknown 0
By source: skill-advancement 2, item-fixed-effect 7, existing-power 0, candidate-mod 2

#### Supported modifiers

- max-resource-flat | flat 200 | MAX_HEALTH "Max Health" | general | unconditional | assumed | Psychology [A] L100 active 3_Balanced (100 level entries)
- max-resource-flat | flat 95 | MAX_POWER "Max Power" | general | unconditional | assumed | Psychology [A] L100 active 3_Balanced (55 level entries)
- max-resource-flat | flat 68 | MAX_ARMOR "Max Armor" | general | unconditional | partially_validated | Head#0 database item_44346 fixed[0]
- skill-base-damage-percent | percent 0.2 (fraction) | MOD_SKILL_PSYCHOLOGY "Psychology Base Damage %" | skill Psychology | unconditional | partially_validated | Head#0 database item_44346 fixed[1]
- skill-base-damage-percent | percent 0.45 (fraction) | MOD_SKILL_PSYCHOLOGY "Psychology Base Damage %" | skill Psychology | unconditional | partially_validated | Head#0 database planned power_4001/id_9 effect[0]
- all-direct-damage-flat | flat 175 | BOOST_UNIVERSAL_DIRECT "All Direct Damage" | general (direct) | unconditional | partially_validated | Ring#0 database item_49120 fixed[0]
- all-direct-damage-flat | flat 58 | BOOST_UNIVERSAL_DIRECT "All Direct Damage" | general (direct) | unconditional | partially_validated | Necklace#0 database item_48082 fixed[0]
- skill-base-damage-percent | percent 0.07 (fraction) | MOD_SKILL_NECROMANCY "Necromancy Base Damage %" | skill Necromancy | unconditional | partially_validated | Necklace#0 database item_48082 fixed[1]
- ability-damage-percent | percent 0.22 (fraction) | MOD_ABILITY_STRIKEANERVE "Strike a Nerve Damage %" | abilities hooking MOD_ABILITY_STRIKEANERVE via AttributesThatModDamage | unconditional | partially_validated | Necklace#0 database planned power_4061/id_9 effect[0]
- max-resource-flat | flat 240 | MAX_ARMOR "Max Armor" | general | unconditional | partially_validated | Chest#0 database item_42702 fixed[0]
- skill-damage-flat | flat 88 | BOOST_SKILL_NECROMANCY "Necromancy Damage" | skill Necromancy | unconditional | partially_validated | Chest#0 database item_42702 fixed[1]

#### Unsupported / unresolved effects

- progression-rewards-not-modifiers | Psychology [A] L100 | Psychology level 100 unlock rewards (Ability ×27, BonusToSkill ×13) are not stat modifiers.
- unmapped-attribute VULN_PSYCHIC | Head#0 database item_44346 fixed[2] | Vulnerability to Psychic % (VULN_PSYCHIC) has no validated modifier mapping yet.
- unmapped-attribute VULN_DEMONIC | Head#0 database item_44346 fixed[3] | Vulnerability to Demonic % (VULN_DEMONIC) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_HEALTH_DELTA | Head#0 database item_44346 fixed[4] | Health from Combat Refresh Abilities (COMBAT_REFRESH_HEALTH_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_ARMOR_DELTA | Head#0 database item_44346 fixed[5] | Armor from Combat Refresh Abilities (COMBAT_REFRESH_ARMOR_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_POWER_DELTA | Head#0 database item_44346 fixed[6] | Power from Combat Refresh Abilities (COMBAT_REFRESH_POWER_DELTA) has no validated modifier mapping yet.
- prose-effect | Necklace#0 database planned power_4002/id_9 effect[0] | Published text effect is not interpreted: "<icon=2118>Psychoanalyze deals between 90 and 220 extra damage"
- unmapped-attribute VULN_PSYCHIC | Chest#0 database item_42702 fixed[2] | Vulnerability to Psychic % (VULN_PSYCHIC) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_HEALTH_DELTA | Chest#0 database item_42702 fixed[3] | Health from Combat Refresh Abilities (COMBAT_REFRESH_HEALTH_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_ARMOR_DELTA | Chest#0 database item_42702 fixed[4] | Armor from Combat Refresh Abilities (COMBAT_REFRESH_ARMOR_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_POWER_DELTA | Chest#0 database item_42702 fixed[5] | Power from Combat Refresh Abilities (COMBAT_REFRESH_POWER_DELTA) has no validated modifier mapping yet.
- unmapped-attribute MOD_CRITICAL_HIT_DAMAGE | Chest#0 database planned power_4009/id_9 effect[0] | Psychology/Mentalism Critical Hit Damage % (MOD_CRITICAL_HIT_DAMAGE) has no validated modifier mapping yet.

#### Warnings

(none)

### Cow/Unarmed fixture (`cowUnarmedFixture`)

Game data v490 (build saved with v490); active skills: Cow, Unarmed
Modifiers 22 · unsupported 13 · warnings 5
By confidence: validated 0, partially_validated 15, assumed 7, unknown 0
By source: skill-advancement 7, item-fixed-effect 8, existing-power 3, candidate-mod 4

#### Supported modifiers

- max-resource-flat | flat 275 | MAX_HEALTH "Max Health" | general | unconditional | assumed | Cow [A] L100 active 11_PlayerCow (100 level entries)
- max-resource-flat | flat 85 | MAX_POWER "Max Power" | general | unconditional | assumed | Cow [A] L100 active 11_PlayerCow (55 level entries)
- damage-type-mitigation-flat | flat 10 | MITIGATION_CRUSHING "Crushing Damage Reduction" | Crushing (delivery unspecified) | unconditional | assumed | Cow [A] L100 active 11_PlayerCow (10 level entries)
- damage-type-mitigation-flat | flat 10 | MITIGATION_PIERCING "Piercing Damage Reduction" | Piercing (delivery unspecified) | unconditional | assumed | Cow [A] L100 active 11_PlayerCow (10 level entries)
- damage-type-mitigation-flat | flat 10 | MITIGATION_SLASHING "Slashing Damage Reduction" | Slashing (delivery unspecified) | unconditional | assumed | Cow [A] L100 active 11_PlayerCow (10 level entries)
- max-resource-flat | flat 200 | MAX_HEALTH "Max Health" | general | unconditional | assumed | Unarmed [B] L100 active 3_Balanced (100 level entries)
- max-resource-flat | flat 95 | MAX_POWER "Max Power" | general | unconditional | assumed | Unarmed [B] L100 active 3_Balanced (55 level entries)
- skill-damage-percent | percent 0.12 (fraction) | MOD_SKILL_ALL_KNIFE "Knife Damage %" | skill Knife | unconditional | partially_validated | MainHand#0 imported item_45640 fixed[0]
- damage-type-direct-flat | flat 146 | BOOST_DARKNESS_DIRECT "Direct Darkness Damage" | Darkness (direct) | unconditional | partially_validated | MainHand#0 imported item_45640 fixed[2]
- ability-damage-flat | flat 101 | BOOST_ABILITY_COWFRONTKICK "Cow's Front Kick Damage" | abilities hooking BOOST_ABILITY_COWFRONTKICK via AttributesThatDeltaDamage | unconditional | partially_validated | MainHand#0 imported existing power_20006/id_9 effect[0]
- skill-base-damage-percent | percent 0.45 (fraction) | MOD_SKILL_UNARMED "Unarmed Base Damage %" | skill Unarmed | unconditional | partially_validated | MainHand#0 imported existing power_3001/id_9 effect[0]
- skill-base-damage-percent | percent 0.45 (fraction) | MOD_SKILL_UNARMED "Unarmed Base Damage %" | skill Unarmed | unconditional | partially_validated | MainHand#0 imported planned power_3001/id_9 effect[0]
- max-resource-flat | flat 95 | MAX_ARMOR "Max Armor" | general | unconditional | partially_validated | Head#0 database item_44411 fixed[0]
- skill-damage-flat | flat 293 | BOOST_SKILL_COW "Cow Skill Damage" | skill Cow | unconditional | partially_validated | Head#0 database item_44411 fixed[1]
- skill-base-damage-percent | percent 0.45 (fraction) | MOD_SKILL_COW "Cow Skill Base Damage %" | skill Cow | unconditional | partially_validated | Head#0 database planned power_20001/id_9 effect[0]
- max-resource-flat | flat 45 | MAX_ARMOR "Max Armor" | general | conditions-met [requires Cow: met] | partially_validated | Head#0 database planned power_20002/id_9 effect[0]
- max-resource-flat | flat 125 | MAX_ARMOR "Max Armor" | general | unconditional | partially_validated | Feet#0 manual item_40358 fixed[0]
- skill-damage-flat | flat 116 | BOOST_SKILL_DRUID "Druid Skill Damage" | skill Druid | unconditional | partially_validated | Feet#0 manual item_40358 fixed[2]
- skill-damage-flat | flat 116 | BOOST_SKILL_COW "Cow Skill Damage" | skill Cow | unconditional | partially_validated | Feet#0 manual item_40358 fixed[3]
- ability-damage-percent | percent 0.45 (fraction) | MOD_ABILITY_FRONTKICK "Front Kick Damage %" | abilities hooking MOD_ABILITY_FRONTKICK via AttributesThatModDamage | unconditional | partially_validated | Feet#0 manual existing power_3024/id_9 effect[0]
- all-direct-damage-flat | flat 175 | BOOST_UNIVERSAL_DIRECT "All Direct Damage" | general (direct) | unconditional | partially_validated | Ring#0 database item_49120 fixed[0]
- ability-damage-percent | percent 0.37 (fraction) | MOD_ABILITY_COWBASH "Cow Bash Damage %" | abilities hooking MOD_ABILITY_COWBASH via AttributesThatModDamage | unconditional | partially_validated | Ring#0 database planned power_20007/id_9 effect[0]

#### Unsupported / unresolved effects

- progression-rewards-not-modifiers | Cow [A] L100 | Cow level 100 unlock rewards (Ability ×27, BonusToSkill ×10) are not stat modifiers.
- progression-rewards-not-modifiers | Unarmed [B] L100 | Unarmed level 100 unlock rewards (Ability ×20, BonusToSkill ×14) are not stat modifiers.
- unmapped-attribute BOOST_ABILITY_COREATTACK | MainHand#0 imported item_45640 fixed[1] | Core Attack Damage (BOOST_ABILITY_COREATTACK) has no validated modifier mapping yet.
- prose-effect | MainHand#0 imported existing power_20014/id_9 effect[0] | Published text effect is not interpreted: "<icon=3407>Cow's Bash inflicts bugs on the target, dealing 170 Nature damage over 10 seconds"
- prose-effect | MainHand#0 imported existing power_3006/id_9 effect[0] | Published text effect is not interpreted: "<icon=108>Unarmed attacks deal +47 Armor damage"
- prose-effect | MainHand#0 imported existing power_20015/id_9 effect[0] | Published text effect is not interpreted: "<icon=108>Indirect Nature and Indirect Trauma damage +26% while Cow skill active"
- prose-effect | MainHand#0 imported existing power_3007/id_9 effect[0] | Published text effect is not interpreted: "<icon=108>Unarmed attacks deal +5 damage and have +9 Accuracy (which cancels out the Evasion that certain monsters have)"
- unmapped-attribute COMBAT_REFRESH_HEALTH_DELTA | Head#0 database item_44411 fixed[2] | Health from Combat Refresh Abilities (COMBAT_REFRESH_HEALTH_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_POWER_DELTA | Head#0 database item_44411 fixed[3] | Power from Combat Refresh Abilities (COMBAT_REFRESH_POWER_DELTA) has no validated modifier mapping yet.
- unmapped-attribute SPRINT_BOOST | Feet#0 manual item_40358 fixed[1] | Sprint Speed Boost (SPRINT_BOOST) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_HEALTH_DELTA | Feet#0 manual item_40358 fixed[4] | Health from Combat Refresh Abilities (COMBAT_REFRESH_HEALTH_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_ARMOR_DELTA | Feet#0 manual item_40358 fixed[5] | Armor from Combat Refresh Abilities (COMBAT_REFRESH_ARMOR_DELTA) has no validated modifier mapping yet.
- unmapped-attribute COMBAT_REFRESH_POWER_DELTA | Feet#0 manual item_40358 fixed[6] | Power from Combat Refresh Abilities (COMBAT_REFRESH_POWER_DELTA) has no validated modifier mapping yet.

#### Warnings

- sparks-not-aggregated | Mastery Spark settings (simulated) on MainHand are not aggregated until T0015.
- candidate-tier-unselected | Planned candidate CowMaxHealthBoost on Ring has no tier chosen; no modifiers until a tier is selected.
- unknown-power | Planned candidate power_99999999 on Ring is not an official treasure power; retained without modifiers.
- instance-without-base-item | Unknown leggings in Legs has no official base item; no fixed effects are aggregated.
- unknown-tier | Existing power CowMaxHealthBoost tier id_999 on Legs is not an official tier of this power; not substituted.

## Before/after removal and edit (Cow/Unarmed fixture)

### Before/after: Remove the Ring item

Modifiers 22 → 20; unsupported 13 → 13; warnings 5 → 3

- removed `equipment:Ring#0/fixed:0` all-direct-damage-flat 175
- removed `equipment:Ring#0/candidate:power_20007:id_9#0/effect:0` ability-damage-percent 0.37
- warning removed: candidate-tier-unselected
- warning removed: unknown-power
- unchanged modifiers (ignoring array positions): 20

### Before/after: Remove imported existing power_3001 (MOD_SKILL_UNARMED)

Modifiers 22 → 21; unsupported 13 → 13; warnings 5 → 5

- removed `equipment:MainHand#0/existing:power_3001:id_9#0/effect:0` skill-base-damage-percent 0.45
- unchanged modifiers (ignoring array positions): 21

### Before/after: Edit imported power_20006 tier id_9 → id_8

Modifiers 22 → 22; unsupported 13 → 13; warnings 5 → 5

- removed `equipment:MainHand#0/existing:power_20006:id_9#0/effect:0` ability-damage-flat 101
- added `equipment:MainHand#0/existing:power_20006:id_8#0/effect:0` ability-damage-flat 89
- unchanged modifiers (ignoring array positions): 21

"Unchanged" compares every remaining record field except array positions (`equipmentIndex`, `modIndex`).

## Supported versus unsupported

Supported mappings and their exact guards are listed in [`src/core/calculation/README.md`](../src/core/calculation/README.md#initial-mapping-registry).

These stay explicit unsupported records:
- All prose effects
- Crit damage and chance
- `VULN_*`
- Combat refresh, taunt, reset time, cost, accuracy and evasion
- Direct, indirect and elite mitigation variants
- Pet and sender attributes
- Attributes outside the official ability hooks (`BOOST_ABILITY_COREATTACK`)
- Skill-named attributes whose label names specific abilities (`BOOST_SKILL_ANIMALHANDLING`)
- Skill unlock rewards

## Confidence and assumptions

- **Mapping rules: `partially_validated`.** Category, scope and unit come from official attribute IDs, labels, DisplayTypes, skills, damage types and ability hooks, plus the T0010 confirmed fraction display. In-game stacking and ordering are not validated here.
- **Advancement totals: `assumed`.** Table entries are treated as per-level increments and summed to the configured level. How two active skills' rewards combine (stack, max or other) is not validated, so each skill is reported separately.
- **Skill level conflicts.** Same skill, different levels: no reconciliation rule was invented, and a product decision is needed.
- **`validated`.** No modifier is `validated`. Passing tests do not prove the game mechanics.

## Risks and follow-ups

- **Product decision:** how to aggregate one skill selected in A and B at different levels. It is currently omitted with a warning.
- **Customer validation:** confirm that advancement entries are per-level increments, and check combined-skill MAX_HEALTH/MAX_POWER against CurrentStats (T0016).
- **Future mapping tickets:** crit damage/chance (with `requires-active-skill` scope), `VULN_*` target debuffs (T0014), direct/indirect/elite mitigation, and prose powers that need structured data.
- **Duplicated grammar:** the token grammar exists both in `features/mods/effect-description.ts` (display) and here. Core may not import UI code. Moving the parser to `src/data` later would leave one copy.
- **T0013** should resolve `ability-attribute-hook` scopes against each ability's `pve.attributeHooks`, and apply `skill-base-damage-percent` to the original base only.

## Documentation to update after acceptance

- `docs/Repo_Current_State.md`: T0012 completion, `src/core/calculation` API, test count
- `docs/Tickets.md`: T0012 status
- `docs/Manual_Verification_Guide.md`: the T0012 review steps
- `docs/MVP_Technical_Design.md`: modifier contract and registry summary
- `docs/Known_Issues_And_Followups.md`: the duplicate-level product decision and the shared-grammar note
