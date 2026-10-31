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
