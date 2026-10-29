import assert from "node:assert/strict";
import seed from "../src/data/seed.json" with { type: "json" };
import {
  SELECTOR_POOLS,
  DEFAULT_TICKET_COUNTS,
  applyRedeemsToLevel,
  findCompatibleTicketPool,
  getMaxRedeemsFromLevel,
  getMinimumProjectedLevel,
  getStartingLevelForProjectedLevel,
  getNextLevel,
  getPlannedTicketCounts,
  getRemainingTicketCounts,
  normalizeStartingLevel,
  isCardAvailableInPool,
} from "../src/lib/redeemPlanner.js";
import { buildRuleBasedRecommendations, evaluateMinimumUsableBreakpoint } from "../src/lib/recommendationRules.js";

assert.deepEqual(SELECTOR_POOLS.map((pool) => pool.maxTickets), [2, 1, 3]);
assert.deepEqual(DEFAULT_TICKET_COUNTS, { anniversary1: 0, anniversary15: 0, anniversary2: 1 });

const fukukitaru = seed.cards.find((card) => card.gameCardId === "30078");
const nakayama = seed.cards.find((card) => card.gameCardId === "30108");
const sweep = seed.cards.find((card) => card.gameCardId === "30128");
assert.ok(isCardAvailableInPool(fukukitaru, "anniversary1"));
assert.ok(isCardAvailableInPool(nakayama, "anniversary15"));
assert.ok(!isCardAvailableInPool(nakayama, "anniversary1"));
assert.ok(isCardAvailableInPool(sweep, "anniversary2"));
assert.ok(!isCardAvailableInPool(sweep, "anniversary15"));

const tickets = { anniversary1: 1, anniversary15: 1, anniversary2: 1 };
let plan = [];
assert.equal(findCompatibleTicketPool(fukukitaru, tickets, plan)?.id, "anniversary1", "oldest compatible ticket is used first");
plan.push({ cardId: fukukitaru.id, poolId: "anniversary1" });
assert.deepEqual(getPlannedTicketCounts(plan), { anniversary1: 1, anniversary15: 0, anniversary2: 0 });
assert.deepEqual(getRemainingTicketCounts(tickets, plan), { anniversary1: 0, anniversary15: 1, anniversary2: 1 });
assert.equal(findCompatibleTicketPool(nakayama, tickets, plan)?.id, "anniversary15");
assert.equal(findCompatibleTicketPool(sweep, tickets, [...plan, { cardId: nakayama.id, poolId: "anniversary15" }])?.id, "anniversary2");

assert.equal(applyRedeemsToLevel(2, 0), 2);
assert.equal(applyRedeemsToLevel(2, 1), 3);
assert.equal(applyRedeemsToLevel(2, 2), 4);
assert.equal(applyRedeemsToLevel(-1, 1), 0);
assert.equal(applyRedeemsToLevel(-1, 5), 4);
assert.equal(getMaxRedeemsFromLevel(2), 2, "LB2 only has capacity for two more copies");
assert.equal(getMaxRedeemsFromLevel(4), 0);
assert.equal(getMaxRedeemsFromLevel(-1), 5);
// The Current level selector shows the projected level after planned redeems.
// Converting that value back to the base inventory level must not double-count.
assert.equal(applyRedeemsToLevel(getStartingLevelForProjectedLevel(2, 1), 1), 2, "a planned Daiichi Ruby LB1→LB2 exchange remains LB2 when the selector already displays LB2");
assert.equal(getStartingLevelForProjectedLevel(3, 1), 2, "choosing projected LB3 with one planned redeem rebases the owned level to LB2");
assert.equal(getStartingLevelForProjectedLevel(0, 1), -1, "Not owned plus one planned exchange projects to LB0");
assert.equal(getStartingLevelForProjectedLevel(1, 2), -1, "Not owned plus two planned exchanges projects to LB1");
assert.equal(getStartingLevelForProjectedLevel(-1, 1), null, "a projected level below an existing planned exchange is invalid");
assert.equal(getMinimumProjectedLevel(0), -1);
assert.equal(getMinimumProjectedLevel(1), 0);
assert.equal(getMinimumProjectedLevel(2), 1);
assert.equal(getMinimumProjectedLevel(5), 4);
assert.equal(getNextLevel(2), 3);
assert.equal(getNextLevel(4), null);
assert.equal(normalizeStartingLevel(null), null, "an unselected non-Core card must remain unknown, not default to LB0");
assert.equal(normalizeStartingLevel(""), null);

const coreCards = seed.cards.filter((card) => card.isCore);
const levelsLB2 = Object.fromEntries(coreCards.map((card) => [card.id, card.id === "fine-motion" ? 2 : 4]));
const recommendationConfig = {
  ...seed,
  recommendationModel: {
    enabled: true,
    base: { universal: [{ cardId: "fine-motion", status: "recommended" }], fr: [], pc: [], ls: [], ec: [] },
    overrides: [],
  },
};
const lb2Result = buildRuleBasedRecommendations(recommendationConfig, levelsLB2, coreCards, { activeCategories: ["universal"] });
const fineAtLB2 = lb2Result.recommendations.universal.find((item) => item.cardId === "fine-motion");
assert.match(fineAtLB2.automaticEvaluation.message, /LB2 to LB3/i);
assert.match(fineAtLB2.automaticEvaluation.message, /Very Good Upgrade/i);

const levelsLB3 = { ...levelsLB2, "fine-motion": 3 };
const lb3Result = buildRuleBasedRecommendations(recommendationConfig, levelsLB3, coreCards, { activeCategories: ["universal"] });
const fineAtLB3 = lb3Result.recommendations.universal.find((item) => item.cardId === "fine-motion");
assert.equal(fineAtLB3.automaticEvaluation.title, "LB3 is already GOOD");
assert.match(fineAtLB3.automaticEvaluation.message, /Fine Motion LB4/i);

// Any non-Core, non-Wit card with an admin-defined minimum usable LB gets a
// generic dynamic breakpoint note, regardless of its card ID or target level.
const eishinFlash = seed.cards.find((card) => card.name === "Eishin Flash") || { id: "eishin-flash", name: "Eishin Flash", type: "Speed" };
const eishinBelow = evaluateMinimumUsableBreakpoint(eishinFlash, 0, 3);
assert.equal(eishinBelow.tone, "warning");
assert.equal(eishinBelow.recommendationStatus, "alternative");
assert.match(eishinBelow.title, /Below usable LB3/i);
assert.match(eishinBelow.message, /LB1.*below.*LB3/i);

const eishinReaches = evaluateMinimumUsableBreakpoint(eishinFlash, 2, 3);
assert.equal(eishinReaches.tone, "positive");
assert.equal(eishinReaches.recommendationStatus, "recommended");
assert.match(eishinReaches.title, /Good choice.*LB3/i);
assert.match(eishinReaches.message, /LB2.*LB3.*minimum usable LB3/i);

const eishinAbove = evaluateMinimumUsableBreakpoint(eishinFlash, 3, 3);
assert.equal(eishinAbove.tone, "info");
assert.match(eishinAbove.title, /Already usable at LB3/i);
assert.match(eishinAbove.message, /marginal upgrade/i);

assert.equal(evaluateMinimumUsableBreakpoint(eishinFlash, 0, null), null, "no auto note without an admin-defined minimum usable LB");
assert.equal(evaluateMinimumUsableBreakpoint({ id: "wit-test", name: "Test Wit", type: "Wit" }, 0, 3), null, "Wit retains its existing specialized caution instead of the generic breakpoint note");

console.log("Redeem planner tests passed, including pool restrictions, dynamic Fine Motion notes, and catalog-wide minimum-usable breakpoints.");
