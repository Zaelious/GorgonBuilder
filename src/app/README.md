# T0008 — Skill and Ability Planner UI

Continues the existing `feature/t0008-skill-ability-planner` branch and PR #12.
Implements the [latest customer usability review](https://github.com/Zaelious/GorgonBuilder/pull/12#pullrequestreview-5725481849)
and the requested inline build-title editor. Customer usability acceptance remains
pending; do not merge or begin T0009.

## Current interaction

Skills & Abilities has two independent combat-skill rows, each with a selector,
editable level, six ordered icon slots and an on-demand searchable picker.
Blank, different and duplicate skill combinations retain independent levels and
bar order. New additions fill the next open position up to six; full bars explain
replacement/removal. Overfull legacy drafts remain intact on restoration.

**Changing a skill ID, including clearing it, atomically clears only that slot's
ability bar.** Selecting the same ID is a no-op and preserves its bar. The other
skill/level/bar and unrelated document fields are unchanged. The clear uses the
same committed edit and autosave path as the skill selection, so stale abilities
do not return after refresh. There is no confirmation dialog or extra undo state.

The picker shows official UpgradeOf families, icons, tier counts and highest-level
quick-add. Highest published Level wins, with lexicographically smallest official
ID on ties; configured skill level does not constrain the choice. Expanding a
family shows compact tier rows: exact name, optional published rank, level,
power, base damage and Add/Use. An individual Details button expands the full
facts for **one tier at a time**, rather than rendering a full card per tier.
Exact official IDs and published string/number/null ranks are saved unchanged.

Equipped slots open an accessible, viewport-aware detail panel on hover/focus/
click/touch. The compact desktop panel is 360 px wide (bounded on mobile), with
small icon/name, short description and stacked Min Level, Power, Reuse, Range
and Base damage/type rows. Short explicit SpecialInfo text stays visible.
Unpublished ranks are omitted. More details contains official ID, provenance,
supplemental damage components, special values/DoTs and longer special notes.
Descriptions over 240 characters have an explicit Read full description control;
expansion replaces the preview rather than repeating it. Normal facts should be
readable without internal scrolling; expanded content is bounded to the viewport.

Remove remains a compact primary action. Replace and move earlier/later are in
an Edit bar disclosure. Native disclosures, bounded modal Tab traversal, focus
return, Escape/close/outside dismissal and invoker-linked popover navigation remain
keyboard accessible. One equipped detail panel is active across the two bars.

**Above-level selections and unpublished ranks produce no yellow badges or
warning paragraphs.** Level remains a source reference, not an unlock engine.
Truly unresolved IDs, incompatible restored selections, explicit conflicting
published ranks, snapshot/schema incompatibility and storage failures remain
visible and actionable. Six-slot capacity feedback and legacy overflow are
retained.

## Inline build title

Click the heading or subtle pencil to edit. Enter or blur commits a trimmed,
nonempty title through `BuildDocument.title` and the existing 500 ms local
autosave. Escape cancels without a later blur commit. Blank Enter stays in the
editor with a clear error; blank blur keeps the previous title. Uncommitted text
is transient. Refresh restores the saved title. Protected/read-only drafts also
disable title editing. No build library, Manage tab or remote saving is added.

## Persistence and data integrity

The implementation reuses `loadGameDataRepository()`, `createLocalPersistence()`
and `createDraftAutosave()` unchanged. BuildDocument v1 is unchanged. Committed
edits schedule the existing 500 ms debounce; pagehide, hidden visibility and
unmount flush pending work. Failed writes retain work for retry. Initial render,
search, disclosures, picker/popover state and title keystrokes do not save.

Malformed draft recovery remains explicit. Future-schema and unreadable drafts
are protected from editing/overwrite; restore storage access and reload to retry
an unreadable draft. Original saved data versions remain intact; unavailable
snapshots are read-only. Equipment, targets, title/notes, import metadata, mods
and Sparks are preserved except the field explicitly edited.

This usability pass does **not** change normalization, raw inputs, generated
artifacts, source facts, canonical IDs, rank selection or integrity checks. The
previous approved display extension still exposes the 5,972 exact v490 IconID
values and 2,029 optional SpecialInfo strings. The pinned official index documents
`/v{version}/icons/icon_{id}.png`; icons use that exact version/ID mapping and a
neutral fallback for failures. Elder Game credit remains visible.

## Files changed in this revision

- `src/app/App.tsx`: connect the inline title to the committed editor path.
- `src/app/editor/BuildTitle.tsx`: title editing, commit/cancel/validation and focus.
- `src/app/editor/build-editor.ts` and `.test.ts`: atomic skill/bar changes,
  title edits and quieter source diagnostics.
- `src/features/abilities/AbilityFacts.tsx`: compact source facts and disclosures.
- `src/features/abilities/AbilityPicker.tsx`: compact tier rows and one full detail
  expansion on demand.
- `src/features/abilities/AbilityPlanner.tsx`: compact header/actions, disclosure
  positioning and removal of normal level warnings.
- `src/app/planner.css`: compact details/picker and responsive inline title styles.
- `src/test/App.test.tsx`: updated skill-switch expectations, disclosure/quiet-level
  checks and focused title/autosave/refresh tests.
- This README: current completion and verification handoff.

## Verification

Node 24.19.0; existing dependencies/test infrastructure, no package changes.

- `npm run data:update -- --check` — passed; official v490 pin intact.
- `npm run lint` — passed with no warnings.
- `npm run typecheck` — passed for both strict TypeScript projects.
- `npm test` — **343 tests across 11 files passed** (335 previously).
- Focused editor/UI tests — **48 passed**, including title Enter/blur/trim/cancel/
  blank rejection/refresh, same-ID retention, isolated skill clearing and restore,
  compact disclosures and no noisy level warnings.
- `npm run build` and `git diff --check` — passed.
- Wrangler dry-run and final-head CI/Cloudflare deployment results are recorded
  in the PR completion report after pushing this revision.

### Browser checks

Chromium passed the workflows below on the final production bundle, including
real official icons. The normal Hook Shot panel measured **360 px wide × 322 px
client height**, with **322 px scroll height** (no internal scrolling). Desktop
1440×900 and mobile 375×812 passed without horizontal overflow or unexpected
console/page errors. Mobile checks used a touch-enabled context and verified
title blur commit, detail/picker touch controls and keyboard Escape.

Verify a normal Hook Shot detail fully readable without its own scroll, optional
More/Edit disclosures, the longest official combat description (Trigger Golem,
333 characters) with explicit expansion, compact family/tier browsing, one tier's
full details at a time, six-slot capacity and removal, Animal Handling → Archery
clearing only A, same-ID retention and refresh, and mobile touch/keyboard behavior.
Title checks cover Enter and blur, trimmed values, Escape, blank rejection and
refresh restoration. Screenshots are local review artifacts from the production
bundle at desktop 1440×900 and mobile 375×812.

## Risks and follow-up

- Customer hands-on acceptance on the refreshed Cloudflare preview remains
  required. This sandbox's outbound policy blocks direct access to the Workers
  preview hostname; deployment is confirmed through Cloudflare's PR bot, while
  browser smoke tests use the local production bundle with real official CDN
  icons and normal TLS verification.
- Keep the existing **Vite gzip transport issue separate**: Vite dev/preview
  auto-decompresses artifacts before T0006's compressed-byte checks. Fix normal
  dev/preview before T0009 without weakening integrity checks. No loader/hosting
  workaround is included.
- Icons depend on the versioned official CDN and have explicit failure fallbacks.
  Only the current data snapshot is bundled; no historical-snapshot loader or
  implicit migration is added. Full-repository memory/latency remains a T0006
  follow-up (original local observation: roughly 195–239 MB JS heap).
- After acceptance and merge, synchronize Repo_Current_State, Tickets,
  Manual_Verification_Guide, MVP_Technical_Design, Build_Save_And_Share_Design and
  Known_Issues_And_Followups in the planned documentation-only follow-up. Include
  the revised clearing/title behavior and current disclosure UX.

No equipment/mod UI, remote saving, future tabs or T0009 work is introduced.
