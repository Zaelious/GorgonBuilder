# GorgonBuilder — Repository Current State

**Last updated:** 2026-10-31  
**Canonical repository:** `Zaelious/GorgonBuilder`  
**Default branch:** `main`

## Current Status

T0001 project foundation is implemented and merged. The repository now contains a working Vite/React/strict TypeScript application shell plus development tooling and architecture placeholder directories. The actual Project Gorgon planner and data integrations are not yet implemented.

## Completed Tickets

- **T0001 — Project Foundation** (merged 2026-10-31 via [PR #1](https://github.com/Zaelious/GorgonBuilder/pull/1); squash commit `d38762e17d066909870b54cc7e269bac05fba3f8`).

## Active Ticket

None. T0002 has not started.

## Planned Next Ticket

**T0002 — Official Game Data Snapshot Pipeline**

The approved condensed v1 backlog is **T0001–T0021**, with stateful Rotation/DPS deferred to the following ticket series.

## Current Stack

- Vite 8, React 19, strict TypeScript 6
- ESLint 10 with TypeScript rules and core-layer import restrictions
- Vitest 5 with jsdom for a React shell smoke test
- Shared CSS variables and responsive baseline styles
- Provider-agnostic persistence remains a design direction, not an implemented interface

Runtime dependencies: `react`, `react-dom`.  
Development dependencies: `@eslint/js`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `eslint`, `globals`, `jsdom`, `typescript`, `typescript-eslint`, `vite`, `vitest`.

`package.json` requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; Codex tested with Node 24.19.0.

## Available Scripts

- `npm run dev` — Vite development server
- `npm run lint` — ESLint with zero allowed warnings
- `npm run typecheck` — TypeScript no-emit checking
- `npm test` — one-shot Vitest
- `npm run build` — typecheck + Vite production build

Install dependencies with `npm ci` using the committed lockfile.

## Current Source Tree

```text
src/
├─ app/
│  ├─ App.tsx
│  └─ routes/                 (placeholder)
├─ core/
│  ├─ build/                 (placeholder)
│  ├─ calculation/           (placeholder)
│  ├─ import/                (placeholder)
│  ├─ sparks/                (placeholder)
│  └─ validation/            (placeholder)
├─ data/
│  ├─ adapters/              (placeholder)
│  ├─ normalized/            (placeholder)
│  ├─ raw/                   (placeholder)
│  └─ search/                (placeholder)
├─ features/
│  ├─ abilities/             (placeholder)
│  ├─ comparison/            (placeholder)
│  ├─ equipment/             (placeholder)
│  ├─ import/                (placeholder)
│  ├─ mods/                  (placeholder)
│  ├─ skills/                (placeholder)
│  └─ sparks/                (placeholder)
├─ generated/
│  └─ game-data/             (placeholder)
├─ persistence/
│  ├─ local/                 (placeholder)
│  └─ remote/                (placeholder)
├─ styles/
│  └─ global.css
├─ test/
│  ├─ App.test.tsx
│  └─ setup.ts
└─ main.tsx
```

Root application/configuration files include `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, and `.gitignore`.

## Build/Test Status

**T0001 Codex-reported verification (2026-10-31):**

- `npm install` — passed
- `npm ci` — passed
- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm test` — passed (1 smoke test)
- `npm run build` — passed
- Chromium UI smoke check — passed at 1440×900 and 375×812 without reported runtime/console errors or horizontal overflow

These are implementation-agent test results, not a separate independent execution in this documentation update. PR #1 code and configuration were reviewed before merging.

## Game Data

No official Project Gorgon data snapshot or normalized data has been committed yet.

Official data ingestion/normalization is concentrated in T0002–T0006, including advancement tables, dynamic ability data, TSys profiles, completeness checks, and the runtime data repository.

## Character Import Research

Feasibility was established from supplied Project Gorgon JSON reports.

- CharacterSheet can expose skills, known abilities, `CurrentStats`, and character metadata.
- Storage can expose real item instances and exact TSys powers/tiers.
- `IsInInventory` is not definitive equipped status.
- The report export timestamp determines snapshot freshness; an older example export does not make the report format intrinsically stale.

No character import is implemented in T0001.

## Known Issues

See `docs/Known_Issues_And_Followups.md`. No additional code issues were reported during T0001.

## Documentation Rule

After each merged implementation ticket, update this file with:

- completed tickets and next ticket
- relevant source structure and dependencies
- available scripts and build/test status
- known issues and material architecture changes
