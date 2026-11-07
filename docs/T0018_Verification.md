# T0018 Verification — Cloudflare Workers + D1 Foundation

**Ticket:** T0018, [Issue #46](https://github.com/Zaelious/GorgonBuilder/issues/46)
**Branch:** `feature/t0018-cloudflare-d1-foundation`
**Date:** 2026-11-06
**Architecture:** [T0018 ADR](T0018_Backend_Architecture_ADR.md) · **Owner steps:** [T0018 Owner Setup](T0018_Owner_Setup.md)

## Evidence levels

| Level | Meaning | T0018 status |
|---|---|---|
| **Local proof** | Real Worker in workerd + real local D1 (SQLite) via Wrangler, on the developer machine or CI | ✅ Executed |
| **Dry run** | `wrangler deploy --dry-run` bundling for production and staging; nothing uploaded | ✅ Executed |
| **Deployed reality** | Cloudflare-hosted staging/production Worker or D1 | ⛔ **Not executed — owner action required** (optional for T0018; see Owner Setup Part B) |

No Cloudflare credentials, remote database, OAuth secrets or paid plan were used or needed.

## What was built

- `wrangler.jsonc`: Worker entry `worker/index.ts`, `assets.binding: "ASSETS"`, `run_worker_first: ["/api", "/api/*"]`, production `APP_ENV`, isolated `env.local` (local-only D1) and `env.staging` (placeholder D1 ID). **No production D1 binding.**
- `worker/`: entrypoint, router (`/api/health`, JSON 404/405/500), health check with a real `SELECT 1`, generated typed `Env` (`npm run worker:types`, git-ignored output).
- `migrations/0001_better_auth_core.sql` (Better Auth–generated) and `0002_profiles_and_builds.sql` (profiles, account-owned builds, public-only partial indexes).
- `src/persistence/remote/`: `BuildRepository` contract, record/payload validation, ACL rules, build IDs, usernames, search contract; `testing/` holds the deterministic in-memory fake, fixtures and the reusable contract suite.
- `worker/auth-probe/`: local-only Better Auth feasibility Worker and its option set; not deployed and not mounted in production.
- `scripts/worker-smoke.ts` (`npm run worker:smoke`), `.dev.vars.example`, `.gitignore` additions, ESLint boundaries, CI steps.

## Commands and results (implementation run, Node 22.23.4, Wrangler 4.156.0)

| Command | Result |
|---|---|
| `npm ci` | ✅ (lockfile adds only `better-auth@1.7.18` and its dependencies; no existing package changed) |
| `npm run lint` | ✅ 0 problems |
| `npm run typecheck` (now runs `wrangler types` first, then app, scripts and worker projects) | ✅ |
| `npx vitest run src/persistence/remote worker` (focused) | ✅ 82 tests, 6 files |
| `npm test` (full) | ✅ **1,354 tests, 70 files** (1,272 before T0018 + 82 new) |
| `npm run coverage:treasure -- --check` | ✅ unchanged |
| `npm run build` | ✅. Frontend bundle hash identical to the pre-T0018 build (`index-CACLMf-9.js`); the SPA imports no new code |
| `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` | ✅ Worker 3.08 KiB / 1.25 KiB gzip; bindings `ASSETS`, `APP_ENV=production`; **no D1** |
| `npx wrangler deploy --env staging --dry-run --outdir .wrangler/dry-run-staging` | ✅ bindings `DB (gorgonbuilder-staging)`, `ASSETS`, `APP_ENV=staging` |
| `npm run worker:smoke` | ✅ **45/45** local checks (below) |
| Browser regression (Playwright Chromium via `wrangler dev --env local`, 1440×900 and 375×812) | ✅ planner loads, title edit autosaves to `gorgonbuilder.current-draft`, reload shows "Local draft restored" with the edited title, deep link `/builds/deep-link-check` serves the planner, same-origin `fetch('/api/health')` → 200 `database: ok`, no console/page errors, no horizontal overflow |

### `npm run worker:smoke` checks (local only)

The script strips `CLOUDFLARE_*` variables from child processes, refuses `--remote`, requires `--local` on every D1 command and `--dry-run` on deploys, and uses a temporary `.wrangler/t0018-smoke/<timestamp>` persistence directory that it deletes afterwards (`--keep` keeps it).

1. **Migrations:** apply to a fresh local D1 (`--env local --local --persist-to …`) ✅. Re-apply → "No migrations to apply" ✅. `migrations list` → nothing pending ✅. Tables are `account, build, profile, session, user, verification` ✅. `PRAGMA foreign_keys = 1` ✅. Local D1 query plans: public recent → `SCAN build USING COVERING INDEX build_public_recent_idx`; one-skill UNION → `SEARCH … build_public_skill_a_idx` + `SEARCH … build_public_skill_b_idx` ✅.
2. **Worker (`wrangler dev --env local`):** `GET /api/health` → 200 `{"status":"ok","service":"gorgonbuilder-api","environment":"local","database":"ok"}` with `cache-control: no-store` ✅. `HEAD` → 200 empty ✅. `POST` → 405 JSON, `Allow: GET, HEAD` ✅. `/api`, `/api/`, `/api/unknown`, `/api/builds/AAAAAAAAAAAAAAAA`, `/api/auth/session` → JSON 404, with and without browser-navigation headers ✅. `/` → built `index.html` ✅. `/builds/some-shared-id`, `/search?skill=Cow` and `/apix` → SPA fallback ✅. Built `index-*.js` served byte-identical ✅. Compressed game-data `.gz` served ✅.
3. **Better Auth probe (own local D1, committed migrations):** initializes in workerd ✅. No cookie → `null` session ✅. Discord and Google sign-in initiation return the provider authorize URL with `<origin>/api/auth/callback/<provider>`, an `HttpOnly; SameSite=Lax` state cookie and a D1 `verification` write ✅. Foreign `callbackURL` rejected ✅. A D1 session validates from a signed cookie ✅. Cross-origin sign-out → 403 `INVALID_ORIGIN` ✅. No-Origin POST → 403 ✅. Form-encoded POST → 415 ✅. The session survives the rejected requests ✅. Same-origin sign-out clears the cookie and deletes the D1 session ✅. Probe bundle (dry run) 1,772.62 KiB / 319.96 KiB gzip ✅.

### Automated test coverage added

- `src/persistence/remote/in-memory-build-repository.test.ts` runs the shared contract suite (`testing/build-repository-contract.ts`) against the fake:
  - Lifecycle: create defaults to Private, metadata is derived server-side, the original BuildDocument v1 round-trips exactly, aliasing is isolated, optimistic revision, delete.
  - Boundaries: Private is a 404 for others and indistinguishable from missing; Unlisted/Public are readable by guests; Public is owner-only for modification; guests cannot create/copy/list; client owner injection is rejected; Public→Private revocation takes effect immediately.
  - Copy into a new Private copier-owned record, independent of later source edits.
  - Listings: owner sees all visibilities, profile shows Public only, keyset pagination.
  - Errors: invalid, future-schema and raw CharacterSheet payloads; the 256 KiB cap; metadata limits; no partial writes.
  - Seed determinism.
- `src/persistence/remote/contracts.test.ts`: build IDs, ACL matrix, payload preparation (UTF-8 byte cap), title/description sanitization, usernames (reserved, homoglyph, length), search AND/OR semantics and query bounds.
- `worker/api/router.test.ts`: routing classification, health ok/not_configured/error (no leaked details), HEAD, JSON 404 for every unknown API path, 405 + Allow.
- `worker/migrations.test.ts` (node:sqlite): table separation, default Private, CHECK limits mirroring app constants, FK + cascade, case-insensitive usernames, public-only query results, index usage.
- `worker/auth-probe/auth-schema.test.ts`: Better Auth `getMigrations` finds **nothing to create or add** after the committed migrations; OAuth-only option set.
- `worker/config.test.ts`: production has no D1 and is asset-first; local/staging isolation; the probe is local-only; no `--remote`, `d1 create/delete/execute` or non-dry-run deploy in scripts or CI; only `.dev.vars.example` is tracked and it holds no values; no credential-shaped strings in tracked text files.

## Manual verification steps (reviewer)

Prerequisites: Node 24 (or ≥ 22.22.2), `npm ci`.

1. Quality suite:
   ```bash
   npm run lint
   ```
   ```bash
   npm run typecheck
   ```
   ```bash
   npm test
   ```
   ```bash
   npm run build
   ```
2. Dry runs (no upload, no login):
   ```bash
   npx wrangler deploy --dry-run --outdir .wrangler/dry-run
   ```
   ```bash
   npx wrangler deploy --env staging --dry-run --outdir .wrangler/dry-run-staging
   ```
   Expected: production lists **no** `env.DB`; staging lists `env.DB (gorgonbuilder-staging)`.
3. Automated local smoke:
   ```bash
   npm run worker:smoke
   ```
   Expected: `45/45 local smoke checks passed.`
4. Hands-on local Worker (optional, after `npm run build`):
   ```bash
   npm run worker:dev
   ```
   This applies migrations to `.wrangler/state` (local only) and serves on `http://localhost:8787`. Check:
   - `/api/health` → JSON `status: ok`, `database: ok`, `environment: local`
   - `/api/nope` → JSON `not_found`
   - `/` and `/builds/anything` → planner
   - Edit the build title, reload, and confirm it is restored ("Local draft restored").
5. Migration reproducibility:
   ```bash
   npm run db:migrations:list:local
   ```
   Expected after step 4: "No migrations to apply". To start over, delete `.wrangler/state`.
6. Secrets review: `git ls-files | grep -E '\.dev\.vars|\.env'` prints only `.dev.vars.example`. `wrangler.jsonc` contains only identifiers and placeholders.
7. Regular planner check (optional): run `npm run dev` and repeat the title/autosave check. Vite dev has no `/api` (by design in T0018; see follow-ups).

## Not executed — owner action required (all optional for T0018)

- Creating `gorgonbuilder-staging` D1, applying migrations `--remote`, deploying `gorgonbuilder-staging` and checking its `/api/health` (Owner Setup Part B).
- Observing production after merge: `/api/health` is expected to return 503 `not_configured` until a production database exists.
- Real Discord/Google OAuth round trip, provider token exchange and Workers Free CPU-time measurement (T0019 on staging).
- Production D1, backups and custom domain (T0021).

## Risks and assumptions

- After merge, production `/api/*` requests run Worker code (they count toward the Workers Free 100k/day limit and return 429 if it is exceeded). Static pages are unaffected.
- Production `/api/health` reports 503 until launch. Any external uptime monitor should not alert on it yet.
- Better Auth is exact-pinned. `auth-schema.test.ts` catches schema drift on upgrade. The probe proves workerd + D1 compatibility locally, not production CPU timing.
- Query-plan conclusions come from empty and synthetic data (node:sqlite with 20k rows and local D1). T0020-F1 must re-measure with representative data and D1 `rows_read`.
- `wrangler types` output is generated during `typecheck` (needs the installed Wrangler; ~2 s; offline).
- CI now also runs the local smoke (`wrangler dev` in workerd). If GitHub runners ever block local ports, that step will fail visibly.

## Follow-ups discovered

- T0019: move `auth-probe/auth-options.ts` into the production Worker, add `nodejs_compat`, implement `D1BuildRepository` against the shared contract suite, CSRF/origin checks for non-auth routes, and rate limiting (Rate Limiting binding vs Better Auth storage).
- T0020: a dev workflow that exercises `/api` from the Vite dev server (e.g. `@cloudflare/vite-plugin` or a dev proxy). Currently `npm run worker:dev` serves the built app.
- T0020-F1: choose UNION vs `build_skill` junction vs FTS5 with measured plans. Add a generated combat-skill allowlist for `isKnownCombatSkillId`.
- Docs to update after merge: `Repo_Current_State.md` (T0018 completed, new scripts/dependencies/tree), `Tickets.md` (T0018 status), `MVP_Technical_Design.md` remote section (link the ADR), `Known_Issues_And_Followups.md` (follow-ups above).
