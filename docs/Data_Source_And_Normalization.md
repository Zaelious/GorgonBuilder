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

Existing pinned snapshot acquisition command (T0002):

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
7. Write a deterministic manifest with source version, pinned-input and artifact hashes, counts, and diagnostics (no changing generation timestamp).
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

`src/data/normalized/progression.ts` defines `NormalizedSkill`, `NormalizedAdvancementTable`, `NormalizedAttribute`, `NormalizedEffect`, `LevelProgression`, `ProgressionReward`, `AdvancementReference` and source/integrity types. The pure `normalizeProgression` function is in `src/data/adapters/normalize-progression.ts`; the [normalization README](../src/data/normalized/README.md) documents the complete contract and verification.

The pinned official v490 snapshot yields 188 skills, 588 advancement tables, 2,189 attributes and 23,282 effects. References such as `Balanced` resolve to official full IDs such as `3_Balanced`. Numeric levels, raw reward values, qualified reward keys and table `Keywords` are preserved. Each record retains source version, URL, hash and original definition. Missing advancement tables produce errors; unresolved attribute references are structured `integrityIssues`. No effect links are guessed from descriptions.

This layer does **not** decide reward stacking, qualifier applicability, modifier meaning or damage formula ordering. T0006 creates generated runtime lookup artifacts. T0012 will determine applicable skill-wide modifiers without double-counting one skill selected twice.

### T0004 implemented ability and dynamic-data contracts

`src/data/normalized/abilities.ts` defines `NormalizedAbility`, `AbilityKeywordRule`, `AbilityDot`, `AbilitySpecialValue`, `AbilityAcquisitionSource` and typed references/diagnostics. `normalizeAbilities(input): NormalizedAbilityData` in `src/data/adapters/normalize-abilities.ts` is pure and React-independent; it reuses T0003 normalized skills/effects. See the [normalization README](../src/data/normalized/README.md).

- Preserve official ID, `InternalName`, display `Name`, `Skill`, `Level`, and explicit `Rank` separately. Missing Rank remains null; no ranks are inferred from names or upgrade chains.
- Resolve published `UpgradeOf`, `Prerequisite`, and `SharesResetTimerWith` by internal name; retain PvE damage components, reset/delay timing, target/range/AoE, attribute hooks, and original raw values without assigning unverified combat meaning.
- Distinguish static, conditional and tooltip-only keywords. Keyword-rule candidates remain unevaluated; effect-keyword references mean **exact membership in T0003 effect Keywords**, not an applied effect or inferred effect-ID link.
- Preserve anonymous keyword/dynamic rules using snapshot-local array indices, not invented official IDs. Global dynamic records keep `ownerAbilityId: null`; embedded PvE DoTs and special values retain their ability owners and nested provenance.
- Acquisition sources link only by official ability ID; entries and unsupported fields remain raw. Store source version, URL, SHA-256, and canonical copies. Callers must independently verify input bytes against hashes; mixed versions and malformed records throw path-specific errors, while missing references produce `integrityIssues`.

For the verified **v490** snapshot, T0004 normalizes **5,972 abilities, 26 keyword rules, 2 global dynamic DoTs, 4 global dynamic special values, 4,063 acquisition sources**, with **1,757 embedded DoTs** and **1,823 embedded special values**. All **3,911 upgrade**, **3,699 prerequisite**, **3,914 shared-timer**, and **4,063 acquisition** links resolve, alongside **4,440 skill** references. There are **1,546 unresolved source-reference diagnostics**: 1,532 published `Skill: Unknown` references and 14 unmatched effect-keyword references (`MindRevealed`: 9, `HasRecentlyHeardBardSong`: 4, `TestEffect`: 1). This does not establish complete game-data integrity.

No final damage/DoT/cooldown/AoE calculations or conditional applicability are implemented. T0005 now implements items/TSys normalization; T0006 implements generated runtime data and broader completeness checks.

### T0005 implemented item and treasure-system contracts

`src/data/normalized/items-treasure.ts` defines versioned `NormalizedItemTreasureData`, `NormalizedItem`, `NormalizedTreasurePower`, `NormalizedTreasureTier`, `NormalizedTreasureProfile`, item acquisition, typed references and diagnostic contracts. Pure `normalizeItemsTreasure(input)` lives in `src/data/adapters/normalize-items-treasure.ts`; it reuses the T0003 normalized skills and source/value types. See the [normalization README](../src/data/normalized/README.md).

- Equippable items are selected by **published `EquipSlot`**, not an inferred `Equipment` keyword. All 19 observed slots, including shield, racial, mount and cosmetic equipment, remain distinct. Non-equipment item IDs are accounted for but not normalized as equipment.
- The official dataset exposes **`CraftingTargetLevel`**, not a generic item `Level`. `NormalizedItem.level` copies this value and exposes `levelSource: 'CraftingTargetLevel'`. Absent values remain null. This is **not a validated equip-level restriction**. T0009 now labels its base-equipment browsing filter “Minimum target level”, using the existing 90 default, a no-threshold option, and default-on inclusion of unknown/null targets. Published `SkillReqs`, real item-instance levels and treasure-tier requirements remain separate. This does not redefine T0005 normalization.
- Equipment retains official IDs, names, published keywords, `EffectDescs` as uninterpreted fixed-effect descriptions, optional `TSysProfile`, acquisition references, source metadata and canonical raw objects. No numeric damage modifiers are inferred.
- Powers retain `power_*` IDs, internal names, published `Skill` selector, `Slots`, availability flags, original descriptions and **power-owned** tiers. Tier identity is `(powerId, original id_* key)`, including `power_129/id_120`, not a remapped tier number. Tier ranges/rarity and published constraints are source facts, not computed applicability.
- `tsysprofiles` publishes **arrays of power InternalName strings**. Normalize exact membership and preserve array order/duplicates, but do not invent profile inheritance, eligibility rules or mod-count constraints. Profile membership and published power slots alone do not establish final mod legality.
- Preserve `sources_items` for equipment and non-equipment targets. Every record retains source version, URL, SHA-256, ID/path and canonical raw data; caller verifies original bytes against the pin before invoking normalizers.
- Search preparation uses NFKC normalization, case and whitespace folding, and literal underscore tokens plus their word forms. T0009 adds one explicit tested symmetric `lightning` ↔ `electricity` search synonym without asserting mechanical equivalence or interpreting effects.
- Unknown meanings produce uninterpreted records or diagnostics, rather than fabricated semantics. Unresolved `Skill: Unknown` references are separate from published `AnySkill` selectors; no automatic universal-skill applicability is granted.

Verified official **v490** counts: **3,078 equipment definitions**, **8,131 other item IDs**, **8,460 fixed-effect descriptions**, **1,947 powers**, **45,634 power-owned tiers**, **40 profiles**, **8,649 profile-to-power memberships**, and **10,068 item acquisition records**. All **2,578 item/profile** and **8,649 profile/power** references resolve, as do item acquisition references. **518 equipment records have published crafting target level 90+; 500 lack a published crafting target level.** T0005 retains **96 diagnostics** (6 unresolved `Skill: Unknown` references; 90 uninterpreted `AnySkill` selectors), independently of the **1,546 T0004 diagnostics**. The PR #6 quality suite passed **42 focused / 173 total tests**, lint, typecheck, build and Cloudflare dry-run in [CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41241709925).

T0006 implements reproducible runtime artifacts, a consolidated lookup repository and cross-dataset integrity/completeness checks. T0009 implements user-facing searches and level semantics, with display-only official item `IconId` projected from all 3,078 v490 equipment definitions into normalized/runtime data. Invalid icon values fail validation; failed CDN artwork uses category-icon fallback. T0010 handles context-sensitive mod eligibility; T0012 handles validated numerical effect mappings. [T0009 verification](T0009_Verification.md).

### T0006 implemented generated artifacts and runtime repository

T0006 ([PR #8](https://github.com/Zaelious/GorgonBuilder/pull/8)) adds offline `npm run data:generate` using the validated pinned v490 raw snapshot and T0003–T0005 normalizers. It produces deterministic `src/generated/game-data/{progression,abilities,itemsTreasure}.json.gz` files and `manifest.json` with source provenance, integrity hashes, record counts and full diagnostics. Generation verifies record coverage, unique IDs, cross-dataset references, nested tier ownership and v490-specific diagnostic fingerprints. Known T0004/T0005 diagnostics remain distinct; later source versions are not constrained to v490 counts.

The React-independent repository supplies typed official-ID lookups for skills, tables, abilities, equipment, treasure powers/tiers (composite power/tier IDs), profiles, attributes and effects. The lazy browser loader verifies compressed hashes, decompresses and indexes on demand. Original raw fields remain in the pinned snapshot and are traceable via `{dataset, recordId}` source locators; no unsupported meanings are inferred.

Current three compressed artifacts total **3,269,457 bytes** and expand to **72,009,523 JSON bytes**. Actual browser heap after parsing/indexing may be substantially higher. The current app shell does not load the assets; T0008/T0009 should measure performance during actual planner use before optimizing. See [runtime repository README](../src/data/repository/README.md) for API examples, record counts, diagnostics and verification.

### NormalizedTreasureProfile

Implemented as the official profile ID, exact source array, resolved power `InternalName` references, provenance and raw membership. The v490 profiles do **not** publish constraint/inheritance objects; final eligibility is not yet implemented.

### NormalizedTreasurePower

Implemented as official power ID/internal name, published Skill selector and Slots, optional flags/prefix/suffix, power-owned tier records, exact effect descriptions, source metadata, search text and canonical raw fields. Validated numeric modifier interpretation is deferred to T0012.

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
