# T0018 — Owner Setup Guide (Cloudflare Workers + D1)

**Who this is for:** the GorgonBuilder product owner. You don't need a developer background.
**Written:** 2026-11-06 for the T0018 PR. Cloudflare's dashboard wording changes from time to time. If a menu name below doesn't match exactly, use the dashboard search box (top of the page) for the item name.

> ## ⚠️ DO NOT SHARE SECRETS
> Never paste any of these into a GitHub issue, pull request, commit, chat or screenshot: Cloudflare API tokens, the `~/.wrangler` login files, `BETTER_AUTH_SECRET`, Discord or Google **client secrets**, or `.dev.vars` contents.
> Safe to share: Worker names, URLs, D1 database **names and IDs** (identifiers, not passwords), and OAuth **client IDs**.
> If a secret is exposed, revoke or rotate it at the provider straight away, then replace it with `npx wrangler secret put`.

## At a glance

| Part | Needed for T0018 review? | Changes Cloudflare? | Can cost money? |
|---|---|---|---|
| **A. No action required** | — | No | No |
| **B. Optional staging check** | No (optional) | Yes: creates a staging D1 database and a staging Worker | No on Workers Free, within limits |
| **C. T0019 OAuth setup** | No (needed before T0019 testing) | Adds secrets to staging | No |
| **D. Launch: production DB and custom domain** | No (T0021) | Yes: production data and DNS | Only if you choose Workers Paid |

---

## Part A — No action required to review T0018

1. **Everything in T0018 was verified locally.** The local Worker, the local D1 database, the migrations, the Better Auth probe and the fake repository tests all run on a developer machine or in GitHub CI. None of them contact your Cloudflare account. The implementation agent had **no** Cloudflare login and used none.
2. **You don't need to:** buy a plan, create a database, register Discord/Google apps, set secrets, move a domain or deploy anything.
3. **What changes when the PR is merged.** Cloudflare Workers Builds deploys `main` to the existing `gorgonbuilder` Worker as usual:
   - The planner works exactly as before. Page requests are still served as free static assets.
   - `https://gorgonbuilder.zbailouz7.workers.dev/api/health` starts answering with JSON. It returns **HTTP 503** with `"database":"not_configured"`, because no production database exists yet. **That is expected**, not an outage.
   - Unknown `/api/...` addresses return a JSON 404 instead of the planner page.
   - Only `/api/...` requests count toward the Workers Free limit of 100,000 requests per day.
4. **Optional checks (read-only, about 2 minutes):**
   1. Sign in at <https://dash.cloudflare.com> with the account that owns GorgonBuilder.
   2. Open **Workers & Pages** in the left sidebar → select **gorgonbuilder**.
      Expected: the Worker exists, and **Settings → Build** shows repository `Zaelious/GorgonBuilder`, production branch `main`, build command `npm run build` and deploy command `npx wrangler deploy`.
   3. Check your plan: left sidebar **Workers & Pages** → **Plans** (or **Manage account → Billing → Subscriptions**). Expected: Workers **Free** (or Paid, if you upgraded earlier).
   4. Optional, after merge: open the production `/api/health` URL above. Expected: JSON with `"status":"unavailable","database":"not_configured"`.

   The deploy log may show the warning *"Multiple environments are defined…no target environment was specified"*. It is harmless: the top-level configuration **is** production. To silence it, change the deploy command to `npx wrangler deploy --env=""` under **Settings → Build** (optional).

---

## Part B — Optional staging check (only if you decide to authorize it)

Do this only if you want to see the API and D1 running on Cloudflare before T0019. It **creates real Cloudflare resources** (a free D1 database and a second Worker called `gorgonbuilder-staging`). It never touches production data, because production has no database yet.

**You'll need:** a computer with Node 24 (or 22.22+), Git, a clone of the repository with this PR's branch checked out, and `npm ci` already run.

### B1. Log in to Cloudflare from the terminal

```bash
npx wrangler login
```

A browser window asks you to allow Wrangler. Click **Allow**. If no browser can open (for example over SSH or in a container), use the device flow instead and follow the code it prints:

```bash
npx wrangler login --device
```

Check which account you're logged into:

```bash
npx wrangler whoami
```

Expected: your email and the account that owns `gorgonbuilder`. If you have several accounts, Wrangler asks you to choose one later. Pick the same account.

### B2. Create the staging database (creates a remote resource)

```bash
npx wrangler d1 create gorgonbuilder-staging
```

- If Wrangler asks *"Would you like Wrangler to add it on your behalf?"*, answer **No**. You'll add it by hand to the right place in step B3. Letting Wrangler edit the file could attach it to production.
- Expected output includes a block like `"database_name": "gorgonbuilder-staging"` and `"database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"`. Copy the `database_id`. It's an identifier, not a secret.
- Dashboard alternative: **Storage & databases → D1 SQL database → Create database**, name `gorgonbuilder-staging`. The ID is shown on the database's page.

### B3. Record the ID in `wrangler.jsonc`

Open `wrangler.jsonc`. Under `"env"` → `"staging"` → `"d1_databases"`, replace

```jsonc
"database_id": "REPLACE_WITH_STAGING_DATABASE_ID",
```

with your copied ID. **Edit only the `staging` block.** Leave the `local` block and the top level (production) unchanged.

How it connects: `"binding": "DB"` is the name the Worker code uses (`env.DB`). `"database_name"`/`"database_id"` select which real database that name points to in this environment. If you want the ID kept in the repository, a developer can commit it (it's not secret); otherwise keep the edit local.

### B4. Apply the migrations to **staging** (changes remote data)

`--local` only changes a database file on your own computer. `--remote` changes the real Cloudflare database. This step is the one place you use `--remote`, and it's limited to `--env staging`:

```bash
npx wrangler d1 migrations list DB --env staging --remote
```

Expected: two migrations listed as pending, `0001_better_auth_core.sql` and `0002_profiles_and_builds.sql`. If it lists anything else, or names a database other than `gorgonbuilder-staging`, **stop**.

```bash
npx wrangler d1 migrations apply DB --env staging --remote
```

Expected: a table showing both migrations with ✅. Running it again prints "No migrations to apply". **Never** run `--remote` migrations without `--env staging` until a production database has been deliberately created and reviewed (Part D).

### B5. Deploy the staging Worker

```bash
npm run build
```

```bash
npx wrangler deploy --env staging
```

Expected: `Uploaded gorgonbuilder-staging`, a URL like `https://gorgonbuilder-staging.zbailouz7.workers.dev`, and bindings `env.DB (gorgonbuilder-staging)`, `env.ASSETS`, `env.APP_ENV ("staging")`.

### B6. Verify safely

Open `https://gorgonbuilder-staging.zbailouz7.workers.dev/api/health` in a browser.

Expected:

```json
{"status":"ok","service":"gorgonbuilder-api","environment":"staging","database":"ok"}
```

Also check that `https://gorgonbuilder-staging.zbailouz7.workers.dev/` shows the planner, and that `/api/does-not-exist` shows a JSON `not_found` error. The health check reads no table rows.

### B7. Free-tier limits and usage

- Workers Free: 100,000 Worker requests/day, 10 ms CPU per request. Planner pages (static assets) are free and don't count.
- D1 Free: 5 million rows read/day, 100,000 rows written/day, 5 GB total storage, 10 databases. **These limits are enforced.** Past them, D1 returns errors until 00:00 UTC, and Worker routes return 429 once the request limit is used.
- Where to look: **Workers & Pages → gorgonbuilder-staging → Metrics**, and **Storage & databases → D1 SQL database → gorgonbuilder-staging → Metrics**.
- CI never needs Cloudflare credentials for T0018. Don't add a Cloudflare API token to GitHub secrets unless a later ticket explicitly asks for remote CI, with the narrowest token scope.

### B8. Undo staging (optional)

Dashboard: **Workers & Pages → gorgonbuilder-staging → Settings → Delete**, and **D1 → gorgonbuilder-staging → Settings → Delete**. Or run these, one at a time:

```bash
npx wrangler delete --env staging
```

```bash
npx wrangler d1 delete gorgonbuilder-staging
```

Report the outcome in the PR as *"staging verified by owner"*. If you skip Part B, the PR stays **"Not executed — owner action required"** for remote checks, which is fine for T0018.

---

## Part C — Later: OAuth setup for T0019 (not a T0018 blocker)

Do this when T0019 is ready for real login testing. Create **separate** apps or clients for staging and production, so a staging mistake can't affect real users. In these steps, `<ORIGIN>` means the exact site address, for example `https://gorgonbuilder-staging.zbailouz7.workers.dev` (staging) or your production domain later.

### C1. Discord

1. Go to <https://discord.com/developers/applications> → **New Application** → name it, e.g. `GorgonBuilder Staging`.
2. **OAuth2** page: copy the **Client ID**. Click **Reset Secret** to reveal the **Client Secret**, and keep it private.
3. **OAuth2 → Redirects → Add Redirect:** `<ORIGIN>/api/auth/callback/discord`. Save.
4. Scopes used: `identify` and `email`. You don't need to configure them; GorgonBuilder requests them.

### C2. Google

1. Go to <https://console.cloud.google.com> → create or select a project, e.g. `gorgonbuilder`.
2. **Google Auth Platform** (formerly **APIs & Services → OAuth consent screen**): set the app name and support email, audience **External**, and add yourself as a test user while testing.
3. **Clients** (or **APIs & Services → Credentials**) → **Create client** → type **Web application**:
   - Authorized JavaScript origins: `<ORIGIN>`
   - Authorized redirect URIs: `<ORIGIN>/api/auth/callback/google`
4. Copy the **Client ID** and **Client secret**. Keep the secret private.

### C3. Store secrets in Cloudflare (never in git)

Generate a session secret for each environment and keep it private, e.g. `openssl rand -base64 32`. Then run each command and paste the value **only into the terminal prompt**:

```bash
npx wrangler secret put BETTER_AUTH_SECRET --env staging
```

```bash
npx wrangler secret put DISCORD_CLIENT_ID --env staging
```

```bash
npx wrangler secret put DISCORD_CLIENT_SECRET --env staging
```

```bash
npx wrangler secret put GOOGLE_CLIENT_ID --env staging
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET --env staging
```

For production later, run the same commands without `--env staging`. Dashboard alternative: **Workers & Pages → (worker) → Settings → Variables and Secrets → Add → type Secret**.

Never put these secrets in `wrangler.jsonc`, a PR or chat. For local login testing only, copy `.dev.vars.example` to `.dev.vars` (git-ignored) on your own machine.

**Important:** don't register Cloudflare **preview URLs** as OAuth redirect URIs, and never give preview deployments production secrets.

---

## Part D — Launch (T0021): production database, backups and custom domain

Only after T0019/T0020 are accepted and you explicitly approve launch.

1. **Create production D1:** `npx wrangler d1 create gorgonbuilder-production` (answer **No** to auto-adding). A developer then adds a top-level `d1_databases` entry (binding `DB`) in a reviewed PR. Production `/api/health` then reports `"database":"ok"`.
2. **Before any production migration:** run `npx wrangler d1 migrations list DB --remote`, then export a backup:
   ```bash
   npx wrangler d1 export DB --remote --output gorgonbuilder-backup.sql
   ```
   Keep exports **out of the repository**, because they contain account data. D1 Time Travel also keeps point-in-time history (7 days on Free, 30 on Paid): **D1 → database → Time Travel**.
3. **Apply migrations** with `npx wrangler d1 migrations apply DB --remote`, only for reviewed migrations.
4. **Secrets and OAuth:** production Discord/Google clients with redirect URIs on the final domain; set secrets without `--env`.
5. **Custom domain (you already own one; don't buy another):**
   - The domain must be an active zone in the same Cloudflare account. If it's registered elsewhere, choose **Add a domain** in the dashboard and change your registrar's nameservers to the two Cloudflare nameservers shown. The Free zone plan is enough.
   - **Workers & Pages → gorgonbuilder → Settings → Domains & Routes → Add → Custom domain** → enter, e.g., `gorgonbuilder.example`. Cloudflare creates DNS and an HTTPS certificate automatically (usually minutes).
   - Then update the OAuth redirect URIs and the Better Auth origin to the custom domain, and redirect or disable `workers.dev` so sessions don't split across two sites.
6. **Billing decisions that need your explicit approval:** upgrading to Workers Paid ($5/month minimum) if staging measurements exceed Free CPU or request limits, raising D1 storage, or anything that enables overage billing.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| `wrangler login` opens nothing or hangs | No browser, or a blocked localhost callback | Use `npx wrangler login --device` |
| `Authentication error [code: 10000]` or a wrong account | Logged into a different Cloudflare account | `npx wrangler logout`, then log in again; check `npx wrangler whoami` |
| Deploy says the database ID is invalid or not found | The `REPLACE_WITH_STAGING_DATABASE_ID` placeholder is still there, or the ID belongs to another account | Repeat B2–B3 with the ID from the same account |
| `migrations apply` asks about a database you don't recognize | Missing `--env staging` | Stop (Ctrl+C), re-run with `--env staging` |
| `/api/health` → 503 `not_configured` | No D1 binding in that environment | Expected on production before Part D; on staging, check B3 and redeploy |
| `/api/health` → 503 `error` | Database unreachable, or Free daily limits exceeded | Check the D1 Metrics page; limits reset 00:00 UTC |
| `/api/...` → 429 | Workers Free daily request limit reached | Wait for reset or consider Paid (needs your approval) |
| The planner page shows for `/api/...` | Old deployment without `run_worker_first` | Confirm the deployed version includes this PR |
| OAuth error "redirect_uri mismatch" (T0019) | Redirect URI differs from `<ORIGIN>/api/auth/callback/<provider>` | Copy the origin exactly, including `https://`, with no trailing slash |
| A secret was pasted somewhere public | — | Rotate it at the provider now, then run `wrangler secret put` again |

## Owner checklist

| Owner action | When | Expected confirmation | Sensitive? | Done? |
|---|---|---|---|---|
| Review the T0018 PR and docs | Now | Approve or request changes | No | ☐ |
| (Optional) Confirm the account, `gorgonbuilder` Worker and plan in the dashboard | Now, optional | Worker exists; plan is Free or Paid | No | ☐ |
| (Optional) After merge, open production `/api/health` | After merge, optional | 503 JSON `not_configured` (expected) | No | ☐ |
| (Optional) Staging: B1–B6 | Any time, optional | Staging `/api/health` → 200 `database: ok` | Login only | ☐ |
| Confirm providers (Discord + Google) and username policy | Before T0019 | Decision recorded on Issue #48 | No | ☐ |
| Create Discord + Google OAuth clients (staging) | **T0019 prerequisite** | Client IDs created; redirect URIs registered | **Secrets** | ☐ |
| `wrangler secret put` (staging) | **T0019 prerequisite** | `wrangler secret list --env staging` shows the names | **Secrets** | ☐ |
| Create staging D1 + apply migrations | **T0019 prerequisite** (if not done in Part B) | Health 200 on staging | No | ☐ |
| Production D1, backup, migrations | T0021 launch | Production health 200 | Data | ☐ |
| Production OAuth clients + secrets | T0021 launch | Login works on the production origin | **Secrets** | ☐ |
| Bind the existing custom domain | T0021 launch | HTTPS site on your domain | No | ☐ |
| Any plan upgrade or billing change | Only if needed | Your explicit approval | Billing | ☐ |

**Right now, T0018 needs nothing from you except PR review.** Every T0018 remote item is *Not executed — owner action required* and optional.
