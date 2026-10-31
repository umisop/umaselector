import { normalizeGlobalSupportCards, getCardUniqueEffectState, UNIQUE_EFFECT_MECHANICS } from '../src/lib/supportCardCompare.js';

const sourceUrl = 'https://beta.daftuyda.moe/assets/support_hints.json';
const response = await fetch(sourceUrl, { headers: { Accept: 'application/json' } });
if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
const raw = await response.json();
const cards = normalizeGlobalSupportCards(raw);
if (cards.length < 200) throw new Error(`Global catalog looks incomplete (${cards.length} cards); refusing to report an audit.`);
const ssr = cards.filter((card) => card.rarity === 'SSR');
const unsupported = [];
const noUnique = [];
const mechanics = new Map();
for (const card of ssr) {
  if (!card.unique?.effects?.length) { noUnique.push({ id: card.id, name: card.name }); continue; }
  const state = getCardUniqueEffectState(card, 4, 5, 100, undefined, {
    totalBond: 600, currentEnergy: 120, maxEnergy: 120, totalFacilityLevel: 25,
    fans: 1000000, friendshipTrainingCount: 10, learnedSkills: 10,
  });
  for (const effect of state.effects) {
    const key = effect.mechanicRule || 'static-or-unclassified';
    mechanics.set(key, (mechanics.get(key) || 0) + 1);
    if (effect.mechanicRule === UNIQUE_EFFECT_MECHANICS.UNSUPPORTED_DYNAMIC
      || effect.conditionRule === 'unsupported-condition') {
      unsupported.push({ id: card.id, name: card.name, effect: effect.name, mechanic: effect.mechanicRule, condition: effect.conditionRule, description: effect.description });
    }
  }
}
const report = {
  source: sourceUrl,
  generatedAt: new Date().toISOString(),
  globalCardCount: cards.length,
  ssrCount: ssr.length,
  ssrWithUniqueEffects: ssr.length - noUnique.length,
  ssrWithoutUniqueEffects: noUnique,
  uniqueMechanicCounts: Object.fromEntries([...mechanics.entries()].sort(([a],[b]) => a.localeCompare(b))),
  unresolvedUniqueEffects: unsupported,
  scopeNote: 'This is a parser coverage audit of the live Global catalogue, not independent verification of every card against GameTora, Uma.guide, and GameWith. Career-dependent inputs use explicit high-value probe assumptions and require manual source review.',
};
console.log(JSON.stringify(report, null, 2));
