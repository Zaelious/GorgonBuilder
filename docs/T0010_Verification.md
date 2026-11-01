# T0010 — Treasure Mod Planner: customer UI revision

**Status: Revised on the existing PR #22 for architectural review and customer acceptance. Not merged or marked complete.**

Branch: `feature/t0010-treasure-mod-planner`. The initial implementation at `62d8116` passed architectural review, but the Product Owner requested a different UI in [the latest customer revision review](https://github.com/Zaelious/GorgonBuilder/pull/22#pullrequestreview-5729510750). This report and its screenshots describe the revised inline workflow. The existing domain/persistence work remains in place.

## Customer requests implemented

| Request | Result |
| --- | --- |
| Inline Available / Selected | Every expanded equipped-item row has a compact two-column editor, stacked at mobile widths. Effect buttons add immediately; Selected has inline tier/move/remove controls. The modal, view tabs, staging menus and large power cards are removed. |
| Immediate item effects | Published base facts are labelled BASE, saved instance powers EXISTING, and new visible effect lines CANDIDATE plus their source association. Add/edit/remove updates those lines immediately, with no numeric aggregation or damage math. |
| Skill-driven groups | No selected combat skills means no Available powers and a brief prompt. Unique active skills provide groups such as Archery Mods; A+A produces one group. Skill changes refresh Available without clearing candidates. |
| Extra categories | Independent default-checked Generic, Endurance and Shamanic Infusions toggles use the exact source mappings documented below. Missing source associations have an Unknown group. All skills provides broader exploration. |
| Max / 90 / 100 | An independent transient target input defaults to Max, suggests 90/100 and accepts nonnegative whole levels. Available effect values refresh immediately. Clicking adds the exact displayed official tier. Saved IDs/nulls remain unchanged until explicit edits. |
| Detailed on demand | Rows emphasize exact published effect descriptions. IDs, names, flags, source metadata, level/rarity facts and alternative tiers are available through inline Details. Overlapping tiers have an explicit options count. |
| Skill selector cleanup | Removed the magnifier, filter popover/state and related CSS. The full alphabetic native dropdown, valid skill-level inputs and ability picker/search remain. |

Profile membership and exact published slot matches guide order within each group. They do not establish complete equipment legality or exclude exploratory candidates. All skills includes other published skill associations; the three special category toggles remain independent. Filtering only changes Available. Existing candidates always remain visible, including candidates from another skill or missing official records.

Only expanded equipment rows mount the Available editor, avoiding hidden full lists for every equipped item. Scrolling is bounded separately within Available and Selected. Native effect buttons support Enter/Space; keyboard focus follows moved/removed candidates. Details are inline, without an additional dialog stage.

## Official category evidence (inspected before implementation)

Pinned official v490 `src/data/raw/cache/v490/tsysclientinfo.json`, `tsysprofiles.json` and their normalized repository records were inspected. The existing normalization preserves `Skill`, `Slots`, profile memberships, exact tier keys and descriptions; no generated data changes were necessary.

| UI category | Exact source evidence | Interpretation/limitations |
| --- | --- | --- |
| Generic | **90** records publish `Skill: AnySkill`; the existing normalizer retains `skillId: null`, `status: uninterpreted`. Example `power_101` / `ShoddyHealthBoost` has specific Necklace/Ring/OffHand/Feet slots. `power_111` / `LootBoostUncommon` belongs to profile `None`. | Convenience browsing bucket labelled **Generic · AnySkill (association unknown)**. This is not a resolved generic skill or proof of universal applicability. No other powers are guessed into this group. |
| Endurance | **22** records publish exact `Skill: Endurance`, resolving to the official Endurance skill. `power_129` / `RedwallMitigationPhysical` belongs to Redwall and publishes Necklace/Ring slots. `power_31001` / `BrewingMaxArmor` belongs to Brewing and publishes slot `None`. | Exact skill association only. It includes powers from different source contexts; it does not imply every record is a normal equipment mod. Published context stays inspectable. |
| Shamanic Infusions | **28** records publish exact `Skill: ShamanicInfusion`; all 28 also belong to profile `Shamanic`. Example `power_30001` / `ShamanicHeadArmor` publishes Head. | Exact association, not classification from suggestive names or guessed eligibility. Endurance/ShamanicInfusion are not marked combat skills, so their dedicated toggles supplement active combat-skill groups. |
| Unknown association | **6** records retain unresolved `Skill: Unknown`, e.g. `power_13501` / `HammerBuckleHealChance`. | Separate explicit fallback, never guessed to be Hammer, Generic, or another skill from descriptions/internal names. |

A focused test independently compares the normalized groups with the pinned raw selectors, counts and representative profile/slot records. It also checks that a suggestive internal name cannot change category membership. All 90 AnySkill unsupported-selector diagnostics remain unchanged.

## Target-tier policy and ambiguity

Preview ordering uses **published minimum level descending, then published maximum level descending**. Rarity name and the original tier key break remaining ties deterministically; alphabetical rarity is not treated as strength or legality. Numeric targets consider published ranges containing the target, with inclusive min/max bounds. Max considers the highest published minimum-level tier(s), not calculated numeric strength. The chosen primary is labelled and documented as a preview.

For `power_10001` / `ArcheryBoost`:

| Target | Primary exact tier | Published effect example |
| --- | --- | --- |
| Max | `id_12` (120–140) | `{MOD_SKILL_ARCHERY}{0.6}` |
| 90 | `id_9` (90–110) | `{MOD_SKILL_ARCHERY}{0.45}` |
| 100 | `id_10` (100–120) | `{MOD_SKILL_ARCHERY}{0.5}` |

At 90, **id_7, id_8 and id_9** all have published ranges containing 90. The UI therefore shows **3 tier options**, explains its deterministic preview policy and offers explicit choices of every published tier. Rarity, skill-level prerequisites and unsupported restrictions remain inspectable rather than being guessed into a unique legality decision. When no range contains the target, the row says so and other published tiers/null remain available through Details for exploration. `power_129` retains its unusual highest key **id_120**; no display tier number replaces it.

Changing target level never edits gear, saved skill levels, base-item CraftingTargetLevel, existing powers, Sparks or staged tiers. A small **Differs from target preview** flag identifies a known saved tier differing from the current primary; this is not a claim that an overlapping alternate is illegal. Unknown saved records retain their IDs and recovery guidance. Invalid target text retains the previous preview and cannot alter the draft. Target/search/toggles are transient; reopening a collapsed editor or reloading starts at Max.

## Preservation

Schema-v1 BuildDocument, exact `(powerId, tierId)` identities/nulls, duplicate powers, unrestricted candidate counts, immutable build edits, 500 ms autosave, recovery, protected/read-only drafts and snapshot mismatch handling remain unchanged. Candidate changes preserve the selected canonical item slot/ID, imported/manual existing powers and metadata, Sparks, both skill bars, other equipment and unrelated document fields. Legacy conflicting offhand occupants remain intact until explicit resolution; candidates can be edited for a specific retained entry. Existing replace/clear/resolution confirmation rules and equipment picker X/Escape/backdrop behavior remain intact. No new dependencies, generated artifacts, loader/persistence/schema changes, formulas or future-ticket features were introduced.

## Files changed in this revision

- `src/data/search/treasure-planning.ts` and its test: source-category grouping, deterministic tier preview/overlaps, mismatch indicator.
- `src/features/mods/{ModPlanner,EquipmentMods,CandidateList,PowerFacts}.tsx`, `mods.css`: inline editor, dense effect rows, direct item-effect output, selected controls and details.
- `src/features/equipment/EquipmentPlanner.tsx`: BASE label and mounting editors only for expanded rows.
- `src/features/skills/SkillPlanner.tsx`, `src/app/planner.css`: remove skill-search UI/state/styles and reclaim its grid column.
- `src/features/mods/ModPlanner.test.tsx`, `src/test/App.test.tsx`: revised actual App workflows and skill-control assertions.
- Equipment component/browser assertions: continue checking absence of duplicated item headers while allowing the new Available/Selected section headings.
- `src/features/mods/mods.smoke.py`, `src/test/planner-layout.smoke.py`: inline/browser/keyboard/mobile workflow and removed-filter regression; layout script now uses the same optional trusted Chromium home as the other smoke scripts.
- This verification report and four replacement screenshots.

## Automated checks

Node 24.19.0 / npm 11.9.0. Passed:

```bash
npm run data:update -- --check
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
XDG_CONFIG_HOME=/tmp/t0010-wrangler-config npx wrangler deploy --dry-run --outdir /tmp/t0010-wrangler-dry-run
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/features/mods/mods.smoke.py --output /workspace/artifacts/t0010-revision/mods
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/features/equipment/equipment.smoke.py --output /workspace/artifacts/t0010-revision/equipment
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/test/vite-transport.smoke.py --output /workspace/artifacts/t0010-revision/transport
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/test/planner-layout.smoke.py --output /workspace/artifacts/t0010-revision/layout
```

**462 passing tests across 19 files**. Focused T0010 coverage: **44 tests** — 10 existing pure search/relevance, 14 new source-category/preview cases, 7 immutable editor/persistence tests and 13 revised App component workflows. The latter verifies no write at 499 ms and exact autosave at 500 ms; more than six candidates; exact Max/90/100 effects/tier keys; immediate add/edit/remove effect output; null tiers; preserved ordering/reload; no-skill/A+B/A+A behavior; independent category toggles/all-skills exploration; explicit overlapping alternatives; invalid targets; unknown IDs/base definitions; read-only/protected drafts; and legacy offhand preservation. Existing skill/ability/equipment/autosave/transport tests remain passing.

All 13 pinned raw datasets validate offline. No official-data regeneration was performed. `npm ci --cache /tmp/gorgon-npm-cache` passed for the original PR implementation; dependencies and lockfile are unchanged by this revision. Required localhost/network permission was enabled for the existing transport/browser checks. TLS verification remains enabled; the existing public environment CA is trusted through a temporary Chromium NSS store. The first optional layout run lacked that store and reported icon certificate errors; the updated script uses the same trust setup as the successful dev/preview smoke tests. Wrangler was a dry-run, not a deployment.

## Real-browser verification and screenshots

Actual Chromium 154.0.8037.57 exercised Vite dev and production preview at **1440×900** and **375×812**:

1. Equipped Head with no skills: Available empty. Selected Archery/Cow, populated both ability bars, then equipped Ring and canonical OffHandShield.
2. Checked unique skill groups, all three independent visibility toggles and differing profile-aware Archery ordering on different gear.
3. Staged nine candidates using exact displayed Max/90/100 previews; edited a tier, moved by keyboard, removed and cleared a tier. Eight candidates restored in exact order after refresh. Complete build comparison preserved both bars, gear/slots and unrelated fields.
4. Changed A+B to A+A and then no skills: Available updated/emptied while all saved candidates remained visible. Restored the original bars for further preservation checks.
5. Seeded imported powers/metadata, Sparks and an unknown candidate. Another explicit tier edit preserved the entire remaining document. All-skills search found real Psychology/Cow/Unarmed powers; unknown associations remained explicitly unknown in Details.
6. Verified mobile stacking, page/editor no horizontal overflow, native keyboard interactions and focus following moved rows. Inspected the final desktop/mobile captures.
7. Loaded a mismatched snapshot: target inspection remained transient, every candidate mutation control was disabled and saved bytes stayed unchanged after the autosave interval.

Both mod-workflow modes recorded zero unexpected console errors/page exceptions. Existing equipment/offhand smoke passed canonical swaps/reloads, legacy conflict preservation/cancel/confirmed resolution, instance-replacement confirmations, candidate/Spark preservation, equipment filter/preferences and picker drag/backdrop/X/Escape behavior. Its deliberate icon-404 fallback recorded only the expected resource message. Transport smoke passed compressed lengths/hashes/headers, corruption/retry and existing skill/ability workflows in both modes. The separate layout regression covers desktop sizes through 2560px, touch at 375/320px, native skill dropdowns, ability search/details and persisted titles.

Observed initial loads were 1,205 ms in dev and 913 ms in production preview. Search interaction round trips were 19–380 ms in preview (35–454 ms dev), including broad All skills exploration. Heap after forced GC was approximately 74 MB initially and 116 MB with three equipment editors mounted in preview (dev: 78/125 MB). These measurements include rendering and automation; KI-0009 remains open for representative-device monitoring.

Artifacts and JSON measurements are under `/workspace/artifacts/t0010-revision/`. Measurements are unthrottled local Chromium observations, not guarantees for low-end devices, other engines or live Cloudflare runtime.

![Inline Available and Selected on desktop](screenshots/t0010/inline-desktop.png)

![Stacked inline editor at 375px](screenshots/t0010/inline-mobile.png)

[Full desktop context](screenshots/t0010/page-desktop.png) · [Full mobile context](screenshots/t0010/page-mobile.png)

## Customer acceptance checklist

1. Equip gear with no combat skills: Available should prompt for a skill. Existing saved candidates must still show.
2. Select Archery and Cow, then A+A; check distinct/unique group headings. Toggle Generic, Endurance and Shamanic Infusions independently. Inspect the explicit AnySkill/Unknown caveats.
3. Compare item contexts. Use All skills and the inline effect/name/ID search for broader exploration.
4. Set Max, 90 and 100. Observe changed Available effect values; click one to add exactly that displayed tier. Inspect overlapping alternatives in Details.
5. Add more than six candidates, including duplicates. Check immediate CANDIDATE effect lines separately from BASE and EXISTING. Edit/null a tier, move and remove candidates; check immediate reversal.
6. Change the target again: saved tiers must remain unchanged, with a small preview-difference flag where applicable. Wait for Saved, refresh and verify exact order/IDs/nulls and canonical item slot.
7. Check both ability bars, other equipment, existing imported/manual powers and Sparks. Verify the skill dropdown and levels still work without the magnifier; ability search remains available.
8. Repeat by keyboard and at 375px. Confirm inline columns stack and controls/effects fit without horizontal scrolling.

## Risks and follow-ups

AnySkill cannot prove a universally eligible Generic category, overlapping tier ranges/rarities do not identify a unique legal tier, and Max cannot prove numeric effect strength. The UI and pure logic keep these limitations explicit. Exact effect tokens/prose remain uninterpreted; no damage math is added.

No new unrelated issue was implemented. KI-0009 representative-device load/memory monitoring and KI-0010 optional equipment backdrop dismissal remain separate follow-ups. After acceptance/merge, synchronize Tickets, Repo_Current_State, MVP notes and Manual_Verification_Guide with the accepted inline workflow. Architectural re-review and Product Owner acceptance remain pending; do not merge or mark T0010 complete based solely on these checks.
