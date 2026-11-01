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
these rules or values. T0005 and later work had not begun at T0004 completion.

## T0005 — Normalize Items and Treasure System

`items-treasure.ts` defines the schema-version-1 `NormalizedItemTreasureData`,
`NormalizedItem`, `NormalizedTreasurePower`, `NormalizedTreasureTier`,
`NormalizedTreasureProfile`, acquisition, reference and diagnostic contracts.
The pure `normalizeItemsTreasure(input)` function in
`../adapters/normalize-items-treasure.ts` accepts parsed `items`, `tsysclientinfo`,
`tsysprofiles`, `sources_items`, provenance for each, and T0003 `progression`
(`gameDataVersion`, `skills`). Source/JSON types and skill references reuse the
existing contracts; validation uses the existing `NormalizationError`.

This is an independent normalization API, with no I/O, generated runtime bundle,
repository layer, UI, damage calculation, import or Spark implementation.
Acquisition, raw data and earlier normalizers remain unchanged. Callers must
verify original bytes against the pin before parsing; supplied provenance alone
does not verify a hash. Mixed versions, incompatible structural shapes, invalid
required fields, noncanonical IDs and conflicting names fail with source paths.
Missing references stay in output with structured `integrityIssues`.

### Source mapping and interpretation boundaries

- Equipment selection uses **presence of `EquipSlot`**, not an Equipment keyword
  or a guessed slot. All 19 published slots survive, including `OffHandShield`,
  `Racial` and mount/cosmetic slots. `nonEquipmentItemIds` explicitly accounts
  for the rest of the item dataset without expanding this ticket into consumable
  normalization. Non-equipment source definitions remain in the pinned raw data.
- Official `item_*` IDs, internal/display names, descriptions, Keywords,
  Behaviors, skill requirements and complete raw objects remain distinct.
  Keywords are the published tags; there is no separate Tags field in this pin.
  `fixedEffects` preserves exact `EffectDescs` strings with nested provenance and
  `interpretation: 'uninterpreted'`; tokens and prose are never turned into
  numeric modifiers, inferred effect IDs, treasure powers or Sparks.
- **Level ambiguity:** this pin publishes `CraftingTargetLevel`, not a generic
  item `Level`. Normalized `level` copies that field with explicit
  `levelSource: 'CraftingTargetLevel'`. A missing field yields null for both;
  neither an equip skill requirement nor a name supplies a fallback. The 90+
  count below means published crafting target level, not required skill level
  or imported instance level. A future UI must keep that distinction visible.
- Items publish a single optional `TSysProfile` string. It resolves exactly to
  a profile key; absent means null, while an unresolved value is retained with
  `status: 'missing'`. No extra profiles are inferred from item type or name.
- Powers preserve official `power_*` IDs, InternalName, Skill, Slots,
  Prefix/Suffix, availability/transmutation flags and full raw data. There is
  no generic display-name field in this source. A tier's identity is the pair
  **(powerId, original `id_*` key)**. Each tier retains its own descriptions,
  MinLevel, MaxLevel, MinRarity, SkillLevelPrereq, raw fields and nested source
  path. Tiers are ordered by canonical source key, never filled in, renumbered
  or substituted across powers. In particular, `power_129` publishes `id_120`;
  it must not become tier 12. No independent tier foreign-key field is published
  by these four datasets, so validation checks actual tier ownership and exact
  source-key/value preservation rather than inventing tier-reference rules.
- Each published profile is an **array of power InternalName strings**. Its
  `powers` resolves only that namespace to official power IDs. Raw array order,
  duplicates and empty arrays survive. `interpretation: 'membership-only'`
  establishes membership, not final eligibility, inheritance, slot compatibility,
  level/rarity rules or a mod limit. There are no published profile constraint
  objects or parent relationships to normalize in this pin. `All` and `None`
  are ordinary source keys with actual member lists; their names do not create
  special rules. Unknown power fields/constraints remain raw.
- Power Skill references reuse the T0003 skill namespace. `Unknown` produces an
  unresolved reference. Published `AnySkill` is retained as an uninterpreted
  selector with an `unsupported-semantics` diagnostic, not a nonexistent skill
  or an evaluated rule granting universal applicability.
- All `sources_items` records survive, including valid non-equipment sources.
  Their references resolve against the complete input item-ID set, with a
  separate nullable `equipmentItemId`. Missing items generate diagnostics;
  non-equipment targets do not. Source entries, including empty arrays and
  unknown acquisition fields, remain uninterpreted. NPC/recipe/quest links
  are not validated by this ticket.
- Items, powers and tiers expose `searchText` prepared from official names,
  descriptions and keywords/metadata. NFKC, lowercase and whitespace folding
  are deterministic. Underscore-separated tokens retain their literal form and
  add a word form (e.g. `COMBAT_REFRESH` also matches `combat refresh`). No stat
  meaning, translation or synonym such as lightning/electricity is inferred.
- Every normalized source record carries dataset, upstream version, source URL,
  SHA-256 and original record ID/path. Separate canonical raw copies preserve
  unknown fields; object-key ordering is canonical and array ordering retained.
  Duplicate JSON keys already discarded by a caller's parser are unrecoverable.

### Verified official v490 counts and diagnostics

| Dataset / subset | Normalized count |
| --- | ---: |
| Equipment definitions (`items`) | 3,078 |
| Other item IDs explicitly accounted for | 8,131 |
| Equipment with published crafting target level 90+ | 518 |
| Equipment without published crafting target level | 500 |
| Fixed effect description entries | 8,460 |
| Treasure powers (`tsysclientinfo`) | 1,947 |
| Power-owned tiers | 45,634 |
| Treasure profiles (`tsysprofiles`) | 40 |
| Profile-to-power memberships | 8,649 |
| Item acquisition records (`sources_items`) | 10,068 |

All **2,578 item-to-profile references**, **8,649 profile memberships** and
**10,068 acquisition item references** resolve; 2,607 acquisition targets are
equipment. Every published item skill requirement resolves. There are 1,851
resolved power-skill associations, **6 unresolved `Unknown` skill references**,
and **90 unsupported `AnySkill` selectors**: 96 structured diagnostics in total,
with separate `unresolved-reference` and `unsupported-semantics` categories.

The six affected powers are `power_13501` (HammerBuckleHealChance), `power_13502`
(PoundFireEquipmentUnique), `power_13503` (WhackstarUnique), `power_13504`
(FaiesFickleFifeUnique), `power_165` (MinorHealArmorB), and `power_201` (PigSticker).
Their records and profiles remain intact. T0004's separate **1,546 diagnostics**
remain unchanged and verified by its existing tests; T0005 does not aggregate
or suppress earlier diagnostics or claim complete cross-dataset integrity.

### Representative inspection and manual verification

The focused tests read the actual committed files under
`src/data/raw/cache/v490`, verify hashes against `snapshot.json`, then inspect:

| Official item ID | Official display name | EquipSlot | TSysProfile | Crafting target / skill requirement |
| --- | --- | --- | --- | --- |
| item_45640 | Nopec's Dreaded Dagger of Endless Nights | MainHand | Dagger | 90 / Knife 60 |
| item_45722 | Ruxandra's Bite | OffHand | Dirk | 90 / Knife 60 |
| item_45052 | Umrad Shield | OffHandShield | Shield | 90 / Endurance 80 |
| item_42093 | Umrad Coat | Chest | All | 90 / Endurance 80 |
| item_49070 | Astounding Ilth Hale Ring | Ring | All | 90 / Endurance 40 |
| item_48081 | Astounding Harukita Talisman | Necklace | All | 90 / Necromancy 80 |

The ring's fixed prose explicitly grants Ilth Hale's Kiss 9; it remains prose,
without an invented ability link. The coat retains `{MAX_ARMOR}{243}`,
`{VULN_DARKNESS}{-0.18}` and its combat-refresh tokens without assigning formula
behavior. `item_40002` (Basic Boots) has no target level or profile and retains
Vendor entries for NPC_Richter, NPC_Harry and NPC_Joe. `item_56001` retains
Saddle/Riding, `item_50001` retains Racial/All, and `item_56405` demonstrates why
an Equipment keyword is not a reliable inclusion requirement.

`power_10001` (ArcheryBoost) publishes Skill Archery, Slots Head/OffHand and
distinct tiers: `id_1` has MinLevel 10, MaxLevel 30 and
`{BOOST_SKILL_ARCHERY}{5}`; `id_9` has MinLevel 90, MaxLevel 110 and
`{MOD_SKILL_ARCHERY}{0.45}` plus `{DELTA_ANATOMY_CRITICAL_CHANCE}{0.025}`.
Profile All includes ArcheryBoost; Dagger does not. This is source membership,
not a computed eligibility decision. `power_129` (RedwallMitigationPhysical)
retains `id_120`, MinLevel 120, MaxLevel 135 and three mitigation descriptions
with value 13. All examples originate in the official versioned items,
tsysclientinfo, tsysprofiles and sources_items JSON URLs recorded in the pin.

For architectural/manual review:

1. Run `npm run data:update -- --check`.
2. Run `npx vitest run src/data/adapters/normalize-items-treasure.test.ts` and
   inspect the representative assertions/table above against the raw records.
3. Inspect `integrityIssues`, especially Unknown versus AnySkill, and confirm
   missing-profile/member fixtures keep their unresolved records.
4. Check that a tier is selected by its own power ID and original tier key;
   compare ArcheryBoost id_1/id_9 and RedwallMitigationPhysical id_120.
5. Run lint, typecheck, the full tests, build and `git diff --check`.
   No new UI workflow is involved.

### Completion evidence, risks and follow-ups

Branch `feature/t0005-items-treasure-system` was created from current GitHub main
at `05e26bc490a67bb96477cfe13354cc9f5790e492`. Changed files are this README,
`items-treasure.ts`, `../adapters/normalize-items-treasure.ts`, and its colocated
test file. No raw/acquisition, dependency, configuration or UI files changed.

Successful verification:

```sh
npm ci --cache /tmp/gorgonbuilder-npm-cache
npm run data:update -- --check
npx vitest run src/data/adapters/normalize-items-treasure.test.ts
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
```

Focused suite: **42 passing tests**. Full suite: **173 passing tests across 5
files**, including all 131 earlier tests. Offline validation covers all 13
pinned datasets. Lint, both strict TypeScript projects and production build pass.
Initial installation failed because the default npm cache was outside writable
roots; a temporary cache resolved it without changing dependencies. An initial
fixture-input type assertion failed typecheck; explicit dataset properties fixed
it before final verification. No unresolved implementation failure remains.

Architectural review should confirm the explicit CraftingTargetLevel mapping
before a future minimum-level UI treats it as an equipment requirement. Profile
membership, Slots, tier ranges/rarity and availability flags remain separate
facts; later tickets must validate how to combine them. No unverified numeric
effect, transmutation, mod-count or Spark rule is implemented.

T0006 owns generated artifacts, runtime lookups and broader completeness checks,
and must carry both earlier and new diagnostics forward. T0009 owns actual search
and explicit tested synonyms. T0010 owns mod planning and context/eligibility
decisions; T0012 owns supported effect interpretation. These are follow-up
concerns, not additional implementations or newly created GitHub issues.
After merge, update `docs/Repo_Current_State.md`,
`docs/Manual_Verification_Guide.md` and `docs/Data_Source_And_Normalization.md`
with this API, counts, level mapping and diagnostics. Those paths remain
unchanged to respect the ticket's allowed areas. Stop at PR review; do not merge
or proceed to T0006.

### T0009 reviewed display-only item icon extension

The [PR #18 product-owner review](https://github.com/Zaelious/GorgonBuilder/pull/18#pullrequestreview-5728992620)
authorizes exposing the exact official item `IconId` for equipment artwork.
`NormalizedItem.iconId` copies that field as a nonnegative safe integer; an absent
field stays null. Invalid present values fail with the source path. Note the
official spelling is item `IconId`, distinct from ability `IconID`.

All 3,078 pinned v490 equipment definitions publish this field. For example,
`item_45640` has icon 15208, `item_45052` has 14009, and `item_49070` has 17202.
The runtime projection automatically carries it; no BuildDocument/preference
schema change, source ID, slot mapping or gameplay interpretation is introduced.
The canonical icon route is the pinned official index's
`https://cdn.projectgorgon.com/v490/icons/icon_{IconId}.png`. Missing or failed
artwork uses local category line drawings instead of invented item artwork.

The item gzip and its manifest metadata were deterministically regenerated twice
from unchanged verified raw bytes. Compressed size is 1,824,985 bytes, decoded
size 31,653,251 bytes and SHA-256
`90ea272a7804075fc8474e1150119512b3dddb9b2806626ee350aac789411487`.
Progression and ability artifacts, source hashes, record counts, diagnostics,
integrity checks and KI-0008 transport remain unchanged. Focused tests cover
missing/malformed IDs and exact raw-to-runtime projection for all 3,078 items.
See [T0009 verification](../../../docs/T0009_Verification.md) for current review evidence.
