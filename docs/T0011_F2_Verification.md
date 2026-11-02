# T0011-F2 — Editable Imported Treasure Mods and Unified Skill Styling

**Status:** Product-owner accepted, architect code-reviewed, squash-merged into `main` 2026-11-02 via [PR #25](https://github.com/Zaelious/GorgonBuilder/pull/25) as [`8932f0a`](https://github.com/Zaelious/GorgonBuilder/commit/8932f0a58a7b31f8bbf4946dc0e76c5e52d3b143). Implementation branch: `feature/t0011-f2-editable-imported-mods`, based on main at `f3af20c`.

## Working item behavior

- Selected combines all resolvable working imported pairs and planned candidates.
  The synthetic Cow/Unarmed item starts at **Selected (6)**; adding a different
  Cow power produces **Selected (7)**.
- Imported powers support removal and exact official, power-owned tier changes.
  Both Selected and STATS read the edited working pairs, including after autosave
  and refresh. Neither panel reconstructs effective powers from original evidence.
- **Restore Imported Mods** restores the original known pairs in source order,
  preserving duplicate occurrences, independent candidates, Sparks, skills, bars
  and other gear. If a planned power overlaps the restored baseline, confirmation
  explains that both copies will be kept; cancel leaves the working item intact.
- **Original imported item** is explicitly historical. Original powers, unknown
  source tiers, imbues and crafting metadata remain available there. The original
  Storage session and `metadata.sourceItem` are never changed by working edits.
- Both panels share the same skill grouping: A, B, Generic, Endurance, Shamanic,
  other skills, Unknown. Saved arrays retain their own order and edit indices.
  Skill A uses filled blue and Skill B filled amber across both origins. Small
  Imported/Planned labels and tooltips convey provenance. Unknown association
  styling remains a status indicator for either origin.
- Available excludes effective existing and planned IDs. Removing the last
  working occurrence makes its power available again. Imported duplicates are
  retained individually. Skill changes preserve imports and retain the existing
  deliberate candidate-pruning behavior.

Schema version remains **1**. Legacy instances without report evidence preserve
their first-edit working baseline in `metadata.originalWorkingPowers`; this does
not fabricate original export evidence. Unresolved legacy working pairs remain
read-only in STATS and survive restore, after the restored known sequence.
Future T0012 aggregation must read only working `existingPowers` plus
`candidateMods`, never the historical source or baseline as extra contributions.

## Commands and results

Verified on Node **24.19.0**:

```bash
npm ci --cache /tmp/gorgonbuilder-npm-cache
npm run data:update -- --check
npm run lint
npm run typecheck
npm test
npm run build
XDG_CONFIG_HOME=/tmp/gorgonbuilder-wrangler-config \
  WRANGLER_LOG_PATH=/tmp/gorgonbuilder-wrangler.log \
  WRANGLER_SEND_METRICS=false \
  npx wrangler deploy --dry-run --outdir /tmp/gorgonbuilder-cloudflare-dry-run
git diff --check
```

All passed. **660 tests across 30 files**, including the 640 baseline tests and
20 focused F2 model/UI regressions. Production build and Cloudflare dry-run
passed. Official v490 artifacts, parser semantics, dependencies and lockfile are
unchanged. No generated dry-run output is placed in the source tree.

Focused coverage includes immediate Selected counts; shared chip tones and
grouping; slot swaps and an empty Skill A; exact tier ownership; immutable source
evidence; remove/add/restore and explicit overlap handling; legitimate source
duplicates; local save/restore and UI remount; candidate/Spark/bar/other-gear
preservation; protected drafts; and retained unknown legacy working pairs.
Existing database candidate, import and offhand tests also pass.

## Chromium verification and screenshots

Build first, then run with Python Playwright and Chromium installed:

```bash
python src/features/mods/imported-mods.smoke.py
python src/features/mods/mods.smoke.py --output /tmp/gorgonbuilder-f2-mods-regression
```

In this managed environment, Chromium uses a temporary NSS store containing the
provided environment proxy CA, selected with
`CHROMIUM_TRUST_HOME=/tmp/gorgonbuilder-chromium-trust`. TLS verification remains
enabled. This avoids mistaking an executor certificate failure for a missing
official icon; no application trust setting or network policy is changed.

The F2 script exercises the real file-input import and My Items equip path,
then working edits, autosave/reload, historical evidence, restore, Spark retention
and slot swaps. All **six** dev/production-preview combinations passed at
**1440×1000**, **375×1000** and **320×1000**, including dark/light browser color
preferences. The product's existing dark theme remains unchanged. Computed Cow
and Unarmed backgrounds are respectively `rgb(26, 95, 192)` and
`rgb(242, 194, 48)` with matching filled, solid-bordered imported/planned chips.
STATS and Selected have identical effective power order. Every case observed
zero network writes, zero runtime errors and no horizontal page/editor overflow.
The narrow Stats legend wraps whole labels instead of splitting words.

The existing mod-editor smoke script also passed in both dev and production
preview after updating its expectations for unified imported selection. It
verified database-item controls, reorder/focus, target previews, skill pruning
and Undo, Druid/Archery grouping, relevant-mod popovers, mobile layout, protected
drafts and successfully loaded official icons. Its intentional missing-icon 404
checks passed separately; no unexpected console or runtime errors remained.

Screenshots use **synthetic data only**:

- [Full desktop working item](screenshots/t0011-f2/working-item-desktop.png)
- [Desktop Selected: imported and added Cow, imported Unarmed](screenshots/t0011-f2/selected-desktop.png)
- [Desktop STATS](screenshots/t0011-f2/stats-desktop.png)
- [375px Selected](screenshots/t0011-f2/selected-375.png)
- [375px STATS](screenshots/t0011-f2/stats-375.png)
- [320px Selected](screenshots/t0011-f2/selected-320.png)
- [320px STATS](screenshots/t0011-f2/stats-320.png)

The Selected list scrolls vertically on narrow screens. The desktop screenshot
shows all seven rows, with the added Cow power grouped alongside imported Cow
powers and followed by the three Unarmed powers.

The same F2 script accepts `--url BRANCH_PREVIEW_URL` for deployed verification.
The PR's deployment comment and completion report contain the actual Cloudflare
URL and remote verification status; no preview URL is inferred in this document.

## Exact manual verification

1. Open the branch preview. Choose **Cow** in Skill A and **Unarmed** in Skill B.
   Click **Import Character**. For a reproducible synthetic check, select
   `src/core/import/fixtures/character-sheet.json` and
   `src/features/mods/fixtures/imported-cow-unarmed.json`. Click **Use these reports**.
2. Click **My Items** beside Equipment and **Equip** the Fixture Cow and Unarmed
   Blade. Expand MainHand. Confirm **Selected (6)**: three Cow and three Unarmed
   powers. Cow is filled blue; Unarmed is filled amber in both Selected and STATS.
3. Search Available for `power_20204`, then click its effect to add it. Confirm
   **Selected (7)** with **Planned** beside the added Cow power. Search
   `power_20006`; it is unavailable while already present in the working item.
4. Open **Details and tier for imported mod 1** (the Cow Front Kick row), change
   its tier, and verify the STATS effect changes. Remove an imported Unarmed row.
   Confirm its effect disappears from STATS and Selected and its power becomes
   available again. Other equipment, planned candidates and configured Sparks
   must stay intact.
5. Expand **Original imported item**. Confirm the original exact tiers are still
   present, as are **FixtureUnknownPower** with its unresolved tier evidence and
   the separate imbue. The explanation identifies this view as historical.
6. Wait for **Saved in this browser**, then refresh and expand MainHand. Confirm
   the changed tier and removal persist, with no original power resurrected in
   STATS/Selected. The original evidence remains available without reimporting.
7. Click **Restore Imported Mods**. Confirm the original six working pairs return
   while the added Cow candidate remains: **Selected (7)**. If a removed original
   power was deliberately added as a planned copy, test cancel/accept on the
   overlap confirmation; neither choice silently removes the planned copy.
8. Swap the active slots to Unarmed A / Cow B. Confirm Unarmed becomes blue and
   appears first, Cow becomes amber, and all six imported pairs survive. Changing
   away from a skill still deliberately prunes separately staged candidates of
   that departed skill when neither slot uses it, with the existing Undo notice.
9. Repeat at 375px and 320px. Scroll Selected to reach all rows, use the details
   controls to inspect full text, and confirm readable chips and no horizontal
   page overflow. Ordinary database items keep their candidate controls.

## Changed files and scope

- Build/editor: `src/core/build/existing-mods.ts`, `document.ts`, `README.md`,
  and `src/app/editor/build-editor.ts` implement immutable working edits,
  exact-tier checks, restoration and duplicate guards.
- Shared presentation: `src/data/search/treasure-planning.ts` and
  `src/features/mods/{ModSkillChip,ItemStats,CandidateList,ModPlanner,EquipmentMods,PowerFacts}.tsx`,
  plus `item-stats.css` and `mods.css` unify rows, colors, controls and grouping.
- Minimal import/equipment integration: `EquipmentPlanner.tsx`,
  `ImportedItemDetails.tsx`, and the import smoke selector label.
- Verification: new `ImportedMods.test.tsx`, `imported-mod-editor.test.ts`,
  synthetic Cow/Unarmed fixture and `imported-mods.smoke.py`; updated existing
  mod tests/smoke expectations; this report and synthetic screenshots.

## Limits and handoff

No real customer reports were executed or committed. Actual customer-export
reference-resolution counts against pinned v490 remain unverified and require
private browser acceptance. Unknown references are not guessed into editable
pairs. Synthetic levels/powers demonstrate preservation, not item legality.
Restore cannot recover a historical export that a legacy instance never stored;
it uses the explicitly retained initial working baseline in that case.

No T0012 calculations, CurrentStats comparison, Spark simulation/history import,
automatic equipment inference, remote uploads or schema migration were added.
Related UX follow-up T0011-F3 has been scheduled to allow rapid equip/unequip from general My Items without closing the dialog; this is a separate scoped ticket. Post-merge documentation is synchronized. Private source-item mapping accuracy is still subject to customer browser verification.
