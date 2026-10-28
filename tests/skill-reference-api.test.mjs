import assert from "node:assert/strict";
import handler from "../api/skill-reference.js";

const originalFetch = globalThis.fetch;
const skillRecord = {
  id: 200999,
  name_en: "Metadata Merge Test",
  description_en: "Description from the main row.",
  skill_type: "Speed",
  rarity: "Gold",
  base_cost: "",
  base_duration: "",
  condition_groups: [{ condition: "phase>=1", effects: [{ type: 27, value: 3500 }] }],
};
// Simulate GameTora revisions that put base metadata in a sibling map keyed
// by skill ID instead of the main skill detail row.
const payloadData = {
  skills: [skillRecord],
  // Simulate GameTora metadata maps keyed by skill ID. The main skill record
  // does not carry these values, so the endpoint must join them by exact ID.
  skill_costs: { "200999": 180 },
  base_durations: { "200999": 24000 },
};

globalThis.fetch = async (url) => {
  const href = String(url);
  const payload = href.endsWith("/data/manifests/umamusume.json")
    ? { skills: "deadbeef" }
    : payloadData;
  return {
    ok: true,
    status: 200,
    url: href,
    headers: { get: (name) => name.toLowerCase() === "content-type" ? "application/json" : null },
    text: async () => JSON.stringify(payload),
  };
};

try {
  const response = {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await handler({ method: "GET", query: { mode: "gametora-detail", id: "200999", name: "Metadata Merge Test" } }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.detail.spCost, "180");
  assert.equal(response.body.detail.duration, "2.4 s base");
  assert.equal(response.body.detail.description, "Description from the main row.");
  assert.equal(response.body.detail.effect, "Target Speed +0.35 m/s");
  console.log("GameTora detail metadata merge API tests passed.");
} finally {
  globalThis.fetch = originalFetch;
}
