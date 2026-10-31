# T0008 — Skill and Ability Planner UI

This implementation includes the customer's [UX revision on PR #12](https://github.com/Zaelious/GorgonBuilder/pull/12#pullrequestreview-5725377907).
The feature stays on `feature/t0008-skill-ability-planner`; customer hands-on
acceptance is required before merge. T0009 has not started.

## Planner behavior

Skills & Abilities is a compact section containing two horizontal skill rows.
Each row retains its own combat-skill selector/filter, editable level and six
ordered icon slots. Empty slots and the + control open that bar's native modal
ability picker. No large ability list is displayed on the main page. Mobile
stacks each skill's settings above its six slots, with the + control in the bar
heading to preserve usable touch targets.

The searchable picker shows official `UpgradeOf` families, their icons and tier
counts. Native disclosure rows reveal exact official tiers, descriptions and
published base values. Quick-add chooses the **highest published Level**, breaking
ties by the **lexicographically smallest canonical ability ID**. It never uses
names or Rank to invent progression, and never silently lowers a selection to
the configured skill level. Selecting a lower tier explicitly stores that exact
record ID and its published string/number/null Rank.

New additions append to the next open position, up to six. Full bars show an
explanation; replacement, removal and reordering remain available. Old drafts
with more than six entries are **retained in full**, visibly marked as overfull,
and can be reviewed and reduced explicitly. BuildDocument v1 remains unchanged;
capacity is an editor rule, not a destructive schema-validation change.

Hover, focus or click an equipped icon to open its interactive detail popover.
It shows the selected rank, official description/level, published base power
cost, reuse time, range, damage/type, health/armor-specific values when supplied,
SpecialInfo prose and embedded special values/DoTs. These are source values,
without equipment/modifier calculations or inferred combat semantics. Controls
support remove, replace, move earlier/later, close and Escape. Native popovers
associate their invoker for keyboard navigation; native dialogs trap focus and
return it when closed. Missing IDs, incompatible skills, changed ranks and
above-level selections remain marked and inspectable, without substitution.

Changing or clearing one skill retains that bar's selections for review and
does not change the other slot. Blank, different and duplicate skills still keep
independent levels and bars. Searches, disclosures, picker state and popovers
remain transient.

## Persistence and recovery

`App.tsx` reuses `loadGameDataRepository()`, `createLocalPersistence()` and
`createDraftAutosave()` unchanged. Committed edits schedule the existing 500 ms
debounce; pagehide, hidden visibility and unmount flush pending work. Failed
writes retain work for retry. Initial render and transient interaction never
schedule a draft write.

Malformed drafts show explicit recovery before any edit replaces invalid bytes.
Future-schema and unreadable drafts disable editing to prevent overwrite. Restore
storage access and reload to recover an unreadable draft. Saved game-data
versions are retained; an unavailable original snapshot is shown read-only.
Equipment, target, title/notes, import metadata, mods and Sparks remain intact.

## Minimal official display-data extension

The review explicitly permits additive icon mapping. Inspection of the verified
v490 raw `abilities.json` found **5,972 exact `IconID` values**, all nonnegative
integers, and **2,029 optional `SpecialInfo` strings**. Normalization now exposes
`iconId` and `specialInfo` as display facts, with null for omitted fields and
strict rejection of malformed published icon identifiers. No IDs, ranks,
relationships, formulas or previously normalized values are changed.

The pinned official `index.html` documents `/v{version}/icons/icon_{id}.png`.
`AbilityIcon.tsx` combines only that version and the published IconID; it does
not infer icon identity from names, families or keywords. For example,
`ability_1201` has IconID 2118, and the matching v490 URL returns a 64×64 PNG.
Missing/unavailable icons show a visible neutral fallback. The footer carries
“Some portions copyright 2026 Elder Game, LLC.”

Only `abilities.json.gz` and its integrity entry in `manifest.json` changed on
regeneration. All raw sources, counts, diagnostic identities and unrelated
artifacts remain unchanged. The ability artifact is now **566,143 compressed
bytes / 16,214,378 decoded JSON bytes**. SHA-256/byte checks remain enforced.
Focused pipeline tests compare every runtime icon/text field against the pin;
the existing tests verify deterministic regeneration and committed asset hashes.

## Changed areas

- `src/app/App.tsx`, `planner.css`: compact section, responsive layout and credit.
- `src/app/editor/build-editor.ts` and tests: six-addition limit, replacement,
  retained legacy overflow and deterministic tier selection checks.
- `src/features/skills/SkillPlanner.tsx`: compact independent selectors/levels.
- `src/features/abilities/AbilityPlanner.tsx`: icon bars and interactive popovers.
- `AbilityPicker.tsx`, `AbilityFacts.tsx`, `AbilityIcon.tsx`, `groups.ts`: searchable
  modal, published facts, official icon mapping/fallback and highest-tier default.
- `src/test/App.test.tsx`: existing acceptance/recovery tests adapted to the
  compact workflow, plus focused picker, icon, detail and capacity checks.
- `src/data/normalized/abilities.ts`, `src/data/adapters/normalize-abilities.ts`
  and focused tests, `scripts/generate-data.test.ts`: additive official display
  facts and source-to-runtime verification.
- `src/generated/game-data/abilities.json.gz`, `manifest.json`: regenerated data.
- This README: current implementation, verification and follow-up handoff.

## Verification

Node 24.19.0, existing dependencies and test infrastructure; no package changes.

- `npm run data:update -- --check` — passed; official v490 pin intact.
- `npm run data:generate` — passed, retaining 1,546 ability and 96 item/treasure
  diagnostics. Full tests verify repeated byte-identical generation.
- `npm run lint` — passed with no warnings.
- `npm run typecheck` — passed for both strict TypeScript projects.
- `npm test` — **335 tests across 11 files passed** (322 previously).
- Focused editor/UI tests — **40 passed**; additive normalizer and pipeline tests
  also pass in the full suite.
- `npm run build` and `git diff --check` — passed.
- Wrangler dry-run and final-head CI/Cloudflare preview status are recorded in
  the PR's updated completion report after pushing the feature branch.

### Browser and customer usability check

The final Chromium smoke pass on the production bundle passed the workflows
below, including real 64×64 official CDN icons, native focus traversal into detail
actions, bounded modal Tab traversal, replacement/reordering without covering
neighboring slots, and a single active detail panel across bars. Desktop
1440×900 and mobile 375×812 were checked; mobile slots were at least 44 px wide,
pickers/popovers stayed within the viewport, and there was no horizontal overflow
or unexpected console/page error. Full, lower-tier, duplicate-skill, refresh and
legacy-overflow workflows passed. The latest local load observation was about
2.5 seconds while other verification was running; it is not a performance target.

Use the feature-branch Cloudflare preview linked on PR #12 for the customer
check. Local Chromium tests use the production bundle through a static server
or Cloudflare Workers local assets; the Vite transport issue below remains
separate. Screenshots are saved as local review artifacts during the run.

Verify Psychology/Deer, Cow/Unarmed, A-only and Psychology/Psychology; independent
levels/bars; picker closed by default, searching, family expansion and exact
lower-tier selection; highest-level quick-add with level warnings; real icons
and fallback; hover/focus/click details and touch; modal Tab containment,
Escape/close and focus return; six-slot full feedback, replacement/removal/
reordering; refresh restoration; retained legacy overflow; and desktop/mobile
layouts without horizontal overflow. Battle Chemistry is a useful explicit Rank
example: `ability_1708` preserves the publisher's string Rank `"2"`.

## Risks and follow-ups

- The existing **Vite gzip transport issue remains separate**, as requested by
  the architect: `npm run dev` and `vite preview` serve gzip assets using
  Content-Encoding gzip, so fetch decompresses before T0006's compressed-byte
  checks. Use Cloudflare Workers local assets or a static server for this
  ticket's browser verification. Fix normal dev/preview before T0009 while
  retaining integrity checking; no loader/hosting workaround is included here.
- Icons load from the versioned official CDN and have explicit failure fallbacks.
  Network/cache availability affects display; it never changes saved selections.
- Only the current bundled data snapshot is available; no historical-snapshot
  loader or implicit build migration is added.
- T0006 still loads the complete repository. The original local measurements were
  about 1.7–1.8 seconds preparation and 195–239 MB JS heap; these are unthrottled
  desktop observations, not guarantees for low-memory/mobile devices.
- Sandbox networking may prevent fetching the public Workers preview directly.
  Cloudflare's bot comment/checks establish deployment; the customer's preview
  visit remains the final usability and remote-runtime acceptance check.

After merge, synchronize `Repo_Current_State.md`, `Tickets.md`,
`Manual_Verification_Guide.md`, `MVP_Technical_Design.md`,
`Build_Save_And_Share_Design.md` and `Known_Issues_And_Followups.md` in the planned
documentation-only follow-up. Include the revised UX, additive display facts,
Vite follow-up and measured runtime cost. No equipment, mods, management,
remote saving or later-ticket controls are introduced.
