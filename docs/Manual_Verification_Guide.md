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

### T0008-F1 imported level and ability-picker acceptance (merged 2026-11-02)

[PR #27](https://github.com/Zaelious/GorgonBuilder/pull/27) is customer-accepted, architect-reviewed and squash-merged as `445735e`. [Implementation evidence](../src/features/skills/verification/T0008-F1.md): 714 tests, successful final-head CI/Cloudflare and six synthetic Chromium dev/production-preview runs at 1440/375/320 px.

1. Import real CharacterSheet/Storage reports locally and inspect Verify skill levels. Customer verified that exported `Level` **already includes** `BonusLevels`: Werewolf 106+source bonus 6 → planner 106; Deer 112/12 → 112; Cow 111/11 → 111; Unarmed 110/10 → 110. Prodigy levels are not combat levels. Never re-add reported bonus values.
2. Deliberately select imported combat skills and check editable initialized levels. Manually override, reimport, and verify unchanged build. For an already-selected differing skill, **Apply imported level** updates only the level, not its abilities, equipped items, working mods, Sparks or target; refresh confirms autosave.
3. General bar-side + stays open through repeated additions, preserves query/family/detail/scroll and shows live count to six. Duplicate markers are per bar; blocked add controls remain visible at capacity. Numbered empty + and Replace close after one selection; numbered empty + still appends to the next available contiguous position.
4. Test occupied-icon × quick removal by hover/mouse, keyboard and mobile touch: correct ability is removed and bar compacts without activating details. Check read-only draft protections, focus, independent A/B bars and refresh.
5. Keep [corrected source interpretation](../src/features/import/skill-levels.md) and tests synchronized if report semantics evolve. Private full-v490 item/power/tier resolution counts remain separate outstanding verification.

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

**Public UI correction (T0010-F2, 2026-11-04):** calculation breakdowns and technical source records referenced in historical acceptance steps below are now available only on the Vite development server with `?debugDamage=1`. Normal public damage views show calculated values and concise Estimated/Unavailable status. Production preview ignores the flag. Engine diagnostics remain complete and automated tests still inspect them.

### T0012 accepted modifier aggregation (2026-11-02)

[PR #29](https://github.com/Zaelious/GorgonBuilder/pull/29) passed final-head GitHub CI, Cloudflare preview and product-owner optional browser regressions, and was squash-merged as `c611f72`. [T0012 evidence](T0012_Verification.md): 773 tests (46 new) and deterministic synthetic Psychology/Cow-Unarmed aggregation reports. Run `npx vitest run src/core/calculation` for 46 focused tests. Confirm skill deduplication; fixed-item and effective imported existing power sources; independently staged candidates; original imported metadata not counted; unknown mappings preserved; and removing/editing one source alters only its contributions. No visible calculation UI is expected yet. Advancement sums are assumed. The product owner confirmed duplicated selections of a skill cannot have different actual levels; T0012 warns and omits progression on legacy conflict, pending UI correction. Validate real-gear damage in T0013 and imported CurrentStats in T0016, with temporary buffs and passive effects accounted for.

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

### T0013 accepted calculation foundation (2026-11-02)

[PR #32](https://github.com/Zaelious/GorgonBuilder/pull/32) squash-merged as `86c2e34` with 810 automated tests and green GitHub CI. [Verification](T0013_Verification.md) and [four calculation reports](calculation-reports/T0013-psychology-mock.txt) demonstrate exact ability IDs, skill/ability/damage-type filtering, original-base Skill Base rule and per-modifier ordered breakdowns. Confirm `500 × 0.50 = +250` regardless of other flats; missing/unknown powers and crits remain explicitly unmodeled. The preview formula remains provisional. T0014's opt-in damage results UI is now merged; Spark integration remains pending in T0015. Use controlled game comparisons as formula evidence; T0013-F1 expands static direct-damage modifier support across combat skills before Spark work.

### T0014 ability results, target dummy and acceptance corrections

[PR #34](https://github.com/Zaelious/GorgonBuilder/pull/34) was customer-accepted and squash-merged 2026-11-03 as `19a26bf`; [T0014 verification](T0014_Verification.md) covers the full steps and screenshots. Check that:

- **Damage analysis toggle:** off by default; when off, facts, Relevant Mods and bar controls are unchanged. It is remembered per browser session and never saved in the build.
- **Psychology + Deer:** the naked Mock base matches the game.
- **Mock +43% (OffHand `power_4066`):** raises Mock and Ridicule only.
- **Hands `power_4032` conversion:** Burst 20 m, ×0.5 at every enemy count, taunt and reuse shown as not damage.
- **Enemy counts 1 / 3 / 5 / 9:** full / full / full / 25% direct floor for 20 m Mock Burst. T0014 leaves 6–8 unavailable; T0013-F1 will add explicitly estimated interim direct falloff, not claim observed game values.
- **Long popovers:** scroll to Remove at 1440, 1920, 375 and 320 px without the position resetting.
- **Respect Skill Level:** persists across picker reopenings within the session.
- **OffHand / OffHandShield:** benign warnings stay hidden, while incompatible slots and double-offhand conflicts still warn.

After building, run `node src/features/abilities/popover-scroll.smoke.mjs` for the real-browser scroll regression. Formula placement for the ×0.5 penalty and the +X% stacking is assumed and needs in-game comparison.

### T0013-F1 prioritized combat treasure-effect coverage (next)

After T0014 merge, implement the [T0013-F1 ticket](Tickets.md#t0013-f1--combat-treasure-effect-coverage-and-burst-estimate). Run a complete pinned-v490 treasure-power/tier effect inventory; review per-skill modeled vs unmodeled counts. For at least Psychology, Cow/Unarmed and three unrelated combat skills, equip one deterministic direct-damage power and verify that its delta is isolated, traceable and reverses when removed. Check imported working powers equal planned mods and that off-skill/conditional effects do not leak. The two Mock prose powers remain regression anchors. Compare documented 20 m Burst thresholds (5 full / 9 at 25% direct) against transparently **Estimated** linear interpolation at 6/7/8 = 81.25%/62.5%/43.75%; actual in-game measurements supersede the estimate. Keep Damage analysis opt-in and scroll regression green. Do not implement Sparks or rotations in this pass.

## Spark Tickets

Verify:

- 0 Sparks has no effect
- fixed seed repeats exactly
- 110 simulated rolls count to 110
- reroll produces a different result in UI
- expected-value calculation is independent from random simulation

## Import Tickets

Use sanitized fixtures and fresh private exports without ever committing original reports.

### T0011 — Parser acceptance (2026-11-02)

[PR #23](https://github.com/Zaelious/GorgonBuilder/pull/23) passed GitHub CI/Cloudflare with 611 tests (98 import-focused) and was squash-merged as `a197599`. The next-XP `-1` sentinel discovered in a real export was fixed and regression-tested. Independent real-file field-constraint review found zero structural/type errors. **Limitation:** exact Node reference-resolution counts for private exports were not run. The T0011-F1 browser-local My Items workflow is now merged. The remaining private browser verification must check actual item/power/tier resolution without publishing user data.


### T0011-F1 — Browser My Items UI (merged 2026-11-02)

[PR #24](https://github.com/Zaelious/GorgonBuilder/pull/24) was architect-reviewed and merged as `4b84960` after GitHub CI/Cloudflare success (640 tests, 29 new). Synthetic Chromium dev/preview checks exercised 1440/375/320px, duplicate item instances, exact source tiers, selected gear persistence and offhand replacement. Customer conditional acceptance did not include uploading private files yet. **Still required:** use a current CharacterSheet and Storage export in the actual browser; inspect real v490 resolved/unresolved counts and 2–3 familiar items/power tiers. Confirm Spark rolls are not imported and not inferred from CraftPoints. Keep exports private; document non-identifying counts and bugs only.

Verify:

- report timestamp shown
- correct character/server
- representative skill levels
- known abilities
- representative item TypeID/name/slot/level
- exact TSys powers/tiers
- `IsInInventory` is not presented as "equipped"
- malformed/wrong report gives clear error

### T0011-F2 — Editable imported treasure powers (accepted 2026-11-02)

[PR #25](https://github.com/Zaelious/GorgonBuilder/pull/25) passed GitHub CI/Cloudflare builds with 660 automated tests and synthetic Chromium dev/production-preview checks at 1440/375/320px and was product-owner accepted/merged as `8932f0a`. With a private current exported Cow/Unarmed item, confirm Selected shows resolvable original powers; editing an imported tier/removing a power updates STATS and survives refresh; **Restore Imported Mods** recovers original known pairs and retains independent staged candidates, Sparks, and immutable source evidence. Official v490 private-export reference-resolution counts remain unverified. Do not publish real user exports or screenshots containing their raw source data.

### T0011-F3 — My Items quick-loadout UX (accepted 2026-11-02)

Test the **general** Equipment → My Items view separately from each slot-specific picker. General view must stay open through repeated Equip/Replace/Unequip actions, retaining current search/filter/page/scroll; a selected concrete instance must show **Equipped** status and **Unequip** action, while another copy of the same TypeID stays unselected. “Equipped” here means selected in the **GorgonBuilder build**, never `IsInInventory` from Project Gorgon. Confirm clearing an edited item is protected, read-only drafts cannot change, OffHand exclusivity holds, and slot-specific pickers still close after one choice. Recheck state across refresh and safe reimport, 375px and 320px. Do not publish original customer reports.

### T0011-F3 — Quick My Items loadout workflow

Use the [ticket-specific verification report](T0011_F3_Verification.md) for exact manual steps and screenshots. General My Items must retain the same dialog/search/filters/page/scroll through multi-slot equip, exact-instance replacement and confirmed unequip. Only the actual selected instance shows Equipped/Unequip, including after F2 mod edits and refresh/reimport of the same report. Individual slot pickers still close and restore focus. Check duplicate TypeIDs, cancel/confirm, retained candidates/Sparks, offhand exclusivity, protected drafts and 375/320px layouts. Run `python src/features/import/quick-equip.smoke.py` after building for synthetic dev/production-preview evidence; add `--url` for a deployed preview. Real customer reports remain private and require product-owner hands-on verification.

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

### T0010 — Treasure Mod Planner (accepted 2026-11-01)

T0010 was customer-accepted and squash-merged in [PR #22](https://github.com/Zaelious/GorgonBuilder/pull/22) at `385e4b9`. [Verification evidence](T0010_Verification.md) records 513 passing tests, GitHub Actions/Cloudflare checks, Chromium desktop/mobile smoke, and screenshots. Repeat these core checks for later regressions:

1. Choose Druid and Archery, equip a Sword-profile MainHand item. Verify Druid's 12 MainHand powers remain discoverable with **outside profile** eligibility caveats while Archery's 13 appear; Chest still shows 11 distinct Druid powers at Max and at level 100.
2. Move official treasure powers between Available and Selected; verify exact IDs/tiers, visually grouped blue Skill A and gold Skill B STATS, the complete readable fixed effects list and immediate update on removal.
3. Deselect the last occurrence of a combat skill: only mods officially associated with the departed skill clear, with Undo restoring the full prior draft. Generic, imported powers, Sparks, legacy OffHand and unresolved IDs remain protected.
4. With Acid Arrow 13 on the bar, stage MainHand Acid Arrow Damage +110%; inspect the compact ability popover for **529 Acid**, **529 Acid armor damage**, and the mod under **Relevant Mods**. Removing the mod immediately removes the relevant entry. Brambleskin retains duplicate relevant effects from different items.
5. Confirm technical zero-value or conditional DoT records are hidden from normal damage effects but retained in Technical details; nonzero published effects remain readable.
6. Test browser zoom 100% on desktop and 320/375px mobile; verify scroll, keyboard focus, no text overflow, and autosave/reload preserving exact source identities and selection ordering.

Published item treasure profiles are generation pools, not a complete legality engine. T0010 does not calculate damage or final equipment legality.

### T0010-F1 — Shared Equipment Mod Browser, Item Metadata and Clear Build (accepted 2026-11-02)

[PR #28](https://github.com/Zaelious/GorgonBuilder/pull/28) was product-owner accepted and squash-merged as `a1b2d6d` after 727 automated tests, lint/typecheck/build, green final-head GitHub Actions and Cloudflare PR-preview build. [Verification report, original browser screenshots and final cleanup details](../src/features/equipment/verification/T0010-F1.md). The initial implementation passed Chromium dev/preview checks at 1440/375/320px. The subsequent help-disclosure cleanup passed its focused component tests but **could not run the updated Chromium smoke** due to the execution environment blocking Chromium; retain keyboard/narrow-screen verification as a regression check.

1. Search `lightning` from the single shared Equipment mod search; switch among Head/Chest/Ring/Necklace. Shared search, categories, All skills, Other slots & profiles and target preview must persist while item-specific Available/Selected eligibility and flags remain correct.
2. Expand **Mod Browser Settings** and **How mod filtering works**. The guidance should be collapsed by default, occur once, be keyboard-operable, and never appear at the bottom of an item's mod editor. Verify wrapping at 375/320px.
3. Open database and imported gear: STATS and important warnings are immediately visible, while source levels, requirements, original powers/imbues and provenance remain under **Item details & source**.
4. Verify Max/90/100/custom previews do not alter selected candidate tiers, and do not change the independent minimum equipment level. Recheck edit/remove/restore of imported working powers against unchanged historical evidence.
5. Cancel **Clear build**: no draft or autosave change. Confirm: skills, both bars, gear, mods/Sparks, title/notes and target reset and persist after refresh. Browser preferences and in-page My Items inventory remain; protected/read-only drafts cannot reset.

### T0013-F1 combat coverage and Burst estimates (customer accepted and merged 2026-11-04)

Run `npm run coverage:treasure -- --check`; in [the report](treasure-coverage/README.md)
check that direct-damage coverage, other mechanics and validation confidence are separate,
that Generic/AnySkill rows are separate from skill rows, and inspect exact power/tier records.
Run the [verification procedure](T0013_F1_Verification.md). Plan a grammar-only bonus in
several unrelated skills (Archery `power_10201`, Staff `power_5003`, Unarmed `power_3007`,
AnySkill Core Attacks `power_153` on two skills): only named abilities change, the breakdown
names the exact attribute, and removing the mod restores the base. Compare working imported
versus planned sources and inspect excluded off-skill decisions.
For Mock 11 +43% and the 20 m conversion, test 1/5/6/7/8/9 enemies: the ×0.5
ability penalty is independent of falloff; only 6–8 show Estimated. Verify the
source link/equation in the collapsed breakdown and reachable Remove at mobile sizes.

### T0010-F2 — Shared mod search and public damage results (customer corrections pending acceptance)

[Verification, current screenshots and acceptance checklist](T0010_F2_Verification.md).

1. Equip database and imported items. Type rapidly and paste into Search mods: text responds immediately, with results settling after 190 ms. Clear during pending typing; stale results must not return. Check shared settings during a pending query.
2. Compare each row's **Available · Selected** counts with both visible lists. Search a staged or editable imported power that Available skill/category/profile filters exclude. Search unresolved saved IDs and tiers; their data must remain intact and unresolved imported working pairs read-only. Remove a visible filtered row and verify the original saved index is edited.
3. Toggle Show all, clear and refresh. Confirm equipment, working tiers, imported metadata and modifications survive. Verify nine primary rows and Other slots return, disclosure states survive filtering, and hidden/focused controls have usable focus recovery. Repeat in read-only builds and at 1440/375/320 px.
4. Inspect supported, partial and unavailable damage cases. Public views show truthful values/status, target controls and no internal breakdowns, inventories, source IDs, implementation assumptions or technical warning lists. Damage numbers must match the engine.
5. In development only, open `/?debugDamage=1`: inspect retained damage/secondary/unknown classification, source provenance, assumptions and full breakdowns. Production preview with the same flag must still show the simplified public view. Run the complete quality suite and six Chromium dev/preview viewport checks.

### T0008-F2 — Official ability roles, Relevant Mods and scoped variant grouping (planned)

1. Inspect Basic/Core/Nice/Epic and all five other supported ability-role labels in the picker and equipped ability details. Cross-check official keyword data; do not display conditional membership as unconditional.
2. Equip a Core/Nice/Epic/category bonus, verify it appears as relevant for the correct ability and contributes direct damage only when the existing engine has a supported hook. Excluded abilities remain unaffected. Healing/utility mods can be source-relevant without a fabricated damage/healing calculation.
3. For Vampirism Blood Mist, Animal Handling Call Stabled Pet, Bard SoD, Mentalism Mindworm, Necromancy SZ, Priest Triage and Priest Flamestrike, choose two different published variants/ranks. Confirm exact IDs, search, rank restrictions, selected markers, add/replace/removal and autosave. Other families remain unchanged.
4. Inspect regenerated T0013-F1 audit and tests separating truly unconditional from required-active-skill damage entries. Check 1440/375/320 px, keyboard and long-scroll behavior.

### T0013-F2 — Anatomy/Phrenology critical calculations (planned)

1. Import current CharacterSheet locally and inspect Anatomy/Phrenology creature subskills; ensure exported effective Level is not increased again by BonusLevels. Without import, enter manual values and verify the source distinction.
2. Compare at least two abilities using different supported critical systems and switch target creature types. Confirm inappropriate creature subskills do not affect chance and unknown systems remain unresolved.
3. Add/remove an applicable gear crit chance/crit damage bonus. Verify normal hit, critical damage, chance and expected successful-hit average, plus full provenance and formula confidence.
4. Repeat with no resolved import, unsupported ability, zero chance and high critical multipliers. Compare at least one controlled Project Gorgon test, explicitly recording any remaining assumptions.
5. Run pinned data checks, lint, typecheck, all tests, build and browser smoke.


T0010-F2 final clarification: the public view includes a default-collapsed **Damage breakdown** showing actual engine steps, individual named equipment/skill contributions, flat/percentage/Skill Base contributions, target multipliers and final hit/total. It contains numerical presentation only: no raw IDs, source paths, uncertainty/exclusion inventories, implementation assumptions or long explanations. Those diagnostics remain available only through the development `?debugDamage=1` view. Public `Partial` labels are replaced with `Estimated`; unavailable numbers remain `Unavailable`. No engine results or accepted mod-search/Selected-heading behavior change.
