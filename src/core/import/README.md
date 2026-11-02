# T0011 — Character Import Core and Sanitized Fixtures

Pure local parsing for CharacterSheet and Storage snapshots. No React, network,
storage writes, build application, loadout solving or stat/modifier calculations.
The separate `smoke.ts` entry point uses Node filesystem APIs only to read local
files and the existing official runtime dataset. Browser code imports `index.ts`.

## API and contracts

```ts
import { parseCharacterSheetJson, parseStorage, parseStorageJson } from './index';
import { createImportReferenceResolver } from '../../data/adapters/import-references';

const resolver = createImportReferenceResolver(existingGameDataRepository);
const character = parseCharacterSheetJson(characterFileText, resolver);
const storage = parseStorageJson(storageFileText, resolver);
// parseCharacterSheet(parsedUnknown, resolver) and parseStorage(parsedUnknown,
// resolver) accept already-parsed JSON. No resolver is required for parsing.
if (storage.ok) {
  const items = storage.value.items; // ImportedItemInstance[]
}
```

- `ImportResult<T>` is a discriminated `ok` result: value/warnings on success,
  errors/warnings on failure. Issues have severity, code, JSON-pointer path and
  a message without interpolated source values. Core issue paths can contain
  private source keys; use the summary function when sharing diagnostics.
- `ImportedCharacterSnapshot` holds source identity/time/version, skills with
  original progression metadata, ordered known-ability references and unvalidated
  `currentStats`. Ability counts count source entries, including duplicates.
- `ImportedStorageSnapshot` holds report metadata, `ImportedItemInstance[]` and
  explicit equipped-state capability. Each item extends the existing build
  `ItemInstance` and retains source `TypeID`, slot, location, full item metadata,
  source locator, unresolved treasure entries and report provenance. No
  BuildDocument/schema change is needed. An imported snapshot is not automatically
  an editor selection.
- `ImportedReportMetadata` reuses `SourceMetadata`. `exportedAt` is verbatim;
  `sourceReportVersion` preserves the original string/number while `reportVersion`
  provides the existing contract's string projection. Report metadata retains
  everything except the separately represented payload sections.
- References retain `sourceId`, nullable official `id` and `resolved`, `unresolved`
  or `not-checked` status. The optional resolver reuses the existing repository,
  records its game-data version and checks every candidate ID. Source skill IDs,
  exact ability/power IDs or internal names, numeric item TypeIDs and power-owned
  numeric/exact tier keys are supported. No display-name matching, case folding,
  nearest-tier matching or game-data ownership is introduced.
- `treasurePowers` preserves each original entry, including opaque layouts,
  missing tiers, future fields and distinct imbues. `existingPowers` contains only
  resolved normal treasure `(powerId, tierId)` pairs. Unresolved data must remain
  attached when later UI creates build instances; copying only `existingPowers`
  would lose source evidence. Imbues remain separate pending a source-backed
  build-application design.

Malformed report headers, primary collections, items and known typed fields fail
atomically; callers do not accidentally accept a partially imported collection.
Unverified treasure layouts or non-numeric stats survive with warnings. Unknown
optional JSON remains compatible. Invalid JSON, unsafe/non-JSON values, cyclic
objects, accessors and nesting beyond 100 levels fail explicitly. Copies are
detached from inputs and preserve keys such as `__proto__` as data.

## Format evidence and fixture assumptions

No real customer exports were supplied to this implementation. These fixtures
are newly constructed minimal examples, not anonymized copies of someone's
report. They establish supported structural contracts, not proof that every
current game version emits the same shape.

The repository's [import design](../../../docs/Character_Import_And_Validation.md)
and [known limitations](../../../docs/Known_Issues_And_Followups.md) establish
supported information and the inventory/Spark guardrails. Exact field layouts
were cross-checked against these **secondary parser sources**, pinned for review:

- [project-gorgon-data character schema](https://github.com/hjarrell/project-gorgon-data/blob/69cd71d9997ae159878046c00573d67df5787d1d/src/schemas/character_report.ts):
  `Report`, `Character`, `Timestamp`, numeric `ReportVersion`, `Skills` keyed by
  source skill ID, `Level`, `BonusLevels`, XP fields, per-skill string `Abilities`,
  `Race` and `CurrentStats`.
- [project-gorgon-data storage schema](https://github.com/hjarrell/project-gorgon-data/blob/69cd71d9997ae159878046c00573d67df5787d1d/src/schemas/storage_report.ts):
  `Items`, numeric `TypeID`, `Name`, optional `Level`/`Slot`/`Rarity`,
  `TSysPowers: [{ Power, Tier }]`, crafting/attunement/durability/location fields
  and separate `TSysImbuePower`/`TSysImbuePowerTier`.
- [Mithril report model](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/src/Mithril.GameReports/StorageReport.cs),
  [character loader](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/src/Mithril.GameReports/CharacterReportLoader.cs)
  and [item model](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/src/Mithril.GameReports/StorageItem.cs):
  corroborate `ServerName`, core report/skill/item fields and optional `CraftPoints`.

These libraries are evidence for field structure only. Their mechanics and
equipped-item heuristics are not adopted. Official IDs and tiers are resolved
solely through GorgonBuilder's existing pinned official repository.

Explicit assumptions/limits:

- Required header: nonempty `Report`, `Character`, `Timestamp`, and integer or
  nonempty string `ReportVersion`. `ServerName` is optional because it is absent
  from one secondary schema. Filename-derived character/server guesses are not
  made. Unknown identity metadata remains available in `source.metadata`.
- CharacterSheet requires object `Skills` and `CurrentStats`; skills require
  nonnegative integer `Level`. Bonus levels/XP/abilities are optional. Storage
  requires an `Items` array; each item requires source `TypeID` and `Name`.
  Empty collections are valid. A new incompatible required shape fails clearly.
- Fixture version `1`, timestamps, names, levels and crafting values are synthetic
  example values, not a version compatibility whitelist or validated gameplay
  state. The fixture treasure pairs also exercise source preservation rather
  than item/profile legality. No report age cutoff is imposed.
- No authoritative equipped-state or stable item-instance ID field was verified.
  Capability is explicitly unavailable and every item's equipped state is unknown.
  A slot, `IsInInventory` or an unfamiliar `IsEquipped`-like name is insufficient
  evidence. `sourcePath` is an array locator, never an invented game instance ID.
  If a future report exposes an ID or equipment field, its raw value already
  survives in metadata; typed interpretation requires source-semantic evidence.
- `CraftPoints`, augmentation and other optional metadata are retained exactly,
  without fabricated Spark rolls/counts. `sparkHistory` is unavailable. Test-only
  `FixtureAugmentationMetadata`, `Future*`, `IsEquipped` and `EquippedSlot` are
  deliberately synthetic forward-compatibility/adversarial fields; they are not
  claimed to be Project Gorgon fields.
- Numeric tiers are tested as exact `id_N` keys under their owning power. Unknown
  keys are never approximated. Unknown/unresolved power layouts remain source JSON.
- Timestamp strings are retained even if unparseable, with a warning. The smoke
  summary renders parseable times in ISO format and redacts unverified strings.
  The raw source remains the authority, especially for timezone-free strings.

## Local real-export verification

Use a supported Node version from `package.json` (Node 24.19.0 was used here).
Keep real files **outside the repository**; do not attach them to issues, commit
them, copy them into fixtures or feed them into CI. This command reads files and
prints only a local summary; it never uploads or writes report data.

From the repository root:

```bash
npm ci
node --experimental-transform-types --import ./scripts/typescript-imports.ts src/core/import/smoke.ts --character "/private/path/Character.json" --storage "/private/path/Storage.json"
```

Replace the two quoted paths with current game exports on your machine. This
works without a running app/server and needs no network after dependency install.
Node may print an experimental type-transform warning.

The command reports recognition, timestamp/version, character/server presence
(names are intentionally omitted), skill/known-ability/stat counts, item count,
recognized treasure powers and exact tiers, separate resolved imbue tiers,
equipped-state availability, unresolved/unchecked counts, and warning/error codes.
It excludes report bodies, private names, item text, raw IDs, metadata, issue
paths, input filenames and JSON engine exception snippets. Exit codes: `0` both
recognized, `1` invalid/unreadable export, `2` usage/local-dataset/runtime failure.
Warnings do not imply failure; unresolved IDs may reflect the older pinned v490
dataset. The command verifies local compressed dataset hashes before resolution.

For detailed local inspection, call the pure API in your own local tooling and
compare the returned source identity, representative skill levels, item level/slot
and exact powers with your files. Do not publish the full returned objects.

Sanitized command check (not a real-export acceptance result):

```bash
node --experimental-transform-types --import ./scripts/typescript-imports.ts src/core/import/smoke.ts --character src/core/import/fixtures/character-sheet.json --storage src/core/import/fixtures/storage.json
```

Expected: CharacterSheet has 2 skills and 3 ability entries; Storage has 2 items,
2 resolved normal treasure pairs, 1 resolved imbue pair, 1 unresolved item,
1 unresolved power and unavailable authoritative equipment/Spark history.

## Verification and handoff

Focused command: `npx vitest run src/core/import`.
Tests cover supported/unknown/malformed structure, identity/time/version fidelity,
exact official resolution and power ownership, instance/base level separation,
unknown metadata, source safety, missing Spark history, inventory/equipment
separation, and actual Node smoke execution with privacy sentinels and failure
exit codes. All fixture values are synthetic; no real exports are committed.

Implementation verification (Node 24.19.0, based on main `8137232`):

| Command | Result |
| --- | --- |
| `npm ci --cache /tmp/gorgonbuilder-npm-cache` | Passed, committed lockfile unchanged |
| `npm run data:update -- --check` | Passed, pinned official v490 reused unchanged |
| `npx vitest run src/core/import` | 90 passed in 2 files |
| `npm run lint` | Passed, zero warnings |
| `npm run typecheck` | Passed |
| `npm test` | 603 passed in 26 files (513 existing + 90 import tests) |
| `npm run build` | Passed |
| `git diff --check` / `git diff --cached --check` | Passed |
| Sanitized local smoke command above | Passed; expected counts and unavailable equipped state |

Environment notes: the first dependency install could not write the executor's
default npm cache; using a writable temporary cache resolved it. CLI subprocess
tests needed the executor's permitted process/network context; the restricted
context returned `spawnSync EPERM`. The same focused tests and full suite passed
in the permitted context. No runtime dependency or configuration change was made.

Real customer export test: **not run**. Customer testing and architect review
remain required before acceptance. Confirm the secondary field-layout evidence
against current exports; any incompatible structures should be investigated
locally and distilled into a new sanitized fixture. No verified authoritative
equipment field is available for a positive equipped-state test.

After review/merge, documentation needing updates: `docs/Repo_Current_State.md`,
`docs/Manual_Verification_Guide.md`, `docs/Character_Import_And_Validation.md` and
the T0011 ticket acceptance status. KI-0002/0003 remain valid. Field evidence for
stable item IDs/equipped state is research follow-up. UI/build application belongs
to T0016, and modifier aggregation belongs to T0012; neither is implemented here.
