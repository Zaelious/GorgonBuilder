# UI Visual Identity and Redesign — T0022

**Status:** Product-owner approved design direction (2026-11-02); implementation not started
**Priority:** Schedule before T0013 if approved; this is an intentionally out-of-sequence presentation ticket, not a renumbering of the agreed T0001–T0021 backlog.
**Authoritative visual direction (two distinct references):** (1) **Layout and UI behavior:** the **first** ChatGPT-generated mockup, `GorgonBuilder_Approved_UI_Concept.png` (2026-11-02), for compact charcoal panels, blue/amber skill accents, equipment rows, header hierarchy and a **floating, vertically stacked** Acid Arrow hover card. (2) **Final artwork:** the later **ancient Greek mosaic** concept chosen by the product owner, delivered as the separate assets `mosaic_medusa_with_serpent_crown.png` (transparent Gorgon bust) and `moonlit_gorgon_mosaic_ruins.png` (panoramic mosaic Greek ruins). **Supply all three reference images to Codex; images are conversation handoff attachments, not yet checked in to this planning PR.** Mosaic assets **supersede** the first mockup's grayscale/marble illustration and all earlier green/purple/stone concepts; they do **not** supersede its UI composition.

## Intent and precedent

The concept image is a **style and composition reference, not a literal snapshot of available features**. Preserve all real UI operations, warnings, all nine primary equipment slots plus secondary slots, My Items, mod browsing, import, clear/rename, independent six-slot skill bars, read-only/protected drafts, current local autosave, focus controls and technical details. Do not reduce content to the three example equipment rows; do not invent features such as a third combat skill or remote save. Desktop-first editing, smaller-screen usability, official icon content and truthful game data remain paramount.

## Deliverable A — Brand imagery and header

- **Use the two supplied original Greek-mosaic images**, not newly generated replacements: `mosaic_medusa_with_serpent_crown.png` (Gorgon bust, transparent background) and `moonlit_gorgon_mosaic_ruins.png` (wide mosaic ruins/banner). Preserve the tessellated stone, antique bronze/gold highlights, restrained green eye accents and cool black/slate shadows. Optimize/re-encode locally to appropriate web formats in `public/branding/` while preserving a visually faithful result, source attribution, transparency and responsive crop. No cropped UI screenshots, hotlinked assets, unrelated stock art, emoji substitute or generic placeholders. If files have not been attached to the Codex task, **stop and request the two named assets** rather than silently regenerating them. Avoid overlapping duplicate Gorgon faces when the logo and banner are displayed near each other.
- Recreate the first concept's banner/header hierarchy: modest-height cinematic **mosaic** background on top, supplied Greek mosaic Gorgon head and “Gorgon Builder” wordmark clearly visible over it, a muted “Build Planner” label, dark overlay/gradient for readability, then the existing editable build title and real Import Character, save status and Clear build actions. Use the banner's ruins/moon as background without duplicating the logo bust awkwardly.
- Match the reference's prominent green **Save** affordance without claiming cloud save. If added as an explicit button, wire it to the **existing local draft autosave flush/retry path**, honor protected/read-only state, reflect real storage success/failure, and retain the current autosave mechanism. Remote save/share is out of scope. Do not place an inert button.
- Handle missing/slow artwork gracefully; ensure optimized sizing, resolution, safe crop, and accessibility (decorative banner hidden from screen readers, meaningful accessible wordmark).

## Deliverable B — Unified dark application styling

- Rework existing design tokens in `src/styles/global.css` and associated feature CSS. Primary palette: page `#0f0f0f`, panel `#1a1a1a`, inputs `#141414`, empty slots `#222222`, borders `#2a2a2a` / `#333333`, primary text `#f2f2f2`, secondary `#9a9a9a`, readable muted `#858585`. Remove existing green-tinted surfaces and serif headings. Use Inter if available with `system-ui` fallback; avoid adding font packages or external runtime dependencies merely for styling.
- Accent blue `#3b82f6` for first skill; amber `#eab308` for second skill; green `#22c55e` for positive/mod actions; red `#ef4444` for destructive actions. Damage-type colors remain reserved for actual damage values. Do not hardcode tooltip examples into game data.
- Typography roughly 22px build title, 17px section heads, 15px body and 13px secondary text; weights mostly 400/600. Inputs roughly 38px high, buttons 36px, border radii 6–8px, consistent focus rings and adequate contrast.
- Keep **bronze/gold limited to the mosaic artwork** and, sparingly, its immediate header framing; do not turn form controls/panels gold or override blue (Skill 1), amber (Skill 2), green (positive/mods) and red (remove) accents. Use crisp thin borders and modest shadows only for floating layers; use subtle density improvements, not excessive nested cards or ambient glows. Restyle **all currently reachable** dialogs, mod browser settings, imported My Items views, equipment expanded details, notices and errors to match — not just the screenshot's visible three panels.

## Deliverable C — Planner composition

- Preserve exactly two skill selectors, their independent level controls and six bar positions, current ability browser/rank picker and existing empty/equipped states. Add slim blue/amber skill guides, clean 52px-ish filled-empty tiles (responsive equivalent where needed), uncluttered empty-slot visuals, green + picker affordances; preserve per-slot accessible names and real click/keyboard behavior.
- Use official ability icons for equipped entries and existing equipment item icons when available; do not replace live data with the concept's illustrative glyphs. Compact percent/mod bonus labels below equipped slots are allowed **only when grounded in existing reliable data**; never hardcode example `+88%` or `+110%` or invent a new formula. If existing semantics cannot support a truthful numeric label yet, omit/defer that label rather than mislead.
- Equipment rows should show an icon, a primary slot label, a secondary item name / “No gear selected”, a restrained trailing affordance, and subtle separators. Keep full present-day functionality: 9 primary rows, extra slots, occupied/equip/replace/unequip, expanded STATS, Available/Selected mods, shared search, Mod Browser Settings, How mod filtering works and My Items.
- Align layouts and spacing with the reference without removing existing actions, tooltips or warnings.

## Deliverable D — Interactive ability hover inspector

- Re-style the **existing** ability hover/focus/click popover, not a permanent dashboard column or pinned sidebar. It already opens on hover and supports click/focus; maintain those interaction rules (including hover handoff, 150ms-close intent, Escape/focus return, viewport flipping/positioning, max-height internal scroll and touch/keyboard access).
- Floating panel ~420–460px desktop width, `#1a1a1a` background, quiet 1px border and shadow. Top: official 40px-ish ability icon, 18px/600 name, accessible close icon. Then description, **one single-column vertical list** with `Label: Value` on successive lines, grouped by thin dividers: Damage, Armor damage, Power cost, Reuse time, Range, Min level plus any other actual facts/effects and warnings. Color actual Acid damage value using its damage-type color.
- “Relevant mods” should be a simple green-heading list with actual effect text and muted source labels. Remove the blue nested callout. Keep Technical details and Edit bar as genuine working disclosures and remove/move/replace actions intact; make Remove a subtle red-text action. Never hide unsupported-effects/confidence warnings, original technical records or conditional effects behind deceptive presentation.

## Responsive and accessibility requirements

- Test desktop 1440×900, 1920×1080 and mobile 375×812 / 320×812; no horizontal viewport overflow, unintended occlusion, clipped actionable controls or inaccessible popovers.
- Prefer original compact working 44px touch targets on coarse pointers even if desktop dimensions are smaller. Respect keyboard tab order, visible focus, reduced-motion preferences, non-hover operation and sensible contrast.
- Banner/portrait must degrade well on narrow screens; prioritize legibility and controls over decorative image crop. Do not allow the banner to grow so tall that it buries the editor.

## Change boundaries and review

**Expected edit areas:** `public/branding/`, `src/styles/`, `src/app/`, presentation-level CSS/TSX in `src/features/{skills,abilities,equipment,mods,import}/`, and closely related tests / browser smoke scripts and verification notes. Preserve established imported item behavior, BuildDocument v1, normalized data, game formulas, eligibility, Sparks, persistence internals and dependencies.

**Checks:** `npm run data:update -- --check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `git diff --check`, desktop and narrow-screen real-browser checks. Review the actual screenshot comparison at main desktop size and expanded mod/gear dialogs and error states. Verify title rename, import, local Save/autosave/retry, Clear confirmation, skill levels and picker, hover/focus/click popover, Technical details, Edit bar, Remove, My Items, shared mod filtering and refresh persistence.

**Review gate:** The product owner selected the supplied mosaic artwork direction; require actual in-app screenshots confirming it works with the header and customer approval before implementation merge. Report exact art assets, changed files, tests/build, before/after screenshots, manual steps and any gaps. One implementation ticket and one feature PR; do not automatically begin T0013.
