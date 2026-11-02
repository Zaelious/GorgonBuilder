# Build modifier aggregation (T0012)

`aggregateBuildModifiers(build, data, options?)` converts one `BuildDocument` into
calculation-ready **modifier inputs**. It is pure, deterministic and React-free.
It computes no ability damage, crits, DoTs, DPS or Sparks (T0013/T0015).

```ts
import { aggregateBuildModifiers, formatAggregationReport } from './index';

const result = aggregateBuildModifiers(build, repository); // T0006 runtime repository
result.modifiers;   // NormalizedModifier[] in source order
result.unsupported; // source records with no validated interpretation
result.warnings;    // unresolved references and build-level conditions
formatAggregationReport(result, 'Review'); // plain-text review report
```

`data` is any `ModifierDataContext` (a `Pick` of `GameDataRepository`). The build and
data are only read; every result is a fresh object.

## Sources, in output order

1. **Unique active skills** from `getUniqueActiveSkillIds` (A, then B).
   - The skill's official `activeAdvancement` (and `passiveAdvancement`, if any)
     table. Entries for levels `1..configured level` are summed per attribute and
     source qualifier. Every contributing `sourceLevelKey` and value is kept.
     Summing is an assumption, so these modifiers are always `assumed`.
   - The same skill in A and B at one level contributes once. `source.slots` is `['A','B']`.
   - The same skill in A and B at **different** levels has no reconciliation rule.
     Its advancement rewards are omitted, with a `skill-level-conflict` warning and
     unsupported record. No level is chosen.
   - Skill `progression` unlocks (Ability, Recipe, Notes, BonusToSkill) are not
     stat modifiers. Each skill gets one `progression-rewards-not-modifiers` record
     with counts.
   - Skill level alone never creates a damage multiplier.
2. **Equipment**, in `build.equipment` order. Each record has `equipmentKey`
   (`<slot>#<occurrence>`) plus `equipmentIndex`, slot, item kind, exact item ID and resolution.
   - Fixed effects of the official item (`database.itemId` or instance `baseItemId`).
   - **Effective existing powers**: `instance.existingPowers` only, the working copy
     after T0011-F2 edits/removals. `metadata.sourceItem` and
     `metadata.originalWorkingPowers` are historical evidence and are never read.
   - **Planned candidates**: `candidateMods`, with `origin: 'planned'`. A null tier,
     unknown power or unknown tier is a warning. Nothing is substituted with a nearby tier.
   - Existing and planned copies of the same power are separate records. Nothing is
     deduplicated by description. No mod-count or legality limit is applied.
   - Spark settings other than `none` produce a `sparks-not-aggregated` warning.

Keys only use source identity, such as
`equipment:MainHand#0/existing:power_3001:id_9#0/effect:0`. Removing another item
or power does not change unrelated keys. Removing an item or mod removes only the
records it contributed.

## Effect grammar

Fixed effects and TSys tiers publish `{ATTRIBUTE}{delta}` or
`{ATTRIBUTE}{delta}{RequiredSkill}`. Prose descriptions are never parsed for numbers.
A third argument means the player must have that skill active. It becomes a
`requires-active-skill` condition (`met`/`not-met` against the active skills). The
modifier is kept either way, and its `applicability` records the result.

## Initial mapping registry

Every rule needs an official attribute record, the expected official `DisplayType`,
and an official identity:

| Rule / category | Attribute family | Scope |
|---|---|---|
| `skill-base-damage-percent` | `MOD_SKILL_<SKILL>` | official skill; label names the skill |
| `skill-damage-flat` | `BOOST_SKILL_<SKILL>` | official skill; label names the skill |
| `skill-damage-percent` | `MOD_SKILL_ALL_<SKILL>` | official skill; label names the skill |
| `ability-damage-flat` | `BOOST_ABILITY_<X>` | abilities listing it in `AttributesThatDeltaDamage` |
| `ability-damage-percent` | `MOD_ABILITY_<X>` | abilities listing it in `AttributesThatModDamage` |
| `all-direct-damage-flat` / `-percent` | `BOOST_` / `MOD_UNIVERSAL_DIRECT` | general, direct |
| `all-indirect-damage-flat` / `-percent` | `BOOST_` / `MOD_UNIVERSAL_INDIRECT` | general, indirect |
| `all-damage-flat` / `-percent` | `BOOST_` / `MOD_UNIVERSAL` | general, direct and per-tick |
| `damage-type-direct-flat` / `-percent` | `BOOST_` / `MOD_<TYPE>_DIRECT` | published damage type |
| `damage-type-indirect-flat` / `-percent` | `BOOST_` / `MOD_<TYPE>_INDIRECT` | published damage type |
| `damage-type-flat` / `-percent` | `BOOST_` / `MOD_<TYPE>` | delivery only when the label states it, else null |
| `max-resource-flat:*` | `MAX_HEALTH`, `MAX_POWER`, `MAX_ARMOR` | general |
| `damage-type-mitigation-flat` | `MITIGATION_<TYPE>` | damage type, delivery unspecified |

Flat rules expect `AsBuffDelta` (`AsInt` for MAX_*), with `points` as the unit.
Percent rules expect `AsBuffMod`, with `fraction` as the unit (0.45 = +45%, the
T0010 confirmed display convention). The exact published number text is kept in
`sourceValue`. A name match with the wrong DisplayType is
`unexpected-display-type`. Against v490, no official attribute matches two
rules, and each rule maps at least one attribute. A test enforces both.

**Confidence.** Mapping rules are `partially_validated`: their identity and unit
come from official data and the confirmed display convention, but stacking and
order are not validated in game. Advancement totals are `assumed`. Nothing is
`validated` until customer game-math checks (T0013) confirm it. Each modifier
has its own `assumptions`.

**Intentionally unsupported for now** (kept as `unmapped-attribute`): crit damage and
chance, target vulnerability (`VULN_*`, T0014), combat refresh, taunt, reset time,
power cost, accuracy/evasion, `*_DIRECT`/`*_INDIRECT`/elite mitigation, pet and
sender attributes, attributes outside ability hooks (e.g. `BOOST_ABILITY_COREATTACK`),
and skill-named families whose label names something else (e.g.
`BOOST_SKILL_ANIMALHANDLING`). All prose effects are also unsupported.

### Adding a mapping

Pass more rules to `createModifierRegistry([...DEFAULT_MODIFIER_RULES, rule])` and
supply it as `options.registry`. A rule has an ID, category, operation, unit,
expected DisplayTypes, confidence, assumptions and a `match(attribute, index)`
function. The function returns a scope or null. `MappingIndex` provides official
skills by ID suffix, published damage types and ability hook membership.
`critical-damage-percent` and `critical-chance-percent` are reserved categories
with no default rule. The aggregation code does not change.

## Fixtures and review

`fixtures.ts` holds synthetic builds that use only committed v490 IDs:
`psychologyFixture` and `cowUnarmedFixture`. The second includes a database item,
a manual item with and without a base item, and an imported weapon. Its historical
`sourceItem` intentionally differs from the working powers.
`docs/T0012_Verification.md` contains the generated reports.

```sh
npx vitest run src/core/calculation
```
