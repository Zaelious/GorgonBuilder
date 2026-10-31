# GorgonBuilder — Manual Verification Guide

**Status:** Active

## Principle

A passing build does not prove the feature works.

Every ticket has its own manual verification steps in `Tickets.md`. This guide defines the common baseline.

## Verification Classes

Every ticket still receives automated verification appropriate to the current repository. Customer hands-on testing is targeted rather than mandatory for every internal ticket.

- **Automated + architect review:** Codex runs the required quality checks and ChatGPT reviews the implementation/PR. Customer manual testing is optional.
- **Customer quick check:** a brief UI sanity check.
- **Customer hands-on:** the customer performs the ticket's listed user workflow because usability or real Project Gorgon behavior matters.
- **Customer game-math validation required:** acceptance includes controlled in-game observations supplied by the customer.
- **Customer milestone regression required:** a broader end-to-end pass before a release milestone.

This keeps internal schema/normalization tickets from wasting customer time while preserving hands-on checks for planner UX, game math, imports, Sparks, sharing, comparison, and release.

## Baseline Frontend Verification

Once applicable:

1. `npm install`
2. `npm run dev`
3. Open local app.
4. Confirm requested feature appears.
5. Exercise the ticket's main success path.
6. Exercise one obvious failure/empty path.
7. Check browser console for unexpected errors.
8. `npm run lint`
9. `npm run typecheck`
10. `npm test`
11. `npm run build`

## Data Tickets

Verify:

- source/version is recorded
- deterministic regeneration where expected
- IDs are stable
- representative known records exist
- unknown fields do not silently become fake interpreted values

### T0003 progression-normalization checks

For this data-only ticket, run focused tests and inspect normalized records rather than expecting new UI:

- `npm run data:update -- --check` validates the pinned snapshot offline.
- `npx vitest run src/data/adapters/normalize-progression.test.ts` tests source preservation, deterministic results, invalid references and official-data integration.
- Inspect Psychology/Unarmed (`Balanced` → `3_Balanced`), Cow (`PlayerCow` → `11_PlayerCow`), and Deer (`PlayerDeer` → `15_PlayerDeer`).
- Ensure qualified rewards and unknown fields remain uninterpreted; malformed references fail explicitly.
- Inspect `integrityIssues` and remember it covers only implemented namespaces, not all possible cross-dataset links.
- Run lint, typecheck, full tests and production build. See `Repo_Current_State.md` for the verified GitHub CI run.

### T0004 ability/dynamic-data normalization checks

T0004 is data-only; automated verification and architect review replace UI manual testing.

- Run `npm run data:update -- --check` and `npx vitest run src/data/adapters/normalize-abilities.test.ts`.
- Inspect Psychology, Cow, Unarmed and Deer abilities, including upgraded records, explicit Rank versus Level, damage, cooldown/target/AoE, keyword constraints and embedded dynamics.
- Confirm counts: **5,972 abilities, 26 keyword rules, 2 global dynamic DoTs, 4 global dynamic special values, 4,063 acquisition records**, plus **1,757 embedded DoTs** and **1,823 embedded special values**.
- Verify official internal-name links for `UpgradeOf`, `Prerequisite` and `SharesResetTimerWith`; never invent ranks or applied effect links.
- Preserve anonymous rule indices only as snapshot locators; global dynamic rules have no invented per-ability owner. Preserve unknown fields and canonical raw values.
- Inspect **1,546 integrity diagnostics**: 1,532 published `Skill: Unknown` references and 14 unmatched effect-keyword references. They are unresolved source gaps, not proven nonexistent mechanics; T0006 must retain/report them.
- Run lint, typecheck, full tests and build. [PR #5 GitHub CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41240276925) passed.

### T0005 item and treasure-system normalization checks

T0005 is data-only. Architect review and automated inspection replace UI manual testing.

- Run `npm run data:update -- --check` and `npx vitest run src/data/adapters/normalize-items-treasure.test.ts`.
- Verify the official v490 normalized totals: **3,078 equippable items**, **8,131 other item IDs**, **8,460 fixed-effect descriptions**, **1,947 powers**, **45,634 power-owned tiers**, **40 profiles**, **8,649 profile memberships**, and **10,068 item acquisition records**.
- Check representative source records: `item_45640` (MainHand/Dagger), `item_45722` (OffHand/Dirk), `item_45052` (OffHandShield/Shield), `item_42093` (Chest/All), `item_49070` (Ring/All), and `item_48081` (Necklace/All). All have published `CraftingTargetLevel: 90`, which is **not proof of an equip-level restriction**. Confirm skill requirements remain separate.
- Confirm all **2,578 item/profile** and **8,649 profile/power** published links resolve, and original power/tier identities are intact. Inspect `power_10001/id_1`, `power_10001/id_9`, and the atypical `power_129/id_120`.
- Confirm exact fixed-effect prose, unknown tier fields, canonical raw records, source IDs, URLs, SHA-256 hashes, and version remain available without invented numeric modifier or eligibility semantics.
- Inspect T0005's **96 diagnostics**: 6 unresolved `Skill: Unknown` links and 90 `AnySkill` selectors with unsupported semantics. Preserve the distinct **1,546 T0004 diagnostics** for T0006.
- Run lint, typecheck, the full test suite, and build. The [PR #6 GitHub CI](https://github.com/Zaelious/GorgonBuilder/actions/runs/41241709925) passed, with 42 focused tests and 173 total tests.

## Calculation Tickets

Verify:

- exact fixture/input
- calculation result
- expanded breakdown
- confidence/warning state
- removing the modifier reverses the effect

For confirmed Skill Base:

```text
base 500
skill base +50%
expected contribution +250
```

## Spark Tickets

Verify:

- 0 Sparks has no effect
- fixed seed repeats exactly
- 110 simulated rolls count to 110
- reroll produces a different result in UI
- expected-value calculation is independent from random simulation

## Import Tickets

Use supplied fixtures and, later, a fresh current export.

Verify:

- report timestamp shown
- correct character/server
- representative skill levels
- known abilities
- representative item TypeID/name/slot/level
- exact TSys powers/tiers
- `IsInInventory` is not presented as "equipped"
- malformed/wrong report gives clear error

## Save/Share Tickets

Test at least:

- create
- public read
- owner edit
- wrong-token rejection
- delete
- public read-only in private/incognito window
- duplicate creates new independent ownership

## Comparison Tickets

Create build A, duplicate to B, change one controlled input, and confirm:

- changed input is visible
- ability delta is visible
- unchanged values remain unchanged
- both sides use the same calculator

## Review Evidence

The ticket completion report should include enough detail that ChatGPT can compare what was tested with acceptance criteria.
