# Build domain and local persistence (T0007)

`document.ts` defines schema **1** and `createDefaultBuildDocument`. Pass the
loaded runtime repository's `gameDataVersion`, plus `createdWithAppVersion` when
available. There is no architecture-wide snapshot pin or implicit migration.

The JSON contains title/notes, skill slots A/B, independent ordered bars A/B,
equipment entries with candidate mods and per-item Sparks, a target, and an
optional character-import reference. It contains no canonical definitions,
transient editor state, remote record, or ownership credentials.

## Identity and interpretation

- Skill, ability and item IDs are the official IDs accepted by T0006 lookups.
  An ability ID identifies its exact upgrade; `rank` preserves the publisher's
  explicit string/number/null Rank, never an inferred Level or display suffix.
- `getUniqueActiveSkillIds` returns fresh IDs in A-then-B order, deduplicated.
  It never combines levels or bars. Selecting Psychology at 90 and 70 preserves
  both levels; T0012 must decide how to calculate progression from that input.
- Existing instance powers retain composite `{powerId, tierId}` identity.
  Candidate mods are separate ordered entries; their tier may be null until
  chosen. There is no candidate-count, eligibility or slot-legality enforcement.
- Database items reference a canonical item ID. Manual/imported instances store
  lightweight instance fields, optional provenance and uninterpreted JSON
  metadata. A manual instance may have no known base item ID. Imported reports
  are not parsed here; `IsInInventory` metadata never implies equipped status.
- Spark modes are `none`, `simulated` (input plus optional versioned output), and
  `actual` (manual outcome counts). Counts describe the five planned Skill Damage
  outcome categories; no RNG, probability, modifier values or damage is computed.
  T0015 owns eligibility, modeled limits, result/input consistency and simulation.
- Targets default to one enemy and no damage-type overrides. Resistance and
  vulnerability values are reserved finite numeric inputs with no assigned units
  or formula. T0014 must define/validate their meaning before consuming them.
  Extra future target properties can live in JSON metadata.

## Validation and serialization

`validateBuildDocument`, `serializeBuildDocument` and
`deserializeBuildDocument` return discriminated results (`ok` with `value`, or
`reason`). Errors distinguish invalid JSON, invalid structure and unsupported
schema versions. Only v1 is accepted; older and future integer versions require
an explicit future migration. JSON round-trips preserve IDs, order, unknown
metadata and the saved game-data version.

Validation checks required/nested fields, union modes, finite values and safe
integer levels/counts. It rejects cycles, non-JSON values and unexpected schema
fields; optional unknown instance/report data belongs in `metadata`. Validation
does not load game data or assert foreign-key existence, rank consistency, combat
eligibility, level caps, or formulas. The consumer must resolve IDs against the
saved snapshot and report unavailable records rather than silently substituting.

## Local API and autosave

```ts
import { createDefaultBuildDocument } from './document';
import { createLocalPersistence } from '../../persistence/local/storage';
import { createDraftAutosave } from '../../persistence/local/autosave';

const local = createLocalPersistence({ gameDataVersion: repository.gameDataVersion });
const restored = local.restoreDraft();
const draft = restored.value; // fresh default on missing/malformed/unavailable data
// Inspect restored.status and, for fallback, restored.error before showing recovery.
const autosave = createDraftAutosave(local, { onResult: handleSaveResult });
autosave.schedule(draft); // call on committed build changes, not transient UI changes
// autosave.flush() on the editor's chosen lifecycle event; cancel() on cleanup
local.updatePreferences({ minimumEquipmentLevel: 95 });
local.restorePreferences();
// Explicit save also returns a result:
local.saveDraft(createDefaultBuildDocument({ gameDataVersion: repository.gameDataVersion }));
```

`createLocalPersistence` lazily resolves browser localStorage. Inject a
`StorageLike` (`getItem`/`setItem`) for tests, or null to disable storage. Missing
storage/SSR, blocked getters, invalid JSON, incompatible versions and read/write
exceptions return explicit results without throwing. Restore never writes or
deletes stored text. It returns fresh defaults with a `missing` or `fallback`
status; valid older game-data versions remain labeled with their original version.

An explicit subsequent save can replace malformed data. Unsupported schema
payloads are protected from **all** writes, including autosave of a fallback;
an intentional reset or explicit migration must be implemented by a later editor
flow. Read failures also prevent blind overwrite. Draft and preference keys are
separate and do not store future ownership tokens. Preference schema 1 defaults
to minimum equipment level 90 (null disables it). This stores a preference only;
KI-0007/T0009 still owns the meaning of the equipment-level filter.

Autosave defaults to 500 ms and snapshots validated JSON at schedule time. It
debounces to the latest snapshot, supports flush/cancel, reports write failures,
and retains failed work for an explicit retry without a timer loop. An invalid
new schedule cancels older pending work. The editor owns lifecycle events and
error presentation. Storage is synchronous and has no multi-tab conflict policy.

## Verification and handoff

```sh
npm ci --cache /tmp/gorgonbuilder-npm-cache
npx vitest run src/core/build/document.test.ts src/persistence/local/storage.test.ts src/persistence/local/autosave.test.ts
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Manual/architect review (no new UI is expected):

1. Inspect a serialized default. Confirm schema version, explicit snapshot,
   distinct empty slots/bars, empty equipment and one neutral target.
2. Inspect the `populatedBuild` test fixture and its round-trip: different levels
   of the same skill, independently ordered bars, exact power/tier pairs, many
   candidates, instance metadata and all Spark modes. The official-artifact test
   additionally uses actual committed IDs and explicit rank values.
3. Run the storage/autosave tests. Check malformed recovery, retained future
   schemas, blocked storage access, quota failures and debounce/flush/retry.
4. Run the full quality suite above. No UI, import, calculation or remote flow
   has been introduced; T0008 connects the editor to this API.

After merge, update `docs/Repo_Current_State.md` (T0007 completion, APIs/source
tree, checks, next ticket T0008), `docs/Manual_Verification_Guide.md` (the schema
and storage checks above), and the implemented-schema/local-storage sections in
`docs/MVP_Technical_Design.md` and `docs/Build_Save_And_Share_Design.md`. Those
central documents are outside this ticket's allowed write areas.

No new follow-up issue is required. Existing work remains T0009/KI-0007 (filter
semantics), T0011 (local import), T0012 (duplicate-skill level interpretation),
T0014 (target inputs), T0015 (Sparks) and T0018–T0020 (remote ownership/sharing).
