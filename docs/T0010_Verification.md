# T0010 — Treasure Mod Planner: percent format, readable effects, full-width desktop

**Status: Revised on the existing PR #22 for architectural review and customer acceptance. Not merged or marked complete.**

Branch: `feature/t0010-treasure-mod-planner`. The initial implementation at `62d8116` passed architectural review, but the Product Owner requested a different UI in [the latest customer revision review](https://github.com/Zaelious/GorgonBuilder/pull/22#pullrequestreview-5729510750). The subsequent [rendering/density review at c13d9f5](https://github.com/Zaelious/GorgonBuilder/pull/22#pullrequestreview-5729721042) requires actual official icons, readable effects and substantially denser lists. The [customer acceptance review at 8f6f4a2](https://github.com/Zaelious/GorgonBuilder/pull/22#pullrequestreview-5729847590) then required four further corrections: player-facing percentages, unclipped mod effects, use of the desktop viewport and visible three-digit skill levels. The section immediately below describes that revision; later sections keep the earlier rendering, category and tier-policy evidence, updated where this revision changed it. Existing domain/persistence work remains in place.

## Latest customer acceptance corrections (review at 8f6f4a2)

### 1. Player-facing attribute formatting (source evidence)

The official v490 data notes in the pinned `src/data/raw/cache/v490/index.html` (section `tsysclientinfo.json`) define attribute descriptions as **`{attributeName}{delta}{requiredSkill}`**: the second value is a *delta* to the attribute in `attributes.json`, and the optional third value is a skill that **"the player must have active to get the buff."** The pinned `attributes.json` gives each attribute a `Label` and `DisplayType`.

In the 20,649 template lines across all 45,634 pinned tiers, the labels split exactly by display type:

| DisplayType | Template lines | Label ends in `%` | Presentation now used |
| --- | --- | --- | --- |
| AsBuffMod | 7,880 | all | delta × 100, signed, `%` |
| AsPercent | 1,791 | all | delta × 100, signed, `%` |
| AsDebuffMod | 28 | all | delta × 100, signed, `%` |
| AsDoubleTimes100 | 71 / 19 | 71 yes / 19 no | `%` labels: delta × 100, signed, `%`; non-`%` labels: unchanged value + **(scale unverified)** |
| AsBuffDelta, AsDebuffDelta, AsInt, AsDouble | 7,974 / 707 / 1,831 / 348 | none | signed delta, unchanged (`Max Health +37`, `Ice Spear Power Cost -3`) |

How strong the evidence is for each type:

- **AsBuffMod: confirmed by player-facing references.** The pinned tiers `power_12192/id_25` = `{MOD_ELECTRICITY_DIRECT}{0.25}{AnimalHandling}`, `{MOD_FIRE}{0.25}{AnimalHandling}` and `power_12194/id_25` = `{MOD_PSYCHIC}{0.23}{AnimalHandling}`, `{MOD_CRUSHING_DIRECT}{0.23}{AnimalHandling}` appear in the customer's GorgonExplorer reference and on [GorgonCodex Animal Handling](https://www.gorgoncodex.com/guides/skills/animalhandling) as +25%/+25% and +23%/+23%. [GorgonCodex Archery](https://www.gorgoncodex.com/guides/skills/archery) also shows the pinned `ArcheryBoost id_12` (`{MOD_SKILL_ARCHERY}{0.6}`) as **Archery Base Damage +60%**, `HeavyShotBoost id_25` (`0.625`) as **+62.5%**, `AimedShotBoost id_25` (`0.6`) as **+60%** and `LongShotBoost id_25` (`0.91`) as **+91%**.
- **AsPercent: confirmed.** The same Archery reference shows the pinned `{DELTA_ANATOMY_CRITICAL_CHANCE}{0.04}` as **Anatomy-Based Critical Hit Chance +4%**.
- **AsDebuffMod and `%`-labelled AsDoubleTimes100: inferred from official structure, not independently confirmed.** AsDebuffMod attributes have the same multiplier encoding as AsBuffMod (`DefaultValue: 1`, `%` label, fractional deltas, e.g. `VULN_NATURE -0.18`). AsDoubleTimes100 names its ×100 display in the type itself, and the converted attributes carry `%` labels (e.g. `ACCURACY_BOOST_RANGED 0.08`, shown as +8%). No third-party page was found that renders these particular tiers. Together they cover 99 of 20,649 template lines.
- Third-party pages corroborate the result only. They are not imported or used as a data source; the conversion rule lives in `src/features/mods/effect-description.ts` and is keyed on the official DisplayType and Label alone.

Conversion uses exact decimal-string shifting rather than floating point (`0.035 → 3.5`, `0.625 → 62.5`, `-0.01 → -1`, `12.5 → 1250`). Signs are kept (`+`/`-`). A test checks that every pinned template formats without `NaN` or raw tokens, and that only `%`-labelled attributes become percentages. Delta/int/double types are never multiplied. Malformed or unknown templates keep the explicit **unformatted official effect** fallback. No stacking, baseline or damage formula is implied, and saved IDs and source strings are never changed.

**Multiple attributes in one tier are one effect.** All template lines of a tier are shown together, comma-separated: **Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25%** and **Psychic Damage (Direct & Per-Tick) +23%, Direct Crushing Damage +23%**. This applies to Available, Selected, item CANDIDATE lines, existing powers and tier details. If some lines in a tier cannot be formatted, the supported lines still show, followed by a single fallback marker.

**The required active skill is a subtle note.** The old `· context: Animal Handling` text is gone. The third argument now appears as **Requires Animal Handling active** in the effect tooltip and as an italic note in expanded tier details. It does not take space in the row.

### 2. Full-width desktop planner

- `.app-shell` is `min(100% − clamp(2rem, 4vw, 4rem), 100rem)`, i.e. 16–32px gutters per side and up to **1600px** (previously 75rem/1200px).
- `.skills-section` and `.equipment-section` are `width: 100%` (previously capped at 52rem/832px).
- Measured in Chromium at 100% zoom: both sections are **1382px at 1440**, **1600px at 1920** and **1600px at 2560**. The Available column grows from about 400px to **672px at 1440**. Skill rows keep their height (70–95px) and control alignment (centers within 2px), with no horizontal overflow. Mobile 320/375px still stacks.
- 80% zoom is checked only as a secondary regression (1800 CSS px at 0.8 DPR): no overflow, and levels still fit.

### 3. Mod effects are no longer clipped

- The single-line `nowrap`/ellipsis rule is removed. Effects in Available, Selected and item CANDIDATE lines wrap naturally, with a **two-line clamp** only for genuinely long effects. Expanding **⋯** removes the clamp, and every effect line has a tooltip with the full plain text plus any required-skill note.
- Selected rows use margins instead of padding around the clamped text, so a third line can never peek through, including on 44px touch rows.
- At 1440px and 100% zoom, the paired +25%/+25% effect is **fully visible without ⋯** in Available, Selected and the item CANDIDATE line (asserted by `scrollHeight ≤ clientHeight` and `scrollWidth ≤ clientWidth` in dev and preview). A geometry check confirms that **+**, **⋯** and **×** never overlap effect text.
- The lists stay dense: 420px panes show **11 complete rows** at 1440px, with one-line rows 30–31px and two-line rows 49px. Only 3 of 255 Animal Handling Available rows needed the clamp. Available and Selected still scroll independently.

### 4. Three-digit skill levels

`.planner-main .skill-level input` is now 5rem wide with reduced horizontal padding (previously 3.5rem with 0.65rem padding). Native number input, validation, spin controls and stored values are unchanged. Chromium checks levels **90, 100, 110 and 125** in both skill slots at 1440, 1920 and 2560px at 100% zoom. Using the input's actual font, each value measures 20–27px against 50.8px of text room after padding and a 16px allowance for spin controls. Both levels persist as 125. `125` also fits at 375px, at 320px (within the viewport) and at 80% zoom.

## Earlier rendering/density corrections (still in place, updated)

A shared presentation-only renderer, `EffectDescription` / `EffectDescriptions`, now serves Available effects, Selected candidates, item CANDIDATE lines, saved existing powers, published tier details and alternative-tier buttons. It creates React text/image nodes; it never parses source text as HTML or uses `dangerouslySetInnerHTML`.

- Exact `<icon=NUMBER>` markers produce **18×18 actual images** through the existing validated versioned official icon route, e.g. `https://cdn.projectgorgon.com/v490/icons/icon_2160.png`. Text before/after icons and multiple icons are preserved. Malformed IDs/versions make no image request; failed images get a labelled local placeholder. Unknown HTML remains inert literal React text. Raw icon markers are absent from ordinary visible rows.
- The pinned official `attributes.json` provides exact attribute IDs, labels and display-type names. `MOD_SKILL_ARCHERY` publishes **Archery Base Damage % / AsBuffMod**; `MOD_ELECTRICITY_DIRECT` publishes **Direct Electricity Damage % / AsBuffMod**; `MAX_HEALTH` publishes **Max Health / AsInt**. The renderer uses the existing runtime repository's exact attribute lookup, never a third-party mapping or a new data source.
- *Superseded by this revision (see section 1 above):* `{MOD_SKILL_ARCHERY}{0.6}` now displays **Archery Base Damage +60%** and `{MAX_HEALTH}{37}` displays **Max Health +37**. The previous unconverted “modifier: 0.6 · source value” and “context:” wording has been removed. Baseline subtraction and damage semantics are still not assumed.
- Missing labels, malformed templates, unknown attributes/skill contexts and hidden attributes get a readable power/effect fallback plus a small **unformatted official effect** indicator. The exact byte-for-byte source is available under **Exact published effect text** in deliberately expanded technical details. No saved or generated strings are rewritten.
- Available rows show the effect (up to two lines; see section 3) and a compact **⋯** action for full text/metadata/other tiers. There is no permanent Details subrow. Selected rows similarly show the effect, **⋯** for inline tier/order/source controls, and a compact **×** remove action. Redundant per-candidate source labels move into details; BASE/EXISTING/CANDIDATE item effects remain distinctly labelled. Unknown-record warnings remain visible.
- Desktop effect text is 13px, icons 18px, and normal row targets are about 30px with thin dividers. Mobile/coarse-pointer effect/details/remove targets remain at least 44px. Full descriptions remain available to assistive technology and through keyboard-operable native details. Clamping changes presentation only, never selection identity.

## Browser proof required by the latest review

The revised Chromium smoke checks actual `img.complete` and **`naturalWidth > 0`** for icon 2160 in Available, Selected, CANDIDATE item lines, existing powers and expanded tier facts, in both Vite dev and production preview. It checks text before/after rendering through component tests, verifies that ordinary row text contains neither raw icon markup nor `{MOD_` templates, and isolates a forced icon-404 case to verify the visible fallback. Only that deliberate case may record resource-404 messages.

*Updated in this revision:* density now prioritizes readability over a fixed 12-row count, as the customer asked. The smoke requires a 400–430px Available pane at least 600px wide, holding **at least 8** complete rows each **at most 50px** (two lines). Measured: 11 rows, 672px wide. It also checks for no raw `{MOD_`, icon markup or “source value” text, the fully visible paired Animal Handling effect in all three surfaces, no control/text overlap and exact saved IDs (`power_12192/id_25`). It also captures real 1440px desktop and 375px mobile screenshots with Animal Handling icons loaded, verifies mobile stacking and no horizontal overflow at 320/375/768px, and exercises keyboard expansion, ordering, scrolling, exact-tier staging, reload and all existing draft/preservation protections.

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

The pinned 45,634 tiers contain 52,039 descriptions: 31,390 prose descriptions and 20,649 numeric templates with matching official attribute labels. Section 1 above records which display types now have evidence-backed player-facing formatting. None of this establishes stacking or effect-calculation semantics.

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

## Files changed in the latest revision (8f6f4a2 review)

- `src/features/mods/effect-description.ts`: evidence-keyed percent/additive presentation, exact decimal shift, required-skill extraction, plain-text summaries.
- `src/features/mods/EffectDescription.tsx`, `effect-description.css`, `PowerFacts.tsx`: comma-joined tier effects, full-text tooltip, “Requires … active” note, “(scale unverified)” flag.
- `src/features/mods/mods.css`: two-line clamp instead of one-line ellipsis; margin-based spacing for clamped Selected rows.
- `src/styles/global.css`, `src/app/planner.css`, `src/features/equipment/equipment.css`: 100rem app shell with responsive gutters; full-width sections; wider skill-level input.
- `src/features/mods/EffectDescription.test.tsx`, `ModPlanner.test.tsx`: conversion, joining, requirement, flat/negative/unverified and whole-dataset tests; App test for paired Animal Handling across Available/Selected/CANDIDATE with exact saved IDs.
- `src/features/mods/mods.smoke.py`, `src/test/planner-layout.smoke.py`: readability/overlap/paired-effect assertions; 1440/1920/2560 width and 90/100/110/125 level checks; 80% zoom secondary check; 320/375 level checks.
- Screenshots: replaced the four existing screenshots and added `paired-animal-handling.png`, `skill-levels-125.png`, `planner-1920.png` and `planner-2560.png`.

## Files changed in the earlier revisions

- `src/data/search/treasure-planning.ts` and its test: source-category grouping, deterministic tier preview/overlaps, mismatch indicator.
- `src/features/mods/{ModPlanner,EquipmentMods,CandidateList,PowerFacts,EffectDescription}.tsx`, `effect-description.ts`, `mods.css` and renderer CSS/tests: inline editor, dense effect rows, direct item-effect output, selected controls and details.
- `src/features/equipment/EquipmentPlanner.tsx`: BASE label and mounting editors only for expanded rows.
- `src/features/skills/SkillPlanner.tsx`, `src/app/planner.css`: remove skill-search UI/state/styles and reclaim its grid column.
- `src/features/mods/ModPlanner.test.tsx`, `src/test/App.test.tsx`: revised actual App workflows and skill-control assertions.
- Equipment component/browser assertions: continue checking absence of duplicated item headers while allowing the new Available/Selected section headings.
- `src/features/mods/mods.smoke.py`, `src/test/planner-layout.smoke.py`: inline/browser/keyboard/mobile workflow and removed-filter regression; layout script now uses the same optional trusted Chromium home as the other smoke scripts.
- This verification report and four replacement screenshots.

## Automated checks

Latest revision: Node 22.23.4 / npm 10.9.9 (within the `engines` range). Passed:

```bash
npm run data:update -- --check
npm run lint
npm run typecheck
npm test
npm run build
git diff --check
XDG_CONFIG_HOME=<scratch>/wrangler npx wrangler deploy --dry-run --outdir <scratch>/wrangler-out
python3 src/features/mods/mods.smoke.py --output <scratch>/mods
python3 src/features/equipment/equipment.smoke.py --output <scratch>/equipment
python3 src/test/vite-transport.smoke.py --output <scratch>/transport
python3 src/test/planner-layout.smoke.py --output <scratch>/layout
```

Latest revision: **486 passing tests across 20 files**. It replaces the obsolete “source value” assertions with 6 new formatting tests (verified percents, flat/negative values, unverified scale, paired joining with the requirement note, mixed supported/unsupported tiers, whole-dataset check) plus a rewritten exact decimal-shift contract test and adds an App test for the paired Animal Handling flow. Python Playwright 1.64.1 was installed locally for the smoke scripts (not a project dependency), driving the preinstalled Chromium 153.0.8010.12.

Previous revision: **481 passing tests across 20 files**. Focused T0010 coverage: **63 tests** — 10 pure search/relevance, 14 source-category/preview cases, 7 immutable editor/persistence tests, 14 App component workflows and 18 new effect-renderer tests. Renderer coverage verifies actual DOM images, multiple icon markers, text before/after, malformed IDs, invalid versions, missing-image recovery, inert untrusted HTML, supported attribute labels, unchanged numeric source values, unknown fallback and exact technical source text. An additional App test checks the same image component across all five required surfaces and confirms the exact staged power/tier identity. The App workflows also verify no write at 499 ms and exact autosave at 500 ms; more than six candidates; exact Max/90/100 effects/tier keys; immediate add/edit/remove effect output; null tiers; preserved ordering/reload; no-skill/A+B/A+A behavior; independent category toggles/all-skills exploration; explicit overlapping alternatives; invalid targets; unknown IDs/base definitions; read-only/protected drafts; and legacy offhand preservation. Existing skill/ability/equipment/autosave/transport tests remain passing.

All 13 pinned raw datasets validate offline. No official-data regeneration was performed. `npm ci --cache /tmp/gorgon-npm-cache` passed for the original PR implementation; dependencies and lockfile are unchanged by this revision. Required localhost/network permission was enabled for the existing transport/browser checks. TLS verification remains enabled; the existing public environment CA is trusted through a temporary Chromium NSS store. The first optional layout run lacked that store and reported icon certificate errors; the updated script uses the same trust setup as the successful dev/preview smoke tests. Wrangler was a dry-run, not a deployment.

## Real-browser verification and screenshots

Latest revision: Chromium 153.0.8010.12 re-ran the full mods workflow below in Vite dev and production preview, plus the new paired-effect, readability and overlap checks, with zero unexpected console errors. The layout smoke covered 1440/1920/2560 at 100% zoom, the 80% zoom secondary check and 320/375 touch. Equipment and transport smokes passed unchanged.

Previous revision: Chromium 154.0.8037.57 exercised Vite dev and production preview at **1440×900** and **375×812**:

1. Equipped Head with no skills: Available empty. Selected Archery/Cow, populated both ability bars, then equipped Ring and canonical OffHandShield.
2. Checked unique skill groups, all three independent visibility toggles and differing profile-aware Archery ordering on different gear.
3. Staged nine candidates using exact displayed Max/90/100 previews; edited a tier, moved by keyboard, removed and cleared a tier. Eight candidates restored in exact order after refresh. Complete build comparison preserved both bars, gear/slots and unrelated fields.
4. Changed A+B to A+A and then no skills: Available updated/emptied while all saved candidates remained visible. Restored the original bars for further preservation checks.
5. Seeded imported powers/metadata, Sparks and an unknown candidate. Another explicit tier edit preserved the entire remaining document. All-skills search found real Psychology/Cow/Unarmed powers; unknown associations remained explicitly unknown in Details.
6. Verified mobile stacking, page/editor no horizontal overflow, native keyboard interactions and focus following moved rows. Inspected the final desktop/mobile captures.
7. Loaded a mismatched snapshot: target inspection remained transient, every candidate mutation control was disabled and saved bytes stayed unchanged after the autosave interval.

Both mod-workflow modes check for zero unexpected console errors/page exceptions; the deliberate icon-404 fallback case is recorded separately. Existing equipment/offhand smoke passed canonical swaps/reloads, legacy conflict preservation/cancel/confirmed resolution, instance-replacement confirmations, candidate/Spark preservation, equipment filter/preferences and picker drag/backdrop/X/Escape behavior. Its deliberate icon-404 fallback recorded only the expected resource message. Transport smoke passed compressed lengths/hashes/headers, corruption/retry and existing skill/ability workflows in both modes. The separate layout regression covers desktop sizes through 2560px, touch at 375/320px, native skill dropdowns, ability search/details and persisted titles.

Artifacts and JSON measurements were written to the session scratch directory (not committed). Measurements are unthrottled local Chromium observations, not guarantees for low-end devices, other engines or live Cloudflare runtime.

![Inline Available and Selected on desktop](screenshots/t0010/inline-desktop.png)

![Stacked inline editor at 375px](screenshots/t0010/inline-mobile.png)

![Paired Animal Handling effects shown in full](screenshots/t0010/paired-animal-handling.png)

![Skill levels 125 fully visible at 100% zoom](screenshots/t0010/skill-levels-125.png)

[Full desktop context (1440)](screenshots/t0010/page-desktop.png) · [Full mobile context](screenshots/t0010/page-mobile.png) · [Planner at 1920](screenshots/t0010/planner-1920.png) · [Planner at 2560](screenshots/t0010/planner-2560.png)

## Customer acceptance checklist

1. Equip gear with no combat skills: Available should prompt for a skill. Existing saved candidates must still show.
2. Select Archery and Cow, then A+A; check distinct/unique group headings. Toggle Generic, Endurance and Shamanic Infusions independently. Inspect the explicit AnySkill/Unknown caveats.
3. Compare item contexts. Use All skills and the inline effect/name/ID search for broader exploration.
4. Check actual inline game icons and player-facing percentages (e.g. select Animal Handling: **Direct Electricity Damage +25%, Fire Damage (Direct & Per-Tick) +25%** visible in full without ⋯; hover for “Requires Animal Handling active”), open ⋯ to read full text/source or edit a tier. Set Max, 90 and 100. Observe changed Available effect values; click one to add exactly that displayed tier. Inspect overlapping alternatives in Details.
5. Add more than six candidates, including duplicates. Check immediate CANDIDATE effect lines separately from BASE and EXISTING. Edit/null a tier, move and remove candidates; check immediate reversal.
6. Change the target again: saved tiers must remain unchanged, with a small preview-difference flag where applicable. Wait for Saved, refresh and verify exact order/IDs/nulls and canonical item slot.
7. Check both ability bars, other equipment, existing imported/manual powers and Sparks. Verify the skill dropdown and levels still work without the magnifier; ability search remains available.
8. Repeat by keyboard and at 375px. Confirm inline columns stack and controls/effects fit without horizontal scrolling.
9. At your normal monitor width and **100% browser zoom**, confirm the planner uses the width (up to 1600px), effects are readable without ⋯, and Skill A/B levels 100, 110 and 125 are fully visible and editable.

## Risks and follow-ups

AnySkill cannot prove a universally eligible Generic category, overlapping tier ranges/rarities do not identify a unique legal tier, and Max cannot prove numeric effect strength. The UI and pure logic keep these limitations explicit. Raw source remains byte-exact. Percent presentation is confirmed by external player-facing references for AsBuffMod and AsPercent. AsDebuffMod (28 lines) and `%`-labelled AsDoubleTimes100 (71 lines) are inferred from official structure and type naming. 19 non-`%` AsDoubleTimes100 lines (mount acceleration) keep unchanged values with an explicit “scale unverified” flag. If the Product Owner finds an in-game display that differs for these less common types, it is a one-line change to the display-type sets. No damage math is added.

No new unrelated issue was implemented. KI-0009 representative-device load/memory monitoring and KI-0010 optional equipment backdrop dismissal remain separate follow-ups. After acceptance/merge, synchronize Tickets, Repo_Current_State, MVP notes and Manual_Verification_Guide with the accepted inline workflow. Architectural re-review and Product Owner acceptance remain pending; do not merge or mark T0010 complete based solely on these checks.
