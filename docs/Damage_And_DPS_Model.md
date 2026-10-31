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
