# Cloudflare Workers Deployment — GorgonBuilder

**Status:** Active frontend deployment configuration  
**Worker:** `gorgonbuilder`  
**Production URL:** https://gorgonbuilder.zbailouz7.workers.dev  
**GitHub source:** `Zaelious/GorgonBuilder`, production branch `main`

## Architecture

GorgonBuilder v1 currently builds as a static Vite + React application. Cloudflare Workers Static Assets serves the `dist/` output directly, without a custom Worker entry point or the `@cloudflare/vite-plugin` adapter.

The checked-in `wrangler.jsonc` explicitly sets the Worker name, compatibility date, static assets directory, single-page-app fallback routing, and public Workers.dev/preview URL settings. This prevents non-interactive Cloudflare Builds from invoking Wrangler's auto-configuration step on every deployment.

`wrangler` is pinned as a development dependency in `package.json` and `package-lock.json`. `npm ci` must succeed without generating or changing the lockfile.

This deployment setup **does not choose a backend** for future persistence. T0018 will separately select and document the save/share backend provider.

## Cloudflare Dashboard Build Settings

Under **Workers & Pages → gorgonbuilder → Settings → Builds**:

- Git provider: GitHub
- Repository: `Zaelious/GorgonBuilder`
- Production branch: `main`
- Root directory: repository root
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- Preview command: `npx wrangler preview`
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
```

The dry-run command checks whether the built assets and Wrangler config can be bundled without deploying or needing account credentials. The `CI` GitHub Actions workflow runs these checks for pull requests and for pushes to `main`.

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

## Future Changes

If a later ticket introduces Worker-side application code or needs direct Cloudflare runtime bindings, reevaluate whether to adopt `@cloudflare/vite-plugin` in a dedicated reviewed change. Do not add it preemptively to this static-only frontend.
