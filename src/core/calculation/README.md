# Build modifier aggregation (T0012)

`aggregateBuildModifiers(build, data, options?)` converts one `BuildDocument` into
calculation-ready **modifier inputs**. It is pure, deterministic and React-free.
It computes no ability damage, crits, DoTs, DPS or Sparks (T0013/T0015).

T0013 adds the separate `calculateAbilityDamage` consumer described below. The
T0012 aggregation behavior and contracts remain unchanged.

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

## Ability damage (T0013)

```ts
import { aggregateBuildModifiers, calculateAbilityDamage, formatAbilityDamageReport } from './index';

const aggregation = aggregateBuildModifiers(build, repository);
const result = calculateAbilityDamage('ability_6553', aggregation, repository); // exact Mock 11
result.ability;           // original normalized official record (or null)
result.components;        // ordinary, health-specific, armor-specific, then embedded DoTs
result.normalDamage;      // null unless one hit component and every dependency is validated
result.provisionalDamage; // supported-subset arithmetic, not a complete game prediction
result.criticalDamage;    // always null
formatAbilityDamageReport(result);
```

`AbilityDamageData` is a small `Pick<GameDataRepository>`: `gameDataVersion`,
`getAbility`, `getSourceMetadata`. It accepts the existing runtime repository.
There is no second aggregator, I/O, React, RNG, clock or mutable global state.
Read-only input records can be shared in the result; the engine never mutates
them. Callers must treat the returned records as read-only too.

### Components and applicability

The engine preserves `PvE.Damage`, `HealthSpecificDamage` and `ArmorSpecificDamage`
separately, including explicit zero and absent/null values. Negative/nonfinite
bases are unresolved. It never chooses a rank by name or adds components together.
Absent fields cannot be created by equipment flats. With several published hit
fields, nonzero flats remain uncertain because their allocation is unknown.
Each component carries a decision for every aggregated modifier and its original
T0012 source, key, power/tier, mapping confidence and conditions.

- Skill-scoped modifiers require exact resolved skill identity **and** the relevant
  PvE component hook (`AttributesThatModBaseDamage`, `AttributesThatDeltaDamage`,
  or `AttributesThatModDamage`). Both skills being active never makes them universal.
- Ability modifiers require exact attribute membership in the named component hook.
- Damage-type identity is exact; no spelling aliases or substring matching.
- General/type delivery is checked against the component. Unspecified delivery is
  uncertain. Treating hit fields as direct is an explicit assumption, including
  when it is used to exclude an indirect bonus.
- Required skills are checked against `aggregation.activeSkillIds`; evaluated
  `not-met` and unevaluated conditions never add damage.
- Resources, incoming mitigation and critical modifiers are excluded from normal damage.
- Embedded DoTs retain published bases and their official conditions/timing/hooks.
  Direct bonuses are excluded; matching indirect bonuses remain uncertain. No
  activation, per-tick damage, duration total, stacking or rotation is simulated.

Unknown effects are not parsed as prose to guess applicability. All original
unsupported effects and warnings remain in `result.aggregation`. Non-stat progression
unlock summaries alone do not block damage; other unsupported effects and aggregation
warnings conservatively prevent a final result. Known conditional/keyword rules,
special values/info and effect constraints also prevent a complete result until
their semantics are supported. This intentionally withholds many official results.

### Explicit calculation stages

For **each** supported hit component, let `B` be its original base, `F` its applied
flats, `P` its applied non-Skill-Base percentage fractions, and `S` its Skill Base fractions:

```text
preview = (B + sum(F)) + sum((B + sum(F)) × each P) + sum(B × each S)
```

This is `supported-components-v1`, a provisional formula, not a validated universal
game formula. Steps preserve each individual source and category, with `before`,
`basis`, `operand`, `contribution`, `after`, `ruleConfidence` and effective
`confidence`. The category order is skill, ability, all-direct, all-damage, then
damage-type; flats precede non-base percentages, and Skill Base comes last. Every
non-base percentage uses the **same** post-flat basis; later categories do not compound.
Skill Base **always** uses `B`, even after other steps have changed the subtotal.
Removing a flat can also change downstream assumed percentage contributions; the
trace makes that dependence visible. No game rounding, clamp or cap is invented;
JavaScript floating-point artifacts can appear in unrounded previews.

Only the Skill Base contribution rule `B × fraction` is confirmed. Its placement
relative to other percentages is assumed. Extension to health/armor-specific bases
is also assumed. The illustrative 3550 example is tested as **assumed**, with only
the +250 contribution marked validated. This does not claim an observed 3550 hit.

Confidence inherits the weakest participating input/rule. Unknown potentially
relevant inputs make the result `unknown`; known exclusions do not inherit unrelated
modifier confidence. `normalDamage` requires `validated` dependencies; partial mapping
confidence already withholds it. `provisionalDamage` is a supported-subset preview
even when other effects are unresolved, so always present it alongside warnings.
No overall number is returned for mixed hit components. Critical output remains null.
The context is PvE normal damage before target effects; vulnerability bonuses,
resistance/mitigation, Phrenology, AoE conversion/caps and criticals are not calculated.

See [T0013 verification](../../../docs/T0013_Verification.md) for the assumption table,
reproducible official-data reports, tests and controlled in-game comparison procedure.
