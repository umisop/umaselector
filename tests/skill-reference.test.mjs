import assert from "node:assert/strict";
import { normalizeGameToraSkillRecord, formatGameToraSkillEffect } from "../src/lib/skillReference.js";

const killerTunes = {
  id: 200721,
  name_en: "Killer Tunes",
  description_en: "Increase positioning ability when positioned toward the front mid-race. (Medium)",
  skill_type: "Speed",
  rarity: "Gold",
  sp_cost: 160,
  duration_text: "2.4 s base",
  icon_url: "https://media.gametora.com/umamusume/skill-icons/killer-tunes.png",
  condition_groups: [{ condition: "phase_mid==1", effects: [{ type: 27, value: 3500 }] }],
};

const detail = normalizeGameToraSkillRecord(killerTunes);
assert.equal(detail.id, "200721");
assert.equal(detail.name, "Killer Tunes");
assert.equal(detail.description, killerTunes.description_en);
assert.equal(detail.type, "Speed");
assert.equal(detail.rarity, "Gold");
assert.equal(detail.spCost, "160");
assert.equal(detail.duration, "2.4 s base");
assert.equal(detail.effect, "Target Speed +0.35 m/s");
assert.equal(detail.technicalCondition, "phase_mid==1");
assert.equal(detail.sourceName, "GameTora");
assert.equal(formatGameToraSkillEffect(killerTunes), "Target Speed +0.35 m/s");

const unsafeIcon = normalizeGameToraSkillRecord({ ...killerTunes, icon_url: "https://example.invalid/fake.png" });
assert.equal(unsafeIcon.iconUrl, "");
const iconFromId = normalizeGameToraSkillRecord({ id: 200723, name_en: "Example", icon_id: 10011 });
assert.equal(iconFromId.iconUrl, "https://media.gametora.com/umamusume/skills/icon/10011.png");

const upcoming = normalizeGameToraSkillRecord({ id: 200722, name_en: "Upcoming Skill", is_upcoming: true });
assert.equal(upcoming.globalAvailable, false);

console.log("GameTora skill normalization tests passed.");


// Raw GameTora master-data fields (including nested/same-ID metadata rows).
const rawGameToraMetadata = normalizeGameToraSkillRecord({
  id: 200799,
  name_en: "Metadata Field Test",
  need_skill_point: 180,
  float_ability_time_1: 18000,
});
assert.equal(rawGameToraMetadata.spCost, "180");
assert.equal(rawGameToraMetadata.duration, "1.8 s base");

const nestedGameToraMetadata = normalizeGameToraSkillRecord({
  id: 200800,
  name_en: "Nested Metadata Field Test",
  data: { baseCost: 160, effects: [{ float_ability_time_1: 24000 }] },
});
assert.equal(nestedGameToraMetadata.spCost, "160");
assert.equal(nestedGameToraMetadata.duration, "2.4 s base");

const wrappedGameToraMetadata = normalizeGameToraSkillRecord({
  id: 200801,
  base_cost: 180,
  float_ability_time_1: 18000,
  skill: {
    name_en: "Wrapped Metadata Field Test",
    description_en: "Test description",
    rarity: "Gold",
  },
});
assert.equal(wrappedGameToraMetadata.name, "Wrapped Metadata Field Test");
assert.equal(wrappedGameToraMetadata.spCost, "180");
assert.equal(wrappedGameToraMetadata.duration, "1.8 s base");


// Internal GameTora keys must not leak into the visible type label. Infer a
// user-facing type from the normalized numeric effect instead.
const professorRaw = normalizeGameToraSkillRecord({
  id: 200331, name_en: "Professor of Curvature", skill_type: "cor nac", rarity: "Gold",
  data: { skill_effects: [{ float_ability_time_1: 24000, ability_type_1_1: 27, float_ability_value_1_1: 3500 }] },
  skill_meta: { need_skill_point: 180 },
});
assert.equal(professorRaw.type, "Speed");
assert.equal(professorRaw.duration, "2.4 s base");
assert.equal(professorRaw.spCost, "180");
assert.equal(professorRaw.effect, "Target Speed +0.35 m/s");

const lightningRaw = normalizeGameToraSkillRecord({
  id: 202401, name_en: "Lightning Surge", skill_type: "sho_l_2_l_3 mil", rarity: "Gold",
  data: { skill_effects: [{ float_ability_time_1: 2, ability_type_1_1: 31, float_ability_value_1_1: 4000 }] },
  skill_meta: { base_sp_cost: 180 },
});
assert.equal(lightningRaw.type, "Acceleration");
assert.equal(lightningRaw.duration, "2 s base");
assert.equal(lightningRaw.spCost, "180");
assert.equal(lightningRaw.effect, "Acceleration +0.4 m/s²");


const camelCaseProfessor = normalizeGameToraSkillRecord({
  id: 200331, name_en: "Professor of Curvature", type: "cor nac", rarity: "Gold",
  skillMeta: { needSkillPoint: 180 },
  effectData: [{ floatAbilityTime1: 24000, abilityType_1_1: 27, floatAbilityValue_1_1: 3500 }],
});
assert.equal(camelCaseProfessor.type, "Speed");
assert.equal(camelCaseProfessor.spCost, "180");
assert.equal(camelCaseProfessor.duration, "2.4 s base");
assert.equal(camelCaseProfessor.effect, "Target Speed +0.35 m/s");

const fixedPointDuration = normalizeGameToraSkillRecord({
  id: 200802, name_en: "Duration Scale Test", skill_type: "cor nac", rarity: "Gold",
  float_ability_time_1: 24000, condition_groups: [{ effects: [{ type: 27, value: 3500 }] }],
});
assert.equal(fixedPointDuration.duration, "2.4 s base");
assert.equal(fixedPointDuration.type, "Speed");

// Common GameTora display/normalized duration aliases should map to seconds.
const durationSecondsAlias = normalizeGameToraSkillRecord({
  id: 200803, name_en: "Duration Seconds Alias", baseDurationSeconds: 2.4,
});
assert.equal(durationSecondsAlias.duration, "2.4 s base");

const durationMillisecondsAlias = normalizeGameToraSkillRecord({
  id: 200804, name_en: "Duration Milliseconds Alias", duration_ms: 2400,
});
assert.equal(durationMillisecondsAlias.duration, "2.4 s base");

const effectDurationAlias = normalizeGameToraSkillRecord({
  id: 200805, name_en: "Effect Duration Alias", effectDuration: 24000,
});
assert.equal(effectDurationAlias.duration, "2.4 s base");

// GameTora's current dataset stores base duration in condition_groups[].base_time.
const conditionGroupBaseTime = normalizeGameToraSkillRecord({
  id: 200681, name_en: "Mile Maven", skill_type: "sho_l_2_l_3 mil", rarity: "Gold",
  condition_groups: [{ base_time: 30000, effects: [{ type: 27, value: 3500 }] }],
});
assert.equal(conditionGroupBaseTime.duration, "3 s base");

const secondConditionGroupBaseTime = normalizeGameToraSkillRecord({
  id: 200806, name_en: "Condition Group Duration Test",
  condition_groups: [{ base_time: 30000 }, { base_time: 24000 }],
});
assert.equal(secondConditionGroupBaseTime.duration, "3 s base");
