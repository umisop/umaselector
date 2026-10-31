# Card Exchange Selector

A fan-made Uma Musume Pretty Derby support-card exchange helper. It evaluates configured recommendations against a player's six Core Card levels and selected running styles. This is an independent fan project and is not affiliated with Cygames or Uma Musume Pretty Derby.

## Main Features

### Support Card Selector

- Track the six Core Cards: Kitasan Black, Super Creek, Fine Motion, Agnes Tachyon, Maruzensky, and Mr. C.B.
- Choose `Not Owned` or LB0–LB4 for each card.
- Select one or more running styles: Front Runner, Pace Chaser, Late Surger, and End Closer.
- View support-card recommendations from the full catalog, not only the six Core Cards.
- Each selected running style is shown with Universal recommendations in its own group. Multiple selected styles are not collapsed into one combined group.
- Core Card descriptions show style, usable level, and strengths. Defaults are editable in `src/data/seed.json` under each card's `coreDescription`.

### Official Recommendation Engine

- **Base Recommendations:** configure a reusable starting list for Universal and each running style.
- **Conditional Overrides:** change the result only when specified Core Card conditions match.
- Conditions support Any level, exact levels, range presets, and custom level selections for each of the six Core Cards.
- Rules can merge into a base list, replace a category list, update an existing card entry, or exclude a card.
- More specific matching rules are applied after broader rules; priority resolves rules with equal specificity.
- The engine evaluates known Core Card breakpoints and adds contextual notes. `Recommended` / `Alternative` status can change according to the resulting level after exchange.
- The Scenario Tester previews a six-card loadout and running styles before changes are saved.
- Legacy manual scenarios remain available. They can be imported as overrides when moving to the rule-based engine.

### Current Grandmaster Breakpoint Guidance

These are the strategy rules currently encoded from the project owner's guidance:

- **Kitasan Black:** LB3 is the preferred strong breakpoint; LB4 is omitted as an exchange target.
- **Super Creek:** LB0 is usable; LB3 is the initial-gauge improvement breakpoint.
- **Fine Motion:** LB1 is usable; LB2 → LB3 is a strong upgrade. If Fine Motion is Not Owned/LB0/LB1 while the other five Core Cards are LB4, the exchange receives a low-value Wisdom warning.
- **Maruzensky — Front Runner:** LB1 is usable; LB2 → LB3 is a strong target; LB1 → LB2 is low value; LB3 → LB4 has little improvement.
- **Agnes Tachyon — Pace Chaser:** LB3 is the target/requirement defined by the project owner.
- **Mr. C.B. / Wit CB — End Closer:** LB1 is usable; LB2 → LB3 is a good target; LB1 → LB2 is low value; LB3 → LB4 has little improvement. LB3 is a target, not a hard requirement.
- Recommendations outside the six Core Cards remain configurable, but the visitor's current limit break for those cards is not collected. The app therefore does not pretend to know their owned level.

The evaluator only applies configured and documented rules; it is not an independent game-stat database and does not invent strategy facts.

### Community Recommendations

- Visitors can browse public recommendations and sort by most upvoted, newest, or oldest.
- Signed-in users can publish recommendations, edit or delete their own posts, upvote, and report other users' posts.
- Sign-in supports email/password and Discord OAuth through Supabase Auth.
- Upvotes are limited to one active vote per account per post; clicking again removes the vote.
- Posts include a snapshot of all six Core Card levels, explanation, and recommended cards with catalog images.
- When a public scenario matches the snapshot, the feed uses scenario-aware grouping. If no enabled public scenario matches, the unmatched feed is restricted to posts with the same exact six Core Card levels; it does not mix different loadouts.
- The owner can review reports and hide/unhide posts at `/admin/community`.

### Profile and Site Information

- `/profile`: edit public display name, manage your own Community recommendations, and sign out.
- Forgot-password flow for email/password accounts.
- Documentation, About, FAQ, Feedback, Privacy Policy, Cookie Settings, Terms of Use, and Contact pages.
- Cookie settings control the optional embedded YouTube media preference in the current browser.
- Feedback is submitted privately by signed-in users and is not part of the public Community feed.

### Creator / Admin Tools

- `/admin`: manage the card catalog and official recommendation configuration.
- Configure Base Recommendations and Conditional Overrides, test candidate loadouts, and save configuration to Supabase.
- Legacy scenario editor, configuration backup/restore, and import of legacy scenarios as overrides are retained.
- `/admin/community`: review Community reports and moderate recommendations.
- Admin privileges are separate from public registration and use the `app_metadata.role = admin` claim.

## Recent Updates

- Added a rule-based recommendation model to avoid manually creating every six-card combination.
- Added per-card range presets and custom level selections to Conditional Overrides.
- Added automatic breakpoint evaluation, exchange-value notes, and dynamic Recommended/Alternative status for known Core Card upgrades.
- Grouped Universal recommendations separately with each selected running style; removed the technical evaluation banner from visitor-facing results.
- Added editable Core Card descriptions and support-card images in recommendation displays and Community forms.
- Added Community sign-in (including Discord), profile management, voting, reporting, sorting, and admin moderation.
- Added plain-language information pages, private feedback, privacy/terms pages, and simplified footer navigation.
- Preserved legacy scenarios and added import into Conditional Overrides.

## Key Source Files

| File                                           | Purpose                                                                 |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| `src/pages/SelectorPage.jsx`                   | Public Core Card input, running-style selection, and results            |
| `src/pages/AdminPage.jsx`                      | Creator dashboard and Scenario Tester                                   |
| `src/components/RecommendationRuleManager.jsx` | Base Recommendations and Conditional Overrides editor                   |
| `src/lib/recommendationRules.js`               | Rule matching, merge/replace/exclude behavior, and automatic evaluation |
| `src/lib/scenarioEngine.js`                    | Legacy scenario matching and recommendation selection                   |
| `src/data/seed.json`                           | Default card catalog metadata and Core Card descriptions                |
| `src/components/CommunitySection.jsx`          | Public Community list and interactions                                  |
| `src/components/CommunityPostForm.jsx`         | Create/edit Community recommendation form                               |
| `src/lib/community.js`                         | Community data access helpers                                           |
| `src/pages/ProfilePage.jsx`                    | User profile and own recommendations                                    |
| `src/pages/CommunityModerationPage.jsx`        | Admin moderation page                                                   |
| `src/pages/SiteInfoPage.jsx`                   | About, FAQ, Feedback, Privacy, Cookie Settings, Terms, and Contact      |
| `supabase/`                                    | Database schemas and update migrations                                  |

## Development and Checks

Use a supported Node.js LTS release (Node.js 24 is suitable for this project).

```bash
npm ci
npm run dev
```

Run the automatic evaluation tests and production build before publishing:

```bash
npm run test:auto-evaluation
npm run build
```

To preview the production build locally:

```bash
npm run preview
```
