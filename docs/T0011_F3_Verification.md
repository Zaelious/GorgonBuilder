# T0011-F3 — My Items Quick Equip/Unequip Without Closing Inventory

**Status:** Architect reviewed; product-owner tested and accepted; squash-merged 2026-11-02 via [PR #26](https://github.com/Zaelious/GorgonBuilder/pull/26) as [`ac16796`](https://github.com/Zaelious/GorgonBuilder/commit/ac16796ca93bf024464739f7929096ef55e26b19). GitHub [CI run #84](https://github.com/Zaelious/GorgonBuilder/actions/runs/41436624581) and Cloudflare checks passed.
**Branch:** `feature/t0011-f3-quick-inventory-equip`, based on latest main `5feb339` (includes accepted F2 / PR #25).

## Behavior and identity

General Equipment → My Items keeps the same mounted dialog across imported-item Equip, Replace and Unequip. Search, slot/actual-level/rarity/location filters, ten-result pagination and approximate scroll remain in place. Button state comes directly from the current build: Equip for an empty position, Replace for a different occupant, and a passive Equipped indicator plus Unequip for the exact selected instance. Equipped refers only to this GorgonBuilder build.

The explicit `general`/`slot` picker modes preserve one-shot selection and focus restoration for individual slots. Database selection retains its existing one-shot behavior. The general dialog still closes with X/Escape. Switching inventory/database sources retains the existing source-switch behavior; preserving filters across source switches is outside this ticket.

A pure shared identity helper requires Storage provenance, matching valid export timestamp, report version, character/server, source item path, consistent optional instance ID and structurally equal original source item (including original TypeID). JSON object key order is ignored. Working powers, candidates and Sparks do not participate, so F2 edits do not break identity. Unknown/missing evidence and changed/new reports do not establish identity. The current parser exposes no verified stable cross-report item ID; none is invented. Even identical source rows remain distinct through their source paths. The build editor also refuses adding the same recognized imported instance twice.

Unequip reuses the existing confirmed equipment-clear path. Cancel leaves everything untouched; confirm removes only the matching selection and its attached data. Replacement retains candidates and Spark settings under the existing policy. OffHand/OffHandShield share one position; legacy conflicts still block replacement and allow deliberate removal. Protected builds remain inspectable with disabled edit actions.

No BuildDocument schema, parser, official data, F2 mod semantics, dependencies or backend changes.

## Verification

Passed with Node 24.19.0:

```bash
npm ci
npm run data:update -- --check
npm run lint
npm run typecheck
npm test
npm run build
npx wrangler deploy --dry-run
git diff --check
python src/features/import/quick-equip.smoke.py --output /tmp/gorgonbuilder-quick-equip
python src/features/mods/imported-mods.smoke.py --output /tmp/gorgonbuilder-f3-imported-mods-regression
python src/features/import/import.smoke.py --output /tmp/gorgonbuilder-f3-import-regression
```

**679 tests across 30 files** (19 new focused cases). Coverage includes multi-slot actions in the same dialog, exact twins, source evidence mismatch/missing fields, F2 working-power edits, cancel/confirm, index shifts after removal, retained candidates/Sparks, offhand swaps, disabled protected-build actions, autosave/refresh/reimport, filter/page/scroll preservation and slot closing/focus. Existing equipment, mod, persistence and parser tests pass.

The first full-suite attempt under the restricted process sandbox hit EPERM on Node child processes and localhost binding. The full suite passed when rerun with the required process/network permissions; no test was skipped in the successful run.

Real Chromium passed dev and production preview at **1440×1000, 375×1000 and 320×1000**. Each case equipped Head, Chest, Legs and Ring without reopening (Equipped counts **1 → 2 → 3 → 4**) and asserted a marker on the same dialog node. It then canceled and confirmed removal, checked approximate scroll (under 80px movement), retained search/level/rarity/location/page 2, replaced one of two identical source instances, refreshed/reimported the same report, and used a slot picker with close/focus restoration. All six cases observed zero runtime errors, zero network writes, and no page/dialog horizontal overflow.

Existing F2 imported-mod and F1 import Chromium scripts also passed all six dev/production-preview desktop/mobile cases each (18 browser cases total). They verify editable powers, exact tiers, working edit/reload/restore, immutable original source, candidate/Spark retention, offhand swapping and local-only import. The F1 script now expects Replace for occupied slots and explicitly dismisses the persistent general dialog before editing the planner.

Synthetic evidence only:

- [Desktop Equipped / Unequip](screenshots/t0011-f3/equipped-desktop.png)
- [375px Equipped / Unequip](screenshots/t0011-f3/equipped-375.png)
- [320px Equipped / Unequip](screenshots/t0011-f3/equipped-320.png)
- [Individual picker closed after selection](screenshots/t0011-f3/slot-picker-closed.png)
- [Six-case browser assertions](screenshots/t0011-f3/results.json)

The smoke runner supports `--url BRANCH_PREVIEW_URL` for the same checks on Cloudflare. Deployment URL/status is reported in the PR/completion report after the branch build. A successful dry-run alone does not establish deployment success.

## Exact manual verification

1. Open the branch preview and select **Import Character**. Choose matching CharacterSheet and Storage reports locally, then **Use these reports**. Never publish customer exports or screenshots containing private data.
2. Open **Equipment → My Items**. Equip Head, Chest, Legs and Ring consecutively. After each action check the dialog stays open, the row shows **Equipped / Unequip**, and Equipment's selected count increases.
3. Find duplicate names/TypeIDs. Equip one, then replace it with the other; only the exact selected row should show Equipped. Cancel replacement once and confirm the prior item stays selected.
4. Click **Unequip**, cancel the confirmation, and verify all selections remain. Confirm the next attempt; verify only that selection clears, the row returns to Equip/Replace, other gear stays, and the dialog stays open. Repeat on an item carrying candidates/Sparks.
5. Search, set actual-level bounds, rarity and location, select page 2 and scroll to a row. Equip/unequip and verify every filter, page and approximate scroll remains. Repeat at 375px and 320px and with keyboard navigation.
6. Close My Items. From an individual Head/Ring row use **Choose gear** or **Replace**, choose **My Items**, select an item. Confirm the dialog closes and focus returns to the opener (or persistent slot summary if the opener disappears). Test X and Escape as well.
7. Change/remove an imported treasure power in Selected, reopen My Items and verify the item is still Equipped. Wait for autosave, refresh, import the same reports and verify selected state remains accurate. Restore Imported Mods and verify F2 behavior remains intact. Import a newer/changed report and verify no unsupported equipped match is claimed.
8. Replace an offhand weapon with a shield and back, confirming only one offhand remains and candidates/Sparks survive. Open a protected draft and verify search/inspection works while Equip/Replace/Unequip are disabled.

## Limitations and follow-ups

Full inventory remains page-local; selected gear persists, and inventory must be reimported after refresh. Reliable identity is deliberately limited to matching report/source evidence; a changed report may show Replace for the same real game item. The product owner tested the deployed inventory UI and accepted the quick-equip behavior. Exact source-to-v490 ID/tier mapping totals from private reports have not been independently documented; do not claim those totals were verified. No customer exports were committed. T0012 aggregation, CurrentStats, damage, Spark calculations and backend storage remain out of scope.
