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

### NormalizedAbility

Should include:

- ID/internal name
- display name
- skill
- rank
- damage components
- damage types
- cooldown/timing
- AoE metadata
- effect links
- raw fields needed for future interpretation

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
