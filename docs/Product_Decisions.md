# GorgonBuilder — Product Decisions

**Status:** Product-owner approved account/community MVP expansion, 2026-11-06  
**Version:** 2.0  
**Date:** 2026-11-06

## Product Goal

GorgonBuilder is a Project Gorgon build planner focused on answering both:

1. **What can I put in this build?**
2. **What does that choice actually do to the build?**

It should retain the approachable two-skill/gear/mod planning model of tools such as GorgonExplorer while adding transparent damage calculations, Mastery Spark modeling, browser-local character import, account-owned permanent builds, privacy controls and public build discovery. **A/B build comparison is optional post-MVP (T0017)**; complete character/defensive statistics (T0016), stateful rotation/DPS, survivability, threat and optimization are also later work.

## Core Build Model

A build may contain:

- Skill slot A with a selected skill level
- Skill slot B with a selected skill level
- One skill only, two different skills, or the same skill in both selectors
- Independent ability bar A and ability bar B with exact ability/rank selections
- Real Project Gorgon items
- Candidate treasure mods
- Mastery Spark configuration
- Target/dummy settings
- Saved rotation profiles later

Selecting the same combat skill in both skill slots must not double-apply skill-wide advancement/progression bonuses.

**Product-owner clarification (2026-11-02):** A character cannot have two effective levels of the same skill in Project Gorgon. When both planner slots select the same skill, they must share one consistent effective level while maintaining two independent ability bars. The current editor still permits conflicting saved levels; T0012 flags that legacy/inconsistent case and omits advancement contributions rather than picking one. Implement a scoped editor correction to synchronize levels on new edits and safely handle existing conflicting drafts. Bonuses associated with other skills (such as Necromancy/Priest) may appear on ordinary equipped items; retain the source effects, but do not apply inactive-skill-scoped bonuses to unrelated ability damage.

The planner intentionally does **not** need to police the final number of treasure mods while planning. A user may add many candidate mods and remove the unwanted ones while comparing outcomes.

## Item Selection

Users select real items from the official Project Gorgon item database.

Initial item-browser requirements:

- Global minimum-level filter
- Primary/default use case: **level 90+**
- Search by item name
- Search by normalized effect/stat text
- Search terms such as `lightning`, `psychic`, `taunt`, `kick`, and `combat refresh` should find relevant gear
- Filter by equipment slot
- No upper-level filter required initially

## Per-Ability Damage

Per-ability damage is the primary trustworthy performance metric.

The UI should eventually show:

- Normal-hit damage
- Critical-hit damage where applicable
- Expandable formula breakdown
- Confidence/validation state
- Later expected damage using critical probability

## Confirmed Skill Base Damage Behavior

Skill Base Damage references only an ability's original base damage.

Example:

- Original base damage: 500
- Four `+150 damage` effects: +600
- Two `+100% damage` effects produce 3300 before Skill Base contribution
- `+50% Skill Base Damage` contributes only `500 × 0.50 = 250`
- Example final value: 3550

Skill Base Damage does **not** multiply the already-scaled 3300.

## Mastery Sparks

Primary offensive Spark slots:

- MainHand
- OffHand
- Ring
- Necklace / Amulet

Mastercrafted/Prophecied items can be planned up to 110 Sparks.

Each eligible item should support:

- No Sparks
- Simulate Sparks
- Enter Actual Results

Known Skill Damage Spark probability model:

- 10%: `+0.50% All Direct Damage`
- 40%: `+1 [Skill] Damage`
- 10%: `+1 All Direct Damage`
- 24%: `+1% [Skill] Damage`
- 16%: `+3% [Skill] Base Damage`

**Implemented and customer-accepted 2026-11-06:** T0015 ([PR #42](https://github.com/Zaelious/GorgonBuilder/pull/42), `ff9745a`) supports reproducible per-item seeded simulations, reroll, separately calculated analytical expectations, manual Actual outcome counts, persistence and direct ability-damage integration. Sparks are item-owned and cleared when replacing the item; staged candidate treasure mods remain. The planner requires the configured Spark skill to be active for all five outcomes, including All Direct (an explicit unvalidated applicability assumption). Mastery Sparks appears above the treasure-mod editor with a clearly visible collapsed summary. Percentile/luck context and broader Spark validation remain future work.

## DPS / Rotation

GorgonBuilder must not pretend one fixed rotation represents every build.

Per-ability damage is independent of rotation.

A later **Rotation Simulator** will allow multiple named profiles per build, such as:

- Single Target Sustained
- Single Target Burst
- 5-Target AoE
- Boss Opener
- Threat/Defensive Rotation

The first rotation implementation should support explicit sequences and state tracking. A later phase should support priority rules such as "use X if buff Y is missing."

Rotation outputs should eventually include:

- DPS including setup
- Post-setup/burst DPS
- Sustained DPS over configurable duration
- Total damage
- Damage per target
- Total AoE damage
- Ability-use counts
- Damage contribution by ability
- Buff/debuff uptime where modeled

The Rotation Simulator is intentionally planned **after** the core damage engine is validated.

## Target Dummy

Initial calculations use a customizable dummy, not a full monster database.

Planned controls include:

- Enemy count
- Damage-type vulnerability/resistance
- Armor/mitigation when modeled
- Other properties required by specific abilities

Initial enemy-count UI may use 1–20 targets.

AoE abilities show both:

- Damage per target
- Total damage across configured targets

## Buff Scope

Initial damage-calculator scope:

- Skills
- Abilities
- Gear
- Treasure mods
- Mastery Sparks

Later systems, in approximate order:

1. Ability/self-buffs and target debuffs
2. Conditional gear effects/procs
3. Food/drink
4. Meditation
5. Potions/consumables
6. External/party buffs

## Character Import

Manual planning remains the primary workflow.

Character import is a planned convenience **and validation** feature.

Project Gorgon CharacterSheet/Storage exports are snapshots. An export is as current as its timestamp. An older example export does not imply the import mechanism is outdated; a newly generated export should reflect the current character state supported by the game's report format.

Import uses include:

- Load character skill levels and known abilities
- Load owned/imported item instances and their TSys powers
- Seed manual planning
- **Post-MVP T0016 (optional):** compare compatible Project Gorgon `CurrentStats` with modeled planned-build values where equivalence is supported
- Create repeatable formula-validation cases

Important limitations established from the supplied reports:

- `IsInInventory` identifies carried inventory, not reliable equipped status
- The user may need to select the active gear set from imported owned items
- Existing exports expose item-instance TSys powers and tiers
- Individual Mastery Spark outcome distribution is not assumed importable unless a current report explicitly contains it

Initial validation builds:

- Deer / Psychology
- Cow / Unarmed

## Saving, Accounts, Profiles and Public Build Discovery — MVP (Revised 2026-11-06)

Cloudflare Workers + D1 is the approved backend. The previous **anonymous edit-token / management recovery link** design was *planned but not implemented* and is superseded. Use **account-based ownership** for permanent saved builds; guests may plan and browser-autosave locally, browse Public and view Unlisted links without login. Signing in is required to save permanently, manage a personal build library and copy a shared build into one's account.

- Register/login using a supported D1-compatible auth library and accessible social OAuth (recommended Discord + Google), with secure cookie sessions and a unique public GorgonBuilder username. Do not custom-build password authentication without approved email verification/reset delivery.
- Stable `ownerUserId` drives authorization; no secret editable owner token stored in BuildDocument, public share URLs or UI.
- Every saved build defaults **Private**. Users may explicitly mark it **Unlisted** (guest-readable by link, not indexed) or **Public** (guest-readable by link and discoverable by text/skill/author search).
- Public profiles and Search Builds display **Public only**; logged-in My Builds displays all own visibility states with sorting/skill filtering. No email or private provider identifiers on public profiles.
- Save/update/delete permitted only to authenticated owner; copying a viewable Public/Unlisted build creates a new independent **Private** owned build. This is not A/B comparison.
- Default build title derives from the two selected canonical combat skills (`Deer/Psychology`, `Cow/Unarmed`); a user's manually customized name is never overwritten.
- Search Builds matches public title, public description and author; select up to 2 combat skills; **Match both skills** selects AND when on, OR when off, in either skill-slot order. Text + skills combine by AND.
- Sidebar navigation: Home, Build Planner, Search Builds, and signed-in My Builds/Profile.
- Preserve `BuildDocument` v1, existing local drafts, and private local CharacterSheet/Storage imports. Public description is controlled listing metadata, not automatically all personal notes.
- Security includes server-side ACL, session/CSRF validation, abuse safeguards, database backups and privacy/revocation tests before launch.

**MVP queue:** T0018 D1/auth architecture → T0019 accounts and owner-bound persistence API → T0020 account/library/save/share/profile UI → T0020-F1 public discovery/search/author pages → T0021 release. Deferred post-MVP: T0017 A/B and T0016 character/defensive calculations. See [build/save/share contract](Build_Save_And_Share_Design.md) and [tickets](Tickets.md).

## Build Comparison

**Product-owner priority update 2026-11-06:** A/B comparison (T0017) is **deferred post-MVP**, not a requirement for share/fork, launch or rotation planning. Its incremental value versus simply editing a build or using future automatic optimization should be reassessed before starting. The following is the retained possible future scope:

Side-by-side comparison should eventually show:

- Skills and abilities
- Ability damage
- Crit damage
- Calculation breakdown
- Offensive stats
- Spark contribution
- Later rotation results
- Later survivability/threat results

The comparison should explain **why** a number changed, not merely show a final percentage.

## Defensive / Threat Planning

Damage is the first calculation focus, but architecture must allow later:

- Health
- Armor
- Damage-type mitigation
- Direct/indirect mitigation
- Evasion
- Healing received
- Combat refresh
- Taunt/threat
- Effective survivability

Real player builds will be used to validate practical "enough tankiness" and threat thresholds.

## Automated Optimization

Later goals include searches such as:

- Highest damage Psychology build above level 90
- Best offensive MainHand/OffHand/Ring/Necklace combination
- Best expected Spark distribution
- Best single-target or AoE setup
- Highest damage subject to minimum defensive constraints

Optimization must call the same calculation engine used by manual planning.

## UI Direction

Use GorgonExplorer as a functional reference, not a visual clone.

Priorities:

- Dense but readable desktop planner
- Fast skill/item/mod search
- Real item selection
- Clear gear slots
- Clear ability bars
- Expandable math
- Easy A/B comparison **if T0017 is revived post-MVP**
- Integrated Spark modeling

Desktop-first full editing is acceptable initially. Shared/read-only builds should remain reasonably usable on smaller screens.

## Approved Visual Identity Direction (2026-11-02)

- Product owner selected the **first** generated GorgonBuilder UI mockup for **UI composition**: dark charcoal backgrounds without the previous green cast, coherent sans-serif typography, blue/amber skill accents, slim stacked equipment rows and a **vertically arranged floating** ability hover inspector. **Artwork was subsequently refined** to the user's selected **ancient Greek mosaic** direction: use the supplied `mosaic_medusa_with_serpent_crown.png` bust and `moonlit_gorgon_mosaic_ruins.png` banner instead of the mockup's grayscale marble images. Their bronze/gold tones belong predominantly to the artwork, not interactive controls.
- Preserve “Simple by Default, Detailed on Demand.” The concept image represents styling, not authorization to omit existing equipment, mod, My Items, import, warnings or editor functionality.
- Require the two separate provided original mosaic assets attached to Codex and optimized into local site files; do not regenerate or crop the UI mockup. Do not invent game-data bonuses to match illustrative numbers.
- T0022 is the proposed single cohesive implementation ticket, scheduled before T0013 if approved. See [UI_Visual_Redesign.md](UI_Visual_Redesign.md).

## Working Product Name

- Repository: `GorgonBuilder`
- Display name: `Gorgon Builder`

Rebranding later must not require architecture changes.
