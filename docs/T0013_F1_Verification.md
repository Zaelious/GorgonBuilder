# T0013-F1 — Combat Treasure Effect Coverage, Direct-Damage Correction and Burst Estimate

Implemented for customer review on PR #36; **not merged and not game-math accepted**.
Base: `main` at `160b073` (PR #35), branch `feature/t0013-f1-combat-treasure-coverage`.
No private character data was used. Critical hits, DoTs, pets and Sparks are not implemented here.

## Final correction (second T0013-F1 commit)

The first commit's 22.83% figure measured *all* combat mechanics (DoT, pet, crit, reactive) and counted
any taunt/reuse clause as partial. The [regenerated report](treasure-coverage/README.md) now keeps four
measures separate: **inventory completeness**, **direct-damage coverage**, **other mechanics** and
**validation confidence**. A power that adds +X% damage and changes taunt/reuse is *fully calculated*
for direct damage; its taunt/reuse clause is recorded under other mechanics.

### Direct-damage coverage (same denominator, three snapshots)

| Scope | Direct entries / powers | T0014 baseline | F1 first commit | **F1 final** | Final full + partial |
|---|---:|---:|---:|---:|---:|
| Combat skills (35) | 16,565 / 745 | 30.40% | 35.94% | **59.64%** | 65.89% |
| Generic / AnySkill / non-combat associations | 4,755 / 124 | 47.40% | 47.47% | **48.79%** | 53.00% |
| All associations | 21,320 / 869 | 34.19% | 38.51% | **57.22%** | 63.01% |

Power counts (combat skills, final): **428 fully / 49 partially / 268 unmodeled of 745** direct powers
(T0014: 215 / 7 / 523). 5,019 direct entries across 220 powers gained a calculated contribution since the
first commit. Generic/AnySkill entries are counted once in their own rows, never duplicated into skills.

**Straightforward modifiers** (unconditional skill / ability / group-keyword / All Direct / damage-type
direct / Skill Base) on combat skills: **11,012 entries, 89.48% fully calculated, 98.88% with a
calculated contribution, only 123 unmodeled** (427 of 483 powers fully). The remaining direct gaps are
conditional or stateful mechanics, not plain bonuses.

### The earlier 5,044 unmodeled "direct-related" entries

Reproduced exactly from the retained legacy screening (225 powers) and reclassified:

| New classification | Entries | Result |
|---|---:|---|
| Unconditional flat / percentage | 3,283 | **3,021 fully + 176 partially calculated**, 86 unmodeled (typo/no attribute/split) |
| Multi-hit, split or variable damage | 437 | unmodeled (armor/health components, random ranges, extra traps) |
| Stateful combat | 333 | unmodeled (timed buffs, next attack, delayed) |
| Conditional direct | 183 | unmodeled (creature type, Elite, target state) |
| Damage-type conversion | 115 | unmodeled |
| AoE / targeting change | 49 | unmodeled |
| Pets / summons | 298 | misclassified: outside direct calculator |
| Reactive (attackers, shields) | 199 | misclassified: outside direct calculator |
| Defensive / incoming | 97 | misclassified: outside direct calculator |
| Ally support | 50 | misclassified: outside direct calculator |

### Remaining direct gaps by reusable family (final)

| Family | Entries | Powers | Next approach |
|---|---:|---:|---|
| Stateful combat (timed self buffs 1,589; target debuffs 451; when-hit/stacking 280; next attack 116; delayed 197; combos 73) | 2,933 | 144 | explicit "assume buff/debuff active" toggles |
| Conditional direct (creature type 1,460; target state 346; rage/armor threshold 235; Elite 250; next-attack type 197; active skill 75) | 2,563 | 79 | target-condition inputs; creature type shared with the critical-hit ticket |
| Multi-hit / split / variable | 1,000 | 43 | component allocation + expected-value rules |
| No applicable published combat hit (Sonic/Divine/Demonic, Crossbow, Fairy Magic, item abilities) | 550 | 18 | none possible with current data |
| AoE / targeting change | 507 | 24 | generalize the Mock Burst conversion |
| Split hit components: flat on multi-component hits (328 partial + 62 unmodeled) | 390 | 20 | allocation measurement |
| Partial / unmodeled: damage-type conversion | 454 | 19 | conversion stage before type bonuses |
| Partial: target debuff / timed buff / random / AoE / triggered / keyword side clauses | 663 | 28 | as above |

## Implementation and boundaries

- **`prose-damage-grammar.ts` — one reusable mapping instead of hundreds of templates.** A sentence
  is interpreted only when it starts with a fixed unconditional damage clause (`<Names> Damage +N[%]`,
  `<Names> deal(s) +N[%] [direct|<published type>] damage`, `<Names>'s damage is +N[%]`, or
  `<Names> <recognized side clause> and deal(s) +N damage`); every name resolves to an official
  ability display name of the power's own skill (all ranks), the skill itself, or an official group
  attribute named by label (e.g. *All Shield Bash Abilities Damage*, *Core Attack Damage*); exactly one
  ability-specific damage attribute with the expected DisplayType is listed in that ability's damage hook
  (label match, else the only hook exclusive to that ability family — recorded as an extra assumption);
  and **all** remaining text is a sequence of recognized clauses. Anything else fails closed. The sentence
  must be published by that exact power. Confidence is `assumed`.
- Recognized side clauses are split into **other mechanics** (taunt, reuse/reset, Power, Rage, control,
  range/accuracy, call-for-help, healing/resource, defensive, self buffs, DoT, critical, reflection, pet
  ally, self-damage) and **direct side mechanics** that keep an entry partial (damage-type conversion,
  target debuff, timed/next-attack buff, AoE change, chance-based extra damage, triggered eruption,
  keyword grant). Non-damage side clauses remain unsupported source records in the aggregation.
- A stated damage type ("Drink Blood deals +78 Piercing damage") is a restriction, never a conversion: it
  must equal every named ability's published type. Skill-associated group bonuses ("Kick attacks", "Hammer
  attacks") are restricted to that skill; AnySkill groups ("Core Attacks") are not.
- The 38 audited exact-sentence definitions and two Mock rules keep precedence; the grammar reproduces
  all 38 identically (tested). No new runtime categories, conversions, conditional evaluation, crit,
  DoT, pet or Spark logic, and no saved-build schema change.
- Coverage probing now uses direct hit components only: a DoT component's uncertainty is a DoT-stage
  other mechanic, not a direct gap. Interpretation confidence is reported as `official-attribute`
  (7,487 entries) versus `source-backed-assumption` (5,947); the additive formula order remains assumed.
- Intentional result change: the Cow/Unarmed import fixture's `power_3007` ("Unarmed attacks deal +5
  damage and have +9 Accuracy") now contributes `BOOST_SKILL_UNARMED` +5 to Unarmed hits; accuracy stays
  an unsupported remainder. Cow Front Kick is unaffected (1526.4).

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
| `npm ci --cache <scratch>` | Passed, 207 packages |
| `npm run data:update -- --check` | Passed, all pinned v490 datasets |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npx vitest run --maxWorkers=2 --testTimeout=15000` | **1,009 passed / 46 files** (+36 new grammar/coverage tests) |
| `npm run build` | Passed |
| `npm run coverage:treasure` then `-- --check` | Passed, deterministic byte equality (~40 s) |
| `git diff --check` | Clean |
| `prose-grammar.smoke.mjs` (new) | Passed 1440×900 and 375×812: Heavy Shot 1 29 → **34.51** (+29 × 0.19) with grammar `power_10201/id_9` + curated `power_10202/id_9`; breakdown shows the grammar attribute and the reuse remainder; no overflow or page errors ([results](verification/t0013-f1/grammar-results.json)) |
| `burst-estimate.smoke.mjs` | Passed 18 scenarios at 1440/375/320 px (Mock 1/5/6/7/8/9 enemies, Estimated only at 6–8, ×0.5, disclosure, Remove reachable, analysis default-off and session persistence) |
| `popover-scroll.smoke.mjs` | Passed 1440×900, 1920×1080, 375×812, 320×812 ([results](verification/t0013-f1/scroll-results.json)) |
| `vite-transport.smoke.py` | **Not re-run**: Python Playwright is not installed in this environment; the change touches no data transport. The first-commit run passed. |

Browser smokes accept `CHROMIUM_PATH` for the installed browser; no application dependency was added.
The 320 px planner-help 2 px overflow remains the pre-existing main-branch condition.

## Customer acceptance checks

1. Read the [report](treasure-coverage/README.md): headline snapshots, unconditional subset, per-association
   table (35 skills plus Generic rows), reasons, other mechanics and the 5,044 reclassification.
2. Plan a grammar-only bonus on an off-skill build and an on-skill build, e.g. Archery Heavy Shot with
   `power_10201` (+10%), Staff Smash with `power_5003`, Unarmed with `power_3007`, AnySkill Core Attacks
   `power_153` on two different skills. Confirm only the named abilities change and the math breakdown
   lists the exact attribute; remove the mod and confirm the base returns.
3. Swap/remove one imported working tier; confirm only its contribution changes.
4. Repeat the Mock 1/5/6/7/8/9 enemy table with Damage analysis on and check mobile scrolling.

## Follow-ups discovered

- **Next (separate ticket): critical hits** — imported Anatomy/Phrenology, creature-type target selection,
  ability crit rules, equipment crit chance/damage, expected damage per hit. The same creature-type selector
  would unlock 1,460 conditional creature-type entries (mostly Generic powers) and 250 Elite entries.
- **Target/state condition toggles** for conditional (2,563) and stateful (2,933) families.
- **Damage-type conversion stage** (454 entries) and **AoE conversion generalization** (607 entries).
- **Split-component allocation measurement** (390 entries) and chance-based expected values (100 partial + random-range entries in the multi-hit family).
- Runtime UI still lists non-damage remainders (taunt, reuse...) under "Across build: N unmodeled effects";
  consider a separate non-damage label in a UI ticket. Typos in official text (`Scintilatting Doom`) are
  not aliased without review.

Documentation updated: this file, generated coverage report, Repository Current State, Known Issues,
Manual Verification Guide, Tickets and the calculation README.
