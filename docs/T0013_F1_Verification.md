# T0013-F1 — Combat Treasure Effect Coverage and Burst Estimate

Implemented for customer review; **not merged and not game-math accepted**.
Base: latest `main` at `160b073` (PR #35), branch
`feature/t0013-f1-combat-treasure-coverage`. No private character data was used.

## Outcome and coverage

The [reproducible report](treasure-coverage/README.md) inventories **all 1,947 powers,
45,634 tiers and 52,039 effect entries**, with exact IDs/InternalNames, source text,
attributes/DisplayTypes/hooks, conditions, before/after calculation support and reasons.
All **35 official combat skills / 4,089 associated abilities** are represented;
seven skills have no published positive direct hit and receive explicit absent fixtures.
Combat-associated powers comprise **1,613 powers / 34,276 tiers / 35,330 entries**.

The primary damage denominator is **21,808 combat-associated effect entries**, after
excluding unrelated non-damage/defense effects. Each published tier/effect occurrence
counts once. Generic/AnySkill and noncombat associations are inventoried separately;
they are never counted repeatedly across skills. Relevance screening is an auditable
conservative classification, not exhaustive human interpretation or executable prose.

| Measure | T0014 before | T0013-F1 after |
|---|---:|---:|
| Fully modeled effects | 4,914 | 4,979 |
| Partially modeled effects | 176 | 1,029 |
| Unmodeled effects | 16,718 | 15,800 |
| **Full coverage** | **22.53%** | **22.83%** |
| Any contribution (full or partial) | 23.34% | 27.55% |

**918 previously unmodeled combat entries across 40 powers gain support.** Full
coverage intentionally gives no credit to partial entries. Inventory completeness
is 100% of published entries; calculation completeness is not. A working numeric
contribution still uses the existing assumed stacking/order, not a newly validated
combat formula. The report includes the required 35-row per-skill table.

## Implementation and boundaries

- `keyword-damage.ts` reads official static keyword damage hooks for attack families
  across skills. All required keywords must match; excluded/conditional keywords,
  active-skill-gated rules and effect-gated rules are not activated. Direct and
  keyword hook membership is unioned; a modifier contributes once. DoTs do not
  inherit hit hooks.
- `direct-treasure-rules.ts` contains **38 audited exact power/template definitions across 16 skills**
  sharing one flat/percentage implementation. Each requires ID, InternalName,
  full sentence, official attribute DisplayType and exact skill/hook. Conditional
  suffixes, renamed powers and unrecognized wording fail closed. Secondary taunt,
  reuse, resource, accuracy, control and Rage clauses remain unsupported source
  records. No arbitrary English expression becomes executable math.
- Existing skill flat/percent, All Direct, damage-type direct, original-base Skill
  Base and the two Mock curated examples remain. No new damage-type conversions,
  pet/DoT/critical/proc simulation, Sparks or saved-build schema fields were added.
- Existing imported working powers and independently planned candidates retain exact
  source identity. Historical imported evidence is never an extra modifier. Tests
  exercise removal and scope exclusion; duplicate conversions still yield no value.
- Build-wide unsupported effects are labeled **Across build**, with unknown relevance
  to the displayed ability. The UI keeps analysis off by default, session preferences,
  compact popovers, Relevant Mods and expandable math.

One intentional baseline change has direct source evidence: Cow Front Kick
`ability_6124` has the official `CoreAttack` keyword; `abilitykeywords` connects it
to `BOOST_ABILITY_COREATTACK`. The fixture's MainHand fixed +244 bonus was previously
omitted. The preview changes 1282.4 → **1526.4**; changing only imported
`power_20006/id_9` to `id_8` still removes exactly **12** (1526.4 → 1514.4).
Historical T0013 reports remain historical; this is not a new live-game measurement.

## Burst behavior and assumptions

Official endpoint source: [2024-07-30 game update](https://wiki.projectgorgon.com/wiki/Game_updates/2024-07-30).
`linearDirectBurstEstimate` is an isolated replaceable policy. At 20 m, the full
threshold is `3 + floor(20 / 10) = 5`; the interpolation is
`1 - (enemies - 5) * (0.75 / (9 - 5))`.

Mock 11 base 178, `power_4066/id_20` (+43%) and `power_4032/id_18` (×0.5, 20 m):

| Enemies | Retention | Per target | Total | Falloff classification |
|---:|---:|---:|---:|---|
| 1 | 100% | 127.27 | 127.27 | Documented full |
| 5 | 100% | 127.27 | 636.35 | Documented full |
| 6 | 81.25% | 103.41 | 620.44 | **Estimated** |
| 7 | 62.5% | 79.54 | 556.81 | **Estimated** |
| 8 | 43.75% | 55.68 | 445.45 | **Estimated** |
| 9 | 25% | 31.82 | 286.36 | Documented floor |

Display rounding only; full-precision totals are calculated before formatting.
Documented refers to the Burst endpoints, not the entire assumed gear formula.
The ability ×0.5 penalty is separate and applies at every enemy count. The UI
shows Estimated on affected hits/totals and the equation/source inside the breakdown.

A radius remainder retains the probability of an extra full-damage target; no roll
or expected falloff is invented. At 25 m, affected intermediate counts remain
unavailable; the nine-target floor is safe because both possible thresholds are
below nine. At 60 m, nine targets retain full damage and larger counts remain
unsupported. Missing/invalid radius or unknown delivery cannot establish a floor.
Indirect/DoT totals remain unavailable even where their documented floor is known.

## Automated and browser evidence

| Command | Result |
|---|---|
| `npm ci --cache /tmp/gorgonbuilder-npm-cache` | Passed, 207 packages; default cache was unwritable |
| `npm run data:update -- --check` | Passed, all 13 pinned v490 datasets |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | **973 passed / 45 files** |
| `npm run build` | Passed |
| `npm run coverage:treasure` and `npm run coverage:treasure -- --check` | Passed, deterministic byte equality |
| `git diff --check` | Clean |
| Burst browser smoke / existing scroll smoke | 18 scenarios / four viewports passed |
| `CHROMIUM_TRUST_HOME=/tmp/t0013-chromium-trust python src/test/vite-transport.smoke.py` | Passed dev + production preview, all compressed hashes, corruption/retry and planner persistence |

The initial unbounded/default-timeout test runs exceeded 5 seconds in existing
UI/data tests under shared environment load; a timed-out UI case also contaminated
a following case. The complete final run uses bounded workers and a 15-second
per-test timeout, with localhost permissions for transport tests. No assertions
were removed or production behavior altered for these environmental timeouts.
The focused numeric regressions and every published curated tier pass.

The new browser smoke passed **18 scenarios** at **1440×900, 375×812 and 320×812**:
1/5/6/7/8/9 enemies, numeric hit/total values, Estimated labels only at 6–8,
independent ×0.5, equation disclosure, viewport-bounded card, reachable Remove,
analysis default-off/session persistence, Relevant Mods and no runtime page errors.
[Results](verification/t0013-f1/results.json).

The existing `popover-scroll.smoke.mjs` passed at **1440×900, 1920×1080,
375×812 and 320×812**: wheel progression, bottom/Remove hit testing, preserved
scroll after page movement, Escape. [Results](verification/t0013-f1/scroll-results.json).
It now accepts `CHROMIUM_PATH` for the environment's installed browser, without adding
an application dependency.

Screenshots: [desktop](verification/t0013-f1/1440-estimated.png),
[375 px](verification/t0013-f1/375-estimated.png),
[320 px](verification/t0013-f1/320-estimated.png).

**Pre-existing browser limitations:** at 320 px, `.planner-help` extends page width
to 322 px on both untouched `main` and this branch. The changed card stays bounded.
[Baseline comparison](verification/t0013-f1/baseline-overflow.json). The older Vite
transport smoke assumed quick-add closes the picker; T0008-F1 deliberately keeps
it open. The harness now explicitly closes it between bars, preserving accepted
product behavior. Both dev and production-preview runs then passed, including
compressed hash checks, all corrupt-response rejection/retry cases and saved-build
round trips ([results](verification/t0013-f1/transport-results.json)). Chromium
used the documented temporary NSS trust store for the injected environment CA;
HTTPS verification remained enabled.

## Customer acceptance and follow-ups

1. Inspect the full per-skill table and a few exact source entries. Review partial
   classifications separately from full support; compare the before/after profiles.
2. Compare controlled gear deltas in Psychology, Cow/Unarmed, and at least three
   unrelated skills (e.g. Archery, Ice Magic, Staff). Include a shared Core Attack
   bonus, ability-specific flat and percent, and original-base Skill Base. Record
   exact IDs, target/buff/Spark state and game version; synthetic tests prove code
   behavior, not the game's stacking order.
3. Swap one working imported tier, remove it, then stage a candidate. Confirm only
   intended contributions change, and off-skill abilities remain excluded.
4. Repeat the Mock target-count table with Damage analysis on; inspect the math and
   mobile scrolling. Verify offhand warnings and picker/session behavior remain.
5. Recommended next scoped work: T0013-F2 remaining stateless prose batches;
   T0013-F3 measured split-component allocation/conversions/stacking; current Burst
   measurements. Pet/DoT/crit/stateful systems remain separate. These may precede
   T0015 if more direct coverage is required; this PR does not implement Sparks.

Documentation updated: Tickets, Repository Current State, Manual Verification,
Damage and DPS Model, calculation README, Known Issues and the generated inventory.
