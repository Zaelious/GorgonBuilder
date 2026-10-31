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

Do not add a fuzzy-search dependency until basic search is measured and found insufficient.

## Calculation API

Illustrative interface:

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

## Import

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
   - T0021 covers critical planner, sanitized import, save/share, duplicate, comparison, and release flows after architecture stabilizes

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
