import { formatGameToraSkillEffect } from "../src/lib/skillReference.js";

const SOURCE_ORIGIN = "https://www.mihonostudios.com";
const MAX_HTML_BYTES = 3_500_000;
const GAMETORA_ORIGIN = "https://gametora.com";
const MAX_GAMETORA_JSON_BYTES = 10_000_000;
const GAMETORA_CACHE_TTL = 6 * 60 * 60 * 1000;
let gameToraSkillCache = null;
let gameToraSkillFetchPromise = null;

async function fetchGameToraJson(url, timeoutMs = 10_000) {
  const parsedUrl = new URL(url);
  if (parsedUrl.origin !== GAMETORA_ORIGIN || !parsedUrl.pathname.startsWith("/data/")) {
    throw new Error("Unsupported GameTora data URL.");
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "UmaSelector-Skill-Reference/1.0 (+https://umaselector.vercel.app)" },
    });
  } finally { clearTimeout(timeout); }
  let finalUrl;
  try { finalUrl = new URL(response.url || url); } catch { throw new Error("Invalid GameTora response URL."); }
  if (finalUrl.origin !== GAMETORA_ORIGIN) throw new Error("GameTora redirected to an unsupported host.");
  if (!response.ok) throw new Error(`GameTora returned HTTP ${response.status}.`);
  if (!(response.headers.get("content-type") || "").toLowerCase().includes("json")) throw new Error("GameTora did not return JSON data.");
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_GAMETORA_JSON_BYTES) throw new Error("GameTora data was too large.");
  const text = await response.text();
  if (!text || text.length > MAX_GAMETORA_JSON_BYTES) throw new Error("GameTora data was empty or too large.");
  return JSON.parse(text);
}

async function loadGameToraSkillIndex() {
  if (gameToraSkillCache && gameToraSkillCache.expiresAt > Date.now()) return gameToraSkillCache;
  if (gameToraSkillFetchPromise) return gameToraSkillFetchPromise;
  gameToraSkillFetchPromise = (async () => {
    const manifest = await fetchGameToraJson(`${GAMETORA_ORIGIN}/data/manifests/umamusume.json`, 8_000);
    const hash = String(manifest?.skills || "");
    if (!/^[a-f0-9]{8}$/i.test(hash)) throw new Error("GameTora skills manifest entry is missing or invalid.");
    const payload = await fetchGameToraJson(`${GAMETORA_ORIGIN}/data/umamusume/skills.${hash}.json`, 12_000);
    const skillContainer = payload?.skills ?? payload?.items ?? payload?.data ?? payload;
    const collection = Array.isArray(skillContainer)
      ? skillContainer.map((record) => ["", record])
      : skillContainer && typeof skillContainer === "object"
        ? Object.entries(skillContainer).filter(([, record]) => record && typeof record === "object")
        : [];
    if (!collection.length) throw new Error("GameTora skill data could not be parsed.");
    const byId = new Map();
    // Keep all exact-name variants. A direct ID can exist in GameTora's
    // localized metadata without carrying the numeric effect fields; when that
    // happens, the exact-name variant may contain the raw effect record.
    const byName = new Map();
    for (const [objectKey, record] of collection) {
      const recordId = record?.id ?? record?.skill_id ?? record?.skillId ?? objectKey;
      if (recordId != null && /^\d{4,8}$/.test(String(recordId))) byId.set(String(recordId), record);
      const names = [
        record?.name, record?.name_en, record?.nameEn, record?.en_name,
        record?.skill_name, record?.skill_name_en, record?.skillName,
        record?.display_name, record?.displayName,
      ];
      for (const nameValue of names) {
        const candidates = nameValue && typeof nameValue === "object"
          ? [nameValue.en, nameValue.global, nameValue.english, nameValue.name_en]
          : [nameValue];
        for (const name of candidates) {
          const normalizedName = String(name || "").trim().toLocaleLowerCase();
          if (normalizedName && normalizedName.length <= 120) {
            const variants = byName.get(normalizedName) || [];
            if (!variants.includes(record)) variants.push(record);
            byName.set(normalizedName, variants);
          }
        }
      }
    }
    if (!byId.size && !byName.size) throw new Error("GameTora skill data did not contain identifiable skills.");
    gameToraSkillCache = { expiresAt: Date.now() + GAMETORA_CACHE_TTL, records: byId, names: byName };
    return gameToraSkillCache;
  })();
  try {
    return await gameToraSkillFetchPromise;
  } finally {
    gameToraSkillFetchPromise = null;
  }
}

async function handleGameToraEffect(req, id, res) {
  try {
    const index = await loadGameToraSkillIndex();
    const requestedName = String(req.query?.name || "").trim().toLocaleLowerCase();
    const idRecord = index.records.get(String(id));
    const nameRecords = requestedName ? (index.names.get(requestedName) || []) : [];
    const candidates = [...new Set([...(idRecord ? [idRecord] : []), ...nameRecords])];
    let effect = "";
    for (const candidate of candidates) {
      effect = formatGameToraSkillEffect(candidate);
      if (effect) break;
    }
    return res.status(200).json({ id, effect, sourceUrl: `${GAMETORA_ORIGIN}/umamusume/skills`, sourceName: "GameTora" });
  } catch (error) {
    return res.status(502).json({ error: error?.name === "AbortError" ? "GameTora effect data timed out. Try again." : "Unable to load effect data from GameTora." });
  }
}

/** Same-origin, fixed-host proxy. Only numeric skill IDs are accepted (SSRF guard). */
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mode = typeof req.query?.mode === "string" ? req.query.mode : "detail";
  if (mode === "gametora-effect") {
    const id = String(req.query?.id || "");
    if (!/^\d{4,8}$/.test(id)) return res.status(400).json({ error: "A numeric skill ID is required." });
    return handleGameToraEffect(req, id, res);
  }
  let sourceUrl;
  if (mode === "list") sourceUrl = `${SOURCE_ORIGIN}/database/skills`;
  else if (mode === "detail") {
    const id = String(req.query?.id || "");
    if (!/^\d{4,8}$/.test(id)) return res.status(400).json({ error: "A numeric skill ID is required." });
    sourceUrl = `${SOURCE_ORIGIN}/database/skills/${id}`;
  } else return res.status(400).json({ error: "Unsupported mode." });

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let upstream;
    try {
      upstream = await fetch(sourceUrl, {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "UmaSelector-Skill-Reference/1.0 (+https://umaselector.vercel.app)" },
      });
    } finally { clearTimeout(timeout); }
    let finalOrigin = "";
    try { finalOrigin = new URL(upstream.url || sourceUrl).origin; } catch { /* Invalid upstream URL is rejected below. */ }
    if (finalOrigin !== SOURCE_ORIGIN) return res.status(502).json({ error: "Skill reference redirected to an unsupported host." });
    if (!upstream.ok) return res.status(502).json({ error: `Skill reference returned HTTP ${upstream.status}.`, sourceUrl });
    if (!(upstream.headers.get("content-type") || "").toLowerCase().includes("text/html")) return res.status(502).json({ error: "Skill reference did not return an HTML page.", sourceUrl });
    const declaredLength = Number(upstream.headers.get("content-length") || 0);
    if (declaredLength > MAX_HTML_BYTES) return res.status(502).json({ error: "Skill reference response was too large.", sourceUrl });
    const html = await upstream.text();
    if (!html || html.length > MAX_HTML_BYTES) return res.status(502).json({ error: "Skill reference response was empty or too large.", sourceUrl });
    return res.status(200).json({ html, sourceUrl, fetchedAt: new Date().toISOString() });
  } catch (error) {
    return res.status(502).json({ error: error?.name === "AbortError" ? "Skill reference timed out. Try again." : "Skill reference is temporarily unavailable." });
  }
}
