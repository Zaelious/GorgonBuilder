# T0008-F1: corrected CharacterSheet effective level evidence

Use the exported **Level directly** as the effective combat skill level.
`BonusLevels` is already included in that value. Preserve both fields and their
original metadata for inspection; never add the bonus again. Prodigy levels are
separate progression points used to purchase bonuses and do not contribute to
the effective combat skill level.

Customer hands-on verification supplied these non-identifying examples:

| Skill | Export Level | BonusLevels | Correct planner level | Previous incorrect result |
| --- | --- | --- | --- | --- |
| Werewolf | 106 | 6 | 106 | 112 |
| Deer | 112 | 12 | 112 | 124 |
| Cow | 111 | 11 | 111 | 122 |
| Unarmed | 110 | 10 | 110 | 120 |

This customer-verified export behavior supersedes the earlier interpretation of
[Mithril's CharacterSkill.EffectiveLevel](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/src/Mithril.GameReports/CharacterSnapshot.cs).
That third-party model adds Level and BonusLevels; applying its interpretation to
the customer's CharacterSheet double-counted bonuses. Its separate raw-log
Tailoring observation did not establish the semantics of this export's Level.
The previous implementation and documentation were incorrect.

Only an explicit skill change or **Apply imported level** commits this snapshot
number through the existing immutable edit/autosave path. Import/reimport alone
never changes existing selections or manual levels. Previously inflated saved
levels are not automatically migrated; users can apply the imported value per
slot without clearing abilities, equipment, mods, Sparks or other settings.
Same-skill A+A slots remain independently editable.

Absent, unresolved, unchecked, ambiguous, invalid numeric values and mismatched
resolver versions still decline initialization. Source Level and optional bonus
retain safe-integer/nonnegative validation. The parser's atomic rejection of
malformed reports is unchanged. No display-name matching, tier gating, new bonus
subsystem, progression calculation or saved-schema change is introduced.

Regression fixtures reconstruct only the four numeric examples above and
synthetic Prodigy metadata. No private customer reports were read or committed.
