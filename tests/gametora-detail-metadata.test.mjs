import assert from "node:assert/strict";

const originalFetch = globalThis.fetch;
const rows = [
  {
    id: 200681,
    name_en: "Professor of Curvature",
    description_en: "Increase velocity on a corner with skilled turning.",
    skill_type: "Speed",
    rarity: "Gold",
    icon_id: 12345,
    condition_groups: [{ condition: "corner_random==1", effects: [{ type: 27, value: 3500 }] }],
  },
  {
    id: 200681,
    skill_meta: { base_cost: 180 },
    skill_effects: [{ float_ability_time_1: 1.8 }],
  },
];

globalThis.fetch = async (url) => {
  const address = String(url);
  if (address.endsWith("/data/manifests/umamusume.json")) {
    return new Response(JSON.stringify({ skills: "a1b2c3d4" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  if (address.endsWith("/data/umamusume/skills.a1b2c3d4.json")) {
    return new Response(JSON.stringify({ skills: rows }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  throw new Error(`Unexpected mocked GameTora URL: ${address}`);
};

try {
  const { default: handler } = await import("../api/skill-reference.js?detail-metadata-test");
  const response = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({
    method: "GET",
    query: { mode: "gametora-detail", revision: "3", id: "200681", name: "Professor of Curvature" },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.sourceName, "GameTora");
  assert.equal(response.body.detail.name, "Professor of Curvature");
  assert.equal(response.body.detail.spCost, "180");
  assert.equal(response.body.detail.duration, "1.8 s base");
  assert.equal(response.body.detail.effect, "Target Speed +0.35 m/s");
  console.log("GameTora detail metadata merge test passed.");
} finally {
  globalThis.fetch = originalFetch;
}
