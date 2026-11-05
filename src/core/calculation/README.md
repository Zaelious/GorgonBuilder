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

**Intentionally unsupported for now** (kept as `unmapped-attribute`): target vulnerability (`VULN_*`, T0014), combat refresh, taunt, reset time,
power cost, accuracy/evasion, `*_DIRECT`/`*_INDIRECT`/elite mitigation, pet and
sender attributes, attributes outside supported direct or static keyword hooks,
and skill-named families whose label names something else (e.g.
`BOOST_SKILL_ANIMALHANDLING`). Prose effects are unsupported unless a reviewed rule covers them. T0013-F1 adds 38 exact power/template definitions to the two T0014 Mock examples (`direct-treasure-rules.ts`), then one reusable *unconditional* grammar (`prose-damage-grammar.ts`): a leading damage clause whose every name resolves to official ability display names of the power's skill, the skill, or an official group damage attribute named by label, mapped to exactly one official damage attribute in the ability's hook, followed only by recognized side clauses. Conditions, conversions, split components and unknown wording fail closed; curated rules take precedence; confidence is `assumed`. Secondary clauses remain explicit unsupported records. This is *not* a general prose parser. See the [complete coverage report](../../../docs/treasure-coverage/README.md).

### Adding a mapping

Pass more rules to `createModifierRegistry([...DEFAULT_MODIFIER_RULES, rule])` and
supply it as `options.registry`. A rule has an ID, category, operation, unit,
expected DisplayTypes, confidence, assumptions and a `match(attribute, index)`
function. The function returns a scope or null. `MappingIndex` provides official
skills by ID suffix, published damage types and ability hook membership.
T0013-F2 maps `critical-chance-percent` / `critical-damage-percent` for official attributes listed in an
`AttributesThatDeltaCritChance` / `AttributesThatModCritDamage` hook (ability record or static abilitykeywords
rule). They never contribute to normal damage. The aggregation code does not change.

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

## Curated exact treasure-power rules (T0014 acceptance)

Published treasure text without an `{ATTRIBUTE}{value}` token is a `prose-effect` and is
never parsed generally. `treasure-effect-rules.ts` adds a small allow-list. Each rule names
one official power ID **and** InternalName and one full-sentence template. A tier whose text
does not match stays unsupported with a `template-mismatch` message. Every tier of both rules
is tested against v490.

| Power | Template | Modifiers (all `assumed`, `mappingRuleId` `treasure:<InternalName>`) |
|---|---|---|
| `power_4066` MockAndRidiculeBoost | "Mock and Ridicule deal +X% damage and taunt +Y" | `MOD_ABILITY_MOCK` and `MOD_ABILITY_RIDICULE` `ability-damage-percent` X/100 through the official `AttributesThatModDamage` hooks; `ABILITY_TAUNT_DELTA_MOCK/RIDICULE` `ability-taunt-flat` Y |
| `power_4032` MockBoost | "Mock hits all enemies within R meters and taunts +Y, but damage is halved and reuse timer is +S seconds" | `ability-burst-conversion` R m, `ability-damage-multiplier` 0.5, `ABILITY_TAUNT_DELTA_MOCK` taunt Y, `ABILITY_RESETTIME_DELTA_MOCK` `ability-reset-time-flat` S; scope `ability-keyword` Psychology/`Mock` |

The +X% uses the existing T0013 `ability-damage-percent` arithmetic unchanged, so it applies
only to abilities whose official record hooks that attribute (every Mock or Ridicule tier).
Taunt, reuse, conversion and multiplier categories are excluded by T0013 as
`not-normal-damage`. The T0014 scenario stage below handles the conversion and multiplier.
Working imported powers and planned candidates behave identically; historical
`metadata.sourceItem` is still never read.

## Target dummy and scenario stage (T0014)

`applyTargetDummy(result, build.target, { targetCap? })` is a separate pure stage
after `calculateAbilityDamage`. It never mutates or recomputes the T0013 result. Three
concepts stay independent:

1. **Ability-specific multiplier.** For example, Mock's "damage is halved" (`× 0.5`, assumed
   to apply after all flat, percentage and Skill Base contributions). It applies at every
   enemy count. Duplicate conversions or multipliers give no value (`multiple-ability-conversions`).
2. **Burst target-count falloff.** Uses only the documented points of the
   [2024-07-30 update](https://wiki.projectgorgon.com/wiki/Game_updates/2024-07-30):
   - full damage up to 3 targets, plus 1 per full 10 m of Burst radius (20 m → 5);
   - a radius remainder gives a probabilistic extra target (`probabilistic`, no value);
   - at 9 or more enemies, direct damage is 25% and indirect damage 50%;
   - intermediate direct counts use `linearDirectBurstEstimate`, explicitly `estimated`; indirect counts remain `undocumented`. At 20 m, 6/7/8 targets retain 81.25%/62.5%/43.75%. Radius remainders leave affected intermediate counts unresolved; a full threshold >=9 takes precedence and larger counts remain unsupported.

   `burstTargetFalloff` keeps direct and indirect separate. DoTs are still not calculated,
   so the indirect value is informational only.
3. **Affected enemies.**
   - Without a published AoE value or a conversion: 1 enemy.
   - With a curated "hits all enemies within R" conversion, or an official `Burst` keyword plus
     a published AoE value (treated as the radius, assumed): every configured enemy, under an
     explicit in-range scenario assumption. No hidden cap is inferred from the radius. Every
     damaging v490 player AoE ability is Burst.
   - A non-Burst AoE record without a known cap leaves the total null (`target-cap-unknown`).

Then the **damage-type modifier** applies. Only `target.damageTypes[<exact hit type>]` is read:
`× (1 + (vulnerability − resistance) / 100)` (assumed). A net multiplier below zero gives no
value. `steps` lists the applied stages in order; `abilityEffects` lists the applicable curated
non-damage effects (taunt, reuse) for display.

The published `ExtraDamageIfTargetVulnerable` / "Vulnerable" target state remains
T0013's `target-bonus-not-applied` limitation; it is a stateful debuff, not the
dummy's per-type percentages. Criticals remain unmodeled.

## T0013-F1 coverage and static keyword hooks

`keyword-damage.ts` adds only unconditional official `abilitykeywords` direct damage
hooks whose required/excluded keywords match static ability membership. Effect/active-skill
gates and conditional keywords remain unsupported. Original and keyword hook membership
is unioned, so the same attribute contributes once. Dot hooks are never inherited.
The existing flat, percent and original-base Skill Base arithmetic is unchanged.
`ability-attribute-hook` optionally carries the exact curated skill ID, preventing
copied hooks on unrelated or unresolved abilities from receiving a curated bonus.

`npm run coverage:treasure` walks all 52,039 published treasure effects and probes
mapped contributions through the actual aggregator/calculator. Its deterministic
report separates inventory completeness, direct-damage coverage (direct hit components
only), other mechanics (taunt, reuse, DoT, crit, pets...) and validation confidence,
with three snapshots: T0014 (no keyword rules, two Mock rules), the first T0013-F1
commit (no grammar) and final. Audit prose screening never supplies runtime damage formulas.
See [verification](../../../docs/T0013_F1_Verification.md) for assumptions and limitations.

## Critical hits and target conditions (T0013-F2)

`calculateCriticalHit(result, target, { creatureType, skillLevel }, repository)` is a separate pure stage after
`applyTargetDummy`. It never changes T0013/T0014 results.

- **System:** official static keyword `PhrenologyCriticals` / `AnatomyCriticals` (`critical-rules.ts`). Conditional
  grants (Knife, Vampirism) are unavailable; a multiplier without a keyword is unresolved; neither means no system.
- **Chance:** cumulative official sub-skill reward notes at the effective level for the selected creature's sub-skill
  (`criticalChanceTable`), only for the skills the notes name, plus applicable chance bonuses (additive, assumed).
  Unknown creature or missing level gives null. A creature without a Phrenology sub-skill gives 0% (assumed).
- **Multiplier:** published `CritDamageMod` plus applicable critical-damage bonuses (additive, assumed). The Archery
  1.25 value conflicts with the wiki's Anatomy 1.5 and stays explicitly assumed.
- **Values:** critical = per-target hit × M; expected = N × (1 − p) + C × p, per hit component and in totals.
- **Skill levels:** `resolveCriticalSkillLevel` — manual override, else a uniquely resolved imported exported `Level`
  (BonusLevels never re-added), else null. Missing/unresolved sub-skills are never level 0.
- **Target conditions:** `aggregateBuildModifiers(build, data, { target: { creatureType, elite } })` evaluates the
  curated `target-creature-type` / `target-elite` conditions (`critical-treasure-rules.ts`); unknown targets leave them
  unevaluated (uncertain, not added).
- The coverage report's three snapshots pin the T0013-F1 rules and registry, so they remain byte-identical.

See [T0013-F2 verification](../../../docs/T0013_F2_Verification.md) for sources, confidence and fixtures.

## Current Stampede stacks and direct-damage procs (T0014-F1)

`scenario-treasure-rules.ts` maps six exact v490 identities/full tier templates into ordinary damage plus separate
`stampede-damage-per-stack` / `chance-damage-proc` inputs. Aggregation preserves source, exact tier, probability,
effect and assumptions. These categories never enter ordinary damage automatically.

`calculateStampedeScenario(result, targetConfig, stacks, repository)` returns the unchanged zero-stack target
baseline, per-source stack contributions, and an Estimated projected result. It assesses applicability through
the ordinary engine, then reuses `calculateAbilityDamage` with derived ability flats and `applyTargetDummy`.
Zero stacks reuse the original result. Skill Base continues to use the original published base.

`calculateDamageProcs(result, ordinaryTarget, targetConfig, repository)` returns separate noncritical proc sources,
chance, triggered hit, expected per successful hit and target totals. Multipliers scale the final ordinary hit;
flat procs recalculate through the ordinary engine and target stages. Both placements are Estimated. Multiple
sources or recognized adjacent unsupported effects withhold combined outcomes; isolated sources retain provenance.
Missing bases/targets, unevaluated conditions, version mismatches and ambiguous flat allocation never become zero.
Critical results remain an independent downstream stage; no joint critical/proc expectation is invented.

Only `expectedProcHit` is a probability identity. These scenarios are not a timeline, stack tracker or DPS model.
The optional UI stores current stacks in sessionStorage only. The three historical coverage snapshots exclude
these new rules; [the separate audit](../../../docs/treasure-coverage/T0014-F1.md) lists all 150 new tier mappings.

R1 adds exact `power_20020/CowStampedeVsStunned` (25 tiers). The optional sixth argument to
`calculateStampedeScenario` is the player-only `whileStunned` boolean (default false). The result retains `stacked`
for the stack-only comparison and `projected` for the combined hit. The equipped scenario percentage becomes an
ordinary ability percentage only when enabled; all existing formula/target stages and original-base Skill Base
behavior are preserved. It is not a universal final-hit multiplier.
