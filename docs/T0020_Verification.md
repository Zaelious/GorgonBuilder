# T0020 — Accounts, My Builds and Save/Share Experience

Date: 2026-11-07. Issue: [#49](https://github.com/Zaelious/GorgonBuilder/issues/49) (including the 2026-11-07 product-owner kickoff update). Branch: `feature/t0020-accounts-save-share-ui`, based on `main` at `e607a29` (T0019, PR #53).

**Status: implemented, awaiting owner review. Not merged, not deployed.** T0020-F1 (Search Builds) was not started.

## What the owner gets

| Area | Behaviour |
|---|---|
| Backend detection | On load the app calls `GET /api/auth/get-session`. Only a JSON answer from a configured deployment turns accounts on. Production, PR previews and plain Vite get `503 not_configured` / HTML / a network error, so **no navigation bar, Sign in, Save build or My Builds controls appear** there and the planner is exactly as before (local **Save**, "Local draft only"). A configured deployment that fails (`503 unavailable`) shows a small "Accounts offline · Retry" button and planning continues. |
| Navigation | A thin bar under the header: **Planner**, **My Builds**, **Profile** (signed in) and the account control (Sign in / username menu with Profile, My Builds, Sign out). The planner layout below is unchanged. There is no separate Home page; Planner is the home page. Search Builds is not shown until T0020-F1. |
| Sign in | Dialog with **Continue with Discord** / **Continue with Google**. The local draft is written to the browser before leaving for the provider; if that write fails (storage full/blocked) the app does **not** leave, explains that unsaved changes would be lost, and offers **Try saving again** or an explicit **Sign in anyway and lose unsaved changes**, and you return to the page you started from (e.g. a shared build). A cancelled/failed sign-in returns to that page with a friendly notice instead of raw JSON. |
| Username | New accounts get a dialog with an **empty** field (no `YourUsername` template), live rules, then a confirmation step stating the username **cannot currently be changed**. "Later" is allowed; saving asks again. Taken/reserved/invalid names are explained. |
| Default title | A new build is named from its official combat skills in slot order (`Cow/Unarmed`, one skill `Cow`, the same skill twice `Psychology`, none `Untitled build`) until you type a different title. A typed title is never replaced by later skill changes. No BuildDocument schema change: a title counts as automatic only while it equals `Untitled build` or the generated name for the current skills. |
| Local vs account saving | Local autosave is unchanged (`Saved in this browser`). With accounts on, the local button reads **Save locally** (quiet style) and the green **Save build** saves to your account. A second status line says **Not saved to My Builds**, or **In My Builds · Private · All changes saved / Unsaved changes**. |
| Save build | Dialog: title (prefilled), optional **public description** (separate from private notes), visibility (**Private** default). Choosing Unlisted/Public shows the publication review and requires a tick before saving. Saves the exact BuildDocument v1 (skills, levels, bars, equipment, effective imported powers, planned mods, Mastery Sparks, target). Raw CharacterSheet/Storage files are never uploaded. |
| Save changes / Save as new | Owned builds show **Save changes** (disabled "Saved" when nothing changed), **Save as new** (a separate record; the original is untouched) and **Share**. Saves send the expected revision; double clicks send one request. |
| Conflicts and errors | A 409 offers **Save mine as a new build**, **Load the saved version** (your edits are kept as a restorable backup) or **Overwrite with mine** (confirmed). 401 returns to guest controls with "Your sign-in has ended… your work is still saved in this browser". 403/404/413/422/429/503/offline each have a plain message and a Retry where useful. Nothing deletes the working build. |
| Never silently replacing work | Opening another build (or *Load the saved version* after a conflict) asks first when the planner holds unsaved work, and keeps it as a backup listed in the planner ("“X” was kept on this device … · Restore · Discard"). Up to **5** backups are kept; earlier backups are never overwritten. Replacement **fails closed**: if the backup list cannot be read, is full, or the backup cannot be written (storage full/blocked), nothing is replaced and the message says why. Every switch of the working build (*Open in planner*, *Restore* a kept backup, *Load the saved version*) is one storage transaction (`src/features/sharing/replace-working.ts`): pending edits are flushed first, then the backup is stored, then the incoming draft, then its My Builds link. A restored backup is removed only after all of that succeeded. If the incoming draft or its link cannot be written, the backup change is undone and the previous draft is put back, so the active build, its link and every backup stay exactly as they were, and the planner shows why (never a false *Loaded* message). If even that undo fails, the stale link is removed, so the stored draft can only be saved as a new build, never over another record. A link that cannot be stored after a server save is likewise removed, flagged, and retried after the next successful local save. A damaged (unreadable) local draft is only replaced after an explicit confirmation. Opening the build you are already editing continues your unsaved edits. Clear build on a saved build starts a new unsaved build and never empties the saved copy. Sign in/out never touch the working build. |
| My Builds | All your builds (Private/Unlisted/Public badges), skill pair, last updated, description summary, "In planner" marker. Sort (Recently updated / Newest created / Name A–Z), filter by one or two combat skills (both must be present, any order), **Open**, **Share**, **Duplicate**, **Delete** (confirmed). Loads 50 at a time with **Load more**; sorting/filtering applies to loaded builds. Empty, loading, error/retry and signed-out states. |
| Sharing | Private / Unlisted / Public with plain explanations; Public says Search Builds arrives in the next update (it does not claim a live directory). Making a Private build visible shows **Visible to viewers / Never shared** and needs confirmation. A share link (with Copy) appears only for Unlisted/Public. Back to Private immediately makes old links show "Build not available". |
| Shared page `/builds/:id` | Read-only planner (skills, abilities, equipment, mods, Sparks; Damage analysis works) with title, author link, visibility, description. Viewing never writes your local draft. Owners get **Edit in planner / Share / Duplicate / Delete**; other accounts get **Copy to My Builds** (new Private, independent); guests get **Sign in to copy** and come back to the same page. Private/deleted/wrong IDs all show the same "Build not available". |
| Profiles | `/profile`: username (cannot be changed), links, Sign out and your Public builds only. `/u/:username`: anyone's Public builds only. |

### Small server change

`worker/api/accounts.ts` now sets Better Auth's `errorCallbackURL` to the same-origin page you started from plus `?signin=failed`, instead of the JSON `/api/auth/error` endpoint, so a cancelled consent lands on the planner with a friendly notice. The endpoint is kept for tampered/expired OAuth state (rare; still JSON). No other backend behaviour, schema, migration, binding or configuration changed.

## Automated evidence

Local results and GitHub CI are reported separately. The first PR head (`55d6881`) passed every check **locally**, but GitHub CI failed 1 test: the committed-secret scanner (`worker/config.test.ts`) only scans `git ls-files`, and the smoke script was untracked during the local run. Its provider placeholders (`DISCORD_CLIENT_SECRET: '<17-character literal>'`) matched the scanner's credential pattern. The correction generates those placeholder values per run instead of committing literals; the scanner's patterns are unchanged, and a new self-test proves they still flag credential-shaped values (including that exact old shape). Review corrections also added fail-closed backups and a guarded OAuth redirect (`82b80d1`), then made every working-build switch a single storage transaction (second follow-up review, below).

### Local (latest correction head, this branch)

| Command / check | Result |
|---|---|
| `npm run lint` | Pass, zero warnings |
| `npm run typecheck` | Pass (app, scripts, Worker) |
| `npm test -- --maxWorkers=2 --testTimeout=15000` | Pass, **1,494 tests / 78 files** (`82b80d1`: 1,480 / 77; baseline `main` 1,399 / 72), including the secret scanner run with the script tracked |
| `npm run build` | Pass |
| `npm run coverage:treasure -- --check` | Pass, reports unchanged |
| `npm run worker:smoke` | Pass (unchanged T0019 Worker/D1 smoke) |
| Production and staging `wrangler deploy --dry-run` | Pass, bundle only, nothing uploaded |
| `npm run ui:smoke:t0020` (real Chromium + real Worker + native local D1) | Pass, **22/22**, three consecutive runs |

### GitHub CI and Cloudflare preview

See the PR's checks for the exact head commit.

| Head | GitHub CI `verify` | Cloudflare preview |
|---|---|---|
| `55d6881` | **Failed**: 1 of 1,468 (scanner false positive above) | Build/deploy succeeded (guest-only) |
| `82b80d1` | **Passed** ([run 42419731154](https://github.com/Zaelious/GorgonBuilder/actions/runs/42419731154)): 1,480/1,480, worker smoke 74/74, lint/typecheck/build/dry-runs | Build/deploy succeeded (guest-only) |
| Latest (storage-transaction fix) | Recorded on the PR when CI completes | Recorded on the PR |

New tests:

- `src/app/editor/default-title.test.ts` — skill-pair names, single/duplicate/empty fallback, custom titles never overwritten, legacy `Untitled build`.
- `src/features/account/api.test.ts` — feature detection (503 not_configured, HTML, 404, offline → hidden; 503 unavailable → retry), same-origin JSON requests without tokens, HTTPS-only provider redirect, messages for 0/401/403/404/409/413/422/429/503.
- `src/features/sharing/workspace.test.ts` — key-order-independent change detection, link validation, metadata sync that never hides remote edits, open-with-confirmation/backup, protected drafts never overwritten; **review regressions** with an injected storage whose backup key throws while the draft key works (draft, link and earlier backups unchanged), draft-write failure rolls back the backup, A → B → C keeps both backups, full/unreadable/unwritable backup lists refuse and change nothing, legacy single backup read, damaged draft needs confirmation.
- `src/features/sharing/AccountFlows.test.tsx` (39 UI tests through the real client and an in-memory API fake) — production shows no account UI; guest sign-in flush/return path; OAuth failure notice; username onboarding; Private save of the exact document; revision-aware single-flight Save changes; Save as new; conflict choices and backup restore; **review regressions**: conflict *Load the saved version* refused with edits intact when the backup write fails (then succeeds after storage recovers), earlier backups preserved and a full list refused until one is discarded, OAuth redirect blocked when the local draft cannot be saved with *Try saving again* / explicit *Sign in anyway*; **second-review regressions** through the real planner: *Restore* with a failing incoming-draft write keeps the backup, the active build and its link; *Load the saved version* with a failing draft write or a failing per-key cloud-link write keeps the edits and the stored draft/link/backups byte-for-byte, then succeeds once storage recovers; a link that cannot be stored after *Save build* is cleared (never stale), flagged and retried; confirmed overwrite; 401 expiry; 413/422/429/503/offline with Retry; clear vs saved copy; My Builds sort/filter/duplicate/delete/open protection; publication review, link only when shared, revocation; profile shows Public only; guest read-only view with no draft writes; Private looks missing; copy to new Private; owner Edit.
- `src/features/sharing/replace-working.test.ts` — the switch transaction with an injected storage that fails per key, per operation or per attempt: Restore and Load-latest draft-write failures leave storage byte-for-byte unchanged; link-write/removal failures revert the draft; a failed revert removes the stale link and keeps the stash; `openRecordInPlanner` never leaves another record's link beside the opened draft; `persistCloudLink` removes a link it cannot overwrite.
- `worker/config.test.ts` — new scanner self-test: credential-shaped samples assembled at runtime (private key header, `GOCSPX-`, `ghp_`, secret-name assignments, the old placeholder shape) are all detected; safe forms are not.
- `worker/frontend-client.test.ts` — the same browser client against the **real Worker router and native local D1**: session/onboarding detection, full save → edit → 409 → share → sanitized guest read → foreign copy → public/private revocation → delete journey, sign-out/revoked session, and the `?signin=failed` OAuth error redirect.
- `scripts/t0020-browser-smoke.ts` — built SPA served by `wrangler dev --env local` with three seeded local sessions (stand-ins for completed OAuth; random per-run secret, per-run generated placeholder provider values, nothing remote). Covers the unconfigured (production-shape) planner, guest, username onboarding, save/change/share, three-build My Builds, guest read-only view with untouched draft, second-account copy, revoke, and 1440/375/320 px layouts with no horizontal overflow and no page errors. `--screenshots` writes the images below. Requires the environment's Playwright/Chromium (not a project dependency).

One existing test in `src/features/mods/ModPlanner.test.tsx` asserted (twice) that a skill change keeps the title `Untitled build`; it was updated to expect the new T0020 automatic title. No other existing test changed.

### Screenshots (`docs/screenshots/t0020/`, real Chromium, local Worker + D1)

| | |
|---|---|
| Production/preview shape (no account UI) | `01-production-guest-planner-1440.jpg` |
| Guest planner, sign-in dialog | `02-guest-planner-1440.jpg`, `03-guest-sign-in-dialog-1440.jpg` |
| Username choose/confirm, empty My Builds | `04-…`, `05-…`, `06-my-builds-empty-1440.jpg` |
| Save dialog, saved, unsaved changes | `07-…`, `08-signed-in-saved-1440.jpg`, `09-unsaved-changes-1440.jpg` |
| Share review, share link | `10-share-review-1440.jpg`, `11-share-link-1440.jpg` |
| Full My Builds | `12-my-builds-1440.jpg` |
| Guest read-only, copied build, revoked link | `13-…`, `14-copied-private-build-1440.jpg`, `15-revoked-not-available-1440.jpg` |
| Mobile 375/320: planner, My Builds, share dialog | `16-…`, `17-…`, `18-…` |

## How to get this onto staging

The staging workflow deploys **only from `main`** by design, and PR previews have no account backend (they show the guest planner only). This PR therefore cannot be tried with real sign-in until:

1. You review this PR (code, screenshots, this document) and approve merging it into `main`.
2. In GitHub → **Actions** → **T0019 staging (manual approval only)** → **Run workflow** on `main`, then approve its protected environment steps as you did for T0019. No migration is pending for T0020 (the workflow should report none).
3. Confirm `https://gorgonbuilder-staging.zbailouz7.workers.dev/api/health` shows `environment: staging, database: ok`.

The agent did not merge, deploy, change secrets or touch production.

## Owner staging acceptance — click by click (no DevTools)

Use a normal browser window (**A**), a second browser or browser profile with a different Google/Discord account (**B**), and a private/incognito window (**G**). Open `https://gorgonbuilder-staging.zbailouz7.workers.dev`.

**1. Guest planning**
1. In **G**, open the site. You should see the planner with a bar under the header: *Planner · My Builds* and a green **Sign in** button.
2. Choose Skill A **Cow** and Skill B **Unarmed**. The title becomes **Cow/Unarmed**. Under the title it says *Not saved to My Builds · sign in to save*.
3. Reload. The build is still there (*Local draft restored*).

**2. Sign in and username** (window **A**)
1. Build Cow/Unarmed as above, then click **Save build**. A sign-in dialog opens explaining your work stays in this browser.
2. Click **Continue with Google** (or Discord). Complete consent. You return to the planner and your Cow/Unarmed build is still there.
3. Your existing staging account already has the username `YourUsername`, so no username dialog appears; the menu at top right shows it. (Usernames cannot be renamed yet — see Known limitations.) To see onboarding, sign in with an account that has never used staging: the username box is empty; type a name, **Continue**, read *cannot currently be changed*, **Confirm**.
4. Optional: sign out, click **Sign in** → **Continue with Google**, then on Google's page choose **Cancel**. You land back on GorgonBuilder with *Sign-in was not completed. Your work is unchanged.*

**3. Save, edit, save as new**
1. Click **Save build**. Check: title prefilled *Cow/Unarmed*, **Private (default)** selected. Type a short public description. Click **Save to My Builds**.
2. The status line shows *In My Builds · Private · All changes saved*; the green button reads **Saved**.
3. Change a level. The status shows *Unsaved changes*; click **Save changes**. It returns to *All changes saved*.
4. Rename the title to *Cow/Unarmed Tank* (pencil icon), then change Skill B to Psychology and back: the custom title stays.
5. Click **Save as new**, title *Cow test copy*, save. Open **My Builds**: two builds, the original unchanged.
6. Reload the page and sign out/in: the planner and My Builds still match.

**4. My Builds**
1. In **My Builds**, try **Sort** (Recently updated / Newest created / Name A–Z) and the **Skill** filters (choose Cow, then Unarmed).
2. In the planner, make an unsaved change, then in My Builds click **Open** on the *other* build. A confirmation names your current build; click **OK**. The planner shows the opened build and a notice *“…” was kept on this device*. Click **Restore** next to it to get it back.
3. **Duplicate** a build, then **Delete** the duplicate (confirm). It disappears.

**5. Sharing and privacy**
1. Open the original build's **Share**. While Private there is no link. Choose **Unlisted**: the *Visible to viewers / Never shared* review appears; tick *I have reviewed…*, **Save sharing settings**. A link appears; click **Copy link**.
2. Paste the link in **G** (signed out). You see a read-only planner with *Read-only view*, the author name and description, disabled controls, and **Sign in to copy**. Your own guest draft in **G** is unchanged when you go back to Planner.
3. In **A**, open **Profile**: the Unlisted build is **not** listed. Change the build to **Public**; it now appears on Profile and on `/u/<your username>`. The dialog notes Search Builds comes in the next update.
4. Change it back to **Private**. Reload the link in **G**: *Build not available*. Also open a Private build's link in **G** directly: same message, no details.

**6. Second account and copy** (window **B**)
1. Sign in with a different account (choose a username). Open **A**'s Public/Unlisted link: **Copy to My Builds**. You land on your own Private copy with **Edit in planner**.
2. In **A**, confirm the original is unchanged. In **B**, the original's page offers no Edit/Delete. Make **A**'s build Private: **B**'s old link shows *Build not available*, but **B**'s copy remains.

**7. Errors and sessions**
1. In **A**, open the same saved build in two tabs. Save a change in tab 1, then change something in tab 2 and **Save changes**: you get the conflict choices. Try **Load the saved version**, then **Restore** the kept build.
2. Sign out from the menu: the planner and your working build remain; the bar shows **Sign in**.
3. Turn off Wi-Fi and press **Save changes**: you get an offline message with **Retry**; turn it back on and retry.

**8. Mobile**
On a phone (or a narrow window), repeat steps 1, 3.1 and 5.2. Controls wrap without sideways scrolling; the account control shows your initial.

**9. Production stays clean**
Open the production `gorgonbuilder` site or a PR preview: no account bar, no Sign in, the button reads **Save**, footer says *Local draft only*.

## Known limitations and follow-ups

- If browser storage fails so badly that a link can be neither written nor removed (setItem *and* removeItem failing), a stale link could remain until storage recovers; the planner shows a warning and retries. Quota failures (the common case) affect only writes, so removal succeeds.
- At most 5 unsaved builds are kept as backups on one device; a 6th replacement is refused until one is restored or discarded (by design, to avoid silent loss or unbounded storage).

- **Pending T0019 hosted checks (not waived):** genuine Discord OAuth, the full Public/Unlisted/Private two-account matrix on staging, OAuth callback CPU time on Workers Free, and D1 usage. Steps 2 and 5–6 above exercise most of these; record CPU/D1 figures from the Cloudflare dashboard for T0021.
- Usernames cannot be renamed (T0019 policy); the owner's staging account keeps `YourUsername`. A rename policy needs a separate decision.
- My Builds sorting/filtering applies to the builds loaded so far (50 per page; *Load more*). Server-side sort/filter is T0020-F1 scope.
- Copy titles: duplicating your own build adds "(copy)"; copying someone else's keeps their title.
- Tampered/expired OAuth state still shows the T0019 JSON error page (rare).
- Pre-existing on `main`, not changed: in 320 px *mobile emulation* the planner's "?" help control overflows by 8 px (layout viewport 328 px). Desktop 320 px windows are unaffected.
- The planner's read-only mod panel says "This draft is read-only" on shared pages (existing wording).
- Search Builds and author directory: T0020-F1.
