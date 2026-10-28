import { formatGameToraSkillEffect, normalizeGameToraSkillRecord } from "../src/lib/skillReference.js";

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
    const recordsById = new Map();
    // Keep every record that GameTora keys to the same numeric skill ID.
    // Some raw/display records contain effects while a related record carries
    // cost or duration metadata; detail normalization merges only same-ID rows.
    const byName = new Map();
    for (const [objectKey, record] of collection) {
      const recordId = record?.id ?? record?.skill_id ?? record?.skillId ?? objectKey;
      if (recordId != null && /^\d{4,8}$/.test(String(recordId))) {
        const id = String(recordId);
        byId.set(id, record);
        const sameId = recordsById.get(id) || [];
        if (!sameId.includes(record)) sameId.push(record);
        recordsById.set(id, sameId);
      }
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
    // Select the most complete GameTora row for the catalog/effect endpoint,
    // rather than letting a later sparse metadata row overwrite a full row.
    for (const [id, sameIdRecords] of recordsById.entries()) {
      let bestRecord = sameIdRecords[0];
      let bestScore = -1;
      for (const candidate of sameIdRecords) {
        const score = skillRecordScore(normalizeGameToraSkillRecord(candidate, id));
        if (score > bestScore) {
          bestRecord = candidate;
          bestScore = score;
        }
      }
      if (bestRecord) byId.set(id, bestRecord);
    }
    if (!byId.size && !byName.size) throw new Error("GameTora skill data could not be parsed.");
    gameToraSkillCache = { expiresAt: Date.now() + GAMETORA_CACHE_TTL, records: byId, recordsById, names: byName };
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

function skillRecordScore(detail) {
  if (!detail) return -1;
  return [
    detail.name && !/^Skill ID /.test(detail.name), detail.description, detail.iconUrl,
    detail.type, detail.rarity, detail.spCost, detail.duration,
    detail.activationSummary, detail.technicalCondition, detail.effect, detail.witCheck,
  ].filter(Boolean).length;
}

async function handleGameToraList(res) {
  try {
    const index = await loadGameToraSkillIndex();
    const skills = [];
    for (const [id, record] of index.records.entries()) {
      const skill = normalizeGameToraSkillRecord(record, id);
      if (!skill || !skill.name || /^Skill ID \d+$/.test(skill.name)) continue;
      skills.push({
        id: skill.id,
        name: skill.name,
        sourceUrl: skill.sourceUrl,
        globalAvailable: skill.globalAvailable,
        iconUrl: skill.iconUrl,
        type: skill.type,
        rarity: skill.rarity,
      });
    }
    skills.sort((a, b) => a.name.localeCompare(b.name));
    if (!skills.length) throw new Error("GameTora returned no named skills.");
    return res.status(200).json({ sourceName: "GameTora", skills, count: skills.length });
  } catch (error) {
    return res.status(502).json({ error: error?.name === "AbortError" ? "GameTora skill list timed out. Try again." : "Unable to load the skill list from GameTora." });
  }
}

async function handleGameToraDetail(req, id, res) {
  try {
    const index = await loadGameToraSkillIndex();
    const requestedName = String(req.query?.name || "").trim();
    const idRecord = index.records.get(String(id));
    if (!idRecord) return res.status(404).json({ error: "The skill ID was not found in GameTora's dataset." });

    // Use only GameTora records associated with this exact ID. Prefer the most
    // complete normalized record, then fill missing fields from same-ID records.
    // Never take metadata from a different skill that merely has a similar name.
    const candidates = [...new Set([...(index.recordsById?.get(String(id)) || []), idRecord])];
    const details = candidates
      .map((record) => normalizeGameToraSkillRecord(record, id, requestedName))
      .filter(Boolean)
      .sort((a, b) => skillRecordScore(b) - skillRecordScore(a));
    const detail = details[0] ? { ...details[0] } : null;
    if (!detail) return res.status(404).json({ error: "GameTora did not provide details for this skill ID." });
    for (const key of ["iconUrl", "description", "type", "rarity", "spCost", "duration", "activationSummary", "technicalCondition", "effect", "witCheck"]) {
      if (detail[key] !== undefined && detail[key] !== null && detail[key] !== "") continue;
      const alternative = details.find((candidate) => candidate[key] !== undefined && candidate[key] !== null && candidate[key] !== "");
      if (alternative) detail[key] = alternative[key];
    }
    return res.status(200).json({ sourceName: "GameTora", detail });
  } catch (error) {
    return res.status(502).json({ error: error?.name === "AbortError" ? "GameTora skill details timed out. Try again." : "Unable to load skill details from GameTora." });
  }
}



/** Same-origin, fixed-host proxy for GameTora's public skill data. */
export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const mode = typeof req.query?.mode === "string" ? req.query.mode : "gametora-detail";
  if (mode === "gametora-effect") {
    const id = String(req.query?.id || "");
    if (!/^\d{4,8}$/.test(id)) return res.status(400).json({ error: "A numeric skill ID is required." });
    return handleGameToraEffect(req, id, res);
  }
  if (mode === "gametora-list") return handleGameToraList(res);
  if (mode === "gametora-detail") {
    const id = String(req.query?.id || "");
    if (!/^\d{4,8}$/.test(id)) return res.status(400).json({ error: "A numeric skill ID is required." });
    return handleGameToraDetail(req, id, res);
  }
  return res.status(400).json({ error: "Unsupported mode." });
}
