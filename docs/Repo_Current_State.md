# GorgonBuilder — Repository Current State

**Last updated:** 2026-10-31  
**Canonical repository:** `Zaelious/GorgonBuilder`  
**Default branch:** `main`

## Current Status

T0001 foundation and T0002 official data acquisition are merged. The repository contains the Vite/React/strict TypeScript app shell, Cloudflare Workers static-asset hosting, and a committed, verified official Project Gorgon v490 raw dataset snapshot with an offline integrity check. Semantic data normalization and actual planner UI are not yet implemented.

## Completed Tickets

- **T0001 — Project Foundation** (merged 2026-10-31 via [PR #1](https://github.com/Zaelious/GorgonBuilder/pull/1); squash commit `d38762e17d066909870b54cc7e269bac05fba3f8`).
- **T0002 — Official Game Data Snapshot Pipeline** (merged 2026-10-31 via [PR #3](https://github.com/Zaelious/GorgonBuilder/pull/3); squash commit `cbe635e0afe2f82a117c278a1bd684d1a05a932c`). The v490 pin and 13 raw datasets are committed. See [T0002 verification](T0002_Verification.md).

**Deployment housekeeping completed** via [PR #2](https://github.com/Zaelious/GorgonBuilder/pull/2) (squash commit `9df290379b396f8bb4cc2717e154bbbca577af98`): explicit static-assets `wrangler.jsonc`, Wrangler 4.156.0 and synchronized lockfile, deploy/preview scripts, GitHub CI with Cloudflare dry-run, and deployment instructions.

## Active Ticket

None. T0003 has not started.

## Planned Next Ticket

**T0003 — Normalize Skills, Advancement Tables, Attributes, and Effects**

The approved condensed v1 backlog is **T0001–T0021**, with stateful Rotation/DPS deferred to the following ticket series.

## Current Stack

- Vite 8, React 19, strict TypeScript 6
- ESLint 10 with TypeScript rules and core-layer import restrictions
- Vitest 5 with jsdom for a React shell smoke test
- Shared CSS variables and responsive baseline styles
- Cloudflare Workers Static Assets for the Vite frontend (no Cloudflare Vite plugin or backend yet)
- Provider-agnostic persistence remains a design direction, not an implemented interface

Runtime dependencies: `react`, `react-dom`.  
Development dependencies: `@eslint/js`, `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `eslint`, `globals`, `jsdom`, `typescript`, `typescript-eslint`, `vite`, `vitest`, `wrangler` (pinned to 4.156.0).

`package.json` requires Node `^22.22.2 || ^24.15.0 || >=26.0.0`; Codex tested with Node 24.19.0.

## Available Scripts

- `npm run data:update` — discover/pin or validate/reuse official raw data
- `npm run data:update -- --check` — validate the pinned raw snapshot offline
- `npm run dev` — Vite development server
- `npm run lint` — ESLint with zero allowed warnings
- `npm run typecheck` — TypeScript no-emit checking
- `npm test` — one-shot Vitest
- `npm run build` — typecheck + Vite production build
- `npm run deploy` — build and deploy to Cloudflare Workers
- `npm run preview:cloudflare` — build and publish a Cloudflare Preview
- `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` — validate the Cloudflare bundle without deploying

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

Root application/configuration files include `index.html`, `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `.gitignore`, and `wrangler.jsonc`.

GitHub CI: `.github/workflows/ci.yml` (npm install, lint, typecheck, test, build, Wrangler dry-run). Deployment instructions: `docs/Cloudflare_Deployment.md`.

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

**Cloudflare configuration CI verification (2026-10-31, [run](https://github.com/Zaelious/GorgonBuilder/actions/runs/41230777053)):** `npm ci`, lint, typecheck, 1 test, build, and `npx wrangler deploy --dry-run` all passed on Node 24. Production deployment on Cloudflare after PR #2 merge should be verified in the Cloudflare dashboard; GitHub CI does not verify the live deployment.

**T0002 acceptance evidence (2026-10-31):** official v490 acquisition, deterministic cache reuse (hashes/bytes/mtimes), fresh pinned rehydration, offline `--check`, lint, typecheck, 69 tests, and production build passed, as reported and documented by Codex. GitHub [PR-head CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41234174663) passed. See [T0002 verification](T0002_Verification.md). The raw-source ingestion code and manifests were reviewed before merge.

## Hosting and Previews

- Production URL: https://gorgonbuilder.zbailouz7.workers.dev
- Production branch: `main` (Cloudflare Workers Builds connected to GitHub)
- Cloudflare dashboard commands: build `npm run build`, deploy `npx wrangler deploy`, preview `npx wrangler preview`
- `wrangler.jsonc` serves `./dist` with single-page-app fallback.
- Enable **Preview Builds** in Cloudflare's Branch control to receive URLs for feature-branch testing; preview enablement must be confirmed in the Cloudflare dashboard.
- Deployment implementation is frontend-only and does not decide the T0018 backend provider.

## Game Data

**Committed on `main`:** the official Project Gorgon v490 raw snapshot (13 datasets, 39,162,208 dataset bytes), versioned official index, and SHA-256/count/provenance manifests under `src/data/raw/`. Acquisition is a development command; the frontend never fetches live data. No semantic normalization is implemented. The source adapter and snapshot workflow are in `src/data/adapters/official-source.ts` and `scripts/`. The initial cache is committed for offline reproducibility; future version upgrades must be explicit.

Official data ingestion/normalization is concentrated in T0002–T0006, including advancement tables, dynamic ability data, TSys profiles, completeness checks, and the runtime data repository.

## Character Import Research

Feasibility was established from supplied Project Gorgon JSON reports.

- CharacterSheet can expose skills, known abilities, `CurrentStats`, and character metadata.
- Storage can expose real item instances and exact TSys powers/tiers.
- `IsInInventory` is not definitive equipped status.
- The report export timestamp determines snapshot freshness; an older example export does not make the report format intrinsically stale.

Character import is not yet implemented.

## Known Issues

See `docs/Known_Issues_And_Followups.md`. No additional code issues were reported during T0001.

## Documentation Rule

After each merged implementation ticket, update this file with:

- completed tickets and next ticket
- relevant source structure and dependencies
- available scripts and build/test status
- known issues and material architecture changes
