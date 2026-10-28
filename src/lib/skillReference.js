const GAMETORA_ORIGIN = "https://gametora.com";
const INDEX_CACHE_KEY = "umaselector-gametora-skill-index-v5";
const DETAIL_CACHE_PREFIX = "umaselector-gametora-skill-detail-v14:";
const INDEX_TTL = 7 * 24 * 60 * 60 * 1000;
const DETAIL_TTL = 30 * 24 * 60 * 60 * 1000;
const FALLBACK_SKILLS = [
  { id: "200721", name: "Killer Tunes", sourceUrl: `${GAMETORA_ORIGIN}/umamusume/skills`, globalAvailable: true },
  { id: "200681", name: "Mile Maven", sourceUrl: `${GAMETORA_ORIGIN}/umamusume/skills`, globalAvailable: true },
];

function safeReadCache(key, ttl) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || "null");
    if (!parsed || !parsed.cachedAt || Date.now() - parsed.cachedAt > ttl) return null;
    return parsed.value ?? null;
  } catch {
    return null;
  }
}
function safeWriteCache(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ cachedAt: Date.now(), value }));
  } catch {
    /* Cache is optional. */
  }
}

async function getGameToraApi(params) {
  const query = new URLSearchParams(params);
  const response = await fetch(`/api/skill-reference?${query.toString()}`, { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Unable to load skill data from GameTora.");
  return payload;
}
function normalizedText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
function lookupField(record, keys) {
  if (!record || typeof record !== "object") return undefined;
  const lowerKeys = new Map(Object.entries(record).map(([key, value]) => [key.toLowerCase(), value]));
  for (const key of keys) if (lowerKeys.has(key.toLowerCase())) return lowerKeys.get(key.toLowerCase());
  return undefined;
}
function displayText(value) {
  if (typeof value === "string" || typeof value === "number") return normalizedText(value);
  if (Array.isArray(value)) return value.map(displayText).filter(Boolean).join(" ");
  if (value && typeof value === "object") {
    for (const key of ["en", "global", "english", "en_us", "name_en", "description_en", "text_en", "url", "src", "href", "value"]) {
      if (value[key] !== undefined) {
        const text = displayText(value[key]);
        if (text) return text;
      }
    }
  }
  return "";
}
function getString(record, keys) {
  return displayText(lookupField(record, keys));
}

const GAME_TORA_NESTED_DATA_KEYS = new Set([
  "skill",
  "data",
  "details",
  "metadata",
  "meta",
  "master",
  "master_data",
  "masterdata",
  "raw",
  "skill_data",
  "skilldata",
  "skill_meta",
  "skillmeta",
  "skill_effects",
  "skilleffects",
  "condition_groups",
  "conditiongroups",
  "condition_group",
  "conditiongroup",
  "conditions",
  "groups",
  "effects",
  "effect",
  "effect_data",
  "effectdata",
  "raw_effects",
  "raweffects",
  "abilities",
  "ability",
]);

function isNonEmptyMetadata(value) {
  return value !== undefined && value !== null && value !== "";
}

// Search known GameTora fields by semantic priority across the entire skill
// record, not just the root or a hand-picked set of containers. This avoids
// dropping values when GameTora moves metadata into a nested object.
function findGameToraFieldDeep(record, keys, maxDepth = 8) {
  const nodes = [];
  const visited = new Set();
  const collect = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > maxDepth || visited.has(node)) return;
    visited.add(node);
    nodes.push(node);
    if (Array.isArray(node)) {
      for (const child of node) collect(child, depth + 1);
      return;
    }
    for (const child of Object.values(node)) {
      if (child && typeof child === "object") collect(child, depth + 1);
    }
  };
  collect(record);

  for (const wantedKey of keys) {
    const lowered = wantedKey.toLowerCase();
    for (const node of nodes) {
      if (Array.isArray(node)) continue;
      for (const [actualKey, value] of Object.entries(node)) {
        if (actualKey.toLowerCase() === lowered && isNonEmptyMetadata(value)) {
          return { key: actualKey, value };
        }
      }
    }
  }
  return undefined;
}

function findGameToraDurationField(record) {
  // Prefer human-readable fields from GameTora if present.
  const displayField = findGameToraFieldDeep(record, [
    "base_duration_text",
    "baseDurationText",
    "duration_text",
    "durationText",
    "base_duration_display",
    "baseDurationDisplay",
    "duration_display",
    "durationDisplay",
    "duration_label",
    "durationLabel",
    "base_duration_label",
    "baseDurationLabel",
  ]);
  if (displayField) return displayField;

  // GameTora's skill dataset stores the base duration directly on each
  // condition group, e.g. condition_groups[0].base_time = 30000.
  // These fixed-point values use 1/10000-second units (30000 => 3 s).
  // Read this exact field explicitly instead of guessing from arbitrary keys
  // named "time" elsewhere in the condition data.
  const conditionGroupsField = findGameToraFieldDeep(record, ["condition_groups", "conditionGroups", "condition_group", "conditionGroup"]);
  if (conditionGroupsField) {
    const groupsValue = conditionGroupsField.value;
    const groups = Array.isArray(groupsValue) ? groupsValue : groupsValue && typeof groupsValue === "object" ? Object.values(groupsValue) : [];
    for (const group of groups) {
      if (!group || typeof group !== "object") continue;
      const baseTime = lookupField(group, ["base_time", "baseTime"]);
      if (isNonEmptyMetadata(baseTime) && Number.isFinite(Number(baseTime))) {
        return { key: "condition_groups.base_time", value: baseTime };
      }
    }
  }

  // GameTora may also expose raw master-data duration under other wrappers.
  // Walk only the same skill record and identify duration fields semantically;
  // cooldown/activation time is excluded.
  const nodes = [];
  const visited = new Set();
  const collect = (node, depth = 0) => {
    if (!node || typeof node !== "object" || depth > 12 || visited.has(node)) return;
    visited.add(node);
    nodes.push(node);
    if (Array.isArray(node)) {
      for (const child of node) collect(child, depth + 1);
      return;
    }
    for (const child of Object.values(node)) if (child && typeof child === "object") collect(child, depth + 1);
  };
  collect(record);

  const abilityTimeCandidates = [];
  const durationCandidates = [];
  const normalizeKey = (key) =>
    key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  for (const node of nodes) {
    if (Array.isArray(node)) continue;
    for (const [key, value] of Object.entries(node)) {
      if (!isNonEmptyMetadata(value)) continue;
      const normalizedKey = normalizeKey(key);
      if (/(cooldown|activation|condition|remaining|delay|random|interval)/.test(normalizedKey)) continue;

      // Raw GameTora/master-data columns, e.g. float_ability_time_1.
      if (/^(?:float)?abilitytime\d*$/.test(normalizedKey)) {
        abilityTimeCandidates.push({ key, value });
        continue;
      }

      // Display/normalized aliases, including durationSeconds/durationMs and
      // BaseDuration-style names. Do not treat unrelated fields containing
      // the word "time" as base duration.
      if (/^(?:(?:base|effect|skill))?duration(?:seconds?|secs?|milliseconds?|ms|value|base|raw)?\d*$/.test(normalizedKey)) {
        durationCandidates.push({ key, value });
      }
    }
  }

  return abilityTimeCandidates[0] || durationCandidates[0] || undefined;
}

function formatBaseDuration(field) {
  if (!field || !isNonEmptyMetadata(field.value)) return "";
  const text = displayText(field.value);
  if (!text) return "";

  // Keep a complete source-formatted label unchanged.
  if (typeof field.value === "string" && /\b(?:s|sec|seconds?|ms|milliseconds?)\b/i.test(field.value)) {
    const withUnit = text.match(/^(-?\d+(?:\.\d+)?)\s*(ms|milliseconds?|s|sec|seconds?)(?:\s+base)?$/i);
    if (!withUnit) return text;
    const number = Number(withUnit[1]);
    const unit = withUnit[2].toLowerCase();
    if (!Number.isFinite(number)) return "";
    if (number < 0) return "Infinite";
    if (number === 0) return "Instant effect";
    const seconds = unit === "ms" || unit.startsWith("millisecond") ? number / 1000 : number;
    return `${String(Number(seconds.toFixed(3)))} s base`;
  }

  const raw = Number(text);
  if (!Number.isFinite(raw)) return "";
  if (raw < 0) return "Infinite";
  if (raw === 0) return "Instant effect";

  const normalizedKey = field.key
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  let seconds;
  if (/milliseconds?|ms/.test(normalizedKey) && !/abilitytime/.test(normalizedKey)) {
    seconds = raw / 1000;
  } else if (/abilitytime/.test(normalizedKey)) {
    // GameTora's raw master ability-time values use 1/10000-second units,
    // while normalized GameTora records may already contain seconds.
    seconds = raw >= 1000 ? raw / 10000 : raw;
  } else if (raw >= 1000) {
    seconds = raw / 10000;
  } else {
    seconds = raw;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return `${String(Number(seconds.toFixed(3)))} s base`;
}

function getSourceImage(value) {
  const source = displayText(value);
  if (!source || !/^(?:https?:\/\/|\/|\.\.?\/)/i.test(source)) return "";
  try {
    const base = source.startsWith("/umamusume/skills/icon/") ? "https://media.gametora.com" : GAMETORA_ORIGIN;
    const url = new URL(source, base);
    if (url.protocol !== "https:" || !["gametora.com", "media.gametora.com"].includes(url.hostname)) return "";
    return url.href;
  } catch {
    return "";
  }
}
function globalAvailability(record, name) {
  const flag = lookupField(record, [
    "globalAvailable",
    "global_available",
    "availableEN",
    "available_en",
    "availableGlobal",
    "available_global",
    "availableInGlobal",
    "available_in_global",
    "availableOnGlobal",
    "available_on_global",
    "isGlobal",
    "is_global",
    "isAvailableGlobal",
    "is_available_global",
    "available",
  ]);
  if (typeof flag === "boolean") return flag;
  if (typeof flag === "number") return flag !== 0;
  if (typeof flag === "string") {
    const value = flag.trim().toLowerCase();
    if (["false", "0", "no", "jp", "jp-only", "jp_only", "upcoming"].includes(value)) return false;
    if (["true", "1", "yes", "global", "en"].includes(value)) return true;
  }
  const jpOnly = lookupField(record, [
    "jp_only",
    "jpOnly",
    "japanese_only",
    "japaneseOnly",
    "is_jp_only",
    "isJpOnly",
    "upcoming",
    "is_upcoming",
    "isUpcoming",
    "not_global",
    "notGlobal",
    "not_on_global",
    "notOnGlobal",
  ]);
  if (jpOnly === true || jpOnly === 1 || ["true", "1", "yes"].includes(String(jpOnly || "").toLowerCase())) return false;
  const region = getString(record, ["server", "region", "availability", "release_region", "releaseRegion", "release_server", "releaseServer", "release_status", "releaseStatus"]).toLowerCase();
  if (/japanese only|jp only|not on global|upcoming|japan only/.test(region)) return false;
  const releaseDate = getString(record, ["global_release_date", "globalReleaseDate", "release_date_global", "releaseDateGlobal", "release_date_en", "releaseDateEn"]);
  if (/^20\d{2}[-/]\d{1,2}[-/]\d{1,2}/.test(releaseDate)) {
    const timestamp = Date.parse(releaseDate);
    if (Number.isFinite(timestamp) && timestamp > Date.now()) return false;
  }
  return !/(?:\[jp\]|\bjp\s*(?:\(not on global yet\))?$|jp only|not on global yet|global unavailable)/i.test(name);
}
function normalizeRarity(value) {
  const raw = displayText(value);
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (["normal", "gold", "rare", "unique", "evolved"].includes(lower)) return lower === "rare" ? "Gold" : lower[0].toUpperCase() + lower.slice(1);
  const numeric = Number(raw);
  return { 1: "Normal", 2: "Gold", 3: "Unique", 6: "Evolved" }[numeric] || "";
}
function normalizeType(value) {
  const raw = displayText(value);
  if (!raw) return "";
  const lower = raw.toLowerCase().trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  const aliases = {
    speed: "Speed",
    velocity: "Speed",
    "target speed": "Speed",
    "current speed": "Speed",
    "lane speed": "Speed",
    acceleration: "Acceleration",
    accel: "Acceleration",
    stamina: "Stamina",
    power: "Power",
    guts: "Guts",
    wit: "Wit",
    intelligence: "Wit",
    recovery: "Recovery",
    heal: "Recovery",
    "stamina recovery": "Recovery",
    debuff: "Debuff",
    passive: "Passive",
    navigation: "Navigation",
    vision: "Vision",
    start: "Start",
    other: "Other",
    scenario: "Scenario",
  };
  // GameTora also exposes compact internal identifiers (for example
  // `cor nac` and `sho_l_2_l_3 mil`). Never leak those into the public UI.
  return aliases[lower] || "";
}

function inferSkillTypeFromEffect(effect) {
  const text = String(effect || "").toLowerCase();
  if (!text) return "";
  if (/(?:target speed|current speed|lane speed|speed stat gain)/.test(text)) return "Speed";
  if (/acceleration/.test(text)) return "Acceleration";
  if (/stamina recovery/.test(text)) return "Recovery";
  if (/stamina stat gain/.test(text)) return "Stamina";
  if (/power stat gain/.test(text)) return "Power";
  if (/guts stat gain/.test(text)) return "Guts";
  if (/wit stat gain/.test(text)) return "Wit";
  if (/(?:panic chance|panic duration|push chance|stamina drain rate|debuff)/.test(text)) return "Debuff";
  if (/visibility up/.test(text)) return "Vision";
  if (/start delay/.test(text)) return "Start";
  return "";
}
function getConditionTexts(record) {
  const texts = [];
  const direct = getString(record, [
    "activationSummary",
    "activation_summary",
    "activationConditionText",
    "activation_condition_text",
    "conditionDescription",
    "condition_description",
    "conditionText",
    "condition_text",
    "triggerDescription",
    "trigger_description",
  ]);
  if (direct) texts.push(direct);
  const groups = lookupField(record, ["condition_groups", "conditionGroups"]);
  const walk = (value, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    const summary = getString(value, [
      "activationSummary",
      "activation_summary",
      "conditionDescription",
      "condition_description",
      "conditionText",
      "condition_text",
      "displayCondition",
      "display_condition",
      "conditionDisplay",
      "condition_display",
    ]);
    if (summary && !/(?:==|!=|<=|>=|_)/.test(summary)) texts.push(summary);
    for (const [key, child] of Object.entries(value)) {
      if (["condition_groups", "conditionGroups", "conditions", "groups"].includes(key.toLowerCase())) walk(child, depth + 1);
    }
  };
  walk(groups);
  return [...new Set(texts)].join(" · ");
}
function getTechnicalConditions(record) {
  const values = [];
  const direct = getString(record, [
    "technicalCondition",
    "technical_condition",
    "conditionFormula",
    "condition_formula",
    "conditionExpression",
    "condition_expression",
    "activationCondition",
    "activation_condition",
    "condition",
  ]);
  if (direct && /(?:==|!=|<=|>=|<|>|_)/.test(direct)) values.push(direct);
  const groups = lookupField(record, ["condition_groups", "conditionGroups"]);
  const walk = (value, depth = 0) => {
    if (!value || depth > 5) return;
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, depth + 1));
      return;
    }
    if (typeof value !== "object") return;
    for (const key of ["condition", "condition_formula", "conditionFormula", "condition_expression", "conditionExpression", "activation_condition", "activationCondition"]) {
      const text = displayText(lookupField(value, [key]));
      if (text && /(?:==|!=|<=|>=|<|>|_)/.test(text)) values.push(text);
    }
    for (const [key, child] of Object.entries(value)) if (["condition_groups", "conditionGroups", "conditions", "groups"].includes(key.toLowerCase())) walk(child, depth + 1);
  };
  walk(groups);
  return [...new Set(values)].join(" & ");
}

const GAMETORA_EFFECT_NAMES = {
  1: "Speed Stat Gain",
  2: "Stamina Stat Gain",
  3: "Power Stat Gain",
  4: "Guts Stat Gain",
  5: "Wit Stat Gain",
  7: "Stamina Drain Rate",
  8: "Visibility Up",
  9: "Stamina Recovery",
  10: "Reaction Time",
  11: "Force Overtake In",
  12: "Force Overtake Out",
  13: "Panic Duration",
  14: "Start Delay",
  21: "Current Speed",
  22: "Current Speed + Decel",
  27: "Target Speed",
  28: "Lane Speed",
  29: "Panic Chance",
  30: "Push Chance",
  31: "Acceleration",
  32: "All Stat Gain",
  35: "Lane Target",
  36: "Random Skill Activation",
  37: "Random Rare Skill Activation",
  38: "Debuff Immunity",
  39: "Debuff Value Multiply",
  40: "Debuff Value Multiply Other Activate",
  501: "Challenge Match Bonus (Old)",
  502: "Challenge Match Bonus (Status)",
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
      if (
        ["effects", "abilities", "effect", "ability", "skill_effects", "skilleffects"].includes(parentKey.toLowerCase()) &&
        node.length >= 2 &&
        (typeof node[0] === "number" || /^\d+$/.test(String(node[0]))) &&
        (typeof node[1] === "number" || /^-?\d+(?:\.\d+)?$/.test(String(node[1])))
      ) {
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
      const value = node[`float_ability_value_${suffix}`] ?? node[`floatAbilityValue_${suffix}`] ?? node[`ability_value_${suffix}`] ?? node[`abilityValue_${suffix}`];
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
      if (
        [
          "effects",
          "effect",
          "abilities",
          "ability",
          "skill_effects",
          "skilleffects",
          "effect_data",
          "effectdata",
          "raw_effects",
          "raweffects",
          "condition_groups",
          "conditiongroups",
          "data",
          "skill",
          "skill_data",
          "skilldata",
          "details",
        ].includes(key.toLowerCase())
      ) {
        walk(value, depth + 1, key);
      }
    }
  };

  walk(record);
  return output.join(" · ");
}

/** Normalize GameTora's skill records for the picker and detail modal. */
export function normalizeGameToraSkillRecord(input, fallbackId = "", fallbackName = "") {
  // Some GameTora records wrap display fields in `skill` but keep SP cost,
  // duration, or master-data fields on the outer row. Merge both so metadata
  // is not silently dropped when normalizing the nested skill object.
  const record = input?.skill && typeof input.skill === "object" ? { ...input, ...input.skill } : input;
  if (!record || typeof record !== "object") return null;
  const id = String(lookupField(record, ["id", "skill_id", "skillId"]) ?? fallbackId ?? "");
  if (!/^\d{4,8}$/.test(id)) return null;
  const name =
    getString(record, ["name", "name_en", "nameEn", "en_name", "skill_name", "skill_name_en", "skillName", "display_name", "displayName", "title_en", "titleEn"]) || fallbackName || `Skill ID ${id}`;
  const description = getString(record, [
    "description_en",
    "descriptionEn",
    "skill_description_en",
    "skillDescriptionEn",
    "description",
    "desc_en",
    "descEn",
    "skill_desc",
    "skillDesc",
    "skill_description",
    "skillDescription",
    "text_en",
    "textEn",
    "in_game_description",
    "inGameDescription",
    "desc",
  ]);
  const rawType = normalizeType(lookupField(record, ["skill_type_name", "skillTypeName", "category_name", "categoryName", "skill_type", "skillType", "category", "type_name", "typeName", "type"]));
  const rarity = normalizeRarity(lookupField(record, ["rarity_name", "rarityName", "rarity_string", "rarityString", "rarity", "skill_rarity", "skillRarity"]));
  const effect = formatGameToraSkillEffect(record);
  const type = rawType || inferSkillTypeFromEffect(effect);
  const directIcon = getSourceImage(lookupField(record, ["icon_url", "iconUrl", "image_url", "imageUrl", "icon_path", "iconPath", "image_path", "imagePath", "icon", "image"]));
  const iconId = displayText(lookupField(record, ["icon_id", "iconId", "skill_icon_id", "skillIconId"]));
  const iconUrl = directIcon || (/^\d{1,8}$/.test(iconId) ? `https://media.gametora.com/umamusume/skills/icon/${iconId}.png` : "");
  const spField = findGameToraFieldDeep(record, [
    "base_sp_cost",
    "baseSpCost",
    "base_cost",
    "baseCost",
    "sp_cost",
    "spCost",
    "skill_point_cost",
    "skillPointCost",
    "skill_point_cost_base",
    "skillPointCostBase",
    "need_skill_point",
    "needSkillPoint",
    "need_skill_point_cost",
    "needSkillPointCost",
    "required_skill_points",
    "requiredSkillPoints",
    "base_skill_point_cost",
    "baseSkillPointCost",
    "skill_point_cost",
    "skillPointCost",
    "skill_point_cost_base",
    "skillPointCostBase",
    "skill_point",
    "skillPoint",
    "skill_point_value",
    "skillPointValue",
    "skill_cost",
    "skillCost",
    "cost_sp",
    "costSP",
    "sp",
    "cost",
  ]);
  const durationField = findGameToraDurationField(record);
  const witValue = lookupField(record, ["wit_check", "witCheck", "wisdom_check", "wisdomCheck", "needs_wit_check", "needsWitCheck"]);
  let witCheck = "";
  if (typeof witValue === "boolean") witCheck = witValue ? "Yes" : "No";
  else if (witValue !== undefined) {
    const normalized = displayText(witValue).toLowerCase();
    if (["yes", "true", "1", "required"].includes(normalized)) witCheck = "Yes";
    else if (["no", "false", "0", "none"].includes(normalized)) witCheck = "No";
  }
  const sourceUrl = `${GAMETORA_ORIGIN}/umamusume/skills`;
  return {
    id,
    name,
    sourceUrl,
    iconUrl,
    description,
    type,
    rarity,
    globalAvailable: globalAvailability(record, name),
    spCost: !spField || !isNonEmptyMetadata(spField.value) ? "" : displayText(spField.value),
    duration: formatBaseDuration(durationField),
    activationSummary: getConditionTexts(record),
    technicalCondition: getTechnicalConditions(record),
    effect,
    witCheck,
    sourceName: "GameTora",
  };
}

export async function getSkillIndex({ forceRefresh = false } = {}) {
  if (typeof window !== "undefined" && !forceRefresh) {
    const cached = safeReadCache(INDEX_CACHE_KEY, INDEX_TTL);
    if (Array.isArray(cached) && cached.length) return cached;
  }
  const payload = await getGameToraApi({ mode: "gametora-list" });
  const skills = Array.isArray(payload.skills) ? payload.skills : [];
  if (!skills.length) throw new Error("GameTora's skill list could not be loaded. You can still add a skill by numeric ID.");
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
    if (cached && cached.id === normalizedId && cached.sourceName === "GameTora") return cached;
  }
  const payload = await getGameToraApi({ mode: "gametora-detail", revision: "5", id: normalizedId, name: String(fallback.name || "") });
  if (!payload.detail || String(payload.detail.id) !== normalizedId) throw new Error("GameTora did not return details for this skill.");
  const detail = { ...payload.detail, name: payload.detail.name || fallback.name || `Skill ID ${normalizedId}` };
  if (typeof window !== "undefined") safeWriteCache(key, detail);
  return detail;
}

export const SKILL_REFERENCE_HOME = `${GAMETORA_ORIGIN}/umamusume/skills`;
