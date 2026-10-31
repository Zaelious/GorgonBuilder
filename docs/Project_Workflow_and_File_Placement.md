# GorgonBuilder — Workflow and File Placement

**Status:** Active  
**Version:** 1.0

## Canonical Source

GitHub repository `Zaelious/GorgonBuilder` is canonical.

ChatGPT Project source files are mirrored planning/reference documents for cross-chat context.

If they disagree, GitHub wins.

## Repository Layout

```text
GorgonBuilder/
├─ README.md
├─ AGENTS.md
├─ LICENSE
├─ docs/
│  ├─ Product_Decisions.md
│  ├─ Full_Design_Document.md
│  ├─ MVP_Technical_Design.md
│  ├─ Damage_And_DPS_Model.md
│  ├─ Data_Source_And_Normalization.md
│  ├─ Build_Save_And_Share_Design.md
│  ├─ Character_Import_And_Validation.md
│  ├─ Tickets.md
│  ├─ Codex_Prompt_Playbook.md
│  ├─ Manual_Verification_Guide.md
│  ├─ Repo_Current_State.md
│  ├─ Design_Update_Companion.md
│  ├─ Known_Issues_And_Followups.md
│  ├─ Codex_Ticket_Handoff_Template.md
│  ├─ Prompt_Context_Pack.md
│  └─ Project_Workflow_and_File_Placement.md
└─ src/   (created by tickets)
```

## ChatGPT Project Source Files

Upload the Markdown documentation pack to the ChatGPT Project.

You do not upload them separately into every new chat.

Recommended new-chat workflow:

```text
New chat inside GorgonBuilder Project
User: Start T0001
```

ChatGPT should retrieve:

- Tickets
- Repo_Current_State
- AGENTS
- relevant design docs
- current GitHub branch/repo state

and then produce the scoped Codex prompt.

## Main Planning Chat

Keep one long-running planning/Scrum chat for:

- product changes
- architecture
- ticket batch planning
- formula research decisions
- Codex completion review
- PR review
- roadmap

## Ticket Chats

Prefer one clean chat per ticket inside the same Project.

Example title:

```text
T0001 — Project Skeleton
```

This reduces accidental carry-over from unrelated implementation work.

## What Codex Gets

Codex gets the GitHub repository/branch and the ticket handoff prompt.

Because the documentation is committed in the repository, do **not** repeatedly upload separate copies of the docs to Codex.

## Lifecycle

```text
Planning
  ↓
Ticket in Tickets.md
  ↓
feature/tXXXX branch
  ↓
"Start TXXXX" chat
  ↓
ChatGPT Codex handoff
  ↓
Codex implements one ticket
  ↓
completion report
  ↓
manual verification
  ↓
PR
  ↓
ChatGPT PR review
  ↓
merge
  ↓
update Repo_Current_State
  ↓
next ticket
```

## Documentation Sync

When a material design decision changes:

1. Update canonical GitHub Markdown.
2. Commit it.
3. Refresh the corresponding ChatGPT Project source-file mirror.
4. New chats use the refreshed mirror.

`Repo_Current_State.md` should be refreshed often because it describes reality, not planned future state.
