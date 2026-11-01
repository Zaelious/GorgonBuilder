# KI-0008 — Vite gzip transport verification

Verified on 2026-11-01 against GitHub `main` at `0141d674ab89f5366875b2e9e046bdff615698d0`, using Node 24.19.0, Vite 8.3.5 and Chromium with Python Playwright. Branch: `fix/ki-0008-vite-gzip`. Review and merge remain required before T0009.

## Root cause and fix

Vite 8.3.5's bundled Sirv static middleware infers `Content-Encoding: gzip` from a `.gz` suffix even without precompressed-content negotiation. In dev it infers JSON content type from `.json.gz`; preview's hashed `.json-<hash>.gz` name produces an empty content type. Browser fetch transparently decompresses the response, so the unchanged loader correctly rejects the decoded byte length before hashing.

A local Vite plugin registers middleware **before** the built-in static middleware in both `configureServer` and `configurePreviewServer`. It maps the three source paths in dev and discovers their emitted hashed filenames in preview. Only GET/HEAD requests to those mapped paths receive original file bytes as `application/gzip` without HTTP content encoding. Vite's import/raw/URL module transformations and other assets continue through normal middleware. Cache busting queries work; responses use `Cache-Control: no-cache`. Preview discovery follows the repository's existing default Vite asset naming.

The loader, compressed length/SHA-256 verification, explicit `DecompressionStream('gzip')`, JSON length checks, schema checks, raw data, generated files, manifest, BuildDocument and accepted UI are unchanged. `npm run preview` is added as an alias for `vite preview`; dependencies and lockfile are unchanged.

## Before/after browser evidence

Before editing, ran `npm run dev -- --host 127.0.0.1 --port 5173 --strictPort`, `npm run build`, and `npx vite preview --host 127.0.0.1 --port 4173 --strictPort` (there was no npm preview script yet). Chromium showed “Game data could not be loaded” in **both** modes.

Actual response metadata below applies separately to every listed artifact in each mode. `Content-Length` was the compressed size both before and after; the browser's `arrayBuffer()` was decoded before the fix.

| Header | Dev before | Preview before | Dev and preview after |
| --- | --- | --- | --- |
| Status | 200 | 200 | 200 |
| Content-Type | `application/json` | empty string | `application/gzip` |
| Content-Encoding | `gzip` | `gzip` | absent |
| Content-Length | manifest compressed size | manifest compressed size | manifest compressed size |
| Cache-Control | `no-cache` | `no-cache` | `no-cache` |
| Vary | `Origin` | `Origin` | `Origin` |

| Artifact | Dev URL | Preview URL |
| --- | --- | --- |
| progression | `/src/generated/game-data/progression.json.gz` | `/assets/progression.json-BY5ErUaF.gz` |
| abilities | `/src/generated/game-data/abilities.json.gz` | `/assets/abilities.json-DntOx9Di.gz` |
| itemsTreasure | `/src/generated/game-data/itemsTreasure.json.gz` | `/assets/itemsTreasure.json-Bl5FT8bc.gz` |

| Artifact | Manifest compressed bytes | Dev received before → after | Preview received before → after | Manifest decoded JSON bytes |
| --- | ---: | ---: | ---: | ---: |
| progression | 912,081 | 24,512,764 → 912,081 | 24,512,764 → 912,081 | 24,512,764 |
| abilities | 566,143 | 16,214,378 → 566,143 | 16,214,378 → 566,143 | 16,214,378 |
| itemsTreasure | 1,821,249 | 31,607,382 → 1,821,249 | 31,607,382 → 1,821,249 | 31,607,382 |

Expected compressed SHA-256 values, matched by browser-received bytes in **both** modes after the fix:

```text
progression   3e9c01e629d18bac727a8e82138011951def5f067454e4f121036147d41bb915
abilities     0606099fad944d22c9330bf9c310e78e2feaeda9db02a208d808b63a4e9e41c7
itemsTreasure d500d0046394d3d8f630b86c5add880b1913d34f36ca272681844f256237c484
```

Browser-received SHA-256 values **before** the fix, identical across modes and different from the manifest:

```text
progression   10708c2113e091299dc695991713614fbad69917fc724fc6051a6a5afd1de886
abilities     5bbbb5540815963f2b15ce4dff3ec3ec10d31916410498658113fb99749da210
itemsTreasure 984d4867ceb272a1144e078934c3409d1cecf25c433039c268cc054a76ad1cd9
```

## Regression coverage and results

- `scripts/vite-transport.test.ts`: seven tests start real Vite dev and preview servers, build into a temporary directory, fetch all three artifacts, verify exact compressed size/hash, decode with the unchanged loader, construct the indexed repository and resolve representative skill/ability/item IDs. Same-size corruption of each fetched artifact must throw **SHA-256 mismatch** in both modes. HEAD, cache queries, Vite URL imports, HTML, JavaScript, CSS, plain static files and an unrelated gzip asset are covered. The unrelated gzip still uses Vite's normal HTTP gzip handling. These tests run with `npm test` in existing GitHub CI.
- `src/test/vite-transport.smoke.py`: starts actual npm dev and preview commands and uses real Chromium fetch to record headers/size/hash. Exercises Psychology/Deer, Cow/Unarmed, same-skill independent bars, A-only selection, levels, ability add/remove and autosave/reload. All passed with no page or console errors. Intercepts each artifact separately, flips one byte without changing length or disk data, verifies the planner rejects it, then removes interception and verifies Retry recovers. All six corruption/retry cases passed.
- Production comparison: all **10** output files, including HTML/JS/CSS and all generated data, had byte-identical SHA-256 to the pre-change main build. `wrangler.jsonc` and `.github/workflows/ci.yml` are unchanged.
- `npm run data:update -- --check`: passed; all 13 pinned official v490 datasets validated.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: **352 tests across 12 files passed** (345 existing + seven transport tests).
- `npm run build`: passed.
- `XDG_CONFIG_HOME=/tmp/ki0008-wrangler-config npx wrangler deploy --dry-run --outdir .wrangler/dry-run`: passed; static-asset bundle validated, no upload.
- `git diff --check`: passed.

## Repeating the browser check and environment notes

Build first, install Python Playwright if it is not already available, and provide an installed Chromium or Playwright Chromium browser:

```bash
npm run build
python src/test/vite-transport.smoke.py --output /tmp/gorgonbuilder-vite-transport
```

The smoke script uses ports 5174 and 4174, records `results.json`, server logs and screenshots, and shuts its servers down. It preserves HTTPS verification for official CDN icons and honors the inherited HTTPS proxy. This managed environment required trusting its injected CA in a temporary Chromium NSS store:

```bash
mkdir -p /tmp/ki0008-chromium-home/.pki/nssdb
certutil -N --empty-password -d sql:/tmp/ki0008-chromium-home/.pki/nssdb
certutil -A -d sql:/tmp/ki0008-chromium-home/.pki/nssdb \
  -n environment-proxy-ca -t 'C,,' \
  -i /usr/local/share/ca-certificates/environment-proxy-ca.crt
CHROMIUM_TRUST_HOME=/tmp/ki0008-chromium-home python src/test/vite-transport.smoke.py
```

The default Wrangler config directory was unwritable in the sandbox, so only its local config/log location was redirected to `/tmp` for the successful dry-run. The browser smoke remains optional tooling like the existing planner-layout smoke; it does not add npm dependencies or require Python in GitHub CI. Live Cloudflare runtime deployment was not tested or requested; production output identity, unchanged configuration and deployment dry-run establish the local deployment checks. A pre-existing housekeeping follow-up was observed: the dry-run creates `.wrangler/dry-run/no-op-worker.js`, which current ESLint includes. Removing that generated dry-run directory restores lint; no lint configuration change is included in this transport fix. KI-0006 and KI-0009 remain unchanged. Update repository-current-state/close KI-0008 after review and merge; T0009 has not begun.
