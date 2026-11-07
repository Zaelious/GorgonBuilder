# T0019 owner setup — websites only

Written 2026-11-07. This guide supersedes the terminal-based staging steps in T0018's historical guide. **No remote migration, deployment, credential write, resource creation or billing change was executed during implementation.** Local tests and deployment dry-runs do not establish hosted OAuth readiness. See [verification](T0019_Verification.md).

## Now — review and prepare without changing production

1. Review the T0019 PR and its verification report. Do not start T0020 or merge automatically. Production `gorgonbuilder` intentionally has **no DB binding or authentication credentials**; its account endpoints return 503. Guest planning remains available.
2. Sign in to [Cloudflare Dashboard](https://dash.cloudflare.com), choose the GorgonBuilder account → **Storage & databases → D1 SQL database → gorgonbuilder-staging → Settings**. Confirm database ID **`477e9b46-bb96-4eca-a5ed-1ee57185fb2a`**. This database already exists. **Do not create another database.** It has not been remotely migrated or attached by this work.
3. Open **Workers & Pages → gorgonbuilder → Settings → Builds**. Confirm repository `Zaelious/GorgonBuilder`, production branch `main`, build `npm run build`, deploy `npx wrangler deploy`, preview `npx wrangler preview`. Keep staging out of this automatic build connection. Inspect preview Build variables and Previews Base secrets: there must be **no** DB, Cloudflare deployment token, `BETTER_AUTH_SECRET`, Discord/Google credentials, or staging origin there. Check active previews too; deleting a Base secret does not remove copies already given to existing previews. Never register preview URLs as OAuth redirects.
4. Review the manual [staging workflow](../.github/workflows/staging.yml). It runs **only when dispatched on `main`** and uses the dispatch commit SHA for both jobs. It does not run on PRs or pushes. **GitHub's Actions website cannot dispatch this new workflow until its file exists on the default branch.** Until the owner later reviews and merges T0019, the website deployment path is prepared but unavailable; hosted acceptance stays pending. Do not change this guard to deploy arbitrary PR code.

## Needed for hosted T0019 verification — explicitly authorize each remote step

### 1. Protect the GitHub staging environment

Open [repository environments](https://github.com/Zaelious/GorgonBuilder/settings/environments) → **New environment** → name exactly **`staging`** → **Configure environment**.

- Under **Deployment protection rules**, enable **Required reviewers**, choose the product owner or trusted reviewer, and save. Only enable **Prevent self-review** if a different authorized person can approve the run; a sole owner must be able to approve their own dispatch.
- Under **Deployment branches and tags**, select **Selected branches and tags** → add branch **`main`** only.
- Leave administrator bypass disabled where available.
- If GitHub does not offer required reviewers for this repository's current visibility/plan, **stop before adding credentials**. Do not upgrade a plan. Have the owner arrange an equivalent approval gate first; `environment: staging` alone does not create protection rules. A boolean dispatch confirmation alone is not the review gate.
- Never put deployment credentials in repository-wide/organization-wide secrets or PR preview build variables. Use **environment secrets** below.

### 2. Create a narrowly scoped Cloudflare token and store it securely

In [Cloudflare API tokens](https://dash.cloudflare.com/profile/api-tokens) → **Create Token → Create Custom Token**:

1. Name: `GorgonBuilder staging manual deploy`.
2. Permissions: **Account → Workers Scripts → Edit** and **Account → D1 → Edit**. Include **Account → Account Settings → Read** only if account lookup requires it. No DNS, zone, billing, user-management or paid-service permission is needed. Select only the GorgonBuilder Cloudflare account under **Account Resources**. Choose a short expiry appropriate to staging verification.
3. Read the resulting scope before **Continue to summary → Create Token**. Cloudflare account-level script/D1 permissions are broader than this one Worker/database: the exact target guards protect normal workflow execution, but the token itself is powerful. Restrict environment reviewers and repository writers accordingly. Do not give this token to Cloudflare PR builds.
4. Copy the token once into [GitHub staging environment settings](https://github.com/Zaelious/GorgonBuilder/settings/environments) → **staging → Environment secrets → Add environment secret** named **`CLOUDFLARE_API_TOKEN`**. Never paste it in chat, issues, PRs, screenshots or ordinary variables.
5. Find **Account ID** on the Cloudflare account overview (also in the Dashboard URL). Add it as another **staging environment secret**, **`CLOUDFLARE_ACCOUNT_ID`**. The account ID and D1 UUID are identifiers, not passwords.

### 3. Authorize preflight, then approve migration and staging deployment

After T0019 is eventually accepted/merged by the owner, open [GitHub Actions](https://github.com/Zaelious/GorgonBuilder/actions) → **T0019 staging (manual approval only)** → **Run workflow**.

1. Branch must be **main**. Type **`gorgonbuilder-staging`** into the confirmation field and tick the recovery-review checkbox. Pressing **Run workflow** explicitly authorizes this staging run; it does not authorize production work.
2. Open the run → **Review deployments** → approve **preflight** for `staging`. This first job checks the exact Worker/DB target, captures a D1 Time Travel recovery bookmark first, then lists pending remote migrations. **Wrangler 4.156.0 may create its empty `d1_migrations` tracking table when listing. Your first approval explicitly authorizes this metadata initialization.** It does not apply application migrations or deploy.
3. Open the run's **Summary**. Verify Worker **gorgonbuilder-staging**, database **477e9b46-bb96-4eca-a5ed-1ee57185fb2a**, and expected migration list. On the first run, these three should be pending:
   - `0001_better_auth_core.sql`
   - `0002_profiles_and_builds.sql`
   - `0003_api_rate_limit.sql`
4. Record the displayed Time Travel bookmark/time privately. In Cloudflare → **D1 → gorgonbuilder-staging → Time Travel**, confirm recovery is available. Before a later migration on a database with account/build data, use **D1 → database → Export** (when offered) to download a private backup, or explicitly arrange an authorized export. Keep backups out of git, workflow artifacts and PRs. Do not apply if recovery is unclear. An empty initial database has no user data to back up.
5. The separate **deploy** job waits for a second `staging` environment approval. After reviewing preflight/recovery, approve it. It runs checks, applies migrations with **`DB --env staging --remote`**, then deploys with **`--env staging --name gorgonbuilder-staging`**. No database is created; production and preview bindings remain empty. No OAuth or session secret is written by this workflow.
6. In Cloudflare → **Workers & Pages**, select **gorgonbuilder-staging**. Under **Settings → Bindings**, verify **D1 database**, variable **DB**, database **gorgonbuilder-staging** with the exact UUID. `APP_ENV` must be `staging`. Do not add a DB to `gorgonbuilder` or any preview.
7. Open [staging health](https://gorgonbuilder-staging.zbailouz7.workers.dev/api/health). Expected HTTP 200 JSON: `environment: staging`, `database: ok`. `/api/me` should still be 503 until all auth secrets below are configured. `/` and `/builds/check` should show the existing planner. Unknown `/api/nope` returns JSON 404.

If preflight/deployment fails, read the first failed step and stop. Missing credentials/protection/recovery are not reasons to disable guards, use production bindings, create another database or buy a plan. A repeated approved run applies only pending numbered migrations; applied migrations are never edited. A Worker rollback does not undo a database migration. Recovery through Time Travel rewinds all database contents and needs separate explicit owner authorization.

### 4. Create staging-only Discord and Google OAuth apps

Use origin **`https://gorgonbuilder-staging.zbailouz7.workers.dev`**, no trailing slash. Register exact HTTPS callbacks only.

**Discord:** [Developer applications](https://discord.com/developers/applications) → **New Application**, name `GorgonBuilder Staging` → accept provider terms → **Create**. Open **OAuth2** (General if split) → copy **Client ID**, reset/reveal **Client Secret** privately. Under **Redirects → Add Redirect**, add:

`https://gorgonbuilder-staging.zbailouz7.workers.dev/api/auth/callback/discord`

Save changes. The server requests `identify` + `email`. No bot, privileged gateway intent or permission integer is needed. Test accounts need an available **verified email**. Missing/unverified email is rejected; the API's safe error explains trying Google. No fabricated email or fallback password is used.

**Google:** [Cloud console](https://console.cloud.google.com) → project selector → **New Project**, name `GorgonBuilder Staging` (or use a dedicated existing staging project; do not enable billing). Open **Google Auth Platform → Get started/Branding**: set application name, support email and developer contact. Under **Audience**, choose **External**, keep publishing status **Testing**, add the two staging tester Google accounts under **Test users**. Under **Data Access**, use only basic `openid`, email, profile scopes. Under **Clients → Create client**, choose **Web application**, name `GorgonBuilder Staging`:

- Authorized JavaScript origin: `https://gorgonbuilder-staging.zbailouz7.workers.dev`
- Authorized redirect URI: `https://gorgonbuilder-staging.zbailouz7.workers.dev/api/auth/callback/google`

Create, then privately copy the client ID and secret. Google must return a verified email. Do not register production/custom-domain or preview callbacks in either staging app. Never enable paid APIs for these basic login scopes.

### 5. Add runtime secrets to only the staging Worker

Cloudflare → **Workers & Pages → gorgonbuilder-staging → Settings → Variables and Secrets → Add** → type **Secret** for each:

| Name | Value entered privately in Dashboard |
|---|---|
| `BETTER_AUTH_SECRET` | New cryptographically random secret, at least 32 random bytes; generate with a password manager's secure generator (e.g. 64 random characters). Unique to staging. |
| `DISCORD_CLIENT_ID` | Staging Discord client ID |
| `DISCORD_CLIENT_SECRET` | Staging Discord secret |
| `GOOGLE_CLIENT_ID` | Staging Google client ID |
| `GOOGLE_CLIENT_SECRET` | Staging Google secret |

Save/deploy the secret configuration when the Dashboard prompts. Confirm the Worker heading still says **gorgonbuilder-staging** before every write. Never use `VITE_*`, build variables, Previews Base secrets, GitHub workflow output or tracked files for these values. `APP_ENV=staging` is already declared in Wrangler; the canonical staging origin is fixed in server code. No owner terminal or Wrangler login is required. Future approved staging workflow deployments preserve existing runtime secrets.

Secrets exposure: rotate at the issuing provider immediately, update only the staging Worker, and revoke affected sessions by rotating the signing secret if necessary. Do not send old values to the implementation agent.

### 6. Perform genuine OAuth and API verification

T0019 deliberately has no login UI. On the **staging planner**, open browser developer tools → **Console**. These same-origin snippets contain no credentials and use HttpOnly cookies automatically:

```js
// Choose one provider; a genuine provider consent/login round trip must complete.
const start = await fetch('/api/auth/sign-in/social', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ provider: 'google', callbackURL: '/' })
}).then(r => r.json());
if (start.url) location.assign(start.url);
```

After returning, run `await fetch('/api/me').then(r => r.json())`. Expected `authenticated: true`, `needsUsername: true`. Claim a unique handle:

```js
await fetch('/api/me/username', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'StagingAlice' })
}).then(r => r.json());
```

Repeat login in a separate browser/profile for account B, choosing `discord`, with handle `StagingBob`. Also test Google with account A and Discord with account B returning from real provider pages; repeat each provider with a fresh supported account to verify actual account creation. **Providers sharing an email do not automatically link.** Use the original sign-in provider for an existing account; explicit linking is deferred.

For CRUD use a **synthetic** planner draft; never use private exports for staging verification. In account A's console:

```js
const document = JSON.parse(localStorage.getItem('gorgonbuilder.current-draft'));
const created = await fetch('/api/builds', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ document, title: 'Staging privacy check' })
}).then(r => r.json());
console.log(created.id, created.revision); // Public address + revision only; no cookies/tokens.
```

If localStorage holds no draft, first edit the synthetic planner and wait for autosave. Keep the returned ID in this browser. Read it with `fetch('/api/builds/' + created.id)`. Use **PATCH** with JSON `{expectedRevision: created.revision, visibility:'unlisted'}` or `'public'`; retain each returned revision. Use the authorization matrix in [verification](T0019_Verification.md): test account B and an incognito guest by direct API URL, owner library, Public-only author list, independent copy, Public→Private revocation, stale revision 409, and DELETE with the current revision. Public/Unlisted non-owner documents must contain no character/provenance/private notes. Owner receives original v1 JSON.

The ADR's account-erasure API is also implemented: `DELETE /api/me` with JSON `{"confirmation":"delete my account"}` requires a session created within the last ten minutes. It permanently cascades that account's builds, profile, provider accounts and sessions; use only disposable synthetic staging accounts after recording test results.

Logout from each account:

```js
await fetch('/api/auth/sign-out', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
await fetch('/api/me'); // 401; local planner draft still present.
```

In **Application/Storage → Cookies**, verify session/state cookies are `Secure`, `HttpOnly`, `SameSite=Lax`, host-only, and absent from localStorage. Do not copy cookies into a report. Test an expired/revoked session with the reviewer; don't shorten or edit production sessions.

In Cloudflare **gorgonbuilder-staging → Metrics/Observability**, inspect OAuth callback CPU duration, errors and request totals; in **D1 → gorgonbuilder-staging → Metrics**, record rows read/written during an isolated test interval. The Workers Free **10 ms CPU/request** caveat is unresolved until these real callbacks are measured. Local workerd timing is not billing/CPU evidence. If Free is inadequate, report findings and seek an explicit decision; never upgrade automatically.

Record only non-sensitive evidence: deployment commit, DB identifier, health status, provider tested/outcome, authorization results, CPU measurements and D1 usage. Real OAuth is **not verified** until these checks succeed. A green CI or PR preview is a separate evidence level.

## Later at launch — outside T0019

Production D1, production OAuth, custom domain, account recovery/moderation policy and release regression belong to T0021 after T0020/T0020-F1. They require separate owner authorization. Do not attach the staging database to production, share signing secrets between origins, enable paid services, change billing or dispatch scheduled provisioning. Before production account data exists, re-audit every Cloudflare build credential and active preview; untrusted PR code must never execute with account-wide backend deployment credentials.

References: [Cloudflare Preview configuration and Base secrets](https://developers.cloudflare.com/workers/previews/configuration/), [resource binding isolation](https://developers.cloudflare.com/workers/previews/resources/), [D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/), [manual GitHub workflows](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).
