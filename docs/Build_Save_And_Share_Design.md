# GorgonBuilder — Build Save and Share Design

**Status:** Approved product contract; local draft persistence implemented in T0007; provider implementation pending  
**Version:** 1.0  
**Date:** 2026-10-31

## Goals

- Save builds permanently.
- Share a read-only public link.
- Let anonymous creators later edit/delete their own build.
- Avoid mandatory accounts for initial release.
- Allow later accounts without invalidating existing anonymous builds.

## Build Record

Conceptual record:

```text
publicId
schemaVersion
gameDataVersion
buildJson
createdAt
updatedAt
ownerTokenHash
```

Optional later fields:

- account owner ID
- visibility
- title/description indexes
- soft-delete timestamp
- fork parent ID

## Public ID

Requirements:

- URL-safe
- sufficiently collision-resistant
- not derived from owner token
- safe to expose publicly

Example route:

```text
/build/8F3K2A
```

Actual encoding/length chosen during implementation.

## Owner Token

On create:

1. Backend generates or accepts a cryptographically strong random owner token.
2. Backend stores a secure hash.
3. Plain token is returned once to the creator.
4. Browser stores it keyed by public build ID.

The public share URL must not contain it.

## Owner Management Link

The UI should offer a separate private recovery/management link that can transfer ownership capability to another browser.

That link is sensitive. The product should clearly distinguish:

- **Share link** — safe to share, read-only
- **Manage link** — private, grants edit/delete rights

## Operations

### Create

Input:

- validated BuildDocument

Output:

- public ID
- owner token
- public URL
- management/recovery representation

### Read

Anyone with public ID can read an unlisted build.

### Update

Requires:

- public ID
- valid owner token
- valid schema payload

### Delete

Requires:

- public ID
- valid owner token
- explicit confirmation in UI

Initial MVP may hard-delete.

### Duplicate

Read public build and create a new independent build with a new owner token.

## Local Ownership Store

Browser storage maps:

```text
publicBuildId -> ownerToken
```

The application should not embed the token inside normal saved build JSON.

## Lost Token

Without an account or possession of the management link, ownership cannot be proven.

The UI should communicate this before relying on anonymous ownership for important builds.

## Future Accounts

An authenticated account may claim an anonymous build by providing its valid owner token.

Do not require migration of the public build ID/link.

## API Security

- Rate-limit abusive create/update/delete patterns when deployed.
- Validate build schema and maximum payload size.
- Store token hashes only.
- Use timing-safe token verification where practical.
- Do not expose whether an owner token is "close" or otherwise leak validation detail.
- Escape/render build titles/notes safely.

## Provider Selection

The core app should depend on a `BuildRepository` interface, not directly on one hosting vendor.

A dedicated ticket will compare/select a small backend based on:

- low complexity
- low/no cost for early use
- HTTPS
- simple key/value or relational persistence
- server-side hashing/token verification
- easy deployment from GitHub
- manageable local development

## Offline Drafts

A local draft should exist even before remote saving.

Network failure must not destroy the user's in-progress build.

### Implemented in T0007

- `BuildDocument` schema v1 is defined in `src/core/build/document.ts`; validation and serialization are in `src/core/build/validation.ts`.
- The draft stores top-level `schemaVersion` and `gameDataVersion`, optional app version, build title/notes, independent skill slots and ability bars, equipment/instances, candidate mods, Sparks, target settings and optional character-import reference metadata. Owner credentials are **not** part of the build document.
- `createLocalPersistence` in `src/persistence/local/storage.ts` saves the draft to `gorgonbuilder.current-draft` and versioned preferences to `gorgonbuilder.preferences`. The current local APIs are `saveDraft`, `restoreDraft`, `updatePreferences`, and `restorePreferences`.
- Missing or malformed storage returns a default with explicit recovery status, preserving original bytes until a subsequent explicit save. Unsupported versioned payloads cannot be overwritten by normal saves or autosave; an explicit migration/reset flow is future work.
- `createDraftAutosave` in `src/persistence/local/autosave.ts` implements validated snapshots, default 500 ms debounce, flush/cancel and explicit retry. The T0008 editor will wire its lifecycle and user-facing error handling.
- Existing local draft storage is **not** remote/public saved-build hosting or ownership token storage. Future T0018–T0020 work must preserve these separations.

See [build domain README](../src/core/build/README.md) and [PR #10](https://github.com/Zaelious/GorgonBuilder/pull/10).
