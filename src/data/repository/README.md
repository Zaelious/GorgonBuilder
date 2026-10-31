# T0006 — Generated dataset, completeness checks, and runtime repository

`npm run data:generate` generates **only the current pin**, offline, into
`src/generated/game-data/`. It never calls acquisition or discovers a version.
The branch is `feature/t0006-generated-data-repository`, based on main
`0ded852`. No application UI, mechanics, persistence, raw data, existing
normalizers, or dependencies change.

## Pipeline and contracts

1. Validate `src/data/raw/snapshot.json`, the matching cache manifest, versioned
   official index, dataset availability, SHA-256, byte lengths and raw counts
   with the T0002 validators. Recheck the exact bytes subsequently parsed.
2. Reject duplicate JSON keys before accepting parsed source records, including
   escaped equivalent keys and nested tier IDs.
3. Invoke T0003 `normalizeProgression`, T0004 `normalizeAbilities`, and T0005
   `normalizeItemsTreasure` with provenance from that one pin.
4. Check exact raw/normalized ID sets, equipment/non-equipment partition,
   anonymous array order, raw preservation, embedded dynamics and tier coverage.
   Independently validate existing reference namespaces, statuses, exact effect
   keyword memberships, ownership, acquisition links and record provenance.
5. Compare counts and diagnostic identities with the **version-specific** v490
   fixture in `scripts/fixtures/generated-regressions.json`. Its diagnostic
   fingerprint covers group, category, code, path and reference. Equal diagnostic
   counts cannot hide changed paths. A different version is not constrained to
   v490 counts; any diagnostics require an explicitly reviewed fixture.
6. Project compact runtime views, write canonical minified JSON as deterministic
   gzip (level 9, zero mtime), and write `manifest.json` last. The manifest records
   schema/generator/normalization versions, upstream version, exact pin hash,
   per-dataset source metadata, counts, compressed SHA-256/lengths, decoded JSON
   lengths, and all diagnostics. There is no generation timestamp.

`GameData` composes the existing normalizer contracts. `Runtime<T>` derives
runtime types from those contracts: it removes redundant `raw` copies and stores
record provenance as `{dataset, recordId}`. `getSourceMetadata(record.source)`
recovers upstream version, URL and SHA-256 from the shared manifest. Original
raw/unknown fields remain in the verified committed snapshot, addressable by
this locator; nested paths retain their original source spelling. To inspect an
unknown field not yet normalized, use that snapshot, not a guessed runtime rule.
Arbitrary JSON reward values, acquisition entries and behaviors remain in the
runtime artifacts, including properties literally named `raw` or `source`.
Existing normalizers and their lossless raw contracts are unchanged.

All 13 supporting datasets must be published for normalization schema 1. T0002
can represent optional unpublished datasets, but the current normalizers require
them; generation fails with an explicit compatibility error rather than inventing
source hashes for synthetic empty input. A future publication-shape change needs
adapter/schema review.

Validation completes before output is changed. A directory lock prevents
concurrent publication. Files use temporary writes and rename; an interrupted
multi-file publication can leave artifacts from different runs, which the old
manifest's hashes reject. Rerun generation to restore consistency. There is no
claim of transactional directory replacement.

## Runtime API

```ts
import { loadGameDataRepository } from './load';

const data = await loadGameDataRepository();
const skill = data.getSkill('Psychology');
const ability = data.getAbility('ability_1201');
const item = data.getItem('item_45640');
const tier = data.getTreasureTier('power_129', 'id_120');
const source = skill && data.getSourceMetadata(skill.source);
```

The React-independent loader imports generated asset URLs only when called,
verifies compressed bytes with Web Crypto SHA-256, decompresses with the standard
`DecompressionStream`, parses each artifact once, checks manifest versions/counts
and constructs one shared repository. Concurrent calls share one promise; failed
loads can be retried. It requires browsers supporting these standard APIs.
No raw snapshot file or Node module is imported by the browser loader.

`createGameDataRepository(runtimeData, manifest)` also supports already-loaded,
generation-validated inputs for non-browser consumers. It indexes official IDs
with `Map`, tiers with nested maps keyed by **power ID then original tier ID**,
and skill/ability/power/profile associations once. Subsequent lookups do not
scan full datasets. Definitions and collections are shared readonly values;
consumers must not mutate them.

Lookup methods: `getSkill`, `getAdvancementTable`, `getAbility`, `getItem`,
`getTreasurePower`, `getTreasureTier`, `getTreasureProfile`, `getAttribute`,
`getEffect`, `getKeywordRule` (anonymous source locator), `getAbilityAcquisition`
and `getItemAcquisition`. Missing IDs return `undefined`; association methods
`getAbilitiesForSkill`, `getTreasurePowersForSkill`, `getProfilesForPower` return
readonly empty arrays when absent. Readonly collections and global dynamic
records are also exposed.

`getItem` exposes T0005's equipment definitions. `getItemCoverage` distinguishes
`equipment`, `non-equipment`, and `undefined`; 8,131 non-equipment IDs are covered
without fabricating equipment definitions. Their acquisition records remain
available. Profile associations mean membership only. AnySkill is not evaluated
as a skill association. CraftingTargetLevel remains distinct from SkillReqs;
unknown effects, reward semantics, conditional applicability and anonymous
record identities retain the earlier interpretation boundaries.

## Verified v490 inventory

| Record group | Count |
| --- | ---: |
| Skills | 188 |
| Advancement tables | 588 |
| Attributes | 2,189 |
| Effects | 23,282 |
| Abilities | 5,972 |
| Keyword rules | 26 |
| Global dynamic DoTs / special values | 2 / 4 |
| Embedded DoTs / special values | 1,757 / 1,823 |
| Ability acquisition records | 4,063 |
| Equipment / non-equipment item IDs | 3,078 / 8,131 |
| Fixed effect descriptions | 8,460 |
| Treasure powers / owned tiers | 1,947 / 45,634 |
| TSys profiles / memberships | 40 / 8,649 |
| Item acquisition records | 10,068 |

| Artifact | Compressed bytes | Decoded JSON bytes |
| --- | ---: | ---: |
| progression.json.gz | 912,081 | 24,512,764 |
| abilities.json.gz | 536,127 | 15,889,377 |
| itemsTreasure.json.gz | 1,821,249 | 31,607,382 |

The three data artifacts total **3,269,457 bytes** compressed and **72,009,523
bytes** of decoded JSON; `manifest.json` additionally records the complete
source diagnostics (410,823 bytes). Removing redundant raw/provenance copies reduced the first
lossless transport prototype from 131,186,320 decoded bytes. The runtime still
retains the complete normalized progression and treasure inventory; heap use is
larger than transfer size. Load once on demand. Further partitioning should be
measured against actual planner use in later tickets.

The application shell does not import the repository yet, so its production
bundle includes neither generated assets nor raw data. A separate bundler smoke
check with the loader reachable verifies emission of three gzip assets and
lazy manifest/URL chunks without raw source imports.

## Integrity diagnostics

The manifest reports **1,642** diagnostics independently by normalizer and
category. Every record retains its source path and original message/reference.

| Group | Category / code / reference | Count |
| --- | --- | ---: |
| T0003 progression | none | 0 |
| T0004 abilities | unresolved-reference / missing-skill / Unknown | 1,532 |
| T0004 abilities | unresolved-reference / missing-effect-keyword / MindRevealed | 9 |
| T0004 abilities | unresolved-reference / missing-effect-keyword / HasRecentlyHeardBardSong | 4 |
| T0004 abilities | unresolved-reference / missing-effect-keyword / TestEffect | 1 |
| T0005 items/treasure | unresolved-reference / missing-skill / Unknown | 6 |
| T0005 items/treasure | unsupported-semantics / unsupported-skill-selector / AnySkill | 90 |

Totals: T0004 **1,546**, T0005 **96**; unresolved references **1,552** and
unsupported semantics **90**. These are upstream gaps/selectors, not validated
mechanics or newly introduced normalization defects. New, unreported, stale or
changed diagnostics and broken resolved references fail validation. Reference
checks cover published relationships already represented by the normalizers;
prose, arbitrary unknown fields, NPC/recipe/quest identifiers and attribute hook
semantics do not become invented foreign keys.

## Verification and manual data review

```sh
npm ci --cache /tmp/gorgonbuilder-npm-cache
npm run data:update -- --check
npm run data:generate
sha256sum src/generated/game-data/* > /tmp/gorgon-generated-first.sha256
npm run data:generate
sha256sum -c /tmp/gorgon-generated-first.sha256
npx vitest run scripts/generate-data.test.ts src/data/repository/repository.test.ts
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

The 37 new focused tests cover byte-identical output (also compared with the
committed artifacts), manifest hashes/counts/version, complete known diagnostics,
version-specific regression policy, source corruption/missing files/metadata,
duplicate JSON and normalized IDs, intentionally broken foreign keys, tier
ownership, coverage, safe absence, browser decoding/hash failure/retry/caching,
and representative official lookups.

Completion verification passed on Node 24.19.0: `npm ci`, offline pin validation,
two CLI generations with SHA-256 comparison, **37 focused tests**, **210 total
tests across seven files**, lint, both strict TypeScript projects, production
build and `git diff --check`. The production shell emits 220.45 kB JavaScript
(68.91 kB gzip), 1.56 kB CSS and HTML; there are no data assets in that build.
The separate loader build emits three gzip assets, a 7.40 kB entry and a lazy
410.85 kB manifest chunk (12.46 kB gzip). Representative generated records and
manifest totals were additionally inspected directly against the pinned records.

For architectural/manual review:

1. Pretty-print `manifest.json`, inspecting counts, sources, snapshotSha256,
   diagnostics.byGroup/byCategory and individual diagnostic paths.
2. Inspect gzip JSON with `gzip -dc src/generated/game-data/abilities.json.gz`
   piped to a local JSON viewer, or rerun the focused tests. These are generated
   artifacts; make changes in generation/contracts, then regenerate.
3. Resolve Psychology/Cow/Unarmed/Deer and abilities `ability_1201`,
   `ability_1652`, `ability_1001`, `ability_1578`. Check active advancement tables
   `3_Balanced`, `11_PlayerCow`, `15_PlayerDeer` and MAX_HEALTH rewards.
4. Inspect items `item_45640`, `item_45722`, `item_45052`, `item_42093`,
   `item_49070`, `item_48081`, their profiles and independent skill requirements.
   Basic Boots `item_40002` retains null level/profile and NPC vendor entries.
5. Compare `power_10001/id_1` versus `id_9` and `power_129/id_120`. Confirm
   `getTreasureTier('power_129', 'id_12')` returns absence. Compare All/Dagger
   membership without treating it as final mod eligibility.
6. Use `getSourceMetadata` plus the original raw snapshot to review unknown
   fields and descriptions. Confirm Skill Unknown and AnySkill diagnostics are
   retained and remain semantically distinct. No new UI workflow is involved.

## Risks, follow-ups and documentation after merge

Architectural review should assess the compact type projection, one-time runtime
memory cost and loader API. Compressed bytes are reproducible with the supported
Node/zlib toolchain; recheck committed-byte tests when changing that toolchain.
The generator's Node-only runner enables native experimental TypeScript
transformation to support the unchanged normalizers' existing syntax/imports.

No new gameplay rule or GitHub follow-up issue is introduced. Existing follow-ups
remain: T0009 / KI-0007 for minimum-level semantics, T0010 for context-dependent
mod applicability, T0012 for numeric effect interpretation, and later source
diffing for patch updates. Optional-publication compatibility and measured
partitioning are future considerations, not additional implementation tickets.

After merge, update `docs/Repo_Current_State.md` (correct the PR #6 entry to
T0005 and mark T0006 complete), `docs/Manual_Verification_Guide.md`,
`docs/Data_Source_And_Normalization.md` (replace the conceptual changing generation
timestamp with deterministic pin provenance), and available-script/source-tree
references. Those docs are outside this ticket's allowed write areas. This
README supplies the implementation and data-review handoff. Do not merge this
branch or begin T0007 as part of this task.
