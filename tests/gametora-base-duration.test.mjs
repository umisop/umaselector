import assert from "node:assert/strict";
import { normalizeGameToraSkillRecord } from "../src/lib/skillReference.js";

const cases = [
  {
    label: "GameTora raw snake_case field",
    record: { id: 200681, name_en: "Professor of Curvature", skill_effects: [{ float_ability_time_1: 18000 }] },
    expected: "1.8 s base",
  },
  {
    label: "GameTora camelCase field inside condition group",
    record: { id: 200721, name_en: "Killer Tunes", condition_groups: [{ effects: [{ floatAbilityTime: 24000 }] }] },
    expected: "2.4 s base",
  },
  {
    label: "GameTora numbered nested ability time field",
    record: { id: 200901, name_en: "Lightning Surge", data: { condition_groups: [{ effects: [{ float_ability_time_1_1: 4000 }] }] } },
    expected: "0.4 s base",
  },
];

for (const testCase of cases) {
  const result = normalizeGameToraSkillRecord(testCase.record);
  assert.equal(result.duration, testCase.expected, testCase.label);
}

console.log("GameTora Base Duration parsing tests passed.");
