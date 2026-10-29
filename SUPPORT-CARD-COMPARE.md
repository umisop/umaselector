# Support Card Compare

The Compare Support Cards modal provides a six-card comparison matrix inspired by the public behavior of [UmaGuide's compare tool](https://uma.guide/support-cards/compare), implemented within this project with the project's cyan/charcoal visual theme. It is not a copy of UmaGuide's source code.

## UI and controls

- Compare up to six Global support cards. Click a card image or an empty `Select` slot to choose or replace a card; set each card's LB0–MLB beneath its image. There is no separate Change button.
- Controls include a locked Grand Masters scenario, Facility Level, Max Energy, and Mood. Trainee / Growth selection is intentionally omitted so comparison results use zero trainee growth.
- Unique passives are merged into the matching effect row (for example, Friendship Bonus or Training Effectiveness). Each selected card has its own Passive ON/OFF toggle; the facility-level unique mechanic is handled automatically from the selected Facility Level rather than through the generic toggle.
- The main result shows the card's matching training as Rainbow training, assuming a bond gauge of 100 and one support card present, matching the compare reference's assumptions. “Show other trainings” expands other facility results.
- On narrow screens, the comparison matrix is compressed to display all six card columns. Detailed rows remain scrollable vertically.

## Data sources

- Global support-card catalogue, images, effects by card level, and unique-effect metadata: UmaTools Global support-card dataset at `https://beta.daftuyda.moe/assets/support_hints.json`.
- Grand Masters base training values: GameTora, `https://gametora.vercel.app/umamusume/grand-masters`.
- Public behavior reference: `https://uma.guide/support-cards/compare`.

## Calculation assumptions

- Formula follows UmaGuide's published support-card formula: base stat plus relevant flat stat bonuses, Friendship Bonus multipliers, mood multiplier, summed Training Effectiveness, a +5% participant factor for one support card, with trainee stat growth fixed at 0% in the modal. Effect categories apply in the proper order; Friendship Bonus multiplies with itself instead of being added to ordinary Training Effectiveness.
- Reference-style comparison defaults are explicit: bond gauge 100 to enable friendship training, one support card at the selected training, 600 combined bond across the six-card deck, one other card of each training type (Speed/Stamina/Power/Guts/Wit) in the remaining five slots, and current energy equal to the selected max-energy cap. When the UI has no career-history selectors, fan-, past-friendship-training-, and learned-skill-based unique effects use the source-described cap. These are comparison assumptions, not a claim that every in-career turn has those values.
- Maruzensky SSR (Global card 30107) has a facility-scaled unique effect: +5% Training Effectiveness for each level of the current facility. The parser resolves this to +25% at Facility Lv5. At Grand Masters, Facility Lv5, Great mood, bond 100, and LB1, the regression expectation is **Speed +28, Power +11, SP +9**. Its tests also cover LB0–MLB, Facility Lv4, Unique ON/OFF, and the sparse raw export.
- Tokai Teio SSR Wit (Global card 30111) has a total-support-bond unique effect: +1% Training Effectiveness per 30 combined support bond, up to +20% at 600. At Grand Masters, Facility Lv5, Great mood, LB3, and the comparison defaults, the regression expectation is **Speed +9, Wit +25, SP +9**.
- The shared parser maps all documented raw unique mechanic types **101–122** to their effect categories before calculation. Coverage includes bond-gated effect pairs, non-specialty bonuses, deck-type diversity, fan scaling, career-start stats by deck, accumulated friendship training, current/max-energy scaling, total-bond scaling, per-extra-support scaling, per-facility-level scaling, failure-rate protection, rainbow-only bonuses, energy accumulation, deck-wide effects, learned-skill scaling, combined-facility scaling, extra training locations, deck-wide specialty priority, deck-type parameter bonuses, extra bond gain, and next-turn support effects. Tests exercise all 22 mechanic types with raw catalog-shaped fixtures rather than hardcoding separate rules per SupportId.
- Raw parser aliases include `id`, `typeId`/`type_id`, generated names such as `Effect #111` or `Effect #111: 8`, arrays of effect parameters, and flattened `value_0_1`-style fields. When Global source data omits known parameters for types 109 or 111, the resolver uses the documented mechanic-level rule, not a card-ID exception. Unknown or genuinely unsupported dynamic mechanics are not silently represented as a verified stat bonus.
- The endpoint query schema version is bumped when parser rules change, and API responses use `Cache-Control: no-store` to reduce the chance of stale normalized data. The server-side source catalogue cache remains short-lived.
- Grand Masters temporary fragment/Goddess Wisdom bonuses are excluded. Event effects, race/fan rewards, hint effects, initial stats, and failure-rate protection are kept in their proper scopes rather than incorrectly mixed into one training result. The modal links to [UmaGuide support-card compare](https://uma.guide/support-cards/compare) for reference.
- Energy changes are based on the selected base table and supported energy mechanics. The energy summary is relative to a full energy bar at the selected max-energy cap.

## Implementation map

- `src/components/CompareCardsModal.jsx`: six-card matrix, card picker, settings controls, effect rows, and result rendering.
- `src/lib/supportCardCompare.js`: card normalization, unique-effect mechanic translation, support-effect values by LB, training formula, scenario dispatch, and catalog schema validation.
- `src/data/supportCardCompareScenarios.js`: verified base stat/energy tables; the comparison modal is currently locked to Grand Masters, for Facility Lv1–Lv5.
- `api/support-card-compare.js`: Global catalogue endpoint and normalized catalog schema version.
- `tests/support-card-compare.test.mjs`: formula and catalog regressions including Maruzensky LB0–MLB, the sparse raw Type 111 data, unique-effect display merging, both scenario tables, and catalog schema version.

Run the focused tests with `npm run test:compare`; run the recommendation and automatic-evaluation tests with `npm run test:recommendations` and `npm run test:auto-evaluation`.

- Agnes Tachyon SSR [Q≠0] (Global 30101) is a representative regression for plain named unique effects with a full-bond condition. “Bond gauge is full”, “Friendship Gauge 100+”, and “At Bond 80” are normalized as numeric thresholds. At bond 100, her +20 unique Friendship Bonus combines multiplicatively with the normal 20% Friendship Bonus; at bond 99, the unique bonus is inactive.


## Per-card Unique Passive toggle

Every selected card slot with a unique passive has an independent **Passive ON/OFF** control, except facility-level unique passives. New selections default to ON; OFF excludes that card's unique passive from the training calculation, specialty-priority calculation, and displayed folded effect rows, without changing the card's ordinary support effects. ON includes unlocked unique effects and evaluates supported mechanics using the selected facility level and comparison context. Facility-level unique passives (such as Maruzensky's) are calculated automatically from the chosen Facility Level and show a `Facility-level passive` note instead of the generic toggle. Catalog entries without a unique passive show a disabled `Passive —` control.

The compare API schema is version 9 so the UI does not reuse normalized data from older parser implementations.


### Max energy selector

The modal does not expose a Max Energy selector. The calculator keeps a fixed reference baseline of 120 energy because some unique passives scale with maximum/current energy (for example, Seeking the Pearl's Training Effectiveness unique). Energy-dependent mechanics remain active and are evaluated against this fixed baseline.
