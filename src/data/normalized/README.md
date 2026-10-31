# T0003 — Normalize Skills, Advancement Tables, Attributes, and Effects

The pure `normalizeProgression` entry point in `../adapters/normalize-progression.ts`
accepts four parsed official datasets plus version/URL/SHA-256 provenance. It
returns normalized arrays without reading files, fetching data, importing React,
or computing modifiers. The acquisition workflow remains unchanged. Callers must
verify bytes against the pin before supplying parsed inputs; this normalizer
preserves supplied provenance but does not itself verify byte hashes.

## Contracts and mapping

`progression.ts` defines `NormalizedSkill`, `NormalizedAdvancementTable`,
`NormalizedAttribute`, `NormalizedEffect`, `LevelProgression`, `ProgressionReward`,
`AdvancementReference`, `AttributeReference`, `RecordSource` and
`NormalizedProgressionData` (normalization schema version 1).

- Skill IDs are official object keys; numeric `Id` and optional official `Name`
  remain separate. An omitted Name becomes null, without fabricating a name.
  XP table, guest cap, bonus levels, advancement hints, interaction caps and
  XP-earned attribute references are typed. Other metadata remains in `raw`.
- Tables retain the exact full key, numeric prefix and source name. A skill's
  `Balanced` reference resolves through a unique source-name index to
  `3_Balanced`. Active and passive references remain distinct; the skill's
  identity never becomes its table's identity. Prefix/name parsing describes
  this published identifier format, and fails on an incompatible future shape.
- Each progression entry retains numeric level, exact source level key, raw
  record and an array of original reward keys/JSON values. Table `Keywords`
  remains separate metadata. Skill keys such as `10_Dwarf` preserve `Dwarf` as
  `sourceQualifier`; applicability is explicitly unevaluated. Multiple qualified
  records at one level survive independently. Do not treat them as unconditional.
- Every reward is `uninterpreted`, even when its identifier resolves to an
  attribute. Description/value/metadata objects, arrays, zero values and unknown
  fields survive without being converted into damage modifiers. Level entries
  are ordered numerically. This does not decide cumulative-versus-replacement
  behavior, conditions, caps, stacking or calculation order.
- Attributes retain labels/tooltips, display metadata and optional default values.
  Effects retain official IDs, names/descriptions, keywords, ability keywords,
  display/icon and duration. Empty published effect names and numeric/string
  durations (including numeric sentinels) are preserved without conversion.
- All records carry a separate canonical raw copy and original record ID,
  dataset, upstream version, source URL and SHA-256. Canonical key ordering and
  numeric level ordering make repeated normalization deterministic. No game-data
  version is embedded in the domain contracts. No generated bundle or runtime
  repository is introduced.

## Integrity boundaries

Missing active/passive tables throw `NormalizationError` with the source path and
reference. Absent optional references become null; blank/null/wrong-type references
are invalid. Conflicting table names or numeric table IDs, duplicate numeric skill
IDs, aliased duplicate level keys and malformed required fields fail explicitly.
The input is parsed JSON keyed by official identifiers; duplicate JSON object keys
already discarded by a caller's JSON parser cannot be recovered here.

Advancement reward keys establish attribute references. Missing targets remain
in the result with `attributeReference.status = 'missing'` and a structured
`missing-attribute` integrity issue. Skill `XpEarnedAttributes` similarly emits
`missing-xp-attribute`. Consumers must inspect `integrityIssues`; an empty list
covers only these implemented namespaces and skill-to-table resolution.

The four datasets do not establish effect-ID references from progression records.
Effect keyword strings and descriptive prose are retained, not guessed to be
links. No ability, recipe, parent-skill, TSys, XP-table or complete cross-dataset
integrity claim is made. Future attributes/effects semantics require evidence.

## Verification and representative inspection

Branch: `feature/t0003-skill-progression-normalization`, based on latest fetched
`origin/main` at `8e1d961`. Four files added: this README, `progression.ts`,
`../adapters/normalize-progression.ts`, and its colocated test file. No root
configuration, dependencies, acquisition code or raw files changed.

Executed successfully:

```sh
npm ci
npm run data:update -- --check
npx vitest run src/data/adapters/normalize-progression.test.ts
npm run lint
npm run typecheck
npm test
npm run build
```

Final full suite: 94 tests across 3 files, including 25 focused normalization
tests. Lint, strict typecheck and production build pass. The offline check
validates all 13 pinned official v490 datasets. Git comparison against the base
confirms the original official raw snapshot and acquisition code remain unchanged.

Focused tests execute the normalizer against the actual pin and inspect the
following normalized identities, references, first-level rewards and level-90
presence, plus round-trip preservation of every advancement reward/value,
skill reward record, attribute and effect. They also verify repeated serialized
output, Keywords on 148 tables, failure fixtures and qualifier/string-duration
edge cases. Re-run the focused command above for this data-only manual review;
no UI workflow is involved.

| Skill ID | Numeric skill ID | Source reference | Full official table ID | Level_01 MAX_HEALTH |
| --- | ---: | --- | --- | ---: |
| Psychology | 27 | Balanced | 3_Balanced | 2 |
| Cow | 32 | PlayerCow | 11_PlayerCow | 28 |
| Unarmed | 1 | Balanced | 3_Balanced | 2 |
| Deer | 31 | PlayerDeer | 15_PlayerDeer | 28 |

Normalized counts: 188 skills, 588 tables, 2,189 attributes, 23,282 effects.
All 39 distinct referenced table names resolve; all advancement reward attributes
and skill XP-earned attributes resolve with zero integrity issues in this pin.
These facts establish no reward calculation semantics. Psychology and Unarmed
share a table but retain independent official skill identities. Shared table use
is preserved without deduplicating skills or aggregating their rewards.

Development failures corrected before final verification:

- `NormalizationError: skills.AlcoholTolerance.Rewards.10_Dwarf: expected a nonnegative level key`:
  qualified keys now retain their suffix and independent records.
- `NormalizationError: effects.effect_1018.Name: expected a nonempty string`:
  published blank names are valid strings.
- `NormalizationError: effects.effect_26068.Duration: expected a finite number`:
  string-valued durations remain strings.
- Initial lint: `'_keywords' is assigned a value but never used`:
  the test now filters metadata without an unused binding.
- Initial typecheck reported TS2352 for a regex tuple assertion and TS2322 for
  skill/effect fields; explicit captures and a narrowing error function resolved
  these before the focused tests ran.

## Risks, follow-ups and documentation

Architect review remains required. Qualifier applicability, reward accumulation,
formula interpretation and skill-wide aggregation are intentionally unsupported.
Later aggregation must avoid double-applying one skill selected in both slots;
that logic is outside T0003. T0006 owns compact generated artifacts, runtime lookup
and broader completeness checks. No new follow-up implementation issue was found.
After merge, update `docs/Repo_Current_State.md` and the manual verification/data
normalization documents to reference these contracts and checks. Those documents
were left unchanged to stay within the requested allowed paths. No T0004,
UI, deployment, merge or environment publication is part of this change.

## T0004 — Abilities and dynamic ability data

`abilities.ts` adds `NormalizedAbility`, `AbilityKeywordRule`, `AbilityDot`,
`AbilitySpecialValue`, `AbilityAcquisitionSource`, reference/diagnostic types and
`NormalizedAbilityData` (schema version 1). The pure `normalizeAbilities(input)`
entry point in `../adapters/normalize-abilities.ts` accepts parsed `abilities`,
`abilitykeywords`, `abilitydynamicdots`, `abilitydynamicspecialvalues` and
`sources_abilities`, their version/URL/SHA-256 provenance, and T0003 normalized
`progression` (`gameDataVersion`, `skills`, `effects`). It performs no I/O or
calculation. Verify input bytes against the pin before calling it. Empty
supporting arrays/maps are accepted; the caller supplies provenance for every
input. No acquisition behavior, generated artifacts or runtime repository changes.

- Official ability keys, `InternalName` and display `Name` remain distinct.
  Published blank display names survive. `Level` is separate from explicit
  string/numeric `Rank`; omitted Rank is null. Most player combat ranks are
  represented by names and `UpgradeOf` links, **not** an explicit Rank value.
  `UpgradeOf`, `Prerequisite` and `SharesResetTimerWith` resolve by internal name
  to official IDs. No rank is parsed from a name or inferred from a level/link.
- Original PvE Damage, HealthSpecificDamage, ArmorSpecificDamage,
  ExtraDamageIfTargetVulnerable, CritDamageMod and ArmorMitigationRatio remain
  distinct nullable values. ResetTime, delay-loop metadata, target, Range, AoE
  and targeting requirements retain source values. Numeric sentinels survive.
  AoE units/geometry/caps and cooldown semantics remain uninterpreted.
- Keywords and conditional keywords remain separate from tooltip-only keywords.
  `keywordRuleCandidates` uses published required/excluded ability keywords,
  retaining conditional candidates, without evaluating effects, active skills,
  unknown constraints or modifiers. All candidates have unevaluated applicability.
  Attribute hooks and every unknown field remain available without interpretation.
- Supporting datasets are anonymous ordered arrays: `sourceIndex` and
  `source.recordId` (zero-based index string) are snapshot locators, **not**
  invented official rule IDs. Identical published rules at indices 24 and 25
  survive independently. Global dynamic records keep `ownerAbilityId: null` and
  all Req* constraints; no per-ability dynamic link is fabricated. Embedded PvE
  DoTs/SpecialValues have explicit owner IDs and nested record-path provenance.
- Effect-keyword constraints resolve by exact membership in T0003 effect
  `Keywords`, retaining all matching effect IDs as `keyword-membership-only`.
  These are conditional associations, not applied effects or effect-ID references.
  This pin publishes no genuine effect-ID reference fields in these datasets;
  descriptions, names and unrecognized future fields never establish links.
  Acquisition records resolve by exact ability ID while their entries remain raw.
- Every record retains a canonical raw copy and provenance. Object keys and
  lookup matches are sorted; published array order is preserved. Malformed
  required fields, conflicting internal names/IDs, and mixed versions (including
  T0003 references) throw `NormalizationError` with a source path. Missing
  references instead remain in output with structured `integrityIssues`.
  Duplicate object keys already lost during JSON parsing cannot be recovered.

The verified v490 pin yields **5,972 abilities, 26 keyword rules, 2 global dynamic
DoTs, 4 global dynamic special values and 4,063 acquisition records**. Abilities
also preserve 1,757 embedded DoTs and 1,823 embedded special values. All 3,911
upgrade, 3,699 prerequisite, 3,914 shared-timer and 4,063 acquisition links resolve.
129 abilities publish explicit Rank; 4,440 skill references resolve.

There are **1,546 diagnostics**, all retained source gaps: 1,532 `Skill: Unknown`
references have no T0003 skill definition; effect Keywords lack `MindRevealed`
(9 references), `HasRecentlyHeardBardSong` (4), and `TestEffect` (1). These do not
make source records malformed and are not proof that the mechanics do not exist.
No complete game-data reference-integrity claim is made; T0006 owns broader checks.

Run `npx vitest run src/data/adapters/normalize-abilities.test.ts` for fixtures,
pin-hash verification, raw/count preservation, reference diagnostics, exact
field mapping and deterministic serialization. Representative inspections cover
Psychology (114), Cow (103), Unarmed (142), Deer (104), different upgrade/level
records, AoE, conditional effect constraints and embedded dynamics. Run the
ticket quality suite (`npm ci`, offline `data:update -- --check`, lint, typecheck,
full tests, build, `git diff --check`) as well. No UI testing is needed.

After merge, the repository state, manual verification, and data normalization
documents should reference this API and its source gaps; those paths remain
unchanged for ticket scope. T0006 must preserve these diagnostics when generating
runtime data; later calculation tickets must validate mechanics before applying
these rules or values. T0005 and later work have not begun here.
