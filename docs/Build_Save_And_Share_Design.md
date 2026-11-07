# GorgonBuilder — Accounts, Build Save/Share and Discovery Design

**Status:** Approved revised product-owner direction 2026-11-06: registered accounts, public/private builds, personal library and public discovery are MVP scope. T0018 Cloudflare Workers + D1 was explicitly selected. This supersedes the earlier **anonymous owner-token-first** contract.
**Version:** 2.0
**Date:** 2026-11-06

## Goals and MVP roadmap

Guest planning and local autosave work without signup. Registration enables persistent owner-managed builds, personal library/profile, publication/privacy controls, and independent copying. Public users can browse, search and view published builds.

- T0018 [issue #46](https://github.com/Zaelious/GorgonBuilder/issues/46): Cloudflare Workers + D1 backend and auth architecture/migrations/local health.
- T0019 [issue #48](https://github.com/Zaelious/GorgonBuilder/issues/48): signup/login sessions, D1 user/build CRUD, account ownership and visibility ACL.
- T0020 [issue #49](https://github.com/Zaelious/GorgonBuilder/issues/49): account UI, My Builds, save/share, personal profile and copy, default skill-pair titles.
- T0020-F1 [issue #50](https://github.com/Zaelious/GorgonBuilder/issues/50): public Search Builds directory, author pages and combat-skill filters.
- T0021: v1 release regression/security/launch. T0016/T0017 are post-MVP.

## Backend and authentication

T0018 is merged via PR #52. T0019 runtime API/D1 implementation is under review, not merged or hosted-verified; see [verification](T0019_Verification.md). T0020 UI and T0020-F1 search remain pending.

Use the already existing Cloudflare Workers Static Assets host, adding a same-origin Worker API and Cloudflare D1 database. Preserve the Vite SPA, v490 data, BuildDocument v1 and local `gorgonbuilder.current-draft`.

A supported Cloudflare D1-compatible authentication library (Better Auth 1.7.18 native D1 was accepted through PR #52) manages accounts, OAuth provider identities, session cookies and expiry; **do not hand-roll password handling**. Recommended MVP quick signup: **Discord and Google OAuth**, then select a unique GorgonBuilder public username. OAuth client creation and callback origins require owner's credentials and explicit authorization. Email/password would require a genuine verified email/reset delivery system and separate approval. Browsing/planning remains available as a guest; login is required to persist to account or copy into My Builds.

Use stable immutable server-generated `userId` for authorization, **never** a changeable username, public build ID, client-provided owner field or email. Username is normalized for uniqueness (case-insensitive) and separately displayed to other users; reserve route-dangerous/admin handles. User identities/sessions are private, not bundled into build JSON.

**Removed MVP design:** anonymous permanent owners holding secret edit/delete tokens and private management/recovery links. Earlier descriptions of those were speculative and **have not been implemented**. Don't implement two overlapping ownership systems.

## Build record and JSON boundary

Conceptual persisted record:

```text
buildId (opaque public identifier)
ownerUserId
visibility ('private' | 'unlisted' | 'public')
title
publicDescription (optional, distinct from private editor notes)
skillAId / skillBId (derived from validated BuildDocument slots)
buildJson (validated BuildDocument schema v1)
schemaVersion / gameDataVersion
createdAt / updatedAt
```

Account and session records are separate. Canonical skill IDs, title/search metadata and owner must be server-validated and synchronized; don't trust client search keys. No raw CharacterSheet or Storage report upload; imported item-instance working powers exist in saved build JSON; only audited build mechanics are included in non-owner representations.

T0019 non-owner DTOs and foreign copies remove `characterImport`, item instance IDs/custom names/provenance/metadata (including `sourceItem`), target extension metadata, app-version metadata, and private notes; effective working powers, candidate mods, Sparks and target mechanics remain. Owner reads preserve exact BuildDocument v1. Free-form build titles/public descriptions are deliberately public author text.

BuildDocument's `notes` are not implicitly a public search summary. Keep a separate author-controlled `publicDescription` in server listing metadata if needed; public view/disclosure of actual BuildDocument fields must be clear. Keep BuildDocument schema v1 unless a separately approved migration is necessary.

## Visibility — exact user-facing meaning

- **Private (default):** only signed-in owner may read or edit; an ID/link alone is not access. Never included in public search, author profile or public counts.
- **Unlisted:** anyone holding the URL may view read-only; not searchable and not listed in public author pages/directory. Not confidential once URL shared.
- **Public:** readable by anyone via link and indexed in Search Builds and public author profiles. Only owner edits/deletes.

Changes from Public/Unlisted to Private must immediately remove outsider read access and public index/count exposure; caches must not leak revoked content. A public share link must not contain auth/session secrets.

## API and core flows

Illustrative same-origin API:
- `/api/auth/*`: selected supported authentication/session endpoints.
- `POST /api/builds`: account-only create, default Private.
- `GET /api/builds/:id`: Public and Unlisted guest read, Private owner-only.
- `PATCH /api/builds/:id`, `DELETE /api/builds/:id`: owner-only.
- `GET /api/me/builds`: signed-in owner library across all visibility states.
- `POST /api/builds/:id/copy`: authenticated user independently copies a viewable build to a fresh **Private**, owner-bound record. (Exact REST shape chosen in T0018/T0019.)
- `GET /api/builds/search`: Public-only server-side indexed search, implemented T0020-F1.
- `GET /api/users/:username`: public profile and Public builds only; signed-in owner's personal view is distinct.

Public build IDs are collision-resistant and nonsequential where practical. An unlisted ID is not an authorization token; it only confers guest read access by product design. Enforce all private/owner access on server, not just frontend.

### Build naming and copying

When choosing two combat skills, default new build title to official `SkillA/SkillB`, e.g. `Deer/Psychology`, `Cow/Unarmed`. For one/zero skills, use a sensible fallback. Titles may be edited freely; never overwrite a customized title when skill selections change. Saved new build defaults Private. Copy Public/Unlisted creates **new** build ID and user owner, default Private. This is **not** post-MVP T0017 A/B comparison.

## Search Builds and profiles (T0020-F1)

The directory has text search against public title, public description and author username/display name, with zero to two **combat-skill** ID filters. One chosen skill matches either slot. Two chosen skills with **Match both skills ON** require both anywhere in the two skill slots (AND, order-independent); OFF permits either skill (OR). Text and skills combine as AND. Show recent public builds by default. Server-side pagination and sorting are required; do not load every row in browser.

Use D1 indexes and/or FTS5 with documented correctness and costs. Public search/author profiles show only Public; owner My Builds shows all their Private/Unlisted/Public with visibility badges, sorting and skill filtering. Do not leak nonpublic content via result counts, author names, sort order or search autocomplete.

## Navigation

Desktop sidebar or equivalent responsive navigation: Home, Build Planner, Search Builds; signed-in My Builds and Profile. Empty guest states must provide a useful sign-in path without blocking the planner. Search Builds entry must not be a dead link before T0020-F1 is implemented.

## Security and privacy

- Keep OAuth secrets and session cookies outside BuildDocument, git, logs and share URLs; secure HttpOnly SameSite cookies, CSRF and callback validation.
- Server-side authorization for every mutation and private read; privacy tests across two different users and anonymous browsers.
- Validate BuildDocument schema/game-data versions, payload size and title/description length, avoid unsafe HTML rendering.
- Protect account registration, password reset (if added later), public posting and search from spam/abuse; record rate limits and moderation/unpublication procedure.
- Use D1 migrations, test/staging/production isolation, backups/recovery instructions and transparent free-tier monitoring.
- Preserve local drafts on login/logout, app errors, failed uploads, or save conflicts.
- User profiles disclose only chosen public handle, voluntarily public metadata and public builds. No email, OAuth ID or private report fields.

## Historical implementation reference

The following completed local-draft/equipment work remains valid; its older future anonymous-save discussion is superseded by this version.

### Implemented in T0007

- `BuildDocument` schema v1 is defined in `src/core/build/document.ts`; validation and serialization are in `src/core/build/validation.ts`.
- The draft stores top-level `schemaVersion` and `gameDataVersion`, optional app version, build title/notes, independent skill slots and ability bars, equipment/instances, candidate mods, Sparks, target settings and optional character-import reference metadata. Owner credentials are **not** part of the build document.
- `createLocalPersistence` in `src/persistence/local/storage.ts` saves the draft to `gorgonbuilder.current-draft` and versioned preferences to `gorgonbuilder.preferences`. The current local APIs are `saveDraft`, `restoreDraft`, `updatePreferences`, and `restorePreferences`.
- Missing or malformed storage returns a default with explicit recovery status, preserving original bytes until a subsequent explicit save. Unsupported versioned payloads cannot be overwritten by normal saves or autosave; an explicit migration/reset flow is future work.
- `createDraftAutosave` in `src/persistence/local/autosave.ts` implements validated snapshots, default 500 ms debounce, flush/cancel and explicit retry. The T0008 editor wires its lifecycle and user-facing error handling.
- Existing local draft storage is **not** remote/public saved-build hosting or ownership token storage. Future T0018–T0020 work must preserve these separations.

### Implemented in T0008

- The planner edits one browser-local draft: title, two independent skill levels/selections, exact ability IDs/ranks and ordered bars. Switching a skill clears only that bar; unrelated build fields remain intact.
- The existing 500 ms autosave saves committed edits and restores them on refresh; title keystrokes, searches, tooltips and dialogs are transient.
- Pagehide/visibility flush and explicit retry report failures. Future-schema, unreadable storage and unavailable game-data snapshot drafts are protected from accidental overwrite.
- No multi-build library, remote ownership tokens, public/private sharing, or backend is added; those remain T0018–T0020.

### Implemented in T0009

- The equipment planner saves official database item IDs and exact original slot names in `BuildDocument.equipment` through the T0008 immutable editor and 500 ms debounced autosave. The nine primary UI rows and collapsed Other slots are presentation-only. T0009-F1 treats official `OffHand` and `OffHandShield` as mutually exclusive alternatives in one physical position; the selected item's original canonical slot remains unchanged in storage. Cross-type swaps replace the existing entry without discarding its staged mods (since T0015, the replaced item's Mastery Sparks are cleared). Legacy multiple-offhand drafts remain unchanged until explicit confirmed resolution. [T0009-F1 verification](T0009_F1_Verification.md).
- Equip, replace and clear retain unrelated skill bars, metadata and legacy/manual/imported selections. Explicit destructive instance replacement or removal of staged mods/Spark data requires confirmation. Candidate mods are preserved on ordinary database-item replacement. **T0015:** Sparks belong to the physical item, so replacing it with a different item clears them after an explicit confirmation; they never transfer to the new item. Spark settings are saved per equipment entry in schema v1 (no migration) and restored by the existing autosave; simulated entries store seed, count, model version and outcomes and are reproduced on load.
- The browser-local `minimumEquipmentLevel` schema-v1 preference defaults to 90; null disables the published target-level filter. Include-unknown and text queries are transient. Incompatible schema, unreadable storage, snapshot mismatches and failed-write retry protections remain in force.
- See [T0009 verification](T0009_Verification.md) and [PR #18](https://github.com/Zaelious/GorgonBuilder/pull/18). There is still no backend save/share or ownership mechanism.

See [build domain README](../src/core/build/README.md), [T0008 app README](../src/app/README.md), [PR #10](https://github.com/Zaelious/GorgonBuilder/pull/10) and [PR #12](https://github.com/Zaelious/GorgonBuilder/pull/12).
