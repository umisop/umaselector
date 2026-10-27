const SOURCE_ORIGIN = "https://www.mihonostudios.com";
const INDEX_CACHE_KEY = "umaselector-skill-reference-index-v1";
const DETAIL_CACHE_PREFIX = "umaselector-skill-reference-detail-v8:";
const INDEX_TTL = 7 * 24 * 60 * 60 * 1000;
const DETAIL_TTL = 30 * 24 * 60 * 60 * 1000;
const FALLBACK_SKILLS = [
  { id: "200721", name: "Killer Tunes", sourceUrl: `${SOURCE_ORIGIN}/database/skills/200721`, globalAvailable: true },
  { id: "200681", name: "Mile Maven", sourceUrl: `${SOURCE_ORIGIN}/database/skills/200681`, globalAvailable: true },
];

function safeReadCache(key, ttl) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed || !parsed.cachedAt || Date.now() - parsed.cachedAt > ttl) return null;
    return parsed.value ?? null;
  } catch { return null; }
}
function safeWriteCache(key, value) {
  try { window.localStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value })); } catch { /* Cache is optional. */ }
}

async function getProxyHtml(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/skill-reference?${query.toString()}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.html !== "string") throw new Error(payload.error || "Unable to load skill data from the reference database.");
  return { ...payload, html: payload.html.slice(0, 3_500_000) };
}
async function getGameToraEffect(id, name = "") {
  const query = new URLSearchParams({ mode: "gametora-effect", id: String(id), effectVersion: "2" });
  if (String(name).trim()) query.set("name", String(name).trim());
  const response = await fetch(`/api/skill-reference?${query.toString()}`, { headers: { Accept: "application/json" }, credentials: "same-origin" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || typeof payload.effect !== "string") throw new Error(payload.error || "Unable to load effect data from GameTora.");
  return payload.effect;
}
function normalizedText(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
}
function cleanSkillDescription(value) {
  // The reference site's blockquote can include its own trailing locale label.
  // That label is source metadata, not part of the in-game description.
  return normalizedText(value)
    .replace(/\s*In-game\s+description\s*\([^)]*\)\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function parseSourceUrl(href, base = SOURCE_ORIGIN) {
  try {
    const url = new URL(href, base);
    if (url.origin !== SOURCE_ORIGIN) return null;
    const match = url.pathname.match(/^\/database\/skills\/(\d+)\/?$/);
    return match ? { id: match[1], sourceUrl: `${SOURCE_ORIGIN}/database/skills/${match[1]}` } : null;
  } catch { return null; }
}
function getAvailabilityContext(anchor) {
  let node = anchor;
  let context = anchor.textContent || "";
  for (let depth = 0; node && depth < 5; depth += 1, node = node.parentElement) {
    const current = normalizedText(node.textContent);
    if (current && current.length <= 260 && current.toLowerCase().includes(normalizedText(anchor.textContent).toLowerCase())) {
      context = current;
      if (/not on global yet/i.test(current)) return false;
    }
  }
  return !/not on global yet/i.test(context);
}

export function parseSkillIndexHtml(html) {
  if (typeof DOMParser === "undefined") return FALLBACK_SKILLS;
  const doc = new DOMParser().parseFromString(html, "text/html");
  const entries = new Map();
  for (const anchor of doc.querySelectorAll('a[href*="/database/skills/"]')) {
    const ref = parseSourceUrl(anchor.getAttribute("href"));
    const name = normalizedText(anchor.textContent);
    if (!ref || !name || name.length > 100 || /^(image|quick look)$/i.test(name)) continue;
    if (entries.has(ref.id)) continue;
    entries.set(ref.id, { ...ref, name, globalAvailable: getAvailabilityContext(anchor) });
  }
  return [...entries.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function sectionBetween(text, startLabel, endLabel) {
  const lower = text.toLowerCase();
  const start = lower.indexOf(startLabel.toLowerCase());
  if (start < 0) return "";
  const contentStart = start + startLabel.length;
  const end = endLabel ? lower.indexOf(endLabel.toLowerCase(), contentStart) : -1;
  return normalizedText(text.slice(contentStart, end >= 0 ? end : undefined));
}
function firstUsefulLines(value, maxLines = 4) {
  const ignored = /^(early|mid|late|spurt|early mid late spurt|1 step by step|how it works|when it fires|what it does|how long|wit check|global|japanese|english)$/i;
  return normalizedText(value).split(/\n+/).map((line) => line.trim()).filter((line) => line && !ignored.test(line) && !/^\* (race phases|random point|places from|conditions as the game writes)/i.test(line)).slice(0, maxLines).join(" ");
}

function getMetric(text, label, stopLabels) {
  const index = text.toLowerCase().indexOf(label.toLowerCase());
  if (index < 0) return "";
  const start = index + label.length;
  const candidates = stopLabels.map((next) => text.toLowerCase().indexOf(next.toLowerCase(), start)).filter((position) => position >= 0);
  const end = candidates.length ? Math.min(...candidates) : Math.min(text.length, start + 80);
  return normalizedText(text.slice(start, end)).split(/\n+/).map((line) => line.trim()).find(Boolean) || "";
}

const GAMETORA_EFFECT_NAMES = {
  1: "Speed Stat Gain", 2: "Stamina Stat Gain", 3: "Power Stat Gain",
  4: "Guts Stat Gain", 5: "Wit Stat Gain", 7: "Stamina Drain Rate",
  8: "Visibility Up", 9: "Stamina Recovery", 10: "Reaction Time",
  11: "Force Overtake In", 12: "Force Overtake Out", 13: "Panic Duration",
  14: "Start Delay", 21: "Current Speed", 22: "Current Speed + Decel",
  27: "Target Speed", 28: "Lane Speed", 29: "Panic Chance",
  30: "Push Chance", 31: "Acceleration", 32: "All Stat Gain",
  35: "Lane Target", 36: "Random Skill Activation",
  37: "Random Rare Skill Activation", 38: "Debuff Immunity",
  39: "Debuff Value Multiply", 40: "Debuff Value Multiply Other Activate",
  501: "Challenge Match Bonus (Old)", 502: "Challenge Match Bonus (Status)",
  503: "Challenge Match Bonus (Motivation)",
};

function formatEffectNumber(rawValue, { scaled = true } = {}) {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) return "";
  const value = scaled ? numeric / 10_000 : numeric;
  return String(Number(value.toFixed(4)));
}

function formatGameToraAbility(typeValue, rawValue, options = {}) {
  const type = Number(typeValue);
  const value = Number(rawValue);
  if (!Number.isFinite(type) || type <= 0 || !Number.isFinite(value) || value === 0) return "";
  const label = GAMETORA_EFFECT_NAMES[type];
  // Unknown effects are intentionally skipped rather than guessing a label.
  if (!label) return "";
  const formattedValue = formatEffectNumber(value, options);
  if (!formattedValue || formattedValue === "0") return "";
  const sign = Number(formattedValue) > 0 ? "+" : "";
  const unit = type === 9 ? "%" : [21, 22, 27, 28].includes(type) ? " m/s" : type === 31 ? " m/s²" : "";
  return `${label} ${sign}${formattedValue}${unit}`;
}

/** Format only numeric type/value pairs from GameTora's raw effect records. */
export function formatGameToraSkillEffect(record) {
  if (!record || typeof record !== "object") return "";
  const output = [];
  const visited = new Set();
  const seenPairs = new Set();
  const typeKeys = ["ability_type", "abilityType", "effect_type", "effectType", "type_id", "typeId"];
  const rawValueKeys = ["float_ability_value", "floatAbilityValue", "ability_value", "abilityValue", "float_value", "floatValue"];
  const plainValueKeys = ["value", "amount", "effect_value", "effectValue"];

  const add = (type, value, options = {}) => {
    const key = `${String(type)}|${String(value)}|${options.scaled !== false}`;
    if (seenPairs.has(key)) return;
    seenPairs.add(key);
    const label = formatGameToraAbility(type, value, options);
    if (label && !output.includes(label)) output.push(label);
  };
  const get = (object, keys) => {
    const lookup = new Map(Object.entries(object).map(([key, value]) => [key.toLowerCase(), value]));
    for (const key of keys) {
      if (lookup.has(key.toLowerCase())) return lookup.get(key.toLowerCase());
    }
    return undefined;
  };
  const walk = (node, depth = 0, parentKey = "") => {
    if (!node || typeof node !== "object" || depth > 5 || visited.has(node)) return;
    visited.add(node);
    if (Array.isArray(node)) {
      // Some localized GameTora payloads encode an effect as [type, value].
      // Only interpret this shape inside an effects/abilities container.
      if (["effects", "abilities", "effect", "ability", "skill_effects", "skilleffects"].includes(parentKey.toLowerCase())
        && node.length >= 2 && (typeof node[0] === "number" || /^\d+$/.test(String(node[0])))
        && (typeof node[1] === "number" || /^-?\d+(?:\.\d+)?$/.test(String(node[1])))) {
        const raw = Number(node[1]);
        add(node[0], raw, { scaled: Math.abs(raw) > 10 });
      }
      for (const item of node) walk(item, depth + 1, parentKey);
      return;
    }

    // Original GameTora raw master-data fields: ability_type_1_1 and
    // float_ability_value_1_1 (plus the second effect/third ability slots).
    const suffixes = new Set();
    for (const key of Object.keys(node)) {
      const match = key.match(/^(?:ability_type|abilityType)_(\d+)_(\d+)$/i);
      if (match) suffixes.add(`${match[1]}_${match[2]}`);
    }
    const orderedSuffixes = [...suffixes].sort((left, right) => {
      const [lg, ls] = left.split("_").map(Number);
      const [rg, rs] = right.split("_").map(Number);
      return lg - rg || ls - rs;
    });
    for (const suffix of orderedSuffixes) {
      const type = node[`ability_type_${suffix}`] ?? node[`abilityType_${suffix}`];
      const value = node[`float_ability_value_${suffix}`]
        ?? node[`floatAbilityValue_${suffix}`]
        ?? node[`ability_value_${suffix}`]
        ?? node[`abilityValue_${suffix}`];
      add(type, value, { scaled: true });
    }

    // Also support localized/nested GameTora variants with one type/value pair
    // per object rather than flattened _1_1 keys.
    const type = get(node, typeKeys);
    const rawValue = get(node, rawValueKeys);
    if (type !== undefined && rawValue !== undefined) add(type, rawValue, { scaled: true });
    else {
      const plainValue = get(node, plainValueKeys);
      if (type !== undefined && plainValue !== undefined) {
        const number = Number(plainValue);
        add(type, plainValue, { scaled: Math.abs(number) > 10 });
      } else if (["effects", "effect", "abilities", "ability", "skill_effects", "skilleffects", "effect_data", "effectdata", "raw_effects", "raweffects"].includes(parentKey.toLowerCase())) {
        // Some GameTora payloads use a compact { type, value } object.
        const genericType = get(node, ["type"]);
        if (genericType !== undefined && plainValue !== undefined) {
          const number = Number(plainValue);
          add(genericType, plainValue, { scaled: Math.abs(number) > 10 });
        }
      }
    }

    // Do not scan arbitrary metadata objects; descend only through plausible
    // effect containers to avoid mistaking unrelated numeric values for effects.
    for (const [key, value] of Object.entries(node)) {
      if (["effects", "effect", "abilities", "ability", "skill_effects", "skilleffects", "effect_data", "effectdata", "raw_effects", "raweffects", "condition_groups", "conditiongroups", "data", "skill", "skill_data", "skilldata", "details"].includes(key.toLowerCase())) {
        walk(value, depth + 1, key);
      }
    }
  };

  walk(record);
  return output.join(" · ");
}

export function parseSkillDetailHtml(html, fallback = {}) {
  if (typeof DOMParser === "undefined") throw new Error("This browser cannot parse skill reference data.");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const title = normalizedText(doc.querySelector("h1")?.textContent) || fallback.name || "Unknown skill";
  const description = cleanSkillDescription(doc.querySelector("blockquote")?.textContent);
  const bodyText = normalizedText(doc.body?.innerText || doc.body?.textContent || "");
  const nameOffset = bodyText.indexOf(title);
  const headerText = nameOffset >= 0 ? bodyText.slice(Math.max(0, nameOffset - 100), nameOffset) : "";
  const skillClassPattern = /(Speed|Stamina|Power|Guts|Wit|Debuff|Recovery|Acceleration|Other)\s*[·•]\s*(Gold|Normal|Unique|Evolved)/i;
  const typeRarity = headerText.match(skillClassPattern);
  const typeFallback = bodyText.match(skillClassPattern);
  const type = typeRarity?.[1]?.trim() || typeFallback?.[1]?.trim() || "";
  const rarity = typeRarity?.[2] || typeFallback?.[2] || "";
  const activationRaw = sectionBetween(bodyText, "A When it fires", "B What it does");
  const durationRaw = sectionBetween(bodyText, "C How long", "D Wit check");
  const conditionCodes = [...new Set([...doc.querySelectorAll("code")].map((node) => normalizedText(node.textContent)).filter((value) => value && /(?:==|!=|<=|>=|<|>|_)/.test(value)))];
  const icons = [...doc.querySelectorAll("img[src]")].map((image) => {
    try {
      const url = new URL(image.getAttribute("src"), SOURCE_ORIGIN);
      return url.origin === SOURCE_ORIGIN && url.pathname.startsWith("/img/skill-icons/") ? url.href : null;
    } catch { return null; }
  }).filter(Boolean);
  const id = String(fallback.id || "");
  const effect = "";
  return {
    id, name: title, sourceUrl: `${SOURCE_ORIGIN}/database/skills/${encodeURIComponent(id)}`,
    iconUrl: icons[0] || "", description, type, rarity,
    spCost: getMetric(bodyText, "SP cost", ["Evaluation", "Duration", "Wit check", "ID", "1 Step by step"]),
    duration: getMetric(bodyText, "Duration", ["Wit check", "ID", "1 Step by step"]) || firstUsefulLines(durationRaw, 2),
    activationSummary: firstUsefulLines(activationRaw, 5), technicalCondition: conditionCodes.join(" & "),
    effect,
    witCheck: /Wit check\s+Yes/i.test(bodyText) ? "Yes" : /Wit check\s+No/i.test(bodyText) ? "No" : "",
    sourceName: "Uma Musume Hub",
  };
}

export async function getSkillIndex({ forceRefresh = false } = {}) {
  if (typeof window !== "undefined" && !forceRefresh) {
    const cached = safeReadCache(INDEX_CACHE_KEY, INDEX_TTL);
    if (Array.isArray(cached) && cached.length) return cached;
  }
  const { html } = await getProxyHtml({ mode: "list" });
  const skills = parseSkillIndexHtml(html);
  if (!skills.length) throw new Error("The reference skill list could not be parsed. You can still add a skill by its numeric ID.");
  if (typeof window !== "undefined") safeWriteCache(INDEX_CACHE_KEY, skills);
  return skills;
}
export function getCachedSkillIndex() {
  if (typeof window === "undefined") return FALLBACK_SKILLS;
  return safeReadCache(INDEX_CACHE_KEY, INDEX_TTL) || FALLBACK_SKILLS;
}
export async function getSkillDetail(id, fallback = {}) {
  const normalizedId = String(id || "");
  if (!/^\d{4,8}$/.test(normalizedId)) throw new Error("Invalid skill reference ID.");
  const key = `${DETAIL_CACHE_PREFIX}${normalizedId}`;
  if (typeof window !== "undefined") {
    const cached = safeReadCache(key, DETAIL_TTL);
    if (cached && cached.id === normalizedId) {
      // Retry the separate GameTora effect source when an earlier request failed.
      if (!cached.effect) {
        try {
          cached.effect = await getGameToraEffect(normalizedId, fallback.name || cached.name);
          if (cached.effect) safeWriteCache(key, cached);
        } catch { /* Keep the rest of the detail available when the effect source is down. */ }
      }
      return cached;
    }
  }
  const [{ html }, effect] = await Promise.all([
    getProxyHtml({ mode: "detail", id: normalizedId }),
    getGameToraEffect(normalizedId, fallback.name).catch(() => ""),
  ]);
  const detail = parseSkillDetailHtml(html, { ...fallback, id: normalizedId });
  detail.effect = effect;
  if (typeof window !== "undefined") safeWriteCache(key, detail);
  return detail;
}

export const SKILL_REFERENCE_HOME = `${SOURCE_ORIGIN}/database/skills`;
