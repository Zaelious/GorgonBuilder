# T0008-F2 — draft implementation / verification

**Status:** in progress, [draft PR #39](https://github.com/Zaelious/GorgonBuilder/pull/39); not customer-accepted or merged.

## Scope and official v490 evidence

- Nine exact static role keywords: `BasicAttack`, `CoreAttack`, `NiceAttack`, `EpicAttack`, `MinorHeal`, `MajorHeal`, `SignatureSupport`, `SignatureDebuff`, `SurvivalUtility`. Every token is present in pinned `abilities.json.gz`. Static memberships across combat abilities: 379 / 333 / 282 / 183 / 86 / 102 / 133 / 252 / 129 respectively; no conditional grants of these role keywords were found in the pinned snapshot. The new UI is nevertheless guarded for conditional source records.
- `src/features/abilities/roles.ts` owns the visible labels, based on published keywords; neither display names nor icon similarities determine membership.
- `src/features/abilities/presentation-groups.ts` lists only the requested seven source-verified groups, plus the customer-approved eighth (T0008-F2-R1):
  1. Vampirism Blood Mist: `ability_4866..4874`, `ability_4971..4995` (34 IDs).
  2. Animal Handling Call Stabled Pet: `ability_2010..2016` (7 IDs).
  3. Bard internal SoD: `ability_8621..8633` (13 IDs; `SongOfDiscordInternal1..13`).
  4. Mentalism Mindworm: `ability_8027..8037`, `ability_8041..8052` (23 IDs).
  5. Necromancy internal SZ: `ability_3273..3279`, `ability_3292`, `ability_2234`, `ability_2278..2279` (11 IDs; `SuperZombie1..11`).
  6. Priest Triage: `ability_9081..9091`, `ability_9101..9111` (22 IDs).
  7. Priest Flamestrike: `ability_9061..9071`, `ability_9211..9234` (35 IDs).
  8. Animal Handling Mark Weakness: `ability_4231..4240` (`MarkWeakness1..10`, one UpgradeOf group) and `ability_4241..4250` (`TSysBonusMarkWeakness1..10`, level 0, `Lint_NotLearnable`, no UpgradeOf; previously ten singleton rows). 20 IDs.
- These are **presentation families** only. The existing `UpgradeOf` components remain the sole rank/tier grouping, and internal triggered variants are never assumed to be progressions. Each official ID remains individually selectable with its exact description, level and rank. The compact presentation exposes 16 verified sub-series across eight families. Separate source IDs do not acquire invented upgrade links. The multi-variant rows have no ambiguous default quick-add.
- Category-based Relevant Mods now use the same guarded static `abilitykeywords` rule predicate as direct-hit hooks; source-relevant and actually-calculated status are distinct. Required-active-skill or effect-gated keyword rules still fail closed. The shared damage hook set prevents duplicate attribute contributions.
- Public series labels are player-readable and neutral: "Burst version A/B/C", "Bonus version" (TSysBonus), "Triggered version" (official text: "Internal ability that triggers when Triage is used"), "Alternate version A/B" (FlamestrikeAuto), "Pets #1–#7", "Ranks 1–13/1–11". The data does not identify which treasure power grants a TSys/Auto series, so no source is asserted. InternalName ranges appear only with development `?debugDamage=1`; abilities remain searchable by InternalName. Single-series families (Call Stabled Pet, SoD, SZ) list their abilities directly. Equipped non-standard-series abilities show their series tag in facts/popover, because display names such as "Flamestrike 2" repeat across series.

## Required-active-skill audit (T0008-F2-R1)

An official third token such as `{MOD_PIERCING_DIRECT}{0.01}{AnimalHandling}` applies only when that skill is one of the build's two active skills. The T0013-F1 probe activated the required skill implicitly, and the report counted these entries in its "unconditional" subset. The first T0008-F2 draft stopped activating the required skill. That made 245 entries (Animal Handling 175, Druid 50, Rabbit 20) read as `unmodeled / no-applicable-published-hit`, even though the engine calculates them when the condition is met.

Correction: required-skill entries use an explicit required-skill probe (the tested ability's skill plus the required skill), get reason `calculated-when-required-skill-active`, and record `requiredSkillsActivated`. They are counted as calculated, shown in a separate **Conditional (required skill)** column, and removed from the unconditional subset. Damage calculations are unchanged.

| Scope | Published T0013-F1 unconditional entries / full % | Truly unconditional entries / full % | Required-active-skill entries (calculated when active) |
|---|---:|---:|---:|
| Combat skills | 11,012 / 89.48% | 10,539 / 89.01% | 473 (473) |
| Generic/AnySkill | 3,070 / 75.57% | 3,070 / 75.57% | 0 |
| All associations | 14,082 / 86.45% | 13,609 / 85.98% | 473 (473) |

The recomputed mixed subset reproduces the published 11,012 / 89.48% exactly. Every published direct-coverage figure reproduces unchanged: combat T0014 30.40%, F1 first commit 35.94%, F1 final 59.64%; all associations 57.22%; Animal Handling 82.93%, Druid 83.24%, Rabbit 42.88%. The legacy reproduction test (`previousDirectRelatedUnmodeled` = 5,044) passes with its expectation unchanged. CI now runs `npm run coverage:treasure -- --check`.

## Regression coverage

- `src/features/abilities/presentation-groups.test.ts`: all nine labels, static versus conditional, exactly eight verified groups / 16 series, exact ID conservation, partial-group fail-closed behavior (Call Stabled Pet and Mark Weakness), ordinary grouping, public labels without InternalNames, series tags.
- `src/features/abilities/AbilityPickerVariants.test.tsx`: rendered picker shows one Mark Weakness row without quick-add, exact selection from the Bonus series, no internal names/jargon in public text, direct listing for single-series families, unchanged Unarmed quick-add, equipped series tag.
- `src/data/search/ability-category-mods.test.ts`: category matching by official keywords and exclusions, non-damage source relevance, active-skill/effect gating, real `AnySkill` Core treasure contribution.
- `src/core/calculation/treasure-coverage.test.ts`: audit predicate; required-skill rows reported as conditional calculations (473, `power_12191` → `AnimalHandling`); published-figure comparison; engine applies `power_12191` only when Animal Handling is the second active skill.
- `src/data/search/ability-mods.test.ts`: updated legitimate Ranged category matching while preserving no generic skill/incorrect ability-attribute inference.

## Verification status

- Local, on the T0008-F2-R1 head: lint, typecheck, full test suite, build, `npm run coverage:treasure -- --check` and `git diff --check` pass. The regenerated `docs/treasure-coverage` artifacts are committed.
- **Customer hands-on still required:** Animal Handling Mark Weakness (both series, persistence), the other seven families' labels and selection, the series tag on equipped abilities, and 1440/375/320 px keyboard/scroll checks.
- No live game-math verification is claimed. Critical, Sparks, pets, DoTs and rotation remain out of scope.
- Reported, not changed: non-combat skills also split same-name abilities into many rows: Carpentry *Stake The Heart* (8), Mycology *Mushroom Turret* (12) and *Spore Bomb* (11), Swimming *Air Reserves* (12), Performance instruments/dances (6 each).
