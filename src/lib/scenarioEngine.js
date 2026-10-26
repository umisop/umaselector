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

export const CONDITION_LEVEL_VALUES = [-1, 0, 1, 2, 3, 4];

/**
 * Return the allowed levels for a condition. `null` means Any level; an empty
 * array is a deliberately empty custom selection and therefore matches nothing.
 * Legacy scalar conditions remain fully supported.
 */
export function getConditionValues(value) {
  if (value === undefined || value === null || value === '' || value === '*' || value === 'any' || value === 'ignore') return null;
  if (value && typeof value === 'object' && !Array.isArray(value) && value.mode === 'levels' && Array.isArray(value.values)) {
    return [...new Set(value.values.map(Number).filter((level) => Number.isInteger(level) && CONDITION_LEVEL_VALUES.includes(level)))].sort((a, b) => CONDITION_LEVEL_VALUES.indexOf(a) - CONDITION_LEVEL_VALUES.indexOf(b));
  }
  if (Array.isArray(value)) {
    return [...new Set(value.map(Number).filter((level) => Number.isInteger(level) && CONDITION_LEVEL_VALUES.includes(level)))].sort((a, b) => CONDITION_LEVEL_VALUES.indexOf(a) - CONDITION_LEVEL_VALUES.indexOf(b));
  }
  const number = Number(value);
  return Number.isInteger(number) && CONDITION_LEVEL_VALUES.includes(number) ? [number] : null;
}

export function conditionIsAny(value) {
  if (value === undefined || value === null || value === '' || value === '*' || value === 'any' || value === 'ignore') return true;
  const values = getConditionValues(value);
  if (values === null) return typeof value !== 'object';
  return values.length === CONDITION_LEVEL_VALUES.length && CONDITION_LEVEL_VALUES.every((level) => values.includes(level));
}

export function conditionMatches(value, currentValue) {
  if (conditionIsAny(value)) return true;
  const allowed = getConditionValues(value);
  if (!allowed?.length || currentValue === undefined || currentValue === null || currentValue === '') return false;
  const current = Number(currentValue);
  return Number.isInteger(current) && allowed.includes(current);
}

/** Number of Core Card fields constrained by a scenario/rule. */
export function scenarioSpecificity(scenario, coreCards) {
  const conditions = scenario?.conditions || {};
  return coreCards.reduce((count, card) => count + (conditionIsAny(conditions[card.id]) ? 0 : 1), 0);
}

/** Higher precision means fewer allowed levels for the same number of constrained cards. */
export function scenarioConditionPrecision(scenario, coreCards) {
  const conditions = scenario?.conditions || {};
  return coreCards.reduce((score, card) => {
    const values = getConditionValues(conditions[card.id]);
    if (conditionIsAny(conditions[card.id])) return score;
    return score + (values?.length ? 1 / values.length : 1);
  }, 0);
}

export function scenarioMatches(scenario, viewerLevels, coreCards) {
  if (scenario?.enabled === false) return false;
  const conditions = scenario?.conditions || {};
  return coreCards.every((card) => conditionMatches(conditions[card.id], viewerLevels?.[card.id]));
}

/** Highest field specificity wins, then narrower level sets, then priority; ties keep editor order. */
export function findMatchingScenario(scenarios, viewerLevels, coreCards) {
  return (Array.isArray(scenarios) ? scenarios : [])
    .map((scenario, index) => ({ scenario, index, specificity: scenarioSpecificity(scenario, coreCards), precision: scenarioConditionPrecision(scenario, coreCards) }))
    .filter(({ scenario }) => scenarioMatches(scenario, viewerLevels, coreCards))
    .sort((a, b) => b.specificity - a.specificity
      || b.precision - a.precision
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

  if (config.recommendationModel !== undefined) {
    const model = config.recommendationModel;
    if (!model || typeof model !== 'object' || Array.isArray(model)) throw new Error('The "recommendationModel" field must be an object.');
    if (model.enabled !== undefined && typeof model.enabled !== 'boolean') throw new Error('recommendationModel.enabled must be true or false.');
    if (model.base !== undefined && (!model.base || typeof model.base !== 'object' || Array.isArray(model.base))) throw new Error('recommendationModel.base must be an object.');
    const validCategories = ['universal', 'fr', 'pc', 'ls', 'ec'];
    const validateRecommendationItems = (items, context, allowRemove = false) => {
      if (!Array.isArray(items)) throw new Error(`${context} must be an array.`);
      for (const item of items) {
        if (!item || typeof item !== 'object') throw new Error(`${context} contains an invalid recommendation item.`);
        if (!cardIds.has(String(item.cardId || ''))) throw new Error(`${context} refers to a missing support card: ${item.cardId || '(empty)'}.`);
        if (!['recommended', 'alternative'].includes(item.status || 'recommended')) throw new Error(`${context} has an invalid status.`);
        if (item.action !== undefined && !(allowRemove && ['add', 'remove'].includes(item.action))) throw new Error(`${context} has an invalid rule action.`);
      }
    };

    for (const [category, items] of Object.entries(model.base || {})) {
      if (!validCategories.includes(category)) throw new Error(`Unknown base recommendation category: ${category}`);
      validateRecommendationItems(items, `Base recommendations for ${category}`);
    }

    const overrideIds = new Set();
    if (model.overrides !== undefined && !Array.isArray(model.overrides)) throw new Error('recommendationModel.overrides must be an array.');
    for (const rule of model.overrides || []) {
      if (!rule || typeof rule !== 'object') throw new Error('Each recommendation override must be an object.');
      const id = String(rule.id || '').trim();
      if (!id) throw new Error('Every recommendation override must have an ID.');
      if (overrideIds.has(id)) throw new Error(`Duplicate recommendation override ID: ${id}`);
      overrideIds.add(id);
      if (!String(rule.name || '').trim()) throw new Error(`Override ${id} must have a name.`);
      if (rule.priority !== undefined && !Number.isFinite(Number(rule.priority))) throw new Error(`Override ${rule.name} has an invalid priority.`);
      if (rule.conditions !== undefined && (!rule.conditions || typeof rule.conditions !== 'object' || Array.isArray(rule.conditions))) throw new Error(`Conditions for override ${rule.name} must be an object.`);
      for (const [conditionCardId, rawCondition] of Object.entries(rule.conditions || {})) {
        if (!coreIds.has(String(conditionCardId))) throw new Error(`Condition ${conditionCardId} in override ${rule.name} is not a core-card ID.`);
        const isAny = rawCondition === 'any' || rawCondition === '*' || rawCondition === 'ignore' || rawCondition === null || rawCondition === '';
        const conditionNumber = Number(rawCondition);
        const isLevelSet = rawCondition && typeof rawCondition === 'object' && !Array.isArray(rawCondition)
          && rawCondition.mode === 'levels' && Array.isArray(rawCondition.values)
          && rawCondition.values.every((level) => Number.isInteger(Number(level)) && Number(level) >= -1 && Number(level) <= 4)
          && new Set(rawCondition.values.map(Number)).size === rawCondition.values.length
          && (rawCondition.preset === undefined || typeof rawCondition.preset === 'string')
          && (rawCondition.custom === undefined || typeof rawCondition.custom === 'boolean');
        if (!isAny && !isLevelSet && !(Number.isInteger(conditionNumber) && conditionNumber >= -1 && conditionNumber <= 4)) throw new Error(`Condition ${conditionCardId} in override ${rule.name} must be Any, one level from -1 to 4, or a valid level set.`);
      }
      if (rule.actions !== undefined && (!rule.actions || typeof rule.actions !== 'object' || Array.isArray(rule.actions))) throw new Error(`Actions for override ${rule.name} must be an object.`);
      for (const [category, action] of Object.entries(rule.actions || {})) {
        if (!validCategories.includes(category)) throw new Error(`Unknown recommendation category in override ${rule.name}: ${category}`);
        if (!action || typeof action !== 'object' || Array.isArray(action)) throw new Error(`Action for ${category} in override ${rule.name} must be an object.`);
        if (action.mode !== undefined && !['merge', 'replace'].includes(action.mode)) throw new Error(`Action mode for ${category} in override ${rule.name} must be merge or replace.`);
        if (action.enabled !== undefined && typeof action.enabled !== 'boolean') throw new Error(`Action enabled for ${category} in override ${rule.name} must be true or false.`);
        if (action.recommendations !== undefined) validateRecommendationItems(action.recommendations, `Override ${rule.name}, ${category}`, true);
      }
    }
  }
  return config;
}
