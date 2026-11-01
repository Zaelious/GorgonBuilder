# GorgonBuilder — Tickets T0001–T0021

**Status:** Condensed v1 implementation series approved  
**Version:** 2.0  
**Date:** 2026-10-31

## Scope Philosophy

The previous 50-ticket backlog was intentionally conservative but too fragmented for current Codex capability.

This backlog uses **one coherent, reviewable outcome per ticket** rather than one small technical operation per ticket.

A ticket may contain several tightly related implementation steps when they form one subsystem or vertical slice, but it must still be safe to review, test, and abandon as one branch.

Guidelines:

- Aim for roughly 3–12 meaningful hand-written files per ticket when practical; generated data may exceed this.
- Do not combine unrelated subsystems simply because a stronger model can write more code.
- One ticket per feature branch: `feature/tXXXX-short-name`.
- Implement the assigned ticket only.
- All tickets require automated quality checks appropriate to the current repo.
- Customer hands-on testing is required only where marked.
- Out-of-scope discoveries go to `Known_Issues_And_Followups.md`.
- Stateful Rotation/DPS simulation begins in the **next ticket series after T0021**, after the per-ability engine is validated.

## Verification Classes

- **Automated + architect review:** Codex runs tests/build checks; ChatGPT reviews the implementation/PR. Customer manual testing is optional.
- **Customer quick check:** a short UI sanity check by the customer.
- **Customer hands-on:** the customer should perform the listed workflow because usability or live Project Gorgon behavior matters.
- **Customer game-math validation required:** in-game observations are part of accepting the formula work.
- **Customer milestone regression required:** broader end-to-end acceptance before release.


## T0001 — Project Foundation

**Complexity:** Standard

**Verification:** Customer quick check

**Goal:** Create the complete development foundation so later tickets do not need to revisit basic tooling or folder architecture.

**Dependencies:** None

**Allowed areas:**
- root configuration
- src/app
- src/core placeholders
- src/data placeholders
- src/features placeholders
- src/persistence placeholders
- src/styles
- src/test

**Do not touch:**
- Project Gorgon data ingestion
- planner features
- damage formulas
- backend implementation

**Requirements:**
- Initialize Vite + React + TypeScript.
- Enable strict TypeScript.
- Add Vitest, ESLint, typecheck, dev, test, lint, and build scripts.
- Create the baseline architecture folders from MVP_Technical_Design.md.
- Create a minimal desktop-first Gorgon Builder shell and shared CSS variables.
- Keep React imports out of src/core.
- Add at least one smoke test.

**Non-goals:**
- No skill/item planner.
- No game-data download.
- No save/share.
- No formula implementation.

**Acceptance criteria:**
- npm install succeeds.
- lint, typecheck, tests, and build succeed.
- App renders the Gorgon Builder shell.
- Baseline folder boundaries are present.

**Manual verification:**
1. Run npm install.
2. Run npm run dev and open the app.
3. Confirm the shell renders without console errors.
4. Run lint, typecheck, test, and build.

## T0002 — Official Game Data Snapshot Pipeline

**Complexity:** High

**Verification:** Automated + architect review

**Goal:** Create a repeatable way to fetch and pin an official Project Gorgon public-data snapshot with provenance.

**Dependencies:** T0001

**Allowed areas:**
- scripts
- src/data/raw
- src/data/adapters
- generated-data configuration
- root package scripts
- tests

**Do not touch:**
- React planner UI
- normalization logic beyond source-shape validation
- damage formulas

**Requirements:**
- Implement a data:update workflow that targets an explicit/discovered official Project Gorgon data version rather than hardcoding one architecture-wide.
- Fetch/cache the raw datasets needed by the first v1 series, including skills, advancement tables, abilities, ability keywords, dynamic ability values/DoTs/special values when published, items, TSys client info/powers, TSys profiles, attributes, effects, and relevant source metadata.
- Write a source manifest containing upstream version, fetch timestamp, source URLs/identifiers, file hashes or equivalent integrity metadata, and dataset presence.
- Fail clearly when a required dataset is missing or structurally invalid.
- Avoid fetching changing live data on every application page load.

**Non-goals:**
- No semantic normalization.
- No planner UI.
- No damage interpretation.

**Acceptance criteria:**
- A fresh data:update fetches or reuses a pinned snapshot deterministically.
- Manifest identifies the exact upstream snapshot.
- Required-file failures are explicit.
- Tests cover manifest/source validation.

**Manual verification:**
1. Run the update command against the configured official source.
2. Inspect the manifest and confirm an explicit PG data version and required datasets.
3. Run the quality suite.

## T0003 — Normalize Skills, Advancement Tables, Attributes, and Effects

**Complexity:** High

**Verification:** Automated + architect review

**Goal:** Normalize skill definitions and the progression data that can affect an active combat skill.

**Dependencies:** T0002

**Allowed areas:**
- src/data/normalized
- src/data/adapters
- scripts/data normalization
- tests

**Do not touch:**
- React UI
- ability normalization
- items/TSys normalization
- damage-engine ordering

**Requirements:**
- Create normalized skill records with stable official IDs/names and relevant metadata.
- Normalize advancement-table references/rewards while preserving whether interpretation is known or raw.
- Normalize attributes/effects required to preserve skill-reward meaning.
- Preserve unknown/raw identifiers rather than discarding them.
- Add reference-integrity tests for skill-to-advancement links.

**Non-goals:**
- Do not assume every advancement reward is already a validated damage modifier.
- No skill selector UI.

**Acceptance criteria:**
- Representative combat skills resolve their advancement data.
- All referenced normalized advancement tables resolve or produce an explicit integrity failure.
- Unknown reward semantics remain preserved.

**Manual verification:**
1. Run normalization tests and inspect representative Psychology, Cow, Unarmed, and Deer records.
2. Run the quality suite.

## T0004 — Normalize Abilities and Dynamic Ability Data

**Complexity:** High

**Verification:** Automated + architect review

**Goal:** Create calculation-ready ability definitions while preserving all official supporting data needed for later interpretation.

**Dependencies:** T0002,T0003

**Allowed areas:**
- src/data/normalized
- src/data/adapters
- scripts/data normalization
- tests

**Do not touch:**
- React UI
- final damage formula
- items/TSys normalization

**Requirements:**
- Normalize ability ID/internal name/display name, skill, rank/tier, cooldown/timing fields, damage components, and target/AoE metadata when present.
- Merge or link ability-keyword metadata correctly while preserving provenance.
- Preserve dynamic DoT/special-value records and effect links when available.
- Do not fabricate meaning for unknown fields.
- Add integrity tests for ability-to-skill and dynamic-data references.

**Non-goals:**
- No final damage calculation.
- No ability-bar UI.

**Acceptance criteria:**
- Representative abilities normalize with correct skill/rank relationships.
- Keyword/dynamic references resolve or explicitly fail integrity tests.
- Unsupported mechanics remain raw/unknown rather than guessed.

**Manual verification:**
1. Inspect representative Psychology, Cow, Unarmed, and Deer abilities.
2. Run normalization tests and the quality suite.

## T0005 — Normalize Items and Treasure System

**Complexity:** High

**Verification:** Automated + architect review

**Goal:** Normalize real equipment, fixed item effects, treasure powers/tiers, and TSys profile eligibility into one versioned dataset.

**Dependencies:** T0002,T0003

**Allowed areas:**
- src/data/normalized
- src/data/adapters
- scripts/data normalization
- tests

**Do not touch:**
- React equipment UI
- character Storage import
- damage formula ordering

**Requirements:**
- Normalize real equippable item definitions with stable IDs, names, level, slot, keywords/tags, fixed/innate effects, and relevant source metadata.
- Normalize TSys powers and tiers without requiring every effect to be numerically understood.
- Normalize TSys profiles and preserve item-to-profile relationships used for treasure-effect eligibility.
- Preserve raw descriptions/identifiers for unsupported effects.
- Add integrity tests for item TSysProfile references and treasure-power tier references.

**Non-goals:**
- No final mod-count policing.
- No planner UI.
- No assumption that every tooltip is a validated modifier.

**Acceptance criteria:**
- Representative level-90+ equipment normalizes correctly.
- TSys profile references resolve.
- Treasure powers/tiers remain searchable and traceable to raw data.
- Unknown effects are preserved.

**Manual verification:**
1. Inspect representative weapons, armor, rings, and necklaces.
2. Run normalization tests and the quality suite.

## T0006 — Generated Dataset, Completeness Checks, and Runtime Repository

**Complexity:** High

**Verification:** Automated + milestone data review

**Goal:** Produce the versioned runtime dataset and one typed lookup layer used by the rest of the application.

**Dependencies:** T0003,T0004,T0005

**Allowed areas:**
- scripts
- src/data
- src/generated or public generated data
- tests

**Do not touch:**
- planner feature UI
- damage formulas
- character import

**Requirements:**
- Generate compact deterministic normalized artifacts plus a game-data manifest.
- Expose typed lookup APIs for skills, advancement data, abilities, items, treasure powers, profiles, attributes, and effects.
- Add completeness/integrity checks: expected raw-to-normalized counts where applicable, stable IDs, all required cross-references resolved, and duplicate-ID detection.
- Record gameDataVersion for later saved builds.
- Keep raw data separate from hand-written application source.

**Non-goals:**
- No item-search UI.
- No build state.
- No formula interpretation beyond normalized records.

**Acceptance criteria:**
- Two generations from the same snapshot are stable.
- Manifest counts match generated artifacts.
- Integrity suite fails on deliberately broken references.
- Runtime repository can look up representative records.

**Manual verification:**
1. Run data:update and generation twice.
2. Inspect manifest/count report.
3. Spot-check Psychology/Cow/Unarmed/Deer plus representative equipment.
4. Run the full quality suite.

## T0007 — Build Domain and Local Persistence

**Complexity:** Standard

**Verification:** Automated + architect review

**Goal:** Define the serializable build document, local draft behavior, and preferences before UI features depend on ad hoc component state.

**Dependencies:** T0001,T0006

**Allowed areas:**
- src/core/build
- src/persistence/local
- tests

**Do not touch:**
- planner feature UI
- remote backend
- damage formulas

**Requirements:**
- Define BuildDocument schema v1 with schemaVersion and gameDataVersion.
- Represent skill slot A and B as skill ID plus user-selected level.
- Represent two independent ability bars with exact ability/rank IDs.
- Allow one skill, two different skills, or the same skill in both slots.
- Provide a helper that derives a unique active-skill set so selecting the same skill twice cannot double-apply skill-wide bonuses.
- Include equipment selections, imported/manual item-instance support hooks, candidate mods, Spark configuration, target configuration, title/notes metadata.
- Separate serializable build state from transient UI state.
- Autosave/restore the current draft and preferences locally with malformed-storage recovery.

**Non-goals:**
- No remote save/share.
- No planner UI.
- No formula calculations.

**Acceptance criteria:**
- Default and round-trip serialization tests pass.
- Same-skill active-set helper deduplicates correctly.
- Draft/preferences survive reload in tests.
- Malformed local data fails safely.

**Manual verification:**
1. Inspect a serialized default BuildDocument.
2. Run the quality suite.

## T0008 — Skill and Ability Planner UI

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Deliver the first real planner workflow: select skills/levels and configure two ability bars.

**Dependencies:** T0006,T0007

**Allowed areas:**
- src/features/skills
- src/features/abilities
- src/app
- build-editor state
- tests

**Do not touch:**
- equipment
- treasure mods
- damage results

**Requirements:**
- Add skill A and skill B selectors backed by normalized data.
- Allow either slot blank and allow the same skill in both slots.
- Add editable skill levels.
- Show ability browser/ranks for selected skills.
- Allow add/remove/reorder on independent bar A and bar B.
- Make same-skill/two-bar behavior understandable rather than collapsing the bars.
- Persist selections into BuildDocument/local draft.

**Non-goals:**
- No rotation semantics.
- No damage calculation.
- No equipment.

**Acceptance criteria:**
- A-only, A+B, and A+A builds all work.
- Skill levels persist.
- Ability ranks and bar order serialize correctly.
- Reload restores the draft.

**Manual verification:**
1. Create Psychology/Deer and Cow/Unarmed examples.
2. Test one skill only and the same skill twice.
3. Change levels and ability ranks, reorder bars, refresh, and confirm restoration.
4. Check console and run the quality suite.

## Pre-T0009 Prerequisite — KI-0008 Vite Gzip Transport Fix

**Status:** Completed and merged 2026-11-01 via [PR #16](https://github.com/Zaelious/GorgonBuilder/pull/16). T0009 is unblocked; retain these requirements as the verification record.

**Type:** Separate narrow technical work item, not a new numbered product ticket.

**Complexity:** Small

**Verification:** Automated + architect review and real-browser smoke check

**Goal:** Make the three generated `.json.gz` assets load in local Vite dev and preview without weakening T0006 compressed-byte verification.

**Dependencies:** T0006,T0008

**Suggested branch:** `fix/ki-0008-vite-gzip`

**Allowed areas:**
- `vite.config.ts` and minimal Vite asset serving configuration
- `src/data/repository/load.ts` only if strictly needed
- focused transport/integration tests and local-development docs

**Do not touch:**
- raw official data, normalizers, generated artifacts or their manifest
- build schema, existing skill/ability UI, equipment, treasure mods or calculators
- unrelated static routes, hosting architecture or dependencies

**Requirements:**
- Reproduce the mismatch using a real browser in both `npm run dev` and `npm run build && npm run preview`; record each gzip response's headers, `fetch().arrayBuffer()` byte count, and expected manifest byte count/hash.
- Ensure exactly the three generated game-data `.json.gz` assets reach JavaScript as the **original compressed bytes**. Prefer a path-restricted Vite serving fix with `Content-Type: application/gzip` and **no** `Content-Encoding: gzip`; verify that the solution actually works in the installed Vite version rather than assuming middleware order.
- Preserve compressed length + SHA-256 verification, explicit `DecompressionStream('gzip')`, decoded JSON length verification, and existing schema/version checks. Never bypass integrity validation or silently accept decoded bytes in place of compressed ones.
- Preserve other static assets, production output, Cloudflare Workers behavior and exact pinned data; do not add new runtime dependencies.
- Add regression tests including corrupted gzip bytes still failing verification, and a browser smoke test loading the existing skill/ability planner in both local modes.

**Non-goals:**
- No loader redesign, new compression format, CDN migration, equipment UI or future-ticket work.

**Acceptance criteria:**
- Both Vite modes load all three assets and show the current working planner without browser errors.
- Browser-received compressed bytes match manifest size and hash, and corrupted assets are rejected.
- Unrelated assets and deployed Cloudflare behavior do not regress.
- Pinned-data check, lint, typecheck, full tests, build and Wrangler dry-run pass.
- Implementation remains in one small PR and is reviewed/merged before T0009 begins.

**Manual verification:**
1. Run `npm run dev`, open the planner, inspect generated gzip response headers and received byte lengths.
2. Run `npm run build && npm run preview` and repeat the same browser checks.
3. Run corruption tests, pinned-data check and quality suite; report before/after headers and manifest hashes.

## T0009 — Equipment Search and Planner

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Let users search and equip real Project Gorgon items from the normalized database.

**Dependencies:** T0006,T0007,T0008; KI-0008 prerequisite must be merged first.

**Allowed areas:**
- src/data/search
- src/features/equipment
- src/app and build-editor equipment integration
- src/persistence/local preferences integration (avoid incompatible schema changes)
- build editor
- tests

**Do not touch:**
- treasure-mod planner
- Sparks
- damage formulas
- character import

**Requirements:**
- Build normalized item search text from item names, official effect text, tags, and explicit tested synonyms.
- Implement a **minimum published target-level** filter based on nullable `NormalizedItem.level` (exactly official `CraftingTargetLevel`), **not** an assumed equip requirement. Label the UI “Minimum target level” (not unqualified “Item level” or “Required level”). Use the existing `minimumEquipmentLevel` preference: default 90, `null` disables threshold filtering.
- Provide an explicit **Include unknown target level** control, on by default. For a positive threshold, include records with `level: null` only when enabled; never convert null to zero. Identify unknown-level items in results and explain the choice. Keep this control transient unless a backward-compatible preferences change is justified.
- Display published `SkillReqs` separately from target level where available. Do not infer actual item-instance level, legal equip level, rarity or treasure-tier eligibility from `CraftingTargetLevel`.
- Keep target-level predicates and combinations with slot/text search testable outside React. Apply the filter to base equipment definitions, not imported item instances.
- Support slot filtering and replacement/clear actions.
- Support searches such as lightning/electricity, psychic, taunt, kick, and combat refresh when source text/synonyms support them.
- Show important fixed/innate item effects in results.
- Persist real item IDs/selections into BuildDocument.

**Non-goals:**
- No fuzzy-search dependency unless measured as necessary.
- No treasure-effect candidate editing.
- No imported My Items tab.
- No inferred item equippability gate, treasure tier picker or redefinition of T0005 normalization.

**Acceptance criteria:**
- Representative effect-text searches return expected items.
- Wrong-slot items are excluded when selecting for a slot.
- Equip/replace/clear survives reload.
- With a 90+ threshold, known levels 89/90/91 behave as excluded/included/included. Null levels obey the include-unknown toggle; no threshold includes all levels. Slot and text filters compose correctly.
- Default level 90 and persisted changes round-trip via the existing preferences API; neither draft nor preference protections regress.
- UI distinguishes “target level”, “unknown target level” and published skill requirements. It makes no unsupported equip-level claims.
- For pinned v490, the unfiltered equipment subset has **518** definitions with target level 90+ and **500** with missing target level; check these as snapshot-specific regression counts, not immutable gameplay facts.

**Manual verification:**
1. Open equipment search at target level 90+, toggle unknowns on/off, and verify boundary cases 89/90/91/null.
2. Test 80+, no minimum, search terms and slots; refresh to check persistence of the minimum preference.
3. Inspect an item with published `SkillReqs` and an unknown-level item; verify labeling.
4. Equip, replace, clear and refresh without changing skill bars or other draft fields.
5. Run pinned-data check, lint, typecheck, tests and build, plus local dev/preview smoke after the KI-0008 fix.

## T0010 — Treasure Mod Planner

**Complexity:** High

**Verification:** Customer hands-on

**Goal:** Allow broad but data-informed candidate treasure-mod planning on real items.

**Dependencies:** T0005,T0006,T0007,T0009

**Allowed areas:**
- src/features/mods
- src/data/search
- src/core/build
- tests

**Do not touch:**
- damage-engine numeric mapping beyond display
- hard final-mod-count enforcement
- transmutation simulator

**Requirements:**
- Provide searchable TSys power/tier browsing.
- Use the selected item's TSysProfile plus selected skills/context to rank/filter relevant powers where the official data supports it.
- Show slot/profile relevance without blocking exploratory candidate staging.
- Allow users to attach more candidate mods than a legal finished item may contain.
- Store power ID and selected tier separately from fixed innate item effects and later imported existing powers.
- Allow remove/reorder/edit-tier.

**Non-goals:**
- Do not build a legality nanny.
- Do not guess unsupported eligibility.
- No damage calculation yet.

**Acceptance criteria:**
- Representative Psychology/Cow/Unarmed powers are searchable.
- Selected item profile affects relevance/results where supported.
- Many candidate mods can be staged and persist through reload.

**Manual verification:**
1. Equip several different item types and compare available/relevant mod results.
2. Stage more mods than a final item would allow, change tiers, reorder/remove, and refresh.
3. Run the quality suite.

## T0011 — Character Import Core and Sanitized Fixtures

**Complexity:** High

**Verification:** Automated + customer file smoke test

**Goal:** Parse current Project Gorgon CharacterSheet/Storage snapshots locally early enough to support later formula validation.

**Dependencies:** T0006,T0007

**Allowed areas:**
- src/core/import
- src/data import adapters
- sanitized test fixtures
- tests

**Do not touch:**
- My Items UI
- automatic equipped-loadout inference
- remote upload of character reports
- damage validation UI

**Requirements:**
- Parse CharacterSheet metadata, timestamp/version, skills/levels/known abilities, and CurrentStats.
- Parse Storage item instances including TypeID/name/level/slot/rarity, exact TSys powers/tiers, and useful optional crafting metadata.
- Treat export freshness according to its timestamp/report version.
- Capability-detect an authoritative equipped-state field if a current format exposes one; never infer equipped merely from IsInInventory.
- Preserve unknown optional fields safely enough for forward compatibility.
- Create sanitized/minimal fixtures based on report structure; do not commit the customer's real personal exports.
- Keep parsing entirely local.

**Non-goals:**
- No Spark-outcome import unless an explicit current report field proves it.
- No automatic loadout solving.
- No My Items picker yet.

**Acceptance criteria:**
- Sanitized CharacterSheet and Storage fixtures parse deterministically.
- Malformed/wrong report types fail clearly.
- Unknown optional fields do not break compatible reports.
- Real customer export can be smoke-tested locally without being committed.

**Manual verification:**
1. Locally choose a current CharacterSheet/Storage export and confirm the parser identifies character, timestamp, representative skills, and item counts.
2. Do not add the real exports to git.
3. Run the quality suite.

## T0012 — Build Modifier Aggregation Engine

**Complexity:** High

**Verification:** Automated + game-math review

**Goal:** Create the single source that converts an entire build into normalized modifiers before ability math is applied.

**Dependencies:** T0003,T0005,T0007,T0010,T0011

**Allowed areas:**
- src/core/calculation
- src/core/build
- normalized modifier mappers
- tests

**Do not touch:**
- React calculation UI
- final ability damage formula
- Sparks

**Requirements:**
- Define normalized modifier operations, scopes, conditions, provenance, and confidence states.
- Aggregate active-skill advancement rewards using the unique active-skill set.
- Aggregate fixed/innate item effects.
- Aggregate imported existing TSys powers separately from user-staged candidate mods.
- Create a registry/mapper pattern that supports known powers and preserves unsupported powers with warnings instead of guessing.
- Return a deterministic modifier set plus unresolved/unsupported warnings.
- Ensure same-skill-in-both-slots does not double-count active-skill-wide rewards.

**Non-goals:**
- No Spark modifiers yet.
- No final damage result.
- No attempt to interpret every PG effect immediately.

**Acceptance criteria:**
- Each supported modifier retains source/provenance.
- Unknown effects survive as warnings.
- Same-skill deduplication regression passes.
- Removing one item/mod reverses only its contributed normalized modifiers.

**Manual verification:**
1. Review the aggregate breakdown for controlled Psychology and Cow/Unarmed fixtures.
2. Run focused tests and the quality suite.

## T0013 — Core Ability Damage Engine

**Complexity:** High

**Verification:** Customer game-math validation required

**Goal:** Calculate transparent per-ability damage using the aggregated modifier model without inventing unsupported formula ordering.

**Dependencies:** T0004,T0012

**Allowed areas:**
- src/core/calculation
- formula fixtures/tests

**Do not touch:**
- rotation/DPS simulation
- Spark simulation
- React result UI

**Requirements:**
- Extract original ability damage components from normalized ability data.
- Implement the confirmed Skill Base rule: Skill Base percentage contributes only from the original ability base.
- Implement validated flat damage buckets separately (skill, ability-specific, all-direct, etc.).
- Implement explicit ordered percent stages only where supported; mark assumptions/unknowns.
- Produce CalculationResult with ordered breakdown, warnings, provenance, and confidence.
- Add the 500 base / +50% Skill Base = +250 regression case.
- Add initial Psychology and Cow/Unarmed regression fixtures from confirmed observations where available.

**Non-goals:**
- No DPS number.
- No hidden universal percent-damage formula.
- No fabricated crit chance or unsupported DoT behavior.

**Acceptance criteria:**
- Confirmed Skill Base regression passes.
- Supported modifiers show distinct ordered breakdown steps.
- Unsupported interactions lower confidence/show warnings instead of returning falsely precise 'validated' results.

**Manual verification:**
1. Compare at least one Psychology and one Cow/Unarmed controlled in-game value/change against the engine.
2. Record mismatches rather than modifying formulas by guesswork.
3. Run focused tests and the quality suite.

## T0014 — Ability Results UI and Custom Target Dummy

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Expose trustworthy ability results in the planner and allow controlled single-target/AoE comparison.

**Dependencies:** T0008,T0013

**Allowed areas:**
- src/features/abilities
- target configuration UI
- src/core/build
- tests

**Do not touch:**
- rotation simulator
- monster database
- Sparks

**Requirements:**
- Show normal-hit damage where supported.
- Show critical-hit output only when inputs/rules are supported, otherwise surface the limitation.
- Provide expandable calculation breakdown, assumptions, warnings, and confidence.
- Add target enemy count 1-20 and supported vulnerability/resistance inputs.
- For AoE abilities, show per-target damage and total affected-target damage when target-cap data is known.
- Never assume infinite target cap when unknown.
- Add an optional **Respect Skill Level** toggle in the ability picker, off by default. With it enabled, family quick-add selects the highest published ability Level at or below the selected skill's configured level (canonical ID ascending to break ties); with it disabled, the existing highest-published-tier quick-add remains unchanged. If no tier qualifies, explain this without preventing unrestricted manual tier selection. Changing skill levels must not auto-replace equipped abilities. Preserve exact official IDs/ranks; the toggle is transient UI state, not a BuildDocument v1 schema change.

**Non-goals:**
- No live DPS meter.
- No real monster selector.
- No stateful buffs/debuffs.

**Acceptance criteria:**
- Build changes recalculate ability cards.
- Target changes affect only relevant calculation stages.
- Unsupported mechanics are visibly marked.
- AoE shows per-target and total values where supported.
- Ability quick-add chooses the correct tier with Respect Skill Level off/on; equal-level ties, no-match feedback, unrestricted manual selections and unchanged already-equipped bars are tested.

**Manual verification:**
1. Use a known Psychology or Cow/Unarmed build and inspect expanded math.
2. Change one mod/item and verify the explained delta.
3. Test 1 and multiple enemies.
4. Try the optional Respect Skill Level toggle at different skill levels, confirm default highest tier versus highest eligible tier, and verify manual override and unchanged equipped abilities.
5. Run the quality suite.

## T0015 — Mastery Spark Simulation, UI, and Damage Integration

**Complexity:** High

**Verification:** Customer hands-on

**Goal:** Deliver the complete v1 offensive Spark workflow as one coherent feature.

**Dependencies:** T0009,T0012,T0013,T0014

**Allowed areas:**
- src/core/sparks
- src/features/sparks
- src/core/build
- src/core/calculation
- equipment UI
- tests

**Do not touch:**
- unsupported Spark categories
- character-report Spark inference
- rotation simulator

**Requirements:**
- Represent No Sparks, Simulated Sparks, and Manual Actual Results.
- Support primary offensive slots MainHand, OffHand, Ring, and Necklace/Amulet.
- Support up to 110 modeled Sparks for applicable Mastercrafted/Prophecied planning.
- Implement deterministic seeded Skill Damage Spark outcomes: 10% +0.50% All Direct Damage, 40% +1 Skill Damage, 10% +1 All Direct Damage, 24% +1% Skill Damage, 16% +3% Skill Base Damage.
- Calculate exact analytical expected values separately from random simulation.
- Allow rerolling the simulation seed.
- Convert Spark aggregate outcomes into the existing normalized modifier categories with Spark provenance.
- Feed Spark effects through the same ability calculator.

**Non-goals:**
- No claim that Storage reports expose actual Spark rolls unless proven later.
- No percentile/optimizer system required for v1.

**Acceptance criteria:**
- Probabilities total 100%.
- A fixed seed is reproducible and exactly N rolls are counted.
- Expected values match probability math.
- 0 vs 110 Sparks produces an explainable ability-result delta.
- Manual Spark results can be entered without RNG.

**Manual verification:**
1. Configure each of the four offensive slots.
2. Reroll 110 Sparks and verify result changes; refresh and verify saved state.
3. Enter actual/manual Spark totals and compare ability changes.
4. Run the quality suite.

## T0016 — My Items Import and CurrentStats Validation

**Complexity:** High

**Verification:** Customer hands-on with current export

**Goal:** Turn imported character reports into useful planner data and a formula-validation tool.

**Dependencies:** T0011,T0012,T0013,T0015

**Allowed areas:**
- src/features/import
- src/core/validation
- equipment picker
- src/core/build
- tests

**Do not touch:**
- automatic equipped-set guessing without authoritative data
- remote upload of raw reports
- rotation simulator

**Requirements:**
- Add an Import Character workflow for local CharacterSheet/Storage files.
- Show character/server/export timestamp and compatibility status.
- Expose imported owned equipment as a My Items source.
- Selecting an imported item instance must preserve its exact existing TSys powers/tiers and keep user-added candidate mods separate.
- If the report exposes an authoritative equipped field, use it; otherwise require/manual-select loadout and never treat IsInInventory alone as equipped.
- Add a registry mapping supported CurrentStats keys to modeled aggregate stats.
- Show Project Gorgon value, GorgonBuilder value, delta, and unsupported keys.

**Non-goals:**
- No automatic Spark-roll import unless explicitly present in the report.
- No attempt to solve the equipped loadout from CurrentStats in v1.

**Acceptance criteria:**
- Current customer export can populate representative skills/items.
- Imported TSys powers match the source report.
- CurrentStats panel compares supported mappings and labels unsupported ones.
- Raw reports never leave the browser.

**Manual verification:**
1. Generate/use a current export.
2. Import both reports and verify timestamp, skills, and several known item/mod instances.
3. Select a controlled loadout and inspect CurrentStats deltas.
4. Do a one-item before/after in-game comparison if practical.
5. Run the quality suite.

## T0017 — A/B Build Comparison

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Make comparison a first-class planner workflow using the same calculation engine on both sides.

**Dependencies:** T0014,T0015,T0016

**Allowed areas:**
- src/features/comparison
- src/core/build
- tests

**Do not touch:**
- rotation/DPS comparison
- optimizer
- defensive scoring

**Requirements:**
- Create/duplicate build B from build A or load two BuildDocuments.
- Show skill/level/ability differences, equipment/mod/Spark differences, relevant aggregate-stat differences, and supported ability-result deltas.
- Allow expandable explanations showing which sources caused a delta.
- Ensure both sides call the same aggregation and calculation engines.

**Non-goals:**
- No rotation comparison.
- No automatic 'winner' optimization.
- No defensive score yet.

**Acceptance criteria:**
- Changing one controlled source in B produces an explainable corresponding delta.
- Unchanged values remain unchanged.
- Same engine paths are used for A and B.

**Manual verification:**
1. Duplicate a real test build, alter one item/mod/Spark source, and confirm the expected delta.
2. Try a more heavily changed build and inspect explanations.
3. Run the quality suite.

## T0018 — Save/Share Architecture, Provider Decision, and Deployment Foundation

**Complexity:** High

**Verification:** Automated + architect review

**Goal:** Choose and prove the small persistence/deployment architecture before implementing public build ownership.

**Dependencies:** T0007

**Allowed areas:**
- src/persistence/remote
- backend/deployment configuration
- docs/ADR
- tests

**Do not touch:**
- full save/share UI
- accounts
- public gallery

**Requirements:**
- Define a provider-agnostic BuildRepository interface for create/read/update/delete.
- Compare at least two viable backend/hosting options against simplicity, cost, HTTPS, token hashing, local development, GitHub deployment, and future account compatibility.
- Record the chosen provider and rejected alternative in an ADR/design update.
- Create a minimal local/staging deployment foundation and secrets/configuration pattern.
- Keep owner token outside BuildDocument.

**Non-goals:**
- No production account system.
- No searchable public gallery.
- No complete sharing UI.

**Acceptance criteria:**
- Provider decision is documented with rationale.
- BuildRepository contract is testable with a mock.
- Local/staging backend skeleton can start/deploy without embedding secrets in git.

**Manual verification:**
1. Review the provider decision and deployment instructions.
2. Run contract tests and any staging health check defined by the ticket.

## T0019 — Build Persistence and Anonymous Ownership Backend

**Complexity:** High

**Verification:** Automated + API smoke test

**Goal:** Implement secure persistent build create/read/update/delete with anonymous ownership.

**Dependencies:** T0018

**Allowed areas:**
- backend/API
- src/persistence/remote
- server tests
- schema validation

**Do not touch:**
- accounts
- public gallery
- final sharing UI

**Requirements:**
- Create persisted build records with public ID, schemaVersion, gameDataVersion, build payload, timestamps, and owner-token hash.
- Generate or accept a cryptographically strong owner token and return plaintext only to the creator as designed.
- Public read must never return owner token/hash.
- Update/delete require valid owner proof and use secure token verification.
- Validate build schema and payload size.
- Support duplicate/fork at the repository/service level by creating a new independently owned build.
- Add abuse/rate-limit hooks or provider-level protections appropriate to the selected architecture.

**Non-goals:**
- No accounts.
- No public discovery/search.
- No UI ownership controls yet.

**Acceptance criteria:**
- Create/read/update/delete tests pass.
- Wrong-token update/delete is rejected.
- Public response contains no ownership secret.
- Duplicate receives a new public ID and owner token.

**Manual verification:**
1. Run the documented API/local smoke flow for create/read/update/delete with both correct and incorrect tokens.
2. Inspect a stored record representation for hashed-not-plaintext ownership.

## T0020 — Sharing, Ownership, and Public Build UI

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Expose the full anonymous save/share/edit/delete/duplicate workflow to users.

**Dependencies:** T0017,T0019

**Allowed areas:**
- routes
- src/features/sharing
- src/persistence/local
- src/persistence/remote integration
- build editor
- tests

**Do not touch:**
- accounts
- public build gallery
- rotation simulator

**Requirements:**
- Add Save/Update controls for an owner.
- Store owner tokens locally keyed by public build ID.
- Add read-only public build route/share link.
- Add a clearly distinguished private management/recovery representation for transferring ownership capability to another device.
- Show edit/delete controls only when valid owner capability is available.
- Require explicit confirmation for delete.
- Allow public viewers to duplicate into a new independent build.
- Handle network failures without destroying the local draft.

**Non-goals:**
- No login/signup.
- No searchable gallery.
- No soft-delete recovery requirement.

**Acceptance criteria:**
- Public/incognito viewer cannot edit the original.
- Owner can update/delete.
- Management capability works on another test browser/device context.
- Duplicate creates independent ownership.
- Network failure preserves local work.

**Manual verification:**
1. Save a real planner build and open its public link in a private/incognito window.
2. Verify read-only behavior and duplicate it.
3. Return as owner and edit/update/delete a test build.
4. Test the management/recovery flow in a second browser context.
5. Run the quality suite.

## T0021 — v1 Stabilization, E2E Regression, Documentation, and Release

**Complexity:** High

**Verification:** Customer milestone regression required

**Goal:** Turn the completed features into a trustworthy deployable v1 and update the project record to match reality.

**Dependencies:** T0016,T0017,T0020

**Allowed areas:**
- tests
- deployment configuration
- docs
- bug fixes strictly required for v1 acceptance
- release configuration

**Do not touch:**
- rotation simulator
- defensive/threat engine
- optimizer
- accounts
- new product features

**Requirements:**
- Add minimal end-to-end smoke coverage for create/edit local build, real-data selection, calculator path, Spark path, sanitized import, save/public-read/duplicate, and A/B comparison.
- Run the complete game-data integrity/completeness suite.
- Run all unit/component/integration/E2E tests plus lint/typecheck/build.
- Perform targeted regression against known Psychology and Cow/Unarmed validation cases.
- Deploy the agreed v1 environment using the selected infrastructure.
- Update Repo_Current_State, Known_Issues_And_Followups, and any design docs changed by implementation evidence.
- Document remaining unvalidated formula areas clearly.
- Do not add new features during stabilization.

**Non-goals:**
- No rotation/DPS simulator.
- No defense/threat calculator.
- No optimizer.
- No public gallery/accounts.

**Acceptance criteria:**
- All required quality checks pass.
- Core user flow works end to end on the deployed environment.
- Known formula limitations are visible/documented.
- Repository state docs accurately describe the shipped system.

**Manual verification:**
1. Create a fresh manual build from real PG data.
2. Select skills/levels/abilities, gear, mods, and Sparks and inspect calculation breakdowns.
3. Import a current character snapshot and inspect My Items/validation.
4. Create an A/B comparison.
5. Save/share the build, test read-only/duplicate in incognito, then verify owner editing.
6. Run the release checklist and confirm no unexpected console errors.
