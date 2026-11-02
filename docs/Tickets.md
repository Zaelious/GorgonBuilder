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

**Status:** Completed and customer-accepted 2026-11-01; merged via [PR #18](https://github.com/Zaelious/GorgonBuilder/pull/18), squash commit `7cd03eef7aaf4bea7bf79fcb3850bf7d6d03746d`. [Verification, screenshots and browser checks](T0009_Verification.md). The accepted revision adds nine always-visible equipment rows, official item icons, collapsed other slots and safe X/Escape picker dismissal. Optional backdrop dismissal is a nonblocking follow-up (KI-0010); T0010 is separate.

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

## T0009-F1 — Compact Equipment Details and Exclusive Offhand Position

**Status:** Completed, customer-accepted and squash-merged 2026-11-01 via [PR #20](https://github.com/Zaelious/GorgonBuilder/pull/20), commit `09257ce95ae7e6e5500d10cdfbf58ace9ad84b75`. [Verification](T0009_F1_Verification.md) records 418 passing tests, browser checks, exclusive OffHand/OffHandShield swaps and explicit legacy-conflict recovery. T0010 is next and has not started.

**Complexity:** Small

**Verification:** Customer hands-on

**Goal:** Remove redundant equipment headers in expanded details and enforce one occupied offhand loadout position while retaining exact official item identifiers.

**Dependencies:** Merged T0009, PR #18.

**Allowed areas:**
- `src/features/equipment` and focused tests
- `src/app/editor/build-editor.ts` equipment-only operations and tests
- related verification documentation

**Do not touch:** pinned official source, item/TSys normalizers, generated artifacts, saved BuildDocument schema, other skill/ability editor, treasure-mod editor, Sparks, damage engine, imports, remote saving.

**Requirements:**
- The collapsed row already shows selected item icon and name. Do not repeat this icon/name as a large header in expanded item details; keep source effects, requirements, description, and all actions accessible.
- Treat published `OffHand` and `OffHandShield` as **one mutually exclusive player-facing offhand loadout position**, even though official data uses two canonical EquipSlot strings. Present one offhand row and one coherent picker, including offhand weapons and shields, with clear type labels as needed. Preserve the exact selected official slot string on saved items; do not rewrite `OffHandShield` to `OffHand`.
- Selecting an offhand item when a shield occupies the position, or vice versa, must **replace/swap** the previous occupant instead of adding a second. Safeguard associated manual/imported instance data, candidate mods and Spark settings with the existing explicit confirmation/preservation policy, never silently discard.
- Unmodified legacy builds containing both `OffHand` and `OffHandShield` must load without silent deletion; clearly indicate a conflict and provide explicit resolution. New UI actions must never create a second occupant in this group.
- Other 17 published slots and existing saved selections remain unchanged.
- Keep X/Escape picker dismissal and drag-selection safety. Optional click-outside dismissal is separate KI-0010.

**Acceptance criteria / tests:**
1. Expand a selected Head, MainHand, Ring and OffHand row: the title and image appear once, in the persistent row summary; all existing details and replace/clear controls remain discoverable.
2. With empty offhand, choose an offhand weapon, then switch to a shield, then back; verify only one occupant in the saved build, with the correct exact canonical slot and official item ID after each operation and reload.
3. Opposite-type candidates are searchable from the same offhand picker and cannot be simultaneously equipped through normal UI or edit operations.
4. Preexisting dual-slot legacy selections remain intact on restore until an explicit customer resolution; manual/imported metadata and candidate mods/Sparks are not silently destroyed.
5. Both skill bars and unrelated equipment/prefs survive; keyboard/mobile no-overflow, pinned data, lint, typecheck, tests, production build, Wrangler dry-run, real Chromium dev/preview and gzip integrity checks pass.

**Manual verification:** Inspect compact expanded rows; equip offhand weapon, swap to shield and back; refresh each time; test a legacy dual-selection draft; ensure no unexpected deletions and both skill bars remain unchanged. Stop with a small new PR for architectural review and customer acceptance. Do not merge or start T0010.

## T0010 — Treasure Mod Planner

**Status:** Customer-accepted and completed on 2026-11-01. [PR #22](https://github.com/Zaelious/GorgonBuilder/pull/22) squash-merged into `main` at `385e4b9`. [Verification report](T0010_Verification.md): 513 passing tests, GitHub Actions and Cloudflare checks, desktop/mobile Chromium smoke evidence. The completed inline UI includes skill/slot-aware Available↔Selected planning, exact tier persistence, full item STATS, active-skill cleanup with Undo and ability-specific Relevant Mods. Source/profile limitations are shown explicitly; no damage math or final legality enforcement.

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

**Status:** Completed, customer-accepted and squash-merged 2026-11-02 via [PR #23](https://github.com/Zaelious/GorgonBuilder/pull/23), commit `a197599`. [Verification](T0011_Verification.md): CI passed 611 tests (98 focused imports), the `XpNeededForNextLevel: -1` defect was fixed with a synthetic regression, and private fresh customer exports passed independent field-constraint review. The full Node v490 reference resolver was not run on those private files; verify resolution counts in the planned T0011-F1 browser UI.

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

## T0011-F1 — Browser Import and My Items Picker

**Status:** Customer conditionally accepted and squash-merged 2026-11-02 via [PR #24](https://github.com/Zaelious/GorgonBuilder/pull/24), commit `4b84960`. Architect reviewed implementation and green CI/Cloudflare checks (640 tests). [Verification](T0011_F1_Verification.md) documents synthetic browser smoke; actual customer-export reference-resolution counts remain unverified pending private hands-on use. Mastery Spark outcomes were not imported.

**Complexity:** High

**Verification:** Customer hands-on in web browser with current exports, plus focused tests and full quality suite

**Goal:** Let users import current CharacterSheet/Storage JSON locally, inspect real owned equipment and select its exact instances for the planner before formula work.

**Dependencies:** T0011,T0009,T0010

**Allowed areas:** src/features/import, equipment picker, necessary build/editor/local-state integrations, tests, verification docs.

**Do not touch:** T0012 calculator, CurrentStats delta calculations (T0016), automatic equipped inference, remote raw-file upload, Spark-roll inference, unrelated UI redesign.

**Requirements:**
- Provide a compact local-only Import Character browser workflow for both JSON reports, showing character/server, timestamp/version, skill and item counts, and clear errors.
- Expose a searchable **My Items** source for owned equipment; support useful slot, item-level, rarity and storage-location filters.
- Display actual imported item names/levels/rarity/slots, source TSys powers and **exact** tiers; clearly show unresolved official mappings without approximations or silently dropping evidence.
- Equip/replace/clear manually from My Items, retaining imported existing powers distinct from candidate mods and preserving the saved draft, unrelated skills, Sparks and exclusive offhand behavior.
- Never equate `IsInInventory` with equipped. Preserve user choice explicitly; no Spark history import without source proof.
- Keep raw reports in the browser only, with predictable re-import/refresh behavior and privacy-safe diagnostics.

**Acceptance:** Current real files import through the UI; known item instances, skill levels and power/tier pairs are correct; item selection and reload preserve identities and unrelated build state; bad reports show useful errors; all tests/build and browser preview checks pass. Record actual resolved/unresolved reference counts without publishing raw exports.

**Manual verification:** Import current CharacterSheet and Storage in a branch preview; search representative rings/weapons/armor, compare levels and powers to the game, equip/swap/clear and reload, confirm unknown-ID warnings and no raw-file upload.

## T0011-F2 — Editable Imported Treasure Mods and Unified Skill Styling

**Status:** Planned follow-up based on customer hands-on feedback (2026-11-02). Not started; create a separate Codex branch/PR. Complete before T0012 modifier aggregation so the effective mod semantics are stable.

**Complexity:** High

**Verification:** Customer hands-on with imported Cow/Unarmed item + automated unit, editor, persistence, and browser UI tests.

**Goal:** A concrete imported item must be a useful editable starting point, not a read-only copy with a separate unrelated mod list. Show all effective imported and planned treasure mods in one Selected editor, allow changing/removing imported powers on the **working build**, and use the same skill colors/grouping across origins.

**Dependencies:** T0010,T0011,T0011-F1

**Allowed areas:**
- src/core/build (item/power edit contracts, validation, preservation of source evidence)
- src/app/editor (safe equipment mod edits and autosave integration)
- src/features/mods, src/features/equipment, src/features/import (minimal integration)
- src/data/search/treasure-planning.ts (shared display/grouping logic)
- focused tests, styling and verification docs

**Do not touch:**
- T0012 formula/modifier aggregation implementation, T0013 damage formulas, T0015 Sparks
- T0016 CurrentStats comparison, report parser semantics, official data/v490 pin
- remote upload, automatic equipped guessing, unrelated planner redesign

**Observed customer reproduction:**
1. Import Storage and choose a real Cow/Unarmed item, then select Cow as Skill A and Unarmed as Skill B.
2. STATS shows imported existing powers (dashed blue/gold chips); the Selected editor shows 0 because it reads only `candidateMods`.
3. Add a Cow candidate: Selected shows 1, despite multiple imported powers; the newly added Cow chip is solid blue, unlike the dashed imported Cow chips.
4. Imported powers cannot be removed or have their tiers changed through that editor, and STATS lists all imported powers before planned ones instead of a unified skill grouping.

**Requirements:**
- **Unified effective Selected list:** Show every *resolvable effective existing* imported treasure power and every planned candidate in the existing Available/Selected editor. Selected count reflects both; each row has its actual skill/color, exact tier, and a subtle origin indicator (`Imported` or `Planned`). Preserve distinct instances and original source order in saved data. Keep imbues in their separate supported presentation; do not misidentify imbues or raw/unknown entries as editable known treasure mods.
- **Working-copy editing:** On an imported item, explicitly removing an imported power or changing its tier updates only the selected build's effective `ItemInstance.existingPowers` (or a similarly small explicit override model). Never mutate `metadata.sourceItem` or the original in-memory Storage report. Preserve original power IDs/tiers, unresolved entries and imbues as read-only reference evidence accessible via `Original imported item`. Provide a clear `Restore imported mods` action that restores the original known treasure powers without discarding separately staged planned mods, skills, or other item settings. Confirm destructive overwrite only when useful; no prompt for every normal experimental edit.
- **Add/remove consistency:** Newly staged powers remain separate candidates with explicit origin. Available should exclude any power already present in the effective existing or planned selection so the same power is not inadvertently staged twice; after removing a working imported power it becomes selectable again. Preserve legitimate pre-existing duplicate powers rather than silently deduplicating the imported baseline. A new staged power must not silently overwrite original imported powers. Removing/changing imported mods should be persistent across reloads and must not reappear as effective simply because `restoredImportedItem()` reparses `metadata.sourceItem`; the original-detail view must be clearly labeled as historical source, not current build state.
- **Grouping and colors:** Use shared `skillTone` and grouping logic for BOTH editable imported and planned rows, grouped by current Skill A, Skill B, then Generic/Endurance/Shamanic/other/unknown. Stable sort for display only; saved mod order and source identities must remain intact. Cow as Skill A should have the same solid blue chip whether it was imported or newly added; Unarmed as Skill B should have the same filled gold/amber chip in both cases. Distinguish provenance with an icon or small text, **not** different skill-tone styling; respect contrasting text, accessible labels, and light/dark/mobile behavior. Label actual skill names, not just vague A/B.
- **STATS and editor agree:** The STATS panel must render exactly the current effective working powers and separately staged candidates, without double-counted or resurrected removed imports. If an imported mod is removed, it disappears from effective STATS/Selected but remains inspectable under original import evidence. If tier changes, the new exact power-owned tier renders; no nearest-tier substitution. Keep unknown/unresolved original entries visible with their status and source tier, without inventing editable mappings. Clearly distinguish fixed/innate effects.
- **Build integration:** Maintain existing `kind: 'imported'`, schema-v1 local autosave if possible, and current offhand behavior. Validate all edits against known official power-owned tiers. No accidental mutation of shared snapshots; preserve candidate mod staging, Spark settings, skill bars, other gear and protected/read-only draft behavior. Switching an active skill must not silently delete imported existing powers. T0012's future source aggregation must consume **only effective working existing pairs + separately planned candidates**, not original metadata and not both original/overridden versions.
- **Browser workflow:** Existing My Items import and search remain unchanged. The customer should be able to import a Cow/Unarmed item, immediately see both skills' powers as selected, remove/tier-change one, add another, inspect STATS, save/refresh, and restore original mod powers without reimporting. Source details remain truthful about what was actually exported.

**Non-goals:**
- No mutation of real in-game items or Storage files.
- No automatic official legality/max-mod-count rule beyond current behavior.
- No new damage calculations or application of Spark history.
- No raw customer reports in git or remote telemetry.

**Acceptance criteria:**
1. Selecting an imported Cow/Unarmed item with six resolved existing powers shows **Selected (6)** before adding anything, with the correct Cow blue/Unarmed amber skill labels.
2. Adding a Cow candidate produces **Selected (7)**; both imported and added Cow badges are visually consistent, with only a discreet source distinction. The duplicate-power guard applies against both effective imported and planned selections.
3. Removing an imported existing Cow mod reduces the effective count, removes it from STATS and survives autosave/reload; original source entry is still available in original import details and can be restored.
4. Changing an imported power to another exact official tier updates the working STATS and survives reload; an invalid/unresolved tier is not substituted.
5. Removing a planned candidate does not remove original imported evidence; restoring original imported mods does not erase independent planned candidates.
6. Changing skill order/choice updates skill colors and display grouping without altering the imported powers, while existing explicit staged-candidate skill-pruning behavior stays intact.
7. Unresolved raw powers/imbues remain inspectable and never silently treated as resolved effective powers or discarded.
8. Existing local draft protection, items with duplicate power IDs, offhand exclusivity, conditional source data and tests remain intact.

**Manual verification:**
1. Import a fresh Storage report and equip Cow/Unarmed gear with more than one existing power. Select Cow in A, Unarmed in B; compare badges, grouping and Selected count to the actual item.
2. Change the exact tier of an existing Cow power, remove an imported Unarmed power, and add a fresh candidate. Verify Selected and STATS stay synchronized; compare original evidence separately.
3. Refresh after autosave; verify the edited effective setup and original source are both preserved. Use Restore imported mods, confirm the starting imported known powers return but unrelated candidates and Sparks remain.
4. Switch skill slots to check new color grouping, restore slots, and verify no implicit deletion of imported powers.
5. Run lint, typecheck, full/focused tests, production build, Wrangler dry-run, and desktop/mobile Chromium smoke. Provide a working branch preview and screenshots for customer acceptance.

## T0011-F3 — My Items Quick Equip/Unequip Without Closing Inventory

**Status:** Planned product-owner UX follow-up from hands-on testing (2026-11-02); separate Codex branch and PR. Do not mix into open T0011-F2 / PR #25. Schedule after F2 acceptance and before the next feature ticket.

**Complexity:** Medium

**Verification:** Hands-on with the actual 255 equipment instances plus synthetic automated and desktop/mobile browser tests.

**Goal:** Turn the **general My Items** dialog, opened from the Equipment section header, into a quick loadout manager that supports equipping/replacing/unequipping multiple individual imported items without closing the dialog or losing search, filters, page, or scroll position. Show the current planner-equipped state on each owned item result. **Individual equipment-slot pickers retain their existing one-selection-and-close workflow.**

**Dependencies:** T0011-F1,T0011-F2,T0009-F1

**Allowed areas:** src/features/import/MyItemsBrowser.tsx and minimal related UI/styles/tests, src/features/equipment/EquipmentPicker.tsx and EquipmentPlanner.tsx, existing build-edit actions if needed, verification documentation.

**Do not touch:** CharacterSheet/Storage parser, official v490 data, T0011-F2 imported treasure editing semantics, T0012 formulas or T0015 Sparks, remote import, broad inventory redesign, new BuildDocument schema.

**User observations:** General My Items (255 equipment instances shown in header for an actual export) closes upon choosing a result, requiring reopening for every slot. An owned result still says **Equip** when the same concrete item instance is already in the GorgonBuilder loadout. The result should visibly reflect the selected state, including an **Unequip** action.

**Requirements:**
- **Two explicit picker modes:** When launched with no specified equipment slot (the Equipment heading's **My Items** button, `slot === ''`), stay open after successful Equip, Replace and Unequip actions. When launched from an individual slot's **Choose gear** or **Replace** action, preserve existing closing-on-selection/clear behavior, focus restoration and slot filtering. Scope any changed dialog dismissal to general My Items only.
- **Live item state:** Pass the currently selected `build.equipment` list (or a minimal derived view) into the owned-item result renderer. When a result corresponds to the **same concrete imported instance currently selected in the planner**, show a clear **Equipped** status and an **Unequip** button. A different instance with the same TypeID/name/slot must *not* be marked equipped. A different item for an occupied slot can say **Replace** (rather than an ambiguous Equip), with existing loss-prevention confirmation. Once changed, buttons/indicators and the top-level selected count update immediately, without closing the general dialog.
- **Exact instance matching:** Prefer verified stable instance identity when genuinely present. For imported items using the current export, conservatively match on persisted `provenance.reference`, `metadata.sourcePath`, source export timestamp/report identity, plus TypeID/instance identity as available. This must still match an imported selected item after changing its effective treasure powers (F2) because `metadata.sourceItem` stays immutable. Never match by item name, base TypeID or slot alone. Do not accidentally equate the `IsInInventory` game-export field with equipped status: **Equipped means selected in this GorgonBuilder build only**. If reliable identity is absent/mismatched across reimports, do not claim a match.
- **Unequip:** Invoking the action on an exact selected instance should use the existing explicit `equipment-clear` behavior, with the current confirmation if it would remove imported working powers, candidate mods, or Spark settings. Cancel keeps both the item and the dialog unchanged; confirm clears only the exact matching selection. No implicit unequip of similarly named duplicates.
- **Equip/Replace:** Keep canonical slot assignment, exclusive OffHand/OffHandShield logic, legacy offhand-conflict guard, protected draft/read-only behavior and the existing confirmation before overwriting meaningful previous selections. Preserve the established replacement policy for staged candidate mods and Spark configuration (do not silently change it). Do not accidentally double-equip one imported instance in multiple slots.
- **General dialog stays open and stable:** Keep current search text, slot/level/rarity/location filters, page and approximate scroll position while changing loadout. Do not remount the picker, reset search, or bounce scroll to the top after each action. A rapid Head → Chest → Legs → Ring sequence should be possible without reopening. Button states and counts must rerender from actual build state, not stale component state or assumptions.
- **Slot-specific behavior unchanged:** A slot-specific choice still closes the picker, with existing keyboard focus restoration and only that specific slot's candidates visible. If the already selected imported instance is shown, use clear Equipped/Unequip semantics; an explicit Unequip from that picker may close after the action. Ensure database source behavior is not inadvertently changed.
- **Clarity and accessibility:** Distinguish button **Unequip** from passive **Equipped** status and name target item in aria labels; ensure keyboard navigation and mobile layout remain sound. Preserve existing paging and 10-result rendering for large inventories.

**Non-goals:** Multi-select checkbox, bulk auto-equip, auto-equipped-state detection from Project Gorgon, drag/drop loadouts, simultaneous loadout templates, full inventory persistence, formulas or mod/Spark changes.

**Acceptance criteria:**
1. Open general Equipment → My Items, search a known item, Equip it; the dialog remains open, result immediately indicates Equipped, action changes to Unequip, and Equipment's selected count increases.
2. Without closing or losing filters/page/scroll, equip a second item in another slot, then a third. Exact equipped markers follow the build and are not applied to duplicate TypeIDs.
3. Unequip an equipped item in the same dialog. Confirmation protects staged mods/Sparks, cancel does nothing, and confirm updates indicator/button and selected count without dismissing dialog.
4. Selecting a different instance of the same slot uses established Replace/confirmation rules, updates which exact row is Equipped and never creates a duplicate offhand slot.
5. Slot-specific pickers retain existing one-and-close behavior and correct focus restoration.
6. After auto-save and refresh/reimport of the **same** report, selected imported gear and conservative exact-instance state are accurately recognized; mismatched/new reports do not falsely mark an unrelated row Equipped.
7. Read-only/protected drafts disallow all changes; search/filter/pagination and inspection stay available.
8. No regression in T0011-F2 working-mod edits, restoration, import privacy, regular database equipment picker, 10-row page cap or narrow/mobile widths.

**Manual verification:**
1. In the actual branch browser preview, import current CharacterSheet/Storage files locally. Open general My Items and select Inventory location. Use three or four different equipment slots without closing the dialog; inspect buttons and section count.
2. On a page containing multiple instances with identical TypeID, equip exactly one and confirm only that instance shows Equipped/Unequip. Modify its Cow/Unarmed powers if desired, return to My Items and verify identity still matches.
3. Unequip a clean item; then try clearing an item with staged candidate mods/Sparks and test cancel and confirm. Check preservation of other slots, including OffHand/OffHandShield exclusivity.
4. Repeat equip from Head and Ring slot-specific picker: selecting once still closes and focus returns correctly.
5. Search, set rarity/location/level filters, navigate to page 2, equip/unequip; assert page and scroll do not reset. Verify keyboard, 375px and 320px.
6. Run pinned-data check, lint, typecheck, full tests, build, Cloudflare dry-run, diff whitespace and dev/production browser smoke. Provide PR, preview, screenshots and private customer-relevant counts only (never uploaded files).

## T0012 — Build Modifier Aggregation Engine

**Complexity:** High

**Verification:** Automated + game-math review

**Goal:** Create the single source that converts an entire build into normalized modifiers before ability math is applied.

**Dependencies:** T0003,T0005,T0007,T0010,T0011,T0011-F2

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
- Aggregate **effective editable** imported existing TSys powers separately from user-staged candidate mods; do not reread original imported source metadata as active modifiers or count original and edited copies twice.
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

## T0016 — CurrentStats Validation and Import Integration

**Complexity:** High

**Verification:** Customer hands-on with current export

**Goal:** Compare imported Project Gorgon CurrentStats with modeled aggregate stats from the T0011-F1 imported/manual loadout.

**Dependencies:** T0011-F1,T0012,T0013,T0015

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
- Reuse T0011-F1's existing browser-local Import Character and My Items workflow; do not duplicate its picker.
- Use the manually selected imported loadout and preserve source TSys power tiers separately from candidate mods.
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
