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
