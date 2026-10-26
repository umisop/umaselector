import { makeEmptyRecommendations, normalizeCondition, RECOMMENDATION_CATEGORIES } from "./scenarioEngine.js";

// Order follows the creator's requested combination labels. Each card has six states.
export const COMBINATION_LEVEL_ORDER = [0, 1, 2, 3, 4, -1];
export const COMBINATION_CORE_ORDER = ["kitasan-black", "fine-motion", "super-creek", "mr-cb", "agnes-tachyon", "maruzensky"];
export const COMBINATION_LEVEL_LABELS = {
  "-1": "Not owned",
  "0": "LB0",
  "1": "LB1",
  "2": "LB2",
  "3": "LB3",
  "4": "LB4",
};
export const COMBINATION_SHORT_NAMES = {
  "kitasan-black": "Kitasan",
  "fine-motion": "Fine Motion",
  "super-creek": "Creek",
  "mr-cb": "Wit CB",
  "agnes-tachyon": "Tachyon",
  maruzensky: "Maru",
};

const RECOMMENDATION_CATEGORY_IDS = RECOMMENDATION_CATEGORIES.map((category) => category.id);

export function orderCombinationCoreCards(cards) {
  const rank = new Map(COMBINATION_CORE_ORDER.map((id, index) => [id, index]));
  return [...(cards || [])]
    .filter((card) => card.isCore)
    .sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

export function getCombinationCount(coreCards) {
  return Math.pow(COMBINATION_LEVEL_ORDER.length, coreCards.length);
}

export function combinationAt(index, coreCards) {
  if (!Number.isInteger(index) || index < 0 || index >= getCombinationCount(coreCards)) return null;
  let remainder = index;
  const values = Array(coreCards.length).fill(0);
  for (let position = coreCards.length - 1; position >= 0; position -= 1) {
    values[position] = COMBINATION_LEVEL_ORDER[remainder % COMBINATION_LEVEL_ORDER.length];
    remainder = Math.floor(remainder / COMBINATION_LEVEL_ORDER.length);
  }
  return {
    index,
    key: values.join("|"),
    values,
    conditions: Object.fromEntries(coreCards.map((card, position) => [card.id, values[position]])),
  };
}

export function scenarioCombinationKey(scenario, coreCards) {
  if (!scenario?.conditions || typeof scenario.conditions !== "object") return null;
  const values = [];
  for (const card of coreCards) {
    const value = normalizeCondition(scenario.conditions[card.id]);
    if (value === "any" || !Number.isInteger(value) || value < -1 || value > 4) return null;
    values.push(value);
  }
  return values.join("|");
}

export function hasCombinationRecommendations(scenario) {
  return RECOMMENDATION_CATEGORY_IDS.some((categoryId) => Array.isArray(scenario?.recommendations?.[categoryId]) && scenario.recommendations[categoryId].length > 0);
}

export function countCombinationRecommendations(scenario) {
  return RECOMMENDATION_CATEGORY_IDS.reduce((sum, category) => sum + (scenario?.recommendations?.[category]?.length || 0), 0);
}

export function combinationLevelLabel(value) {
  return COMBINATION_LEVEL_LABELS[String(value)] || `LB${value}`;
}

export function getCombinationName(combo, coreCards) {
  return coreCards.map((card, index) => `${card.name || COMBINATION_SHORT_NAMES[card.id] || card.id} ${combinationLevelLabel(combo.values[index])}`).join(" · ");
}

export function getCompactCombinationName(combo, coreCards) {
  return coreCards.map((card, index) => `${COMBINATION_SHORT_NAMES[card.id] || card.name || card.id} ${combinationLevelLabel(combo.values[index])}`).join(" · ");
}

export function makeCombinationScenario(combo, coreCards) {
  const idParts = combo.values.map((value) => (value === -1 ? "n" : String(value)));
  return {
    id: `combo-${idParts.join("-")}`,
    name: getCombinationName(combo, coreCards),
    enabled: true,
    priority: 0,
    conditions: { ...combo.conditions },
    recommendations: makeEmptyRecommendations(),
  };
}

export function combinationHasRecommendationCount(scenario) {
  return hasCombinationRecommendations(scenario) ? countCombinationRecommendations(scenario) : 0;
}
