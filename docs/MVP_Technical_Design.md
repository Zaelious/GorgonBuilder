# GorgonBuilder — MVP Technical Design

**Status:** Approved baseline  
**Version:** 1.0  
**Date:** 2026-10-31

## Stack

Frontend:

- Vite
- React
- TypeScript with strict mode
- Vitest for unit tests
- React Testing Library only when component tests add clear value
- CSS Modules / normal CSS variables; no styling framework required initially

Backend:

- Provider-agnostic interface first
- Small persistence API introduced in the save/share phase
- Provider chosen in a dedicated infrastructure ticket based on simplicity, cost, deployment ergonomics, and anonymous token support

## Folder Direction

```text
src/
├─ app/
│  ├─ App.tsx
│  └─ routes/
├─ core/
│  ├─ build/
│  ├─ calculation/
│  ├─ sparks/
│  ├─ import/
│  └─ validation/
├─ data/
│  ├─ raw/
│  ├─ normalized/
│  ├─ adapters/
│  └─ search/
├─ features/
│  ├─ skills/
│  ├─ abilities/
│  ├─ equipment/
│  ├─ mods/
│  ├─ sparks/
│  ├─ comparison/
│  └─ import/
├─ persistence/
│  ├─ local/
│  └─ remote/
├─ generated/
│  └─ game-data/
├─ styles/
└─ test/
```

Exact folders may be adjusted by early tickets, but dependency direction is mandatory:

```text
UI/features
    ↓
core domain/calculation
    ↓
normalized data contracts
```

React must not be imported by `src/core`.

## State

Initial build editor state should use typed React state/reducer patterns without adding a global-state dependency prematurely.

The serializable `BuildDocument` is separate from transient UI state.

Transient UI state examples:

- search query
- expanded cards
- selected modal tab
- pending simulation seed

Serializable build examples:

- skill selections
- abilities
- items
- candidate mods
- Sparks
- target configuration

**Implemented in T0007:** `src/core/build/document.ts` defines the JSON-serializable `BuildDocument` schema v1 and factory; `validation.ts` defines strict validation/serialization and explicit unsupported-version results. The slots hold independent skill IDs and levels with separate ordered ability bars. Equipment holds canonical IDs or manual/imported instances, existing TSys powers, candidate mods and Spark configuration; targets and optional character-import metadata are stored without interpreting combat rules. `getUniqueActiveSkillIds` deduplicates skill IDs without reconciling different levels. T0008 keeps transient editor state outside the persisted document.

**Implemented in T0008:** The UI commits immutable edits to `BuildDocument.title`, two independent skill/level choices, and ordered six-slot bars via `src/app/editor/build-editor.ts`. Changing a skill clears only its corresponding bar. The picker uses official UpgradeOf families and published IDs/ranks; tier search, expanded facts, title draft text, and popovers stay transient. Configured skill level is stored for planning but does not restrict current ability quick-add; T0014 will introduce an optional Respect Skill Level mode (default off), without changing the saved schema.

## Approved UI Follow-up Decisions (2026-11-02)

T0008-F1 was customer-accepted and squash-merged as [PR #27](https://github.com/Zaelious/GorgonBuilder/pull/27), commit `445735e`; T0010-F1 was customer-accepted and squash-merged as [PR #28](https://github.com/Zaelious/GorgonBuilder/pull/28), commit `a1b2d6d` (727 tests and successful final-head PR checks).

- **Implemented T0008-F1:** Customer-verified CharacterSheet `Level` **already includes** its `BonusLevels`, so use exported `Level` directly as the planner's effective combat skill level; never add bonus or Prodigy points. Preserve original report fields for provenance. Deliberately selecting a matching imported skill initializes its editable level; importing/reimporting alone does not change the build. Explicit **Apply imported level** updates only the selected slot's level and retains the rest of the build. These level values are inputs to future formula work, not proof of a direct damage multiplier. See [corrected evidence](../src/features/import/skill-levels.md).
- **Implemented T0008-F1:** General bar-side + stays open for repeated additions, shows live count, preserves search/scroll, and marks already-on-bar abilities without preventing duplicates. Numbered empty-slot + and replacement are one-choice operations; bar capacity remains six. Occupied ability icons offer accessible quick × removal; numbered empty slots still append to the next available contiguous bar position.
- **Implemented T0010-F1:** One equipment-wide mod search stays visible above the equipment rows; target-level preview and other filter toggles live under default-collapsed **Mod Browser Settings**. Shared filters remain active while changing item rows but do not change per-item eligibility, tier provenance or selected mods. Mod preview target is distinct from equipment minimum target-level filtering. Technical guidance appears once under a default-collapsed **How mod filtering works**, not in each item.
- **Implemented T0010-F1:** Expanded items show STATS promptly and collapse technical metadata (imported source/instance, levels, rarity, location, requirements, historical source details) under one default-closed `Item details & source` disclosure. Actionable compatibility/unresolved-data warnings remain visible and historical imported evidence remains unchanged.
- **Implemented T0010-F1:** Compact **Clear build** explicitly confirms resetting the **current working BuildDocument** to defaults (skills/levels/bars, equipment and working mods/Sparks, title/notes, target) through existing autosave. Cancel is a no-op, and protected/read-only drafts cannot reset. Transient imported CharacterSheet/Storage inventory, browser preferences, unrelated data, and schema v1 remain intact. Browser-local imported reports still follow their existing reimport-after-refresh behavior.

## Game Data

Do not fetch a changing live dataset on every user visit.

Preferred approach:

1. A development/update script obtains the desired official data snapshot.
2. Raw data is validated/normalized.
3. Compact normalized artifacts are written under generated/public data.
4. Build metadata records the game-data version.
5. App loads the normalized snapshot.

A third-party parser such as `project-gorgon-data` may be evaluated, but the application should own its normalized contracts.

## Search

Initial item search:

- lowercase
- Unicode-safe normalization
- concatenate display name + normalized effect descriptions + tags
- substring matching
- slot filter
- minimum-level filter

**T0009 target-level contract (KI-0007):** `NormalizedItem.level` is the nullable official `CraftingTargetLevel`, used only as a **base-item target-level search hint**. Use the existing `minimumEquipmentLevel` preference (default 90; `null` disables threshold) and a separate default-on “Include unknown target level” control. Never coerce null to zero; distinguish target level from published item `SkillReqs`, actual imported item-instance levels, treasure-tier level ranges and equipping legality. Keep the predicate pure and testable; no breaking change to preferences or normalized source data solely for this feature.

**KI-0008 local serving preflight (completed):** PR #16 restored original compressed `.json.gz` bytes in Vite dev and preview; T0009 confirmed compressed-byte/manifest integrity and corruption/retry behavior remains intact.

**Implemented in T0011-F2 (2026-11-02):** [PR #25](https://github.com/Zaelious/GorgonBuilder/pull/25) adds validated immutable edits to an imported item's effective working `existingPowers`, while its `metadata.sourceItem` remains historical source evidence. The Selected editor and STATS share display-only skill-color grouping over effective imported pairs plus staged `candidateMods`. Users may remove/change exact power-owned tiers and Restore original known pairs; unknown source entries and imbues remain evidence only. Saved working arrays and provenance remain separate, and no Spark outcomes are inferred. T0012's accepted modifier engine aggregates *only effective working pairs and planned candidates*; never reads or counts original source metadata as extra contributions. T0011-F3 quick-equip UX has also been completed/accepted separately in [PR #26](https://github.com/Zaelious/GorgonBuilder/pull/26), preserving current browser-local report handling and schema-v1 equipment selections.

**Implemented in T0010:** Inline Available/Selected treasure-mod planning uses official v490 power IDs, composite tier keys, item Slots/TSysProfiles and active skill associations. Max/90/100 previews remain presentation-only; slot-compatible active combat powers outside an item's published generation profile stay discoverable with an eligibility-unconfirmed flag. STATS shows every fixed effect, distinguishable imported powers and grouped/color-coded planned mods; changing the last active slot for a skill prunes its resolved planned mods with Undo. Ability details show compact source facts and equipped ability-specific Relevant Mods using conservative published hooks/labels/names; they do not evaluate damage, stacking or legality. The existing BuildDocument v1, preserved raw data and 500ms autosave are unchanged. [T0010 verification](T0010_Verification.md); [PR #22](https://github.com/Zaelious/GorgonBuilder/pull/22).

**Implemented in T0009:** Pure item search in `src/data/search/equipment.ts` combines names, descriptions, fixed effects, keywords, exact official slots, nullable target levels and the tested symmetric `lightning`/`electricity` synonym. The nine primary UI rows always display with icon fallback; Other slots is collapsed. T0009-F1 implements one mutually exclusive OffHand loadout position for official `OffHand` and `OffHandShield` item categories; exact published strings remain in saved data. Legacy dual selections restore unchanged until explicit confirmation to keep one. Expanded details omit duplicate item name/artwork. [T0009-F1 verification](T0009_F1_Verification.md). Official item `IconId` is a display-only, validated source field. The item picker uses X/Escape dismissal (no backdrop click), preserving search selection drag and focus. Real item IDs persist in schema-v1 `BuildDocument.equipment` with the existing autosave and preferences API, without claiming equipment legality, numeric effect interpretation or mod eligibility. See [T0009 verification](T0009_Verification.md).

Do not add a fuzzy-search dependency until basic search is measured and found insufficient.

## Calculation API

**T0010-F2 customer correction (2026-11-04; PR #38 pending acceptance):** public damage results show supported values and concise Estimated/Unavailable status. Full engine outputs remain unchanged and tested. Technical math documentation, source/debug IDs, unsupported records, implementation assumptions and technical warning lists are rendered only when `import.meta.env.DEV` is true and the URL explicitly contains `?debugDamage=1`. Production builds, including Vite preview, ignore the flag. This supersedes earlier public expandable-breakdown requirements; it does not weaken internal diagnostic contracts or introduce new calculations.

Shared equipment mod search keeps typed text local to the controls, commits one effective query after 190 ms in a React transition, and clears immediately with pending work cancelled. Row visibility and both Available/Selected lists consume that same query. The repository-wide power index is shared; prepared relevance maps are memoized by equipment definition IDs and active skills, independently of query, target/category changes and working-mod edits. Selected matching is independent of Available eligibility/category filters; visible counts remain separate and original edit indices are preserved.

**Implemented T0012 (2026-11-02):** `src/core/calculation` defines typed normalized modifier records, category/scope/operation/condition/confidence/provenance contracts, a guarded official-attribute mapping registry, deterministic `aggregateBuildModifiers(build, repository, options?)`, unsupported records/warnings and review reporting. Uses unique active skills, official advancement rewards (per-level summation explicitly `assumed`), selected item fixed effects, working imported/manual `existingPowers`, and separate staged `candidateMods`. Historical `sourceItem` does not contribute; no Sparks or final damage calculations are performed. [PR #29](https://github.com/Zaelious/GorgonBuilder/pull/29); [verification](T0012_Verification.md). Off-skill equipment modifiers remain source records for later ability-scope filtering, not universal damage bonuses. Product-owner decision: duplicate selections of the same skill must share one effective in-game level. Existing schema/editor can represent conflicts; T0012 warns and omits their advancement rewards until a scoped editor correction prevents mismatched edits without silently rewriting legacy saves.


**Implemented T0013 (2026-11-02):** [PR #32](https://github.com/Zaelious/GorgonBuilder/pull/32) adds pure `calculateAbilityDamage(abilityId, aggregation, repository)` with exact official ability lookup, separate hit/DoT components, source-by-source applicability, deterministic step provenance, `provisionalDamage`, nullable fully validated `normalDamage` and `criticalDamage: null`. The original-base Skill Base contribution is confirmed; all other percentage ordering and flat/percentage interactions remain explicit provisional assumptions. See [T0013 verification](T0013_Verification.md). T0014 now displays these results in an opt-in compact expandable breakdown, with target dummy, curated Mock effects and documented Burst thresholds ([PR #34](https://github.com/Zaelious/GorgonBuilder/pull/34), merged 2026-11-03). T0013-F1 was customer-accepted and squash-merged in [PR #36](https://github.com/Zaelious/GorgonBuilder/pull/36) on 2026-11-04 as `acfdfcf`: complete v490 inventory (1,947 powers/52,039 entries), shared keyword damage hooks, 38 guarded exact prose definitions and a reusable source-backed unconditional prose grammar. The corrected report separates inventory, direct-damage calculations, other mechanics and validation confidence: combat-skill direct entries are 59.64% fully calculated; ordinary unconditional flat/percent/Skill Base entries are 89.48% fully calculated and 98.88% including partial. Intermediate direct Burst 6–8 falloff remains **Estimated**. See [coverage](treasure-coverage/README.md) and [verification](T0013_F1_Verification.md). **Approved sequence:** T0010-F2 (equipment mod-search visibility and damage-warning classification, Codex Medium), T0008-F2 (nine ability roles, category mod applicability, seven picker variant groups and required-active-skill audit correction, Codex High), T0013-F2 (full Anatomy/Phrenology critical results and creature-type target, Codex Extra High), then T0015 Mastery Sparks. None of the three follow-up implementations is part of PR #36. Formula confidence remains separate from synthetic regression coverage; real in-game validation is ongoing.

Historical illustrative interface (the implemented T0013 API is described above):

```ts
type FormulaConfidence =
  | "validated"
  | "partially_validated"
  | "assumed"
  | "unknown";

interface AbilityCalculationInput {
  abilityId: string;
  modifiers: NormalizedModifier[];
  target: TargetConfig;
}

interface AbilityCalculationResult {
  normalDamage: number | null;
  criticalDamage: number | null;
  breakdown: CalculationStep[];
  warnings: string[];
  confidence: FormulaConfidence;
}
```

Exact names may evolve, but calculation outputs must retain breakdown and confidence.

## Spark API

Core functions should include pure deterministic operations:

```ts
simulateSkillDamageSparks({
  skill,
  count,
  seed,
}): SparkSimulationResult
```

Tests must verify:

- probabilities sum to 1
- fixed seed is reproducible
- count is respected
- aggregate results are correct

**Implemented in T0015:** `src/core/sparks` exports `simulateSkillDamageSparks({ skill, count, seed })`, returning
`{ ok: true, value: SparkSimulationResult } | { ok: false, issue }` (invalid input is reported, never thrown or clamped),
model `skill-damage-sparks-v1` (cyrb128 + sfc32, rejection-sampled whole-percent weights), `expectedSkillDamageSparks`,
`sparkBonusTotals` and `evaluateSparkConfiguration`. `core/build/sparks.ts` provides the immutable `sparks-set` edit and
`core/calculation/spark-modifiers.ts` maps outcomes to existing modifier categories. See
[T0015 verification](T0015_Verification.md).

## Import

**Roadmap decision (2026-11-06):** T0016 was redefined as a **post-MVP Character Statistics and Defensive Calculation Engine** at the end of the queue. T0018–T0021 release work relies on the existing import, modifier aggregation, offensive Sparks and ability engine; it does not require armor/defensive Sparks, a full character stat sheet, or a CurrentStats delta panel. **T0017 A/B comparison was also deferred post-MVP on 2026-11-06 and is not needed for share/duplicate.**

Character import is browser-local.

Expected files:

- CharacterSheet report
- Storage report

Import adapters validate:

- report type
- report version
- required top-level fields

Unknown future optional fields should not cause unnecessary failure.

The importer creates:

- ImportedCharacterSnapshot
- ImportedItemInstance[]

The imported snapshot stores the game's export timestamp.

It does **not** claim items are currently equipped solely from `IsInInventory`.

## Persistence

### Local

Local persistence stores:

- current draft
- preferences
- owner tokens
- recent build references

Provide a storage abstraction so browser-storage details do not leak through UI components.

**Implemented in T0007:** `createLocalPersistence` in `src/persistence/local/storage.ts` stores current draft under `gorgonbuilder.current-draft` and versioned preferences under `gorgonbuilder.preferences`. Storage is injected for tests or resolved lazily from browser `localStorage`. Missing or invalid data returns explicit fallback status without deleting original bytes; incompatible schema versions block accidental overwrite, and read/write/security/quota failures are reported. Preferences default to an unvalidated minimum equipment-level filter value of 90 (or null to disable); KI-0007/T0009 implement the explicit nullable published target-level browsing filter, not an equipping requirement. `createDraftAutosave` in `src/persistence/local/autosave.ts` provides a 500 ms debounced snapshot with flush/cancel and failed-save retry. T0008 connects actual committed UI edits to 500 ms local autosave, restores refresh state, flushes pending work, exposes save retry/recovery and protects unsupported/unreadable drafts. Owner tokens and recent-build references remain future work and must not enter the build JSON.

### Remote

Illustrative REST-like contract:

- `POST /api/builds`
- `GET /api/builds/:id`
- `PUT /api/builds/:id`
- `DELETE /api/builds/:id`

Create returns:

- public ID
- owner token once

Update/delete require proof of owner token.

Server stores only a token hash.

## Saved Build Schema

Every saved build includes:

- `schemaVersion`
- `gameDataVersion`
- `createdWithAppVersion` when available
- build payload

**Current implementation:** Schema v1 is the `BuildDocument` itself, with top-level metadata, skill slots A/B, independent ability bars, equipment, target and optional character-import reference. Validation accepts only v1; upgrades require explicit future migrations. Saved game-data version is retained, not silently replaced with the currently loaded snapshot. Candidate mods do not imply eligibility; T0015 interprets Sparks without a schema change (see Spark API).

Schema migrations should be explicit pure functions.

Do not rely on React component shape as persistence format.

## Testing Layers

1. Pure unit tests
   - normalization
   - damage math
   - Sparks
   - schema migration
   - import parsing

2. Focused component tests
   - only for meaningful interaction logic

3. Manual ticket verification
   - required every ticket

4. v1 end-to-end smoke tests
   - T0021 covers critical planner, sanitized import, save/share, independent fork/duplicate, and release flows after architecture stabilizes. A/B comparison (T0017) and defensive statistics (T0016) are post-MVP.

## Performance Targets

Initial desktop target:

- skill selector responds immediately
- item filtering feels instantaneous for level-90+ searches
- ability recalculation occurs synchronously without noticeable lag
- Spark simulation of 110 rolls is trivial
- no network request is required for each keystroke/filter change

If data volume becomes a problem, optimize after measurement rather than preemptively introducing complexity.

## Accessibility Baseline

- semantic buttons/inputs
- keyboard-operable selectors/modal controls
- visible focus state
- labels for form controls
- do not rely only on color to convey validation/confidence

## Error Handling

User-facing errors should distinguish:

- unsupported/corrupt import
- missing game-data mapping
- calculation unsupported
- network save/share failure
- build-schema migration failure

Unknown game mechanics should generate a calculation warning, not a fabricated precise result.


T0010-F2 final clarification: the public view includes a default-collapsed **Damage breakdown** showing actual engine steps, individual named equipment/skill contributions, flat/percentage/Skill Base contributions, target multipliers and final hit/total. It contains numerical presentation only: no raw IDs, source paths, uncertainty/exclusion inventories, implementation assumptions or long explanations. Those diagnostics remain available only through the development `?debugDamage=1` view. Public `Partial` labels are replaced with `Estimated`; unavailable numbers remain `Unavailable`. No engine results or accepted mod-search/Selected-heading behavior change.
