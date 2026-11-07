# GorgonBuilder — Tickets T0001–T0022

**Status:** Condensed v1 implementation series approved  
**Version:** 2.0  
**Date:** 2026-11-04

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
- **Roadmap update (2026-11-06):** Ticket numbers are stable IDs, not execution order. **T0018 merged via PR #52; T0019 is under implementation review**, followed by T0020, T0020-F1 and T0021 release. Defer T0017 A/B comparison and T0016 Character Statistics/Defensive Engine until after T0021, with T0016 last. Neither deferred feature is a requirement for T0018–T0021.

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

**Status:** Completed, reviewed, product-owner accepted and squash-merged 2026-11-02 via [PR #25](https://github.com/Zaelious/GorgonBuilder/pull/25), commit `8932f0a`. [Verification](T0011_F2_Verification.md): 660 passing tests / 30 files, GitHub CI #80 and Cloudflare build passed, synthetic Chromium dev/production previews across 1440/375/320px. Product owner stated imported item behavior looks good and explicitly authorized merge. Exact real customer-export resolution counts remain unverified.

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

**Status:** Completed, architect-reviewed, customer-tested and accepted; squash-merged 2026-11-02 via [PR #26](https://github.com/Zaelious/GorgonBuilder/pull/26), commit `ac16796`. [Verification](T0011_F3_Verification.md): 679 passing CI tests, green Cloudflare build and 18 developer-reported synthetic Chromium scenarios. User tested the preview and explicitly requested review and merge. Full private report v490 reference-resolution totals remain unrecorded.

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

## Approved UI Follow-ups — Historical and Post-T0013-F1

T0008-F1, T0010-F1 and T0010-F2 are customer-accepted and merged UI follow-ups. T0008-F2 was squash-merged 2026-11-04 via [PR #39](https://github.com/Zaelious/GorgonBuilder/pull/39) (`3aff873`). T0013-F2 was customer-accepted and squash-merged 2026-11-05 via [PR #40](https://github.com/Zaelious/GorgonBuilder/pull/40) (`696c01a`). T0014-F1 (Stampede stacking and chance-based damage proc scenarios) is implemented for review on its feature branch; T0015 Sparks remains unstarted and requires a separate handoff. Implement each ticket on its own feature branch; documenting a ticket does not start or complete its implementation. Follow-up tickets must respect their stated scope.

## T0008-F1 — Imported Effective Skill Levels and Ability Picker UX

**Status:** Customer-accepted and merged 2026-11-02 via [PR #27](https://github.com/Zaelious/GorgonBuilder/pull/27), squash commit `445735e`.

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Make imported skill levels immediately useful in the two-skill planner and streamline adding multiple abilities to each bar.

**Dependencies:** T0008,T0011-F1

**Allowed areas:**
- src/features/skills
- src/features/abilities
- src/features/import (import-to-build UI integration only)
- src/app/editor (only the related build edit path)
- focused UI/behavior tests

**Do not touch:**
- damage formulas or modifier aggregation
- official data ingestion/normalization
- equipment/mod/Spark editing
- BuildDocument schema v1 or unrelated persistence behavior

**Requirements:**
- When a user selects a combat skill after importing a CharacterSheet, initialize that slot's level from its matching resolved imported skill. Keep the level editable and autosaved.
- Customer-verified CharacterSheet `Level` already includes `BonusLevels`: use exported `Level` directly as the effective combat level, without re-adding bonus or Prodigy points. Preserve raw `Level`, `BonusLevels`, and metadata for provenance. See [corrected source evidence](../src/features/import/skill-levels.md).
- Importing or replacing a report alone must not overwrite existing skill selections, manually edited levels, ability bars, or equipment. A deliberate subsequent skill selection may initialize the selected slot's level from the imported report.
- General bar-side **+** opens continuous add mode: keep picker/search/scroll position open across additions, display an updating bar count, and disable further adds at six without forcibly closing.
- Numbered empty-slot **+** and existing-slot Replace remain single-choice and close on successful selection. Preserve focus/keyboard accessibility.
- Mark abilities already on **that bar** in the picker, but allow duplicates. Keep bars A and B independent, including same-skill A+A behavior.
- For a selected skill with a differing resolved imported level, provide explicit **Apply imported level** without clearing abilities, equipment, mods, Sparks or manual overrides on reimport. Occupied ability icons have accessible compact × removal controls.
- A later T0014 optional **Respect Skill Level** mode remains separate; this ticket must not automatically replace already-selected ability tiers or implement damage math.

**Non-goals:**
- No automatic character-wide loadout replacement.
- No mandatory skill-level gating of abilities.
- No damage/progression formula implementation.
- No schema migration or remote upload.

**Acceptance criteria:**
- Imported and manually edited effective levels display correctly in both skill selectors and survive refresh.
- Missing/unresolved skill data leaves the existing/manual behavior intact; report replacement does not silently overwrite the build.
- Tests cover customer-observed no-double-counting (Werewolf 106/6 → 106; Deer 112/12 → 112; Cow 111/11 → 111; Unarmed 110/10 → 110), synchronization of the level input, explicit level repair and non-destructive import behavior.
- General + supports multiple additions with unchanged search and a live count; numbered + and Replace close after one choice; full-bar behavior is clear.
- Already-present abilities are marked, duplicates remain selectable, and independent bars are preserved.
- Automated quality checks pass; 714 tests, final-head GitHub CI and Cloudflare preview passed. Customer hands-on accepted.

**Manual verification:**
1. Import a CharacterSheet, choose two imported skills, and compare displayed effective levels with in-game totals including bonus levels; manually override one, refresh, and verify persistence.
2. Reimport reports and verify that existing skill/ability choices and manual levels remain untouched; select another imported skill and verify its initialized level.
3. Use bar-side + to add several abilities without reopening the picker; verify selection markers, retained search, count, full-bar behavior and keyboard dismissal.
4. Use a numbered empty-slot + and Replace to confirm each closes after selection; test a same-skill A+A build.
5. Check Apply imported level on an existing saved build and quick × removal by pointer/touch/keyboard; confirm unaffected equipment/mods and autosave after refresh.
6. Run lint, typecheck, tests and build. [Implementation and browser evidence](../src/features/skills/verification/T0008-F1.md).


## T0008-F2 — Ability Role Labels, Relevant Mods, and Variant Picker Consolidation

**Status:** Squash-merged 2026-11-04 via [PR #39](https://github.com/Zaelious/GorgonBuilder/pull/39), commit `3aff873` (includes T0008-F2-R1). [Verification](T0008_F2_Verification.md).

**Complexity:** High

**Recommended Codex reasoning effort:** High

**Verification:** Customer hands-on

**Goal:** Make official ability roles immediately recognizable; verify that category-based equipment damage bonuses apply to the right abilities; compact only the specific overlong variant lists reported by the customer.

**Dependencies:** T0008,T0008-F1,T0010,T0013-F1,T0014.

**Allowed areas:**
- `src/features/abilities` and related styles/tests
- `src/data/search/ability-mods.ts` for Relevant Mods coverage
- narrowly scoped `src/core/calculation/keyword-damage.ts` and calculation tests, only where an actual category-applicability defect is demonstrated
- `src/core/calculation/treasure-coverage.ts` and `scripts/treasure-coverage.ts` for the existing unconditional/required-active-skill audit correction
- ticket verification and related documentation

**Do not touch:**
- Critical hit math (T0013-F2), Sparks (T0015), DoTs, pets, rotation/DPS or defensive/threat systems
- imported-report parsing, item/mod editors or equipment search (T0010-F2)
- BuildDocument v1, saved ability IDs, rank semantics or current bars
- unrelated UI redesign, invented official keywords or speculative treasure applicability

**Requirements:**
1. **Nine visible ability-role labels:** Show the published roles Basic Attack, Core Attack, Nice Attack, Epic Attack, Minor Healing Ability, Major Healing Ability, Signature Support Ability, Signature Debuff Ability and Survival Utility Ability. Derive membership from official ability keywords/metadata, not from ability names. Verify the exact v490 keyword tokens and whether any roles are conditional, effect-gated or absent. Display compact, readable role labels in the ability picker and equipped ability facts/popover; multiple roles may be shown. Do not display a conditional role as unconditionally active.
2. **Modifier applicability:** Verify that applicable Basic/Core/Nice/Epic/Signature and other category-based treasure bonuses appear under Relevant Mods and reach the existing **direct damage** calculation where source-backed static hooks permit them. Reuse the shared `abilitykeywords` rules without duplicate contributions. Distinguish a mod that is merely source-relevant from one that actually contributes to calculated damage. Non-damage healing/utility category effects may be shown as relevant but do not require a healing calculator. Required-active-skill and effect/conditional keyword gates must remain guarded, not guessed.
3. **Seven presentation-only variant groupings:** Consolidate the customer's specified cases, after verifying exact official IDs/InternalNames and semantics: Vampirism — Blood Mist; Animal Handling — Call Stabled Pet; Bard — internal SoD family; Mentalism — Mindworm; Necromancy — internal SZ family; Priest — Triage; Priest — Flamestrike. Preserve existing `UpgradeOf` rank groups as the canonical progression linkage. Add a second, compact presentation grouping for verified distinct variants; let the user explicitly choose a variant then its published tier/rank. Never silently quick-add an arbitrary variant when a display group has multiple different abilities. Preserve each individual official ability ID, rank, level, description, selected count, add/replace behavior, search, keyboard focus and bar persistence.
4. **No unrelated grouping changes:** Every other skill/family continues using the present picker grouping. Same-name variants must not be merged based only on a prefix, icon or fuzzy text. Do not conflate the Bard SoD and Necromancy SZ internals without source verification.
5. **Audit predicate correction:** Recheck the T0013-F1 'unconditional' coverage subset. Separate entries with `requiredSkillId`/active-skill requirements from truly unconditional entries, and ensure coverage probes do not make unmet conditions appear universally applicable. Document affected counts and regenerate deterministic reports; do not rewrite valid damage calculations merely to change percentages.

**Non-goals:**
- New critical, healing, cooldown or threat calculations.
- Comprehensive new character-state simulation.
- Changing the official data snapshot or saved schema.

**Acceptance criteria:**
- All nine officially supported roles are visible, with accurate source-backed membership, on desktop and mobile; unavailable/conditional roles are not asserted as active.
- Representative category-based bonuses across multiple skills are visible under Relevant Mods and, when supported, change only eligible damage results once.
- Exactly the seven approved variant families are compacted; existing selections survive refresh, every canonical variant remains reachable and selectable, and the rest of the ability picker is unchanged.
- Unconditional versus required-active-skill audit counts are accurate, with tests and documented before/after totals.
- Pinned-data check, lint, typecheck, full tests, build, focused browser interactions and `git diff --check` pass.

**Manual verification:**
1. Inspect roles and Relevant Mods on Core, Nice, Epic, Basic and at least one healing/support/utility ability; try a category bonus and confirm no off-skill or double application.
2. Open the seven listed family groups, choose different variants and ranks, verify exact identities on the bar, replace/remove and refresh.
3. Confirm ordinary families and Respect Skill Level behavior are unchanged; verify 1440/375/320 px, keyboard search/focus and long-picker scrolling.
4. Review new unconditional vs required-active-skill coverage counts and synthetic applicability tests.


## T0008-F2-R1 — Review Corrections: Conditional Coverage Audit, Mark Weakness Grouping, Public Variant Labels

**Status:** Merged with T0008-F2 via [PR #39](https://github.com/Zaelious/GorgonBuilder/pull/39) (`3aff873`, 2026-11-04). [Verification](T0008_F2_Verification.md).

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Correct the PR #39 review findings without changing damage calculations.

**Dependencies:** T0008-F2 (unmerged).

**Allowed areas:** the T0008-F2 areas, the generated `docs/treasure-coverage` artifacts, and one CI step running `coverage:treasure -- --check`.

**Do not touch:** damage engine behavior, keyword rules, role derivation, category Relevant Mods matching, BuildDocument v1, saved IDs, rank semantics, bar persistence, non-combat skill grouping.

**Requirements:**
1. Report required-active-skill treasure entries as conditional calculations. Use an explicit probe with the required skill as the second active skill, reason `calculated-when-required-skill-active` and recorded `requiredSkillsActivated`. Never label them `no-applicable-published-hit` or unmodeled when that probe applies them. Count them as calculated, in a separate Conditional column, and exclude them from the unconditional subset.
2. Published snapshot figures and the legacy 5,044 test must reproduce unchanged.
3. The comparison table cites the published T0013-F1 unconditional figures (11,012 / 3,070 / 14,082 entries; 89.48 / 75.57 / 86.45%).
4. Regenerate and commit the reports. CI runs `npm run coverage:treasure -- --check`.
5. Eighth family, customer-approved 2026-11-04: Animal Handling Mark Weakness, `ability_4231..4240` + `ability_4241..4250`.
6. Public variant labels contain no InternalNames or data-model jargon. InternalName ranges are debug-only.
7. Equipped non-standard-series abilities show their series tag.
8. Calculate the popover damage result once.

**Acceptance criteria:** coverage `--check` passes locally and in CI. 473 required-skill entries are conditional, and none are reported missing. Published figures reproduce. Exactly eight families / 16 series are grouped, and Mark Weakness is one row. No internal names appear in public picker text. Lint, typecheck, tests, build and `git diff --check` pass.

## T0010-F1 — Shared Equipment Mod Controls and Compact Item Metadata

**Status:** Customer-accepted and squash-merged 2026-11-02 via [PR #28](https://github.com/Zaelious/GorgonBuilder/pull/28), commit `a1b2d6d73123d7aa1fd1bc7cf19dd4fa26497743`. Shared mod search/settings persist across equipment rows, STATS remain prominent, item source metadata is collapsed, and confirmed Clear build preserves imported inventory/preferences and protected drafts. Repeated item-level help was removed in the final correction; one compact **How mod filtering works** help lives in shared settings. 727 tests, GitHub CI and Cloudflare PR-preview build passed. [Verification report](../src/features/equipment/verification/T0010-F1.md). Customer approved merging; the final correction's Chromium smoke was blocked by its execution environment, so narrow-screen interactive guidance remains a normal regression check.

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Eliminate repeated item-level filter controls and prioritize actionable STATS/mods over verbose item-source metadata.

**Dependencies:** T0010,T0011-F2

**Allowed areas:**
- src/features/equipment
- src/features/mods
- src/features/import (item metadata presentation only)
- src/app (shared equipment UI state and narrow confirmed current-build reset path)
- related styles and focused tests

**Do not touch:**
- normalized official treasure data, eligibility rules or original imported evidence
- damage/calculation engine, Sparks or ability planner
- BuildDocument schema v1 or existing editable imported-power semantics

**Requirements:**
- Lift treasure-mod search, target-level preview, category toggles, All skills and Other slots & profiles filters out of per-item editors into one **shared equipment-scoped** control state above the equipment/My Items rows.
- Keep the mod search input visible; put target-level preview and less-frequently used filters in a compact expandable **Mod Browser Settings** section.
- Preserve shared search/filter selections while switching among equipment slots or opening and closing panels. Apply the same search intent to each item's Available Mods while retaining each item's own slot/profile eligibility indicators and currently selected mods.
- Preserve existing Max, 90, 100 and valid custom numeric target-level preview behavior; do not confuse mod-tier preview target level with the separate minimum-equipment-level picker preference.
- Remove repeated per-item mod filter toolbars. Keep STATS, Available/Selected mod editing, effective imported working powers, original historical evidence and warnings intact.
- Collapse the verbose metadata block above STATS into a single default-closed **Item details & source** section, covering imported instance/rarity/location/actual level, original imported item, target level, published skill requirements and source/provenance details; do not remove these values.
- Do not hide actionable compatibility or unresolved-data warnings in the collapsed section. Do not repeat the expanded item's name or icon unnecessarily.
- Add a compact **Clear build** action with explicit confirmation for resetting the **current working build only** (skill selections/levels, both ability bars, equipped items including working mods/Sparks, title, notes, and target configuration) to the normal default build document. Cancel must leave the draft unchanged. A confirmed reset must use existing safe local autosave and survive refresh, without schema migration; disable the action for protected/read-only drafts. Keep separately imported in-memory CharacterSheet/Storage inventory and browser preferences intact; avoid deleting other unrelated local data.

**Non-goals:**
- No new global multi-slot mod assignment or cross-equipment optimizer.
- No change to TSys eligibility logic or treasure-tier selection semantics.
- No change to imported instance identity or saved modifier data.
- No new BuildDocument field for transient browser filters.
- No deletion of imported reports, browser preferences, unrelated saved builds, or remote data; reset does not alter the saved schema.

**Acceptance criteria:**
- One visible mod search and one expandable settings section control all equipment Available Mods views without duplicated toolbars.
- Search and filter state persists when moving among Head, Chest, Ring, Necklace and other slots during the current editing session.
- Per-item slot/profile warnings, exact tiers and editing behavior are unchanged; minimum-equipment-level filtering remains independent.
- STATS is immediately visible when a selected item's row is expanded; source and level metadata is available under one default-closed disclosure; important warnings remain visible.
- Test common and imported equipment cases at desktop and narrow widths; automated quality checks pass.
- Clear build confirmation explains the scope; Cancel causes no state/storage change, Confirm resets only the current working build and persists after refresh, read-only drafts remain protected.

**Manual verification:**
1. Search for a mod term such as lightning, change preview level/category/All skills and switch between several item rows; verify controls and results stay consistent without falsely changing eligibility.
2. Check a custom numeric preview target and the independent minimum equipment search filter.
3. Expand an imported Head or Necklace: confirm STATS is visible immediately, source metadata is collapsed, and original instance/requirements/provenance are still accessible.
4. Edit/remove/restore an imported treasure power and stage a candidate mod to verify nothing is lost or double-counted visually.
5. Build a populated draft (two skills/bars, equipment, imported working mods/Sparks, custom title/notes/target); cancel Clear build and verify it is unchanged, then confirm and verify a clean default build after refresh. Confirm preferences and imported inventory remain usable and protected drafts cannot reset.
6. Check narrow layouts, keyboard interaction, console, lint, typecheck, tests and build.


## T0010-F2 — Equipment Mod Search Visibility and Damage Warning Relevance

**Status:** Customer-accepted and squash-merged 2026-11-04 via [PR #38](https://github.com/Zaelious/GorgonBuilder/pull/38), commit `34d7cd73f948903ba602ad26bd21410efb1dbeab`. Final customer check accepted the responsive Available/Selected search and compact public numerical Damage breakdown; GitHub CI and Cloudflare passed at the reviewed final head, with 1,042 tests and Chromium dev/preview checks at 1440/375/320 px. [Verification](T0010_F2_Verification.md).

**Complexity:** Standard

**Recommended Codex reasoning effort:** Medium

**Verification:** Customer hands-on

**Goal:** Make equipment-wide searches responsive across Available and Selected working mods, preserve complete internal damage diagnostics, and present concise, truthful public damage results.

**Dependencies:** T0010,T0010-F1,T0013-F1,T0014.

**Allowed areas:**
- `src/features/equipment`, `src/features/mods`, shared mod-search selectors and focused tests
- Focused ability results/facts/provenance and target-control presentation under `src/features/abilities`, minimal Damage analysis help text, and narrowly scoped pure warning classification/utilities under `src/core/calculation`, if needed
- relevant CSS, verification and documentation

**Do not touch:**
- official item/power normalization, treasure legality assumptions or new damage formulas
- ability picker/role grouping (T0008-F2), critical math (T0013-F2), Sparks or imported instance editing semantics
- BuildDocument schema, existing equipped/selected mods, data transport or unrelated redesign

**Requirements:**
1. When the shared `Search mods` query is nonempty (e.g. `core`), temporarily hide equipment **display rows** whose **Available Mods** and **Selected working mods** lists both have zero matches under the current exact shared query, active skill/category settings, slot/profile visibility, staged-power exclusions and target-preview behavior. Use a shared pure selector so row visibility/count and expanded `ModPlanner` results cannot disagree. Respect existing uncertainty about equipment eligibility; this is browsing, not a new legality filter.
2. Keep typed text immediately responsive, debounce expensive updates by 190 ms, and use one effective query for row visibility and both lists. Match Selected independently of Available filters, preserving imported working pairs and original edit indices. Show unobtrusive separate Available/Selected match counts while searching; provide a compact `Show all equipment` override and a useful zero-results state. Clearing the query restores all nine primary rows and Other slots. Search changes never delete, unequip, clear, rewrite or auto-expand equipment; preserve existing open state, selection, imported powers, mod edits and focus as far as practicable. Hidden equipped slots must remain reachable through Show all.
3. In the ability damage panel, distinguish explicitly classified **non-damage** unsupported remainders (taunt, reuse, Rage, resource/accuracy/control) from unresolved **damage-affecting** or unknown effects. Do not show non-damage-only clauses as if they make direct-hit damage incomplete. Do not suppress uncertain effects simply because the exact ability relevance cannot be established; retain complete diagnostic data internally. Per the final product-owner acceptance correction, show supported values and concise Estimated/Unavailable status publicly; expose detailed breakdowns, inventories, source/debug IDs, implementation assumptions and technical warning lists only through explicit development/debug mode. Production must ignore the debug flag.
4. Keep warnings sparse and actionable; avoid a second redundant help disclosure or repeated per-item search toolbars.

**Non-goals:** Global assignment of mods, automated eligibility decisions, new damage formulas, cooldown/threat/defensive simulation, changing the default always-visible equipment layout when no query is active.

**Acceptance criteria:**
- Searching `core` displays only rows with currently matching Available or Selected working mods unless Show all is active; counts agree exactly with expanded Available lists for database and imported items.
- Empty search restores all rows, including nine primary positions; no saved state or equipped/selected powers change.
- Known taunt/reuse-only remainders do not produce a misleading direct-damage warning; unknown/unmodeled damage contributions retain a truthful public status and remain traceable in development/debug mode.
- Desktop and 375/320 px interaction, keyboard/focus, saved gear, All skills, Other slots & profiles and target-level previews regressions pass.
- Data check, lint, typecheck, tests, build, focused browser smoke and `git diff --check` pass.

**Manual verification:**
1. With two combat skills selected, search `core`, compare separate per-slot counts and expanded Available/Selected powers, including rapid typing/paste/clear, change categories/target and toggle Show all; clear query and confirm rows return.
2. Test empty and imported gear, staged/selected powers and an item whose profile fit is uncertain; confirm no edits or equipment loss after refresh.
3. Inspect a fully modeled +damage/+taunt or +reuse power in the damage panel. Check that its damage remains calculated without misleading non-damage warnings, while an actually unmodeled damage effect retains a Partial/Unavailable status. Check internal diagnostics with `?debugDamage=1` in development and verify production ignores the flag.


## T0012 — Build Modifier Aggregation Engine

**Status:** Customer-accepted and squash-merged 2026-11-02 via [PR #29](https://github.com/Zaelious/GorgonBuilder/pull/29), commit `c611f72`. [Verification](T0012_Verification.md): 773 tests (46 new), green GitHub CI and Cloudflare preview, optional product-owner browser regression checks passed. Pure `aggregateBuildModifiers` retains official identities, mapped modifiers, unsupported records, source provenance, conditions and confidence; imported `existingPowers` stay distinct from candidate mods and historical source metadata. Advancement per-level sums are assumed, not game-validated. A same-skill/different-level build remains an explicitly warned conservative case, pending an editor correction enforcing one effective shared skill level (product owner confirmed levels cannot differ in game). T0013 is next and not started.

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

**Status:** Product-owner accepted as an implementation foundation and squash-merged 2026-11-02 via [PR #32](https://github.com/Zaelious/GorgonBuilder/pull/32), commit `86c2e34`. Automated quality suite: 810 tests and successful CI. In-game percentage stacking/damage validation is deliberately deferred until T0014's visible calculation output and T0015's Spark integration are available; keep original assumptions and verification guide.

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

## T0013-F1 — Combat Treasure Effect Coverage and Burst Estimate

**Status:** Customer-accepted and squash-merged 2026-11-04 via [PR #36](https://github.com/Zaelious/GorgonBuilder/pull/36), commit `acfdfcf58e22e7d1c2fcd7fef0e3379f6e27484a`. Product-owner manual tests passed; final-head GitHub CI and Cloudflare preview passed. Reproducible v490 coverage inventory, guarded shared damage mappings and estimated Burst falloff are complete for this scope. [Coverage](treasure-coverage/README.md) and [verification](T0013_F1_Verification.md). Real-game stacking/order remains provisional. Two nonblocking reporting/UI follow-ups are captured in T0008-F2 and T0010-F2.

**Complexity:** High; deliver one auditable effect-family coverage batch, not unrestricted game-mechanics work.

**Verification:** Automated dataset-wide inventory plus customer hands-on comparison.

**Goal:** Make directly damage-affecting treasure effects work across combat skills instead of implementing only the two Mock prose examples. First enumerate *all* v490 combat treasure-power/tier effects, then implement shared source-backed families and explicit curated exceptions, with an honest per-skill coverage report. Add an optional transparent estimate for undocumented intermediate direct Burst falloff.

**Dependencies:** T0005,T0012,T0013,T0014.

**Allowed areas:**
- src/core/calculation
- targeted official-data lookup/normalization utilities only if necessary
- src/features/abilities/AbilityResults.tsx for compact modeled/estimated information
- tests, deterministic coverage report and verification documentation

**Do not touch:**
- Spark modeling/integration (T0015)
- rotation/DPS simulator, actual monster selection, backend or build save schema
- unrelated equipment UI, imported-report workflow, visual redesign
- unconditional parsing of arbitrary English prose as a trusted damage formula

**Requirements:**
1. **Complete official-data inventory:** Walk the pinned v490 TSys treasure powers and every published tier/effect. Produce reproducible machine-readable and human-readable reports grouped by combat skill, power ID/InternalName, effect string, and normalized attribute/hook. Separate known direct-damage effects, indirect/DoT, conditional/stateful effects, conversions, non-damage effects and unresolved records. Track denominators and counts by skill and category; identify effects currently handled by generic attribute rules, the two Mock curated rules, and unsupported paths. A visible Relevant Mods match alone does *not* imply calculation support.
2. **Coverage-first shared mappings:** Prioritize common deterministic direct-damage families (ability/skill/attack-type/damage-type flats and percents, base-only bonuses, multiplicative reductions, and stateless conversions) using official IDs, structured tokens, hook/keyword scope and published DisplayType. One mapping should work for every skill that shares a real mechanic; do not add hand-written per-skill duplicates for a general rule. Keep exact equipment/power/tier provenance, working imported powers and planned candidate mods, and prevent double counts. Unsupported or conditional effects remain traceable.
3. **Curated prose exceptions:** For damage-affecting pure-text abilities, use exact official power ID, InternalName, tier wording/templates and validated hooks/keywords, as in T0014's Mock examples. Add grouped, well-tested families across combat skills based on audit priority. Do not equate unrelated conversion attacks, triggered extra attacks, DoTs, enemy-state effects, taunt, and cooldown with simple direct damage. Account for conflicts/duplicate conversions conservatively.
4. **Honest coverage report:** Every classified damage-relevant effect must be labeled modeled, partially modeled, excluded as out-of-scope, or unmodeled with an exact reason; calculate per-skill and overall coverage. Distinguish 'all effects inventoried' from 'all effects simulated'. The primary review deliverable is meaningful expansion beyond Psychology, representative fixtures covering *every* combat skill, and explicit remaining families for small follow-ups. Do not assert comprehensive formula coverage merely because a power is displayed.
5. **Burst 6–8 estimates:** For documented Burst attacks, preserve full damage through the published 3 + floor(radius/10) target threshold, documented direct floor 25% at nine-plus when not contradicted by the radius allowance, and indirect floor 50% at nine-plus for future DoT support. For currently undocumented intermediate **direct** target counts, show an **Estimated** value (not 'validated') using explicit linear interpolation from 100% at the last full-damage target count to 25% at nine targets: `100% - (n - fullThreshold) × (75% / (9 - fullThreshold))`. Example at 20 m: 5=100% documented, 6≈81.25% estimated, 7≈62.5% estimated, 8≈43.75% estimated, 9=25% documented. Preserve separate ability-specific ×0.5 penalties and exact/estimated provenance. Handle fullThreshold >= 9 without divide-by-zero or forcing contradictory documented claims. Do not invent a radius remainder's random roll; surface its uncertainty. Do not imply older 2018 measured falloff is current. Do not add indirect/DoT damage totals merely for this estimate.
6. **Compact UI:** Display estimated direct Burst damage and totals wherever the existing engine previously said undocumented falloff, with an unobtrusive 'Estimated' label, and the actual interpolation equation and data source in the existing breakdown. Keep Damage analysis opt-in and all result/disclosure scroll behavior intact. Replace misleading ability-specific warnings based on build-wide unsupported counts with clearly build-wide wording unless applicability can be proven.
7. **Validation:** Preserve the 178→254.54 Mock 11 +43% and the ×0.5 conversion regressions, unaffected off-skill abilities, skill-base contribution against original base, no double-counting, ordinary shield slot/import behavior and browser-session preferences. Controlled real-game differences must be recorded as evidence and not force unverified formula changes into validated status.

**Non-goals:**
- 100% simulation of all published combat prose, triggered chains, timed buffs, DoT, pets, target-state conditional effects, or crit systems within one PR.
- Mastery Sparks (T0015), DPS, target-vulnerability formula rewrite or combat rotation.

**Acceptance criteria:**
- A reproducible v490 effect inventory with per-skill denominators and supported/unmodeled reasons covers the whole pinned combat power dataset, not just user-selected powers.
- General direct-damage families work across skills with correct scope, effect provenance and no double counts. Representative regression fixtures touch every combat skill and include multi-skill builds; specific modeled vs unsupported categories remain explicit.
- Curated exact prose rules expand meaningfully beyond Mock with tests. Document remaining uncovered families and recommended subsequent small tickets.
- Mock 20 m direct Burst 6/7/8 targets presents approximate 81.25% / 62.5% / 43.75% (with label **Estimated**), while 5 full and 9 floor stay source-backed; invalid/edge radii and unknown delivery are covered.
- No T0015 work, build schema changes, misleadingly validated estimates, unrelated UI redesign or regression in scrolling.
- Pinned-data check, lint, typecheck, full tests, build, and focused real-browser checks pass.

**Manual verification:**
1. Test at least one statically modeled direct-damage treasure effect for Psychology, Cow/Unarmed and three other unrelated combat skills; compare controlled deltas, not only synthetic absolute totals.
2. Check imported working power vs planned candidate mod and off-skill exclusion; removing one source reverses the exact delta.
3. Inspect the coverage report for every combat skill, verify unmodeled special mechanics remain visible and are not silently applied.
4. With 20 m Burst check 1, 5, 6, 7, 8 and 9 enemies; verify estimated labels and arithmetic for 6–8, and intact ×0.5 ability reduction.
5. Verify Damage analysis off/on, compact popovers, expanded scrolling and mobile layout (1440×900, 375×812, 320×812); run the quality suite.

**Reference evidence:**
- [Official July 30, 2024 update](https://wiki.projectgorgon.com/wiki/Game_updates/2024-07-30): full-damage radius bonus, direct 25% floor, indirect 50% floor at nine targets; does *not* publish intermediate multipliers.
- [2018 player AoE tests](https://forum.projectgorgon.com/archive/index.php/t-1516.html): an older, different non-linear direct curve; historical context only, not proof of the post-2024 values.
- [T0014 verification](T0014_Verification.md): baseline code, Mock power IDs and known assumptions.


## T0013-F2 — Imported Anatomy/Phrenology Critical Hits and Target Conditions

**Status:** Customer-accepted and squash-merged 2026-11-05 via [PR #40](https://github.com/Zaelious/GorgonBuilder/pull/40), commit `696c01acd2ef41bdf9b6a1bda98f82c6af0f39d7`. Source-backed Anatomy/Phrenology critical chance, published multipliers, equipment critical modifiers, creature-type/Elite target conditions and expected damage per successful hit. 1,096 synthetic tests, GitHub CI and Cloudflare preview passed; customer UI checks passed. In-game critical formula validation remains outstanding and Estimated (KI-0016). The two optional UI wording review comments were waived by the product owner. [Verification](T0013_F2_Verification.md).

**Complexity:** High

**Recommended Codex reasoning effort:** Extra High

**Verification:** Customer hands-on with controlled in-game comparisons; provisional formulas must remain labeled.

**Goal:** Implement a complete v1 critical-hit calculation flow for supported player abilities: imported/manual creature-specific critical skills, correct ability applicability, equipment critical modifiers, target type and transparent expected damage.

**Dependencies:** T0011,T0011-F1,T0012,T0013,T0013-F1,T0014,T0008-F2.

**Allowed areas:**
- `src/core/calculation`, `src/core/import` and focused import skill-level utilities
- official data source/lookup helpers necessary to establish critical-system applicability and provenance
- `src/features/abilities`, target dummy UI and narrow relevant tests/styles
- `src/core/build` only if a documented, backward-compatible schema addition is genuinely needed for persistent manual scenario inputs
- ticket-specific documentation and validation fixtures

**Do not touch:**
- T0015 Spark simulation/integration; DoT, pet, threat, cooldown, rotations or DPS
- broad equipment editor redesign, source version changes or unverified creature taxonomy
- arbitrary English-to-game-formula inference, silent assumptions presented as validated facts

**Requirements:**
1. **Source-backed critical rules:** Investigate published v490 ability records, relevant official Project Gorgon documentation and existing imported skill records to identify which abilities use Anatomy, Phrenology or another/no known critical system; research skill-level thresholds, creature-type applicability, equipment crit-chance/damage bonuses, ability-specific critical properties, stacking, caps and exceptions. Record each rule's source and confidence; no invented universal crit rate or guessed multiplier.
2. **Imported and manual skills:** Reuse retained CharacterSheet noncombat skill/subskill levels (the existing combat-only skill-level helper must not be misused). Do not double-count exported `BonusLevels` already included in `Level`. Provide an explicit manual fallback when no valid import is present and distinguish it from imported data. Preserve report privacy, resolved/unresolved identities and exact source names.
3. **Target context:** Add a compact creature-type selector and any minimal necessary target-type flag (e.g. Elite only where established) to the existing target dummy. Do not invent monster records. Keep target selection separate from the character's abilities/equipped items, and default to unknown when the required target data is absent.
4. **Critical contributions:** Resolve applicable equipment powers and ability-specific critical modifiers through source-backed typed categories and existing aggregation/provenance, avoiding double counts. Preserve original-base Skill Base and T0013-F1 damage order. Make critical damage a separate downstream stage, not a rewrite of normal-hit damage. Support straightforward creature-type direct bonuses when their applicability can be established without a stateful simulator; otherwise report a specific unresolved condition and leave it for a follow-up.
5. **Results:** Display normal hit, crit chance, critical hit damage, and expected damage per successful hit with a concise formula and expandable contributions. Only compute a numeric result when required inputs and rule assumptions are sufficiently defined. Keep scenario assumptions, uncertain stack order and lack of live validation explicit. Do not imply hit chance, rotation or DPS from expected damage per successful hit.
6. **Complete implementation, not a design-only ticket:** Add the working UI, pure calculation, data/import integration, automated tests, source-backed documentation, and usable manual verification instructions. If a specific critical mechanic remains unknowable, implement partial supported scope honestly, enumerate exact gaps and seek product-owner guidance rather than silently making up results.

**Non-goals:** DoT critical simulation, triggered combat sequences, actual monster database, full conditional/stateful damage coverage, Sparks, DPS optimizer, defensive/threat systems.

**Acceptance criteria:**
- Supported Anatomy and Phrenology cases use correct imported/manual subskill levels and selected creature type; irrelevant creature skills do not affect crit chance.
- Equipment and ability-specific critical effects contribute once, with explainable provenance and correct applicability. Normal damage is unchanged by crit-only modifiers.
- Normal/critical/expected values agree with the documented formula for controlled fixtures; insufficient/unknown inputs remain visibly unknown rather than defaulting to arbitrary percentages.
- Target changes recompute relevant bonuses without changing equipped gear or saved abilities, and import/reimport does not overwrite manual scenario choices without deliberate action.
- All quality checks and desktop/mobile browser smokes pass. Report what has and has not been tested in Project Gorgon; no synthetic test is labeled live-game validation.

**Manual verification:**
1. Import a current CharacterSheet locally; select a Psychology/Phrenology ability and suitable Anatomy-based ability. Compare imported creature-specific levels and verify no double-counting.
2. Change target type and manually entered critical skills; confirm only eligible abilities change chance.
3. Add/remove crit-chance and crit-damage gear powers; inspect contributions and reversible normal/critical/expected numbers.
4. Test a missing/unresolved skill, unsupported ability critical system, 0% critical chance and a high critical-damage scenario.
5. Compare at least one controlled in-game critical chance/damage observation; document discrepancies and preserve unvalidated assumptions.


## T0014 — Ability Results UI and Custom Target Dummy

**Status:** Customer-accepted and squash-merged 2026-11-03 via [PR #34](https://github.com/Zaelious/GorgonBuilder/pull/34), commit `19a26bf3f6d30ef63f9bd80fbeb4b5e89e90efcf`. 851 tests and green CI; browser scroll regression at four viewport sizes. See [T0014 verification](T0014_Verification.md). Two exact Mock prose rules and documented Burst floor added; remaining combat-wide modifier coverage is prioritized in T0013-F1, before T0015.

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

## T0014-F1 — Stampede Stacking and Chance-Based Damage Proc Scenarios

**Status:** Customer-accepted and squash-merged 2026-11-06 via [PR #41](https://github.com/Zaelious/GorgonBuilder/pull/41), commit `430f92b`. [Verification](T0014_F1_Verification.md) covers the original scenarios and the While Stunned correction. Game stacking/conditional ordering remains Estimated, and duplicate proc combinations remain Unavailable. T0015-R1 later expanded the manually selected effective Trampling contributions from 0–15 to 0–30 based on customer in-game measurements.

**Queue:** Completed before T0015 (now merged in PR #42). This ticket covers the two source-backed scenario-based damage families.

**Complexity:** High

**Recommended Codex reasoning effort:** Extra High

**Verification:** Source-backed v490 audit, deterministic calculation tests, responsive Chromium checks, and focused customer in-game checks for unvalidated ordering/stacking.

**Goal:** Let users model (a) how many stacks of the equipped *of Continuous Trampling* Stampede effect are already active and (b) chance-based direct-damage treasure procs such as Strike a Nerve's 33% chance to double damage. Present ordinary, proc/stack-adjusted and expected per-successful-hit numbers without pretending to simulate time, cast sequences or DPS.

**Dependencies:** T0012,T0013,T0013-F1,T0013-F2,T0014,T0008-F2.

**Allowed areas:**
- `src/core/calculation` (typed scenario contracts and independent, pure stack/proc stages; existing aggregation/provenance)
- `src/features/abilities` and narrow browser-session scenario state in `src/persistence/local`
- existing official v490 data lookups/treasure coverage inventory when needed
- focused unit/component/browser tests, verification documentation and coverage reporting

**Do not touch:**
- T0015 Mastery Spark simulation or the future rotation/DPS simulator
- automatic combat-timeline reconstruction, 60-second countdowns, cooldowns or stack generation from simulated casts
- pets, DoT proc ticks, reactive damage, chain triggers, arbitrary stateful buffs, unrelated combat effects
- imported CharacterSheet parsing, item selection/editing, v490 source pin, BuildDocument schema or large public UI redesign
- speculative proc interactions/stacking claimed as validated merely because synthetic tests pass

**Requirements:**
1. **Audit the exact pinned data.** Use official v490 powers, IDs, tier texts and ability hooks. Identify the precise *of Continuous Trampling* source (Stampede boosts future Stampede attacks by +N damage for 60 seconds, stacking up to 15) and the 4 powers / 100 tier entries already catalogued as `side-clause:random-bonus` in the T0013-F1 coverage audit. Include other clearly related direct-hit chance/extra-flat patterns only if their exact source semantics and ability applicability can be established. Record named supported/unresolved examples and confidence; do not apply vague English heuristics as authoritative rules.
2. **Stampede scenario.** Add an opt-in/manual active-stack count **0–15** (default 0) for Stampede only. Preserve the fact that the bonus applies to *future* Stampede attacks; 0 stacks is the pre-stack attack. Resolve every equipped matching mod at its exact selected tier, with separate source contributions. Proposed projected flat bonus at `s` stacks: `s × sum(applicable equipped per-stack bonuses)`; flag the cross-mod stacking/ordering as **Estimated** until compared with the game. Do not add 15 stacks merely because a mod is equipped, simulate 60-second expiration, or apply it to other Cow abilities.
3. **Chance-based direct-hit procs.** Preserve unconditional damage separately from the random remainder. The anchor case is `Strike a Nerve deals +100 damage and has a 33% chance to deal double damage`: the existing +100 contribution must remain in normal damage, while the 33% proc has a distinct displayed chance, proc-hit amount and expected per-successful-hit output. Under a clearly labeled provisional final-hit multiplier, `expected = (1-p)×normal + p×proc-hit`. Audit/implement other source-backed direct-hit variants (`chance to deal X% more damage`, `chance to deal +N damage` where semantics are clear) using typed, testable rules, not generic prose interpretation.
4. **Multiple sources and rule interaction.** Never silently sum probabilities or assume independent double-damage rolls when two equipped powers offer similar triggers. Research evidence for duplicate-source behavior; otherwise keep a visible per-source breakdown and show the combined proc number as Unavailable/Estimated with a specific reason. Critical-hit, proc and stack outputs must remain distinguishable; do not claim a single combined critical-plus-proc expectation without supporting interaction/ordering evidence. Preserve existing critical and normal-hit results for unrelated abilities.
5. **Calculation integration.** Use the existing aggregation/provenance, `calculateAbilityDamage`, `applyTargetDummy` and T0013-F2 critical stage rather than duplicating formulas. Distinguish scenario-derived Stampede normal damage from the original zero-stack baseline, and add independently explained per-ability proc outcomes. Keep original-base Skill Base handling intact. Treat unknown target/damage-type ordering or other required inputs explicitly, not as silent zero.
6. **Compact UI.** While Damage analysis is enabled, expose the 0–15 Stampede stack input only where relevant and a concise proc chance / triggered hit / expected hit breakdown only for eligible abilities. Explain that stack count represents an assumed current state, not automatically accumulated stacks. Keep development-only diagnostic inventories behind `?debugDamage=1`, and do not add repetitive explanatory panels to every equipment item. Scenario choices should be session-only, preserving BuildDocument v1.
7. **Tests and documentation.** Add precise v490 fixtures, 0/1/15-stack examples, two different selected tier values, add/remove/replace equipment, 0%/100% and representative proc probability math, nonproc/other-ability regression, duplicate-proc uncertainty, and separation from Anatomy/Phrenology criticals. Retain prior historical coverage snapshots, or explicitly version any newly reported coverage; never rewrite historical denominators as if the old implementation already supported these mechanics. Run pinned data, lint, typecheck, focused/full tests, build, Wrangler dry-run and responsive real-Chromium smoke at 1440/375/320 px. Document unverified formulas as Estimated and provide an auditable verification report.

**Non-goals:** Rotation/state-machine simulation, passive real-time stack tracking, DoT/pet/crit-triggered proc chains, hypothetical general-purpose conditional-effect editor, Sparks, DPS and broad inventory refactors.

**Acceptance criteria:**
- With Stampede and one or two equipped matching mods, 0, 1 and 15 selected stacks produce reversible, sourced projected damage changes only on Stampede; zero stacks and removed mods restore baseline.
- Strike a Nerve's +N flat contribution is applied once; its independently described probability/double-damage outcome is displayed and no longer silently omitted from the expected-hit scenario.
- Other supported audited chance-based effects use correct exact power/tier/ability scopes; unresolved or duplicate effects never silently change the result.
- Ordinary damage, critical chance/damage and per-target outputs on unaffected abilities are unchanged; no generated gameplay probabilities or sequencing claims.
- New outputs remain plainly Estimated when game ordering, cross-mod stacking, or proc interactions lack evidence.
- Tests, CI-relevant checks and desktop/mobile browser workflows pass; the verification file distinguishes synthetic proof from live-game measurements.

**Manual verification:**
1. Without an import, equip Cow/Stampede and one *of Continuous Trampling* mod. Change current stacks 0 → 1 → 15, check the explicit per-mod per-stack contribution, then unequip it.
2. Equip two applicable Stampede mods with different tier values. Compare the projected sum at 1 and 15 stacks and mark their interaction provisional until measured in game.
3. Equip the Strike a Nerve +100 / 33% double-damage mod. Confirm +100 is reflected once in the normal result, while proc chance, proc hit and expected hit are separate from critical chance/damage. Remove the power and verify reversal.
4. Spot-check at least one other audited chance-based effect, one unsupported/duplicate effect, and a non-Stampede/non-proc ability. Confirm no unrelated critical or damage change.
5. In Project Gorgon, compare Stampede before/after stack buildup and Strike a Nerve normal/proc hit amounts with the same target and buffs; record any mismatch in ordering/stack semantics. Check 1440/375/320 px and run the required quality suite.

## T0015 — Mastery Spark Simulation, UI, and Damage Integration

**Status:** Customer-accepted and squash-merged 2026-11-06 via [PR #42](https://github.com/Zaelious/GorgonBuilder/pull/42), commit `ff9745a`. [Verification including R1](T0015_Verification.md): 1,272 tests across 64 files, final-head GitHub CI and Cloudflare preview green, desktop/mobile dev/preview Chromium checks and product-owner acceptance. The final R1 places a high-contrast Mastery Sparks panel above treasure mods and models 0–30 effective concurrent Continuous Trampling contributions for the measured 60-second duration / 2-second reuse steady state, without changing the base damage formula. Spark categories/activation and other unmeasured game rules remain Estimated.

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

## T0018 — Cloudflare Workers + D1, Authentication Architecture, and Deployment Foundation

**Queue / Status:** Accepted and squash-merged via PR #52, commit `5befbb5` (2026-11-07). Cloudflare Workers + D1 selected and locally proven; hosted deployment remains separate. Complete implementation requirements: [Issue #46](https://github.com/Zaelious/GorgonBuilder/issues/46).

**Complexity:** High. **Verification:** Automated + architect review, D1/Worker local health and deployment dry-run.

**Goal:** Establish the approved Cloudflare Workers + D1 backend and migration foundation for a registered-account, public/private build community. Prove authentication-library runtime compatibility and prepare schema/search/visibility contracts; do **not** implement production signup, CRUD or UI yet.

**Dependencies:** T0007 BuildDocument v1 and existing Cloudflare Static Assets baseline.

**Allowed areas:** `src/persistence/remote`, backend/Worker scaffold, D1 bindings/migrations, `wrangler.jsonc`, essential CI/scripts/lockfile, documentation/ADR, focused tests.

**Do not touch:** finished planner/damage/Sparks/import semantics, BuildDocument v1 schema, **do not implement the abandoned anonymous owner-token model**, user-facing share/search/accounts, optimizer, A/B comparison, defensive simulation.

**Requirements:**
- Preserve static Vite app and SPA routes; add same-origin API health endpoint and proper API 404 handling with local D1 and explicit dev/staging/prod isolation.
- Prove auth framework compatibility in Workers/D1 (Better Auth native D1 is preferred), document secure OAuth/session/username conventions. Recommend Discord and Google OAuth with unique public GorgonBuilder username; no custom passwords/email infrastructure without a separate approved design.
- Design account/user ID, provider sessions, builds and public listing/search metadata; the owner is **user ID**; `public` searchable, `unlisted` link-only, `private` owner-only (default private). Profile/search must never leak private/unlisted content.
- Define async provider-neutral BuildRepository and deterministic fake tests; no actual permanent CRUD implementation. Add server validation, rate/abuse, privacy, backups and domain/OAuth callback security architecture.
- Dated ADR records approved Cloudflare choice, current cost/limitations, and owner-setup steps; local/mock verification does not need live OAuth credentials.

**Non-goals:** Production user accounts, real persisted builds, search UI, public pages, payments, account registration or actual OAuth provider secrets. Do not deploy or provision paid resources without permission.

**Acceptance criteria:** Local D1/Worker health works; root/assets/SPA unaffected; interfaces/test fake pass; auth feasibility evidenced; migrations/docs secure and repeatable; full quality checks plus Cloudflare dry-run; T0019 handoff concrete.

**Manual verification:** Review ADR/provider/security/cost and domain setup; run local health/API 404/static smoke; verify mock contract, D1 migration and no secrets; review `docs/T0018_Verification.md`.

## T0019 — Account Authentication, Build Persistence and Ownership API

**Queue / Status:** Implemented on `feature/t0019-auth-build-backend`, awaiting PR review and genuine hosted staging/OAuth verification; not merged. T0018 accepted via PR #52. Full requirements: [Issue #48](https://github.com/Zaelious/GorgonBuilder/issues/48).
**Complexity:** Very high (one phased implementation PR, per Issue #48).
**Verification:** Automated security/API tests and customer local account smoke.

**Goal:** Implement actual registered accounts, secure sessions and user-ID-owned persistent builds on Cloudflare Workers + D1. This replaces anonymous owner-token-first persistence.

**Dependencies:** T0018.

**Allowed areas:** Worker backend/API, D1 migrations, `src/persistence/remote`, auth and account contracts, validation, server tests, backend/security docs.

**Do not touch:** final login/save/share/profile UI (T0020), public browse/search (T0020-F1), damage/Sparks/import, T0016/T0017.

**Requirements:**
- Implement approved OAuth signup/login/logout, verified sessions and unique case-normalized public usernames (recommended Discord and Google, subject to T0018 runtime proof). Credentials remain outside git; no custom password auth without approved email/reset plan.
- Use stable server-side `userId` for authorization and build ownership. Build record includes private/public/unlisted visibility, title, optional public description, indexed canonical combat skill IDs, BuildDocument JSON, versions and timestamps.
- Real authenticated CRUD, own-build listing, ownership/visibility changes, public or link-known unlisted reads, strict private access and fork into a **new private build owned by the copier**. Guest can read Public/Unlisted but not save to account.
- Guard every data route against user-id impersonation, unauthorized access, private/unlisted listing leakage, stale writes, CSRF/abuse, oversized/invalid payloads and game data/schema mismatches. Never rely on `IsInInventory` as equipped.
- Profile/account metadata and list endpoints support the future UI; public directory search is a T0020-F1 extension, not this ticket.

**Non-goals:** User-facing accounts or Save/Share UI, full searchable gallery, A/B, optimization, defensive/DPS.

**Acceptance criteria:** Two test accounts cannot read or modify each other's private builds; public/unlisted/private ACL works; copied public build is privately owned by copier; account session expiration and wrong-owner edits fail; D1 migrations/CI pass.

**Manual verification:** Use two accounts/guest contexts and local API tests to exercise auth, CRUD, visibility, independent copy and no private listing leaks. Document in `docs/T0019_Verification.md`.

## T0020 — Accounts, Personal Build Library, Save/Share UI and Profiles

**Queue:** After accepted T0019. Full requirements: [Issue #49](https://github.com/Zaelious/GorgonBuilder/issues/49).
**Complexity:** High. **Verification:** Customer hands-on with two accounts/incognito and mobile.

**Goal:** Add user-friendly signup/login, owner profile/My Builds, permanent Save/Update/Delete, public/unlisted/private visibility and link sharing, and independent build copying into an account.

**Dependencies:** T0019. **Not T0017.** Shared-build Copy is not an A/B comparison.

**Allowed areas:** `src/features/sharing`, auth/profile and build library UI, app navigation/routes, minimal build editor/title/persistence integration, focused tests and docs.

**Do not touch:** Server auth design beyond necessary integration, public search directory (T0020-F1), A/B, optimizer, defense/DPS, core damage or official data.

**Requirements:**
- Guest planning/local draft continues without login. Login/sign-up/logout use approved auth provider and require unique public username; owner account clearly identified.
- `My Builds` shows all owned Public/Unlisted/Private with skill filters, sorting and edit actions; accessible profile/navigation for account and planner. Public profile shows **only Public** builds; T0020-F1 completes author-directory browsing.
- Saving a new build defaults to **Private**. Public is discoverable, Unlisted is shared by link without directory listing, Private is owner-only and cannot be read by anyone holding the URL. Allow deliberate visibility changes and safe delete.
- Read-only share view respects owner, permissions and session; copy any viewable Public/Unlisted to a **new independent Private** owned build after sign-in.
- Default new planner build title follows selected official combat skill names (e.g. `Deer/Psychology`, `Cow/Unarmed`); protect custom names from being overwritten by later skill changes.
- Save selected BuildDocument v1 unchanged and separately store public listing description/title/visibility metadata. Never publish raw report files, auth tokens or unreviewed local private metadata; preserve unsaved draft and failures on login/navigation.

**Non-goals:** General search directory/filter engine (T0020-F1), email/password without approved mail service, social reactions/ratings, rotations/optimizer, A/B.

**Acceptance criteria:** Guest drafts survive; signed-in owner creates, edits and deletes builds; visibility changes enforce access; profile/My Builds shows own private and public but other users cannot access private; manual copy is independent/private; default title customization holds; desktop/mobile smoke passes.

**Manual verification:** Save Private, Unlisted and Public; test URLs in incognito, sign out, second account, visibility revocation, own library, copy, custom title, local draft and errors. Record `docs/T0020_Verification.md`.

## T0020-F1 — Public Build Discovery, Advanced Skill Filters and Author Profiles

**Queue:** After accepted T0020 and before T0021 MVP release. Full requirements: [Issue #50](https://github.com/Zaelious/GorgonBuilder/issues/50).
**Complexity:** High. **Verification:** Customer hands-on search and authorization tests.

**Goal:** Build the public Search Builds directory and author pages, with title/description/author search, two combat-skill filters and exact both/either semantics.

**Dependencies:** T0019, T0020.

**Allowed areas:** Public build search API/indexes, `src/features/search` and related routes/sidebar/profile presentation, focused tests and docs.

**Do not touch:** Private data exposure, auth implementation beyond existing interfaces, A/B, optimizer, damage/Sparks/defense.

**Requirements:**
- Sidebar nav: Home, Build Planner, Search Builds, and signed-in My Builds/Profile. `/builds` shows **Public** builds only, with searchable name, public description and author username/display name.
- Two optional **combat skills** selected by official ID. One selection matches in either slot; two with **Match both skills** ON require both in any order (AND); OFF accepts either (OR). Text filters combine with skills by AND. Never confuse selected combat skills with abilities in six-slot bars.
- Paginated server-side search with bounded queries, indexes and proper sorting. D1 FTS5 is supported; choose a verified index/search strategy and keep visibility/text/skill metadata in sync. Never expose Private or Unlisted in public author pages, counts or search.
- Public author profile lists only Public builds; owner My Builds can filter/sort all own visibility states; a copied Public build is owned independently and defaults to Private. Responsive/keyboard-accessible browse results.

**Non-goals:** Ratings, likes, comments, social network, recommendation/optimizer, A/B, rotation/DPS, threat simulation.

**Acceptance criteria:** Name/description/author search works; Cow + Unarmed works with both/either and slot swapping; no Private/Unlisted leakage; pagination and 1440/375/320px UI work. Verification in `docs/T0020_F1_Verification.md`.

**Manual verification:** With two users and Public/Unlisted/Private synthetic builds, verify author text and skill AND/OR, visibility exclusions, own list, copy and incognito.

## T0021 — v1 Stabilization, End-to-End Security/Discovery Regression, Documentation, and Release

**Queue:** MVP release ticket after accepted T0020-F1. T0018 foundation is merged via PR #52; hosted T0019 acceptance remains pending real OAuth/CPU verification.
**Complexity:** High. **Verification:** Customer milestone regression required.

**Goal:** Release a trustworthy GorgonBuilder community planner: guest planning, accounts, personal libraries, Public/Unlisted/Private sharing and public build search, using the existing per-ability/Spark model.

**Dependencies:** T0018, T0019, T0020, **T0020-F1**. Post-MVP T0016/T0017 are not release requirements.

**Allowed areas:** Release tests, security checks, deployment/CI and documentation, strictly required bug fixes and release configuration.

**Do not touch:** New feature scope, A/B, defensive/threat/DPS engine, optimization, new game formulas, public build comments/ratings.

**Requirements:**
- E2E coverage for guest draft, two skills/abilities/gear/mods/Sparks/calculator, local CharacterSheet/Storage import without server upload, account signup/login/logout, CRUD, owner profile, Public/Unlisted/Private visibility and revocation, read-only share, independent copy and public search (name/description/author, 1/2 skills, match-both ON/OFF).
- Security tests in real local D1 + Worker and at least one authorized staging context: two accounts/guest, denied private reads/mutations, no private listing/count leakage, invalid IDs, token/cookie/CSRF/sessions, rate limits and published data sanitization. Check public/private caches and auth callback configuration.
- Test domain/HTTPS/OAuth redirect readiness, database migrations/backups, Cloudflare free-tier usage/limits, cost alarms or monitoring and recovery. The owner can attach the already purchased domain when ready.
- Run complete unit/integration/browser/E2E, lint/typecheck/data-integrity/build/dry-run, desktop/mobile, real planner Psychology/Cow validation, and update repo state, known issues and docs with actual evidence.
- Document formula Estimated/Unavailable states; do not invent validated outputs. No features added during stabilization.

**Non-goals:** A/B T0017, character stats/armor Sparks T0016, DPS/rotation, optimizer, full threat simulator, comments/likes, broader social features.

**Acceptance criteria:** Core guest and account workflows function end-to-end; discovery strictly Public-only; private content is actually private; search exact skill AND/OR; read-only share and independent copy work in incognito, production deployment with backups/security verified; all required checks pass and limitations disclosed.

**Manual verification:** Create fresh guest build, sign in, save it Private, share as Unlisted/Public, verify with another account and incognito, copy privately, search names/author and Cow/Unarmed AND/OR, review own library and visibility, test logout/revocation/refresh, run final release checklist.

## T0022 — GorgonBuilder Visual Identity and Planner UI Redesign

**Status:** Product-owner approved visual direction 2026-11-02; planning PR #30 prepared for merge. Implementation begins separately when T0022 is kicked off. **Scheduling exception:** if accepted, implement **before T0013** without renumbering the existing T0001–T0021 sequence.

**Complexity:** High (cohesive visual slice; suitable as **one** high-effort Codex implementation ticket once the approved reference screenshot and original art assets are available)

**Verification:** Customer hands-on visual review + automated and real-browser regression

**Goal:** Implement the product owner's **first approved 2026-11-02 ChatGPT UI concept** across the real current build planner: cinematic gorgon/ruins identity, neutral charcoal dark UI, two colored skill bars, compact equipment rows and vertically stacked floating ability popover. Keep functioning controls and game behavior unchanged.

**Design reference:** [UI Visual Identity and Redesign](UI_Visual_Redesign.md). **Attach three files to Codex:** the original `GorgonBuilder_Approved_UI_Concept.png` (UI layout/behavior reference), `mosaic_medusa_with_serpent_crown.png` (chosen Gorgon art) and `moonlit_gorgon_mosaic_ruins.png` (chosen Greek mosaic banner). The latter two **replace** the old grayscale artwork direction; do not regenerate new images.

**Dependencies:** T0008-F1, T0009-F1, T0010-F1, T0011-F3, T0012 (all merged); the user's two approved original Greek-mosaic assets attached to the Codex implementation task.

**Suggested branch:** `feature/t0022-gorgon-visual-redesign`

**Allowed areas:** `public/branding/`, UI styles/tokens, current `src/app` layout, visual presentation in `src/features/skills`, `abilities`, `equipment`, `mods`, `import`, focused UI tests and browser verification notes.

**Do not touch:** core game formulas or aggregator, BuildDocument schema, official data generation, mod/item eligibility, import parsing, Spark behavior, remote saving, unrelated backend or architecture.

**Requirements:**
- Bundle the two supplied original Greek mosaic Gorgon head and panoramic Greek-mosaic ruins assets as separate optimized local images, preserving their charcoal/slate and muted antique bronze palette, and reproduce the first mockup's restrained cinematic header/wordmark. Do not regenerate artwork, crop the reference UI screenshot, hotlink stock images or substitute icons.
- Apply global neutral dark tokens, sans-serif typography, consistent borders, density, inputs, buttons and legible focus states to **all** current screens, dialogs, errors, My Items and shared mod controls.
- Restyle skills/ability slots and all actual equipment rows; preserve official item/ability icons, both independently configured bars, levels, pickers, all primary and secondary gear rows, selected mods, import and local persistence.
- Preserve the existing hover/focus/click ability-details popover while changing its information presentation to one vertically stacked list. Keep all content, Relevant Mods, Technical details, Edit bar and Remove accessible and working.
- Honor the mockup's green Save affordance only as a real **local draft** action wired to the existing autosave flush/retry and status (no false cloud saving); preserve confirmation/undo/error/protected behavior.
- Match the screenshot's visual intent, not its fictitious text or limited equipment sample. Never hardcode illustrated `+88%`/`+110%` badges without a trustworthy current value.
- Maintain responsive behavior and keyboard/touch access at the checked viewport sizes.

**Non-goals:** No damage-engine implementation (T0013), new skills/slots, item/mod features, remote save/share, backend migrations, or unrelated refactors.

**Acceptance criteria:**
- Supplied Greek-mosaic Gorgon portrait and moonlit ruins banner render as separate optimized assets, while the application UI remains neutral charcoal with functional skill/damage/action accents; customer approves the in-app screenshot.
- Main builder and expanded equipment/My Items/mod dialogs share one cohesive dark design and have no missing controls.
- Acid Arrow (and unrelated abilities) open a **floating** vertically stacked inspection card on hover, click, focus; keyboard escape and actions work.
- All previously working editing, clear, import, save/retry, mod search and tier workflows still work; no fake Save or hardcoded mod values.
- 1440/1920 desktop and 375/320 mobile have readable layouts and no horizontal overflow or trapped controls.
- Repository's data check, lint, typecheck, tests and build succeed; real-browser screenshot and interaction smoke evidence supplied.

**Manual verification:**
1. Open editor on desktop; compare header, Gorgon portrait/banner, font, colors and spacing to the approved first mockup.
2. Test Druid/Archery bars, both skill selectors/levels, full and empty slots, real icons, + picker and bonus indicators.
3. Hover/click/focus Acid Arrow and another ability; inspect vertical stats, relevant mods, Technical details, Edit bar, move/remove, Escape and screen-edge position.
4. Inspect all nine primary equipment rows, Other slots, selected/imported item STATS/mods, search and Mod Browser Settings; switch gear without losing search/filter state.
5. Test title, import, working local Save, autosave/retry, Clear cancel/confirm, refresh and protected/read-only warnings.
6. Check 1440×900, 1920×1080, 375×812 and 320×812 plus keyboard/tab/touch behavior; run full quality suite.

## T0022-F2 — Compact, Single-Column Ability Tooltip (PR #31 Correction)

**Status:** Product-owner correction requested 2026-11-02; **not implemented**. Do this on the **existing PR #31 / existing branch `claude/great-feynman-4occf5`**. Do not start a different ticket, branch or PR; do not merge before screenshot approval.

**Complexity:** Standard, focused presentation-only correction

**Verification:** Real-browser screenshot comparison and customer acceptance required

**Problem:** The T0022-F1 “fit without scroll” correction made longer ability hover cards expand into a very wide two-column inspector (up to ~920px) covering unrelated portions of the application. The customer explicitly rejects this behavior. Their two screenshots show the desired direction: the **original narrow, vertically stacked tooltip** rather than the latest oversized split layout. The original issue was excessive type size, repeated provenance labels and vertical spacing, **not insufficient horizontal space**.

**Goal:** Restore a predictable **small, anchored, single-column ability tooltip**. Make its actual text and spacing compact enough that typical desktop abilities, including Chew Cud 10 with six Relevant Mods, fit at normal desktop viewport heights without internal scrolling. Preserve all actual mod effects and ability operations.

**Dependencies:** Open T0022 implementation PR #31; existing T0022-F1 changes, including `popover-placement.ts`, available for targeted replacement/simplification. Ask the product owner to attach the **two before/after screenshots from the 2026-11-02 feedback** to the implementation agent; this ticket is the authority if a prior F1 test contradicts it.

**Allowed areas:** `src/features/abilities/{AbilityPlanner.tsx,AbilityFacts.tsx,RelevantMods.tsx,popover-placement.ts,popover-placement.test.ts}`, the ability-popover-specific rules of `src/app/planner.css`, focused ability UI tests, `src/app/visual-redesign.smoke.py`, `src/app/verification/T0022.md`, and documentation of this correction. Touch other files only if essential and explain why.

**Do not touch:** layout or behavior outside the ability popup; Gorgon branding/artwork, skill/equipment editors, mod aggregation/eligibility, official data, import parsing/evidence, BuildDocument schema, Sparks, persistence, damage calculations, remote save or dependencies.

**Requirements:**
1. **Remove the F1 oversized-layout strategy.** Never switch the ordinary hover card into `expanded-columns`, a two-column facts/mods inspector or a nearly full-width desktop overlay. Its information order remains **header → description → short facts/effects → Relevant Mods → Technical details / Edit bar → Remove**, one column. Keep desktop width in a predictable approximate **400–460px range (hard ceiling 480px at normal zoom)** and mobile width bounded by the viewport. Do not increase width merely to avoid wrapping; do not use CSS `transform: scale(...)` or move the panel across the page in a way that disconnects it from the ability slot.
2. **Make content genuinely dense, primarily through typography.** Aim for ~15–16px ability heading, ~28–32px icon, **12–13px body/stat/mod text** (12px preferred for long mod effects), line-height ~1.2–1.3, 10–12px outer padding, and ~4–8px section separation. Labels and values must remain distinguishable; keep real damage-type coloring and a compact green Relevant Mods heading. Small desktop disclosure controls are fine; keep adequate coarse-pointer targets (44px where appropriate). Do not go below ~11.5px at 100% zoom just to pass a screenshot.
3. **Preserve exact mod descriptions.** Keep every Relevant Mod's full original visible wording, including leading ability names such as "Chew Cud increases..." and repeated ability names across separate mods. Do not shorten, rewrite, merge, deduplicate or omit any effect description. Preserve all conditions, numbers and original data; optimize density through typography and spacing instead.

4. **Make provenance secondary.** Remove persistent per-row “Chest”, “Hands”, “imported” and similar source labels from the default compact list: they consume width and are not needed to understand the ability effect. **Retain exact slot, item name, imported/planned status, power/tier identifiers and matching evidence** for each mod, discoverable in the existing Technical details disclosure or another keyboard-accessible, lightweight reveal. Do not rely solely on hover-only HTML `title` for accessibility; do not strip original source metadata from data attributes or records.
5. **Avoid irrelevant facts:** When an ability like Chew Cud has no published damage and its damage type is a non-damaging sentinel, the default compact presentation should prioritize its healing/special effects instead of a prominent “Damage: Not published · Nothingness” line. Preserve truthful missing-data context in Technical details; never hide a meaningful published damage or unsupported/conditional warning.
6. **Position simply.** Prefer below the trigger, then above; adjust horizontal alignment only enough to stay inside the viewport. If neither has room, a narrow left/right placement is permissible but **never grow the card or switch to columns**. Preserve 150ms hover handoff, click pin, focus/keyboard, Escape and focus return, viewport collision handling and dynamic recalculation when disclosures expand.
7. **Scrolling:** At normal desktop zoom, the **default collapsed tooltip** for Chew Cud 10 with six relevant equipment mods and for Acid Arrow 13 should show **all normal information and controls with no internal scrollbar** at 1920×1080, 1440×900 and 1366×768. No hidden, clipped or truncated effect text. For genuinely unbounded mod lists, expanded Technical details or very small/touch screens, use a **bounded, accessible last-resort overflow** rather than illegible microtext or a huge sideways panel. Do not claim that arbitrary content can always fit without scrolling.

**Non-goals:** New mod calculations or summaries, combining repeated mods, changing the wording of mod descriptions, changing item provenance or gameplay, a permanent/pinned side inspector, new global dialogs and unrelated visual redesigns.

**Acceptance criteria:**
- At 1920×1080, 1440×900 and 1366×768, Chew Cud 10 with six Relevant Mods fits in **one vertical column**, width ≤480px, without a default internal scrollbar; no giant header-spanning two-column panel.
- Acid Arrow 13 remains compact and shows real damage, relevant mods and actions without scrolling on the same desktop viewports.
- Default Relevant Mods displays each actual effect once per source instance, compactly, **without slot or imported tags**. Full provenance for each entry remains keyboard-discoverable on demand.
- Every visible mod description retains the exact full original wording, including each occurrence of “Chew Cud”; source metadata remains inspectable on demand. Non-damaging abilities do not give primary prominence to bogus-looking “Nothingness” damage, but meaningful damage and warnings remain accurate.
- A user can still open/close Technical details and Edit bar, replace/move/remove, use mouse hover/keyboard/touch, and see screen-edge placement without losing focus or controls.
- Focused tests, lint/typecheck, full tests and build succeed. Browser smoke asserts **single-column**, width cap, default no-scroll cases, content parity, source access and narrow-screen accessibility. Delete or update F1 tests that assert the now-rejected two-column behavior.

**Manual verification:**
1. Attach the user's **two screenshots** to the agent and compare the corrected 1920×1080 Cow / Chew Cud popup with them. It must look like a compact tooltip, *not* the right-hand wide inspector.
2. With Chew Cud 10, six relevant mods from different gear (including imported powers), verify every full unmodified mod description (including leading ability names), all numbers and conditional text appear in a single narrow column with no internal scrolling on 1920×1080, 1440×900 and 1366×768.
3. Verify provenance (gear slot, item name, imported/planned, power/tier) is recoverable in the secondary details using both mouse and keyboard, but not repeated beside every visible line.
4. Open Acid Arrow 13 and another healing ability; verify appropriate stats, published damage types and truthful non-damage presentation.
5. Expand both Technical details and Edit bar; test Replace, Move, Remove, Escape, focus restoration, mouse-out handoff and 375/320px mobile access.
6. Include before/after screenshots at 1920×1080 and 1366×768, document exact popup width/font/scrollHeight/clientHeight, run quality checks and request product-owner approval. **Do not merge PR #31 automatically.**



T0010-F2 final clarification: the public view includes a default-collapsed **Damage breakdown** showing actual engine steps, individual named equipment/skill contributions, flat/percentage/Skill Base contributions, target multipliers and final hit/total. It contains numerical presentation only: no raw IDs, source paths, uncertainty/exclusion inventories, implementation assumptions or long explanations. Those diagnostics remain available only through the development `?debugDamage=1` view. Public `Partial` labels are replaced with `Estimated`; unavailable numbers remain `Unavailable`. No engine results or accepted mod-search/Selected-heading behavior change.

## T0017 — A/B Build Comparison (Deferred Post-MVP)

**Status / Queue:** **Deferred until after T0021 v1 release by product-owner decision 2026-11-06.** This is optional post-MVP scope, placed before the postponed T0016 at the end of the current backlog. **Not a dependency of T0018–T0021.** Reassess product value before starting. Full future implementation scope: [Issue #45](https://github.com/Zaelious/GorgonBuilder/issues/45).

**Complexity:** Standard

**Verification:** Customer hands-on

**Goal:** Make comparison a first-class planner workflow using the same calculation engine on both sides.

**Dependencies:** T0021 MVP release (scheduling only); existing T0014/T0015 engines. T0016 not required.

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
- No defensive score yet. Character Statistics, defensive/armor Sparks and optional CurrentStats reconciliation belong to post-MVP T0016.

**Acceptance criteria:**
- Changing one controlled source in B produces an explainable corresponding delta.
- Unchanged values remain unchanged.
- Same engine paths are used for A and B.

**Manual verification:**
1. Duplicate a real test build, alter one item/mod/Spark source, and confirm the expected delta.
2. Try a more heavily changed build and inspect explanations.
3. Run the quality suite.

## T0016 — Character Statistics and Defensive Calculation Engine (Post-MVP)

**Status:** Deferred — **post-MVP, last in current ticket queue**, after T0021 release. The T0016 identifier is retained for history although this ticket executes after T0017–T0021. **Do not begin before the user explicitly starts it.**

**Complexity:** Very high — scope to be rechecked against data evidence at handoff. **Verification:** Customer hands-on with controlled equipment, stats, defensive effects and where possible in-game measurements.

### Goal
Provide a useful **planned-build character stat sheet** and a pure, source-backed **defensive/character-stat calculation engine**. The primary output is the stats of the equipment/skills/mods/Sparks the user selects in GorgonBuilder, **even if those items are only in inventory and were never equipped in-game**. Imported CharacterSheet.CurrentStats is an **optional reference/validation snapshot**, not the foundation of the planned build and not a requirement to use it.

### Scheduling and dependencies
- **After:** T0021 (v1 release), T0012 (aggregation), T0013/T0014 (ability calculations/UI), T0015 (offensive Mastery Sparks); integrate with T0017 comparison only when post-MVP functionality exists.
- **T0017 and T0021 must NOT depend on T0016.** They use currently supported ability and aggregate outputs and may ship without the future character/defense engine.
- This is the last planned ticket in the current backlog, not an MVP release gate.

### Allowed areas (subject to implementation-time architecture review)
- `src/core/calculation/`, new pure character-stat/defense modules and focused tests.
- `src/core/sparks/`, `src/features/sparks/` for source-supported defensive/utility Mastery Spark modeling and UI.
- `src/features/` or `src/app/` for compact Character Statistics UI, and necessary integration with existing planner equipment/mod/skill state.
- `src/core/validation/`, `src/features/import/` for optional CurrentStats comparison using existing local import.
- Minimal compatible build/persistence changes **only with an explicit migration plan** if newly modeled state cannot fit schema v1.
- Verification docs and sanitized/synthetic fixtures.

### Requirements
1. **Source-first stat inventory.** Audit official current Project Gorgon data, existing modifier categories, playable defensive/utility Spark types, item slots/eligibility, CharacterSheet.CurrentStats keys and known unmodeled effects. Record supported stat keys, numeric units, stacking/scopes, conditionality, game-data version and observed evidence. Do not treat unknown export fields or third-party guesses as established mechanics.
2. **Pure stat engine.** Reuse `aggregateBuildModifiers` and its provenance/condition/confidence contracts, extending only as needed. Model supported character and defensive families such as Max Health/Armor/Power, damage-type mitigation and vulnerability, direct/indirect reductions, evasion, critical chance/damage where relevant, regeneration and Combat Refresh. Other relevant stats may follow **only where data and mechanics support them**. Clearly separate innate/base character values, equipment/skill contributions and actually known final totals. Never assert a complete total from incomplete contribution data.
3. **Defensive Mastery Sparks.** Expand beyond T0015's four offensive planning slots to **officially supported armor/defensive Spark categories and eligible slots**. Preserve existing offensive behavior. Simulate only source-backed, validated roll distributions/caps/eligibility; otherwise offer clearly labeled manual/planning inputs with explicit unsupported/Estimated state. Never invent armor Spark probability tables, capacities or stat benefits, and never infer rolls from Storage/CraftPoints.
4. **Build-first UI.** Add a compact, grouped **Character Statistics** panel driven by the **current planned loadout**. Show numeric stats where valid, supported contribution breakdowns, and concise `Estimated` / `Unavailable` statuses. Refresh immediately after choosing/removing gear, changing a working imported power tier, staging candidates, changing skills or configuring Sparks. Retain a clean default and drill-down details; support desktop, mobile and keyboard access.
5. **Optional import reference.** When CharacterSheet.CurrentStats is loaded locally, offer an optional comparison view showing the exported value, export timestamp/version, planned value or contribution, and a delta **only when identical units, basis, conditions and complete coverage justify comparison**. If items were merely in Storage inventory at export, say the character snapshot does not represent the selected GorgonBuilder loadout. Never infer equipped state from `IsInInventory`, solve equipment from stats, mutate the planned build on import, or send raw report data off-device. Unmapped/non-numeric CurrentStats keys remain inspectable.
6. **Preserve existing game/damage behavior.** Avoid double-counting imported historical `metadata.sourceItem` and editable effective `existingPowers`, candidate mods or Sparks. Honor active skill/level logic and conditional effects. Reuse offensive and critical systems rather than duplicating or changing them just to fit a stat panel. Clearly distinguish damage taken after known mitigations from overall survivability, which also depends on enemy attacks/conditions.
7. **Honest test coverage.** Deterministic unit and integration tests for flat/percent/conditional contributions, scope, units, contradictory/off-skill sources, level conflicts, editable imported tiers, source provenance, spark results, no-report workflows, nonmatching report snapshots, incomplete totals and refresh. Use sanitized fixtures only. Verify with one-source in-game before/after data when practical; keep uncertain formula ordering marked provisional.

### Non-goals
- Not an MVP requirement; **no need to change T0017 or T0021 implementation to include defensive stats**.
- No automated gear optimizer, automatic equipped-loadout identification, full enemy-combat/rotation/DPS or threat/taunt encounter simulator in this ticket.
- No invented base character stats, immunity rules, evasion chance formulas, Spark distributions, condition defaults or unmeasured multipliers.
- No remote uploads of raw character reports.

### Acceptance criteria
- Planned stats are useful with **no import at all** and reflect only the user's manually configured build and supported mechanics.
- A controlled change to one gear/mod/Spark input changes the appropriate modeled character stat, with traceable breakdown and no unrelated deltas.
- Supported Max Health/Armor/Power and prioritized mitigation/vulnerability families have tests and confidence states; unsupported families clearly remain unavailable.
- Armor/defensive Spark support is limited to evidenced eligible slots/types and does not alter established T0015 offensive outcomes.
- CurrentStats comparison is optional and correctly distinguishes a snapshot of actually worn gear at export from hypothetical inventory-only equipment.
- Existing skill/ability damage, import/My Items, source evidence, autosave/share and A/B comparison regressions remain green.
- Lint, typecheck, all tests, build, official data check, Cloudflare dry-run and desktop/mobile smoke pass, with explicit customer game-math validation tasks.

### Manual verification
1. Build a character without importing any report, equip representative defensive gear, and inspect grouped Health/Armor/Power, mitigation/vulnerability, critical and other supported stats; verify unsupported categories are labeled rather than guessed.
2. Change one effective imported or planned power tier and one armor Spark result; inspect source-specific modeled deltas, and remove each to restore the baseline.
3. Configure the same items in-game if practical, record controlled before/after stat readings, and document exactly which modeled contributions or complete totals agree.
4. Import fresh CharacterSheet and Storage JSON with matching character/server and timestamps. Confirm no automatic loadout, confirm snapshot comparison is optional, and test a different inventory-only planned loadout without falsely treating its deltas as errors.
5. Reload/save/share, test desktop and mobile, and run the full quality suite. Never commit private exports.

**Suggested future branch:** `feature/t0016-character-defensive-stats`.

**Agent handoff:** Before implementation, check updated official data and inspect whether the very-high-complexity work needs several focused follow-up tickets. Preserve this ticket's post-MVP scheduling and do not silently expand into rotation, encounter or optimization mechanics.
