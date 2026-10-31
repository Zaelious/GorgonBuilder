# GorgonBuilder — Known Issues and Follow-Ups

**Last updated:** 2026-10-31

## KI-0001 — Exact Damage Formula Is Not Fully Known

**Status:** Expected research/validation work

Project Gorgon uses multiple damage modifier categories. Only some ordering/behavior is currently validated.

Known confirmed example:

- Skill Base Damage references original ability base only.

**Action:** Add formula rules incrementally with confidence states and real-game regression fixtures.

## KI-0002 — Storage Export Does Not Reliably Mark Active Equipment

**Status:** Known limitation

`IsInInventory` indicates carried inventory and cannot be treated as an equipped flag.

**Action:** Character import provides a My Items collection and the user selects the active planner loadout.

**Possible later research:** infer candidate loadout from CurrentStats, clearly labeled as inference.

## KI-0003 — Individual Mastery Spark Outcomes Are Not Proven Importable

**Status:** Known limitation

Supplied reports expose normal item TSys powers but do not establish a field containing all individual Spark outcome rolls.

`CraftPoints` exists on some items but should not be converted into definitive Spark history without validation.

**Action:** Spark outcomes remain simulated/manual in initial implementation.

## KI-0004 — Backend Provider Not Yet Selected

**Status:** Planned T0018 decision

Architecture intentionally uses a provider-agnostic `BuildRepository`.

## KI-0005 — Rotation Simulator Deferred

**Status:** Planned next ticket series after T0021

DPS depends heavily on build-specific setup, buffs, debuffs, stacks, cooldowns, and priority choices.

The condensed v1 ticket series validates the underlying per-ability engine and completes import validation, comparison, and save/share before implementing stateful rotation simulation.

## KI-0006 — Cloudflare Workers Preview Build Failures

**Status:** Investigation needed; no evidence of a T0003 application regression.

Cloudflare Workers Builds marked PR previews on PRs #2, #3 and #4 as failed on 2026-10-31 while GitHub Actions CI, including Wrangler dry-run, succeeded. PR #5 and PR #6 preview builds/deployments subsequently succeeded, but the root cause of the earlier failures has not been established. GitHub checks do not include the underlying Cloudflare error log.

**Action:** Go to Workers & Pages → `gorgonbuilder` → Deployments → View build history. Open PR #4's failed build ID `66cf1b10-8e5b-4439-8889-86a3f3175ee2`, inspect the first failure, compare with `docs/Cloudflare_Deployment.md` settings, verify Branch control/Preview Builds and retry after fixing the identified issue. Avoid unrelated code changes without diagnostic evidence.

## KI-0007 — Crafting Target Level Is Not a Validated Equipment Requirement

**Status:** Data semantics to resolve for T0009 equipment filtering

T0005's official v490 `items` data exposes `CraftingTargetLevel`, not a generic item `Level`. Normalized `level` intentionally equals that source field with `levelSource` recorded. Of 3,078 equipment records, 518 have crafting target level 90+ and 500 omit the field.

**Risk:** Using this field as an unqualified item-level/equip-level requirement could hide valid gear or communicate a false gameplay restriction. Imported concrete item-instance levels and published item `SkillReqs` are separate concepts.

**Action:** Before implementing T0009's global minimum-level filter, establish and document intended filtering semantics from official data and/or controlled game evidence; preserve null/unknown levels rather than substituting zero. Do not redefine the T0005 source field without a documented design decision.

## Follow-Up Candidates After T0021

- Rotation Simulator explicit sequence
- time/state engine
- buff/debuff stack modeling
- priority-rule rotations
- food/drink/meditation/potions
- Player.log optional rotation capture/replay research
- defensive/threat calculator
- optimizer
- public searchable build gallery
- optional accounts/claim anonymous builds
- game-data diff/update automation
