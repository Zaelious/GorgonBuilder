# T0014-F1 — Stampede Stacking and Chance-Based Damage Proc Scenarios

**Status:** Implemented for review, 2026-11-05. No Project Gorgon measurements or product-owner acceptance are
claimed. Stack/proc formula placement and cross-mod behavior remain **Estimated**.

**Repository:** `Zaelious/GorgonBuilder`

**Branch:** `feature/t0014-f1-stampede-procs`

**Base:** latest `main`, `a814bfc3dabd95cb0a37f02f02d566fe98eecd70`, confirmed by GitHub and `git fetch origin main`.
PR #40's Anatomy/Phrenology implementation is preserved. No merge, T0015, saved-schema, import-parser or source-pin
change is included.

## What changed

- **Current Stampede stacks:** 0–15, default 0, visible only with an applicable equipped Continuous Trampling
  effect on Stampede. Current stacks describe the state **before** this attack; zero is the pre-stack first attack.
  Effective working powers and planned mods contribute separately at their exact selected tiers; historical import
  metadata contributes nothing. The value survives this browser session in `sessionStorage`, outside BuildDocument v1.
- **Ordinary versus projected damage:** ordinary zero-stack hits remain visible. Each source contributes
  `current stacks × per-stack value`. Derived flats run through `calculateAbilityDamage` and `applyTargetDummy`;
  projected steps appear in the existing collapsed numerical Damage breakdown alongside ordinary modifiers.
- **Random direct-damage procs:** retain unconditional damage in the ordinary formula once, then show a separate
  chance, triggered hit and expected damage per successful **noncritical** hit. Double/+X% effects provisionally
  multiply the final ordinary hit. Flat procs recalculate through the ordinary formula and target stage.
- **Multiple/unsupported sources:** each supported source keeps tier, probability, effect and provenance. Combined
  probability/hit/expectation are Unavailable for duplicates or an applicable audited unresolved effect. Isolated
  source outcomes are labeled Source-only in the breakdown; no independent-roll or summed-probability model is used.
- **Critical separation:** `calculateCriticalHit` remains an independent stage on the ordinary hit. Its chance,
  multiplier, critical hit and expectation are not blended with random procs. No timeline, stack buildup, expiration,
  cooldown, rotation, DPS, pet or DoT calculation was added.
- **Presentation:** compact rows and select, named per-source numerical details, Estimated/Unavailable status;
  assumptions, exclusions and raw identities remain development-only under `?debugDamage=1`. Scenario mods now say
  “Damage scenario” in Relevant Mods instead of misleadingly claiming they were not calculated.

## Exact source support

The [separate audit](treasure-coverage/T0014-F1.md) and
[all 150 selected-tier mappings](treasure-coverage/T0014-F1-scenarios.json) record full official wording, identities,
slots, ability hooks, probabilities and values. All six powers have 25 tiers.

| Exact power | InternalName | Supported scenario |
|---|---|---|
| `power_20004` | `CowStampedeStackingAdd` | of Continuous Trampling; +4…+65 per current stack; cap 15, published 60 seconds |
| `power_4062` | `StrikeANerveCrit` | Strike a Nerve +4…+100 ordinary; 33% double damage |
| `power_21023` | `DeerBashCrit` | Deer Bash +5…+125 ordinary; 20%/24% for +20%…+164% |
| `power_22085` | `PigRendCrit` | Pig Rend +10%…+50% ordinary; 15% for +100%, direct hit only |
| `power_28124` | `SpiritBoltCrit` | Spirit Bolt +6…+150 ordinary; 50% for +10%…+82%, direct hit only |
| `power_20003` | `CowFrontKickCritAdd` | Cow Front Kick, 66% for +12…+204 flat damage |

The four historical `side-clause:random-bonus` powers/100 tier entries are all represented. New reporting adds 25
Cow Front Kick flat-proc tiers and 25 Stampede tiers. Historical T0014/T0013-F1 snapshots, counts and denominators
remain byte-identical; “scenario mapped” is deliberately separate from “validated game mechanic.”

## Numerical fixtures

These are synthetic source-isolation builds using official identities, not legal-gear assertions or measured game
values. They omit unrelated innate effects, advancement rewards, buffs and Sparks.

| Scenario | Ordinary | Contribution / chance | Projected / triggered | Expected per successful hit |
|---|---:|---|---:|---:|
| Stampede 12 `ability_6138`, one `power_20004/id_20`, 0 stacks | 208 | 0 × 50 = 0 | 208 | — |
| Same, 1 stack | 208 | 1 × 50 = 50 | 258 | — |
| Same, 15 stacks | 208 | 15 × 50 = 750 | 958 | — |
| Add Hands `id_25`, 15 stacks | 208 | Chest 750 + Hands 975 = **1,725** | **1,933** | — |
| Replace Chest `id_20` with `id_1` (+4), 15 stacks | 208 | (4 + 65) × 15 = 1,035 | 1,243 | — |
| Remove Hands, keep Chest `id_1`, 15 stacks | 208 | 4 × 15 = 60 | 268 | — |
| Strike a Nerve 8 `ability_1298`, `power_4062/id_25` | **530** = 430 + 100 once | 33%, ×2 | **1,060** | **704.9** |
| Documented synthetic Strike-like final hit | 1,000 | 33%, ×2 | 2,000 | **1,330** |
| Deer Bash 1, `power_21023/id_12` | 82 = 22 + 60 | 20%, +86% | 152.52 | 96.104 |
| Deer Bash 1, `id_13` | 87 = 22 + 65 | 24%, +92% | 167.04 | 106.2096 |
| Cow Front Kick 10, `power_20003/id_1`, 20% vulnerability | 494.4 = 412 × 1.2 | 66%, +12 before target | 508.8 | 503.904 |

For one proc: `expected = ordinary × (1 − probability) + triggered × probability`. This is an expected amount per
successful hit, not DPS. With Strike's proc equipped and Human Phrenology 48, separate critical values remain
8%, ×1.25, 662.5 critical and 540.6 critical-only expected; these are not combined with 704.9.
Synthetic tests also cover 0%/100%, target/Burst totals and original-base Skill Base with stacked flats.

## Automated verification

| Command | Result |
|---|---|
| `npm ci --cache /tmp/gorgonbuilder-npm-cache` | Passed, 207 packages; no dependency or lockfile change |
| `npm run data:update -- --check` | Passed; all 13 pinned v490 datasets validated |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed; also runs in the production build |
| `npx vitest run src/core/calculation src/features/abilities/DamageScenarios.test.tsx --maxWorkers=2` | 338 passed / 12 files (326 core + 12 new UI tests) |
| `npx vitest run src/core/calculation src/features/abilities --maxWorkers=2` | 390 passed / 21 files after the final scenario-label presentation correction |
| `npm test -- --maxWorkers=2 --testTimeout=20000` | **1,146 passed / 58 files**, including 50 new tests |
| `npm run coverage:treasure -- --check` | Passed; historical reports byte-identical, combat direct coverage still 59.64% |
| `npm run build` | Passed; Vite reports a nonblocking main-chunk warning (~506 kB minified) |
| `npx wrangler deploy --dry-run --outdir .wrangler/dry-run` | Passed; 19 static assets, no upload/deployment |
| `git diff --check` | Clean |

The focused tests cover 0/1/15 stacks, two exact tier values, tier replacement, working-existing versus planned
sources, source removal/unequipping, another Cow ability, unrelated skills, zero-stack identity, ordinary +100 once,
all four audited proc families plus flat procs, probabilities including 0%/100%, duplicates and unsupported AoE,
condition/version guards, unavailable target/base values, split flat allocation, true Burst per-target/total values,
critical invariance, deterministic input preservation, session validation and immediate UI recalculation.

Environment notes: shell networking required the runtime's network permission; an initial unpermitted install/fetch
failed, then both succeeded through the configured proxy. Wrangler's default configuration directory was not
writable; the successful dry-run used `WRANGLER_LOG_PATH=/tmp/gorgonbuilder-wrangler.log` and
`XDG_CONFIG_HOME=/tmp/gorgonbuilder-config`. Its generated `.wrangler/dry-run` directory was removed after the check
so ESLint does not scan the generated no-op worker. These are execution-environment changes, not source changes.

## Real Chromium checks

Run after building, with a locally available Playwright/Chromium installation:

```sh
NODE_PATH=/opt/codex/cua_node/lib/node_modules CHROMIUM_PATH=/usr/bin/chromium \
  node src/features/abilities/damage-scenarios.smoke.mjs --mode dev --local-icons 1 --output docs/verification/t0014-f1
NODE_PATH=/opt/codex/cua_node/lib/node_modules CHROMIUM_PATH=/usr/bin/chromium \
  node src/features/abilities/damage-scenarios.smoke.mjs --mode preview --local-icons 1 --output docs/verification/t0014-f1
```

Both modes passed at **1440 × 900, 375 × 812 and 320 × 812**. Each run uses a clean manual build with no import:

- Keyboard-focusable select, 0 → 1 → 15 stacks, unchanged saved BuildDocument and ordinary hit.
- Add the second Continuous Trampling source through the actual **Available → Selected** editor, exact selected tier
  replacement, removal, another Cow ability, and removal of the final source.
- Strike a Nerve ordinary/proc/expected results, duplicate source Unavailable, removal back to 430, and unchanged
  critical probability throughout; a second clean Deer Bash scenario verifies its tier-specific 24%/+92% result.
- Collapsed numerical breakdown, both stack contributions, public/debug gating in dev/production, session reload,
  reachable Remove action and bounded popovers.
- Zero application console/page errors with local icon responses. No added document overflow: 1440→1440, 375→375,
  320→322. The 2 px planner-help overflow at 320 is documented on main since T0013-F1; it is unchanged.

**Browser limitation:** initial external game-icon requests failed `ERR_CERT_AUTHORITY_INVALID` because Chromium
did not trust the environment proxy certificate. Automatic review rejected persistently trusting that CA, since it
would broaden future TLS trust without explicit authorization. No trust setting was changed. The successful smoke
uses the explicit `--local-icons 1` option to answer only game-icon requests with deterministic local placeholders;
TLS verification stays enabled. Application scripts, official compressed data and CSS are served normally from Vite.
This verifies real-browser application behavior/layout, not CDN icon transport or a remotely deployed preview.
Omit the flag in an environment with normal CDN access.

| Evidence | Desktop | 375 px | 320 px |
|---|---|---|---|
| Production, one Stampede source | [image](verification/t0014-f1/preview-1440-stampede-one.png) | [image](verification/t0014-f1/preview-375-stampede-one.png) | [image](verification/t0014-f1/preview-320-stampede-one.png) |
| Production, two sources | [image](verification/t0014-f1/preview-1440-stampede-two.png) | [image](verification/t0014-f1/preview-375-stampede-two.png) | [image](verification/t0014-f1/preview-320-stampede-two.png) |
| Production, proc and critical separation | [image](verification/t0014-f1/preview-1440-proc.png) | [image](verification/t0014-f1/preview-375-proc.png) | [image](verification/t0014-f1/preview-320-proc.png) |

Machine results: [development](verification/t0014-f1/dev-results.json),
[production preview](verification/t0014-f1/preview-results.json). Matching development screenshots are in the same
directory. Final screenshots were inspected at mobile widths as well as checked geometrically by the smoke.

## Product-owner checklist

1. Enable Damage analysis without importing. Choose Cow + Stampede and one Chest/Hands **of Continuous Trampling**
   mod. Set **Current Stampede stacks** to 0, 1 and 15; check the ordinary baseline and projected hit separately.
2. Equip a second copy at a different exact tier. At tiers 20 (+50) and 25 (+65), the projected stack flat bonus at
   15 is +1,725. Expand Damage breakdown and see both named contributions; actual totals also include other gear.
3. Remove a contributing mod, replace its selected tier, then remove the final copy. The projection decreases and
   the last removal hides the stack control. Another Cow attack gets no stack bonus.
4. Choose Psychology + Strike a Nerve. Equip `power_4062/id_25` (of Aneurysms, Chest/Hands): ordinary hit gains +100
   once, proc chance is 33%, triggered hit is twice the ordinary hit, and proc-only expectation is 1.33× ordinary.
5. Remove the mod: proc rows disappear and ordinary damage reverses. With two copies, combined results must say
   Unavailable, while source-specific values stay visible in Damage breakdown.
6. Try Deer Bash with Lucky Basher's `power_21023/id_13`: ordinary +65, 24% chance for +92% damage. Tier 12 instead
   gives +60, 20%, +86%. Only the matching ability changes.
7. Record a Human Phrenology/Anatomy scenario on an unrelated ability before and after these edits. Its critical
   chance/multiplier and ordinary result stay unchanged. Check all three layouts and reload for session retention.

### What to measure in Project Gorgon

Record game version, exact ability/rank, both skill levels, exact powers/tiers, Sparks/buffs and the same repeatable
target before changing one input at a time. Keep normal, critical, random-proc and simultaneous critical/proc hits
in separate combat-log groups.

- **Stampede:** measure a first attack with no existing stack, then attacks at known 1 and 15 pre-existing stacks.
  With one source, determine the per-stack increment, cap and expiration; then repeat with two different tiers to
  distinguish summed contributions, independent stack counts, strongest-only behavior and caps. Do not infer timing
  from this UI. Isolate a non-base percentage and a Skill Base source to determine whether either scales stack flats.
- **Multiplier procs:** compare ordinary versus triggered Strike a Nerve and Deer Bash hits with no other relevant
  modifiers, then with isolated flats, percentages, Skill Base and target vulnerability. This distinguishes a final-hit
  multiplier from original-base or category-local extra damage, and identifies rounding/order.
- **Flat procs:** compare Cow Front Kick's ordinary and triggered delta before/after adding one percentage and one
  target modifier. Determine whether the extra flat is scaled at the modeled stages.
- **Duplicates and criticals:** only controlled observations can establish shared/independent rolls, probability
  stacking, simultaneous triggers, critical interaction/order and a joint expectation. A few hits do not validate a
  probability: use hundreds of trials, record counts and uncertainty, and do not promote confidence on synthetic tests.

## Files and follow-ups

- Calculation: `modifiers.ts`, `aggregate.ts`, `treasure-effect-rules.ts`, new `scenario-treasure-rules.ts` and
  `damage-scenarios.ts`, exports/README, and `treasure-coverage.ts` snapshot exclusion.
- Ability UI: `AbilityResults.tsx`, new `DamageScenarios.tsx`, `RelevantMods.tsx`, `results.css`.
- Session state: new `src/persistence/local/stampede-scenario.ts` only; no app-state/schema/import edits.
- Tests/evidence: `damage-scenarios.test.ts`, `DamageScenarios.test.tsx`, `damage-scenarios.smoke.mjs`, 18 screenshots
  and 2 result JSON files, separate 150-tier audit JSON/Markdown.
- Documentation: this report, `Tickets.md`, `Repo_Current_State.md`, `Manual_Verification_Guide.md`,
  `Known_Issues_And_Followups.md`, calculation README and separate coverage report.

Follow-ups are measured stack/multiplier/flat ordering, duplicate proc behavior, joint critical/proc mechanics, and
the exact adjacent families named in the audit. Allocation/conversion remains the separate T0013-F3 candidate;
timed events, random target conversions, pets/DoTs and T0015 Sparks were not implemented. The main chunk warning and
pre-existing 320 px overflow remain separate performance/layout work. Acceptance/merge requires its own review;
this ticket opens a PR without merging it.


## T0014-F1-R1 — While Stunned

Continues the existing branch and PR #41. No new branch/PR, merge, schema/import change or T0015 work.
Exact source: **power_20020 / CowStampedeVsStunned**, official **Necklace** slot. Full sentence:
“Stampede deals +N% damage if used while you are stunned.” The condition is the **player**, not the target.
Previously retained as unsupported conditional prose; no existing numeric rule applied it.
The Cow wiki reference describes an Epic Necklace with +1300% at level 125. Pinned v490 specifies Rare minimum
rarity at tiers 1–7 and Epic at tiers 8–25. Tier 25 has minimum/skill prerequisite level 125 and maximum level 140.
No live wiki fetch or in-game measurement establishes formula ordering.

| Exact tier | Published bonus | Minimum rarity |
|---|---:|---|
| `id_1` | +100% | Rare |
| `id_2` | +150% | Rare |
| `id_3` | +200% | Rare |
| `id_4` | +250% | Rare |
| `id_5` | +300% | Rare |
| `id_6` | +350% | Rare |
| `id_7` | +400% | Rare |
| `id_8` | +450% | Epic |
| `id_9` | +500% | Epic |
| `id_10` | +550% | Epic |
| `id_11` | +600% | Epic |
| `id_12` | +650% | Epic |
| `id_13` | +700% | Epic |
| `id_14` | +750% | Epic |
| `id_15` | +800% | Epic |
| `id_16` | +850% | Epic |
| `id_17` | +900% | Epic |
| `id_18` | +950% | Epic |
| `id_19` | +1000% | Epic |
| `id_20` | +1050% | Epic |
| `id_21` | +1100% | Epic |
| `id_22` | +1150% | Epic |
| `id_23` | +1200% | Epic |
| `id_24` | +1250% | Epic |
| `id_25` | +1300% | Epic |

All 25 exact full templates map to `stampede-stunned-percent`, with official Cow skill scope and
`MOD_ABILITY_STAMPEDE` through `AttributesThatModDamage`. This scenario input never adds ordinary damage.
An applicable equipped source exposes the default-off **While Stunned** checkbox. Session storage key
`gorgonbuilder.session.stampede-while-stunned` accepts only literal boolean true; invalid/missing inputs default off.
No actual combat status is inferred. Removing the source hides its control and contribution.

When enabled, the source becomes an ordinary `ability-damage-percent` modifier in the existing engine, retaining
its exact Necklace/tier provenance. Stack flats and target stages are reused; other non-base percentages add on
the same base-plus-flats basis, and Skill Base stays on original published base. Combined and stack-only projections
are distinguished from the ordinary baseline. The numerical breakdown shows the Necklace, selected percentage,
percentage contribution, separate stack flats and final projection. Both formerly hardcoded Estimated headers now
follow scenario.status, including Unavailable projections (tested using >100% net target resistance).

**Estimated:** ordering, cross-mod stacking, caps and rounding remain unmeasured. Multiple stunned sources follow
the existing additive percentage convention provisionally. No final-hit ×14 shortcut is used.

Synthetic Stampede 12 example: base 208, Chest +50/stack, Hands +65/stack, tier-25 Necklace +1300%:

| Current stacks | While Stunned | Stack-only | Combined |
|---:|---|---:|---:|
| 0 | Off | 208 | 208 |
| 15 | Off | 1,933 | 1,933 |
| 0 | On | 208 | 2,912 |
| 15 | On | 1,933 | 27,062 |

These isolated values happen to equal 14× stack-only damage. Add another +50% ability bonus and +50% Skill Base:
`1933 × 14.5 + 208 × 0.5 = 28,132.5`, demonstrating why a universal final-hit multiplier is incorrect.
Tier 1 instead grants +100%, producing 416 from a naked 208 baseline. All figures are synthetic, not game validation.

New tests cover all exact tiers/rarities; no source, unchecked, enabled, tier replacement and removal; all four
stack/stun combinations; unrelated abilities; other percentage/original-base behavior; checkbox session restore and
invalid values; and unavailable labels. Existing proc/Anatomy/Phrenology tests remain regression coverage.

Manual check: equip Cow/Stampede and this Necklace, toggle While Stunned at 0/15 stacks, replace the exact tier,
then remove the Necklace. Verify ordinary and stack-only values stay independent. Expand Damage breakdown for
the Necklace percentage/contribution and each stack source. Reload for session retention; inspect another Cow
ability (no checkbox) and unchanged critical/proc fixtures. In game, isolate normal/stunned hits with/without stack
flats, another percentage and Skill Base. Measure ordering, caps, rounding and duplicate behavior before validation.

Changed files: scenario category/rule/stage, ability results/Relevant Mods/CSS, session utility, calculation/UI tests,
browser smoke/evidence and this appendix. Original 150-tier F1 audit remains historical; R1 adds 25 mappings separately
(175 scenario tiers total). No unrelated conditional ability family was implemented.

R1 check commands: `npm run data:update -- --check`, `npm run lint`, `npm run typecheck`,
`npx vitest run src/core/calculation/stampede-stunned.test.ts src/features/abilities/DamageScenarios.test.tsx --maxWorkers=1 --testTimeout=20000`
(**29 passed**), `npm test -- --maxWorkers=2 --testTimeout=20000`,
`npm run coverage:treasure -- --check` (historical reports unchanged), `npm run build`, Wrangler dry-run and
`git diff --check`. Build still reports a nonblocking ~509 kB chunk warning.
An initial regression fixture used target count zero, which leaves a valid single-target hit in the established
engine; it was corrected to invalid net resistance. A broad focused run hit the default 5-second timeout under
concurrent verification load; the focused R1 run passed with the established 20-second timeout. No damage or test
framework behavior was changed to accommodate these execution issues.

Chromium dev and production preview both passed at 1440×900, 375×812 and 320×812 with the new checkbox,
keyboard Space toggling, 0/15-stack combined values, refresh restoration, actual mod edits and critical/proc
regressions. Zero application console/page errors with the existing local-icon test option; no added overflow,
and Remove remains reachable. The main scenario checks show 13,412 for one +50 stack mod at 15 stacks while
stunned; separate core tests check two mods at 27,062. These tests do not measure game mechanics.

Evidence: [dev results](verification/t0014-f1-r1/dev-results.json),
[preview results](verification/t0014-f1-r1/preview-results.json),
[desktop stunned](verification/t0014-f1-r1/preview-1440-stunned.png),
[375 px stunned](verification/t0014-f1-r1/preview-375-stunned.png),
[320 px stunned](verification/t0014-f1-r1/preview-320-stunned.png).

Final R1 results: **1,164 tests passed across 59 files**, including 29 focused R1/scenario UI tests. Pinned-data,
lint, typecheck, historical coverage, build, Wrangler dry-run and diff checks passed. Both Chromium modes passed
all three viewports. GitHub CI for the new commit is checked separately at handoff; prior-head approval does not
validate this correction's game formulas. PR #41 remains open for product-owner review.
