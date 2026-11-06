# GorgonBuilder — Damage and DPS Model

**Status:** Initial calculation model  
**Version:** 1.0  
**Date:** 2026-10-31

## Purpose

This document separates confirmed mechanics from assumptions and defines how the calculation engine should represent damage.

The engine must not force all Project Gorgon tooltip terminology into one generic `% damage` bucket.

## Confirmed Rule: Skill Base Damage

Skill Base Damage references only the original ability base number.

Example:

```text
Original ability base = 500
Flat damage mods      = +150 × 4 = +600
Damage % mods         = +100% × 2

Pre-Skill-Base result = 3300

Skill Base +50%
= 500 × 0.50
= +250

Final example result = 3550
```

The +50% Skill Base contribution is **+250**, not +50% of 3300.

## Modifier Categories

Initial normalized categories should be distinct even when final interaction ordering is not fully validated:

- original ability base
- skill-base contribution
- flat skill damage
- flat ability-specific damage
- flat all-direct damage
- skill damage %
- damage-type direct %
- all-direct %
- ability-specific %
- direct/indirect modifiers
- AoE conversion/penalty
- damage conversion
- target vulnerability/resistance
- critical chance
- critical damage
- DoT/indirect components
- conditional effects

Do not collapse categories solely because two tooltips both say "damage."

## Calculation Breakdown

Every calculation result should expose ordered steps.

Illustrative display:

```text
Original base                       500
Flat Psychology Skill Damage       +600
Skill/general percent scaling    × 3.00
Subtotal                           3300
Psychology Skill Base +50%         +250
All Direct flat                     +40
All Direct percent                × 1.18
Target vulnerability              × 1.00
---------------------------------------
Final normal hit                  3941.2
```

This example is illustrative except for the confirmed Skill Base behavior. Actual ordering must be validated before being marked exact.

## Validation States

Every formula rule can use:

- `validated`
- `partially_validated`
- `assumed`
- `unknown`

A final ability result inherits warnings/confidence from the rules it depends on.

## Validation Fixtures

Initial customer-provided validation focus:

### Psychology

Known useful observations include:

- naked/base Mock values
- Skill Base changes applying only to original base
- large flat and percent scaling from gear
- All Direct interactions
- AoE conversion penalty behavior

### Cow / Unarmed

Useful because the customer has heavily developed equipment/Sparks and can produce before/after snapshots.

### Deer / Psychology

Useful for cross-skill and transformation-specific interactions.

## Snapshot Validation

CharacterSheet exports contain `CurrentStats`.

GorgonBuilder should map supported Project Gorgon aggregate-stat keys into its normalized stat model.

Validation view compares:

```text
Imported Project Gorgon value
vs
GorgonBuilder modeled value
vs
difference
```

A current export is a current snapshot. Historical exports remain useful as historical fixtures.

## Critical Hits

Critical calculation is separate from normal hit.

Until exact crit rules are validated:

- display known crit multiplier components
- do not fabricate unknown crit chance
- allow target-dependent or skill-dependent crit logic to remain marked unsupported/assumed

**T0013-F2 implementation (in review, not game-validated):** chance = cumulative official Anatomy/Phrenology
sub-skill reward notes for the selected creature type (partially validated against the wiki) + applicable equipment
chance bonuses (assumed additive); multiplier = published `CritDamageMod` + applicable critical-damage bonuses
(assumed additive; Archery 1.25 vs wiki Anatomy 1.5 is an open conflict); critical = final per-target hit × multiplier;
expected per successful hit = normal × (1 − p) + critical × p. See [T0013-F2 verification](T0013_F2_Verification.md).

## AoE

Ability cards show:

- per-target damage
- total across configured enemy count

If an ability has an AoE penalty/conversion, that rule is applied to per-target damage before multiplying by affected targets.

Unknown target caps must be surfaced rather than assumed infinite.

## DoTs / Indirect Damage

DoT components should be modeled separately from direct hits.

Record:

- per-tick damage
- tick interval when known
- duration when known
- number of ticks when derived
- stacking/refresh rules when known

Do not combine direct + DoT into one number if the timing/stacking behavior is uncertain.

## DPS Is Not the Same as Ability Damage

Per-ability damage is the first implementation target.

DPS depends on player rotation and state.

The later Rotation Simulator will track:

- timestamps
- cooldowns
- buffs
- debuffs
- stack counts
- consumed effects
- DoTs
- target count
- conditional modifiers
- resources where materially relevant

It will call the same ability calculator at each simulated action.

## Rotation Profiles — Later

A build may save multiple profiles:

- Single Target Sustained
- Burst
- AoE
- Boss Opener
- Threat

Phase 1 uses an explicit sequence with repeat boundaries.

Phase 2 uses priorities/conditions such as:

```text
If Buff X missing -> use A
Else if Debuff Y missing -> use B
Else if stacks >= 3 -> use C
Else -> use D
```

## DPS Outputs — Later

Report multiple metrics:

- total damage
- total time
- setup-inclusive DPS
- post-setup/burst DPS
- sustained DPS over chosen duration
- per-target AoE
- total AoE
- ability usage counts
- damage by ability
- buff/debuff uptime

Never reduce a setup-heavy build to one unexplained DPS number.

## T0013-F1 direct Burst estimate policy

The documented full-damage threshold is `3 + floor(radius / 10)`. For an exact
multiple-of-ten radius with threshold below nine, intermediate direct retention is
**estimated** as `1 - (enemies - threshold) * (0.75 / (9 - threshold))`.
At 20 m, 6/7/8 enemies retain 81.25%/62.5%/43.75%; 5 is full and 9 reaches 25%.
This is the requested interpolation, not measured current game behavior.
Radius remainders preserve the probability of an extra full-damage target without
inventing a roll or expected value. Thresholds at/above nine retain full damage
through their allowance and leave further falloff unsupported. The existing Mock
×0.5 ability penalty remains separate. No indirect/DoT totals are added.

## T0015 Mastery Sparks

Skill Damage Spark outcomes (10% +0.50% All Direct, 40% +1 Skill, 10% +1 All Direct, 24% +1% Skill, 16% +3% Skill
Base) are simulated reproducibly from a saved seed or entered as actual counts. Their totals enter the engine as the
existing modifier categories above: there is no separate Spark formula, and no category or step order changes. Spark
Skill Base therefore also contributes `original base × fraction` only. For example, 110 actual Sparks of 11/44/11/26/18
on Mock 11 (base 178) give `178 + 44 + 11 = 233`, `233 × 0.315 = 73.395` and `178 × 0.54 = 96.12`, for **402.515**.
Spark values are the product-owner model (not official data). All outcomes are assumed to require the configured skill
to be active. Results stay **Estimated**. Analytical expected values are displayed separately and never applied. See
[T0015 verification](T0015_Verification.md).
