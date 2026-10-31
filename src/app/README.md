# T0008 — Skill and Ability Planner UI

## Behavior and integration

`App.tsx` loads `loadGameDataRepository()` with loading/error/retry states before
restoring the local draft. The editor reuses `createLocalPersistence()` and
`createDraftAutosave()` unchanged. Committed build edits schedule the existing
500 ms debounce; pagehide, hidden visibility and unmount flush pending work.
Failed writes keep pending work for the visible retry button. No initial render,
search, browser rank preview or invalid level text writes a draft.

Each slot has an official combat-skill filter/selector, its own level, ordered
bar and searchable ability browser. Either slot can be blank; duplicate skills
keep separate levels and bars. The browser groups only official `UpgradeOf`
connections within a skill, including branching links. Each option displays the
exact official ID, published level and explicit Rank (or “Rank not published”).
Choosing an upgrade never derives Rank from a name or level. Adding stores the
selected exact official ID and its original string/number/null rank.

Changing/clearing a skill **retains** that bar's entries and warns about
incompatibility. Missing skill/ability IDs, changed published ranks and abilities
above the configured level are visible without silently substituting records.
Entries can be individually removed or moved with semantic keyboard-operable
buttons. No bar-size limit, skill cap, unlock rule or rotation semantics is added.

Only the addressed skill slot or ability bar is replaced by an edit. Equipment,
mods, Sparks, target, title, notes, import metadata and app/schema metadata are
preserved. Search strings, pending level text and rank previews are transient.

Malformed draft recovery is shown without writing until an actual build edit.
Unsupported-schema drafts are protected by the T0007 persistence API, with
fallback build editing disabled. A different saved game-data version is retained
and shown read-only: only the current bundled snapshot is available, and there
is no implicit migration or historical-snapshot loader.

## Files

| File | Purpose |
| --- | --- |
| `src/app/App.tsx` | Loading, restoration, autosave lifecycle and recovery/status UI |
| `src/app/planner.css` | Existing-theme desktop columns, mobile stack and focus styles |
| `src/app/editor/build-editor.ts` | Immutable slot/bar edits and selection diagnostics |
| `src/app/editor/build-editor.test.ts` | Official-data editor and grouping acceptance tests |
| `src/features/skills/SkillPlanner.tsx` | Independent skill filters, selectors and level inputs |
| `src/features/abilities/AbilityPlanner.tsx` | Upgrade selection, browsing and independent bars |
| `src/features/abilities/groups.ts` | Grouping by official UpgradeOf links and rank labels |
| `src/test/App.test.tsx` | Editor interaction, restore/recovery and save lifecycle tests |
| `src/test/planner-fixture.ts` | Test-only loading of committed runtime definitions |
| `src/app/README.md` | Implementation and verification handoff |

No dependency, schema, normalizer, generated data or unrelated feature changed.

## Verification

Commands executed on Node 24.19.0:

- `npm ci` initially could not write the environment's default npm cache;
  `npm ci --cache /tmp/gorgonbuilder-npm-cache` passed with the committed lockfile.
- `npm run data:update -- --check` — passed; official v490 snapshot intact.
- `npm run lint` — passed with no warnings.
- `npm run typecheck` — passed for both strict TypeScript projects.
- `npx vitest run src/app/editor/build-editor.test.ts src/test/App.test.tsx`
  — **29 focused tests passed**.
- `npm test` — **322 tests passed across 11 files** (293 existing non-UI tests
  plus 29 editor/UI tests replacing the placeholder test).
- `npm run build` — passed; generated assets emitted lazily, no raw source imports.
- `git diff --check` — passed.
- `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` — passed, no upload.
  This sandbox required `XDG_CONFIG_HOME=/tmp/gorgonbuilder-wrangler-config` and
  `WRANGLER_LOG_PATH=/tmp/gorgonbuilder-wrangler.log` for writable CLI paths.

Wrangler generates `.wrangler/` JavaScript that the existing ESLint configuration
will scan. Run lint before Wrangler or clear those disposable local artifacts
before repeating lint; no repository configuration was changed for this issue.

### Browser verification

Chromium exercised the production `dist` bundle using both Python's static HTTP
server and **`wrangler dev` (Cloudflare Workers local assets)**:

1. Psychology / Deer and Cow / Unarmed selections.
2. Skill A only and Psychology in both slots.
3. Different levels, exact official upgrade selections, independent bar ordering,
   adding/removing and changing/clearing skills with retained incompatible entries.
4. Refresh restoration of IDs, explicit ranks, levels and independent bar order.
5. Skill/ability searches and keyboard navigation/editing of levels.
6. Desktop 1440×1000 and mobile 375×812; no horizontal overflow on mobile.
7. Real artifact-load failure followed by successful retry.
8. Missing saved IDs visibly retained, and future-schema draft left untouched.
9. No unexpected browser console errors or page exceptions on successful flows.

The four requested example skills omit Rank for many abilities. Their upgraded
records correctly say “Rank not published”; IDs and levels still distinguish
options. Official Battle Chemistry abilities also demonstrate published Rank
strings in the focused official-data tests.

Local initial repository preparation took approximately **1.7–1.8 seconds**.
Chromium reported approximately **195–239 MB used JavaScript heap** after loading
across the runs. These are local observations without CPU/network throttling,
not a low-memory/mobile performance guarantee. T0006 currently loads all three
artifacts (about 3.27 MB compressed / 72 MB decoded JSON) to create its repository.

## Follow-up discovered: Vite gzip transport

`npm run dev` and `vite preview` both reproduce an existing loader/serving
integration problem. Vite's static server responds to generated `.gz` assets
with `Content-Encoding: gzip`. Browser fetch decompresses them automatically,
but T0006's `decodeArtifact` validates the compressed bytes before decompression.
For example, `abilities.json.gz` expects 536,127 compressed bytes and receives
15,889,377 decoded bytes, resulting in “generated byte length mismatch”. The
planner displays its load-error/retry state and does not touch the stored draft.

The same production bundle works through the Cloudflare Workers local asset
server and an ordinary static server that preserves compressed artifact bytes.
This has **not** been verified against a deployed remote preview. An architect
should track a narrow T0006 loader/asset-serving follow-up that preserves hash
verification while making Vite dev/preview usable. No loader, generated-data or
hosting configuration change was made outside T0008's allowed areas.

## Documentation after merge

Update `docs/Repo_Current_State.md` and `docs/Tickets.md` for T0008 completion and
the next-ticket handoff; add the planner/recovery steps to
`docs/Manual_Verification_Guide.md`; describe the implemented local editor lifecycle
in `docs/MVP_Technical_Design.md` and `docs/Build_Save_And_Share_Design.md`; record
the Vite gzip transport issue and measured runtime cost in
`docs/Known_Issues_And_Followups.md`. Central documentation updates remain outside
this ticket's allowed write areas. Customer hands-on usability and architect
review remain required by the ticket. T0009 was not started.
