# T0013 — Core Ability Damage Engine: Verification

**Status:** Implemented for review; customer game-math validation is pending. No in-game measurements were performed by this implementation.

**Base:** `main` at `8c6d8a06085342492ec850006d85a8c3eb852cd1`, including merged T0022 / PR #31.

**Branch:** `feature/t0013-core-ability-damage`.

## Changes and API

`calculateAbilityDamage(abilityId, aggregation, repository)` consumes the existing T0012
result and exact official ability lookup. It preserves original ordinary, health-specific,
armor-specific and embedded DoT bases, exact identity, provenance, modifier decisions,
ordered contributions, warnings and confidence. No component total is inferred.

```ts
import {
  aggregateBuildModifiers, calculateAbilityDamage, formatAbilityDamageReport,
} from './src/core/calculation/index';

const aggregation = aggregateBuildModifiers(build, repository);
const damage = calculateAbilityDamage('ability_6553', aggregation, repository);
console.log(formatAbilityDamageReport(damage));
// damage.components: source fields, decisions and steps
// damage.provisionalDamage: supported-subset preview, possibly incomplete
// damage.normalDamage: null unless a single hit component is fully validated
// damage.criticalDamage: null
```

`normalDamage` is a normal PvE baseline **before target effects**, not a promise of
an actual combat-log value. A provisional value must always be presented with its
confidence, assumptions and exclusions. T0013 does not add a planner result UI.

### Files changed

| File | Purpose |
|---|---|
| `src/core/calculation/ability-damage-types.ts` | Typed components, decisions, steps and result |
| `src/core/calculation/ability-damage.ts` | Exact applicability and conservative arithmetic |
| `src/core/calculation/ability-damage-report.ts` | Pure inspectable report formatter |
| `src/core/calculation/ability-damage-fixtures.ts` | Exact official IDs paired with T0012 synthetic builds |
| `src/core/calculation/ability-damage.test.ts` | Focused numeric, scope and compatibility regressions |
| `src/core/calculation/index.ts` | Public API exports |
| `src/core/calculation/report.ts` | Reuse existing source formatter for damage reports |
| `src/core/calculation/README.md` | API, stages, nullability and confidence contract |
| `docs/calculation-reports/T0013-*.txt` | Four generated inspection reports |
| `docs/T0013_Verification.md` | Verification evidence and product-owner procedure |

No UI, build schema/persistence, import, game-data/pipeline/v490 snapshot, dependencies,
Sparks, target dummy, rotation or DPS implementation changed. T0014/T0015 were not started.

## Formula assumptions and evidence

`B` = original component base; `F` = applicable flat points; `P` = applicable
non-Skill-Base percentage fractions; `S` = applicable Skill Base fractions.

```text
supported-components-v1 preview:
  B
  + each F
  + each ((B + sum(F)) × P)
  + each (B × S)
```

Each percentage category retains its own sources and steps. The shared percentage
basis does not imply that the categories have been proven to stack together.

| Rule | State | Evidence / limitation | Observation needed |
|---|---|---|---|
| Exact published fields, IDs, hooks, type and provenance | Source facts | Committed official v490; not measured combat damage | Confirm exact ability/version used in game |
| Skill Base contribution `B × S` | **validated rule** | Product-owner confirmation in `Damage_And_DPS_Model.md`; 500 × 0.50 = +250 | Additional controlled deltas extend coverage |
| Multiple Skill Base contributions use original `B` separately | Same original-base rule | Each contribution and source remain visible | Check multiple simultaneous sources and any caps |
| Apply the Skill Base rule to health/armor-specific bases | **assumed** | Generalized from the confirmed original-base example | Isolate Mock health damage and an armor-specific ability |
| Treat published PvE hit fields as direct | **assumed** | Normalization deliberately does not classify delivery | Compare direct-only and indirect-only modifiers |
| Flats add before all non-base percentages | **assumed** | Provisional calculation convention, no new game evidence | Add each flat category alone, then with one percentage |
| Non-base percent contributions all use `B + sum(F)` | **assumed** | Additive shared basis, no compounding in this preview | Compare each percentage alone and pairwise combinations |
| Skill Base placed after non-base percent stages | **assumed** | Contribution is confirmed; interaction/order is not | Combine isolated Skill Base and isolated non-base percentage |
| Several hit components | **unknown allocation/combination** | Never summed; nonzero flats remain uncertain | Observe ordinary/health/armor damage separately |
| T0012 category/unit mappings | `partially_validated` | Official identity/label/DisplayType plus fraction convention | Validate mappings and application in game |
| T0012 advancement reward summation | `assumed` | Preserved unchanged, unique active skills | CurrentStats follow-up T0016 |
| Conditions, prose, keyword rules, special values, DoTs | **unknown where unresolved** | Preserved, never silently converted to damage | Structured semantics and controlled activation evidence |
| Criticals / Phrenology / target effects / AoE conversions / rounding and caps | **unimplemented/unknown** | No fabricated crit chance, multipliers or combat result | Separate controlled observations and scoped follow-ups |

The 3550 example is exercised only as an **assumed** calculation: `(500 + 600) × 3
+ 250`. Only the +250 contribution is confirmed. No test or report promotes its
remaining stacking/order assumptions to validated mechanics.

`ruleConfidence` belongs to a step's arithmetic; `confidence` also includes the
mapped input. Overall/component confidence additionally includes unresolved sources
and assumptions. Thus an official Skill Base step can have a validated rule and a
partially validated input without yielding a validated hit. Known off-skill/non-damage
exclusions do not inherit their unrelated confidence; delivery-dependent exclusions
still record the delivery assumption.

## Inspectable synthetic reports

These are controlled **synthetic builds using real official IDs**, not customer gear
measurements or claims of legal final item configurations. Their T0012 unsupported
effects are deliberately retained. Every sample's final normal and critical result
is **null** and overall confidence **unknown**. The numerical previews include only
supported contributions. Numbers below are displayed compactly; the raw reports retain
unrounded JavaScript arithmetic (e.g. `1088.3600000000001`).

| Report | Exact ability / published base | Ordered supported contributions | Preview |
|---|---|---|---|
| [Psychology Mock](calculation-reports/T0013-psychology-mock.txt) | `ability_6553`, `Mock11`, L100, health-specific 178 Psychic | 178 +175 direct +58 direct +35.6 Skill Base +80.1 Skill Base | 526.7 health-specific |
| [Psychology Strike a Nerve](calculation-reports/T0013-psychology-strike-a-nerve.txt) | `ability_1298`, `StrikeANerve8`, L98, 430 Psychic | 430 +175 direct +58 direct +145.86 ability percent +86 Skill Base +193.5 Skill Base | 1088.36 |
| [Cow Front Kick](calculation-reports/T0013-cow-front-kick.txt) | `ability_6124`, `CowKick10`, L95, 412 Crushing | 412 +293 skill +116 skill +101 ability +175 direct +185.4 Skill Base | 1282.4 |
| [Unarmed Front Kick](calculation-reports/T0013-unarmed-front-kick.txt) | `ability_8169`, `FrontKick9`, L99, 364 Crushing | 364 +175 direct +242.55 ability percent +163.8 existing Skill Base +163.8 planned Skill Base | 1109.15 |

All four published `Rank` fields are absent; no rank was inferred from the names.
For Strike a Nerve, 430 vulnerable-target extra damage is preserved but not applied.
For Unarmed Front Kick the corresponding published extra damage is 364.

Key decisions:

- Necromancy's +7% Skill Base and +88 Skill Damage never affect Psychology, even
  if Necromancy is also active. Strike a Nerve's +22% does not affect Mock's hook.
- Cow does not receive either Unarmed +45% Skill Base source, Knife +12%, Darkness
  +146, Druid +116, Unarmed Front Kick +45%, or Cow Bash +37%.
- Cow's imported `power_20006/id_9` contributes +101. Changing only its working
  tier to `id_8` contributes +89, changing the preview from 1282.4 to 1270.4.
  Historical source tier 5 never contributes.
- Unarmed's existing and planned `power_3001/id_9` remain independent. Removing
  only the existing copy removes `364 × 0.45 = 163.8`; the planned copy remains.
- Unknown powers/tiers, unsupported prose/crit effects, Sparks and same-skill level
  conflicts retain the existing T0012 warnings; no level or nearest tier is chosen.

### Reproduce reports without editing source data

Run from the repository root after `npm ci`:

```sh
node --import ./scripts/typescript-imports.ts --input-type=module <<'JS'
import { mkdirSync, writeFileSync } from 'node:fs';
import { loadPlannerFixture } from './src/test/planner-fixture.ts';
import { abilityDamageFixtures } from './src/core/calculation/ability-damage-fixtures.ts';
import { aggregateBuildModifiers, calculateAbilityDamage, formatAbilityDamageReport } from './src/core/calculation/index.ts';
const repository = loadPlannerFixture();
mkdirSync('/tmp/t0013-reports', { recursive: true });
for (const fixture of abilityDamageFixtures(repository.gameDataVersion)) {
  const result = calculateAbilityDamage(fixture.abilityId,
    aggregateBuildModifiers(fixture.build, repository), repository);
  writeFileSync(`/tmp/t0013-reports/T0013-${fixture.name}.txt`, formatAbilityDamageReport(result));
}
JS
diff -r docs/calculation-reports /tmp/t0013-reports
```

## Automated verification

| Command | Result |
|---|---|
| `npm ci` | Passed, 207 packages; writable `/tmp/gorgonbuilder-npm-cache` selected via `NPM_CONFIG_CACHE` |
| `npm run data:update -- --check` | Passed; all 13 pinned v490 datasets validated offline |
| `npx vitest run src/core/calculation` | **70 passed / 3 files** (46 existing T0012 + 24 T0013) |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm test` | **810 passed / 38 files**, no skipped tests, with localhost/child-process permissions |
| `npm run build` | Passed (typecheck + Vite production build) |
| `git diff --check` | Clean |

Environment notes: the initial install could not write npm's default cache; rerunning
with a temporary writable cache succeeded without dependency changes. The first full
suite attempt was restricted by sandbox `EPERM` errors in the existing localhost
transport and import subprocess tests. Repeating `npm test` with the required execution
permissions passed all 810 tests; no production code was changed to accommodate those
environment errors. One initial new test used the wrong provenance property name
(`gameVersion`); it was corrected to the repository's `gameDataVersion`, without any
formula change.

The focused tests cover all 15 requested cases: empty modifier input, confirmed
500/50% regression, multiple Skill Base sources, separate flat/percentage categories,
off-skill equipment, exact hooks, direct/indirect applicability, damage types, required
active skills, unevaluated/unsupported effects, missing IDs/absent/zero/invalid bases,
removal deltas, imported tier deltas, deterministic frozen inputs, and confidence.
They also exercise mixed components, unknown damage types, unique/conflicting skills,
historical-versus-working powers, separate candidates and game-data version mismatch.

## Product-owner game-math verification (pending)

1. Record the current game version and exact ability ID/name/level. Use **Mock 11**
   (`ability_6553`) or **Strike a Nerve 8** (`ability_1298`) for Psychology, and
   **Cow Front Kick 10** (`ability_6124`) for Cow. Do not substitute a similarly named
   Unarmed Front Kick. If the game is newer than v490, record the difference before
   comparing; do not update the pinned snapshot in this ticket.
2. Record both active skills at their actual effective levels. For duplicate skill
   slots use one equal level; legacy conflicts must still warn. Record gear, exact
   working powers/tiers, Sparks, buffs, passives, target, target armor/health and
   vulnerable state. Use a repeatable target and keep all of these fixed between
   trials. Record noncritical hits separately; Phrenology criticals are not modeled.
3. Start with the smallest achievable baseline and record the game's displayed
   damage and several individual noncritical combat values. Retain separate ordinary,
   health-specific and armor-specific observations. A naked character may still have
   progression/passives; record those rather than assuming their contribution is zero.
4. Build that controlled loadout through `createDefaultBuildDocument` or a copy of
   the synthetic fixture, changing only the actual selected items/powers/tiers and
   skill levels. Call the API above and keep the text report. Existing T0013 reports
   are examples to inspect, not expected values for arbitrary real gear.
5. Isolate one Skill Base source, then remove it while everything else stays fixed.
   The confirmed contribution change is original base × changed fraction. For the
   model, Mock 11 +45% contributes 80.1 and Cow Front Kick 10 +45% contributes 185.4;
   health-specific extension and displayed rounding still need observation. The
   synthetic 500/+50% regression remains +250 regardless of gear flats. If swapping
   an item changes several effects, record all of them and do not label it an
   isolated test.
6. Add each flat category alone. For the imported Cow Front Kick power, compare
   exact `power_20006/id_9` (+101) with `id_8` (+89), if available. Hold all percentages
   constant. The synthetic fixture preview delta is −12; record any observed
   difference, including rounding and target effects, without changing the formula
   merely to fit it. Compare an Unarmed ability too to verify it receives no Cow hook.
7. In Psychology, add/remove a Necromancy-specific source without changing other
   effects. The modeled Psychology contribution is zero even with both skills active.
   Separately compare the Strike a Nerve-specific +22% source on Strike a Nerve and
   Mock; only the former has the matching published hook.
8. Test Skill Damage %, Ability Damage %, All Direct %, All Damage % and matching
   damage-type % one at a time, then in pairs with one known flat and one Skill Base
   source. Record enough trials to distinguish additive versus multiplicative
   stacking and whether each percentage scales flats or Skill Base contributions.
9. Capture cases with an inactive required skill, indirect-only effects, and an
   AoE conversion separately. These must remain excluded/uncertain in the current
   report; do not treat a provisional subset as complete damage.
10. Return a sanitized table: exact input change, original base, predicted contribution,
    observed before/after values, delta, target/buff state, game version and uncertainty.
    Record mismatches as unknown mechanics with evidence. Keep private exports local.
    Acceptance and promotion of assumed rules require this review; automated tests
    alone do not validate game behavior.

## Risks, remaining unknowns and recommended follow-ups

- The provisional order is deliberately explicit but may differ from Project Gorgon.
  Consumers must not show it as an exact final hit. Many official abilities remain
  `unknown` because conditional rules and unsupported effects are retained.
- Unknown build effects conservatively block final values even when later work may
  prove them irrelevant. Narrow their applicability only with structured evidence.
- Split-component flat allocation, health/armor Skill Base extension, rounding,
  caps, damage conversion, AoE behavior, criticals/Phrenology, indirect activation
  and stacking, and target effects still need scoped work and game observations.
- Preserve T0012's assumed advancement sums for T0016 reconciliation. The desired
  linked-level skill editor correction remains a separate follow-up; no React edit
  was introduced. Shared effect-token grammar cleanup remains a separate T0012 note.
- T0014 can consume this API later, with the null/provisional distinction preserved.
  T0015 can supply Spark contributions later; neither ticket was begun here.

After acceptance, update `docs/Tickets.md`, `docs/Repo_Current_State.md`,
`docs/MVP_Technical_Design.md`, `docs/Manual_Verification_Guide.md` and
`docs/Known_Issues_And_Followups.md`. Update `docs/Damage_And_DPS_Model.md` only when
controlled observations justify changing a rule's confidence. This document and
the calculation README already describe the implementation without asserting acceptance.
