# T0019 — Account Authentication, D1 Build Persistence and Secure Ownership API

Date: 2026-11-07. Issue: [#48](https://github.com/Zaelious/GorgonBuilder/issues/48). Branch: `feature/t0019-auth-build-backend`, based on latest `main` at `5befbb577a8886c96a7eb7fd986cb828273cf98e` (accepted T0018, PR #52).

**Implementation under review; not merged. Hosted acceptance remains pending.** [Website-only owner setup](T0019_Owner_Setup.md) is the exact next-action guide. No T0020 UI, discovery/search, planner, damage, import, equipment, Sparks, BuildDocument schema or game-data changes were made.

## Evidence levels

| Evidence | Result |
|---|---|
| Native local D1 through Wrangler/workerd | Executed: migrations, unchanged shared repository suite, SQL races/FKs, API security tests |
| Real Worker over local HTTP | Executed: 74/74 smoke checks including two synthetic accounts + guest |
| Local Chromium, built planner through the Worker | Executed: 1440×900 and 375×812, autosave/reload/deep links/health, no page errors or overflow |
| Production and staging deployment dry-runs | Executed: bundle only, no upload |
| GitHub CI / Cloudflare PR preview | Check the PR's exact head checks; distinct from hosted account acceptance |
| Remote staging migration/deployment/credentials | **Not run — owner action required** |
| Genuine Google/Discord consent, login, token exchange, account creation and logout | **Not run — owner action required**. A mocked local Discord callback is not genuine OAuth. |
| Hosted OAuth callback CPU and D1 usage | **Not measured — owner action required**. Workers Free 10 ms CPU/request remains an acceptance risk. |
| Remote Cloudflare Preview Base/active-preview configuration audit | **Not inspected — owner action required**; code/config isolation verified locally |

No Cloudflare credentials were available or used. The existing owner-created staging database is **`gorgonbuilder-staging` / `477e9b46-bb96-4eca-a5ed-1ee57185fb2a`**. This identifier is configured only under `env.staging`. Production remains unbound. No new database, remote migration, deployment, secret, custom domain, paid service or billing change was performed.

## Implementation phases and changed areas

| Phase | Files / behavior |
|---|---|
| A: integration and isolation | `worker/index.ts`, `worker/api/router.ts`, `worker/auth/runtime.ts`, `wrangler.jsonc`, `worker/config.test.ts`: same asset-first SPA, explicit optional secret types, canonical-origin gate before binding access, JSON 404/405 and safe 503 when disabled |
| B: auth and accounts | `worker/auth/options.ts`, `worker/api/accounts.ts`: Better Auth **1.7.18** unchanged pin, native D1, Discord/Google, sessions/expiry/logout, username onboarding; probe reuses runtime options without mounting probe endpoints |
| C: persistence | `src/persistence/remote/d1{,-build-repository}.ts`: prepared SQL, opaque IDs, server-derived skill/version columns, revision CAS, independent copies and indexed keyset pagination; no edits to migrations 0001/0002 |
| C: privacy | `src/persistence/remote/public-document.ts`, `worker/api/dto.ts`: explicit allowlists rather than internal-row serialization |
| D: security | `worker/api/security.ts`, `worker/api/game-policy.ts`, new forward migration **0003_api_rate_limit.sql**: bounded stream reads, Origin/JSON checks, pinned official combat slots/version and shared D1 rate limits |
| Tests | `worker/d1-build-repository.test.ts`, `worker/api/accounts.test.ts`, `worker/testing/local-d1.ts`, existing config/router/migration tests and `scripts/worker-smoke.ts` |
| E: staging and documentation | `.github/workflows/staging.yml`, `scripts/staging-target.ts`, owner guide, this report, narrow current-state/design/deployment reconciliation |

## REST contract and deliberate clarifications

All account APIs are same-origin and `Cache-Control: no-store`; no permissive CORS. All successful owner/non-owner/list responses use explicit DTOs. `ownerUserId` is never returned, even to the owner. `user.id` from Better Auth's verified database session is the sole ownership authority.

| Method / path | Behavior |
|---|---|
| GET/HEAD `/api/health` | Real `SELECT 1`; works on canonical staging before OAuth secrets exist. Production without DB: 503. Noncanonical/preview hosts: disabled before DB access. |
| POST `/api/auth/sign-in/social` | JSON `{provider:'discord'|'google', callbackURL?:same-origin}`. No arbitrary OAuth scopes, submitted ID tokens or external callbacks. Provider redirect URL + state cookie. |
| GET `/api/auth/callback/discord`, `/google` | Better Auth state/cookie validation, provider exchange and verified-email registration. POST callbacks are unnecessary for these providers and rejected. |
| GET/HEAD `/api/auth/get-session` | Safe `{authenticated,profile?,needsUsername?}` projection; never a raw Better Auth user/session/token object. Guest returns `{authenticated:false}`. |
| POST `/api/auth/sign-out` | JSON `{}`; same-origin required; database session revoked and cookies expired. |
| GET/HEAD `/api/auth/error` | Safe explanation including Discord verified-email requirement and Google/original-provider alternative; no echoed error query or provider body. |
| GET/HEAD `/api/me` | 401 if absent/expired; otherwise public handle and onboarding status only. |
| PUT `/api/me/username` | Atomic unique case-insensitive onboarding. Reserved/invalid 422; duplicate/rename 409; idempotent same-handle retry succeeds. Handles are immutable for MVP pending an approved rename policy. |
| DELETE `/api/me` | Implements T0018 ADR's erasure requirement: JSON `{confirmation:'delete my account'}`, same-origin, signed-in session created within ten minutes. Atomic user deletion cascades profile/build/account/session rows; clears cookie. No deletion UI. |
| POST `/api/builds` | Registered, onboarded account; 201; Private default. JSON `{document,title?,publicDescription?,visibility?}`. |
| GET/HEAD `/api/builds/:id` | Owner original document; other readers receive sanitized Public/Unlisted projection; Private indistinguishable from missing. |
| PATCH `/api/builds/:id` | Owner-only, JSON `expectedRevision` plus changed document/listing fields; stale 409. |
| DELETE `/api/builds/:id` | Owner-only JSON `{expectedRevision}`; stale 409, success `{id}`. |
| POST `/api/builds/:id/copy` | Onboarded account, readable source, optional JSON `{title}`; new independent copier-owned Private record, revision 1. Own-source copies retain exact JSON; foreign-source copies contain only the safe public projection. |
| GET/HEAD `/api/me/builds` | All own visibilities, summaries only, bounded keyset page. |
| GET/HEAD `/api/users/:username/builds` | Public-only summaries for every viewer, including the owner. No counts or nonpublic IDs. |

`GET /api/builds/search` remains JSON 404 (T0020-F1). Page parameters are `limit` (1–50, default 20) and `cursor`; newest first by `(updated_at,id)`. No offset/count path exists. Malformed request/JSON: 400; missing/expired session: 401; readable wrong-owner/CSRF/onboarding: 403; hidden/missing: 404; wrong method: 405 with Allow; revision/username conflict: 409; byte cap: 413; wrong content type: 415; invalid document/metadata/username: 422; limit: 429 with Retry-After; missing configuration/dependency failure: safe 503.

Incomplete zero/one-skill drafts remain valid per v1/T0018; each non-null slot must be an official combat ID. The API accepts the shipped **`v490`** game-data version and preserves it. The historical shared contract fixture uses `490`; internal repository version policy is injectable so its suite remains **unchanged**, while the Worker explicitly supplies the shipped policy. A drift test compares version and combat IDs with `progression.json.gz`.

## Security and privacy findings

1. **Verified provider identity only.** No password/signup-by-ID endpoint. New users require provider-verified available email. Better Auth implicit linking is disabled entirely, including equal verified emails; an existing account must use its original provider. No invented Discord email. Explicit provider linking and email/password are deferred. Local mocked callback proves verified registration, encrypted provider tokens, missing/unverified-email rejection, collision rejection and invalid-state handling.
2. **Cookie/session boundary.** HTTPS uses Secure + HttpOnly + SameSite=Lax + Path=/, with no Domain (host-only). The canonical origin alone is trusted; local HTTP requires an exact explicit loopback `APP_ORIGIN`. Session cache is disabled: every cookie is signature-checked and validated against D1 expiry/revocation. 30-day expiry, daily refresh. Refresh/clearing Set-Cookie headers are forwarded on successful session API responses. Frontend/localStorage receives no auth token.
3. **Private import data found and removed from non-owner representations.** v1 permits character names/server/report references/timestamps and arbitrary JSON in `characterImport`, item provenance and `metadata.sourceItem`. Non-owner reads and foreign copies omit all those fields, item instance/custom names, rarity text, app-version metadata, target extension metadata and private notes. They retain skill levels/bars, base items, effective working `existingPowers`, candidate mods, Sparks, target count/resistance/vulnerability. Public JSON remains valid v1. Owner reads and owner duplicates retain original JSON exactly. Public titles and public descriptions are intentionally author-controlled text; authors must not put secrets there. No inference of equipped state or use of historical source powers in mechanics.
4. **Atomic writes and revocation.** UPDATE/DELETE include owner + expected revision in the write. Copy uses `INSERT ... SELECT` with source revision and access predicate; a real-D1 race test revokes source access between read and insertion and confirms no copy is created. No record cache/read replica delays revocation. SQL values are bound parameters. Batch rollback/FK cascade are tested against native D1.
5. **Bounds and CSRF.** Streamed request cap **272 KiB before JSON parse**; serialized document cap **256 KiB UTF-8**. Auth JSON 8 KiB, username/account deletion/copy 1 KiB, callback query 16 KiB. Content-Length is only an early hint; streamed bytes are authoritative. Every unsafe cookie mutation rejects foreign/null/missing Origin and requires JSON. Better Auth retains callback state protections. Unknown body keys (including owner/index fields) are rejected.
6. **Actually enforced abuse limits.** New migration 0003 supplies D1 atomic fixed-window counters: auth initiation/callback/logout **20/IP/minute**, API mutations **60/IP/minute**, build writes **30/account/minute**, usernames **5/account/minute**, account erasure **3/account/minute**. Keys are SHA-256 pseudonyms; no plaintext IP/user identity is retained in the limiter table. Bounded indexed cleanup removes old counters, and each key reuses one row. Cloudflare's edge-provided CF-Connecting-IP is used; no X-Forwarded-For trust. This is shared D1 state, not an isolate-memory approximation or optional paid service. D1 unavailability fails closed. Distributed abuse can still spend the account's Workers/D1 quotas; per-account storage caps, moderation and monitoring must be revisited for launch. No paid upgrade was enabled.
7. **Safe errors/logs.** Error responses omit SQL, provider bodies, identities, cookies and private payloads. Better Auth logging/telemetry is disabled. `onAPIError.throw=true` is needed because better-call otherwise prints raw unexpected errors despite the library logger being disabled; our router catches them. Auth initialization is awaited explicitly so adapter failures cannot become detached unhandled rejections; the negative dependency test verifies a safe 503 without logging details. Worker invocation logs/traces are disabled and query strings redacted to avoid persisting OAuth code/state in automatic request-URL logs. Basic platform Metrics remain available; inspect callback CPU in an isolated staging interval. No callback query/body should be pasted into reports.
8. **Preview isolation verified locally, remote settings pending.** Pinned Wrangler implementation and [Cloudflare Preview configuration](https://developers.cloudflare.com/workers/previews/configuration/) confirm Previews have separate configuration/Base secrets. [Bindings share physical data by database_id](https://developers.cloudflare.com/workers/previews/resources/). Committed previews declare only `APP_ENV=preview` and empty D1; production has no D1; no credentials are committed. Runtime tests inject a binding at preview/version/foreign origins and prove zero binding calls. Preview Base secrets are copied to new previews and existing previews retain old copies, so the owner must audit both before adding staging credentials. Account-wide Cloudflare edit tokens must never be supplied to arbitrary PR code: code/config guards cannot protect against an attacker editing those guards. No remote Dashboard audit is claimed.

## Commands and local results

Node 24.19.0, Wrangler 4.156.0, Better Auth 1.7.18. In this managed environment Wrangler's writable config/log directory was selected with `XDG_CONFIG_HOME=/tmp/gorgonbuilder-config`; no HOME override or real credentials were used.

| Command / check | Result |
|---|---|
| `npm run lint` | Pass, zero warnings |
| `npm run typecheck` | Pass, generated Worker types + app/scripts/Worker checks |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | Pass, **1,399 tests / 72 files** |
| `npx vitest run worker/d1-build-repository.test.ts worker/config.test.ts --maxWorkers=2` | Pass, **36 tests** including all **22 unchanged shared contract cases**, 5 additional D1 cases and 9 configuration/security guards |
| `npm run coverage:treasure -- --check` | Pass; reports unchanged |
| `npm run build` | Pass; existing frontend JS hash **index-CACLMf-9.js** unchanged |
| `npm run worker:smoke` | Pass, **74/74** real local Worker/D1/probe checks |
| Production `wrangler deploy --dry-run --outdir .wrangler/dry-run` | Pass; ~1,809 KiB / ~331 KiB gzip; ASSETS + APP_ENV, **no DB** |
| Staging `wrangler deploy --env staging --dry-run --outdir .wrangler/dry-run-staging` | Pass; only staging DB plus assets/environment |
| `node scripts/staging-target.ts` | Pass; exact existing staging UUID/name, production/preview DB empty |
| Real Chromium via local `wrangler dev --env local` | Pass, desktop/mobile title+skill autosave/reload, deep links, health, no overflow/page errors; no backend secrets needed |
| `git diff --check`, tracked secret/config scan | Pass |

An initial concurrent regression attempt hit the existing ModPlanner test's default five-second timeout while other verification processes competed for CPU. That attempt was stopped. The complete bounded-worker run above passed with a 15-second per-test ceiling; no planner test or behavior was changed. CI uses the same bounded command for repeatability.

The native-D1 test fixture uses `getPlatformProxy({environment:'local',persist:false,remoteBindings:false})` with actual workerd D1 bindings and all committed migrations. It is **not node:sqlite or a mocked SQL adapter**. Real Wrangler smoke independently applies migrations to a fresh temporary local D1, reapplies them as a no-op, checks migration tracking/schema/foreign keys/query plans, then exercises the bundled production entry over HTTP. Test-only account/session fixtures simulate already-completed OAuth and are never mounted as runtime endpoints.

### Authorization matrix asserted with two independent sessions and guest

| Operation | Owner | Other account | Guest |
|---|---|---|---|
| Private read | Exact owner document | 404 | 404 |
| Public / Unlisted read | Exact owner document | Sanitized v1 | Sanitized v1 |
| Edit/delete/change visibility | Current revision only | Private 404; readable 403 | 401 |
| Copy Private | New Private owner duplicate | 404 | 401 |
| Copy Public / Unlisted | New Private duplicate | New copier-owned Private, sanitized | 401 |
| Own library | All own states | Only own records | 401 |
| Public author list | Public only | Public only | Public only |
| Public→Private | Owner retains access | Immediate 404/list removal | Immediate 404/list removal |

Additional tests cover forged/tampered/missing/expired sessions; injected owners/skill indexes; unavailable dependencies and safe logging; schema/version/official skill validation; raw CharacterSheet rejection; byte/metadata/page limits; invalid JSON/content type/methods/IDs/SQL-like strings; username duplicate/case/reserved/onboarding/races; update/update and update/delete races; foreign-copy privacy race; account cascade/confirmation/freshness; limiter concurrency/reset/429; OAuth callback allowlists/cookie flags/state/policy; public DTO nonleakage and owner JSON round-trip.

The prepared workflow captures a recovery bookmark before listing migrations. Inspection of pinned Wrangler 4.156.0 showed that `d1 migrations list` calls `CREATE TABLE IF NOT EXISTS d1_migrations`; preflight is therefore **not strictly read-only** on a fresh database. The first environment approval explicitly authorizes that tracking-table initialization; the separate second approval authorizes application migrations/deployment. This behavior was inspected locally, never executed remotely.

## Hosted acceptance — not run, exact owner actions

1. Review this PR, particularly privacy projection, account linking/verified-email policy, D1 limit costs and staging workflow. Do not merge automatically or begin T0020.
2. Follow [owner setup — Now](T0019_Owner_Setup.md#now--review-and-prepare-without-changing-production): inspect existing D1 and preview configuration without provisioning anything.
3. After eventual owner acceptance/merge, protect the GitHub `staging` environment with reviewers and main-only deployments, then add its scoped Cloudflare token/account ID privately. The new workflow is unavailable in the Actions website until present on `main`.
4. Explicitly dispatch on `main`, approve preflight, review pending migrations and recovery bookmark/backup, then separately approve staging migration/deployment. Confirm exact DB binding and live health 200 (`environment=staging`, `database=ok`).
5. Create staging-only Discord/Google apps and register the exact callbacks; add five runtime secrets in only the staging Worker's Dashboard. Never send credentials through chat/PR, Preview Base or `VITE_*`.
6. Perform **genuine** Google and Discord consent/callback/account creation; claim two usernames in separate browser profiles; run CRUD/access/copy/revocation/session/logout matrix plus anonymous/incognito checks. Record outcomes without private identifiers/tokens.
7. Measure actual callback CPU and D1 rows read/written on staging. Report whether the current Free plan suffices; seek a separate explicit decision if it does not. No billing change is authorized.

Until steps 4–7 succeed, full hosted T0019 acceptance remains pending. Production D1/OAuth/custom domain and release belong to T0021; account/My Builds/Save/Share/profile UI belongs to T0020, and search belongs to T0020-F1. No follow-up ticket was started.
