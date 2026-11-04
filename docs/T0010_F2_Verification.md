# T0010-F2 — Final customer acceptance corrections

**Accepted and squash-merged 2026-11-04:** [PR #38](https://github.com/Zaelious/GorgonBuilder/pull/38), merge commit [`34d7cd73f948903ba602ad26bd21410efb1dbeab`](https://github.com/Zaelious/GorgonBuilder/commit/34d7cd73f948903ba602ad26bd21410efb1dbeab). Product owner approved the final responsive search and compact numerical public breakdown after manual retesting. Final reviewed PR head: `45ceb2a8b5e15524f604798fbbe81d72def23a15`.

## Search diagnosis and correction

The initial implementation called the complete selector for each equipment selection on every keystroke, rebuilding 1,947-power relevance maps (including profile membership scans), then rendering expanded mod trees. Each expanded ModPlanner also built its own text index. The input and this work shared the same synchronous update.

Typed text is now local to ModBrowserControls. A cancellable **190 ms** timer commits one effective query in a React transition; raw keystrokes do not render the equipment rows or run selectors. Clear cancels pending work and commits an empty query immediately. A pending query uses the latest settings. Unit tests verify 189/190 ms boundaries, rapid changes, paste-equivalent input, clear cancellation and no repeated profile lookups while changing queries.

One repository power index is shared with expanded planners. Relevance and text lookup maps are prepared by equipment definition IDs and active skills, independently of query, preview/category settings and working-mod edits. The pure selector still supplies all row counts and both lists.

## Available and Selected

Rows remain visible if either list matches. Counts read **N Available · M Selected**. Available preserves existing active-skill/category/slot/profile/exclusion semantics. Selected matches effective staged/planned and working existing pairs independently of all Available filters, including with no active combat skill. Known powers use the same official power text index; saved IDs and exact tiers remain searchable even when unresolved. Historical imported metadata never contributes matches or selections.

Selected rows retain original origin/index keys and edit indices; nonmatches are hidden without altering arrays. Unresolved imported/manual existing pairs are inspectable and read-only. Editable resolved imported pairs keep the existing edit semantics. Clearing restores the complete Selected list. Equipment, shared settings, Selected and Available power disclosures survive filtering. Adding a match moves it from Available to Selected and keeps the equipment row reachable; removing a last match can hide the row if it is not eligible for Available. Focus recovers to a visible control/search.

Max/90/100/custom levels still choose preview tiers, not power visibility or legality. Powers with no tier range at a target remain Available entries. Outside-profile uncertainty is unchanged. No search state is saved in BuildDocument v1.

## Public damage policy — clarified numerical breakdown

Per the final product-owner decision, public damage results show normal/supported values, critical values when supported (otherwise Unavailable), useful target/scenario controls, and concise **Estimated** or **Unavailable** status. A default-collapsed Damage breakdown shows the existing engine’s numerical steps and named individual sources, including original-base Skill Base contributions, target multipliers and final hits. Missing contributions never become validated values. Technical diagnostic steps, unsupported/unknown inventories, source/debug IDs, assumptions and technical warning lists are absent from the public DOM, including ability Technical details and provenance tooltips. Relevant Mod effect text and bar-edit controls remain available.

Complete engine aggregation, classification, calculation breakdowns, confidence, assumptions and provenance are unchanged. **Development opt-in:** open Vite dev at `/?debugDamage=1` and enable Damage analysis. Debug diagnostics are then available on demand. **Production ignores this flag**, including Vite preview. This is a presentation gate, not a permission/security boundary for the underlying local data. No new damage mechanics or numerical changes.

Tests retain diagnostic regressions in explicit debug mode and separately test public supported, incomplete/estimated and unavailable cases, including a production-mode gate. Representative Fire Arrow remains **96 Fire** (24 published base +72 from the modeled power). Taunt/reuse remain informational internally. Adding unsupported damage semantics does not change that supported number and keeps the result Estimated. A scenario with invalid net resistance shows Unavailable rather than a number.

## Verification

```sh
npm run data:update -- --check
npm run lint
npm run typecheck
npm test -- --maxWorkers=1 --testTimeout=15000
npm run build
npx wrangler deploy --dry-run --outdir .wrangler/dry-run
git diff --check
python src/features/equipment/mod-search.smoke.py --output /tmp/gorgonbuilder-t0010-f2-corrections
```

**Final results:** 1,042 tests passed in 51 files (33 added by T0010-F2 overall), with no skipped tests. Data integrity, lint, strict typecheck, build, Wrangler dry-run and whitespace checks passed. All six final Chromium scenarios passed with zero console errors, including Selected-only removal and focus recovery. Observed input event-to-frame times were 0.9–37.5 ms across the six runs. GitHub/Cloudflare final-head CI status is reported in PR #38's description and completion report. The restored public disclosure is checked default-collapsed and expandable, with named applied sources, no non-applicable rows or diagnostics, and final values equal to the displayed hit. The complete local suite uses one worker/15-second timeout for reliable resource use; existing transport tests and Chromium need local-server/runtime permissions. Wrangler requires its normal config/log directory. No deploy command without `--dry-run` is used. Remove only disposable `.wrangler/dry-run` output before another lint pass because the existing ESLint configuration scans that generated worker.

The Chromium script runs dev and production preview at **1440×900, 375×900 and 320×900**. It checks input responsiveness/rapid typing/paste/clear, both count/list invariants, filters and previews, imported/staged Selected discovery, add/remove/focus, read-only, saved state/refresh, public Damage breakdown and Estimated/Unavailable and the explicit dev-only debug gate. Per-input event-to-frame timings are recorded as environment observations, not a device performance guarantee.

[Machine-readable results](verification/t0010-f2/results.json).

| Mode | 1440 px | 375 px | 320 px |
| --- | --- | --- | --- |
| Dev search | [image](verification/t0010-f2/dev-1440-search.png) | [image](verification/t0010-f2/dev-375-search.png) | [image](verification/t0010-f2/dev-320-search.png) |
| Preview search | [image](verification/t0010-f2/preview-1440-search.png) | [image](verification/t0010-f2/preview-375-search.png) | [image](verification/t0010-f2/preview-320-search.png) |

Public damage: [desktop](verification/t0010-f2/preview-1440-damage.png), [320 px](verification/t0010-f2/preview-320-damage.png). Developer-only diagnostics: [dev](verification/t0010-f2/dev-1440-debug.png).

## Customer acceptance checklist

**Customer result:** Passed and approved for merge on 2026-11-04; review and final-head GitHub/Cloudflare checks passed. The below checks are retained as reproducible regression steps.

- [ ] Type rapidly, paste and clear during a pending query. Input remains responsive and stale text never changes results later.
- [ ] Search Available and Selected, including off-skill/outside-profile/category-disabled powers, imported working pairs, unresolved IDs/tiers and duplicate working occurrences. Compare separate counts with visible entries.
- [ ] Stage, remove and edit filtered selections: exact original indices/tiers update, metadata remains intact and read-only restrictions hold. Clear restores complete Selected lists.
- [ ] Check Show all, disclosure state, keyboard focus, refresh and 1440/375/320 px layouts.
- [ ] Confirm public damage values/status and target controls without internal diagnostics. Verify supported numbers remain unchanged and missing values remain Unavailable.
- [ ] Check the explicit debug URL in dev, and confirm production preview ignores it. Architect reviews and customer accepts before any merge.

## Files, boundaries and remaining risks

Search production changes: `src/data/search/available-mods.ts`, equipment planner integration, shared browser controls, ModPlanner/EquipmentMods, CandidateList and narrowly scoped mod styles. Search tests cover timing, cache reuse, independent Selected matching, original indices, unresolved/imported cases, disclosure/focus/state persistence and browser behavior.

Damage presentation changes: AbilityResults, AbilityFacts and RelevantMods diagnostic gates, `damage-debug.ts`, result status styling, TargetDummy explanatory text and App's Damage analysis help text. These small surrounding UI edits remove public debug IDs/tooltips/dangling accessibility descriptions and obsolete promises of public breakdowns. Existing diagnostic tests explicitly opt in; PublicDamageResults tests default/public behavior. No engine formula or source data changes.

Documentation aligns AGENTS UI guidance, Full Design, MVP Technical Design, T0010-F2 contract/manual guide and Known Issues with the product-owner correction. Historical accepted-ticket reports remain historical. Repo_Current_State should receive the final accepted PR/merge record only after acceptance/merge.

Classification remains conservative; unreviewed effects stay unresolved internally and cannot promote public confidence. Private export mapping and real-game formula validation remain customer work. Existing 322 px document width at 320 px from planner help is separate; equipment/search fit is checked. Screen-reader behavior is covered by semantic/keyboard checks rather than a dedicated assistive-technology session. No T0008-F2, T0013-F2, T0015, rotation/resource/control simulation, eligibility, import editing semantics, saved formats or persistence architecture work is included.


T0010-F2 final clarification: the public view includes a default-collapsed **Damage breakdown** showing actual engine steps, individual named equipment/skill contributions, flat/percentage/Skill Base contributions, target multipliers and final hit/total. It contains numerical presentation only: no raw IDs, source paths, uncertainty/exclusion inventories, implementation assumptions or long explanations. Those diagnostics remain available only through the development `?debugDamage=1` view. Public `Partial` labels are replaced with `Estimated`; unavailable numbers remain `Unavailable`. No engine results or accepted mod-search/Selected-heading behavior change.
