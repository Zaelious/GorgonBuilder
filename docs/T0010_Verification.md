# T0010 — Treasure Mod Planner: rendering and density correction

**Status: Revised on the existing PR #22 for architectural review and customer acceptance. Not merged or marked complete.**

Branch: `feature/t0010-treasure-mod-planner`. The initial implementation at `62d8116` passed architectural review, but the Product Owner requested a different UI in [the latest customer revision review](https://github.com/Zaelious/GorgonBuilder/pull/22#pullrequestreview-5729510750). The subsequent [rendering/density review at c13d9f5](https://github.com/Zaelious/GorgonBuilder/pull/22#pullrequestreview-5729721042) requires actual official icons, readable effects and substantially denser lists. This report and its replacement screenshots describe those corrections. Existing domain/persistence work remains in place.

## Latest rendering/density corrections

A shared presentation-only renderer, `EffectDescription` / `EffectDescriptions`, now serves Available effects, Selected candidates, item CANDIDATE lines, saved existing powers, published tier details and alternative-tier buttons. It creates React text/image nodes; it never parses source text as HTML or uses `dangerouslySetInnerHTML`.

- Exact `<icon=NUMBER>` markers produce **18×18 actual images** through the existing validated versioned official icon route, e.g. `https://cdn.projectgorgon.com/v490/icons/icon_2160.png`. Text before/after icons and multiple icons are preserved. Malformed IDs/versions make no image request; failed images get a labelled local placeholder. Unknown HTML remains inert literal React text. Raw icon markers are absent from ordinary visible rows.
- The pinned official `attributes.json` provides exact attribute IDs, labels and display-type names. `MOD_SKILL_ARCHERY` publishes **Archery Base Damage % / AsBuffMod**; `MOD_ELECTRICITY_DIRECT` publishes **Direct Electricity Damage % / AsBuffMod**; `MAX_HEALTH` publishes **Max Health / AsInt**. The renderer uses the existing runtime repository's exact attribute lookup, never a third-party mapping or a new data source.
- Strict `{ATTRIBUTE_ID}{numeric value}` and `{ATTRIBUTE_ID}{numeric value}{resolved skill}` forms get readable labels and unchanged source number text. Example `{MOD_SKILL_ARCHERY}{0.6}` displays **Archery Base Damage modifier: 0.6 · source value**. `{MAX_HEALTH}{37}` displays **Max Health: 37**. A resolved third argument is labelled **context: Animal Handling**, without inventing its applicability.
- **No percentage scaling or baseline subtraction is assumed.** Pinned records name modes such as AsBuffMod/AsPercent but do not define their conversion algorithms. A source label's trailing percent sign is not presented as a unit on the unchanged numeric value; instead the visible “source value” note and tooltip explain that display scaling is unverified. `0.6` is not silently converted to 60%, -40%, or 0.6%. Display labels are not calculation semantics.
- Missing labels, malformed templates, unknown attributes/skill contexts and hidden attributes get a readable power/effect fallback plus a small **unformatted official effect** indicator. The exact byte-for-byte source is available under **Exact published effect text** in deliberately expanded technical details. No saved or generated strings are rewritten.
- Available rows now have one ellipsized effect line and a compact **⋯** action for full text/metadata/other tiers. There is no permanent Details subrow. Selected rows similarly show one effect line, **⋯** for inline tier/order/source controls, and a compact **×** remove action. Redundant per-candidate source labels move into details; BASE/EXISTING/CANDIDATE item effects remain distinctly labelled. Unknown-record warnings remain visible.
- Desktop effect text is 13px, icons 18px, and normal row targets are about 30px with thin dividers. Mobile/coarse-pointer effect/details/remove targets remain at least 44px. Full descriptions remain available to assistive technology and through keyboard-operable native details. Ellipsis changes presentation only, never selection identity.

## Browser proof required by the latest review

The revised Chromium smoke checks actual `img.complete` and **`naturalWidth > 0`** for icon 2160 in Available, Selected, CANDIDATE item lines, existing powers and expanded tier facts, in both Vite dev and production preview. It checks text before/after rendering through component tests, verifies that ordinary row text contains neither raw icon markup nor `{MOD_` templates, and isolates a forced icon-404 case to verify the visible fallback. Only that deliberate case may record resource-404 messages.

Final dev and production-preview measurements both show **12 fully visible rows plus a partially visible next row in 420px**, with normal rows **30–31px** high. All eight Selected candidates fit compactly in the desktop capture. The script measures the actual default Available viewport and every initial row: a 400–430px viewport must fully contain **at least 12 rows**, and initial desktop rows must be **at most 34px tall**. It also captures real 1440px desktop and 375px mobile screenshots with Animal Handling icons loaded, verifies mobile stacking and no horizontal overflow at 320/375/768px, and exercises keyboard expansion, ordering, scrolling, exact-tier staging, reload and all existing draft/preservation protections.

## Customer requests implemented

| Request | Result |
| --- | --- |
| Inline Available / Selected | Every expanded equipped-item row has a compact two-column editor, stacked at mobile widths. Effect buttons add immediately; Selected keeps remove visible and exposes inline tier/order controls through ⋯. The modal, view tabs, staging menus and large power cards are removed. |
| Immediate item effects | Published base facts are labelled BASE, saved instance powers EXISTING, and new visible effect lines CANDIDATE plus their source association. Add/edit/remove updates those lines immediately, with no numeric aggregation or damage math. |
| Skill-driven groups | No selected combat skills means no Available powers and a brief prompt. Unique active skills provide groups such as Archery Mods; A+A produces one group. Skill changes refresh Available without clearing candidates. |
| Extra categories | Independent default-checked Generic, Endurance and Shamanic Infusions toggles use the exact source mappings documented below. Missing source associations have an Unknown group. All skills provides broader exploration. |
| Max / 90 / 100 | An independent transient target input defaults to Max, suggests 90/100 and accepts nonnegative whole levels. Available effect values refresh immediately. Clicking adds the exact displayed official tier. Saved IDs/nulls remain unchanged until explicit edits. |
| Detailed on demand | Rows emphasize safely formatted published effect descriptions. IDs, names, flags, source metadata, level/rarity facts and alternative tiers are available through inline Details. Overlapping tiers have an explicit options count. |
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

The pinned 45,634 tiers contain 52,039 descriptions: 31,390 prose descriptions and 20,649 numeric templates with matching official attribute labels. Formatting those labels and source values does not establish the display-mode conversion algorithms or effect calculation semantics.

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
- `src/features/mods/{ModPlanner,EquipmentMods,CandidateList,PowerFacts,EffectDescription}.tsx`, `effect-description.ts`, `mods.css` and renderer CSS/tests: inline editor, dense effect rows, direct item-effect output, selected controls and details.
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
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/features/mods/mods.smoke.py --output /workspace/artifacts/t0010-rendering/mods
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/features/equipment/equipment.smoke.py --output /workspace/artifacts/t0010-rendering/equipment
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/test/vite-transport.smoke.py --output /workspace/artifacts/t0010-rendering/transport
CHROMIUM_TRUST_HOME=/tmp/t0010-chromium-home python src/test/planner-layout.smoke.py --output /workspace/artifacts/t0010-rendering/layout
```

**481 passing tests across 20 files**. Focused T0010 coverage: **63 tests** — 10 pure search/relevance, 14 source-category/preview cases, 7 immutable editor/persistence tests, 14 App component workflows and 18 new effect-renderer tests. Renderer coverage verifies actual DOM images, multiple icon markers, text before/after, malformed IDs, invalid versions, missing-image recovery, inert untrusted HTML, supported attribute labels, unchanged numeric source values, unknown fallback and exact technical source text. An additional App test checks the same image component across all five required surfaces and confirms the exact staged power/tier identity. The App workflows also verify no write at 499 ms and exact autosave at 500 ms; more than six candidates; exact Max/90/100 effects/tier keys; immediate add/edit/remove effect output; null tiers; preserved ordering/reload; no-skill/A+B/A+A behavior; independent category toggles/all-skills exploration; explicit overlapping alternatives; invalid targets; unknown IDs/base definitions; read-only/protected drafts; and legacy offhand preservation. Existing skill/ability/equipment/autosave/transport tests remain passing.

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

Both mod-workflow modes check for zero unexpected console errors/page exceptions; the deliberate icon-404 fallback case is recorded separately. Existing equipment/offhand smoke passed canonical swaps/reloads, legacy conflict preservation/cancel/confirmed resolution, instance-replacement confirmations, candidate/Spark preservation, equipment filter/preferences and picker drag/backdrop/X/Escape behavior. Its deliberate icon-404 fallback recorded only the expected resource message. Transport smoke passed compressed lengths/hashes/headers, corruption/retry and existing skill/ability workflows in both modes. The separate layout regression covers desktop sizes through 2560px, touch at 375/320px, native skill dropdowns, ability search/details and persisted titles.

Artifacts and JSON measurements are under `/workspace/artifacts/t0010-rendering/`. Measurements are unthrottled local Chromium observations, not guarantees for low-end devices, other engines or live Cloudflare runtime.

![Inline Available and Selected on desktop](screenshots/t0010/inline-desktop.png)

![Stacked inline editor at 375px](screenshots/t0010/inline-mobile.png)

[Full desktop context](screenshots/t0010/page-desktop.png) · [Full mobile context](screenshots/t0010/page-mobile.png)

## Customer acceptance checklist

1. Equip gear with no combat skills: Available should prompt for a skill. Existing saved candidates must still show.
2. Select Archery and Cow, then A+A; check distinct/unique group headings. Toggle Generic, Endurance and Shamanic Infusions independently. Inspect the explicit AnySkill/Unknown caveats.
3. Compare item contexts. Use All skills and the inline effect/name/ID search for broader exploration.
4. Check actual inline game icons and readable modifier labels, open ⋯ to read full text/source or edit a tier. Set Max, 90 and 100. Observe changed Available effect values; click one to add exactly that displayed tier. Inspect overlapping alternatives in Details.
5. Add more than six candidates, including duplicates. Check immediate CANDIDATE effect lines separately from BASE and EXISTING. Edit/null a tier, move and remove candidates; check immediate reversal.
6. Change the target again: saved tiers must remain unchanged, with a small preview-difference flag where applicable. Wait for Saved, refresh and verify exact order/IDs/nulls and canonical item slot.
7. Check both ability bars, other equipment, existing imported/manual powers and Sparks. Verify the skill dropdown and levels still work without the magnifier; ability search remains available.
8. Repeat by keyboard and at 375px. Confirm inline columns stack and controls/effects fit without horizontal scrolling.

## Risks and follow-ups

AnySkill cannot prove a universally eligible Generic category, overlapping tier ranges/rarities do not identify a unique legal tier, and Max cannot prove numeric effect strength. The UI and pure logic keep these limitations explicit. Raw source remains byte-exact. Readable presentation uses exact official labels and unchanged source numbers; undocumented percentage/scaling conventions remain unverified. No damage math is added.

No new unrelated issue was implemented. KI-0009 representative-device load/memory monitoring and KI-0010 optional equipment backdrop dismissal remain separate follow-ups. After acceptance/merge, synchronize Tickets, Repo_Current_State, MVP notes and Manual_Verification_Guide with the accepted inline workflow. Architectural re-review and Product Owner acceptance remain pending; do not merge or mark T0010 complete based solely on these checks.
