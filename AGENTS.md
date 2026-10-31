# AGENTS.md — GorgonBuilder Repository Rules

These rules apply to Codex and any implementation agent working in this repository.

## Ticket Discipline

- Implement **one ticket only** unless the ticket explicitly says otherwise.
- Read the ticket and required design documents before editing code.
- Do not implement future-ticket features.
- Do not refactor unrelated code.
- Do not introduce architecture that is not required by the current ticket.
- Keep changes small enough to review and verify manually.
- If an out-of-scope problem is discovered, report it instead of fixing it automatically.

## Required Context Before Coding

Always review:

- `AGENTS.md`
- `docs/Full_Design_Document.md`
- `docs/MVP_Technical_Design.md`
- `docs/Tickets.md`
- `docs/Repo_Current_State.md`
- `docs/Manual_Verification_Guide.md`

Also review any specialized document named by the ticket.

## Architecture Rules

- Use strict TypeScript.
- Keep game-data parsing/normalization independent of React.
- Keep calculation logic independent of React.
- Keep Spark simulation independent of React.
- Do not put damage formulas inside UI components.
- Do not couple saved-build JSON to React component state.
- Official Project Gorgon data is the canonical game-data source.
- Third-party libraries may assist parsing, but must not become an unreviewed source of game truth.
- Do not silently invent game mechanics or formula ordering.
- Calculations that are not validated must preserve an explicit confidence/assumption state.
- Prefer pure functions in calculation and normalization code.
- Avoid unnecessary dependencies.
- Never add a dependency only to save a few lines of simple code.
- Keep generated game data separate from hand-written source code.
- Preserve schema/version information for imported and saved data.

## UI Rules

- GorgonExplorer is a functional reference, not a visual clone.
- **Simple by Default, Detailed on Demand:** Prioritize compact, readable, intuitive interfaces with the immediate task and primary controls visible first.
- Keep advanced statistics, technical metadata, and secondary actions accessible through contextual tooltips, expandable details, dialogs, or other deliberate interactions.
- Avoid redundant labels, unnecessary scrolling, repetitive non-actionable warnings, and large always-visible information panels. Keep important errors, data limitations, and safety-critical warnings visible and actionable.
- Desktop-first editing is acceptable.
- Shared/read-only builds should remain reasonably usable on smaller screens.
- Item/mod search must be fast and understandable.
- Math should be inspectable through expandable breakdowns rather than hidden behind one final number.

## Character Import Rules

- Treat CharacterSheet and Storage reports as user-provided snapshots.
- The snapshot is as current as the export timestamp; do not call the format stale because an example file is old.
- Parse imports locally in the browser unless a later ticket explicitly requires upload.
- Do not infer an item is equipped merely because `IsInInventory` is true.
- Preserve imported item-instance TSys powers and tiers.
- Do not claim Mastery Spark distributions were imported unless the export actually exposes them.

## Git / Scope Rules

- One feature branch per ticket.
- Suggested format: `feature/tXXXX-short-name`.
- Do not modify files listed under a ticket's **Do Not Touch** section.
- Do not combine unrelated cleanup with feature work.

## Testing Rules

- Run the ticket-required tests.
- Run `npm run build` once the script exists unless the ticket explicitly exempts it.
- Add focused tests for pure calculation/data logic when appropriate.
- For RNG/Spark tests, use deterministic seeded inputs.
- A passing build does not replace manual verification.

## Completion Report

Every Codex run must report:

- Ticket ID and title
- Summary of changes
- Files changed
- Commands run
- Build/test results
- Manual verification steps
- Risks or assumptions
- Follow-up tickets/issues discovered
- Documentation that should be updated

Do not silently continue into another ticket after completing the assigned one.
