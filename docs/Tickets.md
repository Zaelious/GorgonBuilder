# GorgonBuilder — Tickets T0001–T0050

**Status:** First implementation series frozen for initial development  
**Version:** 1.0  
**Date:** 2026-10-31

## Rules

- Implement one ticket only.
- Use one branch per ticket: `feature/tXXXX-short-name`.
- Tickets are ordered by dependency, but an architect may explicitly reorder independent tickets.
- Every ticket requires a Codex completion report and manual verification.
- Out-of-scope discoveries go to `Known_Issues_And_Followups.md`.
- Rotation/DPS simulation begins in the **next** ticket series after T0050 so the core ability calculator is validated first.


## T0001 — Project Skeleton

**Goal:** Create the initial Vite + React + strict TypeScript project shell.

**Dependencies:** None

**Allowed areas:**
- root config
- src/app
- src/styles

**Do not touch:**
- game-data ingestion
- damage engine
- backend

**Requirements:**
- Initialize Vite React TypeScript.
- Enable strict TypeScript.
- Add basic app shell and scripts for dev/build/test.
- Add Vitest with one smoke test.

**Non-goals:**
- No planner features.
- No data downloads.
- No save/share.

**Acceptance criteria:**
- npm install succeeds.
- npm run build succeeds.
- npm test succeeds.
- App renders Gorgon Builder shell.

**Manual verification:**
1. Run npm install.
2. Run npm run dev and open app.
3. Confirm title/shell renders.
4. Run npm test and npm run build.


## T0002 — Baseline Folder Structure

**Goal:** Create the agreed source folders without implementing future systems.

**Dependencies:** T0001

**Allowed areas:**
- src/core
- src/data
- src/features
- src/persistence
- src/generated
- src/test

**Do not touch:**
- feature implementation

**Requirements:**
- Create folder/readme/index placeholders as needed.
- Enforce no React imports in core with a simple convention/test if practical.

**Non-goals:**
- No domain logic.
- No UI features.

**Acceptance criteria:**
- Folder structure matches technical design.
- Build/tests still pass.

**Manual verification:**
1. Inspect src tree.
2. Run tests/build.


## T0003 — Design Tokens and App Layout Shell

**Goal:** Create desktop-first visual shell and CSS variables.

**Dependencies:** T0001

**Allowed areas:**
- src/app
- src/styles

**Do not touch:**
- core
- data
- persistence

**Requirements:**
- Define basic spacing/typography/panel variables.
- Create header/main workspace shell.
- Keep responsive read-only-friendly baseline.

**Non-goals:**
- No skill/item widgets.

**Acceptance criteria:**
- Shell is readable at desktop width.
- No horizontal overflow at common laptop width.
- Build passes.

**Manual verification:**
1. Run dev.
2. Resize browser.
3. Check console.
4. Run build.


## T0004 — BuildDocument Schema v1

**Goal:** Define serializable build-domain types and default empty build.

**Dependencies:** T0002

**Allowed areas:**
- src/core/build

**Do not touch:**
- React UI
- game data

**Requirements:**
- Define BuildDocument with schemaVersion, gameDataVersion, skills, abilities, equipment, candidate mods, Sparks, target.
- Add default factory.
- Keep UI-only state out.

**Non-goals:**
- No persistence.
- No migrations beyond v1.

**Acceptance criteria:**
- Types compile.
- Unit test default build shape.

**Manual verification:**
1. Run tests/build.
2. Inspect serialized default object.


## T0005 — Formula Confidence Types

**Goal:** Define shared confidence/provenance types for calculations and interpreted data.

**Dependencies:** T0002

**Allowed areas:**
- src/core/calculation

**Do not touch:**
- UI

**Requirements:**
- Add validated/partially_validated/assumed/unknown.
- Add provenance/assumption structures.

**Non-goals:**
- No formulas.

**Acceptance criteria:**
- Types compile and are test-covered where behavior exists.

**Manual verification:**
1. Run tests/build.


## T0006 — Local Preference Storage Abstraction

**Goal:** Add typed browser-storage abstraction for non-build preferences.

**Dependencies:** T0002

**Allowed areas:**
- src/persistence/local

**Do not touch:**
- remote backend
- build sharing

**Requirements:**
- Create namespaced local storage wrapper.
- Handle malformed values safely.
- Add minimum-level preference placeholder.

**Non-goals:**
- No draft saving yet.

**Acceptance criteria:**
- Read/write/remove tests pass.

**Manual verification:**
1. Run tests/build.
2. Verify preference survives refresh with simple dev hook if exposed.


## T0007 — Repo Quality Scripts

**Goal:** Add formatting/lint baseline with minimal dependencies.

**Dependencies:** T0001

**Allowed areas:**
- root config

**Do not touch:**
- feature code refactors

**Requirements:**
- Add ESLint using Vite/TS-compatible setup.
- Add npm scripts for lint/typecheck.
- Document commands.

**Non-goals:**
- No mass formatting unrelated generated content.

**Acceptance criteria:**
- lint/typecheck/test/build pass.

**Manual verification:**
1. Run all quality scripts.


## T0008 — Game Data Manifest Contract

**Goal:** Define normalized game-data manifest/version types.

**Dependencies:** T0002

**Allowed areas:**
- src/data/normalized

**Do not touch:**
- downloader
- UI

**Requirements:**
- Define manifest with source version, generated timestamp, dataset counts/files.
- Add schema validation or type guard.

**Non-goals:**
- No network.

**Acceptance criteria:**
- Manifest fixture parses/tests.

**Manual verification:**
1. Run tests/build.


## T0009 — Raw Data Adapter Interfaces

**Goal:** Define adapters for official items/skills/abilities/treasure data.

**Dependencies:** T0008

**Allowed areas:**
- src/data/adapters

**Do not touch:**
- normalization implementation

**Requirements:**
- Create explicit adapter interfaces and raw-record boundaries.
- Avoid leaking raw unknown types to UI.

**Non-goals:**
- No downloads.

**Acceptance criteria:**
- Interfaces compile and fixture stubs test.

**Manual verification:**
1. Run tests/build.


## T0010 — Game Data Update Script Skeleton

**Goal:** Create CLI/script entry for updating official game data.

**Dependencies:** T0009

**Allowed areas:**
- scripts
- package scripts

**Do not touch:**
- normalizers beyond stub
- UI

**Requirements:**
- Add data:update command.
- Accept source/version/config parameters.
- Fail clearly without configured source.

**Non-goals:**
- No full normalization yet.

**Acceptance criteria:**
- Command help/validation works.
- Build unaffected.

**Manual verification:**
1. Run script help/dry run.
2. Run tests/build.


## T0011 — Normalize Skills

**Goal:** Normalize official skill records into planner-ready skill definitions.

**Dependencies:** T0010

**Allowed areas:**
- src/data/normalized
- src/data/adapters
- scripts

**Do not touch:**
- abilities/items UI

**Requirements:**
- Normalize ID/name and relevant metadata.
- Preserve raw/internal identifiers needed later.
- Add fixture tests.

**Non-goals:**
- No skill selector UI.

**Acceptance criteria:**
- Known fixture skills normalize deterministically.

**Manual verification:**
1. Run normalization tests/build.


## T0012 — Normalize Abilities

**Goal:** Normalize abilities with skill/rank/damage-related raw fields preserved.

**Dependencies:** T0011

**Allowed areas:**
- src/data/normalized
- src/data/adapters

**Do not touch:**
- damage formula interpretation beyond known fields

**Requirements:**
- Create NormalizedAbility.
- Map skill/rank/name/cooldown/damage fields when available.
- Preserve unsupported fields needed later.

**Non-goals:**
- No final damage formula.

**Acceptance criteria:**
- Fixture abilities normalize and link to skills.

**Manual verification:**
1. Run tests/build.


## T0013 — Normalize Items

**Goal:** Normalize real equippable item definitions.

**Dependencies:** T0010

**Allowed areas:**
- src/data/normalized
- src/data/adapters

**Do not touch:**
- item picker UI

**Requirements:**
- Create NormalizedItem.
- Map TypeID/name/level/slot/innate effect text/tags/source fields when available.
- Preserve IDs.

**Non-goals:**
- No imported item instances.

**Acceptance criteria:**
- Fixture gear normalizes correctly.

**Manual verification:**
1. Run tests/build.


## T0014 — Normalize Treasure Powers

**Goal:** Normalize TSys powers and tiers.

**Dependencies:** T0010

**Allowed areas:**
- src/data/normalized
- src/data/adapters

**Do not touch:**
- mod UI
- damage interpretation

**Requirements:**
- Create NormalizedTreasurePower.
- Preserve internal power name, tiers, descriptions, profile/slot metadata when available.

**Non-goals:**
- No assumption that every power is numerically understood.

**Acceptance criteria:**
- Fixture powers/tier values normalize.

**Manual verification:**
1. Run tests/build.


## T0015 — Generated Dataset Build

**Goal:** Produce versioned normalized game-data artifacts and manifest.

**Dependencies:** T0011-T0014

**Allowed areas:**
- scripts
- src/generated or public generated data

**Do not touch:**
- planner UI

**Requirements:**
- Wire normalizers into data:update.
- Write deterministic artifacts.
- Record counts/version.
- Exclude raw huge files from runtime bundle when not needed.

**Non-goals:**
- No auto-update CI.

**Acceptance criteria:**
- Two runs from same source produce stable output.
- Manifest counts match generated records.

**Manual verification:**
1. Run data:update.
2. Inspect manifest.
3. Run tests/build.


## T0016 — Runtime Game Data Repository

**Goal:** Load normalized data through one typed repository API.

**Dependencies:** T0015

**Allowed areas:**
- src/data

**Do not touch:**
- feature-specific UI

**Requirements:**
- Expose skill/ability/item/treasure lookup methods.
- Index by IDs.
- Handle missing IDs explicitly.

**Non-goals:**
- No search yet.

**Acceptance criteria:**
- Lookup tests pass.
- App can initialize repository.

**Manual verification:**
1. Run tests/build.


## T0017 — Skill Selector A

**Goal:** Add first skill selector backed by normalized data.

**Dependencies:** T0016,T0004

**Allowed areas:**
- src/features/skills
- src/app

**Do not touch:**
- skill B behavior
- abilities

**Requirements:**
- Search/select one skill.
- Persist selection into BuildDocument state.

**Non-goals:**
- No second skill selector.

**Acceptance criteria:**
- Selecting skill updates build state.
- Clear works.

**Manual verification:**
1. Run dev and select/clear skills.
2. Run tests/build.


## T0018 — Skill Selector B and Same-Skill Support

**Goal:** Add second selector and explicitly allow same skill twice.

**Dependencies:** T0017

**Allowed areas:**
- src/features/skills
- build editor

**Do not touch:**
- abilities

**Requirements:**
- Add skill B.
- Do not block same-skill selection.
- Support one slot blank.

**Non-goals:**
- No compatibility warnings.

**Acceptance criteria:**
- All allowed combinations persist.

**Manual verification:**
1. Test A only, A+B, A+A, clear.


## T0019 — Ability Browser per Skill

**Goal:** Show known database abilities grouped/ranked for selected skills.

**Dependencies:** T0018,T0012

**Allowed areas:**
- src/features/abilities

**Do not touch:**
- damage calculation

**Requirements:**
- Display abilities from selected skills.
- Handle same-skill selection without duplicate confusion.
- Allow search/filter.

**Non-goals:**
- No hotbar yet.

**Acceptance criteria:**
- Ability lists update with skill choices.

**Manual verification:**
1. Run dev with several skill pairs.
2. Run build.


## T0020 — Ability Bar Selection

**Goal:** Allow adding/removing selected abilities to build.

**Dependencies:** T0019

**Allowed areas:**
- src/features/abilities
- src/core/build

**Do not touch:**
- damage results

**Requirements:**
- Store ability IDs in BuildDocument.
- Prevent exact duplicate entry in one bar unless design explicitly needs later.
- Support ordering.

**Non-goals:**
- No rotation meaning.

**Acceptance criteria:**
- Selection survives normal state updates and serializes.

**Manual verification:**
1. Add/reorder/remove abilities.
2. Run tests/build.


## T0021 — Item Search Index

**Goal:** Create normalized item search text and filters.

**Dependencies:** T0013,T0016

**Allowed areas:**
- src/data/search

**Do not touch:**
- item modal UI

**Requirements:**
- Search name/effect text.
- Add explicit lightning/electricity synonym mapping.
- Filter by slot and minimum level.
- Default preference supports 90+.

**Non-goals:**
- No fuzzy dependency.

**Acceptance criteria:**
- Tests find representative effect-text items.

**Manual verification:**
1. Run search unit tests.
2. Spot-check queries.


## T0022 — Item Picker Modal

**Goal:** Build reusable real-item picker using search index.

**Dependencies:** T0021

**Allowed areas:**
- src/features/equipment

**Do not touch:**
- equipment grid integration

**Requirements:**
- Search input.
- Minimum level.
- Slot-constrained results.
- Show level/name/important innate effects.

**Non-goals:**
- No imported My Items tab.

**Acceptance criteria:**
- Picker returns selected item ID.

**Manual verification:**
1. Search lightning/psychic/taunt.
2. Select/cancel.
3. Run build.


## T0023 — Equipment Grid

**Goal:** Add core gear slots and connect real-item picker.

**Dependencies:** T0022,T0004

**Allowed areas:**
- src/features/equipment

**Do not touch:**
- mods
- sparks

**Requirements:**
- Render planner equipment slots.
- Equip/replace/clear items.
- Persist item definition reference.

**Non-goals:**
- No legality engine beyond slot matching.

**Acceptance criteria:**
- Selections serialize and restore within session.

**Manual verification:**
1. Equip several slots.
2. Replace/clear.
3. Run build.


## T0024 — Treasure Mod Browser

**Goal:** Add searchable TSys power browser by selected skills/slot context.

**Dependencies:** T0014,T0016

**Allowed areas:**
- src/features/mods
- src/data/search

**Do not touch:**
- mod numeric calculations

**Requirements:**
- Search power descriptions/names.
- Show tiers/effect descriptions.
- Allow broad browsing.

**Non-goals:**
- No hard final-mod-count enforcement.

**Acceptance criteria:**
- Representative Psychology/Cow/Unarmed mods searchable.

**Manual verification:**
1. Search/select mods.
2. Run build.


## T0025 — Candidate Mods on Equipment

**Goal:** Allow many candidate mods per equipped item.

**Dependencies:** T0024,T0023

**Allowed areas:**
- src/features/mods
- src/core/build

**Do not touch:**
- legality warnings

**Requirements:**
- Attach/remove/reorder candidate mods.
- Store power ID and selected tier.
- Do not block excessive count.

**Non-goals:**
- No transmutation simulator.

**Acceptance criteria:**
- Build can hold more candidates than final legal gear.

**Manual verification:**
1. Add many mods to one item.
2. Remove/reorder.
3. Run tests/build.


## T0026 — Planner Draft Local Save

**Goal:** Persist current unsaved BuildDocument locally.

**Dependencies:** T0006,T0025

**Allowed areas:**
- src/persistence/local
- build editor

**Do not touch:**
- remote save

**Requirements:**
- Autosave draft locally.
- Restore on reload.
- Provide reset/new build.

**Non-goals:**
- No public sharing.

**Acceptance criteria:**
- Refresh restores draft.
- Reset clears after confirmation.

**Manual verification:**
1. Create build, refresh, reset.
2. Run tests/build.


## T0027 — Build Summary Panel

**Goal:** Show selected skills, gear count, mods, data version, and target summary.

**Dependencies:** T0026

**Allowed areas:**
- src/features
- src/app

**Do not touch:**
- damage values

**Requirements:**
- Add concise build metadata summary.
- Expose game-data version.

**Non-goals:**
- No calculations.

**Acceptance criteria:**
- Summary reflects edits.

**Manual verification:**
1. Change skills/items/mods and verify summary.


## T0028 — Normalized Modifier Model

**Goal:** Define calculation-ready modifier operations/scopes.

**Dependencies:** T0005,T0014

**Allowed areas:**
- src/core/calculation

**Do not touch:**
- UI

**Requirements:**
- Define stat keys, operations, conditions, source provenance.
- Support unknown/unparsed fallback.

**Non-goals:**
- No full treasure mapping.

**Acceptance criteria:**
- Types/unit tests compile.

**Manual verification:**
1. Run tests/build.


## T0029 — Known Treasure Power Mapper Framework

**Goal:** Map supported TSys powers into normalized modifiers with explicit confidence.

**Dependencies:** T0028

**Allowed areas:**
- src/core/calculation
- src/data

**Do not touch:**
- all 1900+ power interpretations

**Requirements:**
- Create registry/mapper pattern.
- Return warnings for unsupported powers.
- Do not guess.

**Non-goals:**
- No requirement to understand every power.

**Acceptance criteria:**
- Known fixture maps; unknown fixture is preserved/warned.

**Manual verification:**
1. Run tests/build.


## T0030 — Ability Base Damage Extraction

**Goal:** Expose original ability damage components to calculator.

**Dependencies:** T0012,T0028

**Allowed areas:**
- src/core/calculation

**Do not touch:**
- percent stacking

**Requirements:**
- Create base component extraction.
- Support unsupported abilities cleanly.

**Non-goals:**
- No final damage.

**Acceptance criteria:**
- Fixture abilities return expected raw base values.

**Manual verification:**
1. Run tests/build.


## T0031 — Skill Base Damage Rule

**Goal:** Implement confirmed Skill Base contribution behavior.

**Dependencies:** T0030,T0029

**Allowed areas:**
- src/core/calculation

**Do not touch:**
- other uncertain formula ordering

**Requirements:**
- Apply Skill Base percentage only to original base.
- Add 500/+50%=+250 regression test.

**Non-goals:**
- No generic assumption for unrelated modifiers.

**Acceptance criteria:**
- Regression test passes and breakdown names contribution.

**Manual verification:**
1. Run focused tests/build.


## T0032 — Flat Damage Rule Buckets

**Goal:** Implement supported flat skill/ability/all-direct additions as separate categories.

**Dependencies:** T0031

**Allowed areas:**
- src/core/calculation

**Do not touch:**
- unvalidated percent ordering

**Requirements:**
- Add separate flat buckets.
- Expose breakdown steps.
- Map only validated/known cases.

**Non-goals:**
- No collapsing categories.

**Acceptance criteria:**
- Fixture calculations show correct separate contributions.

**Manual verification:**
1. Run tests/build.


## T0033 — Percent Damage Rule Framework

**Goal:** Add explicit percent multiplier stages without claiming unsupported mappings validated.

**Dependencies:** T0032

**Allowed areas:**
- src/core/calculation

**Do not touch:**
- crit
- DoT

**Requirements:**
- Create configurable ordered stages.
- Mark assumed rules where necessary.
- Allow rules to be corrected without UI changes.

**Non-goals:**
- No hidden universal formula.

**Acceptance criteria:**
- Breakdown/warnings reflect confidence.

**Manual verification:**
1. Run tests/build.


## T0034 — Ability Damage Cards

**Goal:** Show calculator results and expandable breakdown for selected abilities.

**Dependencies:** T0033,T0020

**Allowed areas:**
- src/features/abilities
- src/core/calculation

**Do not touch:**
- rotation

**Requirements:**
- Display normal damage where supported.
- Show unsupported state clearly.
- Expandable steps/warnings/confidence.

**Non-goals:**
- No DPS.

**Acceptance criteria:**
- Supported fixture renders result; unsupported ability does not fake number.

**Manual verification:**
1. Open abilities and inspect breakdown.
2. Run build.


## T0035 — Custom Target Dummy v1

**Goal:** Add enemy count and damage-type vulnerability inputs.

**Dependencies:** T0034

**Allowed areas:**
- src/features
- src/core/build
- src/core/calculation

**Do not touch:**
- monster database

**Requirements:**
- Enemy count 1-20.
- Target vulnerability/resistance model.
- Per-target and total AoE placeholders where ability metadata supports it.

**Non-goals:**
- No actual monster picker.

**Acceptance criteria:**
- Target changes recalculate relevant results.

**Manual verification:**
1. Change enemy count/resistance and verify.
2. Run tests/build.


## T0036 — Spark Domain Model

**Goal:** Define per-item Spark configuration and outcome types.

**Dependencies:** T0004

**Allowed areas:**
- src/core/sparks
- src/core/build

**Do not touch:**
- simulation UI

**Requirements:**
- Support none/simulated/manual modes.
- Represent aggregate outcome stats.
- Record count/category/seed.

**Non-goals:**
- No RNG yet.

**Acceptance criteria:**
- Serialization tests pass.

**Manual verification:**
1. Run tests/build.


## T0037 — Skill Damage Spark Simulator

**Goal:** Implement deterministic Skill Damage Spark distribution.

**Dependencies:** T0036

**Allowed areas:**
- src/core/sparks

**Do not touch:**
- UI

**Requirements:**
- Implement 10/40/10/24/16 distribution.
- Accept count and seed.
- Aggregate outcomes by stat.
- Use deterministic PRNG.

**Non-goals:**
- No item-slot UI.

**Acceptance criteria:**
- Probabilities total 100%.
- Fixed seed reproducible.
- 110 rolls produce count 110.

**Manual verification:**
1. Run focused tests/build.


## T0038 — Spark Expected Value Calculator

**Goal:** Compute analytical expected outcomes for N Sparks.

**Dependencies:** T0037

**Allowed areas:**
- src/core/sparks

**Do not touch:**
- percentiles

**Requirements:**
- Return expected stat totals.
- Keep exact fractional expectations.

**Non-goals:**
- No Monte Carlo percentile yet.

**Acceptance criteria:**
- Expected values match probability math.

**Manual verification:**
1. Run tests/build.


## T0039 — Spark Item UI

**Goal:** Add Spark controls to MainHand/OffHand/Ring/Necklace.

**Dependencies:** T0037,T0023

**Allowed areas:**
- src/features/sparks
- equipment UI

**Do not touch:**
- other armor Spark UX

**Requirements:**
- No Sparks / Simulate / Manual.
- Set count up to configured capacity.
- Reroll seed.
- Display aggregate outcomes.

**Non-goals:**
- Do not auto-import Spark results from Storage reports.

**Acceptance criteria:**
- Four primary slots work.
- Reroll changes simulated result.

**Manual verification:**
1. Configure each slot.
2. Refresh draft.
3. Run build.


## T0040 — Sparks Feed Damage Engine

**Goal:** Convert Spark outcomes into normalized modifiers.

**Dependencies:** T0039,T0033

**Allowed areas:**
- src/core/sparks
- src/core/calculation

**Do not touch:**
- rotation

**Requirements:**
- Map five Skill Damage Spark outcomes to existing modifier categories.
- Include Spark source in breakdown.

**Non-goals:**
- No unsupported Spark categories.

**Acceptance criteria:**
- Ability result changes when Sparks added; removal reverses.

**Manual verification:**
1. Compare 0 vs 110 Sparks.
2. Run tests/build.


## T0041 — Remote BuildRepository Contract

**Goal:** Define provider-agnostic create/read/update/delete interface.

**Dependencies:** T0004

**Allowed areas:**
- src/persistence/remote

**Do not touch:**
- provider implementation

**Requirements:**
- Typed request/results/errors.
- Owner token separate from BuildDocument.

**Non-goals:**
- No network provider.

**Acceptance criteria:**
- Contract tests/mocks compile.

**Manual verification:**
1. Run tests/build.


## T0042 — Backend Provider Spike and Decision

**Goal:** Evaluate/select smallest suitable persistence backend and document decision.

**Dependencies:** T0041

**Allowed areas:**
- docs
- deployment config spike

**Do not touch:**
- production feature implementation beyond proof

**Requirements:**
- Compare at least two viable options.
- Consider cost, local dev, GitHub deploy, token hashing, future accounts.
- Record ADR-style decision.

**Non-goals:**
- No broad deployment work.

**Acceptance criteria:**
- Decision documented with rationale and rejected alternative.

**Manual verification:**
1. Review decision document and proof command if applicable.


## T0043 — Build Save/Create API

**Goal:** Implement remote create and public read using selected backend.

**Dependencies:** T0042

**Allowed areas:**
- backend/API
- src/persistence/remote

**Do not touch:**
- update/delete

**Requirements:**
- Generate public ID.
- Generate/return owner token once.
- Store owner-token hash.
- Validate schema/payload.
- Read by public ID.

**Non-goals:**
- No account system.

**Acceptance criteria:**
- Create then public read succeeds; token not present in public payload.

**Manual verification:**
1. Run API tests/local flow.
2. Inspect stored representation.


## T0044 — Build Update/Delete Ownership

**Goal:** Implement authenticated anonymous update/delete.

**Dependencies:** T0043

**Allowed areas:**
- backend/API
- remote repository

**Do not touch:**
- accounts

**Requirements:**
- Verify owner token.
- Update build/timestamp.
- Confirmed client delete flow.
- Store tokens locally by build ID.

**Non-goals:**
- No soft-delete unless provider design requires it.

**Acceptance criteria:**
- Wrong token rejected; correct token updates/deletes.

**Manual verification:**
1. Test correct/wrong token flows.
2. Run build/tests.


## T0045 — Share and Duplicate UI

**Goal:** Add public share view, owner management actions, and duplicate.

**Dependencies:** T0044

**Allowed areas:**
- src/features
- routes
- persistence

**Do not touch:**
- public gallery

**Requirements:**
- Read-only public route.
- Copy share link.
- Owner edit/delete when local token available.
- Generate private management/recovery representation.
- Duplicate creates independent build.

**Non-goals:**
- No searchable gallery.

**Acceptance criteria:**
- Public user cannot edit original; duplicate receives new ownership.

**Manual verification:**
1. Open public link in private window.
2. Duplicate.
3. Test owner controls.


## T0046 — CharacterSheet Import Parser

**Goal:** Parse current CharacterSheet report snapshots locally.

**Dependencies:** T0016

**Allowed areas:**
- src/core/import
- src/features/import

**Do not touch:**
- Storage import

**Requirements:**
- Validate report type/version.
- Import character/server/timestamp/race/skills/known abilities/CurrentStats.
- Tolerate unknown optional fields.

**Non-goals:**
- No equipment import.

**Acceptance criteria:**
- Supplied fixture parses; malformed/wrong report fails clearly.

**Manual verification:**
1. Import fixture and inspect summary.
2. Run tests/build.


## T0047 — Storage Import and My Items

**Goal:** Parse Storage report into imported item instances and expose My Items source.

**Dependencies:** T0046,T0013

**Allowed areas:**
- src/core/import
- src/features/import
- equipment picker

**Do not touch:**
- equipped inference
- Spark import inference

**Requirements:**
- Import TypeID/name/level/slot/rarity/TSys powers/tiers and useful metadata.
- Distinguish inventory/vault.
- Add My Items tab/source.
- Do not treat IsInInventory as equipped.

**Non-goals:**
- No automatic Spark distribution import.

**Acceptance criteria:**
- Supplied fixture items appear with exact TSys powers.

**Manual verification:**
1. Import Storage fixture.
2. Search My Items.
3. Select an imported item.


## T0048 — Imported Item Instance in Planner

**Goal:** Allow selecting imported concrete instance with its TSys powers prepopulated.

**Dependencies:** T0047,T0025

**Allowed areas:**
- equipment
- mods
- core/build

**Do not touch:**
- loadout inference

**Requirements:**
- Selecting My Item attaches instance powers to planner representation.
- Keep user-added candidate mods distinct from imported existing powers.

**Non-goals:**
- No mutation of imported source snapshot.

**Acceptance criteria:**
- Imported instance produces correct mod list after selection.

**Manual verification:**
1. Select imported item.
2. Compare displayed powers with JSON.
3. Run tests/build.


## T0049 — CurrentStats Validation Panel

**Goal:** Compare mapped CharacterSheet CurrentStats to modeled build aggregates.

**Dependencies:** T0048,T0040

**Allowed areas:**
- src/core/validation
- src/features/import

**Do not touch:**
- automatic equipped-set solving

**Requirements:**
- Create mapping registry for supported exported stat keys.
- Show PG value / modeled value / delta.
- Show unsupported imported stat keys without discarding them.

**Non-goals:**
- Do not infer exact active loadout automatically.

**Acceptance criteria:**
- Mapped fixtures compare correctly; unmapped keys labeled unsupported.

**Manual verification:**
1. Import fixture, open validation panel, inspect deltas.
2. Run tests/build.


## T0050 — A/B Build Comparison MVP and First-Series Stabilization

**Goal:** Add side-by-side build comparison and stabilize T0001-T0049.

**Dependencies:** T0034,T0040,T0045

**Allowed areas:**
- src/features/comparison
- tests
- docs

**Do not touch:**
- rotation simulator
- defensive engine
- optimizer

**Requirements:**
- Compare two BuildDocuments.
- Show skills, selected abilities, key equipment/Sparks, ability-result deltas.
- Update Repo_Current_State and Known Issues.
- Run full quality suite.

**Non-goals:**
- No DPS rotation calculation.
- No optimizer.

**Acceptance criteria:**
- Two builds compare side by side.
- Calculation deltas use same engine.
- All tests/lint/typecheck/build pass.
- Docs reflect completed first series.

**Manual verification:**
1. Create A/B variants.
2. Verify changed gear/Sparks explain result delta.
3. Run full quality suite.
