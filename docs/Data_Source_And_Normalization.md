# GorgonBuilder — Data Source and Normalization

**Status:** Initial data contract  
**Version:** 1.0  
**Date:** 2026-10-31

## Canonical Source

Official Project Gorgon public data is the source of truth for game definitions.

Relevant datasets are expected to include, depending on the current published data version:

- items
- abilities
- skills
- advancement tables / skill progression rewards
- attributes
- effects
- treasure-system client info / powers
- treasure-system profiles / item eligibility
- ability keywords
- dynamic ability values/DoTs
- item/ability sources when available

Do not hardcode one specific game-data version into architecture. Record the imported snapshot version and allow future updates.

## Third-Party Tools

Projects such as GorgonExplorer or `project-gorgon-data` may be used as:

- references for field interpretation
- optional parsing helpers after review
- comparison points

They are not a replacement for official data provenance.

## Update Pipeline

Suggested command eventually:

```text
npm run data:update
```

Conceptual steps:

1. Discover/select official data version.
2. Download required JSON.
3. Validate top-level shape.
4. Normalize into GorgonBuilder contracts.
5. Build search text/index fields.
6. Write compact generated artifacts.
7. Write manifest containing source version and generation timestamp.
8. Run normalization tests.

## Normalized Records

### NormalizedItem

Should include:

- ID
- name
- level
- slot
- keywords/tags
- innate effect descriptions
- normalized numeric effects when interpretable
- searchable text
- source metadata where available

### NormalizedSkill / Advancement Data

Should preserve:

- skill ID/name
- level/progression metadata needed by the planner
- advancement-table references
- progression rewards/attributes
- raw identifiers for rewards whose semantics are not yet understood
- enough metadata to determine which active-skill rewards apply at a selected skill level

When the same combat skill is selected in both planner skill slots, downstream modifier aggregation must treat it as one active skill for skill-wide progression rewards.

### T0003 implemented progression contracts

`src/data/normalized/progression.ts` defines `NormalizedSkill`, `NormalizedAdvancementTable`, `NormalizedAttribute`, `NormalizedEffect`, `LevelProgression`, `ProgressionReward`, `AdvancementReference` and source/integrity types. The pure `normalizeProgression` function is in `src/data/adapters/normalize-progression.ts`; the [normalization README](../../src/data/normalized/README.md) documents the complete contract and verification.

The pinned official v490 snapshot yields 188 skills, 588 advancement tables, 2,189 attributes and 23,282 effects. References such as `Balanced` resolve to official full IDs such as `3_Balanced`. Numeric levels, raw reward values, qualified reward keys and table `Keywords` are preserved. Each record retains source version, URL, hash and original definition. Missing advancement tables produce errors; unresolved attribute references are structured `integrityIssues`. No effect links are guessed from descriptions.

This layer does **not** decide reward stacking, qualifier applicability, modifier meaning or damage formula ordering. T0006 will create generated runtime lookup artifacts. T0012 will determine applicable skill-wide modifiers without double-counting one skill selected twice.

### T0004 implemented ability and dynamic-data contracts

`src/data/normalized/abilities.ts` defines `NormalizedAbility`, `AbilityKeywordRule`, `AbilityDot`, `AbilitySpecialValue`, `AbilityAcquisitionSource` and typed references/diagnostics. `normalizeAbilities(input): NormalizedAbilityData` in `src/data/adapters/normalize-abilities.ts` is pure and React-independent; it reuses T0003 normalized skills/effects. See the [normalization README](../../src/data/normalized/README.md).

- Preserve official ID, `InternalName`, display `Name`, `Skill`, `Level`, and explicit `Rank` separately. Missing Rank remains null; no ranks are inferred from names or upgrade chains.
- Resolve published `UpgradeOf`, `Prerequisite`, and `SharesResetTimerWith` by internal name; retain PvE damage components, reset/delay timing, target/range/AoE, attribute hooks, and original raw values without assigning unverified combat meaning.
- Distinguish static, conditional and tooltip-only keywords. Keyword-rule candidates remain unevaluated; effect-keyword references mean **exact membership in T0003 effect Keywords**, not an applied effect or inferred effect-ID link.
- Preserve anonymous keyword/dynamic rules using snapshot-local array indices, not invented official IDs. Global dynamic records keep `ownerAbilityId: null`; embedded PvE DoTs and special values retain their ability owners and nested provenance.
- Acquisition sources link only by official ability ID; entries and unsupported fields remain raw. Store source version, URL, SHA-256, and canonical copies. Callers must independently verify input bytes against hashes; mixed versions and malformed records throw path-specific errors, while missing references produce `integrityIssues`.

For the verified **v490** snapshot, T0004 normalizes **5,972 abilities, 26 keyword rules, 2 global dynamic DoTs, 4 global dynamic special values, 4,063 acquisition sources**, with **1,757 embedded DoTs** and **1,823 embedded special values**. All **3,911 upgrade**, **3,699 prerequisite**, **3,914 shared-timer**, and **4,063 acquisition** links resolve, alongside **4,440 skill** references. There are **1,546 unresolved source-reference diagnostics**: 1,532 published `Skill: Unknown` references and 14 unmatched effect-keyword references (`MindRevealed`: 9, `HasRecentlyHeardBardSong`: 4, `TestEffect`: 1). This does not establish complete game-data integrity.

No final damage/DoT/cooldown/AoE calculations or conditional applicability are implemented. T0005 handles items/TSys; T0006 handles generated data and broader completeness checks.

### NormalizedTreasureProfile

Should include:

- profile/internal ID
- references needed to determine which treasure powers can occur on an item/profile
- raw profile constraints that are not yet semantically interpreted

### NormalizedTreasurePower

Should include:

- internal power name
- tiers/potencies
- description
- skill association where known
- slot/profile eligibility where known
- normalized modifier outputs where validated
- raw fallback description

## Raw Preservation

Normalization must not discard information merely because GorgonBuilder does not understand it yet.

Keep enough raw identifiers/fields to:

- improve interpretation later
- debug mismatches
- migrate normalized contracts
- compare data versions

## Search Text

Item search text may be constructed from:

- name
- innate effect text
- damage type words
- skill words
- other relevant official descriptions/tags

Normalize case and whitespace.

Initial search is substring-based.

Example expectation:

Searching `lightning` should surface items whose effect text boosts Electricity/Lightning even if `lightning` is not in the item name, provided the normalized source text supports that synonym mapping.

Synonym mappings must be explicit and testable, e.g.:

- lightning ↔ electricity
- psych ↔ psychology only if intentionally supported

## Data Version in Builds

Saved builds record `gameDataVersion`.

When loading a build created under another data version:

- preserve original selections when IDs still resolve
- warn when definitions changed/missing
- do not silently substitute a different item/mod

## Data-Diff Tool — Later

A future development utility should compare game-data snapshots and report:

- added/removed items
- changed innate effects
- changed abilities
- changed treasure tiers
- changed descriptions

This will reduce breakage after Project Gorgon patches.
