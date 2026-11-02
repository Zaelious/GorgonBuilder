# T0008-F1: CharacterSheet effective level evidence

The planner uses `Level + (BonusLevels ?? 0)` once, directly from the immutable
parsed snapshot. It never adds a snapshot bonus to an existing planner level.
Raw `level`, `bonusLevels` and original skill metadata remain untouched in the
browser import session. Only the initialized single effective number enters the
existing schema-v1 skill slot and autosave. Snapshot bonuses are historical;
changing equipment does not recalculate them in this ticket.

Evidence inspected at pinned Mithril commit
`0d1415ffcef4f5db8d3f038615b3d5a431abe976`:

- [CharacterReportLoader.cs](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/src/Mithril.GameReports/CharacterReportLoader.cs)
  copies exported `v.Level ?? 0` and `v.BonusLevels ?? 0` separately into
  `CharacterSkill`; it does not subtract a bonus from Level. Omitted bonus is zero.
- [CharacterSnapshot.cs](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/src/Mithril.GameReports/CharacterSnapshot.cs)
  documents Level as the progression track and explicitly implements
  `EffectiveLevel => Level + BonusLevels` as the level shown in game.
- [player-skill-state-service.md](https://github.com/moumantai-gg/mithril/blob/0d1415ffcef4f5db8d3f038615b3d5a431abe976/docs/player-skill-state-service.md#live-level-up-capture-verification-resolved)
  corroborates the interpretation with a captured Tailoring event: raw=10,
  bonus=2, and game chat “reached level 12”. Its progression-only consumers
  intentionally keep the values separate; this planner stores an effective
  planning number rather than implementing XP progression.

These are inspectable secondary export-model and observation evidence, not a new
canonical game-data source or direct observation of the customer's current
export. Current-export/in-game total comparison remains customer acceptance work.
No private report has been read or committed for this implementation.

Absent, unresolved, unchecked, ambiguous, invalid/unsafe numeric values and
mismatched resolver versions return no initialization. A deliberate skill change
then retains the manual level and displays that limitation. The existing parser
atomically rejects malformed reports; replacing an import never edits a build.
There is no guessed display-name matching, level cap, tier gating, or ongoing
bonus-level subsystem. Noncombat skills have no planner-effective value here.

Regression examples: 90+5=95, 10+2=12 (neither 10 nor 14), 90+0=90,
90 with omitted BonusLevels=90; repeated selection after switching away reads the
original snapshot again and stays 95, rather than becoming 100. Same-skill A+A
slots receive independent editable numbers. Tests also cover invalid values,
manual overrides, report replacement, autosave reload, skill cleanup/Undo,
protected drafts, and external level-input synchronization.
