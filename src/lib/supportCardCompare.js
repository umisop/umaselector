// Bump the query key on catalogue schema/parser changes to bypass stale CDN responses.
const API_PATH = '/api/support-card-compare?schema=9';
const SUPPORT_COMPARE_API_SCHEMA_VERSION = 9;
let catalogPromise = null;

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
}

import { SUPPORT_CARD_COMPARE_SCENARIOS as scenarioConfig } from '../data/supportCardCompareScenarios.js';

// In the raw Global catalogue, support unique mechanic IDs 101–122 are not
// ordinary bonus IDs. For example, ID 111 means “apply a bonus per facility
// level”; its `value` is the target bonus type (8 = Training Effectiveness),
// while `values[0]` carries the per-level amount. Preserve and translate this
// schema before it reaches the calculator instead of displaying `Effect #111:8`.
const UNIQUE_TARGET_EFFECTS = Object.freeze({
  1: { name: 'Friendship Bonus', symbol: 'percent' },
  2: { name: 'Mood Effect', symbol: 'percent' },
  3: { name: 'Speed Bonus', symbol: 'none' },
  4: { name: 'Stamina Bonus', symbol: 'none' },
  5: { name: 'Power Bonus', symbol: 'none' },
  6: { name: 'Guts Bonus', symbol: 'none' },
  7: { name: 'Wit Bonus', symbol: 'none' },
  8: { name: 'Training Effectiveness', symbol: 'percent' },
  9: { name: 'Initial Speed', symbol: 'none' },
  10: { name: 'Initial Stamina', symbol: 'none' },
  11: { name: 'Initial Power', symbol: 'none' },
  12: { name: 'Initial Guts', symbol: 'none' },
  13: { name: 'Initial Wit', symbol: 'none' },
  14: { name: 'Initial Friendship Gauge', symbol: 'none' },
  15: { name: 'Race Bonus', symbol: 'percent' },
  16: { name: 'Fan Bonus', symbol: 'percent' },
  17: { name: 'Hint Levels', symbol: 'none' },
  18: { name: 'Hint Frequency', symbol: 'percent' },
  19: { name: 'Specialty Priority', symbol: 'none' },
  20: { name: 'Max Speed', symbol: 'none' },
  21: { name: 'Max Stamina', symbol: 'none' },
  22: { name: 'Max Power', symbol: 'none' },
  23: { name: 'Max Guts', symbol: 'none' },
  24: { name: 'Max Wit', symbol: 'none' },
  25: { name: 'Event Recovery', symbol: 'percent' },
  26: { name: 'Event Effectiveness', symbol: 'percent' },
  27: { name: 'Failure Protection', symbol: 'percent' },
  28: { name: 'Energy Cost Reduction', symbol: 'percent' },
  29: { name: 'Minigame Effectiveness', symbol: 'percent' },
  30: { name: 'Skill Point Bonus', symbol: 'none' },
  31: { name: 'Wit Friendship Recovery', symbol: 'none' },
  32: { name: 'Initial Skill Points', symbol: 'none' },
  41: { name: 'Special: All Stats Training Bonus', symbol: 'none' },
});

function numericUniqueValues(effect) {
  const candidate = effect?.values ?? effect?.parameters ?? effect?.params ?? effect?.extraValues ?? effect?.additionalValues
    ?? effect?.valueParameters ?? effect?.value_parameters ?? effect?.extra_values;
  const numericParameter = (value) => {
    if (value && typeof value === 'object') return Number(value.value ?? value.amount ?? value.parameter ?? value.param ?? value.rate) || 0;
    return Number(value) || 0;
  };
  if (Array.isArray(candidate)) return candidate.map(numericParameter);
  if (candidate && typeof candidate === 'string') {
    const parsed = candidate.split(/[;,\s]+/).filter(Boolean).map(numericParameter);
    if (parsed.length) return parsed;
  }
  if (candidate && typeof candidate === 'object') {
    return Object.entries(candidate)
      .filter(([key]) => /^\d+$/.test(key))
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([, value]) => Number(value) || 0);
  }
  // Some exports flatten the game's value_0_1..value_0_4 fields instead of
  // storing an array. Accept those variants as well.
  const flattened = [1, 2, 3, 4].map((index) => {
    const candidates = [
      effect?.[`value_${index}`], effect?.[`value${index}`],
      effect?.[`value_0_${index}`], effect?.[`value0_${index}`],
      effect?.[`parameter_${index}`], effect?.[`parameter${index}`],
    ];
    return candidates.find((value) => value !== undefined && value !== null && value !== '') ?? 0;
  });
  return flattened.some((value) => Number(value) !== 0) ? flattened.map((value) => Number(value) || 0) : [];
}

function isGenericRawEffectName(name, id) {
  const text = String(name || '').trim();
  // Some exports stringify both parts, e.g. "Effect #111: 8" where 111 is
  // the mechanic and 8 is its target bonus category.
  return !text || new RegExp(`^effect\\s*#?\\s*${Number(id)}(?:\\s*[:=]\\s*-?\\d+(?:\\.\\d+)?)?$`, 'i').test(text);
}

function normalizeRawUniqueEffect(effect, uniqueMetadata = {}) {
  const rawName = String(effect?.name || effect?.effectName || effect?.effect_name || '');
  const nameIdMatch = rawName.match(/^\s*effect\s*#?\s*(\d+)(?:\s*[:=]\s*(-?\d+(?:\.\d+)?))?\s*$/i);
  // Equivalent exports place the raw unique mechanic ID in `id`, `typeId`,
  // or only the generated display name (e.g. "Effect #111: 8"). When a type
  // alias is present, the plain `id` may instead be the target bonus ID.
  const typeAlias = effect?.typeId ?? effect?.type_id ?? effect?.typeID ?? effect?.effectTypeId
    ?? effect?.effect_type_id ?? effect?.mechanicId ?? effect?.mechanic_id ?? effect?.uniqueTypeId
    ?? effect?.unique_type_id ?? effect?.sourceTypeId ?? effect?.source_type_id;
  const id = Number(nameIdMatch?.[1] ?? typeAlias ?? effect?.id ?? effect?.effectId ?? effect?.effect_id);
  const hasMechanicId = Boolean(nameIdMatch || (Number(typeAlias) >= 101 && Number(typeAlias) <= 122) || (Number(effect?.id) >= 101 && Number(effect?.id) <= 122));
  const targetFields = [effect?.targetTypeId, effect?.target_type_id, effect?.bonusTypeId, effect?.bonus_type_id];
  const explicitTarget = targetFields.find((value) => value !== undefined && value !== null && value !== '' && Number.isFinite(Number(value)));
  const idIsTarget = hasMechanicId && Number(effect?.id) > 0 && Number(effect?.id) <= 41 && !(Number(effect?.id) >= 101 && Number(effect?.id) <= 122);
  const valueCandidates = [explicitTarget, nameIdMatch?.[2], idIsTarget ? effect?.id : undefined, effect?.value];
  const parsedValue = valueCandidates.map((value) => value === undefined || value === null || value === '' ? NaN : Number(value)).find(Number.isFinite);
  const rawValue = parsedValue === undefined ? 0 : parsedValue;
  const values = numericUniqueValues(effect);
  const genericName = Boolean(nameIdMatch) || isGenericRawEffectName(rawName, id);
  const originalDescription = firstText(effect?.description, effect?.desc, effect?.text, effect?.detail);
  const parentUniqueDescription = firstText(uniqueMetadata?.description, uniqueMetadata?.desc, uniqueMetadata?.text, uniqueMetadata?.detail);
  const uniqueNarrative = [originalDescription, parentUniqueDescription].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  const originalMechanic = firstText(effect?.mechanic, effect?.mechanicId, effect?.formula, effect?.effectType);
  const regular = {
    id,
    name: rawName,
    symbol: String(effect?.symbol || 'none'),
    value: rawValue,
    values,
    description: originalDescription,
    mechanic: originalMechanic,
  };
  // A catalogue may already have translated the displayed effect name while
  // retaining the raw mechanic id (e.g. typeId=111, name='Training Effectiveness').
  // Normalize by mechanic id in that shape too; mechanic ids 101–122 are never
  // ordinary flat-effect ids.
  if ((!(hasMechanicId && id >= 101 && id <= 122) && !genericName) || id < 101 || id > 122) return [regular].filter((item) => item.name);

  const target = (typeId) => UNIQUE_TARGET_EFFECTS[Number(typeId)] || (
    Number(typeId) === 105 ? { name: 'Unique: Starting Stats for Every Support Type in Deck', symbol: 'none' }
      : Number(typeId) === 112 ? { name: 'Unique: Chance to Set Failure Rate to 0%', symbol: 'none' }
        : Number(typeId) === 118 ? { name: 'Unique: Extra Training Location Appearances', symbol: 'none' }
          : Number(typeId) === 120 ? { name: 'Unique: Parameter Bonus for Every Support Type in Deck', symbol: 'none' }
            : Number(typeId) === 121 ? { name: 'Unique: Extra Bond Gain', symbol: 'none' }
              : { name: `Effect #${Number(typeId)}`, symbol: 'none' }
  );
  const make = (targetId, value, description = '', mechanic = '') => {
    const info = target(targetId);
    return {
      id: Number(targetId), sourceTypeId: id, sourceTargetTypeId: Number(targetId), sourceValues: values,
      name: info.name, symbol: info.symbol, value: Number(value) || 0,
      description: description || originalDescription, mechanic: mechanic || originalMechanic,
    };
  };
  const amount = (index, fallback = 0) => Number(values[index] ?? fallback) || 0;
  const thresholdDescription = (threshold) => `If bond is ${Number(threshold) || 0} or higher`;
  const targetId = rawValue;
  const step = amount(0);

  switch (id) {
    case 101: {
      const results = [];
      for (let index = 0; index + 1 < values.length; index += 2) {
        if (values[index] > 0) results.push(make(values[index], values[index + 1], thresholdDescription(rawValue)));
      }
      return results.length ? results : [regular];
    }
    case 102:
      return [make(8, step, `${thresholdDescription(rawValue)}, and not training in specialty`)];
    case 103:
      return [make(8, step, `If deck has at least ${rawValue} different types of Support Cards`)];
    case 104:
      return [make(8, step, `Scaling every ${rawValue} fans, up to ${rawValue * step} fans`)];
    case 105:
      return [{
        id: 105, sourceTypeId: id, sourceTargetTypeId: 105, sourceValues: values,
        name: 'Unique: Starting Stats for Every Support Type in Deck', symbol: 'none', value: rawValue,
        description: values.length ? `Friend and group cards are worth ${amount(0)} to each stat` : originalDescription,
        mechanic: 'deck-starting-stats',
      }];
    case 106: {
      const targetType = amount(0);
      const perTraining = amount(1);
      return [make(targetType, perTraining * Math.max(0, rawValue), `Increases by ${perTraining} for every friendship training, up to ${rawValue} times`)];
    }
    case 107:
      return [make(targetId, amount(2), `Scales from ${amount(3)} to ${amount(2)} as energy approaches ${amount(1)} or lower (Set to 0 above 100 energy)`)];
    case 108:
      return [make(targetId, amount(3), `Scales from ${amount(2)} to ${amount(3)} as max energy approaches 120`)];
    case 109: {
      // Total-support-bond scaling. Some Global catalog rows only preserve
      // `Effect #109: 8` (target effect = Training Effectiveness) and omit all
      // numeric parameter columns. Read the actual per-step amount, interval,
      // cap and total-bond target from the card-level Unique Effect description.
      // Example: "Gain Training Effectiveness (1%) for every 30 combined
      // support bond, up to (20%) at 600".
      const description = uniqueNarrative;
      const normalizedDescription = description.replace(/,/g, '');
      const perStepMatch = normalizedDescription.match(/(?:gain|gains|increase|increases)(?:\s+(?:training\s+effectiveness|friendship\s+bonus|mood\s+effect|specialty\s+priority))?\s*(?:by\s*)?\(?([\d.]+)\s*%?\)?\s+for every\s+([\d.]+)\s+(?:(?:combined|total)\s+)?(?:support\s+)?bond/i)
        || normalizedDescription.match(/(?:increases?|gains?)\s+by\s*([\d.]+)\s*%?\s+for every\s+([\d.]+)\s+(?:(?:combined|total)\s+)?(?:support\s+)?bond/i);
      const capMatch = normalizedDescription.match(/up to\s*\(?([\d.]+)\s*%?\)?/i);
      const totalBondMatch = normalizedDescription.match(/at\s+([\d.]+)\s*(?:total\s+)?(?:combined\s+)?(?:support\s+)?bond/i);
      const describedStep = perStepMatch ? Number(perStepMatch[2]) : 0;
      const describedIncrement = perStepMatch ? Number(perStepMatch[1]) : 0;
      const rawStep = amount(0);
      const rawIncrement = amount(1) || (rawStep > 0 ? 1 : 0);
      let bondStep = describedStep || rawStep;
      let increment = describedIncrement || rawIncrement;
      let totalBondCap = totalBondMatch ? Number(totalBondMatch[1]) : (amount(3) || 600);
      let explicitEffectCap = capMatch ? Number(capMatch[1]) : amount(2);

      // The live Global catalogue currently provides only the generic prose
      // "Training Effectiveness based on total Friendship of cards in deck"
      // for this known type-109/target-8 implementation. The mechanic's
      // documented parameters are +1% per 30 combined bond, capped at +20%
      // when total combined bond reaches 600. Apply this type-level fallback
      // only when the catalogue has no numeric formula at all; card IDs are
      // deliberately not involved in the rule.
      const indicatesTotalBondMechanic = /total\s+(?:support\s+)?(?:bond|friendship)|combined\s+(?:support\s+)?bond|friendship\s+of\s+cards\s+in\s+deck/i.test(description);
      // Type 109's meaning is defined by the source mechanic itself: increase
      // the selected target effect by 1 for every N combined support bond.
      // Some Global rows omit BOTH the values array and any prose, leaving only
      // `Effect #109: 8` (target 8 = Training Effectiveness). Do not require a
      // card-level description to recognize this shared mechanic. When the
      // interval is also absent, use the documented global rule (+1 per 30,
      // capped at +20 with 600 total bond), never a SupportId-specific patch.
      if (!(bondStep > 0 && increment > 0) && targetId === 8) {
        bondStep = 30;
        increment = 1;
        totalBondCap = 600;
        explicitEffectCap = 20;
      }

      const resolvedCap = explicitEffectCap || (bondStep > 0 && increment > 0 ? Math.floor(totalBondCap / bondStep) * increment : 0);
      if (bondStep > 0 && increment > 0 && resolvedCap > 0) {
        const label = `Gain ${increment}% for every ${bondStep} combined support bond, up to ${resolvedCap}% at ${totalBondCap} total bond`;
        return [{ ...make(targetId || 8, resolvedCap, label, 'total-bond-scaling'), sourceStep: bondStep, sourcePerStep: increment, sourceTotalBondCap: totalBondCap }];
      }
      // Do not silently flatten a total-bond unique if its formula cannot be
      // read. It remains visible as unsupported instead of contributing zero.
      return [{ ...make(targetId || 8, 0, 'Total-support-bond scaling parameters are missing from both effect values and Unique Effect description', 'unsupported-dynamic'), mechanic: 'unsupported-dynamic' }];
    }
    case 110:
      return [make(targetId, step * 5, `Gains ${step} for every other support card on the same training`)];
    case 111: {
      // The Global support_hints export currently omits the increment parameter
      // for this mechanic and sends only the target effect (8 = Training
      // Effectiveness). The game reference for this mechanic defines the
      // increment as +5 Training Effectiveness per facility level. Use that
      // mechanic-level fallback only for target 8; do not guess parameters for
      // other target effects when they are absent from the source record.
      const perLevel = step > 0 ? step : (targetId === 8 ? 5 : 0);
      if (perLevel <= 0) return [{ ...make(targetId || 8, 0, 'Per-facility-level effect parameter is missing from the catalog record'), mechanic: 'unsupported-dynamic' }];
      return [make(targetId, perLevel * 5, `Gains ${perLevel} for every level of the current training facility`, 'per-facility-level')];
    }
    case 112:
      return [{ id: 112, sourceTypeId: id, sourceTargetTypeId: 112, sourceValues: values, name: 'Unique: Chance to Set Failure Rate to 0%', symbol: 'none', value: rawValue, description: originalDescription, mechanic: 'failure-rate-zero-chance' }];
    case 113:
      return [make(targetId, step, 'When participating in Friendship training')];
    case 114: {
      const cap = amount(1);
      return [make(targetId, cap, `Increases by 1 for every ${step} energy, up to ${step * cap} energy`)];
    }
    case 115:
      return [make(targetId, step, 'Applies to every support card in the deck')];
    case 116: {
      const skills = { 1: 'Speed', 2: 'Acceleration', 3: 'Recovery' };
      const category = skills[rawValue] || `Category ${rawValue}`;
      const perSkill = amount(1);
      const cap = amount(2);
      return [make(amount(0), perSkill * cap, `Increases by ${perSkill} for every learned ${category} skill, up to ${cap} skills`)];
    }
    case 117: {
      const levelCap = amount(0);
      const atCap = amount(1);
      return [make(targetId, atCap, `Scales to ${atCap} with level of all training facilities, up to combined level of ${levelCap}`)];
    }
    case 118:
      return [{ id: 118, sourceTypeId: id, sourceTargetTypeId: 118, sourceValues: values, name: 'Unique: Extra Training Location Appearances', symbol: 'none', value: rawValue, description: thresholdDescription(step), mechanic: 'extra-training-locations' }];
    case 119: {
      const bondThreshold = amount(1);
      return [make(19, rawValue, bondThreshold > 0 ? thresholdDescription(bondThreshold) : originalDescription)];
    }
    case 120:
      return [{ id: 120, sourceTypeId: id, sourceTargetTypeId: 120, sourceValues: values, name: 'Unique: Parameter Bonus for Every Support Type in Deck', symbol: 'none', value: rawValue, description: thresholdDescription(step), mechanic: 'deck-parameter-bonus' }];
    case 121: {
      const results = [{ id: 121, sourceTypeId: id, sourceTargetTypeId: 121, sourceValues: values, name: 'Unique: Extra Bond Gain', symbol: 'none', value: rawValue, description: 'When not training with', mechanic: 'extra-bond-gain' }];
      if (step > 0) results.push({ id: 121, sourceTypeId: id, sourceTargetTypeId: 121, sourceValues: values, name: 'Unique: Extra Bond Gain', symbol: 'none', value: step, description: 'When training with', mechanic: 'extra-bond-gain' });
      return results;
    }
    case 122:
      return [make(targetId, step, 'To other supports on the same facility, on the following turn', 'next-turn-support-effect')];
    default:
      return [regular];
  }
}

export const TRAINING_TYPES = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];
// Baseline context for a reference-style compare: the five other deck slots
// use different training types, which satisfies deck-diversity uniques and
// gives deck-wide effects a deterministic comparison scenario.
export const DEFAULT_COMPARE_DECK_COMPOSITION = Object.freeze({ Speed: 1, Stamina: 1, Power: 1, Guts: 1, Wit: 1 });
export const SCENARIO_CONFIG = scenarioConfig;
export const SCENARIOS = (scenarioConfig.scenarios || [])
  .filter((scenario) => scenario.enabled === true)
  .map(({ id, label }) => ({ id, label }));
export const DEFAULT_SCENARIO = SCENARIOS.some((scenario) => scenario.id === scenarioConfig.activeScenarioId)
  ? scenarioConfig.activeScenarioId
  : (SCENARIOS[0]?.id || 'grand-masters');
export const MOODS = [
  { value: -0.2, label: 'Awful' }, { value: -0.1, label: 'Bad' }, { value: 0, label: 'Normal' }, { value: 0.1, label: 'Good' }, { value: 0.2, label: 'Great' },
];
const BASE_TABLES = Object.fromEntries((scenarioConfig.scenarios || []).map((scenario) => [scenario.id, scenario.baseTables || {}]));

export function normalizeGlobalSupportCards(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.filter((row) => row && String(row.SupportServer || '').toLowerCase() === 'global').map((row) => ({
    id: String(row.SupportId || ''),
    slug: String(row.SupportSlug || ''),
    name: String(row.SupportName || ''),
    rarity: String(row.SupportRarity || '').toUpperCase(),
    type: String(row.SupportType || 'Support'),
    imageUrl: row.SupportImage ? `https://beta.daftuyda.moe${String(row.SupportImage).startsWith('/') ? '' : '/'}${row.SupportImage}` : '',
    effects: Array.isArray(row.SupportEffects) ? row.SupportEffects.map((effect) => ({
      id: Number(effect?.id), name: String(effect?.name || ''), symbol: String(effect?.symbol || 'none'),
      values: Array.isArray(effect?.values) ? effect.values.map((value) => Number(value) || 0) : [],
      description: firstText(effect?.description, effect?.desc, effect?.text, effect?.detail),
      mechanic: firstText(effect?.mechanic, effect?.mechanicId, effect?.formula, effect?.effectType),
    })).filter((effect) => effect.name) : [],
    unique: row.SupportUnique && typeof row.SupportUnique === 'object' ? {
      level: Number(row.SupportUnique.level) || 0,
      description: firstText(row.SupportUnique.description, row.SupportUnique.desc, row.SupportUnique.text, row.SupportUnique.detail),
      effects: Array.isArray(row.SupportUnique.effects) ? row.SupportUnique.effects.flatMap((effect) => normalizeRawUniqueEffect(effect, row.SupportUnique)).filter((effect) => effect.name) : [],
    } : null,
  })).filter((card) => /^\d{4,8}$/.test(card.id) && card.name).sort((a, b) => a.name.localeCompare(b.name, 'en'));
}

export async function loadSupportCardCatalog({ force = false } = {}) {
  if (force) catalogPromise = null;
  if (!catalogPromise) {
    catalogPromise = fetch(API_PATH, { headers: { Accept: 'application/json' } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || payload.error || `Catalog request failed (${response.status}).`);
        if (payload.schemaVersion !== SUPPORT_COMPARE_API_SCHEMA_VERSION) {
          throw new Error('The support-card compare API is outdated or cached. Redeploy the latest project ZIP, then reload the page.');
        }
        if (!Array.isArray(payload.cards) || payload.cards.length < 200) throw new Error('The Global support-card catalog is incomplete.');
        return payload;
      })
      .catch((error) => { catalogPromise = null; throw error; });
  }
  return catalogPromise;
}

export function levelForLimitBreak(card, lb) {
  const levelZero = card?.rarity === 'SSR' ? 30 : card?.rarity === 'SR' ? 25 : 20;
  return levelZero + Math.max(0, Math.min(4, Number(lb) || 0)) * 5;
}

/**
 * Canonical effect keys prevent a spelling/translation variant from silently
 * bypassing a mechanic. Display names are preserved separately for the UI.
 */
export function canonicalSupportEffectKey(name) {
  const raw = String(name || '').trim().toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ');
  if (!raw) return '';
  const key = raw.replace(/[-_]+/g, ' ');
  const unprefixed = key.replace(/^(?:special|unique):\s*/, '').trim();

  if (/^all stats training bonus$/.test(unprefixed)) return 'all stats training bonus';
  if (/^parameter bonus for every support type in deck$/.test(unprefixed)) return 'parameter bonus per support type in deck';
  if (/^starting stats for every support type in deck$/.test(unprefixed)) return 'starting stats per support type in deck';
  if (/^chance to set failure rate to 0%$/.test(unprefixed)) return 'failure rate zero chance';
  if (/^extra training location appearances?$/.test(unprefixed)) return 'extra training location appearances';
  if (/^extra bond gain$/.test(unprefixed)) return 'extra bond gain';
  if (/^initial skill points?$/.test(unprefixed)) return 'initial skill points';
  if (/^(?:wisdom|wit) bonus$/.test(unprefixed)) return 'wit bonus';
  if (/^(?:skill points?|skill pts?)(?: bonus)?$/.test(unprefixed) && /bonus/.test(unprefixed)) return 'skill point bonus';
  if (/^(?:skill point|skill points) bonus$/.test(unprefixed)) return 'skill point bonus';
  if (/^(?:energy cost|energy consumption|stamina cost) reduction$/.test(unprefixed)) return 'energy cost reduction';
  if (/^(?:wisdom|wit) friendship recovery(?: amount)?$/.test(unprefixed)) return 'wit friendship recovery';
  if (/^(?:motivation|mood) effect(?:iveness)?(?: increase| up)?$/.test(unprefixed)) return 'mood effect';
  if (/^training\s+(?:effectiveness|effect)(?:\s+(?:bonus|increase|up))?$/.test(unprefixed)) return 'training effectiveness';
  if (/^(?:specialty priority(?: up)?|specialty rate(?: up| bonus)?|preferred training priority)$/.test(unprefixed)) return 'specialty priority';
  if (/^friendship bonus$/.test(unprefixed)) return 'friendship bonus';
  if (/^initial (?:friendship|bond) gauge$/.test(unprefixed) || /^starting bond$/.test(unprefixed)) return 'starting bond';
  if (/^initial (speed|stamina|power|guts|wit|wisdom)$/.test(unprefixed)) {
    return `initial ${unprefixed.split(' ').at(-1) === 'wisdom' ? 'wit' : unprefixed.split(' ').at(-1)}`;
  }
  return unprefixed;
}

/** Scope registry documents which support effects can change this calculator's outputs. */
export const SUPPORT_EFFECT_SCOPES = Object.freeze({
  TRAINING_GAIN: 'training-gain',
  TRAINING_ENERGY: 'training-energy',
  TRAINING_APPEARANCE: 'training-appearance',
  CAREER_START: 'career-start',
  BOND_PROGRESSION: 'bond-progression',
  RACE_REWARD: 'race-reward',
  HINT_EVENT: 'hint-event',
  SUPPORT_EVENT: 'support-event',
  FAILURE_CHANCE: 'failure-chance',
  OTHER: 'other',
});

export function getSupportEffectScope(name) {
  const key = canonicalSupportEffectKey(name);
  if (['friendship bonus', 'mood effect', 'training effectiveness', 'speed bonus', 'stamina bonus', 'power bonus', 'guts bonus', 'wit bonus', 'skill point bonus', 'all stats training bonus', 'parameter bonus per support type in deck'].includes(key)) return SUPPORT_EFFECT_SCOPES.TRAINING_GAIN;
  if (['energy cost reduction', 'wit friendship recovery'].includes(key)) return SUPPORT_EFFECT_SCOPES.TRAINING_ENERGY;
  if (['specialty priority', 'extra training location appearances'].includes(key)) return SUPPORT_EFFECT_SCOPES.TRAINING_APPEARANCE;
  if (/^initial (speed|stamina|power|guts|wit)$/.test(key) || ['starting bond', 'initial skill points', 'starting stats per support type in deck'].includes(key)) return SUPPORT_EFFECT_SCOPES.CAREER_START;
  if (key === 'extra bond gain') return SUPPORT_EFFECT_SCOPES.BOND_PROGRESSION;
  if (['race bonus', 'fan bonus'].includes(key)) return SUPPORT_EFFECT_SCOPES.RACE_REWARD;
  if (['hint levels', 'hint level', 'hint frequency', 'hint quantity bonus'].includes(key)) return SUPPORT_EFFECT_SCOPES.HINT_EVENT;
  if (['event effectiveness', 'event recovery'].includes(key)) return SUPPORT_EFFECT_SCOPES.SUPPORT_EVENT;
  if (['failure protection', 'failure rate zero chance'].includes(key)) return SUPPORT_EFFECT_SCOPES.FAILURE_CHANCE;
  return SUPPORT_EFFECT_SCOPES.OTHER;
}

function baseEffectsForLimitBreak(card, lb) {
  const cardLevel = levelForLimitBreak(card, lb);
  const effects = new Map();
  // UmaTools stores effect values for the card level breakpoints Lv 1, 5, ... 50.
  const progressionIndex = Math.max(0, Math.min(10, Math.floor(cardLevel / 5)));
  for (const effect of card?.effects || []) {
    const key = canonicalSupportEffectKey(effect?.name);
    const value = Number(effect?.values?.[progressionIndex] ?? 0);
    if (key) effects.set(key, (effects.get(key) || 0) + value);
  }
  return effects;
}

/**
 * Facility-level unique passives are handled directly by the facility-level
 * calculator (e.g. +5 Training Effectiveness for each training facility level).
 * They remain automatic; the UI's generic ON/OFF control is for other unique
 * passive bundles whose activation is a binary comparison choice.
 */
export function hasFacilityLevelScaledUniquePassive(card) {
  const effects = Array.isArray(card?.unique?.effects) ? card.unique.effects : [];
  return effects.some((effect) => {
    const sourceTypeId = Number(effect?.sourceTypeId ?? effect?.source_type_id ?? effect?.typeId ?? effect?.type_id);
    const description = [effect?.description, effect?.mechanic, card?.unique?.description].filter(Boolean).join(' ');
    return sourceTypeId === 111
      || /(?:per[- ]facility[- ]level|for every\s+(?:current\s+)?(?:training\s+)?facility\s+level|(?:every|each)\s+level\s+of\s+the\s+current\s+training\s+facility)/i.test(description);
  });
}

function unlockedUniqueEffectsForLimitBreak(card, lb) {
  const cardLevel = levelForLimitBreak(card, lb);
  if (!card?.unique || cardLevel < Number(card.unique.level ?? 0)) return [];
  const rawUniqueEffects = Array.isArray(card.unique.effects) ? card.unique.effects : [];
  const cardEffects = Array.isArray(card.effects) ? card.effects : [];
  return rawUniqueEffects.map((effect) => {
    const normalized = {
      id: Number(effect?.id),
      name: String(effect?.name || ''),
      key: canonicalSupportEffectKey(effect?.name),
      value: Number(effect?.value) || 0,
      symbol: String(effect?.symbol || 'none'),
      description: String(effect?.description || ''),
      mechanic: String(effect?.mechanic || ''),
      sourceStep: Number(effect?.sourceStep) || 0,
      sourcePerStep: Number(effect?.sourcePerStep) || 0,
      sourceTotalBondCap: Number(effect?.sourceTotalBondCap) || 0,
    };
    const mechanicContext = {
      uniqueEffects: rawUniqueEffects,
      cardEffects,
      uniqueDescription: String(card.unique.description || ''),
    };
    return {
      ...normalized,
      details: mechanicText(normalized, mechanicContext),
      mechanicRule: getUniqueEffectMechanic(normalized, mechanicContext),
      conditionRule: getUniqueEffectCondition(normalized, mechanicContext),
    };
  }).filter((effect) => effect.key && Number.isFinite(effect.value));
}

/**
 * Shared mechanic rules are matched by source metadata/name/description, never
 * by SupportId. The catalog often omits prose; the compatibility signature for
 * the known facility-scaled Training Effectiveness checks the complete effect
 * bundle so a flat multi-effect unique (e.g. Kitasan Black) is not misread.
 */
export const UNIQUE_EFFECT_MECHANICS = Object.freeze({
  PER_FACILITY_LEVEL: 'per-facility-level',
  TRAINING_EFFECTIVENESS_PER_FACILITY_LEVEL: 'training-effectiveness-per-facility-level',
  FAILURE_RATE_ZERO_CHANCE: 'failure-rate-zero-chance',
  EXTRA_TRAINING_LOCATIONS: 'extra-training-locations',
  EXTRA_BOND_GAIN: 'extra-bond-gain',
  UNSUPPORTED_DYNAMIC: 'unsupported-dynamic',
  DECK_PARAMETER_BONUS: 'deck-parameter-bonus',
  DECK_STARTING_STATS: 'deck-starting-stats',
  SAME_TRAINING_SUPPORT_COUNT: 'same-training-support-count',
  FAN_SCALING: 'fan-scaling',
  FRIENDSHIP_TRAINING_SCALING: 'friendship-training-scaling',
  TOTAL_BOND_SCALING: 'total-bond-scaling',
  ENERGY_AMOUNT_SCALING: 'energy-amount-scaling',
  SKILL_COUNT_SCALING: 'skill-count-scaling',
  TOTAL_FACILITY_LEVEL_SCALING: 'total-facility-level-scaling',
  ENERGY_THRESHOLD_SCALING: 'energy-threshold-scaling',
  MAX_ENERGY_SCALING: 'max-energy-scaling',
  APPLIES_TO_EVERY_DECK_SUPPORT: 'applies-to-every-deck-support',
  NEXT_TURN_SUPPORT_EFFECT: 'next-turn-support-effect',
});

export const UNIQUE_EFFECT_CONDITIONS = Object.freeze({
  BOND_80: 'bond-80-or-higher',
  BOND_THRESHOLD: 'bond-threshold',
  RAINBOW_ONLY: 'rainbow-training-only',
  FACILITY_ONLY: 'specific-facility-only',
  UNSUPPORTED: 'unsupported-condition',
  NON_SPECIALTY_ONLY: 'non-specialty-only',
  DECK_DISTINCT_TYPES: 'deck-distinct-types',
});

function mechanicText(effect, context = {}) {
  const parts = [effect?.description, effect?.mechanic].filter(Boolean);
  const bundleDescription = String(context?.uniqueDescription || '');
  const bundleEffects = Array.isArray(context?.uniqueEffects) ? context.uniqueEffects : [];
  const effectKey = canonicalSupportEffectKey(effect?.name);
  // Card-level prose is safe to apply to one unique effect. On a multi-effect
  // unique, only use it when it mentions this effect category; otherwise it
  // could accidentally apply one mechanic's formula to every bundled bonus.
  const effectTerms = {
    'training effectiveness': /training\s+(?:effectiveness|effect)/i,
    'friendship bonus': /friendship\s+bonus/i,
    'mood effect': /(?:mood|motivation)\s+effect/i,
    'specialty priority': /specialty\s+(?:priority|rate)/i,
    'wit friendship recovery': /(?:wit|wisdom)\s+friendship\s+recovery/i,
    'energy cost reduction': /energy\s+(?:cost|consumption)\s+reduction/i,
    'all stats training bonus': /all\s+stats\s+training\s+bonus|all\s+parameters/i,
    'speed bonus': /speed\s+bonus|speed\s+stat/i,
    'stamina bonus': /stamina\s+bonus|stamina\s+stat/i,
    'power bonus': /power\s+bonus|power\s+stat/i,
    'guts bonus': /guts\s+bonus|guts\s+stat/i,
    'wit bonus': /(?:wit|wisdom)\s+bonus|(?:wit|wisdom)\s+stat/i,
    'race bonus': /race\s+bonus|race\s+reward/i,
    'fan bonus': /fan\s+bonus|fans?/i,
    'event recovery': /event\s+recovery/i,
    'event effectiveness': /event\s+effectiveness/i,
    'initial speed': /initial\s+speed|starting\s+speed/i,
    'initial stamina': /initial\s+stamina|starting\s+stamina/i,
    'initial power': /initial\s+power|starting\s+power/i,
    'initial guts': /initial\s+guts|starting\s+guts/i,
    'initial wit': /initial\s+(?:wit|wisdom)|starting\s+(?:wit|wisdom)/i,
    'skill point bonus': /skill\s*(?:points?|pts?)\s*bonus|skill\s*points?/i,
    'parameter bonus per support type in deck': /parameter\s+bonus|support\s+type.{0,30}deck/i,
    'starting stats per support type in deck': /starting\s+stats|support\s+type.{0,30}deck/i,
    'extra training location appearances': /extra\s+training\s+location\s+appearances|appear.{0,35}two(?:\s+training)?\s+locations/i,
    'failure rate zero chance': /failure\s+rate.{0,25}0|set.{0,20}failure.{0,20}0/i,
    'extra bond gain': /extra\s+bond\s+gain|bond\s+gain/i,
  };
  const namedCategory = effectTerms[effectKey];
  if (bundleDescription && (bundleEffects.length <= 1 || (namedCategory && namedCategory.test(bundleDescription)))) {
    parts.push(bundleDescription);
  }
  return parts.join(' ').toLowerCase().replace(/[’']/g, '').replace(/\s+/g, ' ').trim();
}

function describesFacilityLevelScaling(details) {
  return /(?:\bper\s+(?:(?:each|every)\s+)?(?:current\s+)?(?:training\s+)?facility\s+level\b|\b(?:for\s+)?each\s+(?:current\s+)?(?:training\s+)?facility\s+level\b|\b(?:for\s+)?every\s+(?:current\s+)?(?:training\s+)?facility\s+level\b|\blevel\s+of\s+the\s+(?:current\s+)?(?:training\s+)?facility\b|\b(?:based|scaled)\s+on\s+(?:the\s+)?(?:current\s+)?(?:training\s+)?facility\s+level\b|\bscales?\s+with\s+(?:the\s+)?(?:current\s+)?(?:training\s+)?facility\s+level\b|\bper\s+level\s+of\s+(?:the\s+)?(?:current\s+)?training\s+facility\b)/i.test(details);
}

function parseBondThreshold(details) {
  const text = String(details || '').replace(/[,]/g, ' ');

  // Global and reference sources use multiple equivalent condition phrasings.
  // A full bond/friendship gauge is 100; numeric thresholds are normalized so
  // conditional unique effects are not silently dropped as unsupported.
  const fullGaugePatterns = [
    /(?:bond|friendship)(?:\s+gauge)?\s+(?:is\s+)?(?:full|filled|maxed(?:\s+out)?|at\s+maximum|maximum|at\s+max)\b/i,
    /\b(?:at\s+)?full\s+(?:bond|friendship)(?:\s+gauge)?\b/i,
    /(?:bond|friendship)\s+gauge\s*(?:=|is|at)?\s*100\s*(?:\/\s*100)?\s*\+?/i,
  ];
  if (fullGaugePatterns.some((pattern) => pattern.test(text))) return 100;

  // UmaGuide often uses "At Bond 80:"; other sources use "Bond 80+" or
  // "Friendship Gauge 100+".
  const explicitAtBond = text.match(/\b(?:at|with)\s+(?:bond|friendship)(?:\s+gauge)?\s*(\d{1,3})(?:\s*\/\s*100)?\b/i);
  if (explicitAtBond) {
    const threshold = Number(explicitAtBond[1]);
    if (threshold >= 0 && threshold <= 100) return threshold;
  }
  const gaugeNumber = text.match(/(?:bond|friendship)\s+gauge\s*(?:=\s*|is\s+|at\s+)?(\d{1,3})(?:\s*\/\s*100)?\s*(?:\+|or\s+higher|or\s+more|and\s+above|or\s+greater)?/i)
    || text.match(/\b(?:bond|friendship)(?:\s+gauge)?\s*(?:is\s+|at\s+)?(\d{1,3})(?:\s*\/\s*100)?\s*(?:\+|or\s+higher|or\s+more|and\s+above|or\s+greater)/i);
  if (gaugeNumber) {
    const threshold = Number(gaugeNumber[1]);
    if (threshold >= 0 && threshold <= 100) return threshold;
  }

  const patterns = [
    /(?:bond|friendship)(?:\s+gauge)?[^.]{0,60}?(?:at\s+least\s+|is\s+|reaches\s+|>=\s*|≥\s*)(\d{1,3})(?:\s*\/\s*100|\s+out\s+of\s+100)?(?:\s*(?:or\s+higher|or\s+more|and\s+above|or\s+greater))?/i,
    /(?:bond|friendship)(?:\s+gauge)?\s*(\d{1,3})\s*(?:or\s+higher|or\s+more|and\s+above|or\s+greater)/i,
    /(?:at\s+least|>=|≥)\s*(\d{1,3})[^.]{0,60}(?:bond|friendship)/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const threshold = Number(match[1]);
      if (threshold >= 0 && threshold <= 100) return threshold;
    }
  }
  return null;
}

function getUniqueEffectCondition(effect, context = {}) {
  const details = mechanicText(effect, context);
  if (!details) return '';
  // Total-bond scaling is itself the condition/formula. Phrases such as
  // "Training Effectiveness based on total Friendship of cards in deck" must
  // not be misclassified as an unsupported trigger once the formula has been
  // resolved to the total-bond mechanic.
  const declaredMechanic = String(effect?.mechanic || '').toLowerCase().replace(/[_ ]+/g, '-');
  if (declaredMechanic === UNIQUE_EFFECT_MECHANICS.TOTAL_BOND_SCALING
      || /(?:every|per)\s+[\d,]+\s+(?:(?:combined|total)\s+)?(?:support\s+)?bond/i.test(details)) return '';
  const bondThreshold = parseBondThreshold(details);
  const effectKey = canonicalSupportEffectKey(effect?.name);
  // These named effects have understood triggers; phrases such as "when
  // training occurs" describe where the effect applies, not unknown formulas.
  if (effectKey === 'extra bond gain') return '';
  if (['failure rate zero chance', 'extra training location appearances'].includes(effectKey)) {
    if (bondThreshold === null) return '';
    return bondThreshold === 80 ? UNIQUE_EFFECT_CONDITIONS.BOND_80 : `${UNIQUE_EFFECT_CONDITIONS.BOND_THRESHOLD}:${bondThreshold}`;
  }
  // Do not confuse a mechanic that *accumulates per past friendship training*
  // (raw type 106) with a bonus that only activates on the current rainbow
  // training (raw type 113).
  const isPastFriendshipTrainingScaling = /(?:for every|per) friendship training/i.test(details);
  const hasRainbowCondition = !isPastFriendshipTrainingScaling && /rainbow training|friendship training is active|when (?:participating in )?friendship training|during friendship training/i.test(details);
  const nonSpecialtyCondition = /not\s+(?:training|on)\s+(?:in\s+)?(?:its\s+)?(?:preferred|specialty|speciality)\s+(?:training|facility)?/i.test(details)
    || /not training in specialty/i.test(details);
  const deckTypeMatch = details.match(/(?:at least|minimum of)\s+(\d+)\s+different types? of support cards?/i);
  const facilityMatch = details.match(/(?:when|while|during|on|in|if|for)\s+(?:the\s+)?(?:a\s+)?(speed|stamina|power|guts|wit|wisdom)\s+(?:training|facility)\b/i)
    || details.match(/(?:training|facility)\s+(?:of|on|for|in)\s+(speed|stamina|power|guts|wit|wisdom)\b/i);
  const supportedCondition = bondThreshold !== null || hasRainbowCondition || Boolean(facilityMatch) || nonSpecialtyCondition || Boolean(deckTypeMatch);
  const hasUnknownCondition = /\b(?:if|when|while|unless|depending on|based on|according to)\b/i.test(details) && !supportedCondition;
  if (hasUnknownCondition) return UNIQUE_EFFECT_CONDITIONS.UNSUPPORTED;
  if (facilityMatch) return `${UNIQUE_EFFECT_CONDITIONS.FACILITY_ONLY}:${facilityMatch[1].toLowerCase() === 'wisdom' ? 'wit' : facilityMatch[1].toLowerCase()}`;
  if (nonSpecialtyCondition && bondThreshold !== null) return `bond-threshold-non-specialty:${bondThreshold}`;
  if (nonSpecialtyCondition) return UNIQUE_EFFECT_CONDITIONS.NON_SPECIALTY_ONLY;
  if (deckTypeMatch) return `${UNIQUE_EFFECT_CONDITIONS.DECK_DISTINCT_TYPES}:${Number(deckTypeMatch[1])}`;
  if (hasRainbowCondition) return UNIQUE_EFFECT_CONDITIONS.RAINBOW_ONLY;
  if (bondThreshold !== null) return bondThreshold === 80
    ? UNIQUE_EFFECT_CONDITIONS.BOND_80
    : `${UNIQUE_EFFECT_CONDITIONS.BOND_THRESHOLD}:${bondThreshold}`;
  return '';
}

const UNIQUE_EFFECT_RULES = [
  {
    id: UNIQUE_EFFECT_MECHANICS.PER_FACILITY_LEVEL,
    matches(effect, context = {}) {
      return describesFacilityLevelScaling(mechanicText(effect, context));
    },
    resolveValue(effect, context) {
      const level = Math.max(1, Math.min(5, Number(context?.facilityLevel) || 1));
      const details = mechanicText(effect, context);
      const step = getTextStep(details, /(?:gains?|increases? by)\s*([\d.]+)\s*(?:%\s*)?for every level of the current training facility/i);
      if (step !== null) return Number(effect.value) === step ? step * level : Math.min(Number(effect.value), step * level);
      return Number(effect.value) * level;
    },
    describe(effect, context) {
      const level = Math.max(1, Math.min(5, Number(context?.facilityLevel) || 1));
      const details = mechanicText(effect, context);
      const step = getTextStep(details, /(?:gains?|increases? by)\s*([\d.]+)\s*(?:%\s*)?for every level of the current training facility/i);
      const perLevel = step === null ? Number(effect.value) : step;
      const resolved = step === null ? Number(effect.value) * level : (Number(effect.value) === step ? step * level : Math.min(Number(effect.value), step * level));
      return `+${resolved}${effect.symbol === 'percent' ? '%' : ''} @ Lv ${level} (${perLevel}${effect.symbol === 'percent' ? '%' : ''}/Lv facility)`;
    },
  },
];

function getUniqueEffectMechanic(effect, context = {}) {
  const key = canonicalSupportEffectKey(effect?.name);
  if (key === 'parameter bonus per support type in deck') return UNIQUE_EFFECT_MECHANICS.DECK_PARAMETER_BONUS;
  if (key === 'starting stats per support type in deck') return UNIQUE_EFFECT_MECHANICS.DECK_STARTING_STATS;
  if (key === 'failure rate zero chance') return UNIQUE_EFFECT_MECHANICS.FAILURE_RATE_ZERO_CHANCE;
  if (key === 'extra training location appearances') return UNIQUE_EFFECT_MECHANICS.EXTRA_TRAINING_LOCATIONS;
  if (key === 'extra bond gain') return UNIQUE_EFFECT_MECHANICS.EXTRA_BOND_GAIN;
  const declared = String(effect?.mechanic || '').toLowerCase().replace(/[_ ]+/g, '-');
  if (declared.includes(UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC)) return UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC;
  const declaredKnownMechanic = Object.values(UNIQUE_EFFECT_MECHANICS).find((mechanic) => declared === mechanic);
  if (declaredKnownMechanic) return declaredKnownMechanic;
  const declaredRule = UNIQUE_EFFECT_RULES.find((rule) => declared.includes(rule.id));
  if (declaredRule) return declaredRule.id;
  const detailsForDynamic = mechanicText(effect, context);
  if (/for every other support card on (?:the )?same training|per other support card on (?:the )?same training/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.SAME_TRAINING_SUPPORT_COUNT;
  if (/applies to every support card in the deck/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.APPLIES_TO_EVERY_DECK_SUPPORT;
  if (/scales? from [\d.]+ to [\d.]+ as energy approaches/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.ENERGY_THRESHOLD_SCALING;
  if (/scales? from [\d.]+ to [\d.]+ as max energy approaches/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.MAX_ENERGY_SCALING;
  if (/scal(?:e|es|ing) every [\d,]+ fans?|every [\d,]+ fans?.{0,35}up to/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.FAN_SCALING;
  if (/every friendship training|per friendship training/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.FRIENDSHIP_TRAINING_SCALING;
  if (/every [\d,]+\s+(?:(?:combined|total)\s+)?(?:support\s+)?bond|total bond.{0,30}every/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.TOTAL_BOND_SCALING;
  if (/every [\d,]+ energy|per [\d,]+ energy/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.ENERGY_AMOUNT_SCALING;
  if (/to other supports on the same facility.{0,30}following turn/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.NEXT_TURN_SUPPORT_EFFECT;
  if (/every learned (?:speed|acceleration|recovery) skill|per learned (?:speed|acceleration|recovery) skill/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.SKILL_COUNT_SCALING;
  if (/level of all training facilities|combined level of/i.test(detailsForDynamic)) return UNIQUE_EFFECT_MECHANICS.TOTAL_FACILITY_LEVEL_SCALING;
  const knownBySignature = UNIQUE_EFFECT_RULES.find((rule) => rule.matches(effect, context));
  if (knownBySignature) return knownBySignature.id;

  // Some Global rows omit all descriptive text. Maruzensky's facility-scaled
  // effect has a stable data signature: a lone unique Training Effectiveness
  // +5 and no ordinary Training Effectiveness on the card. Other bundles are
  // deliberately excluded because they often represent flat unique bonuses.
  const details = mechanicText(effect, context);
  const uniqueEffects = Array.isArray(context?.uniqueEffects) ? context.uniqueEffects : [];
  const baseEffects = Array.isArray(context?.cardEffects) ? context.cardEffects : [];
  const hasBaseTrainingEffectiveness = baseEffects.some((baseEffect) =>
    canonicalSupportEffectKey(baseEffect?.name) === 'training effectiveness'
  );
  const loneUniqueTrainingBonus = uniqueEffects.length === 1
    && canonicalSupportEffectKey(effect?.name) === 'training effectiveness'
    && Number(effect?.value) === 5
    && !hasBaseTrainingEffectiveness;
  if (!details && loneUniqueTrainingBonus) return UNIQUE_EFFECT_MECHANICS.TRAINING_EFFECTIVENESS_PER_FACILITY_LEVEL;

  const condition = getUniqueEffectCondition(effect, context);
  const detailsWithoutKnownConditions = details
    .replace(/(?:bond|friendship)(?:\s+gauge)?[^.]{0,70}(?:(?:at\s+least\s+|is\s+|reaches\s+|>=\s*|≥\s*)\d{1,3}|\d{1,3}\s*(?:or higher|or more|and above|or greater))[^.]*/ig, '')
    .replace(/(?:at\s+least|>=|≥)\s*\d{1,3}[^.]{0,70}(?:bond|friendship)[^.]*?/ig, '')
    .replace(/\b(?:at|with)\s+(?:bond|friendship)(?:\s+gauge)?\s*\d{1,3}(?:\s*\/\s*100)?\b/ig, '')
    .replace(/(?:when|while|if|at)\s+(?:the\s+)?(?:bond|friendship)(?:\s+gauge)?\s+(?:is\s+)?(?:full|filled|maxed(?:\s+out)?|at\s+maximum|maximum|at\s+max)\b/ig, '')
    .replace(/\b(?:at\s+)?full\s+(?:bond|friendship)(?:\s+gauge)?\b/ig, '')
    .replace(/(?:bond|friendship)\s+gauge\s*(?:=|is|at)?\s*100\s*(?:\/\s*100)?\s*\+?/ig, '')
    .replace(/\b(?:bond|friendship)(?:\s+gauge)?\s*(?:is\s+|at\s+)?\d{1,3}(?:\s*\/\s*100)?\s*(?:\+|or higher|or more|and above|or greater)/ig, '')
    .replace(/(?:rainbow|friendship)\s+training/ig, '')
    .replace(/(?:when|while|during|on|in|if|for)\s+(?:the\s+)?(?:a\s+)?(speed|stamina|power|guts|wit|wisdom)\s+(?:training|facility)/ig, '');
  const hasUnmodelledDynamicLanguage = /\b(?:per\s+(?:every|each|level|turn|training)|for\s+each|depending\s+on|based\s+on|scales?\s+with|increases?\s+with|current\s+training\s+facility|if\s+the|when\s+the|while\s+the|unless)\b/i.test(detailsWithoutKnownConditions);
  if (hasUnmodelledDynamicLanguage || condition === UNIQUE_EFFECT_CONDITIONS.UNSUPPORTED) return UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC;
  return '';
}

function uniqueEffectIsActive(effect, context = {}) {
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC) return false;
  const condition = effect?.conditionRule || '';
  if (condition === UNIQUE_EFFECT_CONDITIONS.UNSUPPORTED) return false;
  if (condition === UNIQUE_EFFECT_CONDITIONS.BOND_80 && Number(context?.bondGauge ?? 100) < 80) return false;
  if (String(condition).startsWith(`${UNIQUE_EFFECT_CONDITIONS.BOND_THRESHOLD}:`)) {
    const threshold = Number(condition.split(':')[1]);
    if (Number(context?.bondGauge ?? 100) < threshold) return false;
  }
  if (condition === UNIQUE_EFFECT_CONDITIONS.RAINBOW_ONLY && !context?.isRainbow) return false;
  if (condition === UNIQUE_EFFECT_CONDITIONS.NON_SPECIALTY_ONLY && String(context?.facility || '').toLowerCase() === String(context?.cardType || '').toLowerCase()) return false;
  if (condition.startsWith('bond-threshold-non-specialty:')) {
    const threshold = Number(condition.split(':')[1]);
    if (Number(context?.bondGauge ?? 100) < threshold || String(context?.facility || '').toLowerCase() === String(context?.cardType || '').toLowerCase()) return false;
  }
  if (condition.startsWith(`${UNIQUE_EFFECT_CONDITIONS.DECK_DISTINCT_TYPES}:`)) {
    const required = Number(condition.split(':')[1]);
    if (!isCompleteOtherDeck(context?.deckComposition) || getDeckDistinctTypeCount(context?.deckComposition, context?.cardType) < required) return false;
  }
  if (condition.startsWith(`${UNIQUE_EFFECT_CONDITIONS.FACILITY_ONLY}:`)) {
    const required = condition.split(':')[1];
    if (String(context?.facility || '').toLowerCase() !== required) return false;
  }
  return true;
}

function getTextStep(details, expression) {
  const match = String(details || '').match(expression);
  return match ? Number(String(match[1]).replace(/,/g, '')) : null;
}

function resolveUniqueEffectValue(effect, context = {}) {
  if (!uniqueEffectIsActive(effect, context)) return 0;
  // Type 122 grants an effect to other supports on the same facility next turn;
  // it is not a current-turn stat modifier in this training comparison.
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.NEXT_TURN_SUPPORT_EFFECT) return 0;
  const rule = UNIQUE_EFFECT_RULES.find((item) => item.id === effect?.mechanicRule)
    || (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.TRAINING_EFFECTIVENESS_PER_FACILITY_LEVEL ? UNIQUE_EFFECT_RULES[0] : null);
  if (rule) return rule.resolveValue(effect, context);
  const details = String(effect?.details || mechanicText(effect, context));
  const maximum = Math.max(0, Number(effect?.value) || 0);
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.DECK_PARAMETER_BONUS || effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.DECK_STARTING_STATS) return 0;
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.SAME_TRAINING_SUPPORT_COUNT) {
    const step = getTextStep(details, /(?:gains?|increases? by)\s*([\d.]+)\s*(?:%\s*)?for every other support card/i);
    return step === null ? 0 : Math.min(maximum, step * Math.max(0, (Number(context?.supportCardsAtTraining) || 1) - 1));
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.FAN_SCALING) {
    const step = getTextStep(details, /every\s+([\d,]+)\s+fans?/i);
    const describedFanCap = getTextStep(details, /up to\s+([\d,]+)\s+fans?/i);
    const assumedFans = describedFanCap ?? (step && step > 0 ? step * maximum : 0);
    const fans = context?.fans === undefined || context?.fans === null ? assumedFans : Math.max(0, Number(context.fans) || 0);
    return step && step > 0 ? Math.min(maximum, Math.floor(fans / step)) : 0;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.FRIENDSHIP_TRAINING_SCALING) {
    const step = getTextStep(details, /increases? by\s*([\d.]+)\s*(?:%\s*)?for every friendship training/i) ?? 1;
    const cap = getTextStep(details, /up to\s+([\d,]+)\s+times?/i) ?? Math.max(0, Math.floor(maximum / step));
    const count = context?.friendshipTrainingCount === undefined || context?.friendshipTrainingCount === null
      ? cap : Math.max(0, Number(context.friendshipTrainingCount) || 0);
    return Math.min(maximum, count, cap) * step;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.TOTAL_BOND_SCALING) {
    const step = Number(effect?.sourceStep) || getTextStep(details, /every\s+([\d,]+)\s+(?:(?:combined|total)\s+)?(?:support\s+)?bond/i);
    const increment = Number(effect?.sourcePerStep) || getTextStep(details, /(?:gain|gains|increase|increases)(?:\s+(?:training\s+effectiveness|friendship\s+bonus|mood\s+effect|specialty\s+priority))?\s*(?:by\s*)?\(?([\d.]+)\s*%?\)?\s+for every/i) || 1;
    return step && step > 0 ? Math.min(maximum, Math.floor(Math.max(0, Number(context?.totalBond) || 0) / step) * increment) : 0;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.ENERGY_AMOUNT_SCALING) {
    const step = getTextStep(details, /every\s+([\d,]+)\s+energy/i);
    const currentEnergy = Math.max(0, Number(context?.currentEnergy ?? context?.maxEnergy ?? 120));
    return step && step > 0 ? Math.min(maximum, Math.floor(currentEnergy / step)) : 0;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.SKILL_COUNT_SCALING) {
    const match = details.match(/every learned (speed|acceleration|recovery) skill/i);
    const kind = match?.[1]?.toLowerCase();
    const step = getTextStep(details, /increases? by\s*([\d.]+)\s*(?:%\s*)?for every learned/i) ?? 1;
    const cap = getTextStep(details, /up to\s+([\d,]+)\s+skills?/i) ?? Math.max(0, Math.floor(maximum / step));
    const selectedCount = context?.learnedSkills?.[kind];
    const count = selectedCount === undefined || selectedCount === null ? cap : Math.max(0, Number(selectedCount) || 0);
    return Math.min(maximum, count, cap) * step;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.TOTAL_FACILITY_LEVEL_SCALING) {
    const cap = getTextStep(details, /up to combined level of\s*([\d,]+)/i);
    const totalLevel = Number(context?.totalFacilityLevel) || (Math.max(1, Math.min(5, Number(context?.facilityLevel) || 1)) * 5);
    return cap && cap > 0 ? maximum * Math.min(totalLevel, cap) / cap : 0;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.ENERGY_THRESHOLD_SCALING) {
    const match = details.match(/scales? from\s*([\d.]+)\s*to\s*([\d.]+)\s*as energy approaches\s*([\d,]+)\s*or lower/i);
    if (!match) return 0;
    const lowEnergy = Number(match[3].replace(/,/g, ''));
    const lowEffect = Number(match[2]);
    const highEffect = Number(match[1]);
    const energy = Number(context?.currentEnergy ?? context?.maxEnergy ?? 120);
    if (energy > 100) return 0;
    if (energy <= lowEnergy) return lowEffect;
    if (lowEnergy >= 100) return lowEffect;
    return highEffect + (lowEffect - highEffect) * ((100 - energy) / (100 - lowEnergy));
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.MAX_ENERGY_SCALING) {
    const match = details.match(/scales? from\s*([\d.]+)\s*to\s*([\d.]+)\s*as max energy approaches\s*120/i);
    if (!match) return 0;
    const lowEffect = Number(match[1]);
    const highEffect = Number(match[2]);
    const energy = Math.max(100, Math.min(120, Number(context?.maxEnergy) || 120));
    return lowEffect + (highEffect - lowEffect) * ((energy - 100) / 20);
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.APPLIES_TO_EVERY_DECK_SUPPORT) {
    // Type 115 applies this bonus independently to each member of the deck.
    // This compare calculates one selected support present at training, so the
    // candidate contributes its own bonus once; multiplying by attendees was
    // a semantic error (and double-counted the same card).
    return maximum;
  }
  return maximum;
}

function normalizeDeckSupportType(type) {
  const key = String(type || '').toLowerCase().replace(/[\s_-]+/g, '');
  if (key === 'speed' || key === 'stamina' || key === 'power' || key === 'guts' || key === 'wit' || key === 'wisdom') return key === 'wisdom' ? 'Wit' : key[0].toUpperCase() + key.slice(1);
  return 'FriendGroup';
}

function getOtherDeckCardCount(deckComposition = {}) {
  return [...TRAINING_TYPES, 'FriendGroup'].reduce((sum, type) =>
    sum + Math.max(0, Math.min(5, Number(deckComposition?.[type] ?? (type === 'FriendGroup' ? deckComposition?.friendGroup : 0)) || 0)), 0);
}

function isCompleteOtherDeck(deckComposition = {}) {
  return getOtherDeckCardCount(deckComposition) === 5;
}

function getDeckCounts(deckComposition = {}, candidateType = '') {
  const counts = Object.fromEntries([...TRAINING_TYPES, 'FriendGroup'].map((type) => [type, Math.max(0, Math.min(5, Number(deckComposition?.[type] ?? (type === 'FriendGroup' ? deckComposition?.friendGroup : 0)) || 0))]));
  const ownType = normalizeDeckSupportType(candidateType);
  counts[ownType] += 1;
  return counts;
}

function getDeckDistinctTypeCount(deckComposition = {}, candidateType = '') {
  return Object.values(getDeckCounts(deckComposition, candidateType)).filter((count) => count > 0).length;
}

export function getDeckParameterBonuses(card, lb, bondGauge = 100, deckComposition = {}, options = {}) {
  const bonusEffects = unlockedUniqueEffectsForLimitBreak(card, lb).filter((effect) => effect.key === 'parameter bonus per support type in deck');
  const bonuses = Object.fromEntries([...STAT_NAMES].map((name) => [name, 0]));
  if (options?.uniquePassiveEnabled === false || !bonusEffects.length || !isCompleteOtherDeck(deckComposition)) return bonuses;
  const threshold = bonusEffects.reduce((max, effect) => {
    const condition = String(effect.conditionRule || '');
    const match = condition.match(/bond-threshold:(\d+)/);
    return Math.max(max, condition === UNIQUE_EFFECT_CONDITIONS.BOND_80 ? 80 : match ? Number(match[1]) : 80);
  }, 0);
  if (Number(bondGauge) < threshold) return bonuses;
  const counts = getDeckCounts(deckComposition, card?.type);
  for (const effect of bonusEffects) {
    const value = Math.max(0, Number(effect.value) || 0);
    for (const stat of TRAINING_TYPES) bonuses[stat] += Math.min(2, counts[stat]) * value;
    bonuses['Skill Points'] += Math.min(2, counts.FriendGroup) * value;
  }
  return bonuses;
}

export function getDeckStartingStatsBonuses(card, lb, deckComposition = {}) {
  const effects = unlockedUniqueEffectsForLimitBreak(card, lb).filter((effect) => effect.key === 'starting stats per support type in deck');
  const bonuses = Object.fromEntries([...TRAINING_TYPES, 'Skill Points'].map((name) => [name, 0]));
  if (!effects.length || !isCompleteOtherDeck(deckComposition)) return bonuses;
  const counts = getDeckCounts(deckComposition, card?.type);
  const friendGroupPerStat = effects.reduce((max, effect) => {
    const match = mechanicText(effect, { uniqueDescription: card?.unique?.description, uniqueEffects: card?.unique?.effects }).match(/friend and group cards are worth\s*([\d.]+)/i);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  for (const effect of effects) {
    const value = Math.max(0, Number(effect.value) || 0);
    for (const stat of TRAINING_TYPES) bonuses[stat] += counts[stat] * value + counts.FriendGroup * (friendGroupPerStat || value);
  }
  return bonuses;
}

export function getUniqueEffectDescription(effect, facilityLevel = 5, context = {}) {
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.DECK_PARAMETER_BONUS) {
    if (!context?.deckComposition || !context?.card || !isCompleteOtherDeck(context.deckComposition)) return 'Deck-dependent unique effect; numeric bonus is not guessed without the actual deck composition';
    if (Number(context?.bondGauge ?? 100) < 80) return 'Inactive below Bond 80';
    const bonuses = getDeckParameterBonuses(context.card, context.lb, context.bondGauge, context.deckComposition);
    const rendered = [...TRAINING_TYPES, 'Skill Points'].filter((stat) => bonuses[stat] > 0).map((stat) => `+${bonuses[stat]} ${stat}`);
    return `${rendered.join(', ') || 'No deck-derived bonus'} (Bond 80+; includes candidate card)`;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.DECK_STARTING_STATS) {
    if (!context?.deckComposition || !context?.card || !isCompleteOtherDeck(context.deckComposition)) return 'Career-start effect depends on deck composition; its numeric starting-stat bonus is not guessed without deck data';
    const bonuses = getDeckStartingStatsBonuses(context.card, context.lb, context.deckComposition);
    const rendered = TRAINING_TYPES.filter((stat) => bonuses[stat] > 0).map((stat) => `+${bonuses[stat]} ${stat}`);
    return `At career start: ${rendered.join(', ') || 'no deck-derived bonus'}`;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC) {
    const key = canonicalSupportEffectKey(effect?.name);
    if (key === 'parameter bonus per support type in deck') return 'Deck-dependent unique effect; numeric bonus is not guessed without the actual deck composition';
    if (key === 'starting stats per support type in deck') return 'Career-start effect depends on deck composition; numeric starting stats are not guessed without deck data';
    return 'Dynamic effect not included: source data does not specify a usable formula/context';
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.FAILURE_RATE_ZERO_CHANCE) {
    const threshold = effect?.conditionRule === UNIQUE_EFFECT_CONDITIONS.BOND_80 ? 80
      : String(effect?.conditionRule || '').startsWith(`${UNIQUE_EFFECT_CONDITIONS.BOND_THRESHOLD}:`) ? Number(effect.conditionRule.split(':')[1]) : null;
    const active = Number(effect?.resolvedValue ?? effect?.value) > 0;
    const gate = threshold === null ? '' : active ? ` (Bond ${threshold}+)` : ` (inactive below Bond ${threshold})`;
    return `${Number(effect?.value) || 0}% chance to set training failure rate to 0%${gate}`;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.EXTRA_TRAINING_LOCATIONS) {
    const threshold = effect?.conditionRule === UNIQUE_EFFECT_CONDITIONS.BOND_80 ? 80
      : String(effect?.conditionRule || '').startsWith(`${UNIQUE_EFFECT_CONDITIONS.BOND_THRESHOLD}:`) ? Number(effect.conditionRule.split(':')[1]) : null;
    const active = Number(effect?.resolvedValue ?? effect?.value) > 0;
    const gate = threshold === null ? '' : active ? ` (Bond ${threshold}+)` : ` (inactive below Bond ${threshold})`;
    return `+${Number(effect?.value) || 0} extra training location${Number(effect?.value) === 1 ? '' : 's'}${gate}`;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.EXTRA_BOND_GAIN) {
    const details = String(effect?.details || effect?.description || '').toLowerCase();
    if (/when training with/.test(details)) return `+${Number(effect?.value) || 0} bond when training with this card (bond progression; not a stat bonus)`;
    if (/when not training with/.test(details)) return `+${Number(effect?.value) || 0} bond when not training with this card (bond progression; not a stat bonus)`;
    return `+${Number(effect?.value) || 0} bond gain when its condition is met (bond progression; not a stat bonus)`;
  }
  if (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.NEXT_TURN_SUPPORT_EFFECT) {
    return `Next turn: affects other supports at the same facility; excluded from this training result`;
  }
  if (effect?.mechanicRule && [UNIQUE_EFFECT_MECHANICS.SAME_TRAINING_SUPPORT_COUNT, UNIQUE_EFFECT_MECHANICS.FAN_SCALING, UNIQUE_EFFECT_MECHANICS.FRIENDSHIP_TRAINING_SCALING, UNIQUE_EFFECT_MECHANICS.TOTAL_BOND_SCALING, UNIQUE_EFFECT_MECHANICS.ENERGY_AMOUNT_SCALING, UNIQUE_EFFECT_MECHANICS.SKILL_COUNT_SCALING, UNIQUE_EFFECT_MECHANICS.TOTAL_FACILITY_LEVEL_SCALING, UNIQUE_EFFECT_MECHANICS.ENERGY_THRESHOLD_SCALING, UNIQUE_EFFECT_MECHANICS.MAX_ENERGY_SCALING, UNIQUE_EFFECT_MECHANICS.APPLIES_TO_EVERY_DECK_SUPPORT].includes(effect.mechanicRule)) {
    const resolved = Number(effect?.resolvedValue ?? effect?.value) || 0;
    return `${resolved > 0 ? '+' : ''}${resolved}${effect.symbol === 'percent' ? '%' : ''} (resolved for selected context)`;
  }
  let description;
  const rule = UNIQUE_EFFECT_RULES.find((item) => item.id === effect?.mechanicRule)
    || (effect?.mechanicRule === UNIQUE_EFFECT_MECHANICS.TRAINING_EFFECTIVENESS_PER_FACILITY_LEVEL ? UNIQUE_EFFECT_RULES[0] : null);
  if (rule) description = rule.describe(effect, { facilityLevel });
  else {
    const value = Number(effect?.value) || 0;
    description = effect?.symbol === 'percent' ? `${value}%` : `${value > 0 ? '+' : ''}${value}`;
  }
  const bondThreshold = effect?.conditionRule === UNIQUE_EFFECT_CONDITIONS.BOND_80 ? 80
    : String(effect?.conditionRule || '').startsWith(`${UNIQUE_EFFECT_CONDITIONS.BOND_THRESHOLD}:`) ? Number(effect.conditionRule.split(':')[1]) : null;
  if (bondThreshold !== null) {
    const active = Number(effect?.resolvedValue ?? effect?.value) !== 0;
    description += active ? ` (Bond ${bondThreshold}+)` : ` (Bond ${bondThreshold}+; inactive at selected bond)`;
  }
  if (effect?.conditionRule === UNIQUE_EFFECT_CONDITIONS.RAINBOW_ONLY) {
    const active = Number(effect?.resolvedValue ?? effect?.value) !== 0;
    description += active ? ' (Rainbow only)' : ' (Rainbow only; inactive in selected context)';
  }
  if (String(effect?.conditionRule || '').startsWith(`${UNIQUE_EFFECT_CONDITIONS.FACILITY_ONLY}:`)) {
    description += ` (${effect.conditionRule.split(':')[1]} training only)`;
  }
  if (effect?.conditionRule === UNIQUE_EFFECT_CONDITIONS.UNSUPPORTED) description += ' (condition not modelled)';
  return description;
}

function summedEffectValue(baseEffects, uniqueEffects, name) {
  const key = canonicalSupportEffectKey(name);
  // calculateTraining passes effect values already resolved for that training
  // context; do not re-resolve them and accidentally drop a condition.
  return (baseEffects.get(key) || 0) + uniqueEffects
    .filter((effect) => effect.key === key)
    .reduce((sum, effect) => sum + (Number(effect.value) || 0), 0);
}

/**
 * Combined effect map for comparison/debugging. Note that the calculator keeps
 * Friendship Bonus multiplicative rather than adding it to ordinary effects.
 */
export function effectsForLimitBreak(card, lb, facilityLevel = 5, bondGauge = 100) {
  const effects = baseEffectsForLimitBreak(card, lb);
  for (const effect of unlockedUniqueEffectsForLimitBreak(card, lb)) {
    if (effect.mechanicRule === UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC) continue;
    const value = resolveUniqueEffectValue(effect, {
      facilityLevel,
      facility: card?.type,
      cardType: card?.type,
      bondGauge,
      isRainbow: TRAINING_TYPES.includes(card?.type) && Number(bondGauge) >= 80,
    });
    effects.set(effect.key, (effects.get(effect.key) || 0) + value);
  }
  return effects;
}

/** Per-card support effects at selected LB, excluding the separately listed unique bundle. */
export function getCardEffectEntries(card, lb) {
  if (!card) return [];
  const level = levelForLimitBreak(card, lb);
  const progressionIndex = Math.max(0, Math.min(10, Math.floor(level / 5)));
  return (card.effects || []).map((effect) => ({
    id: Number(effect?.id),
    name: String(effect?.name || ''),
    key: canonicalSupportEffectKey(effect?.name),
    symbol: String(effect?.symbol || 'none'),
    value: Number(effect?.values?.[progressionIndex] ?? 0),
  })).filter((effect) => effect.name && Number.isFinite(effect.value) && effect.value !== 0);
}

/** Returns a card's unique-effect state; display values assume the card's own type at orange bond. */
export function getCardUniqueEffectState(card, lb, facilityLevel = 5, bondGauge = 100, deckComposition = null, options = {}) {
  if (!card?.unique || !Array.isArray(card.unique.effects) || !card.unique.effects.length) return { exists: false, unlocked: false, levelRequired: null, effects: [] };
  const levelRequired = Number(card.unique.level) || 0;
  const currentLevel = levelForLimitBreak(card, lb);
  const unlocked = currentLevel >= levelRequired;
  return {
    exists: true,
    unlocked,
    levelRequired,
    effects: unlocked ? unlockedUniqueEffectsForLimitBreak(card, lb).map((effect) => ({
      id: effect.id,
      name: effect.name,
      key: effect.key,
      symbol: effect.symbol,
      value: effect.value,
      resolvedValue: resolveUniqueEffectValue(effect, {
        facilityLevel,
        facility: card?.type,
        cardType: card?.type,
        bondGauge,
        deckComposition,
        card,
        lb,
        supportCardsAtTraining: options?.supportCardsAtTraining,
        fans: options?.fans,
        totalBond: options?.totalBond === undefined ? 600 : Math.max(0, Number(options.totalBond) || 0),
        friendshipTrainingCount: options?.friendshipTrainingCount,
        currentEnergy: options?.currentEnergy,
        maxEnergy: options?.maxEnergy,
        learnedSkills: options?.learnedSkills,
        totalFacilityLevel: options?.totalFacilityLevel,
        isRainbow: TRAINING_TYPES.includes(card?.type) && Number(bondGauge) >= 80,
      }),
      baseValue: effect.value,
      mechanicRule: effect.mechanicRule,
      conditionRule: effect.conditionRule,
      description: effect.description,
    })).filter((effect) => effect.name && (effect.value !== 0 || effect.mechanicRule)) : [],
  };
}

const DISPLAY_COMPARISON_EFFECT_KEYS = new Set([
  'friendship bonus', 'training effectiveness', 'mood effect', 'specialty priority',
  'race bonus', 'fan bonus', 'hint levels', 'hint frequency', 'starting bond',
  'initial skill points', 'wit friendship recovery', 'initial speed', 'initial stamina',
  'initial power', 'initial guts', 'initial wit', 'speed bonus', 'stamina bonus',
  'power bonus', 'guts bonus', 'wit bonus', 'skill point bonus', 'energy cost reduction',
  'event recovery', 'event effectiveness', 'failure protection', 'minigame effectiveness',
  'all stats training bonus',
]);

/**
 * Effective rows shown in the comparison table. Unique effects are included
 * automatically after unlock and folded into the corresponding base effect,
 * matching the reference compare tool instead of exposing an extra toggle.
 */
export function getComparisonEffectEntries(card, lb, facilityLevel = 5, options = {}) {
  if (!card) return [];
  const uniquePassiveEnabled = options?.uniquePassiveEnabled !== false;
  const effects = new Map();
  for (const effect of getCardEffectEntries(card, lb)) {
    const key = effect.key || canonicalSupportEffectKey(effect.name);
    if (!key) continue;
    effects.set(key, { ...effect, key, value: Number(effect.value) || 0, uniqueContribution: false });
  }
  const context = {
    deckComposition: options.deckComposition || DEFAULT_COMPARE_DECK_COMPOSITION,
    supportCardsAtTraining: 1,
    fans: options.fans,
    totalBond: options.totalBond === undefined ? 600 : Math.max(0, Number(options.totalBond) || 0),
    friendshipTrainingCount: options.friendshipTrainingCount,
    currentEnergy: Number(options.currentEnergy ?? options.maxEnergy ?? 120),
    maxEnergy: Number(options.maxEnergy) || 120,
    totalFacilityLevel: Number(options.totalFacilityLevel) || (Number(facilityLevel || 5) * 5),
    learnedSkills: options.learnedSkills,
    uniquePassiveEnabled,
  };
  const state = uniquePassiveEnabled
    ? getCardUniqueEffectState(card, lb, facilityLevel, 100, context.deckComposition, context)
    : { effects: [] };
  const unique = (state.effects || []).filter((effect) => {
    const key = effect.key || canonicalSupportEffectKey(effect.name);
    return key && DISPLAY_COMPARISON_EFFECT_KEYS.has(key)
      && effect.mechanicRule !== UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC
      && Number.isFinite(Number(effect.resolvedValue ?? effect.value));
  });

  // Friendship bonuses are multiplicative with one another.
  const friendshipUniques = unique.filter((effect) => (effect.key || canonicalSupportEffectKey(effect.name)) === 'friendship bonus');
  if (friendshipUniques.length) {
    const key = 'friendship bonus';
    const base = Number(effects.get(key)?.value) || 0;
    const product = friendshipUniques.reduce((value, effect) => value * (1 + (Number(effect.resolvedValue ?? effect.value) || 0) / 100), 1);
    const combined = Math.round(((1 + base / 100) * product - 1) * 10000) / 100;
    const first = friendshipUniques[0];
    effects.set(key, { ...(effects.get(key) || first), key, name: effects.get(key)?.name || first.name, symbol: 'percent', value: combined, uniqueContribution: true });
  }
  // Specialty Priority's unique percentage multiplies the base facility weight
  // (100 + ordinary priority); show the effective priority equivalent.
  const priorityUniques = unique.filter((effect) => (effect.key || canonicalSupportEffectKey(effect.name)) === 'specialty priority');
  if (priorityUniques.length) {
    const key = 'specialty priority';
    const base = Number(effects.get(key)?.value) || 0;
    const multiplier = priorityUniques.reduce((value, effect) => value * (1 + (Number(effect.resolvedValue ?? effect.value) || 0) / 100), 1);
    const combined = Math.round((base + (100 + base) * (multiplier - 1)) * 100) / 100;
    const first = priorityUniques[0];
    effects.set(key, { ...(effects.get(key) || first), key, name: effects.get(key)?.name || first.name, value: combined, uniqueContribution: true });
  }
  for (const effect of unique) {
    const key = effect.key || canonicalSupportEffectKey(effect.name);
    if (key === 'friendship bonus' || key === 'specialty priority') continue;
    const value = Number(effect.resolvedValue ?? effect.value) || 0;
    if (!value) continue;
    const existing = effects.get(key);
    effects.set(key, {
      ...(existing || effect),
      key,
      name: existing?.name || effect.name,
      value: (Number(existing?.value) || 0) + value,
      uniqueContribution: true,
    });
  }
  return [...effects.values()].filter((effect) => Number(effect.value) !== 0);
}

/**
 * Approximate appearance probability for a card's preferred training. Ordinary
 * Specialty Priority adds to the base weight; the unique version multiplies
 * that weight. This is the theoretical turn rate, before training-capacity
 * restrictions, using five training weights of 100 and absence weight 50.
 */
export function getCardSpecialtyChance(card, lb, facilityLevel = 5, bondGauge = 100, options = {}) {
  if (!card || !TRAINING_TYPES.includes(card.type)) return null;
  const baseEffects = baseEffectsForLimitBreak(card, lb);
  const uniqueEffects = options?.uniquePassiveEnabled === false ? [] : unlockedUniqueEffectsForLimitBreak(card, lb);
  const context = {
    facilityLevel,
    facility: card.type,
    cardType: card.type,
    bondGauge,
    isRainbow: Number(bondGauge) >= 80,
    deckComposition: options?.deckComposition || DEFAULT_COMPARE_DECK_COMPOSITION,
    supportCardsAtTraining: Number(options?.supportCardsAtTraining) || 1,
    fans: options?.fans,
    totalBond: options?.totalBond === undefined ? 600 : Math.max(0, Number(options.totalBond) || 0),
    friendshipTrainingCount: options?.friendshipTrainingCount,
    currentEnergy: Number(options?.currentEnergy ?? options?.maxEnergy ?? 120),
    maxEnergy: Number(options?.maxEnergy) || 120,
    learnedSkills: options?.learnedSkills,
    totalFacilityLevel: Number(options?.totalFacilityLevel) || (Number(facilityLevel || 5) * 5),
  };
  const basePriority = baseEffects.get('specialty priority') || 0;
  const uniqueMultiplier = uniqueEffects
    .filter((effect) => effect.key === 'specialty priority')
    .reduce((product, effect) => product * (1 + resolveUniqueEffectValue(effect, context) / 100), 1);
  const preferredWeight = Math.max(0, 100 + basePriority) * uniqueMultiplier;
  const totalWeight = preferredWeight + 450; // Four other facilities (4 × 100) + absence (50).
  return {
    basePriority,
    uniqueMultiplier,
    preferredWeight,
    totalWeight,
    chance: totalWeight > 0 ? (preferredWeight / totalWeight) * 100 : 0,
  };
}

const STAT_NAMES = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit', 'Skill Points'];
function baseRow(scenario, facility, level) {
  const scenarioKey = SCENARIOS.some((item) => item.id === scenario) ? scenario : DEFAULT_SCENARIO;
  const table = BASE_TABLES[scenarioKey] || BASE_TABLES[DEFAULT_SCENARIO] || {};
  const rows = table[facility] || table.Speed || [];
  const row = rows[Math.max(1, Math.min(5, Number(level) || 5)) - 1] || rows[0] || [0, 0, 0, 0, 0, 0, 0];
  return [...row];
}

function roundFloor(value) { return Math.floor(value + 1e-8); }

export function calculateTraining(card, lb, scenario, facilityLevel, mood, maxEnergy, bondGauge = 100, options = {}) {
  const baseEffects = baseEffectsForLimitBreak(card, lb);
  const uniquePassiveEnabled = options?.uniquePassiveEnabled !== false;
  const uniqueEffects = uniquePassiveEnabled ? unlockedUniqueEffectsForLimitBreak(card, lb) : [];
  const baseMood = Number(mood) || 0;
  // Participant bonus is +5% per support card attending the selected training.
  const participatingSupportCards = 1;
  const facilityOrder = ['Speed', 'Stamina', 'Power', 'Guts', 'Wit'];
  const result = {};
  const selectedFacilityLevel = Math.max(1, Math.min(5, Number(facilityLevel) || 5));
  const cap = Math.max(1, Number(maxEnergy) || 120);
  const selectedBondGauge = Math.max(0, Math.min(100, Number(bondGauge ?? 100)));
  const selectedSupportCardsAtTraining = Math.max(1, Math.min(6, Number(options?.supportCardsAtTraining) || 1));
  const selectedCurrentEnergy = Math.max(0, Math.min(cap, Number(options?.currentEnergy ?? cap) || 0));
  const participantMultiplier = 1 + (0.05 * selectedSupportCardsAtTraining);
  const deckComposition = options?.deckComposition || DEFAULT_COMPARE_DECK_COMPOSITION;
  const selectedTotalFacilityLevel = Number(options?.totalFacilityLevel) || (selectedFacilityLevel * 5);
  const deckParameterBonuses = getDeckParameterBonuses(card, lb, selectedBondGauge, deckComposition, { uniquePassiveEnabled });
  const specialty = getCardSpecialtyChance(card, lb, selectedFacilityLevel, selectedBondGauge, {
    uniquePassiveEnabled,
    deckComposition,
    supportCardsAtTraining: selectedSupportCardsAtTraining,
    fans: options?.fans,
    totalBond: options?.totalBond === undefined ? 600 : Math.max(0, Number(options.totalBond) || 0),
    friendshipTrainingCount: options?.friendshipTrainingCount,
    currentEnergy: selectedCurrentEnergy,
    maxEnergy: cap,
    learnedSkills: options?.learnedSkills,
    totalFacilityLevel: selectedTotalFacilityLevel,
  });

  for (const facility of facilityOrder) {
    const typeKey = String(card?.type || '').toLowerCase();
    const isCardTypeTraining = typeKey === facility.toLowerCase();
    // Friendship training needs both a matching facility and bond gauge >= 80.
    const isRainbow = isCardTypeTraining && selectedBondGauge >= 80;
    const context = {
      facilityLevel: selectedFacilityLevel,
      facility,
      cardType: card?.type,
      bondGauge: selectedBondGauge,
      deckComposition,
      supportCardsAtTraining: selectedSupportCardsAtTraining,
      fans: options?.fans,
      totalBond: options?.totalBond === undefined ? 600 : Math.max(0, Number(options.totalBond) || 0),
      friendshipTrainingCount: options?.friendshipTrainingCount,
      currentEnergy: selectedCurrentEnergy,
      maxEnergy: cap,
      learnedSkills: options?.learnedSkills,
      totalFacilityLevel: selectedTotalFacilityLevel,
      isRainbow,
      uniquePassiveEnabled,
    };
    const resolvedUniqueEffects = uniqueEffects.map((effect) => ({
      ...effect,
      value: resolveUniqueEffectValue(effect, context),
    }));
    const effectValue = (name) => summedEffectValue(baseEffects, resolvedUniqueEffects, name);

    // Mood Effect and Training Effectiveness sum within their own category.
    const moodEffect = effectValue('mood effect');
    const trainingEffectiveness = effectValue('training effectiveness');
    const moodMultiplier = 1 + baseMood * (1 + moodEffect / 100);
    const trainingMultiplier = (1 + trainingEffectiveness / 100) * participantMultiplier;

    // Friendship Bonus is a product of each independent bonus, only on rainbow.
    const baseFriendship = baseEffects.get('friendship bonus') || 0;
    const uniqueFriendship = resolvedUniqueEffects
      .filter((effect) => effect.key === 'friendship bonus')
      .reduce((product, effect) => product * (1 + effect.value / 100), 1);
    const friendshipMultiplier = isRainbow
      ? (1 + baseFriendship / 100) * uniqueFriendship
      : 1;
    const multiplier = moodMultiplier * trainingMultiplier * friendshipMultiplier;
    const base = baseRow(scenario, facility, selectedFacilityLevel);
    const statValues = {};
    STAT_NAMES.forEach((name, index) => {
      const statBase = base[index] || 0;
      const bonusKey = name === 'Skill Points' ? 'skill point bonus' : `${name.toLowerCase()} bonus`;
      const deckBonus = Number(deckParameterBonuses[name]) || 0;
      const flatBonus = statBase > 0 ? effectValue(bonusKey) + effectValue('all stats training bonus') + deckBonus : 0;
      const growthRate = Math.max(-100, Math.min(100, Number(options?.growthRates?.[name]) || 0));
      const raw = (statBase + flatBonus) * multiplier * (1 + growthRate / 100);
      if (raw > 0) statValues[name] = roundFloor(raw);
    });

    const currentEnergyBeforeTraining = selectedCurrentEnergy;
    const energyBase = base[6] || 0;
    const energyCostReduction = Math.max(0, Math.min(100, effectValue('energy cost reduction')));
    let energy = energyBase;
    if (energyBase < 0) {
      // Energy cost reductions apply multiplicatively to cost; fractional costs
      // are rounded upward (toward zero), matching the game reference.
      energy = -Math.ceil(Math.abs(energyBase) * (1 - energyCostReduction / 100) - 1e-8);
    } else if (facility === 'Wit' && isRainbow) {
      // Wit Friendship Recovery is a flat increase to the usual +5 energy,
      // and only activates on a Wit rainbow, not ordinary Wit training.
      energy += effectValue('wit friendship recovery');
    }

    result[facility] = {
      facility,
      stats: statValues,
      energy,
      energyCap: cap,
      startingEnergy: currentEnergyBeforeTraining,
      energyAfterFromFull: Math.max(0, Math.min(cap, currentEnergyBeforeTraining + energy)),
      rainbow: isRainbow,
      specialty,
      appliedEffects: {
        moodEffect,
        trainingEffectiveness,
        supportCardsAtTraining: selectedSupportCardsAtTraining,
        participantMultiplier,
        allStatsTrainingBonus: effectValue('all stats training bonus'),
        deckParameterBonus: deckParameterBonuses,
        friendshipBonus: isRainbow ? Math.round((friendshipMultiplier - 1) * 100 * 1e8) / 1e8 : 0,
        specialtyPriority: specialty?.chance ?? null,
        energyCostReduction,
        witFriendshipRecovery: facility === 'Wit' && isRainbow ? effectValue('wit friendship recovery') : 0,
      },
    };
  }
  return result;
}

export function getCardTrainingLevel(card, lb) { return levelForLimitBreak(card, lb); }
