# GorgonBuilder — Codex Prompt Playbook

**Status:** Active  
**Version:** 1.0

## Standard Ticket Prompt

Use the template in `Codex_Ticket_Handoff_Template.md`.

A ticket prompt should always identify:

- exact ticket ID/title
- branch
- dependencies
- allowed areas
- do-not-touch areas
- requirements
- non-goals
- acceptance criteria
- manual verification

## Before Coding

Codex must read:

- `AGENTS.md`
- `docs/Full_Design_Document.md`
- `docs/MVP_Technical_Design.md`
- `docs/Tickets.md`
- `docs/Repo_Current_State.md`
- `docs/Manual_Verification_Guide.md`
- specialized docs relevant to the ticket

## If the Ticket Is Ambiguous

Do not silently choose a new architecture.

Codex should:

1. Prefer the design docs.
2. Prefer the smaller implementation.
3. Report the ambiguity in the completion report.
4. Stop short of implementing unrelated future behavior.

## If Codex Finds a Bug Outside Scope

Do not fix it unless required for the assigned ticket to function.

Report:

- location
- impact
- suggested follow-up ticket

Add/update `Known_Issues_And_Followups.md` only when the ticket allows documentation edits or the handoff explicitly asks for it.

## If a Build/Test Fails for Pre-Existing Reasons

Report:

- failing command
- exact error
- evidence it predates the ticket if available
- whether the ticket can still be manually verified

Do not undertake a broad repair without approval.

## Completion Report Format

```text
Ticket:
Summary:

Files changed:
- ...

Commands run:
- ...

Results:
- lint:
- typecheck:
- tests:
- build:

Manual verification:
1. ...

Risks/assumptions:
- ...

Follow-ups:
- ...

Docs needing update:
- ...
```

## ChatGPT Handoff Workflow

In a new ChatGPT Project chat, the customer may simply say:

```text
Start T0007
```

ChatGPT should retrieve the current ticket and repo state and produce the complete Codex prompt.

After Codex completes, paste its report back into that ticket chat for review.
