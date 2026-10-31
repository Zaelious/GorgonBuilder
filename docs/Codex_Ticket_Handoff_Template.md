# GorgonBuilder — Codex Ticket Handoff Template

Use this for one ticket only.

```text
We are working on GorgonBuilder.

Before coding, review:
- AGENTS.md
- docs/Product_Decisions.md
- docs/Full_Design_Document.md
- docs/MVP_Technical_Design.md
- docs/Tickets.md
- docs/Repo_Current_State.md
- docs/Manual_Verification_Guide.md
- [ticket-specific docs]

Implement this ticket only.

Ticket:
[TXXXX — Title]

Branch:
[feature/tXXXX-short-name]

Goal:
[goal]

Dependencies:
[dependencies]

Allowed areas:
- ...

Do not touch:
- ...

Requirements:
- ...

Non-goals:
- ...

Acceptance criteria:
- ...

Manual verification:
1. ...

Project rules:
- Implement the requested ticket only.
- Do not implement future-ticket features.
- Do not refactor unrelated code.
- Do not introduce new architecture unless required.
- Avoid unnecessary dependencies.
- Keep changes small and testable.
- Keep React out of core calculation/data logic.
- Do not invent Project Gorgon mechanics.
- Preserve formula confidence/warnings for unvalidated behavior.

After implementation, provide:
- Ticket ID/title
- Summary of what changed
- Files changed
- Commands run
- Lint/typecheck/test/build results
- Manual verification steps
- Risks/assumptions
- Follow-up issues/tickets
- Docs that need updating
```
