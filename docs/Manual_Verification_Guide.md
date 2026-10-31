# GorgonBuilder — Manual Verification Guide

**Status:** Active

## Principle

A passing build does not prove the feature works.

Every ticket has its own manual verification steps in `Tickets.md`. This guide defines the common baseline.

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
