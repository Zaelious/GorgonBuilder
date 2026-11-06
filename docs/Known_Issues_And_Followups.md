# GorgonBuilder — Known Issues and Follow-Ups

**Last updated:** 2026-11-04

## KI-0001 — Exact Damage Formula Is Not Fully Known

**Status:** Expected research/validation work

Project Gorgon uses multiple damage modifier categories. Only some ordering/behavior is currently validated.

Known confirmed example:

- Skill Base Damage references original ability base only.

**Action:** T0013 merged through [PR #32](https://github.com/Zaelious/GorgonBuilder/pull/32) and T0014's opt-in damage breakdown through [PR #34](https://github.com/Zaelious/GorgonBuilder/pull/34). T0013-F1 was customer-accepted and squash-merged 2026-11-04 in [PR #36](https://github.com/Zaelious/GorgonBuilder/pull/36) (`acfdfcf`): complete v490 inventory, broad source-backed direct damage mappings, separate calculation coverage and explicit estimated intermediate Burst falloff. **All percentage stacking and additional formula assumptions are still provisional until measured in game**, despite successful synthetic tests. T0013-F2 critical-hit implementation is merged in PR #40 (2026-11-05), but its live-game assumptions remain unverified. T0014-F1 (Stampede stacks and chance-based direct-hit procs) is next; T0015 Sparks follows. Preserve confidence/provenance, avoid repetitive non-actionable warnings, and keep actual damage uncertainties distinct from taunt/reuse-only remainders (T0010-F2). A minimal synthetic base-only case may still be marked validated while published-hit direct delivery remains assumed; review its label during later formula validation, not as a retroactive T0013-F1 merge blocker.

## KI-0002 — Storage Export Does Not Reliably Mark Active Equipment

**Status:** Known limitation

`IsInInventory` indicates carried inventory and cannot be treated as an equipped flag.

**Action:** Character import provides a My Items collection and the user selects the active planner loadout.

**Possible later research:** infer candidate loadout from CurrentStats, clearly labeled as inference.

## KI-0003 — Individual Mastery Spark Outcomes Are Not Proven Importable

**Status:** Known limitation

Supplied reports expose normal item TSys powers but do not establish a field containing all individual Spark outcome rolls.

`CraftPoints` exists on some items but should not be converted into definitive Spark history without validation.

**Action:** T0015 now supports simulated and manually entered Actual outcomes ([PR #42](https://github.com/Zaelious/GorgonBuilder/pull/42)); individual rolls are not inferred from CharacterSheet/Storage. Confirm actual data fields before proposing Spark import.

## KI-0004 — Approved Backend Provider and Outstanding Account/Deployment Integration

**Status:** Cloudflare Workers + D1 **selected by product owner 2026-11-06**, not yet implemented. T0018 proves Worker/D1 migration and OAuth-library compatibility; T0019 then implements user-ID-owned CRUD and secure sessions; T0020 UI; T0020-F1 search/discovery. Existing provider-neutral BuildRepository contract remains a useful boundary. Monitor free-tier request/CPU/D1 limits and domain/OAuth callback setup. The anonymous owner-token-first design is superseded.

## KI-0005 — Rotation Simulator Deferred

**Status:** Planned next ticket series after T0021

DPS depends heavily on build-specific setup, buffs, debuffs, stacks, cooldowns, and priority choices.

The condensed v1 ticket series validates the underlying per-ability engine, finishes existing import/My Items workflows and save/share, then releases. **A/B comparison (T0017) and character/defensive calculations (T0016) are deferred post-MVP**; neither blocks rotation planning.

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

**Status:** Deliberate assumptions after T0012; existing offensive formulas need current in-game evidence. Broad character-stat/CurrentStats validation is deferred to post-MVP T0016.

T0012 reports level reward entries summed through the configured skill level as `assumed`. Combining advancement-table rewards across different active skills, and final application of skill-scoped gear modifiers, still requires validation. A gear item may contain bonuses for inactive Necromancy or Priest skills; these source facts are retained, but must not affect unrelated ability damage.

**Action:** Compare ability damage and isolate individual changes with current T0013/T0014/T0015 capabilities. Post-MVP T0016 will calculate planned-build character/defensive statistics, add evidenced armor Sparks and optionally compare compatible CurrentStats snapshots. Never upgrade confidence or silently apply off-skill bonuses without evidence.

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
- **T0017 (post-MVP)**: Optional A/B Build Comparison using existing engine outputs; assess whether manual comparisons are worthwhile relative to automation before implementation
- **T0016 (post-MVP)**: Character Statistics and Defensive Calculation Engine, with source-validated armor/defensive Sparks and optional CurrentStats validation; encounter/threat simulation remains a distinct later feature
- optimizer
- public searchable build gallery **moved into MVP T0020-F1** ([Issue #50](https://github.com/Zaelious/GorgonBuilder/issues/50)); not a post-MVP candidate
- optional future email/password login (requires verified mail/reset service), richer account options or migration for any legacy anonymous builds **if such builds are ever introduced**; account-based ownership is already MVP T0019
- game-data diff/update automation

## T0013-F1 follow-ups (customer-accepted 2026-11-04; implementation follow-ups approved)

- **Stateless prose (done in the T0013-F1 correction).** The reusable grammar covers
  unconditional named-ability, skill and group damage clauses; 123 unconditional combat
  entries remain (typos, missing attributes, split components). See the
  [report](treasure-coverage/README.md).
- **T0013-F2: critical hits (merged PR #40)** (Anatomy/Phrenology, creature-type target, ability crit rules, equipment crit). The creature-type selector provides a foundation for conditional creature-type and Elite effects; additional families remain future work.
- **Target/state condition and buff toggles** for 2,563 conditional and 2,933 stateful
  direct entries (sub-families listed in the report).
- **T0010-F2 (accepted/merged PR #38 on 2026-11-04, `34d7cd7`):** secondary-only remainders are distinguished from unresolved damage internally. Public results show a concise, expandable named/numerical Damage breakdown with Estimated/Unavailable status where needed; long diagnostics remain developer-only. Available and Selected search uses debounced effective queries. No new damage mechanics.
- **T0013-F3 candidate: damage allocation and conversion measurements.** Establish
  flat allocation among ordinary/health/armor hit components, indirect delivery,
  stacking/order, stateless damage-type conversions and duplicate-conversion rules.
- **Burst measurements:** replace the explicit interpolation policy with current
  observations only when evidence supports it; resolve random radius remainders
  and full thresholds >=9. No indirect totals follow from the known 50% floor alone.
- **Later mechanics work:** stateful buffs/debuffs, triggered extra attacks, pets,
  reactive shields, DoTs and criticals require separate contracts/research. They are
  counted and explained in the inventory, not silently implemented in T0015 Sparks.

- **Existing 320 px layout:** planner help extends the document to 322 px on both
  main `160b073` and T0013-F1. The damage popover is bounded. Preserve this separate
  minor layout follow-up; [comparison](verification/t0013-f1/baseline-overflow.json).

## Approved post-T0013-F1 product-owner follow-ups (2026-11-04)

- **T0010-F2 — Accepted and merged** via [PR #38](https://github.com/Zaelious/GorgonBuilder/pull/38), `34d7cd7`, 2026-11-04. Responsive Available/Selected search and a public numerical Damage breakdown are complete; diagnostic-only text is hidden from ordinary users. No damage formula changed.
- **T0008-F2 — Ability Role Labels, Relevant Mods and Variant Picker Consolidation (Codex High).** Show source-backed Basic/Core/Nice/Epic/Minor Healing/Major Healing/Signature Support/Signature Debuff/Survival Utility roles; verify category-related gear effects actually reach eligible abilities without duplication or conditional keyword leaks. Compact only Vampirism Blood Mist, Animal Handling Call Stabled Pet, Bard SoD, Mentalism Mindworm, Necromancy SZ, Priest Triage and Priest Flamestrike. Preserve exact canonical IDs/ranks. Correct 'unconditional' audit counts for required-active-skill source conditions; report affected totals.
- **T0013-F2 — Imported Anatomy/Phrenology Critical Hits and Target Conditions (Codex Extra High).** Full working critical chance/critical hit/expected hit calculator using imported/manual creature subskills, target creature selector and source-backed equipped crit modifiers. Keep unknown rules marked provisional; no full rotation/DPS, Spark, pet or DoT work.
- **Sequence (completed):** T0010-F2 (PR #38) → T0008-F2 (PR #39) → T0013-F2 (PR #40) → T0014-F1 (PR #41) → T0015 Mastery Sparks (PR #42, `ff9745a`). **T0018 is next for the MVP** ([Issue #46](https://github.com/Zaelious/GorgonBuilder/issues/46)); **T0017 A/B** ([Issue #45](https://github.com/Zaelious/GorgonBuilder/issues/45)) and **T0016 character/defensive statistics** ([Issue #43](https://github.com/Zaelious/GorgonBuilder/issues/43)) are deferred post-MVP. T0020/T0021 no longer depend on T0017, and T0021 does not depend on T0016.

## T0013-F2 open questions and follow-ups (2026-11-04)

- **KI-0016 — Anatomy base critical multiplier conflict.** v490 publishes `CritDamageMod` 1.25 for Archery (1.5 for Crossbow); the wiki Combat page says Anatomy crits default to ×1.5. The published value is used and labeled Estimated until a controlled in-game measurement. See [T0013-F2 verification](T0013_F2_Verification.md).
- **Critical stacking/order assumptions:** additive critical-damage bonuses, additive chance, multiplier after all target stages, and the absence of a chance cap remain assumed.
- **Stateful/conditional critical effects:** Aimed Shot's next-attack chance grant, crit-triggered effects (ArcheryCritFaster/Poison/AcidBomb), Knife and Vampirism conditional critical systems (no published Knife multiplier), pet crits and Fairy Magic `PhrenologyCriticals` chance (notes name only Mentalism/Psychology) remain unavailable.
- **Creature/Elite conditional families:** only four exact powers are curated; Gourmand brewing (non-equipment), "sentient", "Pigs", Pixie Flare "total damage" and Backstab "Direct Damage to Elite" remain unmodeled.
- **Stale browser smokes (pre-existing on main `3aff873`):** `burst-estimate.smoke.mjs` and `prose-grammar.smoke.mjs` wait for debug-only elements in production preview after T0010-F2. `popover-scroll.smoke.mjs` received a selector-only fix in T0013-F2.

## T0014-F1 — Stampede and Damage Proc Follow-ups (2026-11-05)

**Status:** Merged 2026-11-06 via [PR #41](https://github.com/Zaelious/GorgonBuilder/pull/41), `430f92b`. [Verification](T0014_F1_Verification.md) and
[separate exact-power audit](treasure-coverage/T0014-F1.md). Customer subsequently measured Stampede damage for T0015-R1.

- Continuous Trampling now accepts 0–30 manually selected **effective concurrent contributions** (default 0), with independent equipped tier values. Customer testing of +56 only and +50/+56 together matched 30 contributions scaled at 1.955× within 1 damage. The 60-second buff and Stampede 12's 2-second reuse explain the steady state, not an intrinsic game cap. Source text mentioning 15 remains unchanged. Full expiry timing, other cooldowns, conditional ordering and rounding are not simulated; those remain **Estimated**.
- Five direct-hit proc families are supported: Strike a Nerve, Deer Bash, Pig Rend, Spirit Bolt, and Cow Front Kick
  extra flat damage. Final-hit multiplication or flat placement through the ordinary engine remain **Estimated**.
- Duplicate proc copies retain separate source/tier/probability/effect records but combined results are **Unavailable**:
  shared versus independent rolls, strongest-only behavior, additive probability and simultaneous triggers are unknown.
- Critical/proc interaction and ordering remain unknown. Separate noncritical proc and critical-only expectations are
  shown; there is no joint expectation or DPS. Pig Rend/Spirit Bolt DoTs remain unmodeled.
- Adjacent exact-power candidates, random AoE, conditional/timed procs and triggered chains stay unavailable or outside
  scope; the audit names each family. Implement later under a separate handoff with measured/source-backed semantics.
- The three historical treasure-coverage snapshots remain unchanged; all 150 newly mapped tiers are reported separately.
- Browser screenshots use deterministic local icons because Chromium does not trust this environment's proxy CA.
  Application/layout checks passed; CDN transport and a remotely deployed Cloudflare preview were not verified.
- Vite reports the main chunk slightly above 500 kB (~506 kB minified). Build succeeds; consider profiling/code splitting
  under the existing browser performance follow-up, rather than mixing an unrelated architecture change into this ticket.

T0013-F3 remains a separate allocation/conversion measurement candidate. T0015 is customer-accepted and merged via [PR #42](https://github.com/Zaelious/GorgonBuilder/pull/42), `ff9745a`; see [T0015 verification including R1](T0015_Verification.md). Remaining follow-ups: real Spark applicability validation (especially All Direct requiring an active skill), shield eligibility, item-level percentile/luck analysis, Stampede expiration timing at other reuse values and critical/proc interactions. No related formula redesign was authorized.

T0010-F2 final clarification: the public view includes a default-collapsed **Damage breakdown** showing actual engine steps, individual named equipment/skill contributions, flat/percentage/Skill Base contributions, target multipliers and final hit/total. It contains numerical presentation only: no raw IDs, source paths, uncertainty/exclusion inventories, implementation assumptions or long explanations. Those diagnostics remain available only through the development `?debugDamage=1` view. Public `Partial` labels are replaced with `Estimated`; unavailable numbers remain `Unavailable`. No engine results or accepted mod-search/Selected-heading behavior change.
