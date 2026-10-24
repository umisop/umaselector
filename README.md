# Card Exchange Selector v0.8

An English-language Uma Musume support-card exchange selector built with React, Vite, JavaScript, and Supabase. The public UI asks viewers for six required core-card levels and optional running styles. The recommendation engine only matches scenarios authored by the creator; it does not invent priorities or score cards.



## What changed in v0.8

- Production `/admin` is disabled when Supabase environment variables are missing. The route shows a setup message instead of the editor. Local browser preview remains available during `npm run dev` only.
- Production configuration reads fall back to the bundled seed data, not browser `localStorage`, when Supabase is not configured. Production saves fail closed instead of writing a misleading local-only draft.
- Supabase table privileges are explicitly reset: public/authenticated visitors can read the published config; only authenticated sessions can attempt updates, and RLS restricts those updates to JWTs whose `app_metadata.role` is `admin`. Browser roles cannot insert or delete the config row.
- Updated the package version to 0.8.0.

## Production dashboard access

Anyone can request the `/admin` URL, but that URL is not an authorization boundary. With Supabase configured, unauthenticated visitors see only the creator login form. The editor loads remote configuration only for a signed-in user whose trusted Supabase **App Metadata** contains `role: "admin"`. Actual write protection is enforced by RLS in `supabase/schema.sql`, not merely by hiding UI elements.

If Supabase is not configured in a production build, `/admin` displays a disabled-dashboard message and does not mount the editor. This is a fail-closed setup guard, not a substitute for configuring Supabase before launch. The public selector remains available and uses the bundled seed configuration; it will not show creator-authored scenarios until Supabase is configured and a creator saves the configuration.

For production: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in Vercel's Project Settings → Environment Variables for the Production environment, run `supabase/schema.sql` in the intended Supabase project, create the creator account, set `app_metadata.role` to `admin` using a trusted admin method, then redeploy. Never put a Supabase `service_role` or secret key in a `VITE_*` variable.

## What changed in v0.7

- Added the four supplied running-style logos as local assets in `public/assets/`.
- Blue = Front Runner, green = Pace Chaser, yellow = Late Surger, and orange/red = End Closer.
- Replaced running-style glyphs in the public selector, recommendation category headings, creator category tabs, and Scenario Tester with the supplied logo images.
- Logo assets are stored locally, so the running-style icons do not depend on external image hosting.

## What changed in v0.6

- Added a creator-only Scenario Tester. It lets the creator enter all six core-card levels, choose styles, and preview the scenario and recommendations that would match the current draft. It never publishes data by itself.
- Added Duplicate Scenario. A duplicate copies conditions and recommendations but starts disabled so it cannot accidentally alter public matching before review.
- Added Backup / Restore. Export the current card catalog and scenario configuration as JSON, or load a valid backup into the unsaved draft. Restoring requires confirmation and still needs an explicit Save changes to publish.
- Added a viewer Reset all control to clear core-card levels and running-style selections.
- Added unsaved-change warnings, a disabled save button when there are no changes, a warning when an Advanced JSON draft has not been validated/applied, and a browser before-unload warning for unsaved work.
- Added optimistic concurrency checking for Supabase saves. If another dashboard session saves first, the stale session is prevented from overwriting that newer version; the creator can reload the latest saved version after confirming the local draft may be discarded.
- Removed the public matched-scenario banner, scenario name, and admin-management link. Viewers see the recommendations (or a neutral no-recommendations message), not internal scenario matching details. The Scenario Tester still shows scenario names to the creator.

## What changed in v0.5

- Added the supplied logo at `public/assets/card-exchange-logo.png`; it appears in the site header and as the browser favicon.
- Added a YouTube video embed to the right of the hero copy on desktop, stacking below the intro on narrow screens.
- The embedded video is currently set to the previously shared YouTube link. When your own video is ready, replace `FEATURED_VIDEO_ID` in `src/pages/SelectorPage.jsx`. The optional start time is controlled by `FEATURED_VIDEO_START_SECONDS`.

## What changed in v0.4

- The public **Core Inventory** contains exactly six required inputs: Kitasan Black, Super Creek, Fine Motion, Agnes Tachyon, Maruzensky, and Mr. C.B.
- The searchable recommendation picker includes the global SSR support-card catalog mapped to GameTora IDs, including Sweep Tosho SSR Wit and Special Week SSR Stamina released on 2026-10-20.
- The separate full card-catalog tab is removed. Non-core cards appear in the creator UI when searching to add a recommendation.
- Real-time image-aware search filters by card name, support type, rarity, and GameTora card ID. It shows up to 12 matches at once to keep the picker manageable.
- Visuals use a restrained cyan, black, and white palette, flatter rows, system fonts, and fewer decorative panels.
- Legacy aliases from older starter versions are normalized to the current GameTora card IDs to avoid duplicate picker entries.

## SSR catalog and images

Catalog scope: Global support cards marked SSR available through **2026-10-20**. Each catalog entry uses a GameTora card ID and a direct CDN image URL with this pattern:

`https://media.gametora.com/umamusume/supports/full/small/{CARD_ID}.png`

The catalog was mapped from the GameTora support list and Global support banner history:

- https://gametora.com/umamusume/supports
- https://gametora.com/umamusume/gacha/history-supports-2026
- https://gametora.com/umamusume/supports/30067-the-thrones-assemblage (Heirs to the Throne, SSR Group)
- https://gametora.com/umamusume/supports/30127-special-week (Special Week, SSR Stamina, 2026-10-20)
- https://gametora.com/umamusume/supports/30128-sweep-tosho (Sweep Tosho, SSR Wit, 2026-10-20)

Images are loaded directly from GameTora with lazy loading and a fallback when an image fails. These external URLs are not controlled by this project; if GameTora changes CDN paths, update the catalog entry. GameTora is an independent database and is not affiliated with Cygames.

## Run locally

```bash
npm install
npm run dev
```

Vite prints the local development URL. Open `/admin` for the creator workspace. If Supabase is not configured, local browser preview is available during development only; it is disabled in production builds.

## Creator workspace

The creator can add/edit scenarios, configure each core-card condition as Ignore / any level, Not owned, or LB0–LB4, then search for cards and add them to Universal, Front Runner, Pace Chaser, Late Surger, or End Closer. Each recommendation can be marked Recommended or Alternative, contain an optional note, and be reordered manually. Empty categories are allowed. No exchange logic or score is generated automatically.

When running `npm run dev` without Supabase, local preview stores changes in that browser only. Production deployments never allow local-save admin mode. To publish changes for every visitor, configure Supabase before deploying. The Scenario Tester, Backup / Restore, and Duplicate Scenario controls are also available in the creator workspace. Before important edits, export a JSON backup. When using multiple dashboard sessions, save conflicts are detected against the last loaded `updated_at` revision.

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in its SQL editor.
3. Create the creator user in Supabase Authentication.
4. In the user's **App Metadata**, set `{ "role": "admin" }`. Do not use editable User Metadata for this permission.
5. Copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (or the current Supabase publishable key supported by your project).
6. Restart Vite, open `/admin`, and sign in.

The table has public read access and admin-only write access via Row Level Security. Never put a `service_role` secret in browser code or a `VITE_*` variable.

## Deploy to Vercel

1. Push this folder to a Git repository.
2. Import it into Vercel; Vite should be detected automatically.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in project environment variables.
4. Deploy. `vercel.json` includes a single-page-app rewrite so `/admin` works on refresh.

## Data rules

- Exactly six entries use `isCore: true`; every other support card uses `isCore: false` and appears only in the recommendation picker (or the optional Advanced JSON editor).
- The seed has an empty `scenarios` array. The creator must author all rules and recommendation picks manually.
- No viewer collection is saved to Supabase. Their levels are used only in browser memory for scenario matching.
- Card images are sourced from GameTora's public CDN. Please review applicable site/game usage terms for your distribution.
