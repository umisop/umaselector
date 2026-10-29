import assert from 'node:assert/strict';
import { calculateTraining, canonicalSupportEffectKey, effectsForLimitBreak, getCardEffectEntries, getComparisonEffectEntries, getCardSpecialtyChance, getCardTrainingLevel, getCardUniqueEffectState, getSupportEffectScope, getUniqueEffectDescription, hasFacilityLevelScaledUniquePassive, getDeckStartingStatsBonuses, getDeckParameterBonuses, normalizeGlobalSupportCards, DEFAULT_COMPARE_DECK_COMPOSITION, SCENARIOS, DEFAULT_SCENARIO, SUPPORT_EFFECT_SCOPES } from '../src/lib/supportCardCompare.js';

const progression = (valueAtIndex, value) => Array.from({ length: 11 }, (_, index) => index === valueAtIndex ? value : 0);
const rawCards = [
  {
    SupportServer: 'global', SupportId: '30028', SupportSlug: 'kitasan-black', SupportName: 'Kitasan Black (SSR)', SupportRarity: 'SSR', SupportType: 'Speed', SupportImage: '/assets/support_thumbs/30028-kitasan-black.png',
    SupportEffects: [
      { id: 1, name: 'Friendship Bonus', symbol: 'percent', values: progression(9, 25) },
      { id: 2, name: 'Mood Effect', symbol: 'percent', values: progression(9, 30) },
      { id: 8, name: 'Training Effectiveness', symbol: 'percent', values: progression(9, 10) },
      { id: 5, name: 'Power Bonus', symbol: 'none', values: progression(9, 1) },
    ],
    SupportUnique: { level: 40, effects: [{ id: 15, name: 'Race Bonus', symbol: 'percent', value: 5 }] },
  },
  { SupportServer: 'jp', SupportId: '99001', SupportName: 'JP only card', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [] },
];
const cards = normalizeGlobalSupportCards(rawCards);
assert.equal(cards.length, 1, 'only Global cards should be normalized');
assert.equal(cards[0].id, '30028');
assert.equal(cards[0].imageUrl, 'https://beta.daftuyda.moe/assets/support_thumbs/30028-kitasan-black.png');
assert.equal(getCardTrainingLevel(cards[0], 0), 30);
assert.equal(getCardTrainingLevel(cards[0], 3), 45);
assert.equal(getCardTrainingLevel({ rarity: 'SR' }, 4), 45);
assert.equal(getCardTrainingLevel({ rarity: 'R' }, 4), 40);
assert.equal(effectsForLimitBreak(cards[0], 3).get('friendship bonus'), 25);
assert.equal(effectsForLimitBreak(cards[0], 1).get('race bonus'), undefined, 'unique effect must remain locked below the unlock level');
assert.equal(effectsForLimitBreak(cards[0], 2).get('race bonus'), 5, 'unique effect should apply at its unlock level');
assert.equal(effectsForLimitBreak(cards[0], 3).get('training effectiveness'), 10);
assert.equal(SCENARIOS.length, 2, 'Grand Masters and Grand Concert are enabled in the comparison scenario config');
assert.deepEqual(SCENARIOS.map((scenario) => scenario.id), ['grand-masters', 'grand-concert']);
assert.equal(DEFAULT_SCENARIO, 'grand-masters', 'Grand Masters remains the default for current site users');
assert.equal(getCardEffectEntries(cards[0], 3).find((effect) => effect.name === 'Friendship Bonus')?.value, 25);
assert.equal(getCardUniqueEffectState(cards[0], 1).unlocked, false);
assert.equal(getCardUniqueEffectState(cards[0], 2).unlocked, true);
const result = calculateTraining(cards[0], 3, 'grand-masters', 5, 0.2, 120);
assert.equal(result.Speed.rainbow, true);
assert.equal(result.Speed.stats.Speed, 25);
assert.equal(result.Speed.stats.Power, 10);
assert.equal(result.Speed.stats['Skill Points'], 9);
assert.equal(result.Speed.energy, -25);
assert.equal(result.Speed.energyAfterFromFull, 95);
assert.equal(result.Stamina.rainbow, false);
assert.equal(result.Stamina.stats.Power, undefined, 'flat stat bonus must not create a stat not given by the facility');

// Unique Friendship Bonus is multiplicative with the card's normal Friendship Bonus.
const uniqueFriendshipCard = {
  ...cards[0],
  unique: { level: 40, effects: [{ id: 999, name: 'Friendship Bonus', symbol: 'percent', value: 10 }] },
};
const uniqueFriendshipResult = calculateTraining(uniqueFriendshipCard, 3, 'grand-masters', 5, 0.2, 120);
assert.equal(uniqueFriendshipResult.Speed.stats.Speed, 28, '25% base friendship and 10% unique friendship use 1.25 × 1.10, not a summed 35%');
const uniqueFriendshipDisabled = calculateTraining(uniqueFriendshipCard, 3, 'grand-masters', 5, 0.2, 120, 100, { uniquePassiveEnabled: false }).Speed;
assert.equal(uniqueFriendshipResult.Speed.appliedEffects.friendshipBonus, 37.5, 'unique passive ON includes the unique Friendship Bonus multiplier');
assert.equal(uniqueFriendshipDisabled.appliedEffects.friendshipBonus, 25, 'unique passive OFF leaves only the card base Friendship Bonus');
assert.ok(uniqueFriendshipDisabled.stats.Speed < uniqueFriendshipResult.Speed.stats.Speed, 'turning the unique passive off reduces the unique-derived training gain');

// Grand Masters level-5 source values remain [base stat gain values, SP, energy].
const noEffectCard = { id: '99999', name: 'No Effect Card', rarity: 'SSR', type: 'Guts', effects: [], unique: null };
const grandConcertBase = calculateTraining(noEffectCard, 0, 'grand-concert', 5, 0, 120);
assert.equal(grandConcertBase.Speed.stats.Speed, 12, 'Grand Concert level-5 Speed base matches the reference comparison table');
assert.equal(grandConcertBase.Speed.stats.Power, 6, 'Grand Concert level-5 Power base matches the reference comparison table');
assert.equal(grandConcertBase.Speed.stats['Skill Points'], 4, 'Grand Concert base Skill Points match the reference comparison table');
const gmLevelFive = calculateTraining(noEffectCard, 0, 'grand-masters', 5, 0, 120);
assert.equal(gmLevelFive.Speed.stats.Speed, 14, 'Grand Masters level-5 Speed base remains +14');
assert.equal(gmLevelFive.Speed.stats.Power, 5, 'Grand Masters level-5 Speed training base Power remains +5');
assert.equal(gmLevelFive.Speed.stats['Skill Points'], 5, 'Grand Masters base Skill Points remain +5');
const fallback = calculateTraining(cards[0], 0, 'not-enabled-yet', 5, 0, 120);
assert.equal(fallback.Speed.stats['Skill Points'], 5, 'unknown future scenario IDs fall back safely to the configured active scenario');

// Maruzensky SSR's unique effect is a mechanic, not a flat +5%: it adds
// Training Effectiveness equal to 5% × the current facility level. The current
// Global catalog omits its explanatory prose, so the generic signature includes
// the lone unique effect plus absence of a normal Training Effectiveness effect.
const effectAt = (value) => Array.from({ length: 11 }, () => value);
const maruzensky = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30107', SupportSlug: 'maruzensky-ssr', SupportName: 'Maruzensky (SSR)', SupportRarity: 'SSR', SupportType: 'Speed',
  SupportEffects: [
    { id: 1, name: 'Friendship Bonus', symbol: 'percent', values: effectAt(0).map((_, i) => ({ 6: 20, 7: 21, 8: 23, 9: 25, 10: 25 }[i] ?? 0)) },
    { id: 2, name: 'Speed Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 6 ? 1 : 0) },
    { id: 3, name: 'Power Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 7 ? 1 : 0) },
    { id: 4, name: 'Mood Effect', symbol: 'percent', values: effectAt(0).map((_, i) => i === 9 ? 15 : i === 10 ? 30 : 0) },
  ],
  SupportUnique: { level: 30, effects: [{ id: 1111, name: 'Training Effectiveness', symbol: 'percent', value: 5 }] },
}])[0];
const maruLv0 = calculateTraining(maruzensky, 0, 'grand-masters', 5, 0.2, 120).Speed;
const maruLv1 = calculateTraining(maruzensky, 1, 'grand-masters', 5, 0.2, 120).Speed;
assert.deepEqual([maruLv0.stats.Speed, maruLv0.stats.Power, maruLv0.stats['Skill Points']], [28, 9, 9], 'Maruzensky SSR LB0 matches facility-scaled unique effect');
const maruUniqueOff = calculateTraining(maruzensky, 1, 'grand-masters', 5, 0.2, 120, 100, { uniquePassiveEnabled: false }).Speed;
assert.equal(maruLv1.appliedEffects.trainingEffectiveness, 25, 'Maruzensky unique passive ON scales to 25% at facility level 5');
assert.equal(maruUniqueOff.appliedEffects.trainingEffectiveness, 0, 'Maruzensky unique passive OFF excludes its facility-scaled effect');
assert.deepEqual([maruLv1.stats.Speed, maruLv1.stats.Power, maruLv1.stats['Skill Points']], [28, 11, 9], 'Maruzensky SSR LB1 matches GameTora reference');
assert.equal(maruLv1.appliedEffects.trainingEffectiveness, 25, 'facility Lv5 resolves unique Training Effectiveness to 25%');
const maruExpectedByLb = [[28,9,9], [28,11,9], [29,11,9], [30,12,10], [31,12,10]];
for (let lb = 0; lb <= 4; lb += 1) {
  const output = calculateTraining(maruzensky, lb, 'grand-masters', 5, 0.2, 120).Speed;
  assert.deepEqual([output.stats.Speed, output.stats.Power, output.stats['Skill Points']], maruExpectedByLb[lb], `Maruzensky SSR LB${lb} matches expected reference values`);
}
assert.equal(calculateTraining(maruzensky, 1, 'grand-masters', 4, 0.2, 120).Speed.appliedEffects.trainingEffectiveness, 20, 'unique effect scales down with facility level 4');
const maruUniqueState = getCardUniqueEffectState(maruzensky, 1, 5);
assert.equal(maruUniqueState.effects[0].resolvedValue, 25);
assert.match(getUniqueEffectDescription(maruUniqueState.effects[0], 5), /25%.*5%\/Lv/);

// Regression against the actual raw catalog shape. Unique mechanic type 111
// is exported as Effect #111 with value 8 (target effect type: Training
// Effectiveness). The live export omits the per-level parameter entirely; the
// confirmed game mechanic is +5 Training Effectiveness per facility level. The
// calculator must handle the actual raw payload, not only a richer test fixture.
const rawMaruzensky = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30107', SupportSlug: 'maruzensky-ssr-raw', SupportName: 'Maruzensky (SSR raw schema)', SupportRarity: 'SSR', SupportType: 'Speed',
  SupportEffects: [
    { id: 1, name: 'Friendship Bonus', symbol: 'percent', values: effectAt(0).map((_, i) => ({ 6: 20, 7: 21, 8: 23, 9: 25, 10: 25 }[i] ?? 0)) },
    { id: 3, name: 'Speed Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 6 ? 1 : 0) },
    { id: 5, name: 'Power Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 7 ? 1 : 0) },
    { id: 2, name: 'Mood Effect', symbol: 'percent', values: effectAt(0).map((_, i) => i === 9 ? 15 : i === 10 ? 30 : 0) },
  ],
  SupportUnique: { level: 30, effects: [{ id: 111, name: 'Effect #111', symbol: 'none', value: 8 }] },
}])[0];
assert.equal(rawMaruzensky.unique.effects[0].name, 'Training Effectiveness', 'raw unique type 111 must be translated to its target bonus name');
assert.equal(rawMaruzensky.unique.effects[0].value, 25, 'raw type 111 preserves the maximum +25% at facility level 5');
assert.equal(hasFacilityLevelScaledUniquePassive(rawMaruzensky), true, 'facility-level unique passives are detected as the special automatic exception');
assert.match(rawMaruzensky.unique.effects[0].description, /Gains 5 for every level of the current training facility/);
const rawMaruOn = calculateTraining(rawMaruzensky, 1, 'grand-masters', 5, 0.2, 120, 100, { uniquePassiveEnabled: true }).Speed;
const rawMaruOff = calculateTraining(rawMaruzensky, 1, 'grand-masters', 5, 0.2, 120, 100, { uniquePassiveEnabled: false }).Speed;
assert.deepEqual([rawMaruOn.stats.Speed, rawMaruOn.stats.Power, rawMaruOn.stats['Skill Points']], [28, 11, 9], 'raw Maruzensky unique effect ON matches the comparison reference');
assert.deepEqual([rawMaruOff.stats.Speed, rawMaruOff.stats.Power, rawMaruOff.stats['Skill Points']], [22, 9, 7], 'raw Maruzensky unique effect OFF reproduces the no-unique baseline');
assert.equal(rawMaruOn.appliedEffects.trainingEffectiveness, 25, 'raw unique type 111 affects the stat calculator, not only the display label');
const maruComparisonRows = getComparisonEffectEntries(rawMaruzensky, 1, 5);
assert.equal(maruComparisonRows.find((effect) => effect.key === 'training effectiveness')?.value, 25, 'comparison table folds the unique +25% into the Training Effectiveness row');
assert.equal(getComparisonEffectEntries(rawMaruzensky, 1, 5, { uniquePassiveEnabled: false }).some((effect) => effect.key === 'training effectiveness'), false, 'Passive OFF removes the Maruzensky unique Training Effectiveness row');
assert.equal(getComparisonEffectEntries(rawMaruzensky, 1, 5, { uniquePassiveEnabled: true }).find((effect) => effect.key === 'training effectiveness')?.value, 25, 'Passive ON includes Maruzensky facility scaling in the effect table');
assert.equal(maruComparisonRows.some((effect) => /effect #111/i.test(effect.name)), false, 'comparison table never renders raw Effect #111 as a user-facing effect');
assert.equal(getComparisonEffectEntries(rawMaruzensky, 1, 4).find((effect) => effect.key === 'training effectiveness')?.value, 20, 'effect table follows selected facility level');
assert.equal(calculateTraining(rawMaruzensky, 1, 'grand-masters', 4, 0.2, 120, 100, { uniquePassiveEnabled: true }).Speed.appliedEffects.trainingEffectiveness, 20, 'raw unique type 111 follows the chosen facility level');

// Reproduce alternate raw schemas and, crucially, the exact sparse live payload
// that has no numeric values array. The old code marked this effect unsupported.
for (const rawUniqueEffect of [
  { typeId: 111, id: 8, name: 'Effect #111', symbol: 'none', value: 8, values: [5, 0, 0, 0] },
  { name: 'Effect #111', symbol: 'none', value: 8 },
  { name: 'Effect #111: 8', symbol: 'none' },
  { typeId: 111, id: 8, name: 'Effect #111', symbol: 'none', value: 0 },
  { name: 'Effect#111', symbol: 'none', value: 8, value_0_1: 5 },
  { typeId: 111, id: 8, name: 'Training Effectiveness', symbol: 'percent', value: 8 },
]) {
  const aliasMaru = normalizeGlobalSupportCards([{
    SupportServer: 'global', SupportId: '30107', SupportName: 'Maruzensky (alternate unique schema)', SupportRarity: 'SSR', SupportType: 'Speed',
    SupportEffects: [
      { id: 1, name: 'Friendship Bonus', symbol: 'percent', values: effectAt(0).map((_, i) => ({ 6: 20, 7: 21, 8: 23, 9: 25, 10: 25 }[i] ?? 0)) },
      { id: 3, name: 'Speed Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 6 ? 1 : 0) },
      { id: 5, name: 'Power Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 7 ? 1 : 0) },
      { id: 2, name: 'Mood Effect', symbol: 'percent', values: effectAt(0).map((_, i) => i === 9 ? 15 : i === 10 ? 30 : 0) },
    ],
    SupportUnique: { level: 30, effects: [rawUniqueEffect] },
  }])[0];
  assert.equal(aliasMaru.unique.effects[0].name, 'Training Effectiveness', 'alternate raw type alias is decoded to Training Effectiveness');
  assert.equal(aliasMaru.unique.effects[0].sourceTypeId, 111, 'raw mechanic type 111 is preserved for debugability');
  assert.equal(aliasMaru.unique.effects[0].value, 25, 'alternate raw schema decodes the per-level parameter');
  const aliasOutput = calculateTraining(aliasMaru, 1, 'grand-masters', 5, 0.2, 120, 100, { uniquePassiveEnabled: true }).Speed;
  assert.deepEqual([aliasOutput.stats.Speed, aliasOutput.stats.Power, aliasOutput.stats['Skill Points']], [28, 11, 9], 'alternate raw schema fixes the actual visible Maruzensky result');
  assert.equal(aliasOutput.appliedEffects.trainingEffectiveness, 25, 'alternate raw schema contributes +25% Training Effectiveness at facility level 5');
}
const rawMaruzenskyMissingParameter = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30112', SupportName: 'Raw facility mechanic without parameter', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 111, name: 'Effect #111', symbol: 'none', value: 8 }] },
}])[0];
const missingParameterState = getCardUniqueEffectState(rawMaruzenskyMissingParameter, 0, 5);
assert.equal(missingParameterState.effects[0].name, 'Training Effectiveness', 'sparse type 111 resolves its target effect correctly');
assert.equal(missingParameterState.effects[0].resolvedValue, 25, 'sparse type 111 applies the documented +5% per facility level mechanic');
const unknownTargetWithoutParameter = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30113', SupportName: 'Unknown target no parameter', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 111, name: 'Effect #111', symbol: 'none', value: 5 }] },
}])[0];
assert.equal(getCardUniqueEffectState(unknownTargetWithoutParameter, 0, 5).effects[0].mechanicRule, 'unsupported-dynamic', 'unknown target effects remain unsupported instead of guessing a value');

const rawPerOtherSupport = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30108', SupportName: 'Raw per-support mechanic', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 110, name: 'Effect #110', symbol: 'none', value: 8, values: [5, 0, 0, 0] }] },
}])[0];
assert.equal(calculateTraining(rawPerOtherSupport, 0, 'grand-masters', 5, 0, 120, 100, { uniquePassiveEnabled: true, supportCardsAtTraining: 3 }).Speed.appliedEffects.trainingEffectiveness, 10, 'raw unique type 110 scales per additional support on the same training');
const rawRainbowOnly = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30109', SupportName: 'Raw friendship-only mechanic', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 113, name: 'Effect #113', symbol: 'none', value: 8, values: [5, 0, 0, 0] }] },
}])[0];
const rawRainbowOutputs = calculateTraining(rawRainbowOnly, 0, 'grand-masters', 5, 0, 120, 100, { uniquePassiveEnabled: true });
assert.equal(rawRainbowOutputs.Speed.appliedEffects.trainingEffectiveness, 5, 'raw unique type 113 activates on friendship training');
assert.equal(rawRainbowOutputs.Power.appliedEffects.trainingEffectiveness, 0, 'raw unique type 113 does not activate off specialty');
const rawFriendshipCountScaling = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30111', SupportName: 'Raw friendship count mechanic', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 106, name: 'Effect #106', symbol: 'none', value: 3, values: [8, 2, 0, 0] }] },
}])[0];
assert.equal(calculateTraining(rawFriendshipCountScaling, 0, 'grand-masters', 5, 0, 120, 60, { uniquePassiveEnabled: true, friendshipTrainingCount: 2 }).Power.appliedEffects.trainingEffectiveness, 4, 'raw unique type 106 uses prior friendship-training count without requiring the current turn to be a rainbow');
const rawNextTurn = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30110', SupportName: 'Raw next-turn mechanic', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 122, name: 'Effect #122', symbol: 'none', value: 8, values: [5, 0, 0, 0] }] },
}])[0];
assert.equal(calculateTraining(rawNextTurn, 0, 'grand-masters', 5, 0, 120, 100, { uniquePassiveEnabled: true }).Speed.appliedEffects.trainingEffectiveness, 0, 'raw unique type 122 is not incorrectly counted as a current-turn training bonus');

// Explicit mechanic metadata should win over the compatibility signature, and
// a stated flat effect should not be facility-scaled.
const explicitDynamic = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30108', SupportName: 'Dynamic unique test', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 501, name: 'Training Effectiveness', symbol: 'percent', value: 3, description: 'Gain Training Effectiveness (3) per every level of the current training facility.' }] },
}])[0];
const flatExplicit = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30109', SupportName: 'Flat unique test', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 502, name: 'Training Effectiveness', symbol: 'percent', value: 5, description: 'Increases training effectiveness by 5%.' }] },
}])[0];
assert.equal(calculateTraining(explicitDynamic, 0, 'grand-masters', 4, 0, 120).Speed.appliedEffects.trainingEffectiveness, 12);
assert.equal(calculateTraining(flatExplicit, 0, 'grand-masters', 4, 0, 120).Speed.appliedEffects.trainingEffectiveness, 5);
const growthResult = calculateTraining(maruzensky, 1, 'grand-masters', 5, 0.2, 120, 100, { growthRates: { Speed: 20 } }).Speed;
assert.equal(growthResult.stats.Speed, 34, 'selected trainee growth multiplies the final Speed training stat');
assert.equal(growthResult.stats.Power, 11, 'Speed growth does not affect Power');

// Kitasan Black's unique effect includes both Training Effectiveness +5 and
// Specialty Priority +20, while the card also has normal Training Effectiveness.
// It must remain a flat +5 rather than being multiplied by facility level.
const kitasanFlatUnique = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30028', SupportName: 'Kitasan Black (SSR)', SupportRarity: 'SSR', SupportType: 'Speed',
  SupportEffects: [
    { id: 8, name: 'Training Effectiveness', symbol: 'percent', values: effectAt(0).map((_, i) => i >= 9 ? 10 : 5) },
  ],
  SupportUnique: { level: 30, effects: [
    { id: 801, name: 'Training Effectiveness', symbol: 'percent', value: 5 },
    { id: 802, name: 'Specialty Priority', symbol: 'none', value: 20 },
  ] },
}])[0];
assert.equal(calculateTraining(kitasanFlatUnique, 4, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 15, 'Kitasan base +10 and flat unique +5 remain additive');
assert.equal(getCardUniqueEffectState(kitasanFlatUnique, 4, 5).effects.find((effect) => effect.name === 'Training Effectiveness')?.resolvedValue, 5, 'Kitasan unique Training Effectiveness is not facility-scaled');
assert.equal(hasFacilityLevelScaledUniquePassive(kitasanFlatUnique), false, 'flat unique passives use the generic ON/OFF toggle');

// Canonical names cover the effect variants present in support card data.
assert.equal(canonicalSupportEffectKey('Wisdom Bonus'), 'wit bonus');
assert.equal(canonicalSupportEffectKey('Skill Points Bonus'), 'skill point bonus');
assert.equal(canonicalSupportEffectKey('Energy Consumption Reduction'), 'energy cost reduction');
assert.equal(canonicalSupportEffectKey('Wit Friendship Recovery'), 'wit friendship recovery');
assert.equal(canonicalSupportEffectKey('Special: All Stats Training Bonus'), 'all stats training bonus');
assert.equal(canonicalSupportEffectKey('Unique: Extra Training Location Appearances'), 'extra training location appearances');
assert.equal(canonicalSupportEffectKey('Initial Skill Points'), 'initial skill points');
assert.equal(getSupportEffectScope('Friendship Bonus'), SUPPORT_EFFECT_SCOPES.TRAINING_GAIN);
assert.equal(getSupportEffectScope('Wisdom Bonus'), SUPPORT_EFFECT_SCOPES.TRAINING_GAIN);
assert.equal(getSupportEffectScope('Energy Cost Reduction'), SUPPORT_EFFECT_SCOPES.TRAINING_ENERGY);
assert.equal(getSupportEffectScope('Specialty Priority'), SUPPORT_EFFECT_SCOPES.TRAINING_APPEARANCE);
assert.equal(getSupportEffectScope('Initial Speed'), SUPPORT_EFFECT_SCOPES.CAREER_START);
assert.equal(getSupportEffectScope('Race Bonus'), SUPPORT_EFFECT_SCOPES.RACE_REWARD);
assert.equal(getSupportEffectScope('Hint Frequency'), SUPPORT_EFFECT_SCOPES.HINT_EVENT);
assert.equal(getSupportEffectScope('Event Effectiveness'), SUPPORT_EFFECT_SCOPES.SUPPORT_EVENT);
assert.equal(getSupportEffectScope('Failure Protection'), SUPPORT_EFFECT_SCOPES.FAILURE_CHANCE);
assert.equal(getSupportEffectScope('Special: All Stats Training Bonus'), SUPPORT_EFFECT_SCOPES.TRAINING_GAIN);
assert.equal(getSupportEffectScope('Unique: Extra Training Location Appearances'), SUPPORT_EFFECT_SCOPES.TRAINING_APPEARANCE);
assert.equal(getSupportEffectScope('Unique: Extra Bond Gain'), SUPPORT_EFFECT_SCOPES.BOND_PROGRESSION);
assert.equal(getSupportEffectScope('Initial Skill Points'), SUPPORT_EFFECT_SCOPES.CAREER_START);

// Specialty Priority has a separate mechanic: ordinary priority adds to 100,
// while the unique priority multiplies the resulting weight (UmaGuide example).
const kitasanPriorityCard = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30028', SupportName: 'Kitasan Black (SSR)', SupportRarity: 'SSR', SupportType: 'Speed',
  SupportEffects: [
    { id: 20, name: 'Specialty Priority', symbol: 'none', values: effectAt(0).map((_, i) => i >= 9 ? 80 : 0) },
    { id: 21, name: 'Training Effectiveness', symbol: 'percent', values: effectAt(0).map((_, i) => i >= 9 ? 10 : 0) },
  ],
  SupportUnique: { level: 40, effects: [
    { id: 22, name: 'Training Effectiveness', symbol: 'percent', value: 5 },
    { id: 23, name: 'Specialty Priority', symbol: 'percent', value: 20 },
  ] },
}])[0];
const specialtyAtMlb = getCardSpecialtyChance(kitasanPriorityCard, 4, 5, 100);
assert.equal(specialtyAtMlb.preferredWeight, 216, 'base priority 80 adds to 100, then unique +20% multiplies 180 to 216');
assert.equal(Number(specialtyAtMlb.chance.toFixed(1)), 32.4, 'preferred-training chance matches the reference example');
const specialtyWithUniqueOff = getCardSpecialtyChance(kitasanPriorityCard, 4, 5, 100, { uniquePassiveEnabled: false });
assert.equal(specialtyWithUniqueOff.preferredWeight, 180, 'unique passive OFF removes the unique Specialty Priority multiplier');

// Bond threshold controls rainbow Friendship Bonus and unique effects gated on
// orange bond. Below 80, the matching facility is not marked as rainbow.
const maruBelowOrange = calculateTraining(maruzensky, 1, 'grand-masters', 5, 0.2, 120, 79).Speed;
assert.equal(maruBelowOrange.rainbow, false);
assert.equal(maruBelowOrange.appliedEffects.friendshipBonus, 0);
const maruAtOrange = calculateTraining(maruzensky, 1, 'grand-masters', 5, 0.2, 120, 80).Speed;
assert.equal(maruAtOrange.rainbow, true);
assert.equal(maruAtOrange.appliedEffects.friendshipBonus, 21);

const bondGatedUnique = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30111', SupportName: 'Bond-gated test', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 511, name: 'Power Bonus', symbol: 'none', value: 2, description: 'Gain Power Bonus +2 when bond gauge is 80 or more.' }] },
}])[0];
const gated79 = calculateTraining(bondGatedUnique, 0, 'grand-masters', 5, 0, 120, 79).Speed;
const gated80 = calculateTraining(bondGatedUnique, 0, 'grand-masters', 5, 0, 120, 80).Speed;
assert.equal(gated79.stats.Power, 5, 'bond-gated unique remains inactive below 80');
assert.equal(gated80.stats.Power, 7, 'bond-gated flat stat bonus activates at 80+');
assert.match(getUniqueEffectDescription(getCardUniqueEffectState(bondGatedUnique, 0, 5).effects[0], 5), /Bond 80\+/);


// A special all-parameter training bonus is a flat +1 to every stat and skill
// point gained by that training, but only at its specific bond threshold (100).
const allStatsAtBond100 = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30117', SupportName: 'All-stats unique', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: {
    level: 30,
    description: 'When bond gauge is 100 or higher, gain all parameters and skill point bonus.',
    effects: [
      { id: 610, name: 'Special: All Stats Training Bonus', symbol: 'none', value: 1 },
      { id: 611, name: 'Skill Point Bonus', symbol: 'none', value: 1 },
    ],
  },
}])[0];
const statsAt99 = calculateTraining(allStatsAtBond100, 0, 'grand-masters', 5, 0, 120, 99).Speed;
const statsAt100 = calculateTraining(allStatsAtBond100, 0, 'grand-masters', 5, 0, 120, 100).Speed;
assert.deepEqual([statsAt99.stats.Speed, statsAt99.stats.Power, statsAt99.stats['Skill Points']], [14, 5, 5], 'bond 99 leaves all-stat training bonus inactive');
assert.deepEqual([statsAt100.stats.Speed, statsAt100.stats.Power, statsAt100.stats['Skill Points']], [15, 6, 7], 'bond 100 applies all-stat +1 and Skill Point +1 before training multipliers');
assert.equal(getCardUniqueEffectState(allStatsAtBond100, 0, 5, 99).effects.find((effect) => effect.key === 'all stats training bonus')?.resolvedValue, 0);
assert.match(getUniqueEffectDescription(getCardUniqueEffectState(allStatsAtBond100, 0, 5, 99).effects.find((effect) => effect.key === 'all stats training bonus'), 5), /inactive at selected bond/);
assert.equal(getCardUniqueEffectState(allStatsAtBond100, 0, 5, 100).effects.find((effect) => effect.key === 'all stats training bonus')?.resolvedValue, 1);

// Extra appearance and failure-rate unique effects are reported as their own
// mechanics rather than incorrectly being added to training stat totals.
const appearanceAndFailureMechanics = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30118', SupportName: 'Appearance and failure mechanics', SupportRarity: 'SSR', SupportType: 'Pal', SupportEffects: [],
  SupportUnique: {
    level: 30,
    description: 'At bond gauge 60 or higher, this support may appear in two training locations. Failure rate may be reduced to 0% when training occurs.',
    effects: [
      { id: 620, name: 'Unique: Extra Training Location Appearances', symbol: 'none', value: 1 },
      { id: 621, name: 'Unique: Chance to Set Failure Rate to 0%', symbol: 'percent', value: 20 },
    ],
  },
}])[0];
const locationAt59 = getCardUniqueEffectState(appearanceAndFailureMechanics, 0, 5, 59).effects.find((effect) => effect.key === 'extra training location appearances');
const locationAt60 = getCardUniqueEffectState(appearanceAndFailureMechanics, 0, 5, 60).effects.find((effect) => effect.key === 'extra training location appearances');
assert.equal(locationAt59.resolvedValue, 0, 'extra locations are inactive below the source bond threshold');
assert.equal(locationAt60.resolvedValue, 1, 'extra location appearance activates at bond 60');
assert.match(getUniqueEffectDescription(locationAt59, 5), /inactive below Bond 60/);
const failureZero = getCardUniqueEffectState(appearanceAndFailureMechanics, 0, 5, 100).effects.find((effect) => effect.key === 'failure rate zero chance');
assert.equal(failureZero.mechanicRule, 'failure-rate-zero-chance');
assert.match(getUniqueEffectDescription(failureZero, 5), /20% chance to set training failure rate to 0%/);

// Deck-composition unique effects are resolved from the entered other five cards;
// incomplete deck counts must not leak into the calculated training total.
const deckDependentUnique = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30119', SupportName: 'Deck-dependent unique', SupportRarity: 'SSR', SupportType: 'Guts', SupportEffects: [],
  SupportUnique: { level: 30, description: 'When bond gauge is 80 or higher, gain parameter bonus for every support type in deck.', effects: [{ id: 630, name: 'Unique: Parameter Bonus for Every Support Type in Deck', symbol: 'none', value: 1 }] },
}])[0];
const deckDependentState = getCardUniqueEffectState(deckDependentUnique, 0, 5, 100).effects[0];
assert.equal(deckDependentState.mechanicRule, 'deck-parameter-bonus');
assert.match(getUniqueEffectDescription(deckDependentState, 5), /not guessed without the actual deck composition/);
const incompleteDeckOutput = calculateTraining(deckDependentUnique, 0, 'grand-masters', 5, 0, 120, 100, { deckComposition: { Speed: 1 } });
assert.equal(incompleteDeckOutput.Guts.appliedEffects.deckParameterBonus.Speed, 0, 'partial deck input must not produce a guessed deck bonus');
const deckContext = { Speed: 2, Stamina: 0, Power: 1, Guts: 1, Wit: 0, FriendGroup: 1 };
const deckParameterOutput = calculateTraining(deckDependentUnique, 0, 'grand-masters', 5, 0, 120, 100, { deckComposition: deckContext });
assert.deepEqual(deckParameterOutput.Guts.appliedEffects.deckParameterBonus, { Speed: 2, Stamina: 0, Power: 1, Guts: 2, Wit: 0, 'Skill Points': 1 });
const deckUniqueOffOutput = calculateTraining(deckDependentUnique, 0, 'grand-masters', 5, 0, 120, 100, { deckComposition: deckContext, uniquePassiveEnabled: false });
assert.equal(deckUniqueOffOutput.Guts.appliedEffects.deckParameterBonus.Speed, 0, 'unique passive OFF excludes deck-dependent bonuses even when a full deck context is supplied');
assert.equal(deckParameterOutput.Guts.stats.Speed, 5, 'deck-based Speed bonus applies to Guts training because its base includes Speed');
assert.equal(calculateTraining(deckDependentUnique, 0, 'grand-masters', 5, 0, 120, 79, { deckComposition: deckContext }).Guts.appliedEffects.deckParameterBonus.Speed, 0, 'deck-dependent unique is inactive below Bond 80');

const deckInitialUnique = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30120', SupportName: 'Starting stats by deck', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, description: 'Starting stats for every support type in deck. Friend and group cards are worth 2 to each stat.', effects: [{ id: 105, name: 'Unique: Starting Stats for Every Support Type in Deck', symbol: 'none', value: 1 }] },
}])[0];
const startingBonuses = getCardUniqueEffectState(deckInitialUnique, 0, 5, 100, deckContext).effects[0];
assert.equal(startingBonuses.mechanicRule, 'deck-starting-stats');
assert.match(getUniqueEffectDescription(startingBonuses, 5, { card: deckInitialUnique, lb: 0, deckComposition: deckContext }), /At career start: \+5 Speed, \+2 Stamina, \+3 Power, \+3 Guts, \+2 Wit/);

// Any effect family with an explicit facility-level formula uses the shared
// per-facility-level resolver, rather than a SupportId-specific exception.
const scalablePowerUnique = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30112', SupportName: 'Scalable stat test', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 512, name: 'Power Bonus', symbol: 'none', value: 1, description: 'Gain Power Bonus +1 for every level of the current training facility.' }] },
}])[0];
assert.equal(calculateTraining(scalablePowerUnique, 0, 'grand-masters', 3, 0, 120).Speed.stats.Power, 6, 'Power Bonus +1 per facility level becomes +3 at level 3 before multipliers');

// Facility-specific unique bonuses only apply to the named facility.
const facilityGatedUnique = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30113', SupportName: 'Facility-gated test', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 513, name: 'Power Bonus', symbol: 'none', value: 2, description: 'Gain Power Bonus +2 when training on the Speed facility.' }] },
}])[0];
const facilitySpeed = calculateTraining(facilityGatedUnique, 0, 'grand-masters', 5, 0, 120).Speed;
const facilityPower = calculateTraining(facilityGatedUnique, 0, 'grand-masters', 5, 0, 120).Power;
assert.equal(facilitySpeed.stats.Power, 7, 'facility condition activates only for Speed training');
assert.equal(facilityPower.stats.Power, 13, 'Power training base +13 remains unaffected by a Speed-only bonus');

// Energy mechanics are evaluated separately from stat gain: reductions add
// together, round consumption up in magnitude, and Wit Friendship Recovery is
// a flat extra recovery only for a Wit rainbow.
const energyReducer = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30114', SupportName: 'Energy reducer', SupportRarity: 'SSR', SupportType: 'Speed',
  SupportEffects: [
    { id: 30, name: 'Energy Cost Reduction', symbol: 'percent', values: effectAt(0).map(() => 10) },
    { id: 31, name: 'Energy Consumption Reduction', symbol: 'percent', values: effectAt(0).map(() => 10) },
  ],
  SupportUnique: { level: 30, effects: [{ id: 32, name: 'Energy Cost Reduction', symbol: 'percent', value: 5 }] },
}])[0];
assert.equal(calculateTraining(energyReducer, 0, 'grand-masters', 5, 0, 120).Speed.energy, -19, '25% total energy reduction rounds the 18.75 cost up to 19, represented as -19');
const witRecovery = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30115', SupportName: 'Wit recovery', SupportRarity: 'SSR', SupportType: 'Wit',
  SupportEffects: [{ id: 40, name: 'Wit Friendship Recovery', symbol: 'none', values: effectAt(0).map((_, i) => i >= 9 ? 5 : 0) }],
  SupportUnique: null,
}])[0];
assert.equal(calculateTraining(witRecovery, 4, 'grand-masters', 5, 0, 120, 100).Wit.energy, 10, 'Wit rainbow recovers base 5 plus card recovery 5');
assert.equal(calculateTraining(witRecovery, 4, 'grand-masters', 5, 0, 120, 79).Wit.energy, 5, 'Wit recovery bonus requires a rainbow');
assert.equal(calculateTraining(witRecovery, 4, 'grand-masters', 5, 0, 120, 100).Speed.energy, -25, 'Wit recovery does not apply to Speed training');

// Flat aliases still add to base stats; bonuses never create a stat the
// facility does not normally provide.
const aliasesCard = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30116', SupportName: 'Alias stat test', SupportRarity: 'SSR', SupportType: 'Wit',
  SupportEffects: [
    { id: 50, name: 'Wisdom Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 6 ? 1 : 0) },
    { id: 51, name: 'Skill Points Bonus', symbol: 'none', values: effectAt(0).map((_, i) => i >= 6 ? 1 : 0) },
  ],
  SupportUnique: null,
}])[0];
const aliasResult = calculateTraining(aliasesCard, 0, 'grand-masters', 5, 0, 120).Wit;
assert.equal(aliasResult.stats.Wit, 13, 'Wisdom Bonus alias correctly maps to Wit Bonus');
assert.equal(aliasResult.stats['Skill Points'], 6, 'Skill Points Bonus alias correctly maps to Skill Point Bonus');

// Agnes Tachyon SSR [Q≠0] (Global 30101) has a unique Friendship Bonus +20
// when the bond gauge is full. This mirrors the live source wording, which
// previously caused the generic parser to mark the effect unsupported and
// reproduce the reported +23 Speed / +7 Power / +11 SP output.
const agnesProgression = (value) => Array.from({ length: 11 }, () => value);
const agnesTachyon = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30101', SupportName: 'Agnes Tachyon (SSR)', SupportRarity: 'SSR', SupportType: 'Speed',
  SupportEffects: [
    { id: 1, name: 'Friendship Bonus', symbol: 'percent', values: agnesProgression(20) },
    { id: 2, name: 'Training Effectiveness', symbol: 'percent', values: agnesProgression(5) },
    { id: 3, name: 'Speed Bonus', symbol: 'none', values: agnesProgression(1) },
    { id: 4, name: 'Skill Point Bonus', symbol: 'none', values: agnesProgression(2) },
  ],
  SupportUnique: {
    level: 30,
    description: 'Gain Friendship Bonus (20) when the bond gauge is full',
    effects: [{ id: 1, name: 'Friendship Bonus', symbol: 'percent', value: 20 }],
  },
}])[0];
const agnesUnique = getCardUniqueEffectState(agnesTachyon, 4, 5, 100).effects[0];
assert.equal(agnesUnique.conditionRule, 'bond-threshold:100', 'full bond gauge is a recognized 100-bond condition');
assert.notEqual(agnesUnique.mechanicRule, 'unsupported-dynamic', 'Agnes Tachyon unique Friendship Bonus must not be discarded');
assert.equal(agnesUnique.resolvedValue, 20, 'Agnes Tachyon unique contributes +20 Friendship Bonus at full bond');
assert.equal(getComparisonEffectEntries(agnesTachyon, 4, 5).find((effect) => effect.key === 'friendship bonus')?.value, 44, 'the reference row shows effective 44% from multiplicative 20% base and 20% unique Friendship Bonus');
assert.equal(getComparisonEffectEntries(agnesTachyon, 4, 5, { uniquePassiveEnabled: false }).find((effect) => effect.key === 'friendship bonus')?.value, 20, 'Passive OFF shows only Agnes Tachyon base Friendship Bonus');
assert.equal(getComparisonEffectEntries(agnesTachyon, 4, 5, { uniquePassiveEnabled: true }).find((effect) => effect.key === 'friendship bonus')?.value, 44, 'Passive ON folds Agnes Tachyon unique Friendship Bonus into the displayed value');
const agnesTraining = calculateTraining(agnesTachyon, 4, 'grand-masters', 5, 0.2, 120, 100).Speed;
assert.deepEqual([agnesTraining.stats.Speed, agnesTraining.stats.Power, agnesTraining.stats['Skill Points']], [28, 9, 13], 'Agnes Tachyon unique bonus changes matching training output from the broken +23/+7/+11 baseline');
assert.equal(agnesTraining.appliedEffects.friendshipBonus, 44, 'Agnes Tachyon training uses both Friendship Bonus layers multiplicatively');
const agnesBond99 = calculateTraining(agnesTachyon, 4, 'grand-masters', 5, 0.2, 120, 99).Speed;
assert.equal(agnesBond99.appliedEffects.friendshipBonus, 20, 'full-bond unique bonus is inactive at bond 99');

// Common source phrasing variants should map to the same bond threshold instead
// of failing when a site says "Friendship Gauge 100+" or "At Bond 80:".
for (const wording of [
  'Gain Friendship Bonus (20) when the bond gauge is full',
  'Gain Friendship Bonus (20) when Friendship Gauge 100+',
  'At Bond 80: Gain Friendship Bonus +10',
  'Bond 80+: Gain Friendship Bonus +10',
  'Gain Friendship Bonus (20) at full bond gauge',
  'Friendship Bonus +10 when bond is at least 80',
]) {
  const thresholdCard = dynamicBondConditionFixture(wording);
  const state = getCardUniqueEffectState(thresholdCard, 4, 5, 100).effects[0];
  assert.ok(state.conditionRule === 'bond-threshold:100' || state.conditionRule === 'bond-threshold:80' || state.conditionRule === 'bond-80-or-higher', `bond condition recognized for: ${wording}`);
  assert.notEqual(state.mechanicRule, 'unsupported-dynamic', `known bond condition must not be classified unsupported: ${wording}`);
}

function dynamicBondConditionFixture(description) {
  return normalizeGlobalSupportCards([{
    SupportServer: 'global', SupportId: '39888', SupportName: 'Bond phrase fixture', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
    SupportUnique: { level: 30, description, effects: [{ id: 1, name: 'Friendship Bonus', symbol: 'percent', value: 20 }] },
  }])[0];
}

// Dynamic unique effects are evaluated from their source formula and explicit run context.
const dynamicMechanicCard = (id, name, type, uniqueDescription, effectName, value, description, symbol = 'percent') => normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: String(id), SupportName: name, SupportRarity: 'SSR', SupportType: type, SupportEffects: [],
  SupportUnique: { level: 30, description: uniqueDescription, effects: [{ id: id + 1, name: effectName, symbol, value, description }] },
}])[0];
const sameTrainingCard = dynamicMechanicCard(30121, 'Same-training scaler', 'Speed', '', 'Training Effectiveness', 10, 'Gain 2% for every other support card on the same training.');
assert.equal(calculateTraining(sameTrainingCard, 0, 'grand-masters', 5, 0, 120, 100, { supportCardsAtTraining: 3 }).Speed.appliedEffects.trainingEffectiveness, 4);
assert.equal(calculateTraining(sameTrainingCard, 0, 'grand-masters', 5, 0, 120, 100, { supportCardsAtTraining: 6 }).Speed.appliedEffects.trainingEffectiveness, 10, 'same-training bonus caps at the source maximum');
const fanScaler = dynamicMechanicCard(30122, 'Fan scaler', 'Speed', '', 'Training Effectiveness', 5, 'Scaling every 10,000 fans, up to 50,000 fans.');
assert.equal(calculateTraining(fanScaler, 0, 'grand-masters', 5, 0, 120, 100, { fans: 30000 }).Speed.appliedEffects.trainingEffectiveness, 3);
const friendshipScaler = dynamicMechanicCard(30123, 'Friendship scaler', 'Speed', '', 'Training Effectiveness', 6, 'Increases by 2% for every friendship training, up to 3 times.');
assert.equal(calculateTraining(friendshipScaler, 0, 'grand-masters', 5, 0, 120, 100, { friendshipTrainingCount: 2 }).Speed.appliedEffects.trainingEffectiveness, 4);
const bondScaler = dynamicMechanicCard(30124, 'Total bond scaler', 'Speed', '', 'Training Effectiveness', 6, 'Increases by 1% for every 100 bond on all supports.');
assert.equal(calculateTraining(bondScaler, 0, 'grand-masters', 5, 0, 120, 100, { totalBond: 350 }).Speed.appliedEffects.trainingEffectiveness, 3);
// Tokai Teio [Teio-Oo-Oo!!!] (Global 30111) has a unique effect that scales
// with the total bond across the whole deck. The source export may omit its
// numeric parameter columns and keep only Effect #109:8 plus generic prose.
const teioAtLb45 = (value) => Array.from({ length: 11 }, (_, index) => index === 9 ? value : 0);
const teioWit = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30111', SupportName: 'Tokai Teio (SSR)', SupportRarity: 'SSR', SupportType: 'Wit',
  SupportEffects: [
    { id: 1, name: 'Friendship Bonus', symbol: 'percent', values: teioAtLb45(28) },
    { id: 19, name: 'Specialty Priority', symbol: 'none', values: teioAtLb45(35) },
    { id: 3, name: 'Speed Bonus', symbol: 'none', values: teioAtLb45(1) },
    { id: 7, name: 'Wit Bonus', symbol: 'none', values: teioAtLb45(1) },
    { id: 31, name: 'Wit Friendship Recovery', symbol: 'none', values: teioAtLb45(4) },
  ],
  SupportUnique: {
    level: 30,
    description: '',
    effects: [{ id: 109, name: 'Effect #109: 8', symbol: 'none', value: 8 }],
  },
}])[0];
const teioMlb45 = calculateTraining(teioWit, 3, 'grand-masters', 5, 0.2, 120, 100, { totalBond: 600, uniquePassiveEnabled: true }).Wit;
assert.equal(teioMlb45.appliedEffects.trainingEffectiveness, 20, 'Tokai Teio type-109 unique resolves to +20% at 600 total support bond even if raw numeric parameters are absent');
assert.deepEqual([teioMlb45.stats.Speed, teioMlb45.stats.Wit, teioMlb45.stats['Skill Points']], [9, 25, 9], 'Tokai Teio SSR Wit LB3 at Grand Masters Lv5 Great matches the UmaGuide comparison reference');
const teioAtHalfBond = calculateTraining(teioWit, 3, 'grand-masters', 5, 0.2, 120, 100, { totalBond: 300, uniquePassiveEnabled: true }).Wit;
assert.equal(teioAtHalfBond.appliedEffects.trainingEffectiveness, 10, 'Tokai Teio total-bond unique scales linearly at 300 combined bond');
const teioRows = getComparisonEffectEntries(teioWit, 3, 5, { totalBond: 600 });
assert.equal(teioRows.find((effect) => effect.key === 'training effectiveness')?.value, 20, 'Tokai Teio unique is folded into the Training Effectiveness row');
assert.equal(getComparisonEffectEntries(teioWit, 3, 5, { totalBond: 600, uniquePassiveEnabled: false }).some((effect) => effect.key === 'training effectiveness'), false, 'Passive OFF removes Tokai Teio unique Training Effectiveness');
assert.equal(getComparisonEffectEntries(teioWit, 3, 5, { totalBond: 600, uniquePassiveEnabled: true }).find((effect) => effect.key === 'training effectiveness')?.value, 20, 'Passive ON includes Tokai Teio total-bond Training Effectiveness');
const teioUniqueOff = calculateTraining(teioWit, 3, 'grand-masters', 5, 0.2, 120, 100, { totalBond: 600, uniquePassiveEnabled: false }).Wit;
assert.equal(teioUniqueOff.appliedEffects.trainingEffectiveness, 0, 'Passive OFF removes Teio unique from the training calculation');
assert.deepEqual([teioUniqueOff.stats.Speed, teioUniqueOff.stats.Wit, teioUniqueOff.stats['Skill Points']], [8, 20, 8], 'Teio Passive OFF returns the no-unique training baseline');
const teioDefaultReference = calculateTraining(teioWit, 3, 'grand-masters', 5, 0.2, 120).Wit;
assert.equal(teioDefaultReference.appliedEffects.trainingEffectiveness, 20, 'the comparison defaults resolve Teio total-bond unique without an extra context form');
assert.deepEqual([teioDefaultReference.stats.Speed, teioDefaultReference.stats.Wit, teioDefaultReference.stats['Skill Points']], [9, 25, 9], 'Teio default comparison output matches the reference result even when raw unique prose and parameter arrays are both absent');
const energyScaler = dynamicMechanicCard(30125, 'Energy spent scaler', 'Speed', '', 'Training Effectiveness', 5, 'Increases by 1% for every 10 energy, up to 50 energy.');
assert.equal(calculateTraining(energyScaler, 0, 'grand-masters', 5, 0, 120, 100, { currentEnergy: 40, maxEnergy: 120 }).Speed.appliedEffects.trainingEffectiveness, 4);
const skillScaler = dynamicMechanicCard(30126, 'Skill scaler', 'Speed', '', 'Training Effectiveness', 6, 'Increases by 2% for every learned Speed skill, up to 3 skills.');
assert.equal(calculateTraining(skillScaler, 0, 'grand-masters', 5, 0, 120, 100, { learnedSkills: { speed: 2 } }).Speed.appliedEffects.trainingEffectiveness, 4);
const allSupportsScaler = dynamicMechanicCard(30127, 'All supports scaler', 'Speed', '', 'Training Effectiveness', 5, 'Applies to every support card in the deck.');
assert.equal(calculateTraining(allSupportsScaler, 0, 'grand-masters', 5, 0, 120, 100, { supportCardsAtTraining: 4 }).Speed.appliedEffects.trainingEffectiveness, 5, 'type 115 applies its bonus once to each selected deck member, not once per training attendee');
const typeThresholdCard = dynamicMechanicCard(30128, 'Deck type threshold', 'Speed', '', 'Training Effectiveness', 10, 'If deck has at least 3 different types of Support Cards.');
assert.equal(calculateTraining(typeThresholdCard, 0, 'grand-masters', 5, 0, 120, 100, { deckComposition: { Power: 1, Guts: 1, Stamina: 1, Wit: 1, FriendGroup: 1 } }).Speed.appliedEffects.trainingEffectiveness, 10);
assert.equal(calculateTraining(typeThresholdCard, 0, 'grand-masters', 5, 0, 120, 100, { deckComposition: { Speed: 1 } }).Speed.appliedEffects.trainingEffectiveness, 0);
const nonSpecialtyCard = dynamicMechanicCard(30129, 'Non-specialty scaler', 'Speed', 'If bond is 80 or higher, and not training in specialty.', 'Training Effectiveness', 10, 'If bond is 80 or higher, and not training in specialty.');
assert.equal(calculateTraining(nonSpecialtyCard, 0, 'grand-masters', 5, 0, 120, 100).Speed.appliedEffects.trainingEffectiveness, 0);
assert.equal(calculateTraining(nonSpecialtyCard, 0, 'grand-masters', 5, 0, 120, 100).Power.appliedEffects.trainingEffectiveness, 10);

// Regression matrix for the raw game unique-mechanic IDs 101–122.
// These are shared mechanic types; testing them as a group prevents fixes
// from being limited to a single SupportId.
const rawUniqueFixture = (typeId, suffix, values = [], supportType = 'Speed', name = `Raw unique type ${typeId}`) => normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: String(31000 + typeId), SupportName: name, SupportRarity: 'SSR', SupportType: supportType, SupportEffects: [],
  SupportUnique: { level: 30, description: '', effects: [{ id: typeId, name: `Effect #${typeId}: ${suffix}`, symbol: 'none', value: suffix, values }] },
}])[0];
const raw101 = rawUniqueFixture(101, 80, [3, 2, 5, 1]);
const raw101State = getCardUniqueEffectState(raw101, 0, 5, 100, DEFAULT_COMPARE_DECK_COMPOSITION);
assert.deepEqual(raw101State.effects.map((effect) => [effect.key, effect.resolvedValue]), [['speed bonus', 2], ['power bonus', 1]], 'type 101 preserves one or two bond-gated effect pairs');
const raw102 = rawUniqueFixture(102, 80, [20]);
assert.equal(calculateTraining(raw102, 0, 'grand-masters', 5, 0, 120).Power.appliedEffects.trainingEffectiveness, 20, 'type 102 applies its bond-gated training effectiveness off specialty');
const raw103 = rawUniqueFixture(103, 4, [10]);
assert.equal(calculateTraining(raw103, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 10, 'type 103 activates using the default mixed five-card deck');
const raw104 = rawUniqueFixture(104, 10000, [1]);
assert.equal(calculateTraining(raw104, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 1, 'type 104 uses the documented fan-scaling cap when a fan selector is absent');
const raw105 = rawUniqueFixture(105, 10, [5]);
assert.equal(getDeckStartingStatsBonuses(raw105, 0, DEFAULT_COMPARE_DECK_COMPOSITION).Speed, 20, 'type 105 counts support-type cards in the default deck for career-start stats');
const raw106 = rawUniqueFixture(106, 3, [8, 2]);
assert.equal(calculateTraining(raw106, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 6, 'type 106 applies its documented maximum friendship-training stack when history is not selectable');
const raw107 = rawUniqueFixture(107, 8, [0, 80, 20, 5]);
assert.equal(calculateTraining(raw107, 0, 'grand-masters', 5, 0, 120, 100, { currentEnergy: 80 }).Speed.appliedEffects.trainingEffectiveness, 20, 'type 107 resolves the current-energy threshold');
assert.equal(calculateTraining(raw107, 0, 'grand-masters', 5, 0, 120, 100, { currentEnergy: 120 }).Speed.appliedEffects.trainingEffectiveness, 0, 'type 107 is inactive above 100 energy');
const raw108 = rawUniqueFixture(108, 8, [0, 0, 5, 20]);
assert.equal(calculateTraining(raw108, 0, 'grand-masters', 5, 0, 100).Speed.appliedEffects.trainingEffectiveness, 5, 'type 108 scales from the source floor at 100 max energy');
assert.equal(calculateTraining(raw108, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 20, 'type 108 scales to the source cap at 120 max energy');
const raw109WithoutAnyNarrative = rawUniqueFixture(109, 8, []);
assert.equal(calculateTraining(raw109WithoutAnyNarrative, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 20, 'type 109 falls back from its documented mechanic type even when prose and value parameters are absent');
const namedRaw109 = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '31109', SupportName: 'Named raw type 109', SupportRarity: 'SSR', SupportType: 'Wit', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ typeId: 109, id: 8, name: 'Training Effectiveness', symbol: 'percent', value: 8 }] },
}])[0];
assert.equal(calculateTraining(namedRaw109, 0, 'grand-masters', 5, 0.2, 120).Wit.appliedEffects.trainingEffectiveness, 20, 'type 109 is normalized by mechanic ID even when the catalogue has already translated its display name');
const raw110 = rawUniqueFixture(110, 8, [5]);
assert.equal(calculateTraining(raw110, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 0, 'type 110 adds nothing when only the selected support is at training');
assert.equal(calculateTraining(raw110, 0, 'grand-masters', 5, 0, 120, 100, { supportCardsAtTraining: 3 }).Speed.appliedEffects.trainingEffectiveness, 10, 'type 110 counts only other supports at the same training');
const raw111 = rawUniqueFixture(111, 8, []);
assert.equal(calculateTraining(raw111, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 25, 'type 111 adds its documented facility-level bonus even when raw values are omitted');
const raw112 = rawUniqueFixture(112, 15, []);
assert.equal(getCardUniqueEffectState(raw112, 0, 5).effects[0].resolvedValue, 15, 'type 112 retains failure-protection chance as a non-stat effect');
const raw113 = rawUniqueFixture(113, 2, [60]);
assert.equal(calculateTraining(raw113, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.moodEffect, 60, 'type 113 applies its modifier only on friendship training');
assert.equal(calculateTraining(raw113, 0, 'grand-masters', 5, 0, 120).Power.appliedEffects.moodEffect, 0, 'type 113 does not leak into non-friendship training');
const raw114 = rawUniqueFixture(114, 8, [5, 4]);
assert.equal(calculateTraining(raw114, 0, 'grand-masters', 5, 0, 120, 100, { currentEnergy: 20 }).Speed.appliedEffects.trainingEffectiveness, 4, 'type 114 stacks by energy and respects the cap');
const raw115 = rawUniqueFixture(115, 14, [5]);
assert.equal(getCardUniqueEffectState(raw115, 0, 5, 100, DEFAULT_COMPARE_DECK_COMPOSITION, { supportCardsAtTraining: 4 }).effects[0].resolvedValue, 5, 'type 115 applies its card-wide bonus once to this deck member, not once per training attendee');
const raw116 = rawUniqueFixture(116, 1, [8, 2, 5]);
assert.equal(calculateTraining(raw116, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 10, 'type 116 uses its documented skill-category stack cap in reference mode');
const raw117 = rawUniqueFixture(117, 8, [25, 20]);
assert.equal(calculateTraining(raw117, 0, 'grand-masters', 5, 0, 120).Speed.appliedEffects.trainingEffectiveness, 20, 'type 117 resolves against the combined training facility level');
const raw118 = rawUniqueFixture(118, 1, [80]);
assert.equal(getCardUniqueEffectState(raw118, 0, 5, 100).effects[0].resolvedValue, 1, 'type 118 observes its bond threshold instead of losing it during normalization');
const raw119 = rawUniqueFixture(119, 20, [0, 80]);
assert.equal(getCardUniqueEffectState(raw119, 0, 5, 100).effects[0].resolvedValue, 20, 'type 119 retains its bond-gated specialty-priority effect');
const raw120 = rawUniqueFixture(120, 1, [80]);
assert.equal(getDeckParameterBonuses(raw120, 0, 100, DEFAULT_COMPARE_DECK_COMPOSITION).Speed, 2, 'type 120 resolves parameter bonuses per support type in the default deck');
const raw121 = rawUniqueFixture(121, 1, [2]);
assert.deepEqual(getCardUniqueEffectState(raw121, 0, 5).effects.map((effect) => effect.resolvedValue), [1, 2], 'type 121 preserves both on-training and off-training bond gain');
const raw122 = rawUniqueFixture(122, 8, [10]);
assert.equal(getCardUniqueEffectState(raw122, 0, 5).effects[0].resolvedValue, 0, 'type 122 is a next-turn effect and does not inflate current training output');
for (let mechanicType = 101; mechanicType <= 122; mechanicType += 1) {
  const fixture = rawUniqueFixture(mechanicType, mechanicType === 101 ? 80 : 8, mechanicType === 101 ? [3, 2, 5, 1] : [5, 2, 80, 1]);
  assert.ok(fixture.unique.effects.length > 0, `raw unique mechanic ${mechanicType} stays available after normalization`);
  assert.ok(fixture.unique.effects.every((effect) => !/^effect\s*#?\s*\d+/i.test(effect.name)), `raw unique mechanic ${mechanicType} must not leak a generic raw effect label into the user-facing UI`);
  const passiveOff = calculateTraining(fixture, 0, 'grand-masters', 5, 0.2, 120, 100, { uniquePassiveEnabled: false });
  const noUniqueBaseline = calculateTraining({ ...fixture, unique: null }, 0, 'grand-masters', 5, 0.2, 120, 100);
  for (const facility of ['Speed', 'Stamina', 'Power', 'Guts', 'Wit']) {
    assert.deepEqual(passiveOff[facility].stats, noUniqueBaseline[facility].stats, `Passive OFF excludes unique mechanic ${mechanicType} from ${facility} stats`);
    assert.equal(passiveOff[facility].energy, noUniqueBaseline[facility].energy, `Passive OFF excludes unique mechanic ${mechanicType} from ${facility} energy`);
  }
  assert.deepEqual(
    getComparisonEffectEntries(fixture, 0, 5, { uniquePassiveEnabled: false }),
    getComparisonEffectEntries({ ...fixture, unique: null }, 0, 5),
    `Passive OFF removes type ${mechanicType} contributions from the displayed effect rows`,
  );
}

const unresolvedDynamic = normalizeGlobalSupportCards([{
  SupportServer: 'global', SupportId: '30110', SupportName: 'Unresolved unique test', SupportRarity: 'SSR', SupportType: 'Speed', SupportEffects: [],
  SupportUnique: { level: 30, effects: [{ id: 503, name: 'Friendship Bonus', symbol: 'percent', value: 10, description: 'Gain Friendship Bonus depending on the number of fans.' }] },
}])[0];
const unresolvedState = getCardUniqueEffectState(unresolvedDynamic, 0, 5);
assert.equal(unresolvedState.effects[0].mechanicRule, 'unsupported-dynamic', 'unknown conditional mechanics are flagged instead of silently treated as flat');
assert.equal(calculateTraining(unresolvedDynamic, 0, 'grand-masters', 5, 0.2, 120).Speed.appliedEffects.friendshipBonus, 0, 'unsupported unique effect does not silently change training output');
assert.match(getUniqueEffectDescription(unresolvedState.effects[0], 5), /source data does not specify a usable formula/);

console.log('Support-card compare tests passed.');

// The API should return the whole filtered Global catalogue, not JP rows.
const apiHandler = (await import('../api/support-card-compare.js')).default;
const apiFixture = [rawCards[0], ...Array.from({ length: 260 }, (_, index) => ({
  SupportServer: 'global', SupportId: String(50000 + index), SupportSlug: `fixture-${index}`, SupportName: `Global Card ${index}`,
  SupportRarity: index % 3 === 0 ? 'SSR' : index % 3 === 1 ? 'SR' : 'R', SupportType: 'Speed', SupportImage: `/assets/support_thumbs/fixture-${index}.png`,
  SupportEffects: [], SupportUnique: null,
})), rawCards[1]];
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(JSON.stringify(apiFixture), { status: 200, headers: { 'content-type': 'application/json', 'content-length': String(JSON.stringify(apiFixture).length) } });
let apiPayload;
let apiStatus = 0;
const apiResponse = {
  headers: {},
  setHeader(name, value) { this.headers[name] = value; return this; },
  status(code) { apiStatus = code; return this; },
  json(value) { apiPayload = value; return this; },
};
await apiHandler({ method: 'GET' }, apiResponse);
globalThis.fetch = originalFetch;
assert.equal(apiStatus, 200);
assert.equal(apiPayload.schemaVersion, 9, 'catalog API identifies the parser schema required by the compare UI');
assert.match(apiResponse.headers['Cache-Control'], /no-store/, 'normalized catalog responses must not be served stale from the CDN');
assert.equal(apiPayload.cardCount, 261);
assert.ok(apiPayload.cards.every((card) => card.id !== '99001'));
assert.equal(apiPayload.cards.length, 261);
console.log('Support-card compare API tests passed.');
