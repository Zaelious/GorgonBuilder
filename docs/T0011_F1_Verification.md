# T0011-F1 — Browser Import and My Items Picker

Branch: `feature/t0011-f1-browser-my-items`, based on main `715cba5`.

## User workflow

1. Open the branch preview in a browser and click **Import Character** beside the
   build title. Choose current CharacterSheet and Storage JSON reports.
2. Verify the character/server and both report timestamps/versions. Expand
   **Verify skill levels** and search for two or three familiar skills. The table
   shows their original levels, bonus levels, and resolved IDs or Unresolved.
3. Expand **Import diagnostics** to check totals, equipment count, resolved and
   unresolved item/skill/ability references, exact treasure pairs, imbues and
   compatibility warnings against official **v490**. These are results from the
   actual selected files, not assumed real-export counts.
4. Click **Use these reports**. The existing loadout and both skill bars remain
   unchanged. Open **My Items** beside Equipment, or the My Items source in an
   existing slot's picker. Search partial names, narrow by slot, actual item
   level, rarity or inventory/storage location, and page through ten instances
   at a time. Unknown actual levels are excluded whenever a level bound is set.
5. Open **Exact powers & instance details** to compare original TypeID, exact
   source power/tier identities and official descriptions. Imbues are separate.
   Unresolved powers/tiers are retained, never replaced by nearby tiers. Original
   crafting/augmentation/item metadata is available on demand.
6. Click **Equip** on the intended owned instance. Replacing selected equipment
   asks for confirmation and retains that slot's staged candidate mods and Spark
   settings. Clear asks before discarding instance/mod/Spark state. Offhand
   weapons and shields continue sharing one physical position.
7. Wait for **Saved in this browser**, refresh, expand the selected slot, and
   verify its actual level and exact source powers. The full My Items inventory
   must be imported again after refresh; selected instances remain usable.
8. Re-import different reports and verify that the current loadout does not
   change. Try wrong report types, malformed JSON or mismatched character/server
   files: the dialog must show a recoverable error without replacing the prior
   inventory or draft. Protected/incompatible drafts permit inspection but keep
   equipment edits disabled.

No clone or CLI is required for customer verification. Fresh private customer
exports have **not** been executed by this implementation agent. Customer
acceptance should verify their actual reference-resolution counts in the preview;
do not attach original files, private screenshots or complete snapshots to GitHub.

## Architecture and privacy

- Browser file reads call the existing T0011 pure APIs with the existing official
  repository adapter. No upload request, remote persistence or new dependency.
- The full imported character/inventory session lives in React memory only.
  Parsing and applying an inventory never invokes build autosave or changes the
  planner's skills, bars or selected equipment.
- Explicit equipment selection projects a single item into schema-v1
  `kind: 'imported'`. It stores the selected source item in
  `instance.metadata.sourceItem`, known existing power/tier pairs, and minimal
  provenance (export time/version, character/server, source locator, dataset).
  It does not attach Skills, CurrentStats, the Storage Items collection or
  arbitrary report-level metadata to BuildDocument. Unknown source item fields,
  powers, tiers, imbues and crafting metadata survive autosave/reload.
- On refresh, the existing parser re-reads the selected source-item evidence for
  inspection; original saved state remains intact. The source array locator
  distinguishes in-memory instances, not a claimed permanent game instance ID.
- All source text renders as escaped React text. Errors are displayed locally
  without console dumps or telemetry. File read races ignore stale completions.
- Source slots take precedence; a resolved official equipment slot is used only
  when the source omitted a slot. Entries with neither are hidden from the owned
  equipment picker and remain included in total/unresolved diagnostics.
- Equipped state and Spark history remain unavailable. Inventory/storage does
  not establish active equipment, and CraftPoints is not converted into Spark
  rolls or counts. No T0012 aggregation or T0016 CurrentStats comparison.

## Automated verification

Run on Node 24.19.0:

```bash
npm ci --cache /tmp/gorgonbuilder-npm-cache
npm run data:update -- --check
npm run lint
npm run typecheck
npx vitest run src/features/import
npm test
npm run build
npx wrangler deploy --dry-run --outdir /tmp/gorgonbuilder-cloudflare-dry-run
git diff --check
```

The executor needed writable temporary npm/Wrangler paths. The successful
dry-run used `XDG_CONFIG_HOME=/tmp/gorgonbuilder-wrangler-config`,
`WRANGLER_LOG_PATH=/tmp/gorgonbuilder-wrangler.log` and
`WRANGLER_SEND_METRICS=false`; no repository config or credentials changed.
Dry-run output is placed outside the source tree so generated Worker JavaScript
does not become input to the repository's broad ESLint command.

Results: dependency install, pinned v490 check, lint, strict typecheck, production
build, Cloudflare dry-run and whitespace checks passed. **640 tests across 28
files** passed, including all 611 baseline tests and **29 focused F1 tests**.
The six Chromium dev/preview/viewport combinations described below passed with
zero runtime errors, zero network writes and no page/dialog horizontal overflow.

Focused coverage includes matching/mismatched identities, malformed/wrong-type
files, private file read failures, stale asynchronous reads, exact official
resolution, duplicates sharing TypeID, pagination, actual-level/rarity/location
filters, unresolved item/power/tier evidence, separate imbues, selected-instance
persistence, replacement confirmation, read-only protection, candidate/Spark/bar
preservation, and offhand exclusivity.

The synthetic Storage fixture in `src/features/import/fixtures/storage.json`
contains six entries (five equipment instances), two distinct same-TypeID blades,
an unresolved ring, one non-equipment item, exact and unresolved treasure tiers,
and an imbue. `FixtureAugmentationMetadata` is an explicitly synthetic unknown
field. Fixture levels/powers demonstrate preservation, not legality or generation
eligibility. No original customer report is committed.

## Real-browser smoke

After building, with Python Playwright and Chromium available:

```bash
python src/features/import/import.smoke.py --output /tmp/gorgonbuilder-import-smoke
```

This exercises both Vite dev and production preview at **1440×960**, **375×960**
and **320×960**, using only committed synthetic fixtures. It checks invalid JSON,
identity mismatch recovery, selected skill levels, diagnostics, actual-level
filters, duplicate instances, exact known/unknown tiers, separate imbues,
confirmation/selection, candidate/Spark/ability-bar retention, refresh persistence,
inventory lifecycle, offhand shield/weapon swaps and clear. Network requests are
observed for write methods/request bodies or private sentinel URLs; every case
must have zero writes and runtime errors, and no page/dialog horizontal overflow.
The same script accepts `--url BRANCH_PREVIEW_URL` for a deployed smoke check.

Screenshots contain synthetic fixture data only:

- [Desktop import verification](screenshots/t0011-f1/import-desktop.png)
- [Desktop owned-instance details](screenshots/t0011-f1/my-items-desktop.png)
- [375px My Items](screenshots/t0011-f1/my-items-375.png)
- [320px My Items](screenshots/t0011-f1/my-items-320.png)

## Limits and documentation handoff

The pinned v490 data may leave references from newer exports unresolved. Unknown
equipment slots remain source strings; a source slot or resolved base equipment
definition is required for default My Items inclusion. The full inventory is
intentionally transient and does not survive refresh. Browser storage quota or
blocked storage can prevent selected gear from saving; the existing save-error
and retry flow remains visible. There is no claim that real customer reference
resolution has passed until the customer runs it in the browser.

After architect review and customer acceptance/merge, update
`Repo_Current_State.md`, T0011-F1 status in `Tickets.md`,
`Manual_Verification_Guide.md`, and `Character_Import_And_Validation.md` with
accepted browser evidence. KI-0002/0003 (equipped/Spark limitations) remain valid.
