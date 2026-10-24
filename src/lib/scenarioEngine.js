export const RUNNING_STYLES = [
  { id: 'fr', label: 'Front Runner', shortLabel: 'Front', icon: '🏁' },
  { id: 'pc', label: 'Pace Chaser', shortLabel: 'Pace', icon: '↗' },
  { id: 'ls', label: 'Late Surger', shortLabel: 'Late', icon: '◒' },
  { id: 'ec', label: 'End Closer', shortLabel: 'End', icon: '⚡' },
];

export const RECOMMENDATION_CATEGORIES = [
  { id: 'universal', label: 'Universal', description: 'Applies to all running styles.' },
  { id: 'fr', label: 'Front Runner', description: 'Recommendations for Front Runner.' },
  { id: 'pc', label: 'Pace Chaser', description: 'Recommendations for Pace Chaser.' },
  { id: 'ls', label: 'Late Surger', description: 'Recommendations for Late Surger.' },
  { id: 'ec', label: 'End Closer', description: 'Recommendations for End Closer.' },
];

export const LEVEL_OPTIONS = [
  { value: -1, label: 'Not owned' },
  { value: 0, label: 'LB0' },
  { value: 1, label: 'LB1' },
  { value: 2, label: 'LB2' },
  { value: 3, label: 'LB3' },
  { value: 4, label: 'LB4' },
];

export function normalizeCondition(value) {
  if (value === undefined || value === null || value === '' || value === '*' || value === 'any' || value === 'ignore') return 'any';
  const number = Number(value);
  return Number.isInteger(number) && number >= -1 && number <= 4 ? number : 'any';
}

export function scenarioSpecificity(scenario, coreCards) {
  const conditions = scenario?.conditions || {};
  return coreCards.reduce((count, card) => count + (normalizeCondition(conditions[card.id]) === 'any' ? 0 : 1), 0);
}

export function scenarioMatches(scenario, viewerLevels, coreCards) {
  if (scenario?.enabled === false) return false;
  const conditions = scenario?.conditions || {};
  return coreCards.every((card) => {
    const wanted = normalizeCondition(conditions[card.id]);
    if (wanted === 'any') return true;
    const current = viewerLevels[card.id];
    return current !== undefined && current !== null && Number(current) === wanted;
  });
}

/** Highest specificity wins. For equal specificity, higher creator priority wins; ties keep editor order. */
export function findMatchingScenario(scenarios, viewerLevels, coreCards) {
  return (Array.isArray(scenarios) ? scenarios : [])
    .map((scenario, index) => ({ scenario, index, specificity: scenarioSpecificity(scenario, coreCards) }))
    .filter(({ scenario }) => scenarioMatches(scenario, viewerLevels, coreCards))
    .sort((a, b) => b.specificity - a.specificity
      || Number(b.scenario.priority || 0) - Number(a.scenario.priority || 0)
      || a.index - b.index)[0]?.scenario || null;
}

export function getScenarioRecommendations(scenario, categoryId) {
  const recommendations = scenario?.recommendations;
  if (!recommendations || typeof recommendations !== 'object') return [];
  const list = recommendations[categoryId];
  return Array.isArray(list) ? list : [];
}

export function makeEmptyRecommendations() {
  return { universal: [], fr: [], pc: [], ls: [], ec: [] };
}

export function makeEmptyConditions(coreCards) {
  return Object.fromEntries(coreCards.map((card) => [card.id, 'any']));
}

export function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('The configuration must be a JSON object.');
  if (!Array.isArray(config.cards)) throw new Error('The "cards" field must be an array.');
  if (!Array.isArray(config.scenarios)) throw new Error('The "scenarios" field must be an array.');

  const cardIds = new Set();
  for (const card of config.cards) {
    if (!card || typeof card !== 'object') throw new Error('Each card must be an object.');
    const id = String(card.id || '').trim();
    if (!id) throw new Error('Every card must have an ID.');
    if (cardIds.has(id)) throw new Error(`Duplicate card ID: ${id}`);
    cardIds.add(id);
    if (!String(card.name || '').trim()) throw new Error(`Card ${id} must have a name.`);
  }

  const coreIds = new Set(config.cards.filter((card) => card.isCore).map((card) => String(card.id)));
  const scenarioIds = new Set();
  for (const scenario of config.scenarios) {
    if (!scenario || typeof scenario !== 'object') throw new Error('Each scenario must be an object.');
    const id = String(scenario.id || '').trim();
    if (!id) throw new Error('Every scenario must have an ID.');
    if (scenarioIds.has(id)) throw new Error(`Duplicate scenario ID: ${id}`);
    scenarioIds.add(id);
    if (!String(scenario.name || '').trim()) throw new Error(`Scenario ${id} must have a name.`);
    if (scenario.conditions !== undefined && (typeof scenario.conditions !== 'object' || Array.isArray(scenario.conditions) || scenario.conditions === null)) {
      throw new Error(`The conditions field for ${scenario.name} must be an object.`);
    }
    for (const [conditionCardId, rawCondition] of Object.entries(scenario.conditions || {})) {
      if (!coreIds.has(String(conditionCardId))) throw new Error(`Condition ${conditionCardId} in ${scenario.name} is not a core-card ID.`);
      const isAny = rawCondition === 'any' || rawCondition === '*' || rawCondition === 'ignore' || rawCondition === null;
      const conditionNumber = Number(rawCondition);
      if (!isAny && !(Number.isInteger(conditionNumber) && conditionNumber >= -1 && conditionNumber <= 4)) {
        throw new Error(`Condition ${conditionCardId} in ${scenario.name} must be any or a value from -1 to 4.`);
      }
    }
    if (scenario.recommendations !== undefined && (typeof scenario.recommendations !== 'object' || Array.isArray(scenario.recommendations))) {
      throw new Error(`The recommendations field for ${scenario.name} must be an object.`);
    }
    for (const [category, items] of Object.entries(scenario.recommendations || {})) {
      if (!['universal', 'fr', 'pc', 'ls', 'ec'].includes(category)) throw new Error(`Unknown recommendation category: ${category}`);
      if (!Array.isArray(items)) throw new Error(`Recommendations for ${category} must be an array.`);
      for (const item of items) {
        if (!cardIds.has(String(item?.cardId || ''))) throw new Error(`A recommendation in ${scenario.name} refers to a missing card: ${item?.cardId || '(empty)'}.`);
        if (!['recommended', 'alternative'].includes(item?.status || 'recommended')) throw new Error(`A recommendation in ${scenario.name} has an invalid status.`);
      }
    }
  }
  return config;
}
