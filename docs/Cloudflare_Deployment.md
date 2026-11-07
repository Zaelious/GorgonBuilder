# Cloudflare Workers Deployment — GorgonBuilder

**Status:** Active deployment configuration (T0018 foundation merged; T0019 account API under review)
**Worker:** `gorgonbuilder`  
**Production URL:** https://gorgonbuilder.zbailouz7.workers.dev  
**GitHub source:** `Zaelious/GorgonBuilder`, production branch `main`

## Architecture

GorgonBuilder builds as a static Vite + React application served by Cloudflare Workers Static Assets from `dist/`. Since T0018 the same Worker also has a small entry point, `worker/index.ts`, for the same-origin API. `assets.run_worker_first: ["/api", "/api/*"]` invokes Worker code only for API paths. Every other request stays asset-first with the single-page-app fallback, so planner pages remain free static-asset requests. The `@cloudflare/vite-plugin` adapter is still not used.

The checked-in `wrangler.jsonc` explicitly sets the Worker name, entry point, compatibility date, static assets directory/binding, SPA fallback, API routing, public Workers.dev/preview URL settings and isolated environments:

- **top level = production** (`gorgonbuilder`, `APP_ENV=production`, **no D1 binding yet**: `/api/health` returns 503 `not_configured` until a production database is approved at launch);
- **`env.local`**: local development and tests only, with a local placeholder D1 database; never deployed;
- **`env.staging`**: `gorgonbuilder-staging` with existing owner-created D1 `477e9b46-bb96-4eca-a5ed-1ee57185fb2a`; no remote setup executed.

Explicit configuration also prevents non-interactive Cloudflare Builds from running Wrangler's auto-configuration step. `wrangler` is pinned as a development dependency, and `npm ci` must succeed without changing the lockfile.

The backend provider is Cloudflare Workers + D1 (product-owner decision 2026-11-06). See the [T0018 ADR](T0018_Backend_Architecture_ADR.md), [T0018 verification](T0018_Verification.md) and the [owner setup guide](T0018_Owner_Setup.md) for staging, OAuth, production database and custom-domain steps.

## Cloudflare Dashboard Build Settings

Under **Workers & Pages → gorgonbuilder → Settings → Builds**:

- Git provider: GitHub
- Repository: `Zaelious/GorgonBuilder`
- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`
- Optional: `npx wrangler deploy --env=""` silences Wrangler's harmless "multiple environments" warning (the top level is production)
- Preview Builds: enable in **Settings → Build → Branch control** to test feature branches before merging (dashboard state needs confirmation)

The dashboard manages Cloudflare credentials; do **not** commit tokens or secrets to GitHub.

## Local/CI Verification

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
npx wrangler deploy --env staging --dry-run --outdir .wrangler/dry-run-staging
npm run worker:smoke   # local Worker + local D1 + auth probe; no Cloudflare login
```

The dry-run commands check whether the built assets, Worker and Wrangler config can be bundled without deploying or needing account credentials. `npm run worker:smoke` runs only `--local` D1 commands against a temporary directory. The `CI` GitHub Actions workflow runs these checks for pull requests and for pushes to `main`.

## Publishing and Previews

- Pushes/merges to `main` should trigger a production deployment in Cloudflare.
- Feature-branch pushes should produce isolated Preview builds when the Cloudflare Preview Builds setting is enabled.
- Preview URLs may be publicly accessible. Do not put account secrets, private report files, or sensitive test data in the app or public preview deployments.
- Check Cloudflare's Deployments/Builds view for the actual deployment status and preview URL. Successful GitHub CI checks alone do not prove the live Cloudflare deployment completed.

## Troubleshooting Failed Git-connected Builds

As of 2026-10-31, Cloudflare Workers Builds failed on PRs #2, #3 and #4 while their GitHub Actions checks passed. The actual Cloudflare error remains unknown without its build logs. A successful GitHub Actions build or Wrangler dry-run does not prove a live deployment succeeded.

1. Open **Workers & Pages → gorgonbuilder → Deployments → View build history**, select the PR #4 build (`66cf1b10-8e5b-4439-8889-86a3f3175ee2`) and identify the first error and stage (checkout, install, build or preview/deploy).
2. Under **Settings → Build**, check connected repository, root directory, build/deploy/preview commands, credentials and environment variables against the settings above. Verify `wrangler.jsonc` Worker `name` matches the dashboard project name.
3. Under **Settings → Build → Branch control**, check Preview Builds and the intended production branch; investigate preview-specific secrets/bindings if relevant.
4. Fix the demonstrated failure, use **Retry build**, then check the Cloudflare result and preview URL or production deployment independently of GitHub Actions.

Official references: https://developers.cloudflare.com/workers/ci-cd/builds/troubleshoot/ and https://developers.cloudflare.com/workers/ci-cd/builds/configuration/ .

## T0019 manual staging path and preview isolation

Use [website-only T0019 owner setup](T0019_Owner_Setup.md). The new `staging.yml` workflow is dispatch-only on `main`, uses GitHub's protected `staging` environment twice (preflight/recovery review, then migration/deploy approval), and cannot be dispatched through GitHub's website until merged to the default branch. CI remains credential-free and local-only.

Wrangler 4.156.0 `previews` is separate from environment/version URLs: the checked-in Preview config declares `APP_ENV=preview` and no D1. [Cloudflare documents separate Preview configuration/Base secrets](https://developers.cloudflare.com/workers/previews/configuration/); [a D1 binding shares data by database_id](https://developers.cloudflare.com/workers/previews/resources/). Never bind staging or production to previews. Base secrets are copied to new previews; active previews retain existing copies. Audit those Dashboard settings before creating real credentials. Version URLs can run a version's existing bindings; runtime canonical-origin checks reject such hosts before health/auth/account DB access. This does not prove remote settings were inspected or protect against an attacker editing code with a powerful deployment token. Keep backend deployment credentials unavailable to untrusted PR builds.

## Future Changes

The T0019 review branch adds authentication (`nodejs_compat`, Better Auth at `/api/auth/*`, Wrangler secrets) and real build APIs. Production D1 and the custom domain are T0021 launch steps that need explicit owner approval. Evaluate `@cloudflare/vite-plugin` only if a later ticket needs `/api` during `npm run dev`.
