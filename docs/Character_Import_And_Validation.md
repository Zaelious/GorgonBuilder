# GorgonBuilder — Character Import and Validation

**Status:** T0011 parser and T0011-F1/F2/F3 browser import and editable quick-loadout workflow accepted/merged; CurrentStats-only comparison deferred into post-MVP T0016 Character Statistics/Defensive Engine  
**Version:** 1.4  
**Date:** 2026-11-02

## Clarification About Export Freshness

Earlier sample files were older snapshots. Two fresh private real exports have since been reviewed against T0011's known field constraints; the valid `XpNeededForNextLevel: -1` sentinel was incorporated into the parser.

That does not mean CharacterSheet/Storage import is inherently stale.

A newly generated report should be treated as a current snapshot to the extent that Project Gorgon's current report format exposes the relevant data.

Always display/import the report timestamp.

## Supported Report Types

Initial design targets two Project Gorgon JSON report types:

### CharacterSheet

Useful fields observed in supplied data include:

- character name
- server
- most recent area
- timestamp
- report/report version
- race
- skills
- skill levels
- bonus levels
- known abilities
- `CurrentStats`
- other character progression data

### Storage

Useful item-instance fields observed include:

- TypeID
- generated/display name
- level
- slot
- rarity
- TSys powers
- TSys power tiers
- crafted status
- augmented status
- crafter
- attunement
- durability
- transmute information
- CraftPoints where present
- storage vault or `IsInInventory`
- additional optional fields

## Implementation State

- **T0011 (merged):** Pure local CharacterSheet/Storage parser, typed source snapshots, exact resolvable power/tier pairs, optional official v490 adapter, preserved unknowns, separate imbues, and sanitized regression tests. It does not equip any items.
- **T0011-F1 (merged):** Browser-only file selection, searchable/filterable **My Items**, source exact power/tier and imbue inspection, manual equipment selection, schema-v1 selected instance persistence. Synthetic browser flows pass; real customer-export v490 resolution counts still await private hands-on testing. Mastery Spark history is unavailable and is not inferred.
- **T0011-F2 (merged):** Imported treasure powers become editable working-copy pairs. Unified Selected/STATS displays imported and planned powers with matching skill color/grouping. Remove, exact tier change and Restore Imported Mods update effective pairs without mutating historical `metadata.sourceItem`, and preserve other planned mods and Sparks. Unknown originals/imbues remain source evidence, not invented effective modifiers.
- **T0011-F3 (merged):** General My Items browser supports repeated equip/replace/unequip without dismissing the dialog, with accurate exact-imported-instance Equipped state and retained filters/page/scroll; slot-specific pickers retain one-pick-and-close behavior. Matching source report evidence conservatively avoids falsely equating items across changed snapshots; user accepted the deployed interface.
- **T0008-F1 (merged, PR #27):** Customer-verified CharacterSheet `Level` already includes `BonusLevels`; the planner uses `Level` directly and never adds bonus/Prodigy levels again. Deliberate selection initializes an editable level, and **Apply imported level** explicitly repairs an existing slot without clearing abilities, equipment, mods or Sparks. Import/reimport alone leaves the working build unchanged. Source Level/BonusLevels and metadata remain intact. See [semantics and evidence](../src/features/import/skill-levels.md) and [T0008-F1 verification](../src/features/skills/verification/T0008-F1.md).
- **T0016 (post-MVP, moved to end of queue on 2026-11-06):** A build-first Character Statistics and Defensive Calculation Engine, including source-supported armor/defensive Sparks. Imported CurrentStats comparison becomes optional validation, not an MVP dependency.

Independent checks of fresh customer exports against T0011's typed field constraints succeeded after the next-XP sentinel fix. The exact full Node CLI with v490 reference-resolution on the real private files was **not** run; actual resolved/unresolved ID and tier counts remain to be checked through the now-available T0011-F1 UI using private customer files. Never commit original customer reports.

## What Import Can Do

A successful import can:

- create an imported character snapshot
- populate skill levels/known abilities
- create a "My Items" collection from owned item instances
- preserve exact TSys power IDs/tiers
- let users select imported items in the planner
- **post-MVP only:** optionally compare GorgonBuilder's modeled character stats with compatible Project Gorgon `CurrentStats` fields

## What Import Must Not Assume

### `IsInInventory` is not equivalent to equipped

The supplied Storage report contains multiple same-slot items with `IsInInventory: true`.

Therefore GorgonBuilder must not silently identify one as the active equipped item solely from that field.

If a current report format exposes a separate authoritative equipped-state field, the importer may capability-detect and use it. Otherwise the user chooses a loadout from imported items.

A later inference feature may attempt matching against `CurrentStats`, but it must be explicitly labeled as inference, not fact.

### Mastery Spark outcomes

Do not assume individual Spark outcomes are available unless a current report explicitly exposes them.

The observed TSys powers represent normal item treasure powers, not a proven list of all Spark outcomes.

`CraftPoints` may provide useful crafting/Spark-capacity context, but its exact interpretation must be validated before converting it into a definitive Spark count.

## Import UX

Suggested flow:

1. `Import Character`
2. Select CharacterSheet JSON.
3. Select Storage JSON.
4. Show character/server/timestamp summary.
5. Validate report compatibility.
6. Import skills/abilities.
7. Import item instances.
8. Present `My Items` as an item-browser source.
9. User chooses active planner gear.
10. User enters or simulates Sparks as needed.

## Optional Post-MVP CurrentStats Validation (T0016)

The primary future T0016 UI displays **the selected GorgonBuilder build's** source-supported character/defensive stats without needing an import. An optional snapshot comparison can map supported CurrentStats keys to equivalent modeled stats. A Storage item being in inventory does not mean the character wore it when exported; missing bases/buffs/conditions prevent honest direct deltas.

Display:

```text
Stat                     PG Export     GorgonBuilder     Delta
All Direct Damage        146           146               0
...
```

Unknown/unmapped fields remain visible as unsupported rather than discarded.

## Formula Validation Workflow

Recommended real-world test:

1. Generate current CharacterSheet/Storage reports.
2. Build/import the relevant setup.
3. Record in-game ability values.
4. Change one controlled item/mod.
5. Export again if aggregate stat validation is needed.
6. Compare Project Gorgon delta with GorgonBuilder delta.
7. Add a regression fixture when the mechanic is understood.

Initial test families:

- Psychology / Deer
- Cow / Unarmed

## Test Fixture Privacy

The customer's real CharacterSheet/Storage exports must not be committed to the public repository. Automated tests should use sanitized/minimal fixtures that preserve the report structure and representative field behavior without retaining personal character data.

## Privacy

Character files should be parsed locally in the browser.

Do not send the raw reports to the build-sharing backend by default.

Only the planner state the user intentionally saves should be persisted remotely.

## Forward Compatibility

Store:

- report version
- export timestamp
- raw unknown optional fields when useful

If a future report adds fields, parsing should tolerate them when safe.

If required fields or report semantics change, show a clear incompatibility message instead of silently mis-parsing the data.
