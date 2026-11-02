# T0014 — Ability Results UI and Custom Target Dummy: Verification

**Status:** Implemented for review. Customer hands-on verification is pending. No in-game measurements were taken.

**Base:** `main` at `3231809` (T0013 merged). No earlier T0014 branch, commit or PR existed, so this work starts from `main`.

**Branch:** `claude/friendly-ritchie-7rwkgu`

## What changed

| Area | Behavior |
|---|---|
| Ability popover | Shows a compact **Damage** section with a confidence badge. Each published hit (normal, health or armor) is shown separately, never summed. With several enemies it shows per-target and total rows. **Critical hit: Not modeled.** A one-line **Not included** list names the omitted interactions. |
| Calculation breakdown | Collapsed by default. It lists the ordered T0013 steps (label, source, operand, contribution and running total), the target-modifier step, affected enemies, uncertain mods that were not added, the count of excluded mods, limitations, unmodeled build effects and assumptions. `*` marks an assumed rule. |
| Target dummy | One row under the skill bars: **Enemies** (1–20) and an expandable **Vulnerability & resistance** table. The table lists damage types of equipped abilities plus any saved keys. Values are saved in the existing `BuildDocument.target` (schema v1 unchanged). |
| Target stage | `applyTargetDummy` (`src/core/calculation/target-damage.ts`) is pure, has no React dependency, and runs after T0013. See the [calculation README](../src/core/calculation/README.md#target-dummy-stage-t0014). |
| Respect Skill Level | An ability-picker checkbox, off by default and never saved. When on, family **+** picks the highest published Level at or below the skill's configured level. Ties go to canonical ID in ascending order. If no tier qualifies, **+** is disabled with an explanation, and expanded tiers remain freely selectable. Skill-level edits never change equipped bars. |

### Files

- `src/core/calculation/target-damage.ts` (+ tests) and `index.ts`: the target stage.
- `src/core/build/target.ts` (+ tests): count clamping and per-type percentage editing.
- `src/app/editor/build-editor.ts` (+ test): `target-count` and `target-damage-type` edits.
- `src/features/abilities/AbilityResults.tsx` and `results.css`: the popover results and breakdown.
- `src/features/abilities/TargetDummy.tsx` and `target-dummy.css`: the target controls.
- `src/features/abilities/groups.ts` (`quickAddTier`) and `AbilityPicker.tsx` / `picker.css`: the toggle.
- `src/features/abilities/AbilityPlanner.tsx`, `src/features/skills/SkillPlanner.tsx` and `src/app/App.tsx`: these pass one per-build aggregation down to the popovers.
- `src/features/abilities/AbilityResults.test.tsx`: UI tests. `RelevantMods.test.tsx` now expects Damage between the published stats and Relevant Mods.
- READMEs: `src/core/build`, `src/core/calculation`.

## Assumptions (all visible in the breakdown)

1. Target vulnerability and resistance are percentage points for the hit's exact damage type. They net additively into one multiplier applied after all build contributions. (Assumed.)
2. An ability without a published `AoE` value hits only its selected target.
3. With a known cap, every configured enemy up to the cap is inside the AoE area. v490 publishes **no** target-cap field, so the total for more than one AoE enemy is shown as "Target cap not published" and is never assumed to be unlimited.
4. All T0013 assumptions are unchanged. The T0013 formula was not modified.

## Automated checks

```sh
npx vitest run src/core/calculation/target-damage.test.ts src/core/build/target.test.ts src/features/abilities src/app/editor/build-editor.test.ts
npm run lint
npm run typecheck
npm test        # 831 tests, 41 files
npm run build
git diff --check
```

The tests cover:

- an identity dummy, with the T0013 result left unmodified
- only the matching damage type changing anything
- the ×1.2 math
- net resistance above 100%
- single-target counting
- AoE with an unknown cap, a known cap and an invalid cap
- a missing ability
- a 175-point delta when the Ring is removed, at both the core and UI level
- breakdown step order and running totals
- target edits saved to the draft
- out-of-range count input
- the Respect Skill Level rule: off/on, equal-level ties, no match, manual override, unchanged equipped bars and transient state

## Manual verification

Synthetic Psychology fixture (`psychologyFixture`): Skill A Psychology 100 with Mock 11 (`ability_6553`), and Skill B Archery 90 with Multishot 8 (`ability_2328`).

1. Open Mock 11. Expect **Health hit: 526.7 Psychic** and the **Incomplete** badge. Expand **Calculation breakdown**: 178 → 353 → 411 → 446.6 → 526.7. Skill Base uses "of base 178".
2. Clear the Ring and reopen Mock 11. Expect 351.7; the breakdown no longer has the +175 step.
3. Set **Enemies** to 3. Multishot shows a per-target 645 Piercing and "Total · 3 enemies: Target cap not published". Mock shows "Total · 1 enemy" and explains that only 1 of 3 is counted.
4. Set Psychic vulnerability 25 and resistance 5. Mock becomes 632.04, with a "Target Psychic modifier × 1.2" step. Multishot (Piercing) is unchanged.
5. Set Skill A level 55, open the picker and check **Respect Skill Level**. Mock **+** adds Mock 6 (Lv 50); with the box unchecked it adds Mock 13. At level 0, **+** is disabled with "No tier at or below Lv 0…", and expanded tiers still add. Equipped abilities do not change when levels change.
6. Run the quality suite.

Screenshots (synthetic data, local Vite dev server, Chromium) are in `src/features/abilities/verification/`:

- `t14-1440-mock-breakdown.png`
- `t14-1440-multishot-3-enemies.png`
- `t14-1440-target-dummy.png`
- `t14-1440-picker-respect-level0.png`
- `t14-375-mock.png`

## Risks and follow-ups

- **No AoE target cap in official data.** Totals for more than one AoE enemy remain unavailable until a source-backed cap exists. Some abilities say "Hits all targets within range" in prose; prose is not interpreted.
- **Vulnerable target state** (`ExtraDamageIfTargetVulnerable`, `AttributesThatDeltaDamageIfTargetIsVulnerable`) is still a listed limitation. It is a stateful debuff (non-goal).
- The target percentage formula needs in-game validation alongside T0015 Sparks.
- Respect Skill Level resets each time the picker opens (transient by design).
- DoT-only abilities show "DoT damage is not calculated yet".

**Central docs to update after merge:** `docs/Repo_Current_State.md`, `docs/Tickets.md` (T0014 status), `docs/Manual_Verification_Guide.md` (calculation tickets), and `docs/MVP_Technical_Design.md` (target semantics).
