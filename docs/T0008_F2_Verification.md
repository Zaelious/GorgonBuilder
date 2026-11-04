# T0008-F2 — draft implementation / verification

**Status:** in progress, [draft PR #39](https://github.com/Zaelious/GorgonBuilder/pull/39); not customer-accepted or merged.

## Scope and official v490 evidence

- Nine exact static role keywords: `BasicAttack`, `CoreAttack`, `NiceAttack`, `EpicAttack`, `MinorHeal`, `MajorHeal`, `SignatureSupport`, `SignatureDebuff`, `SurvivalUtility`. Every token is present in pinned `abilities.json.gz`. Static memberships across combat abilities: 379 / 333 / 282 / 183 / 86 / 102 / 133 / 252 / 129 respectively; no conditional grants of these role keywords were found in the pinned snapshot. The new UI is nevertheless guarded for conditional source records.
- `src/features/abilities/roles.ts` owns the visible labels, based on published keywords; neither display names nor icon similarities determine membership.
- `src/features/abilities/presentation-groups.ts` lists only the requested seven source-verified groups:
  1. Vampirism Blood Mist: `ability_4866..4874`, `ability_4971..4995` (34 IDs).
  2. Animal Handling Call Stabled Pet: `ability_2010..2016` (7 IDs).
  3. Bard internal SoD: `ability_8621..8633` (13 IDs; `SongOfDiscordInternal1..13`).
  4. Mentalism Mindworm: `ability_8027..8037`, `ability_8041..8052` (23 IDs).
  5. Necromancy internal SZ: `ability_3273..3279`, `ability_3292`, `ability_2234`, `ability_2278..2279` (11 IDs; `SuperZombie1..11`).
  6. Priest Triage: `ability_9081..9091`, `ability_9101..9111` (22 IDs).
  7. Priest Flamestrike: `ability_9061..9071`, `ability_9211..9234` (35 IDs).
- These are **presentation families** only. The existing `UpgradeOf` components remain the sole rank/tier grouping, and internal triggered variants are never assumed to be progressions. Each official ID remains individually selectable with its exact description, level and rank. The multi-variant rows have no ambiguous default quick-add.
- Category-based Relevant Mods now use the same guarded static `abilitykeywords` rule predicate as direct-hit hooks; source-relevant and actually-calculated status are distinct. Required-active-skill or effect-gated keyword rules still fail closed. The shared damage hook set prevents duplicate attribute contributions.
- T0013-F1 audit probes no longer force required-active-skill modifiers active. The generated summary will report `requiredActiveSkillAudit.priorMixed`, `trulyUnconditional` and `requiredActiveSkill` separately.

## Regression coverage

- `src/features/abilities/presentation-groups.test.ts`: all nine labels, static versus conditional, exactly seven verified groups, exact ID conservation, partial-group fail-closed behavior, ordinary grouping.
- `src/data/search/ability-category-mods.test.ts`: category matching by official keywords and exclusions, non-damage source relevance, active-skill/effect gating, real `AnySkill` Core treasure contribution.
- `src/core/calculation/treasure-coverage.test.ts`: audit predicate for source and mapped conditions.
- `src/data/search/ability-mods.test.ts`: updated legitimate Projectile-wide matching while preserving no generic skill/incorrect ability-attribute inference.

## Verification status and remaining gates

- CI for the latest PR head: **pending**. Earlier draft CI passed lint/typecheck and 1,051/1,052 tests; the former Acid Arrow test wrongly expected a published Projectile bonus to be irrelevant. That assertion was updated.
- **Still required:** regenerate and commit deterministic `docs/treasure-coverage/{README.md,summary.json,effects.json.gz,...}` using `npm run coverage:treasure` in a checked-out repository and verify `npm run coverage:treasure -- --check`. Inspect before/after truly unconditional and required-skill counts, including the impact of corrected probes.
- **Still required:** latest-head lint, typecheck, all tests, build, Cloudflare dry-run, `git diff --check`, plus desktop and narrow-screen picker/keyboard/source-mod manual browser verification at 1440/375/320 px. Check multiple variants/ranks, explicit selection, persistence, existing normal families and the Respect Skill Level setting.
- No live game-math verification is claimed. Critical, Sparks, pets, DoTs and rotation remain out of scope.
