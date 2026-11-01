# GorgonBuilder — Manual Verification Guide

**Status:** Active

## Principle

A passing build does not prove the feature works.

Every ticket has its own manual verification steps in `Tickets.md`. This guide defines the common baseline.

## Verification Classes

Every ticket still receives automated verification appropriate to the current repository. Customer hands-on testing is targeted rather than mandatory for every internal ticket.

- **Automated + architect review:** Codex runs the required quality checks and ChatGPT reviews the implementation/PR. Customer manual testing is optional.
- **Customer quick check:** a brief UI sanity check.
- **Customer hands-on:** the customer performs the ticket's listed user workflow because usability or real Project Gorgon behavior matters.
- **Customer game-math validation required:** acceptance includes controlled in-game observations supplied by the customer.
- **Customer milestone regression required:** a broader end-to-end pass before a release milestone.

This keeps internal schema/normalization tickets from wasting customer time while preserving hands-on checks for planner UX, game math, imports, Sparks, sharing, comparison, and release.

## Baseline Frontend Verification

Once applicable:

1. `npm install`
2. `npm run dev`
3. Open local app.
4. Confirm requested feature appears.
5. Exercise the ticket's main success path.
6. Exercise one obvious failure/empty path.
7. Check browser console for unexpected errors.
8. `npm run lint`
9. `npm run typecheck`
10. `npm test`
11. `npm run build`

## Data Tickets

Verify:

- source/version is recorded
- deterministic regeneration where expected
- IDs are stable
- representative known records exist
- unknown fields do not silently become fake interpreted values

### T0003 progression-normalization checks

For this data-only ticket, run focused tests and inspect normalized records rather than expecting new UI:

- `npm run data:update -- --check` validates the pinned snapshot offline.
- `npx vitest run src/data/adapters/normalize-progression.test.ts` tests source preservation, deterministic results, invalid references and official-data integration.
- Inspect Psychology/Unarmed (`Balanced` → `3_Balanced`), Cow (`PlayerCow` → `11_PlayerCow`), and Deer (`PlayerDeer` → `15_PlayerDeer`).
- Ensure qualified rewards and unknown fields remain uninterpreted; malformed references fail explicitly.
- Inspect `integrityIssues` and remember it covers only implemented namespaces, not all possible cross-dataset links.
- Run lint, typecheck, full tests and production build. See `Repo_Current_State.md` for the verified GitHub CI run.

### T0004 ability/dynamic-data normalization checks

T0004 is data-only; automated verification and architect review replace UI manual testing.

- Run `npm run data:update -- --check` and `npx vitest run src/data/adapters/normalize-abilities.test.ts`.
- Inspect Psychology, Cow, Unarmed and Deer abilities, including upgraded records, explicit Rank versus Level, damage, cooldown/target/AoE, keyword constraints and embedded dynamics.
- Confirm counts: **5,972 abilities, 26 keyword rules, 2 global dynamic DoTs, 4 global dynamic special values, 4,063 acquisition records**, plus **1,757 embedded DoTs** and **1,823 embedded special values**.
- Verify official internal-name links for `UpgradeOf`, `Prerequisite` and `SharesResetTimerWith`; never invent ranks or applied effect links.
- Preserve anonymous rule indices only as snapshot locators; global dynamic rules have no invented per-ability owner. Preserve unknown fields and canonical raw values.
- Inspect **1,546 integrity diagnostics**: 1,532 published `Skill: Unknown` references and 14 unmatched effect-keyword references. They are unresolved source gaps, not proven nonexistent mechanics; T0006 must retain/report them.
- Run lint, typecheck, full tests and build. [PR #5 GitHub CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41240276925) passed.

### T0005 item and treasure-system normalization checks

T0005 is data-only. Architect review and automated inspection replace UI manual testing.

- Run `npm run data:update -- --check` and `npx vitest run src/data/adapters/normalize-items-treasure.test.ts`.
- Verify the official v490 normalized totals: **3,078 equippable items**, **8,131 other item IDs**, **8,460 fixed-effect descriptions**, **1,947 powers**, **45,634 power-owned tiers**, **40 profiles**, **8,649 profile memberships**, and **10,068 item acquisition records**.
- Check representative source records: `item_45640` (MainHand/Dagger), `item_45722` (OffHand/Dirk), `item_45052` (OffHandShield/Shield), `item_42093` (Chest/All), `item_49070` (Ring/All), and `item_48081` (Necklace/All). All have published `CraftingTargetLevel: 90`, which is **not proof of an equip-level restriction**. Confirm skill requirements remain separate.
- Confirm all **2,578 item/profile** and **8,649 profile/power** published links resolve, and original power/tier identities are intact. Inspect `power_10001/id_1`, `power_10001/id_9`, and the atypical `power_129/id_120`.
- Confirm exact fixed-effect prose, unknown tier fields, canonical raw records, source IDs, URLs, SHA-256 hashes, and version remain available without invented numeric modifier or eligibility semantics.
- Inspect T0005's **96 diagnostics**: 6 unresolved `Skill: Unknown` links and 90 `AnySkill` selectors with unsupported semantics. Preserve the distinct **1,546 T0004 diagnostics** for T0006.
- Run lint, typecheck, the full test suite, and build. The [PR #6 GitHub CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41241709925) passed, with 42 focused tests and 173 total tests.

### T0006 generated dataset and runtime repository checks

T0006 is a data-only milestone; no new planner UI is expected. [PR #8 GitHub CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41245038034) passed alongside Cloudflare Workers Builds.

1. Run `npm run data:update -- --check`.
2. Run `npm run data:generate` twice and compare all four generated file hashes for byte-identical output, including the manifest.
3. Inspect `src/generated/game-data/manifest.json` for v490 version, source SHA-256 provenance, artifact byte hashes, counts and diagnostic source paths.
4. Verify 188 skills, 588 advancement tables, 2,189 attributes, 23,282 effects, 5,972 abilities, 3,078 equipment, 1,947 treasure powers, 45,634 power-owned tiers, 40 profiles and 8,649 profile memberships.
5. Confirm separate known diagnostics: 1,546 from T0004 and 96 from T0005 (1,552 unresolved references and 90 unsupported selectors).
6. Run `npx vitest run scripts/generate-data.test.ts src/data/repository/repository.test.ts` (37 focused tests), then lint, typecheck, full tests (210) and build.
7. Spot-check Psychology/Cow/Unarmed/Deer, six representative items, and composite tier `power_129/id_120`. Do not infer equipment restrictions from `CraftingTargetLevel`.

Runtime assets total 3,269,457 bytes compressed and 72,009,523 decoded JSON bytes. Real browser heap/latency must be measured when UI first consumes these assets in T0008/T0009. See [runtime repository README](../src/data/repository/README.md).

### T0007 build domain and local persistence checks

T0007 is an internal schema/persistence ticket; automated tests and architect review replace manual UI testing. [PR #10 GitHub CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41246601530) passed; Cloudflare preview built and deployed successfully.

1. Inspect a default `BuildDocument`: `schemaVersion: 1`, explicit `gameDataVersion`, separate empty skill slots and ability bars, empty equipment, and a neutral one-target configuration.
2. Confirm one skill, two different skills, and the same skill in both slots; `getUniqueActiveSkillIds` must deduplicate IDs without merging different chosen levels or independent bar order/ranks.
3. Inspect representative equipment selection, imported/manual instance metadata, composite TSys power/tier IDs, candidate mods without count limits, and Spark none/simulated/actual modes; verify JSON round-tripping.
4. Check browser-local draft and preference save/restore with fresh persistence instances. The keys are `gorgonbuilder.current-draft` and `gorgonbuilder.preferences`; minimum equipment level defaults to 90 as a preference only, not a validated equip restriction.
5. Confirm malformed JSON/structure, absent storage, blocked localStorage, quota failures and incompatible future schema versions produce explicit recovery/error results. Incompatible saved versions must **not** be overwritten, including by autosave.
6. Check autosave snapshotting, 500 ms debounce, flush/cancel and explicit retry after a failed write. T0008 now connects the React editor lifecycle to this API.
7. Run `npx vitest run src/core/build/document.test.ts src/persistence/local/storage.test.ts src/persistence/local/autosave.test.ts` (84 focused tests), followed by lint, typecheck, full tests (294) and build.

See [build domain README](../src/core/build/README.md). No new UI or remote save/share capability is expected in T0007.

### T0008 compact skill/ability planner checks

[PR #12](https://github.com/Zaelious/GorgonBuilder/pull/12) was customer-accepted and merged. [Final-head CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41297214856) passed **345 tests**; Cloudflare preview build/deployment succeeded.

1. Select Psychology/Deer, Cow/Unarmed, A-only, and Psychology/Psychology; confirm independent levels and six slots per bar.
2. Search official ability families, quick-add highest published tier and explicitly choose a lower tier; inspect source facts, real official icons, full-bar guidance and keyboard/touch access.
3. Replace/reorder/remove; changing Animal Handling to Archery clears **only** A, while re-selecting the same skill retains its bar.
4. Edit title (Enter/blur save, Escape cancel), refresh and confirm title/levels/bars persist. Test protected schema, storage recovery/retry and unresolved official IDs.
5. Inspect the desktop section's approximately **212 CSS px** height (48 px icons); confirm 375 px and 320 px mobile layouts. For optional real-browser geometry verification run `python src/test/planner-layout.smoke.py --output /tmp/gorgonbuilder-layout` after building.
6. Run pinned-data validation, lint, typecheck, full tests and production build. **KI-0008:** see the [transport verification](KI-0008_Verification.md) and browser smoke below for local Vite dev/preview checks.

See [T0008 app README](../src/app/README.md) for detailed evidence.

### KI-0008 pre-T0009 gzip transport checks

This is a separate narrow preflight PR, not part of T0009's equipment UI.

1. In a real browser, inspect each generated `.json.gz` response under both `npm run dev` and `npm run build && npm run preview`: verify `fetch().arrayBuffer()` returns manifest-matching **compressed** size and SHA-256, without transparent HTTP decoding.
2. Confirm the existing skill/ability planner loads correctly in both Vite modes and displays no loader errors; intentionally corrupted bytes must still fail verification.
3. Verify other assets/production output are unaffected; run `npm run data:update -- --check`, lint, typecheck, tests, build and Wrangler dry-run.
4. After building, run `python src/test/vite-transport.smoke.py --output /tmp/gorgonbuilder-vite-transport` with Python Playwright and Chromium available. It starts both npm serving modes, verifies browser sizes/hashes, exercises the existing planner and tests corruption/retry for every artifact. See [KI-0008 evidence and environment setup](KI-0008_Verification.md).

### T0009 minimum target-level search checks

1. Confirm “Minimum target level” defaults to 90 from the existing preference; test level 89 excluded, 90/91 included and unknown/null included only when the explicit default-on toggle is enabled.
2. Test 80+, no threshold, and combination with slot/text search. Unknown-target results must be visibly marked, never zero-filled.
3. Compare official `SkillReqs` versus `CraftingTargetLevel`; neither is a universal equip-level assertion. Changing the filter must not silently unequip existing selections.
4. Equip/replace/clear, refresh and verify the existing skill/ability planner and saved draft fields remain intact.

**T0009 final accepted verification (2026-11-01):** [PR #18](https://github.com/Zaelious/GorgonBuilder/pull/18) merged at `7cd03ee`. The customer passed the initial functional checklist, then accepted the refined nine-primary-slot icon layout. The [final report](T0009_Verification.md) documents 408 passing tests, real Chromium Vite dev/preview checks, and updated screenshots. For regressions, also check all nine empty rows, official selected-item icons/fallbacks, collapsed Other slots, distinct OffHand and OffHandShield, picker X/Escape focus behavior, and dragging text outside the search field without closing the dialog. Backdrop-click dismissal remains disabled pending optional KI-0010 UX exploration.

**T0009-F1 completed/customer accepted (2026-11-01):** [PR #20](https://github.com/Zaelious/GorgonBuilder/pull/20) merged as `09257ce`. Expanded selected-item details no longer repeat the summary icon/name. OffHand and OffHandShield now share one exclusive user-facing position while retaining exact published type IDs in saved data; cross-type swaps round-trip through autosave. Legacy conflicts are preserved until deliberate user confirmation, with retained manual/imported instance metadata, candidate mods and Spark settings. The [verification report](T0009_F1_Verification.md) records 418 tests and real Chromium dev/preview/mobile/gzip checks. Continue using these assertions for regressions; KI-0010 optional backdrop dismissal remains unimplemented.

## Calculation Tickets

Verify:

- exact fixture/input
- calculation result
- expanded breakdown
- confidence/warning state
- removing the modifier reverses the effect

For confirmed Skill Base:

```text
base 500
skill base +50%
expected contribution +250
```

## Spark Tickets

Verify:

- 0 Sparks has no effect
- fixed seed repeats exactly
- 110 simulated rolls count to 110
- reroll produces a different result in UI
- expected-value calculation is independent from random simulation

## Import Tickets

Use supplied fixtures and, later, a fresh current export.

Verify:

- report timestamp shown
- correct character/server
- representative skill levels
- known abilities
- representative item TypeID/name/slot/level
- exact TSys powers/tiers
- `IsInInventory` is not presented as "equipped"
- malformed/wrong report gives clear error

## Save/Share Tickets

Test at least:

- create
- public read
- owner edit
- wrong-token rejection
- delete
- public read-only in private/incognito window
- duplicate creates new independent ownership

## Comparison Tickets

Create build A, duplicate to B, change one controlled input, and confirm:

- changed input is visible
- ability delta is visible
- unchanged values remain unchanged
- both sides use the same calculator

## Review Evidence

The ticket completion report should include enough detail that ChatGPT can compare what was tested with acceptance criteria.
