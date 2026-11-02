# GorgonBuilder — Known Issues and Follow-Ups

**Last updated:** 2026-11-01

## KI-0001 — Exact Damage Formula Is Not Fully Known

**Status:** Expected research/validation work

Project Gorgon uses multiple damage modifier categories. Only some ordering/behavior is currently validated.

Known confirmed example:

- Skill Base Damage references original ability base only.

**Action:** T0013 merged through [PR #32](https://github.com/Zaelious/GorgonBuilder/pull/32) with a pure damage engine, original-base Skill Base contribution and explicit provisional stacking assumptions. Finish T0014's visible damage breakdown and T0015's Spark integration before customer in-game formula validation; do not promote assumed rules based on synthetic tests. Keep internal confidence/provenance without repetitive UI badges; show specific warnings for genuinely unmodeled mechanics. Minor T0013 confidence nuance: a minimal synthetic base-only case can be marked validated while published-hit direct delivery remains assumed; address when clarifying result display/validation, not as a blocker to UI integration.

## KI-0002 — Storage Export Does Not Reliably Mark Active Equipment

**Status:** Known limitation

`IsInInventory` indicates carried inventory and cannot be treated as an equipped flag.

**Action:** Character import provides a My Items collection and the user selects the active planner loadout.

**Possible later research:** infer candidate loadout from CurrentStats, clearly labeled as inference.

## KI-0003 — Individual Mastery Spark Outcomes Are Not Proven Importable

**Status:** Known limitation

Supplied reports expose normal item TSys powers but do not establish a field containing all individual Spark outcome rolls.

`CraftPoints` exists on some items but should not be converted into definitive Spark history without validation.

**Action:** Spark outcomes remain simulated/manual in initial implementation.

## KI-0004 — Backend Provider Not Yet Selected

**Status:** Planned T0018 decision

Architecture intentionally uses a provider-agnostic `BuildRepository`.

## KI-0005 — Rotation Simulator Deferred

**Status:** Planned next ticket series after T0021

DPS depends heavily on build-specific setup, buffs, debuffs, stacks, cooldowns, and priority choices.

The condensed v1 ticket series validates the underlying per-ability engine and completes import validation, comparison, and save/share before implementing stateful rotation simulation.

## KI-0006 — Cloudflare Workers Preview Build Failures

**Status:** Investigation needed; no evidence of a T0003 application regression.

Cloudflare Workers Builds marked PR previews on PRs #2, #3 and #4 as failed on 2026-10-31 while GitHub Actions CI, including Wrangler dry-run, succeeded. PR #5 and PR #6 preview builds/deployments subsequently succeeded, but the root cause of the earlier failures has not been established. GitHub checks do not include the underlying Cloudflare error log.

**Action:** Go to Workers & Pages → `gorgonbuilder` → Deployments → View build history. Open PR #4's failed build ID `66cf1b10-8e5b-4439-8889-86a3f3175ee2`, inspect the first failure, compare with `docs/Cloudflare_Deployment.md` settings, verify Branch control/Preview Builds and retry after fixing the identified issue. Avoid unrelated code changes without diagnostic evidence.

## KI-0007 — Crafting Target Level Is Not a Validated Equipment Requirement

**Status:** Resolved for base-item browsing by T0009; customer accepted and merged 2026-11-01 in [PR #18](https://github.com/Zaelious/GorgonBuilder/pull/18). The source field remains a browsing hint, not an equip restriction.

T0005's official v490 `items` data exposes `CraftingTargetLevel`, not a generic item `Level`. Normalized `level` intentionally equals that source field with `levelSource` recorded. Of 3,078 equipment records, 518 have crafting target level 90+ and 500 omit the field.

**Risk:** Using this field as an unqualified item-level/equip-level requirement could hide valid gear or communicate a false gameplay restriction. Imported concrete item-instance levels and published item `SkillReqs` are separate concepts.

**T0009 decision:** Use `CraftingTargetLevel` as a **base equipment target-level browsing filter**, not a validated equip-level requirement. UI: “Minimum target level”, default 90 from existing preferences, nullable threshold disabled by selecting any level, and a default-on include-unknown control. Keep unknown values null, and show `SkillReqs` and future item-instance levels separately. Test levels 89/90/91/null and snapshot-specific counts. [GorgonExplorer's April 8, 2026 changelog](https://www.gorgonexplorer.com/) is a secondary UI precedent only; official pinned data remains authoritative.

## KI-0008 — Vite Development/Preview Gzip Transport

**Status:** Resolved and merged 2026-11-01 in [PR #16](https://github.com/Zaelious/GorgonBuilder/pull/16) (`b9b75f286d460c706f127b895bf1bb7ae4ff69eb`). All 352 tests, GitHub Actions CI, Cloudflare preview build, and Codex's real-browser dev/preview checks passed. See [KI-0008 verification](KI-0008_Verification.md) for complete before/after headers, hashes, and environment notes.

`npm run dev` / `vite preview` can serve the generated `.gz` assets with `Content-Encoding: gzip`. Browser fetch transparently decodes the response before T0006's loader verifies **compressed** byte lengths and SHA-256, so local Vite use fails with a byte mismatch. The production bundle worked via a static server and Cloudflare Workers local assets; PR #12's remote preview deployment succeeded, although its live runtime was not independently fetched by the implementation environment.

**Resolution:** A narrow Vite 8 middleware intercepts only the three original gzip files under both `configureServer` and `configurePreviewServer`, serving `Content-Type: application/gzip` with no `Content-Encoding`. Browser-received bytes match pinned manifest compressed sizes and SHA-256. Existing loader/decompression/integrity validations remain unchanged; corrupted responses still fail and Retry recovers. All 10 production output files were reported byte-identical to pre-fix `main`. Live Cloudflare runtime was not independently browser-tested; the Cloudflare preview build check passed. [Vite issue #12266](https://github.com/vitejs/vite/issues/12266) matches the original symptom.

## KI-0009 — Runtime Repository Memory and Load Cost

**Status:** Monitor during equipment/mod UI implementation.

Early T0008 unthrottled desktop measurements showed roughly **195–239 MB** used browser JavaScript heap while loading the complete v490 repository; this is not a mobile-device performance guarantee.

**Action:** Measure actual loading/interaction on representative hardware before adopting additional caching or partitioning. Keep the pinned source/version/integrity model intact.

## KI-0010 — Optional Equipment Picker Click-Outside Dismissal

**Status:** Nonblocking UX follow-up after customer acceptance of T0009 (2026-11-01); not a reason to reopen or delay T0009, and not part of T0010 treasure-mod scope.

The T0009 picker deliberately closes via X/Escape, not by clicking its backdrop, because selecting/dragging text in the wide search input could unintentionally dismiss the dialog. The customer accepted this behavior but would also find click-outside dismissal convenient if safe.

**Action:** If revisited, test a dialog with more outer gutter/adjusted scaling and dismiss only when a pointer interaction both begins and ends on the actual backdrop; never close for drags originating within input/content. Preserve text, keyboard Escape/X, focus return, touch behavior and responsive no-overflow. Add a regression browser test before restoring click-away. Do not alter the accepted default behavior without testing.

## KI-0011 — Duplicate Equipment Detail Header and Nonexclusive Offhand UI

**Status:** Resolved and customer-accepted 2026-11-01 under **T0009-F1**, merged via [PR #20](https://github.com/Zaelious/GorgonBuilder/pull/20) at `09257ce`. See [verification](T0009_F1_Verification.md).

Expanded equipment information repeats the already-visible selected item icon and name, wasting vertical space. The current T0009 OffHand row exposes two independent selectors for official `OffHand` and `OffHandShield`; the customer clarified they are alternatives for **one physical player loadout position**, not two simultaneously occupiable positions. Existing BuildDocument saves distinguish the official source strings, which must be preserved.

**Action:** Remove the duplicate item header inside details. Combine offhand weapon/shield browsing into a single user-facing offhand position, and enforce one occupant on *new edits* while preserving canonical source item slots. On cross-type swaps, safeguard staged mods/Sparks/manual/imported instance metadata; on loading older dual selections, warn and require explicit resolution rather than deleting saved data. Verify across reload and mobile/keyboard. [T0009-F1 scope](Tickets.md). Do not include treasure-mod editing (T0010) or unrelated rule inference.

## KI-0012 — Mismatched Saved Ability-Bar Entries Can Overflow Narrow Screens

**Status:** Nonblocking pre-existing layout issue, observed independently on accepted `main` during T0010-F1 testing (2026-11-02).

At 375px width, a saved ability-bar entry that does not match its current selected combat skill can trigger the “Marked slots need review” warning and expand the page to approximately 501px scroll width. Reproduced on untouched pre-T0010-F1 `main`; matching ability selections fit correctly. T0010-F1 made no ability-bar changes. Fix warning-content sizing in a separate scoped UI follow-up; preserve mismatch diagnostics and mobile/keyboard behavior. See [T0010-F1 verification](../src/features/equipment/verification/T0010-F1.md).

## KI-0013 — Duplicate Combat Skill Must Share One Effective Level

**Status:** Product-owner rule confirmed 2026-11-02; scoped planner-editor follow-up required.

Project Gorgon cannot have the same combat skill at different effective levels in two equipped skill slots. The current v1 BuildDocument/editor permits independently editing both level fields, even when both slots select the same skill. T0012 conservatively emits a `skill-level-conflict` warning and omits that skill's advancement contributions, rather than inventing a level choice.

**Action:** When both skill slots select the same skill, present and persist one consistent effective level across both while preserving independent ability bars. Synchronize future edits without unexpectedly changing unrelated build state. For inconsistent saved/legacy drafts, warn and require safe resolution rather than silently choosing one level. Add editor/persistence and aggregation regressions. Handle as a narrow scoped UX correction before relying on duplicate-skill calculations.

## KI-0014 — Advancement-Table Accumulation and Modifier Applicability

**Status:** Deliberate assumptions after T0012; validate with in-game character evidence in T0013/T0016.

T0012 reports level reward entries summed through the configured skill level as `assumed`. Combining advancement-table rewards across different active skills, and final application of skill-scoped gear modifiers, still requires validation. A gear item may contain bonuses for inactive Necromancy or Priest skills; these source facts are retained, but must not affect unrelated ability damage.

**Action:** Compare controlled actual-character gear, skills and levels with game-visible totals and imported `CurrentStats` (T0016). Compare ability damage and isolate one change at a time during T0013. Never upgrade confidence or silently apply off-skill bonuses without evidence.

## KI-0015 — Duplicated Effect Token Parsing Grammar

**Status:** Nonblocking maintainability follow-up from accepted T0012.

The published attribute token syntax is parsed separately in `src/features/mods/effect-description.ts` and `src/core/calculation/registry.ts` because calculation core cannot import UI features.

**Action:** If logic begins diverging or when next editing both implementations, consider moving shared parsing to a pure `src/data` helper with focused regression tests. Do not combine this unrelated refactor with formula tickets unless required.

## Follow-Up Candidates After T0021

- Rotation Simulator explicit sequence
- time/state engine
- buff/debuff stack modeling
- priority-rule rotations
- food/drink/meditation/potions
- Player.log optional rotation capture/replay research
- defensive/threat calculator
- optimizer
- public searchable build gallery
- optional accounts/claim anonymous builds
- game-data diff/update automation
