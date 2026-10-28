import assert from "node:assert/strict";
import { orderRecommendationsByStatus } from "../src/lib/recommendationRules.js";

const input = [
  { cardId: "alt-1", status: "alternative" },
  { cardId: "rec-1", status: "recommended" },
  { cardId: "alt-2", status: "alternative" },
  { cardId: "rec-2", status: "recommended" },
];
assert.deepEqual(orderRecommendationsByStatus(input).map((item) => item.cardId), ["rec-1", "rec-2", "alt-1", "alt-2"]);
assert.deepEqual(orderRecommendationsByStatus([{ cardId: "default" }, { cardId: "alt", status: "alternative" }]).map((item) => item.cardId), ["default", "alt"]);
console.log("Recommendation display ordering tests passed.");
