# T0002 — Official Game Data Snapshot Pipeline verification

Date: 2026-10-31. Branch: `feature/t0002-game-data-snapshot`. Existing draft: [PR #3](https://github.com/Zaelious/GorgonBuilder/pull/3). Continued from `7587e8f`; no merge or T0003 work.

## Result and scope

Official CDN acquisition succeeded. The discovered version is **v490**, fetched at **2026-10-31T19:23:59.293Z**. All 13 publication targets are available; all 9 required datasets passed source-shape validation. Original bytes, index, cache manifest and pin manifest are committed for offline use. No normalization, UI, gameplay interpretation, or dependency changes.

The live run revealed 148 advancement tables with `Keywords` string-array metadata alongside level maps. Validation now accepts that explicit shape while rejecting malformed metadata and level values. The reduced fixture uses official `2401_ForetoldUniversalDirect` fields; focused regression coverage was added.

## Snapshot inventory

Top-level records are source records, not normalized gameplay counts.

| Dataset | Records | Original bytes |
| --- | ---: | ---: |
| skills | 188 | 318,305 |
| advancementtables | 588 | 3,623,690 |
| abilities | 5,972 | 8,937,333 |
| abilitykeywords | 26 | 5,666 |
| abilitydynamicdots | 2 | 701 |
| abilitydynamicspecialvalues | 4 | 1,045 |
| items | 11,209 | 7,167,090 |
| tsysclientinfo | 1,947 | 10,480,301 |
| tsysprofiles | 40 | 237,804 |
| attributes | 2,189 | 383,466 |
| effects | 23,282 | 6,594,856 |
| sources_items | 10,068 | 1,015,087 |
| sources_abilities | 4,063 | 396,864 |

Dataset bytes total **39,162,208**. Exact per-file SHA-256 hashes, URLs, required flags, availability, original byte counts and record counts are in [snapshot.json](../src/data/raw/snapshot.json). The original official index is preserved with its hash and size as well. Fetch time is local acquisition time, not an upstream publication timestamp.

## Commands and results

- `curl` through the inherited HTTPS proxy: official CDN root HTTP 200; discovered v490 from official links/refresh.
- `npm run data:update`: acquired all 13 datasets successfully after the advancement validation correction.
- Repeat `npm run data:update`: validated/reused the pin with no download.
- `npm run data:update -- --check`: passed with network access unavailable inside the command sandbox.
- Independent Python SHA-256/size/nanosecond-mtime comparison of the pin and all 15 cache files: unchanged after reuse and offline check.
- Fresh temporary raw directory seeded only with the pin: downloaded all official files again, verified against pinned hashes, preserved manifest bytes/fetch timestamp, then passed check with a download function that throws if called. Temporary files removed afterward.
- `npm run lint`: passed.
- `npm run typecheck`: passed for app and scripts.
- `npm test`: passed, 69 tests across 2 files, including malformed manifests/shapes, missing required data, corruption, pinned rehydration, deterministic timestamps, concurrency and transport failures.
- `npm run build`: passed; frontend bundle contains no raw snapshot imports.

## Manual inspection and reproduction

Inspected raw Psychology, Cow, Unarmed and Deer skills and their advancement table identifiers (`Balanced`, `PlayerCow`, `Balanced`, `PlayerDeer`), plus `1001_Skeleton` and keyword-bearing advancement tables. Inspected `ability_10001` (AnimalBite), `item_1` (Empty Bottle), `power_10001` (ArcheryBoost with per-tier objects), treasure profile `All`, item source entries, both dynamic DoT records and all four dynamic special-value records. Original identifiers and unknown fields remain preserved; no inferred mechanics or cross-reference completeness claim.

From a checkout of this branch, run `npm run data:update -- --check`, inspect the manifest and the raw files under `src/data/raw/cache/v490/`, repeat `npm run data:update`, and run lint/typecheck/test/build. Corrupt/missing cache and required-file failure paths are covered by automated tests in temporary directories.

## Network and review limitations

Current runtime observations are current; restricted HTTP policy is enforced with custom host `cdn.projectgorgon.com` plus package-manager presets (including GitHub Git hosts). No VPN is configured. Network commands require execution outside the command sandbox, retaining proxy and CA settings. This successfully reaches the CDN and Git remote.

GitHub API host `api.github.com` is absent from the effective allowlist. `gh pr view 3 --json ...` returns `Post "https://api.github.com/graphql": Forbidden`; a direct API probe fails at CONNECT with HTTP 403 Forbidden from envoy. Thus PR metadata editing is blocked; pushing this branch updates the implementation in existing PR #3. No network configuration was changed or published.

Architect review remains required. Raw publisher data may include unknown or unused records; this ticket validates source shapes and provenance only. No separate general dynamic-values file is listed; the published keywords/DoTs/special values are retained. Hashes are local integrity checks, not publisher signatures. Future version caches remain ignored unless deliberately staged. Attribute Elder Game when later tickets display official text.

## Files and follow-ups

Changed adapter, reduced fixture, regression tests, raw README, raw pin and 15 version-cache files, this report and `Repo_Current_State.md`. The original pipeline remains in place.

No new implementation ticket discovered. T0003 remains unstarted. After merge, update repository status/next-ticket documentation. PR description can use this report once GitHub API access is available; do not merge as part of this run.
