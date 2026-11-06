# GorgonBuilder — Prompt Context Pack

Use this as a concise context refresher for new ChatGPT/Codex sessions.

## Roles

- Matt: customer/product owner
- ChatGPT: architect/planner/Scrum manager/PR reviewer
- Codex: one-ticket implementation developer

## Product

Project Gorgon build planner inspired functionally by GorgonExplorer, but focused on deeper theorycrafting:

- two skill selectors
- abilities
- real items
- candidate mods
- damage breakdown
- Mastery Sparks
- save/share
- character import/validation
- **post-MVP** A/B comparison (T0017), character/defensive stats (T0016)
- later rotation/DPS, encounter/threat, optimizer

## Critical Math Rule

Skill Base Damage applies to the original ability base only.

Example:

- base 500
- other flat/% scaling reaches 3300
- Skill Base +50% adds only +250
- result 3550

Do not treat Skill Base as multiplying final damage.

## Sparks

Primary offensive Spark slots:

- MainHand
- OffHand
- Ring
- Necklace

Known Skill Damage Spark probabilities:

- 10% +0.50% All Direct Damage
- 40% +1 Skill Damage
- 10% +1 All Direct Damage
- 24% +1% Skill Damage
- 16% +3% Skill Base Damage

Model up to 110 on applicable Mastercrafted/Prophecied items.

## Import

Project Gorgon CharacterSheet + Storage JSON import is feasible.

A current export should be treated as current according to its timestamp; the initial customer sample was simply an older snapshot.

CharacterSheet:
- skills
- levels
- abilities
- CurrentStats

Storage:
- real item instances
- TypeID
- slot/level/rarity
- TSys powers/tiers
- crafting metadata

Do not treat `IsInInventory` as definitive equipped status.

Do not claim individual Spark rolls are imported unless a current report field proves it.

## Workflow

- GitHub is canonical.
- Project Markdown files are mirrors for ChatGPT context.
- One ticket per branch.
- Customer can open a Project chat and say `Start T0001`.
- ChatGPT produces exact Codex handoff.
- Codex reports completion.
- Customer manually verifies.
- ChatGPT reviews PR.
- Merge.
- Update Repo_Current_State.
- Repeat.

## Condensed v1 Ticket Series

T0001–T0021 ends with:

- pinned/normalized official game data including skill advancement tables, dynamic ability data, items, TSys powers, and profiles
- skills/levels/two ability bars/items/mod planner
- per-ability calculator foundation
- Spark simulation
- save/share/edit/delete
- early character-report parsing plus My Items import

**Next MVP sequence:** **T0018 → T0019 → T0020 → T0021** (provider/deployment architecture → secure persistent API → save/share/duplicate UI → release). **No A/B comparison is required for remote build duplication.**

**After T0021 release:** **T0017 A/B Build Comparison** is optional and deferred ([Issue #45](https://github.com/Zaelious/GorgonBuilder/issues/45)); **T0016 Character Statistics and Defensive Calculation Engine** remains last and deferred ([Issue #43](https://github.com/Zaelious/GorgonBuilder/issues/43)), with armor/defensive Sparks and optional CurrentStats reconciliation. Neither is a v1 dependency.

Rotation Simulator is intentionally next-series work after the 21-ticket v1 is stabilized.
