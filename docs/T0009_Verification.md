# T0009 — Equipment Search and Planner verification

Status: implementation proposed; awaiting architectural review and customer hands-on acceptance. Ticket status has not been changed. T0010 has not been started.

## Base and prerequisites

Feature branch: `feature/t0009-equipment-planner`, based on latest fetched `main` at `b06e049d348e936c1e9a2e5619104435d7921df4`.

Confirmed merged prerequisites in the actual main history and repository state:

- T0006: `4d29f7a` — runtime repository and generated data.
- T0007: `fa6eb43` — schema v1, preferences and autosave.
- T0008: `dd268de` — accepted skill/ability editor.
- KI-0008: `b9b75f2`, PR #16 — original gzip transport in Vite dev/preview.

Read AGENTS.md, T0009 and its preflight, repository state, full/MVP designs, manual guide, data normalization design, save/share design and known issues before implementation. Reviewed the actual editor, runtime item repository/contracts, BuildDocument, preferences, storage and autosave implementations.

## Result and changed files

The compact Equipment section sits below the existing skill/ability planner. Its slot selector uses all 19 exact official slot strings. A native modal picker searches official names, descriptions, fixed-effect text, keywords and IDs. Search uses NFKC, case/whitespace/underscore normalization and one explicit symmetric lightning/electricity synonym group; no fuzzy search or dependency was added. Results show target level, separate published skill requirements and fixed effects, prioritizing matching effects. Descriptions, remaining effects, exact published tokens and official provenance/acquisition data are available on demand. Ten results render per page.

Minimum target level defaults to 90 via the existing schema-v1 preference; an empty input saves null and disables the threshold. The default-on Include unknown target level toggle remains transient. Unknown target levels remain null and are labeled explicitly. Threshold, slot and search changes never unequip saved selections. CraftingTargetLevel is never represented as a confirmed equip requirement.

Equip/replace/clear use immutable BuildEdit operations and existing 500 ms autosave/retry. New items store actual official IDs. Replacement preserves associated candidate mods and Spark settings. Unrelated selections, both skill bars, metadata and targets survive edits. Existing manual/imported instances and duplicate/legacy slots are retained. Discarding an instance on explicit replacement, or clearing a selection with associated data, requires confirmation. No instance import/mod/Spark editor was added.

| Files | Purpose |
| --- | --- |
| `src/data/search/equipment.ts` | Pure normalization, search and composed level/slot/text predicates |
| `src/data/search/equipment.test.ts` | 28 search, synonym, slot, level and pinned-count regressions |
| `src/features/equipment/EquipmentPlanner.tsx` | Compact overview, official slot selection, inspection and edit controls |
| `src/features/equipment/EquipmentPicker.tsx` | Modal search, preference controls, pagination and keyboard/focus behavior |
| `src/features/equipment/ItemFacts.tsx` | Published target level, skill requirements, fixed effects and source details |
| `src/features/equipment/equipment.css` | Equipment-only responsive styles |
| `src/features/equipment/equipment-editor.test.ts` | Four immutable-edit/autosave/preservation regressions |
| `src/features/equipment/EquipmentPlanner.test.tsx` | 15 editor/UI persistence, protection, recovery and interaction regressions |
| `src/features/equipment/equipment.smoke.py` | Repeatable real-browser dev/preview smoke and measurements |
| `src/app/App.tsx` | Editor integration, existing preference restore/update API and visible failures/retry |
| `src/app/editor/build-editor.ts` | Equip/replace/clear edits, exact-slot/ID validation and preservation |
| `src/persistence/local/preferences.ts` | Clarify existing field documentation; schema stays v1 |
| `docs/T0009_Verification.md` | Review evidence and customer acceptance checklist |

Pinned raw data, generated artifacts, normalizers, integrity code, loader and KI-0008 transport configuration remain unchanged.

## Commands and automated results

Node 24.19.0, npm 11.9.0. Passed:

```bash
npm ci --cache /tmp/gorgon-npm-cache
npm run data:update -- --check
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
XDG_CONFIG_HOME=/tmp/t0009-wrangler-config npx wrangler deploy --dry-run --outdir /tmp/t0009-wrangler-dry-run
CHROMIUM_TRUST_HOME=/tmp/t0009-chromium-home python src/features/equipment/equipment.smoke.py --output /workspace/artifacts/t0009/browser
CHROMIUM_TRUST_HOME=/tmp/t0009-chromium-home python src/test/vite-transport.smoke.py --output /workspace/artifacts/t0009/transport
```

Final automated suite: **399 tests across 15 files**, including **47 new focused T0009 tests** and the existing seven transport integration tests. Production build and Wrangler static-assets dry-run passed; no deployment was performed. Pinned v490 counts are checked: 3,078 equipment definitions, 518 known target levels at 90+, 500 unknown; including unknowns at 90+ yields 1,018. Synthetic boundary tests cover 89, 90, 91 and null; disabled minimum includes all levels regardless of the unknown toggle.

Environment notes: the first plain `npm ci` attempt could not create the default `/home/agent/.npm` cache; using a writable `/tmp` cache succeeded without lockfile changes. The sandbox initially blocked local listening ports for transport tests; enabling executor network access allowed the unchanged tests and both browser servers to pass. Chromium trusts the injected environment CA in a temporary NSS store, following KI-0008's documented setup; TLS validation remains enabled. Wrangler's writable config/output paths are under `/tmp`.

## Actual browser evidence

Python Playwright and installed Chromium exercised actual `npm run dev` (port 5175) and built `npm run preview` (4175), at 1440×900 and 375×812. Both passed:

- All 19 exact slots; compact empty overview (140.4 CSS px tall on desktop).
- Default 90, unknown on/off, null minimum, and persisted 90/999 thresholds after reload.
- Representative searches, empty results, separate SkillReqs, source/description and exact-effect disclosure.
- MainHand equip and replacement, additional OffHandShield equip, clear and reload.
- Both original ability bars and all unrelated document fields preserved.
- Filters retaining equipped items; ten-result pagination; native modal keyboard focus containment; Escape closing from a nonempty search and returning focus.
- Desktop/mobile screenshots, no horizontal page overflow, no unexpected console or page errors.

The browser smoke found that native search inputs could consume the first Escape to clear text. The picker now handles Escape explicitly; the corrected workflow and focused regression both pass.

The separate existing KI-0008 smoke passed dev/preview gzip lengths/SHA-256, three same-size corrupt responses rejected per mode, Retry recovery, and Psychology/Deer, Cow/Unarmed, same-skill and one-skill planner flows. Received bytes in both modes:

| Asset | Compressed bytes | SHA-256 |
| --- | ---: | --- |
| progression | 912,081 | `3e9c01e629d18bac727a8e82138011951def5f067454e4f121036147d41bb915` |
| abilities | 566,143 | `0606099fad944d22c9330bf9c310e78e2feaeda9db02a208d808b63a4e9e41c7` |
| itemsTreasure | 1,821,249 | `d500d0046394d3d8f630b86c5add880b1913d34f36ca272681844f256237c484` |

Every response used `Content-Type: application/gzip` with no Content-Encoding. Browser records match the unchanged manifest.

Local review artifacts (outside Git): `/workspace/artifacts/t0009/browser/results.json`, eight equipment screenshots named `{dev,preview}-{picker,overview}-{desktop,mobile}.png`, `/workspace/artifacts/t0009/transport/results.json` and its planner screenshots, plus `/workspace/artifacts/t0009/search-performance.json`. The final response links the screenshots directly for the desktop app.

Pure-search measurement used the loaded runtime repository, seven queries, five warmups and 30 measured samples per query across all slots, MainHand and Feet. At default 90 with unknowns included, MainHand/Feet medians were approximately 0.27–0.71 ms; all-slot medians 3.02–5.67 ms and measured p95 at most 10.34 ms. No cache/index was justified. Browser round-trip measurements include Playwright overhead and are recorded separately; these are unthrottled local observations, not a mobile-device performance guarantee.

Final browser run used Chromium 154.0.8037.57. CDP measurements below are target-specific JS heap bytes; explicit garbage collection distinguishes retained data from transient allocations. They are not directly comparable to earlier coarse `performance.memory` readings in KI-0009.

| Mode | Initial load | Search round-trip range | Heap after initial GC | Heap after workflow GC |
| --- | ---: | ---: | ---: | ---: |
| Vite dev | 1,172 ms | 13.0–46.5 ms | 78,031,892 | 79,758,244 |
| Production preview | 891 ms | 13.3–30.7 ms | 74,279,004 | 74,845,012 |

## Customer hands-on checklist

1. Open Equipment → Feet → Browse items. Confirm Minimum target level is 90 and Include unknown target level is checked.
2. Search lightning/electricity, taunt, kick and combat refresh; try psychic in a suitable slot such as MainHand. Verify visible effects support the results.
3. In Feet search `item_40002` (Basic Boots): unknown target level is visible with unknowns on, hidden with unknowns off at 90. Clear the minimum; it reappears even with unknowns off.
4. Try minimum 80 and no minimum; close/reload/reopen to confirm the minimum persists. Searches and the unknown toggle are transient.
5. In MainHand search `item_45640`: inspect target level 90, separate Knife Fighting 60 requirement, description and official source. Verify target-level wording makes no equip-requirement claim.
6. Equip MainHand and OffHandShield `item_45052`; replace one, change filters so it no longer matches, reload, then clear one and reload again. Confirm both skill bars, title and notes remain intact.
7. Use keyboard only: open Browse items, search, Tab/Shift+Tab within the dialog, page through results, press Escape and check focus returns. Repeat common actions on a narrow viewport.
8. Review error/read-only regressions and automated evidence, then give architectural review and customer acceptance before any merge or ticket-status update.

## Risks, assumptions and follow-ups

- Fixed effects remain published, uninterpreted data. Token labels only replace underscores/case for readability; exact original tokens are available in source details. No units, percentages, legality or calculated mechanics are inferred.
- Existing mod/Spark settings deliberately survive replacement; their applicability to the new base item is future T0010/later validation. This ticket only preserves them.
- A legacy document can retain multiple selections for the same slot. Explicit row actions address one entry by index; no canonical slot mapping or silent reconciliation is introduced.
- The full repository's pre-existing memory/load cost (KI-0009) remains relevant; browser records include target-specific heap measurements before/after the workflow and explicit garbage collection. No data partitioning or architecture change was attempted.
- Browser evidence covers Chromium on this environment, not low-end mobile hardware, other browser engines or live Cloudflare deployment. Cloudflare deployment was not requested; the dry-run passed.
- T0010 treasure-mod editing, Spark editing/simulation, calculations, character/storage imports and remote save/share remain out of scope. No new unrelated issue was implemented.

After architectural review, customer acceptance and merge, documentation owners should update Tickets, Repo_Current_State, Manual_Verification_Guide, MVP_Technical_Design, Build_Save_And_Share_Design and Data_Source_And_Normalization to describe the implemented equipment workflow and explicit synonym mapping; update KI-0007's pending status and retain KI-0009 monitoring. This verification record does not mark T0009 complete.
