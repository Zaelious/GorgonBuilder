# GorgonBuilder — Full Design Document

**Status:** Baseline architecture approved for first implementation series  
**Version:** 1.0  
**Date:** 2026-10-31

## 1. Purpose

GorgonBuilder is a data-driven Project Gorgon theorycrafting application. It combines a traditional equipment/mod planner with a transparent calculation engine.

The application's long-term value comes from five connected capabilities:

1. Build composition from real game data
2. Transparent per-ability calculation
3. Mastery Spark modeling
4. Import/validation against real character snapshots
5. Stateful combat simulation and optimization later

The design must prioritize correctness and traceability over pretending uncertain formulas are exact.

## 2. Product Principles

### 2.1 Official data first

Official Project Gorgon public data is the canonical source for:

- skills
- advancement tables / skill progression rewards
- abilities
- items
- treasure-system powers
- treasure-system profiles / item eligibility
- effects
- attributes
- sources where available

Third-party tools/libraries may be used as implementation references or parsers, but GorgonBuilder should preserve its own normalized schema and validation tests.

### 2.2 Calculation transparency

Every calculated value should be explainable.

A user should be able to expand an ability and see where its damage came from rather than receiving one opaque final number.

### 2.3 Separate facts from interpretation

The system distinguishes:

- raw official data
- normalized data
- GorgonBuilder formula rules
- observed in-game validation

A formula/mechanic can be marked:

- `validated`
- `partially_validated`
- `assumed`
- `unknown`

### 2.4 Build planning is permissive

The planner should not over-police users while exploring combinations. Slot applicability should be known and visible, but users may stage more candidate mods than a final legal item can contain.

### 2.5 One calculation engine

The same pure calculation engine must serve:

- ability cards
- A/B comparison
- imported-character validation
- future rotation simulation
- future optimization

Do not duplicate formulas.

## 3. Major User Flows

### 3.1 Manual build creation

1. Open planner.
2. Choose skill A and skill B.
3. Choose abilities.
4. Set minimum item level, commonly 90+.
5. Select real items for equipment slots.
6. Add candidate treasure mods.
7. Configure/simulate Sparks on eligible offensive items.
8. View ability damage and breakdown.
9. Save/share or compare.

### 3.2 Item/effect search

The user can search equipment by:

- item name
- normalized innate effect text
- normalized treasure-related text where applicable
- semantic keywords represented directly in the data text, such as lightning/psychic/taunt/kick

Initial implementation can use normalized substring search. Fuzzy search is optional later if performance/usability warrants it.

### 3.3 Character import

1. User selects a CharacterSheet JSON file.
2. User selects a Storage JSON file.
3. Browser validates the report types/schema.
4. Character skills/abilities/current stats are imported.
5. Owned item instances and TSys powers are imported.
6. User chooses which imported items form the planner loadout.
7. GorgonBuilder compares modeled aggregate values with imported `CurrentStats` where mappings exist.

No server upload is required for parsing.

### 3.4 Save/share

1. User saves a build.
2. Backend creates public ID and private owner token.
3. Browser stores owner token locally.
4. Public URL is read-only.
5. Owner can edit/delete when the token is available.
6. Other users can duplicate the build into a new build.

## 4. Domain Model

Core hand-written domain concepts:

### Build

- schemaVersion
- title
- skillSlotA with skill ID and selected level
- skillSlotB with skill ID and selected level
- independent ability bar A and ability bar B with exact ability/rank IDs
- equipment selections
- candidate mods
- Spark configurations
- target configuration
- notes/metadata
- optional imported-character reference metadata
- later rotation profiles

### ItemDefinition

Canonical item from game data:

- item ID
- internal/display name
- level/tier
- slot
- item keywords/tags
- innate effects
- source metadata where available
- normalized searchable text

### ItemInstance

User-selected/imported concrete instance:

- base item ID
- generated/display name
- level
- rarity
- slot
- TSys powers with tiers
- crafted/augmented/attuned metadata when available
- source: database/manual/import
- Spark configuration entered/simulated in GorgonBuilder

### TreasurePower

- internal power ID/name
- tiers
- effect descriptions
- slot/profile metadata when available
- normalized effects
- skill association where determinable

### AbilityDefinition

- internal ability ID/name
- skill
- rank/tier
- base damage components
- damage type
- direct/indirect classification
- cooldown/timing metadata where available
- AoE/target information where available
- effect hooks
- confidence metadata for derived interpretation

### Modifier

Normalized calculation input.

Build-wide modifier aggregation must be able to combine the unique active-skill advancement rewards, fixed/innate item effects, imported existing TSys powers, user-staged candidate mods, and later Spark/buff sources without double-counting the same active skill when it is selected in both skill slots:

- source ID
- source type
- scope
- operation
- stat key
- numeric value
- condition
- confidence
- provenance

### CalculationResult

- ability
- normal damage
- crit damage where available
- expected damage later
- per-component breakdown
- assumptions
- warnings
- confidence summary

## 5. Data Pipeline

Official raw data should not be consumed directly throughout the UI.

Pipeline:

```text
Official PG data
    ↓
raw adapters
    ↓
schema validation
    ↓
normalizers
    ↓
GorgonBuilder normalized dataset
    ↓
search indexes + calculation-ready records
    ↓
UI / calculator
```

The normalized dataset should record the upstream game-data version.

The app should display the data version somewhere unobtrusive so theorycraft results can be associated with a game-data snapshot.

## 6. Damage Model

The damage engine is pure and React-independent.

It receives:

- ability definition
- build-derived modifiers
- optional target state
- optional temporary state later

It returns a structured breakdown.

Do not flatten all `% damage` terminology into one bucket without validation.

Confirmed Skill Base behavior is documented in `Damage_And_DPS_Model.md`.

## 7. Spark Model

Sparks are not ordinary treasure mods.

The planner represents:

- eligible slot/item
- Spark category
- maximum modeled Spark count
- simulation seed/result
- aggregate outcomes
- manual actual outcomes

Simulation must be reproducible under a fixed seed for tests.

The UI can generate a fresh random seed for user rerolls.

## 8. Character Import and Validation

The supplied CharacterSheet and Storage JSON reports establish that structured import is feasible.

CharacterSheet supports:

- character/server/timestamp metadata
- skills and levels
- known abilities
- current aggregate stats

Storage supports:

- item TypeID
- name
- level
- slot
- rarity
- exact TSys power IDs and tiers
- crafted/augmented/attuned metadata
- inventory/storage location metadata
- other item-instance fields depending on report version

Import design must be forward-tolerant:

- record report version
- ignore unknown optional fields safely
- preserve raw metadata when useful
- fail clearly on incompatible structural changes

A current export should be treated as a current snapshot. An old example export is merely an old snapshot.

## 9. Persistence

### Browser-local state

Use browser storage for:

- unsaved/current draft
- owner tokens keyed by public build ID
- user preferences such as minimum item level
- optionally recent builds

### Shared-build backend

Provider-agnostic backend contract:

- create build
- get public build
- update build with owner token
- delete build with owner token
- duplicate is client-side create using copied payload

Exact provider is selected in a dedicated infrastructure ticket.

## 10. Security / Privacy

- Character JSON imports are parsed locally by default.
- Do not upload entire character/storage reports without explicit future design.
- Owner tokens must have sufficient entropy.
- Store token hashes server-side, not plaintext.
- Public share URLs do not expose owner tokens.
- Validate saved build payload size and schema.
- Treat all imported/generated item names and notes as untrusted display text.

## 11. Comparison

Build comparison consumes two independent Build states and the same calculation engine.

Comparison layers:

1. build metadata
2. skill/ability selection
3. equipment/mod differences
4. Spark differences
5. aggregate stat differences
6. ability-result differences
7. later rotation and survivability differences

## 12. Rotation Simulator — Later Architecture

Not part of T0001–T0021 implementation. Rotation work begins in the next ticket series after the v1 per-ability calculator, import validation, comparison, and save/share workflows have been stabilized.

It will consume:

- Build
- Ability Calculator
- RotationProfile
- TargetState
- Simulation duration

It must maintain time-varying state for:

- cooldowns
- buffs
- debuffs
- stacks
- consumed effects
- DoTs
- target counts
- conditional effects
- resources where relevant

Phase 1: explicit sequence/timeline.  
Phase 2: priority rules.

The simulator must call the same ability calculator rather than reimplementing damage.

## 13. Defensive / Threat Engine — Later

Use the same Modifier model to support:

- max health/armor
- mitigation
- vulnerability
- direct/indirect reductions
- evasion
- healing received
- combat refresh
- taunt/threat

Practical tank builds supplied by the customer will be used as validation fixtures.

## 14. Optimization — Later

An optimizer enumerates/searches candidate build states and scores them using the same calculation engines.

No optimization feature may define its own separate damage rules.

## 15. Non-Goals for First Ticket Series

T0001–T0021 deliver the working v1 planner and do not attempt to fully implement:

- stateful rotation simulation
- public build gallery
- accounts
- live combat log parsing
- all food/meditation/potion/party buffs
- defensive/threat scoring
- automated optimization
- mobile-first editor

## 16. Definition of a Trustworthy Result

A result is trustworthy when:

- data provenance is known
- modifier categories are explicit
- formula order is documented
- unsupported assumptions are surfaced
- pure-engine tests pass
- real in-game validation supports the result where possible
