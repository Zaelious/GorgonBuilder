# T0014 — Ability Results UI and Custom Target Dummy: Verification

**Status:** Customer-accepted and squash-merged 2026-11-03 in [PR #34](https://github.com/Zaelious/GorgonBuilder/pull/34), commit `19a26bf3f6d30ef63f9bd80fbeb4b5e89e90efcf`. Customer reported controlled naked Mock and direct Psychic modifier checks; broader in-game formula validation remains pending.

**Base:** `main` at `3231809` (T0013 merged). **Branch:** `claude/friendly-ritchie-7rwkgu`.

## Behavior

| Area | Behavior |
|---|---|
| **Damage analysis toggle** | A compact checkbox in the Skills & Abilities heading. **Off by default.** It is remembered for the browser session (`sessionStorage`) and never saved in BuildDocument v1. When off, ability facts, Relevant Mods, Technical details and all bar controls are unchanged, and the target dummy and damage results are hidden. |
| **Ability popover results** (toggle on) | Each published hit is shown separately and never summed. With several enemies, per-target and total rows appear. A Burst label appears when relevant (e.g. "Burst 20 m (mod)"), and **Critical hit: Not modeled**. A "Not damage" line shows taunt and reuse effects; "Not included" lists specific omitted interactions. There are no per-ability confidence badges; confidence stays in the data (`data-confidence`) and in the breakdown text. |
| **Calculation breakdown** | Collapsed by default. It lists, in order: T0013 steps with source, operand and running total; the ability multiplier; Burst falloff; the target damage-type modifier; and affected enemies. It also shows the documented direct/indirect Burst rules, ability changes from mods, uncertain mods, limitations, unmodeled build effects and assumptions. `*` marks an assumed rule. |
| **Target dummy** | One row: **Enemies** (1–20) and **Vulnerability & resistance** per damage type, saved in the existing `BuildDocument.target`. |
| **Respect Skill Level** | A picker checkbox, off by default and remembered for the browser session across picker openings and both bars. When on, **+** picks the highest published Level at or below the skill level, with canonical ID ascending as the tie-break. If no tier qualifies, it says so; manual tiers stay unrestricted. Equipped abilities never change. |
| **Popover scrolling** | Placement re-runs only for page/ancestor scrolling, resize and disclosure toggles, never for the card's own scrolling, and it preserves `scrollTop`. Previously the capturing `scroll` listener re-measured the card on every internal scroll; setting `max-height: none` reset `scrollTop` to 0, which looked like locked scrolling. `overscroll-behavior: contain` only stops chaining while the card itself is scrollable; non-overflowing cards and the page scroll normally. |
| **OffHand / OffHandShield** | "Published slot is X; saved slot Y is retained" and "Source slot X differs from official base slot Y" are hidden when the only difference is OffHand vs OffHandShield (`core/build/slots.ts`). Exact slots are unchanged in data, imports and persistence. Genuinely different slots and the legacy multiple-offhand conflict still warn. |

## Psychology modifier trace (customer report)

| Customer mod | Official source | Before | Now |
|---|---|---|---|
| OffHand "Mock and Ridicule deal +43% damage and taunt +200" | `power_4066` MockAndRidiculeBoost, tier `id_20`; prose only, no attribute token | T0012 `prose-effect` unsupported, so it was shown in Relevant Mods (icon/name match) but not calculated | Curated exact rule → `MOD_ABILITY_MOCK` / `MOD_ABILITY_RIDICULE` +0.43 through the official `AttributesThatModDamage` hooks. Mock 11 naked: 178 → **254.54**; Ridicule 18 → 25.74; other Psychology abilities unaffected. Taunt +200 kept separately. |
| Hands "Mock hits all enemies within 20 meters and taunts +1080, but damage is halved and reuse timer is +1.5 seconds" | `power_4032` MockBoost, tier `id_18`; prose only | `prose-effect` unsupported | Curated exact rule → Burst conversion (20 m), damage ×0.5 at every enemy count, taunt +1080 (`ABILITY_TAUNT_DELTA_MOCK`), reuse +1.5 s (`ABILITY_RESETTIME_DELTA_MOCK`). Taunt and reuse never add damage. Mock only; Ridicule is not converted. |

Direct Psychic damage from MainHand already worked (`damage-type-direct-*`) and is unchanged.

## AoE research and rules implemented

Official source: [Game update 2024-07-30](https://wiki.projectgorgon.com/wiki/Game_updates/2024-07-30).
- Burst direct and indirect damage are reduced above 3 targets.
- Direct damage falls to **25%** and indirect to **50%** at **9 or more** targets.
- Each 10 m of Burst radius adds one full-damage target (20 m → 5).
- A radius remainder gives a random extra target (7 m → 70%).

The current wiki [Combat page](https://wiki.projectgorgon.com/wiki/Combat) (edited 2026-10-05) is consistent: full damage to three, reduced beyond, and counted as ten past ten. No newer official change was found (official `news.txt` through 2026-10-27; 2025 updates only made some pet abilities Burst).

| Enemies (Mock + conversion, 20 m) | Per-target | Total | Status |
|---|---|---|---|
| 1 / 3 / 5 | ×0.5 only | per-target × enemies | documented full damage (≤ 5) |
| 6–8 | unavailable | unavailable | intermediate falloff not published |
| 9+ | ×0.5 × 0.25 | per-target × enemies | documented direct floor |

The three concepts stay separate:
- The ability multiplier (×0.5 from the mod).
- Target-count falloff (`burstTargetFalloff`, with direct and indirect kept apart).
- Affected enemies (a scenario assumption that the selected enemies are in range).

No cap is inferred from the radius. Abilities with the official `Burst` keyword and a published AoE value use that value as the assumed radius (Multishot 8: 30 m → 6 full targets). Non-Burst AoE records with no cap still give no total.

## Files

- **Core:**
  - `src/core/calculation/treasure-effect-rules.ts` (+ test): the curated rules.
  - `aggregate.ts`: prose branch only.
  - `modifiers.ts`: non-damage categories, `set`/`multiply` operations and the `ability-keyword` scope.
  - `report.ts`.
  - `target-damage.ts` (+ test): the scenario stage and Burst falloff.
  - `src/core/build/slots.ts`.
- **UI:**
  - `AbilityResults.tsx` and `results.css`.
  - `AbilityPlanner.tsx`: the scroll fix.
  - `AbilityPicker.tsx`: session Respect Skill Level.
  - `src/app/App.tsx`, `useSessionFlag.ts` and `planner.css`: the toggle.
  - `src/persistence/local/session-flags.ts`.
  - `ImportedItemDetails.tsx` and `EquipmentPlanner.tsx`: the slot warnings.
- **Tests:**
  - `AbilityResults.test.tsx`
  - `src/features/equipment/OffhandWarnings.test.tsx`
  - the core tests above
  - `src/features/abilities/popover-scroll.smoke.mjs` (real Chromium)
- `RelevantMods.test.tsx` is unchanged from `main`: with analysis off, popover order is again stats → Relevant Mods.

## Automated checks

```sh
npm run data:update -- --check
npm run lint
npm run typecheck
npm test                # 851 tests, 43 files
npm run build
git diff --check
node src/features/abilities/popover-scroll.smoke.mjs --output /tmp/gorgonbuilder-popover-scroll
```

**Real-browser scroll regression.** It runs at 1440×900, 1920×1080, 375×812 and 320×812. It expands the long breakdown, five Relevant Mods, Technical details and Edit bar, then wheel-scrolls the card. It checks that:
- the scroll position only moves forward;
- the bottom is reached, and Remove is visible and hit-testable;
- the position survives a pause and a page scroll;
- Escape closes the card.

The test fails on the previous code: `scrollTop` stayed at 0 at all four sizes. Results and screenshots (compact, expanded top and expanded bottom per size) are in `src/features/abilities/verification/popover-scroll/`.

## Manual verification

1. **Toggle:** after a fresh load, Damage analysis is off. The popover shows facts, Relevant Mods, Technical details and Edit bar/Remove, with no damage UI or target row. Turn it on and reopen popovers; reload the tab and it stays on. A new browser session starts off. The saved build is unchanged.
2. **Psychology + Deer** at imported effective levels, naked: Mock reproduces the published base (Mock 11 = 178).
3. **Mock +43%:** OffHand `power_4066` tier 20. Mock 11 = 254.54 (breakdown: "Mock Damage % · OffHand … +43% of 178"). Ridicule rises too; Strike a Nerve does not.
4. **AoE conversion:** add Hands `power_4032` tier 18. Expect "Burst 20 m (mod)", a ×0.5 step, and "Not damage: taunt +200 · taunt +1,080 · reuse timer +1.5 s".
   - Enemies 1 / 3 / 5 → 127.27 per target (totals 127.27 / 381.81 / 636.35).
   - 6 → unavailable, with an undocumented-falloff note.
   - 9 → 31.82 per target, 286.36 total.
5. **Combination:** with the Psychology fixture gear (+175/+58 flats, Skill Base +20%/+45%), each source appears once in the breakdown, and halving applies last (703.43 → 351.72).
6. **Scrolling:** open a long popover (many mods, breakdown, Technical details) at desktop and phone sizes. Scroll to Remove; the position never jumps back. Page scrolling works when the card is not scrollable.
7. **Respect Skill Level:** turn it on, close and reopen the picker (including the other bar). It stays on until turned off, and equipped abilities never change.
8. **Offhand:** import or refresh a shield reported as `OffHand` (base `OffHandShield`). There is no slot-differs warning in the equipment row, original item details or My Items. A shield saved in Head or MainHand still warns.
9. **Quality suite:** run the checks above.

Additional screenshots in `src/features/abilities/verification/`:
- `damage-analysis-off-1440.png`
- `damage-analysis-off-320.png`
- `mock-burst-5-enemies-breakdown-1440.png`
- `respect-skill-level-375.png`

## Remaining unmodeled effects and follow-ups

- **Burst falloff between full-damage targets and 9 enemies:** not published; no value is shown. Probabilistic extra targets are not expected-valued.
- **DoT/indirect damage:** not calculated. The indirect 50% floor is shown as a rule only.
- **Other prose treasure effects:** stay unsupported unless an exact curated rule is added. A proposed narrowly scoped follow-up would add more audited Psychology/Cow/Unarmed rules from customer gear.
- **Placement of "damage is halved" and the +X% stacking:** assumed (×0.5 after all contributions; +X% additive with other percentages). Both need in-game validation, together with T0015 Sparks.
- **Still limitations:** the Vulnerable target state, criticals, special ability rules, and taunt/reuse effects (displayed, not simulated).

**Follow-up:** T0013-F1 audits the full combat treasure effect inventory and adds clearly estimated intermediate direct Burst (6–8 at 20 m) pending in-game measurements. Core documentation and roadmap were synchronized after acceptance.
