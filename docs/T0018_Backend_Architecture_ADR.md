# ADR T0018 — Cloudflare Workers + D1 Backend, Authentication and Build Storage

**Status:** Proposed with T0018 PR (awaiting product-owner review)
**Date:** 2026-11-06
**Ticket:** T0018 ([Issue #46](https://github.com/Zaelious/GorgonBuilder/issues/46))
**Provider decision:** Cloudflare Workers + D1, approved by the product owner on 2026-11-06. This ADR records it; it does not reopen it.
**Related:** [Build save/share design](Build_Save_And_Share_Design.md), [MVP technical design](MVP_Technical_Design.md), [T0018 verification](T0018_Verification.md), [owner setup](T0018_Owner_Setup.md)

## 1. Context

GorgonBuilder is a static Vite + React planner deployed as Cloudflare Workers Static Assets (`gorgonbuilder`, production branch `main`). The MVP now adds registered accounts, account-owned saved builds with Private/Unlisted/Public visibility, a personal library, author profiles and public search (T0019 → T0020 → T0020-F1 → T0021). T0018 lays the foundation and proves it locally, without live login, persistent CRUD, search endpoints or UI.

## 2. Decision summary

| Area | Decision |
|---|---|
| Hosting | The existing `gorgonbuilder` Worker serves both the SPA (Static Assets) and a same-origin API. No separate Workers project, no Pages, no Vite Cloudflare plugin yet. |
| Routing | `assets.run_worker_first: ["/api", "/api/*"]`. Only API paths invoke Worker code; every other request stays asset-first with the SPA fallback. Unknown `/api/*` paths are JSON 404s, wrong methods JSON 405s. |
| Database | Cloudflare D1, binding `DB`, forward-only numbered Wrangler migrations in `migrations/`. |
| Environments | Production (top level, **no D1 binding yet**), `env.local` (local-only placeholder DB), `env.staging` (`gorgonbuilder-staging`, placeholder ID until the owner creates it). Separate Worker names, `APP_ENV` values, databases and (later) secrets. |
| Authentication | **Better Auth 1.7.18** (exact pin) with its native D1 support, Discord + Google OAuth, no email/password. Feasibility proven in workerd with local D1; **not mounted** in production until T0019. |
| Ownership | Stable server-generated `user.id` is the only authorization identity. Usernames, emails, OAuth IDs, build IDs and client fields never authorize. Anonymous owner tokens are not implemented. |
| Visibility | `private` (default) owner-only; `unlisted` link-readable, never listed; `public` readable and listed. Enforced server-side by shared pure rules (`src/persistence/remote/access.ts`). |
| Repository | Async provider-neutral `BuildRepository` contract + deterministic test-only in-memory fake + shared contract test suite that T0019's D1 implementation must also pass. |
| BuildDocument | Schema v1 unchanged. Listing metadata, owner and visibility live in D1 columns, never in BuildDocument. |

## 3. Provider, limits and cost (verified 2026-11-06)

Figures were read from the official pages on 2026-11-06; Cloudflare changes them, so re-check before launch.

| Limit | Workers Free | Workers Paid ($5/month minimum) | Source |
|---|---|---|---|
| Worker requests | 100,000/day | 10 M/month included, then $0.30/M | [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (updated 2026-10-02) |
| CPU per HTTP request | **10 ms** | 30 s default, up to 5 min | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) |
| Subrequests per request | 50 | 10,000 | same |
| Worker size | 64 MiB uncompressed (no separate compressed limit listed) | same | same |
| Static asset requests | Free and unlimited | Free and unlimited | [Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| D1 rows read | 5 M/day | 25 B/month included, then $0.001/M | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) (updated 2026-10-30) |
| D1 rows written | 100,000/day | 50 M/month included, then $1.00/M | same |
| D1 storage | 5 GB total, 500 MB per database, 10 databases | 5 GB included then $0.75/GB-month; 10 GB per database | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 queries per Worker invocation | 50 | 1,000 | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) |
| D1 statement / row | 100 KB SQL text, 100 bound parameters, 2 MB row | same | same |
| D1 Time Travel (point-in-time restore) | 7 days | 30 days | same |

**Free-tier enforcement is real.** When D1 Free daily limits are exceeded, D1 queries return errors until 00:00 UTC; storage limits block inserts until data is deleted. When Worker Free requests are exhausted, `run_worker_first` routes return **429** instead of falling back to assets. Static pages keep working because they never invoke the Worker.

**Cost implications of this design:**
- Only `/api/*` requests count toward Worker request limits; the planner itself stays free and unlimited.
- `GET /api/health` runs `SELECT 1` (no table rows read).
- D1 bills rows *scanned*, and every index touched by a write adds a written row. A Private build insert therefore writes roughly 3 rows (table, primary-key index, owner index); a Public insert up to 7 (plus four public partial indexes). T0019 should confirm with D1's `meta.rows_written`. Session validation is one indexed read per authenticated request, plus a session write at most daily (`updateAge`).
- Unindexed or badly shaped public queries scan rows and spend the 5 M/day read allowance (see §8 query plans).
- Better Auth's built-in rate limiter with `database` storage would write a row per auth request; prefer the Cloudflare Workers Rate Limiting binding or memory + Turnstile (T0019 decision, §10).

**Rejected alternative (recorded only):** Supabase/Postgres or another hosted backend would split hosting/auth across providers, add cross-origin cookies and CORS, and needs no reconsideration because the provider decision is made. Workers KV or Durable Objects alone were not chosen for build records because listing/search needs SQL indexes; Durable Objects remain an option for future rate limiting.

## 4. Routing and API error strategy

```text
request ─▶ Cloudflare edge
            ├─ path matches "/api" or "/api/*" ─▶ worker/index.ts ─▶ worker/api/router.ts
            │                                         ├─ GET|HEAD /api/health ─▶ 200/503 JSON
            │                                         ├─ known path, wrong method ─▶ 405 JSON + Allow
            │                                         └─ anything else ─▶ 404 JSON
            └─ everything else ─▶ Static Assets ─▶ file, or index.html (SPA fallback)
```

- `/api` is listed separately because `/api/*` does not match it. `/apix` and `/builds/api` are SPA routes.
- The Worker also forwards non-API paths to `env.ASSETS.fetch` defensively, so a future routing change cannot break the SPA.
- All API responses: `content-type: application/json; charset=utf-8`, `cache-control: no-store`, `x-content-type-options: nosniff`, `referrer-policy: no-referrer`.
- Error envelope: `{ "error": { "code": "not_found" | "method_not_allowed" | "internal_error", "message": "..." } }`. T0019 extends the code list with the repository codes below; messages are user-safe and never include SQL, stack traces, IDs or binding names.
- `GET /api/health` → `200 {"status":"ok","service":"gorgonbuilder-api","environment":"<APP_ENV>","database":"ok"}`; `503` with `database: "not_configured"` (no binding — **expected in production until a production database is approved**) or `"error"` (query failed; only the error class is logged).
- No `/v1` prefix: same-origin first-party API; changes are additive, breaking changes get a new path.

### T0019 REST contract (to implement, not implemented in T0018)

| Method + path | Auth | Success | Notes |
|---|---|---|---|
| `GET/POST /api/auth/*` | Better Auth | per library | Sign-in, callback `/api/auth/callback/{discord,google}`, sign-out, get-session |
| `GET /api/me` | session | 200 profile + username status | Never returns other users' data |
| `PUT /api/me/username` | session | 200 | Onboarding; `validateUsername` + UNIQUE `username_normalized`; 409 on conflict |
| `POST /api/builds` | session | 201 record | Body: `{ document, title?, publicDescription?, visibility? }`; default Private |
| `GET /api/builds/:id` | optional | 200 record | Private → 404 for non-owners (no existence disclosure) |
| `PATCH /api/builds/:id` | owner | 200 record | Body includes `expectedRevision`; 409 `revision_conflict` |
| `DELETE /api/builds/:id` | owner | 200 `{id}` | `expectedRevision` (query or body) |
| `POST /api/builds/:id/copy` | session | 201 record | New ID, copier-owned, Private |
| `GET /api/me/builds` | session | 200 page | All visibilities, keyset cursor |
| `GET /api/users/:username/builds` | optional | 200 page | Public only; same for every viewer (T0020) |
| `GET /api/builds/search` | optional | 200 page | Public only (T0020-F1) |

Repository error → HTTP: `unauthenticated` 401, `forbidden` 403, `not_found` 404, `revision_conflict` 409, `payload_too_large` 413, `invalid_document`/`unsupported_schema_version`/`invalid_metadata`/`invalid_request` 400 (or 422). Public responses expose the author **username**, not `ownerUserId`, email, name or image.

## 5. Environments and isolation

| | Production (top level) | `env.local` | `env.staging` |
|---|---|---|---|
| Worker | `gorgonbuilder` (existing) | `gorgonbuilder-local` (never deployed) | `gorgonbuilder-staging` |
| `APP_ENV` | `production` | `local` | `staging` |
| D1 | **none in T0018** | `gorgonbuilder-local`, placeholder ID `00000000-…`, SQLite under `.wrangler/state` | `gorgonbuilder-staging`, `REPLACE_WITH_STAGING_DATABASE_ID` |
| Secrets (T0019) | Wrangler secrets on `gorgonbuilder` | `.dev.vars` (git-ignored) | Wrangler secrets with `--env staging` |
| OAuth clients (T0019) | Production client, production callback | Local test client if ever needed | Separate staging client |

- No top-level `d1_databases` entry: Wrangler would otherwise try to bind or auto-provision a production database on the next `main` deploy. The production binding is a deliberate launch step.
- Placeholder IDs fail on a real deploy instead of silently creating resources. Local IDs only name local SQLite files.
- Automated scripts and CI only use `--local`, `--dry-run` and temporary `--persist-to` directories; `worker/config.test.ts` fails if `--remote`, `d1 create/delete/execute` or a non-dry-run deploy appears in `package.json` or CI. The smoke script strips `CLOUDFLARE_*` variables from child processes.
- Wrangler warns that the plain production `wrangler deploy` has no `--env`; the warning is harmless (top level = production). The owner may set the dashboard deploy command to `npx wrangler deploy --env=""` to silence it.

## 6. Data model (`migrations/`)

**0001_better_auth_core.sql** — library-owned, generated by Better Auth 1.7.18 for the §7 option set: `user`, `session`, `account`, `verification` (+ indexes on `session.userId`, `account.userId`, `verification.identifier`). `worker/auth-probe/auth-schema.test.ts` asserts Better Auth needs nothing beyond the committed migrations.

**0002_profiles_and_builds.sql** — application-owned:

- `profile(user_id PK → user.id ON DELETE CASCADE, username, username_normalized UNIQUE CHECK = lower(username), created_at, updated_at)`. The public handle is separate from Better Auth's `user.name` (provider display name, private).
- `build(id PK, owner_user_id → user.id ON DELETE CASCADE, visibility DEFAULT 'private' CHECK IN (...), title 1–120, public_description ≤2000, skill_a_id, skill_b_id, schema_version, game_data_version, build_json json_valid ≤256 KiB, revision ≥1, created_at, updated_at)`.
- Indexes: owner library `(owner_user_id, updated_at DESC, id DESC)`; Public-only partial indexes on recency, owner, `skill_a_id` and `skill_b_id`.
- `skill_a_id`, `skill_b_id`, `schema_version` and `game_data_version` are derived server-side from the validated document (`prepareBuildDocument`). They are never accepted from the client. Raw CharacterSheet/Storage reports fail BuildDocument validation and are never stored or indexed.
- Account deletion cascades to profile and builds (T0019 must expose a confirmed delete flow).
- Timestamps in app tables are epoch milliseconds; Better Auth stores its own `date` columns.

**Migration policy.** Forward-only, sequential `NNNN_description.sql`; never edit an applied file. Apply local → staging → (backup) → production. Breaking changes use expand/contract over two releases. Each migration is reviewed in a PR and tested on node:sqlite (`worker/migrations.test.ts`) and local D1 (`npm run worker:smoke`). Run `wrangler d1 migrations apply --remote` only with explicit owner approval, one environment at a time. D1 has no interactive transactions; Better Auth uses `batch()` for atomicity, and T0019 should do the same.

## 7. Authentication decision

**Selected:** Better Auth `1.7.18` (the npm `latest` dist-tag on 2026-11-06), exact-pinned dev dependency for T0018. Native D1 support has been documented since Better Auth 1.5: pass `env.DB` as `database` ([1.5 release](https://better-auth.com/blog/1-5), [database concepts](https://better-auth.com/docs/concepts/database)). The package contains a dedicated D1 Kysely dialect that uses `batch()` and rejects interactive transactions. Better Auth 1.7 lists D1 as unsupported only for SCIM, which this project does not use ([1.7 release](https://better-auth.com/blog/1-7)).

**Evidence produced by T0018 (local workerd + local D1, not deployed):** `npm run worker:smoke` runs `worker/auth-probe` (local-only Worker, placeholder OAuth client IDs, probe-only secret) against a D1 migrated with the committed migrations:
- Better Auth initializes in workerd (`nodejs_compat` needed for `AsyncLocalStorage`).
- Discord and Google sign-in initiation return the correct provider authorize URLs with callback `<origin>/api/auth/callback/<provider>`, set an `HttpOnly; SameSite=Lax` state cookie and write OAuth state to D1 (`verification`).
- A foreign `callbackURL` is rejected (`INVALID_CALLBACK_URL`).
- A user + session row in D1 plus a signed `better-auth.session_token` cookie validates through `get-session`. A cookie-bearing cross-origin POST (`INVALID_ORIGIN`), a POST without Origin and a form-encoded POST are rejected without ending the session. Same-origin sign-out clears the cookie and deletes the D1 session.
- Bundle (dry run): ~1.77 MiB / ~320 KiB gzip, well inside the Worker size limit.
- Not proven locally (needs owner credentials): a real provider round trip, the token exchange and user creation from a real profile, and CPU time under the Workers Free 10 ms limit in production. T0019 must verify these on staging.

**Configuration T0019 adopts** (`worker/auth-probe/auth-options.ts`): `basePath: '/api/auth'`; `baseURL` = canonical HTTPS origin per environment; `trustedOrigins` = that origin only; `emailAndPassword` disabled; `socialProviders` Discord + Google; `account.encryptOAuthTokens: true`; 30-day sessions refreshed daily; `useSecureCookies` on HTTPS (`__Secure-` prefix); `HttpOnly`, `SameSite=Lax`, `Path=/`; telemetry disabled. Secrets (`BETTER_AUTH_SECRET`, provider client IDs/secrets) come only from Wrangler secrets / git-ignored `.dev.vars`. The production Worker also needs `compatibility_flags: ["nodejs_compat"]` in T0019.

**Username onboarding.** After the first OAuth sign-in, the user must choose a unique public GorgonBuilder username (`validateUsername`: 3–24 ASCII letters/digits with inner `_`/`-`, reserved route/staff names, case-insensitive uniqueness) before saving or publishing. Usernames are display identity only; renames (if allowed) never change ownership.

**Account-linking risk.** Better Auth can link providers by matching email. Enable implicit linking only for providers that return verified emails, or require an explicit signed-in "link account" action (T0019 decision). Better Auth's `user.email` is required: a Discord account without an email cannot sign in, which is acceptable for MVP but should be shown as a clear error.

**Why not alternatives:** Auth.js has a D1 adapter but is framework-oriented and heavier to wire into a plain Worker; Lucia is no longer maintained as a library; hosted identity providers add cost, vendor data sharing and cross-origin complexity; a hand-rolled password system is out of scope by policy. Email/password would need verified email delivery and reset flows, and password hashing risks the 10 ms Free CPU limit. It requires separate approval.

## 8. Visibility, access and search

| Operation | Owner | Other signed-in user | Guest |
|---|---|---|---|
| Read Private | ✅ | 404 (as if missing) | 404 |
| Read Unlisted / Public | ✅ | ✅ read-only | ✅ read-only |
| Update / delete / change visibility | ✅ (with current revision) | 403 if readable, else 404 | 401 |
| Copy | ✅ (duplicate) | ✅ if readable → new Private copy owned by copier | 401 |
| Appears in public search, author profile, public counts | Public only | Public only | Public only |
| Owner library (My Builds) | all visibilities | — | 401 |

- Switching Public/Unlisted → Private takes effect at once; API responses are `no-store`, so CDN/browser caches cannot serve revoked content.
- Copies reset the public description and never transfer ownership; provenance links are not stored, so a later Private source is not exposed through copies.
- The search contract (`src/persistence/remote/search-contract.ts`) defines 0–2 distinct combat-skill IDs. One skill matches either slot. Two skills with **Match both** require both, in either order (AND). With Match both off, either skill matches (OR). Text (title, public description, author username, case-insensitive) is ANDed with the skill filter, results are Public only, and recent-first keyset pagination returns at most 50 per page with no total counts. `matchesPublicSearch` is the reference oracle that T0020-F1's SQL must match.
- **Query-plan finding (node:sqlite and local D1):** the obvious `visibility='public' AND (skill_a_id=? OR skill_b_id=?) ORDER BY updated_at DESC` makes SQLite walk the public-recency index and filter rows, even after `ANALYZE` on 20,000 rows. For rare skills that becomes a public-table scan, and every scanned row is billed. A `UNION` with one branch per slot uses the skill partial indexes (`SEARCH ... build_public_skill_a_idx` / `_b_idx`). `worker/migrations.test.ts` pins these shapes. T0020-F1 must re-measure with representative data and `rows_read` metadata before choosing between UNION queries, a `build_skill` junction table and FTS5 for text. D1 supports FTS5, but no performance is assumed here.

## 9. Guest/local boundary and draft safety

- Guests keep full local planning: `gorgonbuilder.current-draft`, `gorgonbuilder.preferences`, browser-local CharacterSheet/Storage import and My Items are unchanged. Import files are never uploaded.
- Sessions live only in HttpOnly cookies; account/listing metadata live in D1; neither enters BuildDocument or localStorage.
- **Login/logout overlap plan (T0020):**
  1. Signing in never overwrites the local draft. An unsaved draft stays the working draft and gets an explicit "Save to my account" option.
  2. Opening a saved build while the local draft has unsaved changes asks the user to save, discard or keep the draft first. No silent replacement.
  3. Signing out keeps the local draft, which is browser data. It never deletes the draft or uploads it.
  4. Session expiry during an edit keeps the draft and shows a re-authenticate prompt. Saving resumes with the same `expectedRevision`, and a 409 conflict offers "save as copy".
  5. A different user signing in on the same browser sees the same local draft, because the browser owns the draft, not the account. T0020 should say so in the UI and offer "Clear build".

## 10. Security design (T0019/T0021 requirements)

- **Session validation:** every private read and every mutation validates the Better Auth session server-side, then derives `Actor` from `session.user.id`. Client-supplied owner fields are ignored or rejected.
- **CSRF:** Better Auth's origin check covers `/api/auth/*`. T0019 applies the same rule to every cookie-authenticated non-GET API route: require `Origin` to equal the canonical origin and `Content-Type: application/json`. Use `SameSite=Lax` cookies. Never use GET for mutations.
- **Cookies:** `HttpOnly`, `Secure` + `__Secure-` prefix on HTTPS, `SameSite=Lax`, host-only (no `Domain` attribute), never readable by JS and never in share links.
- **Rate limits/abuse:** use the Cloudflare Rate Limiting binding (or Better Auth memory limiter plus edge rules) on sign-in, username claim, build create/update/copy, and later search. Add Turnstile on username claim and first publish if abuse appears. Cap at 100 builds per account for MVP, configurable.
- **Payload caps:** 256 KiB canonical BuildDocument JSON (app check + D1 CHECK; D1 row limit 2 MB), title 120, description 2,000, search text 100, page size 50. Reject request bodies larger than the cap before parsing.
- **Validation:** strict closed-schema BuildDocument v1; unsupported schema versions are rejected, not migrated. The game-data version is preserved. Optional combat-skill allowlist hook. Titles and descriptions reject control and bidi-override characters and are always rendered as text, never HTML.
- **Usernames:** ASCII-only (no homoglyph impersonation), reserved names, case-insensitive UNIQUE.
- **Logging:** never log cookies, Authorization headers, request bodies, BuildDocuments, emails, OAuth tokens or D1 error messages. Log route, status and error class. Workers observability is enabled; review its retention before launch.
- **Password/email risk (if ever enabled):** requires verified email delivery, reset tokens, breached-password checks, CPU-safe hashing (Paid CPU limits) and enumeration-safe responses. Not approved.
- **Backups:** D1 Time Travel (7 days Free / 30 days Paid). Run `wrangler d1 export --remote` before every production migration and keep exports off-repo (they contain personal data).
- **Moderation:** owner/admin can unpublish (set Private) or delete abusive Public builds and reserve or rename abusive usernames. T0021 documents a report contact and procedure. Public listings show only username, title, description and BuildDocument content the author chose to publish. T0020 must warn that publishing discloses imported item-instance data contained in the build.

## 11. Domain, origin, cookie and OAuth callback constraints

- One canonical HTTPS origin per environment: production starts as `https://gorgonbuilder.zbailouz7.workers.dev` and later the owner's existing custom domain. Staging is `https://gorgonbuilder-staging.zbailouz7.workers.dev`.
- Better Auth `baseURL`, `trustedOrigins` and the OAuth redirect URIs must all use that exact origin. Callback URL: `<origin>/api/auth/callback/discord` and `<origin>/api/auth/callback/google`.
- Cookies are host-only, so sessions on `workers.dev`, the custom domain and preview URLs are separate. When the custom domain launches, redirect `workers.dev` to it (or disable it) to avoid two login origins.
- **Preview URLs** (`preview_urls: true`, per-PR previews) must not receive production secrets or the production D1 binding, and must not be registered as OAuth redirect URIs. Staging uses its own secrets, database and OAuth clients. If Cloudflare preview builds ever need auth, give them the staging configuration only.
- Binding the existing paid domain: add it as a Cloudflare zone (if not already), then Workers → `gorgonbuilder` → Settings → Domains & Routes → Custom domain. No new domain purchase is needed.

## 12. T0019 / T0020 handoff checklist

1. Add `nodejs_compat`, mount Better Auth at `/api/auth/*` with `createAuthOptions` (moved out of `auth-probe/`), and read secrets from the environment.
2. After owner approval, create staging D1/secrets/OAuth clients; apply migrations `--env staging --remote`; verify a real Discord and Google round trip and CPU time.
3. Implement `D1BuildRepository` satisfying `describeBuildRepositoryContract` (run against local D1 via Wrangler/Miniflare). Use `batch()` for multi-statement writes and conditional `UPDATE ... WHERE revision = ?` for optimistic concurrency.
4. Add the §4 routes with session-derived `Actor`, CSRF/origin and content-type checks, body-size caps and rate limits.
5. Implement username onboarding and the reserved list. Return 409 on conflict.
6. Add two-account + guest privacy tests (Private never readable or listed; Unlisted never listed; revocation is immediate).
7. T0020: sign-in UI, My Builds, Save/Update/Delete, visibility controls, share links, copy, draft-overlap UX (§9).
8. T0020-F1: search endpoint and UI using measured query shapes (§8).
9. T0021: production D1 + backup + custom domain + secrets, after explicit owner approval.

## 13. Open questions for the product owner

- Confirm Discord + Google as the MVP providers (default recommendation).
- Allowed username renames (and cooldown), and whether a username is required before saving Private builds or only before publishing.
- Per-account build cap and whether moderation needs an admin UI or only documented manual D1 operations for MVP.
- Workers Free vs Paid at launch. Free is sufficient for local and staging work; the 10 ms CPU and 100k requests/day limits should be measured on staging before launch.
