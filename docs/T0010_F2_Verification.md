# T0010-F2 — Equipment Mod Search Visibility and Damage Warning Relevance

Implementation branch: `feature/t0010-f2-mod-search-warnings`, based on current `main` at `f3e9372` (2026-11-04). Architect review and customer acceptance are pending. This ticket does not authorize merging.

## Behavior and boundaries

- `src/data/search/available-mods.ts` owns the pure Available selector: text index, published relevance, effective working/staged exclusions, slot/profile exploration and skill/category grouping. Equipment rows and ModPlanner consume its same result while searching; the standalone planner uses the same selector. Counts sum displayed Available power entries across legacy multiple selections in a display row.
- A nonempty normalized query hides zero-match display rows. Empty rows have zero Available entries. `Show all equipment` reveals them without changing their lists. Clearing the query restores nine primary rows, Other slots and the previous disclosure states. The override resets on clearing; changing a nonempty query retains the override.
- Rows stay mounted with `hidden`, preserving native disclosures, expanded editors and selected/imported powers. Search, settings and Show all remain transient. Staging the last match returns focus to search. Closing a picker whose replacement hides the opener also returns to search.
- Max/90/100/custom levels choose preview tiers, not which powers match. A power with no tier at the preview level still counts as one Available entry and retains its explicit no-range placeholder/details. Outside-profile eligibility uncertainty is unchanged; missing base definitions remain permissive.
- `warning-relevance.ts` classifies unsupported records for presentation as confirmed non-damage, unresolved damage-affecting or unknown. The audited exact power ID/InternalName/full-sentence rules qualify only when the corresponding modeled sibling drafts exist. Reusable grammar remainders qualify only if every clause has a reviewed non-damage meaning. Whole secondary-only sentences, reviewed official hooks and exact resource/reuse identities are also recognized. Unknown suffixes, conditions, missing mappings and ambiguous semantics continue to warn, including when ability association is unknown.
- Classified secondary records remain in aggregation and in Calculation breakdown with the original message, text, item/slot, power/tier, effect position and classification evidence. The old undifferentiated unsupported count is replaced in the UI. Formula confidence, assumptions, numerical results, ordering, Burst, source provenance and all saved formats are unchanged.

## Automated verification

Commands (from repository root):

```sh
npm run data:update -- --check
npm run lint
npm run typecheck
npm test -- --maxWorkers=1 --testTimeout=15000
npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
git diff --check
python src/features/equipment/mod-search.smoke.py --output /tmp/gorgonbuilder-t0010-f2
```

Final suite: **1,035 tests passed in 50 files** (26 added tests), including the replacement-focus regression (138.25 seconds with one worker). All six final Chromium scenarios passed, including the profile-changing picker focus case. Pinned data check, lint, strict typecheck, production build, Wrangler deploy dry-run and whitespace check passed. No tests were skipped in the successful full run. GitHub CI status is reported with the PR completion report.

The unrestricted default test worker pool did not complete reliably in this environment. A single worker and a 15-second per-test timeout execute the same complete suite. Chromium requires execution outside the default syscall sandbox; existing Vite transport tests also require local-server access. Wrangler dry-run requires access to its normal configuration/log directory. No deployment occurred. Remove only its disposable `.wrangler/dry-run` output before rerunning lint, because the repository's existing ESLint configuration also scans that generated worker.

Focused coverage includes empty/default layout, `core`, A/B and duplicate skills, all category combinations, All skills, Unknown, other slots/profiles, outside-profile powers, targets including no available preview tier, staged and working imported exclusions, missing item definitions, zero results, Show all/reset, preserved saved bytes, expansion, refresh, read-only, last-match focus and replacement-picker focus. Warning tests cover every published tier of the audited mixed-power allow-list, grammar-backed secondary remainders, Rage/resource/control/accuracy, unresolved damage, ambiguous suffixes, unknown attributes/required skills, accurate record counts, unchanged results/confidence and retained provenance.

## Browser evidence

Real headless Chromium, pinned v490 data, synthetic database/manual/imported builds. No private customer files. Dev and production preview at 1440×900, 375×900 and 320×900. Results: [machine-readable evidence](verification/t0010-f2/results.json).

The fixed fixture's default `core` results are Hands **1**, MainHand **1**, and Racial **5** (a manual item with unknown base definition). Counts equal expanded Available entries. Broadened settings, category toggles, duplicate-skill automated coverage, Max/90/100/125/0 previews, imported/staged exclusions, zero results, Show all, clear, keyboard focus, refresh and protected read-only behavior are checked.

Fire Arrow's published hit is **24 Fire**. The official damage+taunt power adds **72**, displaying **96 Fire**; the reuse power's separate Heavy Shot damage does not apply to Fire Arrow. Both secondary remainders remain inspectable, with no misleading build-wide damage warning. Adding official `power_4002/id_9` preserves **96 Fire** and produces the qualified unknown-relevance warning. Formula confidence remains unchanged. Real game formula measurements are not claimed.

Screenshots:

| Mode | 1440 px | 375 px | 320 px |
| --- | --- | --- | --- |
| Development, filtered equipment | [image](verification/t0010-f2/dev-1440-search.png) | [image](verification/t0010-f2/dev-375-search.png) | [image](verification/t0010-f2/dev-320-search.png) |
| Production preview, filtered equipment | [image](verification/t0010-f2/preview-1440-search.png) | [image](verification/t0010-f2/preview-375-search.png) | [image](verification/t0010-f2/preview-320-search.png) |

Damage breakdown: [desktop](verification/t0010-f2/preview-1440-damage.png), [320 px](verification/t0010-f2/preview-320-damage.png). The narrow breakdown has bounded scrolling; details remain reachable.

The equipment section fits all viewports (at 320 px its right edge is 304 px). The document still measures 322 px at a 320 px viewport, matching the pre-existing planner-help issue documented in Known Issues. No unrelated global style change is included. Browser console errors: zero in all completed scenarios.

## Customer acceptance checklist (pending)

- [ ] On the PR preview, equip several items and choose two combat skills; search `core` and compare each count with expanded Available powers.
- [ ] Toggle Generic/Endurance/Shamanic, All skills, Other slots & profiles and Max/90/100/custom preview. Verify outside-profile flags and the no-range preview behavior.
- [ ] Show all: inspect an equipped row with zero matches and its existing/imported/staged powers. Toggle back and clear; verify nine primary rows, Other slots and prior open state.
- [ ] Use real local imported items. Edit/stage powers deliberately, search/change/clear, refresh and verify exact working tiers, instance metadata and equipment survive.
- [ ] Use keyboard and 1440/375/320 px layouts; add the last matching power and replace gear so its matching profile changes. Verify focus, controls and read-only behavior.
- [ ] Inspect damage+taunt/reuse/Rage powers: damage still contributes, secondary-only records are informational in the breakdown. Inspect genuine unsupported/ambiguous damage and verify a qualified warning remains.
- [ ] Architect reviews conservative classification boundaries and count/list parity; approve the PR separately. Do not merge automatically.

## Changed files

Production: `src/data/search/available-mods.ts`; `src/features/equipment/{EquipmentPlanner.tsx,EquipmentPicker.tsx,equipment.css}`; `src/features/mods/{EquipmentMods.tsx,ModPlanner.tsx}`; `src/core/calculation/warning-relevance.ts`; `src/features/abilities/AbilityResults.tsx`.

Tests: `src/data/search/available-mods.test.ts`; `src/features/equipment/EquipmentModSearch.test.tsx`; `src/core/calculation/warning-relevance.test.ts`; `src/features/abilities/{AbilityWarningRelevance.test.tsx,AbilityResults.test.tsx}`; `src/features/equipment/mod-search.smoke.py`.

Documentation: this report, the T0010-F2 ticket status and manual-guide link, plus screenshots/results under `docs/verification/t0010-f2/`.

## Risks, assumptions and follow-ups

Classification is deliberately conservative: unreviewed source meanings continue to warn. Changes in published wording may require a later reviewed classification update. This work does not prove equipment legality or validate damage formulas. Private customer import validation remains hands-on; screen-reader behavior is checked through semantic/keyboard behavior, not a dedicated assistive-technology session.

No new out-of-scope implementation. Existing 320 px global overflow, duplicate-skill level synchronization, actual game stacking/order, broader stateful mechanics and other existing Known Issues remain separate. T0008-F2, T0013-F2 and T0015 are untouched.

After acceptance/merge, update `docs/Repo_Current_State.md`, `docs/Tickets.md`, `docs/Manual_Verification_Guide.md` and the T0010-F2 entries in `docs/Known_Issues_And_Followups.md` with the accepted PR/commit and customer result. They must not mark this branch merged or customer-accepted before that occurs. No baseline design changes are required.
