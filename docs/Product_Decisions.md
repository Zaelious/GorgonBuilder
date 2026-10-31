# GorgonBuilder — Product Decisions

**Status:** Initial product decisions locked  
**Version:** 1.0  
**Date:** 2026-10-31

## Product Goal

GorgonBuilder is a Project Gorgon build planner focused on answering both:

1. **What can I put in this build?**
2. **What does that choice actually do to the build?**

It should retain the approachable two-skill/gear/mod planning model of tools such as GorgonExplorer while adding transparent damage calculations, Mastery Spark modeling, character import/validation, build comparison, and later stateful rotation/DPS, survivability, threat, and optimization.

## Core Build Model

A build may contain:

- Skill slot A with a selected skill level
- Skill slot B with a selected skill level
- One skill only, two different skills, or the same skill in both selectors
- Independent ability bar A and ability bar B with exact ability/rank selections
- Real Project Gorgon items
- Candidate treasure mods
- Mastery Spark configuration
- Target/dummy settings
- Saved rotation profiles later

Selecting the same combat skill in both skill slots must not double-apply skill-wide advancement/progression bonuses.

The planner intentionally does **not** need to police the final number of treasure mods while planning. A user may add many candidate mods and remove the unwanted ones while comparing outcomes.

## Item Selection

Users select real items from the official Project Gorgon item database.

Initial item-browser requirements:

- Global minimum-level filter
- Primary/default use case: **level 90+**
- Search by item name
- Search by normalized effect/stat text
- Search terms such as `lightning`, `psychic`, `taunt`, `kick`, and `combat refresh` should find relevant gear
- Filter by equipment slot
- No upper-level filter required initially

## Per-Ability Damage

Per-ability damage is the primary trustworthy performance metric.

The UI should eventually show:

- Normal-hit damage
- Critical-hit damage where applicable
- Expandable formula breakdown
- Confidence/validation state
- Later expected damage using critical probability

## Confirmed Skill Base Damage Behavior

Skill Base Damage references only an ability's original base damage.

Example:

- Original base damage: 500
- Four `+150 damage` effects: +600
- Two `+100% damage` effects produce 3300 before Skill Base contribution
- `+50% Skill Base Damage` contributes only `500 × 0.50 = 250`
- Example final value: 3550

Skill Base Damage does **not** multiply the already-scaled 3300.

## Mastery Sparks

Primary offensive Spark slots:

- MainHand
- OffHand
- Ring
- Necklace / Amulet

Mastercrafted/Prophecied items can be planned up to 110 Sparks.

Each eligible item should support:

- No Sparks
- Simulate Sparks
- Enter Actual Results

Known Skill Damage Spark probability model:

- 10%: `+0.50% All Direct Damage`
- 40%: `+1 [Skill] Damage`
- 10%: `+1 All Direct Damage`
- 24%: `+1% [Skill] Damage`
- 16%: `+3% [Skill] Base Damage`

Simulation should eventually expose one roll, rerolls, expected values, percentile/luck context, and the resulting ability/build impact.

## DPS / Rotation

GorgonBuilder must not pretend one fixed rotation represents every build.

Per-ability damage is independent of rotation.

A later **Rotation Simulator** will allow multiple named profiles per build, such as:

- Single Target Sustained
- Single Target Burst
- 5-Target AoE
- Boss Opener
- Threat/Defensive Rotation

The first rotation implementation should support explicit sequences and state tracking. A later phase should support priority rules such as "use X if buff Y is missing."

Rotation outputs should eventually include:

- DPS including setup
- Post-setup/burst DPS
- Sustained DPS over configurable duration
- Total damage
- Damage per target
- Total AoE damage
- Ability-use counts
- Damage contribution by ability
- Buff/debuff uptime where modeled

The Rotation Simulator is intentionally planned **after** the core damage engine is validated.

## Target Dummy

Initial calculations use a customizable dummy, not a full monster database.

Planned controls include:

- Enemy count
- Damage-type vulnerability/resistance
- Armor/mitigation when modeled
- Other properties required by specific abilities

Initial enemy-count UI may use 1–20 targets.

AoE abilities show both:

- Damage per target
- Total damage across configured targets

## Buff Scope

Initial damage-calculator scope:

- Skills
- Abilities
- Gear
- Treasure mods
- Mastery Sparks

Later systems, in approximate order:

1. Ability/self-buffs and target debuffs
2. Conditional gear effects/procs
3. Food/drink
4. Meditation
5. Potions/consumables
6. External/party buffs

## Character Import

Manual planning remains the primary workflow.

Character import is a planned convenience **and validation** feature.

Project Gorgon CharacterSheet/Storage exports are snapshots. An export is as current as its timestamp. An older example export does not imply the import mechanism is outdated; a newly generated export should reflect the current character state supported by the game's report format.

Import uses include:

- Load character skill levels and known abilities
- Load owned/imported item instances and their TSys powers
- Seed manual planning
- Compare Project Gorgon's `CurrentStats` with GorgonBuilder-calculated values
- Create repeatable formula-validation cases

Important limitations established from the supplied reports:

- `IsInInventory` identifies carried inventory, not reliable equipped status
- The user may need to select the active gear set from imported owned items
- Existing exports expose item-instance TSys powers and tiers
- Individual Mastery Spark outcome distribution is not assumed importable unless a current report explicitly contains it

Initial validation builds:

- Deer / Psychology
- Cow / Unarmed

## Saving and Sharing

Saving and sharing are core requirements.

Initial shared builds are **unlisted by link**.

Accounts are not required initially. Anonymous ownership uses:

- Public build ID
- Saved build JSON
- Schema version
- Timestamps
- Private owner/edit token
- Secure server-side hash of the token

The public share link never contains the owner token.

The creator's browser stores ownership locally. A separate private management/recovery link should be available for another device.

Public-link users may:

- View
- Duplicate/copy

They may not edit/delete the original.

Initial deletion may be a confirmed hard delete. Later accounts may claim anonymous builds by proving possession of the owner token.

## Build Comparison

A/B comparison is a first-class feature.

Side-by-side comparison should eventually show:

- Skills and abilities
- Ability damage
- Crit damage
- Calculation breakdown
- Offensive stats
- Spark contribution
- Later rotation results
- Later survivability/threat results

The comparison should explain **why** a number changed, not merely show a final percentage.

## Defensive / Threat Planning

Damage is the first calculation focus, but architecture must allow later:

- Health
- Armor
- Damage-type mitigation
- Direct/indirect mitigation
- Evasion
- Healing received
- Combat refresh
- Taunt/threat
- Effective survivability

Real player builds will be used to validate practical "enough tankiness" and threat thresholds.

## Automated Optimization

Later goals include searches such as:

- Highest damage Psychology build above level 90
- Best offensive MainHand/OffHand/Ring/Necklace combination
- Best expected Spark distribution
- Best single-target or AoE setup
- Highest damage subject to minimum defensive constraints

Optimization must call the same calculation engine used by manual planning.

## UI Direction

Use GorgonExplorer as a functional reference, not a visual clone.

Priorities:

- Dense but readable desktop planner
- Fast skill/item/mod search
- Real item selection
- Clear gear slots
- Clear ability bars
- Expandable math
- Easy A/B comparison
- Integrated Spark modeling

Desktop-first full editing is acceptable initially. Shared/read-only builds should remain reasonably usable on smaller screens.

## Working Product Name

- Repository: `GorgonBuilder`
- Display name: `Gorgon Builder`

Rebranding later must not require architecture changes.
