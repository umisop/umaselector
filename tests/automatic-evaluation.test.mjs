import assert from "node:assert/strict";
import fs from "node:fs";
import { buildRuleBasedRecommendations, combineUniversalAndStyleRecommendations } from "../src/lib/recommendationRules.js";

const seed = JSON.parse(fs.readFileSync(new URL("../src/data/seed.json", import.meta.url), "utf8"));
const coreIds = ["kitasan-black", "super-creek", "fine-motion", "agnes-tachyon", "maruzensky", "mr-cb"];
const coreCards = coreIds.map((id) => seed.cards.find((card) => card.id === id));
assert.equal(coreCards.filter(Boolean).length, 6, "seed catalog contains all six expected Core Cards");
const nonCoreWit = seed.cards.find((card) => !card.isCore && /wit|wisdom/i.test(card.type || ""));
const nonCoreSpeed = seed.cards.find((card) => !card.isCore && /speed/i.test(card.type || ""));

function levels(overrides = {}) {
  return Object.fromEntries(coreCards.map((card) => [card.id, overrides[card.id] ?? 0]));
}
function makeConfig(base) {
  return {
    ...seed,
    recommendationModel: {
      enabled: true,
      base: { universal: [], fr: [], pc: [], ls: [], ec: [], ...base },
      overrides: [],
    },
  };
}
function evaluate(base, viewerLevels, category) {
  const result = buildRuleBasedRecommendations(makeConfig(base), viewerLevels, coreCards);
  assert.ok(result, "configured base recommendations should return a result");
  return { items: result.recommendations[category], summary: result.evaluationSummary };
}

// Core Card targets at LB4 are removed, while other catalog targets remain candidates.
const maxedLevels = levels(Object.fromEntries(coreIds.map((id) => [id, 4])));
const maxed = evaluate({ universal: [{ cardId: "kitasan-black" }, { cardId: nonCoreSpeed?.id }] }, maxedLevels, "universal");
assert.equal(
  maxed.items.some((item) => item.cardId === "kitasan-black"),
  false,
);
assert.equal(
  maxed.items.some((item) => item.cardId === nonCoreSpeed?.id),
  true,
);
assert.equal(maxed.summary.skippedMaxedCoreCards.length, 1);

// Kitasan Black target and Super Creek initial-gauge breakpoint.
const kitaGood = evaluate({ universal: [{ cardId: "kitasan-black" }] }, levels({ "kitasan-black": 2 }), "universal");
assert.equal(kitaGood.items[0].automaticEvaluation.tone, "positive");
assert.equal(kitaGood.items[0].status, "recommended", "Kitasan LB2 -> LB3 is dynamically marked Recommended");
assert.match(kitaGood.items[0].automaticEvaluation.message, /LB3/);
const kitaBelow = evaluate({ universal: [{ cardId: "kitasan-black" }] }, levels({ "kitasan-black": 1 }), "universal");
assert.equal(kitaBelow.items[0].automaticEvaluation.tone, "warning");
assert.equal(kitaBelow.items[0].status, "alternative", "Kitasan below LB3 target is dynamically marked Alternative");
const creekGood = evaluate({ universal: [{ cardId: "super-creek" }] }, levels({ "super-creek": 2 }), "universal");
assert.equal(creekGood.items[0].automaticEvaluation.tone, "positive");
assert.match(creekGood.items[0].automaticEvaluation.message, /initial gauge/);

// Fine Motion LB2 -> LB3 is the explicit positive breakpoint.
const fineGood = evaluate({ universal: [{ cardId: "fine-motion" }] }, levels({ "fine-motion": 2 }), "universal");
assert.equal(fineGood.items[0].automaticEvaluation.tone, "positive");
assert.equal(fineGood.items[0].status, "recommended", "Fine Motion LB2 -> LB3 is dynamically marked Recommended");
assert.match(fineGood.items[0].automaticEvaluation.message, /LB2 to LB3/);

// Fine Motion low LB with the other five Core Cards at LB4 gets the contextual warning.
const fineLowLevels = levels({ "fine-motion": -1, "kitasan-black": 4, "super-creek": 4, "agnes-tachyon": 4, maruzensky: 4, "mr-cb": 4 });
const fineLow = evaluate({ universal: [{ cardId: "fine-motion" }] }, fineLowLevels, "universal");
assert.equal(fineLow.items[0].automaticEvaluation.tone, "warning");
assert.match(fineLow.items[0].automaticEvaluation.message, /other five Core Cards are already LB4/);

// Maruzensky Front Runner target and low-value transitions.
const maruLow = evaluate({ fr: [{ cardId: "maruzensky" }] }, levels({ maruzensky: 1 }), "fr");
assert.equal(maruLow.items[0].automaticEvaluation.tone, "warning");
assert.equal(maruLow.items[0].status, "alternative", "Maruzensky LB1 -> LB2 is dynamically marked Alternative");
assert.match(maruLow.items[0].automaticEvaluation.title, /LB1 → LB2/);
const maruGood = evaluate({ fr: [{ cardId: "maruzensky" }] }, levels({ maruzensky: 2 }), "fr");
assert.equal(maruGood.items[0].automaticEvaluation.tone, "positive");
assert.equal(maruGood.items[0].status, "recommended", "Maruzensky LB2 -> LB3 is dynamically marked Recommended");
assert.match(maruGood.items[0].automaticEvaluation.message, /LB3/);
const maruGoodUniversal = evaluate({ universal: [{ cardId: "maruzensky" }] }, levels({ maruzensky: 2 }), "universal");
assert.equal(maruGoodUniversal.items[0].automaticEvaluation.tone, "positive", "Maruzensky LB2 -> LB3 breakpoint applies even when included from Universal");
assert.equal(maruGoodUniversal.items[0].status, "recommended", "Maruzensky LB2 -> LB3 from Universal is shown as Recommended");
assert.match(maruGoodUniversal.items[0].automaticEvaluation.message, /very valuable breakpoint/);
const maruLowUniversal = evaluate({ universal: [{ cardId: "maruzensky" }] }, levels({ maruzensky: 1 }), "universal");
assert.equal(maruLowUniversal.items[0].automaticEvaluation.tone, "warning", "Maruzensky LB1 -> LB2 keeps its low-value warning in Universal");
assert.equal(maruLowUniversal.items[0].status, "alternative");

// Agnes Tachyon is evaluated for Pace Chaser, targeting LB3.
const tachLow = evaluate({ pc: [{ cardId: "agnes-tachyon" }] }, levels({ "agnes-tachyon": 1 }), "pc");
assert.equal(tachLow.items[0].automaticEvaluation.tone, "warning");
const tachGood = evaluate({ pc: [{ cardId: "agnes-tachyon" }] }, levels({ "agnes-tachyon": 2 }), "pc");
assert.equal(tachGood.items[0].automaticEvaluation.tone, "positive");

// Wit CB mirrors Maruzensky's End Closer-specific breakpoint; LB3 is a good target, not a requirement.
const cbNotOwned = evaluate({ ec: [{ cardId: "mr-cb" }] }, levels({ "mr-cb": -1 }), "ec");
assert.equal(cbNotOwned.items[0].automaticEvaluation.tone, "warning");
assert.match(cbNotOwned.items[0].automaticEvaluation.message, /LB0/);
const cbUsable = evaluate({ ec: [{ cardId: "mr-cb" }] }, levels({ "mr-cb": 0 }), "ec");
assert.equal(cbUsable.items[0].automaticEvaluation.tone, "positive");
assert.equal(cbUsable.items[0].status, "recommended", "Wit CB LB0 -> LB1 is dynamically marked Recommended");
assert.match(cbUsable.items[0].automaticEvaluation.title, /usable LB1/);
assert.match(cbUsable.items[0].automaticEvaluation.message, /not a requirement/);
const cbLowValue = evaluate({ ec: [{ cardId: "mr-cb" }] }, levels({ "mr-cb": 1 }), "ec");
assert.equal(cbLowValue.items[0].automaticEvaluation.tone, "warning");
assert.equal(cbLowValue.items[0].status, "alternative", "Wit CB LB1 -> LB2 is dynamically marked Alternative");
assert.match(cbLowValue.items[0].automaticEvaluation.title, /LB1 → LB2/);
const cbGood = evaluate({ ec: [{ cardId: "mr-cb" }] }, levels({ "mr-cb": 2 }), "ec");
assert.equal(cbGood.items[0].automaticEvaluation.tone, "positive");
assert.equal(cbGood.items[0].status, "recommended", "Wit CB LB2 -> LB3 is dynamically marked Recommended");
assert.match(cbGood.items[0].automaticEvaluation.message, /LB3/);
const cbMarginal = evaluate({ ec: [{ cardId: "mr-cb" }] }, levels({ "mr-cb": 3 }), "ec");
assert.equal(cbMarginal.items[0].automaticEvaluation.tone, "warning");
assert.equal(cbMarginal.items[0].status, "alternative", "Wit CB LB3 -> LB4 is dynamically marked Alternative");
assert.match(cbMarginal.items[0].automaticEvaluation.title, /LB3 → LB4/);
// CB and Maruzensky should share the same breakpoint tone sequence: unavailable -> usable -> poor marginal step -> good LB3 -> small LB4 gain.
for (const [startingLevel, expectedTone] of [
  [-1, "warning"],
  [0, "positive"],
  [1, "warning"],
  [2, "positive"],
  [3, "warning"],
]) {
  const cbResult = evaluate({ ec: [{ cardId: "mr-cb" }] }, levels({ "mr-cb": startingLevel }), "ec");
  const maruResult = evaluate({ fr: [{ cardId: "maruzensky" }] }, levels({ maruzensky: startingLevel }), "fr");
  assert.equal(cbResult.items[0].automaticEvaluation.tone, expectedTone);
  assert.equal(maruResult.items[0].automaticEvaluation.tone, expectedTone);
  assert.equal(cbResult.items[0].automaticEvaluation.tone, maruResult.items[0].automaticEvaluation.tone);
}

// Any non-Core Wisdom card displays a manual value warning because its LB isn't tracked.
if (nonCoreWit) {
  const nonCoreWarning = evaluate({ universal: [{ cardId: nonCoreWit.id }] }, maxedLevels, "universal");
  assert.equal(nonCoreWarning.items[0].automaticEvaluation.tone, "warning");
  assert.match(nonCoreWarning.items[0].automaticEvaluation.title, /Wisdom exchange check/);
}

// A positively evaluated Core target ranks ahead of an unevaluated catalog candidate.
if (nonCoreSpeed) {
  const ranked = evaluate({ universal: [{ cardId: nonCoreSpeed.id }, { cardId: "fine-motion" }] }, levels({ "fine-motion": 2 }), "universal");
  assert.equal(ranked.items[0].cardId, "fine-motion");
}

// Universal is copied into each selected style group independently; style-specific entries override duplicates.
const mergedPc = combineUniversalAndStyleRecommendations(
  [
    { cardId: "fine-motion", status: "alternative", note: "Universal note" },
    { cardId: "kitasan-black", status: "recommended" },
  ],
  [
    { cardId: "fine-motion", status: "recommended", note: "Pace Chaser note" },
    { cardId: nonCoreSpeed?.id, status: "recommended" },
  ],
);
assert.equal(mergedPc.length, 3, "duplicate cards collapse within one style + universal group");
assert.equal(mergedPc.find((item) => item.cardId === "fine-motion").status, "recommended", "style-specific status overrides the Universal status");
assert.match(mergedPc.find((item) => item.cardId === "fine-motion").note, /Universal note/);
assert.match(mergedPc.find((item) => item.cardId === "fine-motion").note, /Pace Chaser note/);
const mergedLs = combineUniversalAndStyleRecommendations([{ cardId: "fine-motion", status: "alternative" }], [{ cardId: nonCoreSpeed?.id, status: "recommended" }]);
assert.equal(mergedLs.length, 2, "a second style gets its own independent Universal copy, not a combined multi-style list");

console.log("Automatic evaluation and category-combination tests passed.");
