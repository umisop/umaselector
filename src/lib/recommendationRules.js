import { makeEmptyRecommendations, scenarioSpecificity, scenarioConditionPrecision, scenarioMatches, RECOMMENDATION_CATEGORIES } from "./scenarioEngine.js";

const CATEGORY_IDS = RECOMMENDATION_CATEGORIES.map((category) => category.id);

export function createEmptyRecommendationModel() {
  return {
    enabled: false,
    base: makeEmptyRecommendations(),
    overrides: [],
  };
}

export function normalizeRecommendationModel(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const baseSource = source.base && typeof source.base === "object" && !Array.isArray(source.base) ? source.base : {};
  return {
    enabled: source.enabled === true,
    base: Object.fromEntries(CATEGORY_IDS.map((categoryId) => [
      categoryId,
      Array.isArray(baseSource[categoryId]) ? baseSource[categoryId].map((item) => ({ ...item })) : [],
    ])),
    overrides: Array.isArray(source.overrides) ? source.overrides.filter((rule) => rule && typeof rule === "object").map((rule, index) => {
      const rawActions = rule.actions && typeof rule.actions === "object" && !Array.isArray(rule.actions) ? rule.actions : {};
      return {
        ...rule,
        id: String(rule.id || `imported-rule-${index + 1}`),
        name: String(rule.name || `Rule ${index + 1}`),
        enabled: rule.enabled !== false,
        priority: Number.isFinite(Number(rule.priority)) ? Number(rule.priority) : 0,
        conditions: rule.conditions && typeof rule.conditions === "object" && !Array.isArray(rule.conditions) ? { ...rule.conditions } : {},
        actions: Object.fromEntries(CATEGORY_IDS.map((categoryId) => {
          const action = rawActions[categoryId] && typeof rawActions[categoryId] === "object" ? rawActions[categoryId] : {};
          return [categoryId, {
            ...action,
            enabled: action.enabled === true,
            mode: action.mode === "replace" ? "replace" : "merge",
            recommendations: Array.isArray(action.recommendations) ? action.recommendations.map((item) => ({ ...item })) : [],
          }];
        })),
      };
    }) : [],
  };
}

export function createRecommendationOverride(coreCards, count = 1) {
  const id = `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    name: `Override ${count}`,
    enabled: true,
    priority: 0,
    conditions: Object.fromEntries((coreCards || []).map((card) => [card.id, "any"])),
    actions: Object.fromEntries(CATEGORY_IDS.map((categoryId) => [categoryId, {
      enabled: false,
      mode: "merge",
      recommendations: [],
    }])),
  };
}

export function recommendationModelHasContent(model) {
  if (!model || typeof model !== "object") return false;
  const baseHasItems = CATEGORY_IDS.some((categoryId) => Array.isArray(model.base?.[categoryId]) && model.base[categoryId].length > 0);
  return baseHasItems || (Array.isArray(model.overrides) && model.overrides.some((rule) => Object.values(rule?.actions || {}).some((action) => action?.enabled && Array.isArray(action.recommendations) && action.recommendations.length > 0)));
}

/**
 * Build one independent display group from Universal + a single running style.
 * Style-specific entries override duplicate Universal entries without creating a
 * combined multi-style group. Notes are preserved where both categories add context.
 */
export function combineUniversalAndStyleRecommendations(universalItems = [], styleItems = []) {
  const combined = new Map();
  for (const item of Array.isArray(universalItems) ? universalItems : []) {
    if (!item || item.cardId === undefined || item.cardId === null) continue;
    combined.set(String(item.cardId), { ...item });
  }
  for (const item of Array.isArray(styleItems) ? styleItems : []) {
    if (!item || item.cardId === undefined || item.cardId === null) continue;
    const key = String(item.cardId);
    const previous = combined.get(key);
    const notes = [...new Set([previous?.note, item.note].filter((note) => typeof note === "string" && note.trim()).map((note) => note.trim()))];
    combined.set(key, {
      ...(previous || {}),
      ...item,
      ...(notes.length ? { note: notes.join(" • ") } : {}),
    });
  }
  return [...combined.values()];
}

function applyRuleAction(currentItems, action) {
  const recommendations = Array.isArray(action?.recommendations) ? action.recommendations : [];
  if (action?.mode === "replace") {
    return recommendations.filter((item) => item?.action !== "remove").map(({ action: _action, ...item }) => ({ ...item }));
  }

  let next = [...currentItems];
  for (const item of recommendations) {
    if (!item || item.cardId === undefined || item.cardId === null) continue;
    const cardId = String(item.cardId);
    if (item.action === "remove") {
      next = next.filter((existing) => String(existing.cardId) !== cardId);
      continue;
    }
    const index = next.findIndex((existing) => String(existing.cardId) === cardId);
    const cleanItem = { ...item };
    delete cleanItem.action;
    if (index >= 0) next[index] = { ...next[index], ...cleanItem };
    else next.push(cleanItem);
  }
  return next;
}

const LEVEL_LABELS = {
  "-1": "Not owned",
  "0": "LB0",
  "1": "LB1",
  "2": "LB2",
  "3": "LB3",
  "4": "LB4",
};

function levelLabel(level) {
  return LEVEL_LABELS[String(level)] || `LB${level}`;
}

function isWisdomCard(card) {
  const type = String(card?.type || "").toLowerCase();
  return type === "wit" || type.includes("wisdom");
}

function automaticEvaluation(card, categoryId, currentLevel, viewerLevels, coreCards) {
  const nextLevel = currentLevel === -1 ? 0 : currentLevel + 1;
  const result = (tone, title, message, recommendationStatus = tone === "positive" ? "recommended" : "alternative") => ({
    tone,
    title,
    message,
    recommendationStatus,
    currentLevel,
    resultingLevel: nextLevel,
  });
  const otherCoreCardsAtMax = (coreCards || []).filter((core) => String(core.id) !== String(card.id)).every((core) => Number(viewerLevels?.[core.id]) === 4);

  // These breakpoints are based on the creator's explicitly provided Grandmaster strategy.
  switch (String(card?.id || "")) {
    case "kitasan-black":
      if (currentLevel < 2) {
        return result("warning", "Below the LB3 target", `This exchange would bring Kitasan Black to ${levelLabel(nextLevel)}, still below your preferred LB3 breakpoint. Consider how much you need this upgrade for the selected running style before spending an exchange.`);
      }
      if (currentLevel === 2) {
        return result("positive", "Good upgrade", "This exchange reaches LB3, your stated strong target for Kitasan Black.");
      }
      if (currentLevel === 3) {
        return result("info", "Already at target LB3", "This exchange would reach LB4. LB3 is already your stated strong breakpoint, so compare the extra copy with other targets.");
      }
      break;
    case "super-creek":
      if (currentLevel === -1) {
        return result("info", "Adds a usable card", "Super Creek is already usable at LB0 according to your rule. This exchange would add it at LB0; it does not reach the LB3 initial-gauge improvement.", "recommended");
      }
      if (currentLevel < 2) {
        return result("info", "Already usable below LB3", `This exchange would bring Super Creek to ${levelLabel(nextLevel)}. LB0 is already usable; LB3 is the breakpoint you identified for improved initial gauge.`);
      }
      if (currentLevel === 2) {
        return result("positive", "Initial-gauge upgrade", "This exchange reaches LB3, the level you identified for improved initial gauge.");
      }
      if (currentLevel === 3) {
        return result("info", "Compare the next upgrade", "Super Creek already has the LB3 initial-gauge breakpoint. This exchange reaches LB4; weigh it against other targets.");
      }
      break;
    case "fine-motion":
      if (currentLevel < 2) {
        if (otherCoreCardsAtMax) {
          return result("warning", "Potentially low-value Wisdom exchange", `The other five Core Cards are already LB4, while this exchange would bring Fine Motion only to ${levelLabel(nextLevel)}, below the preferred LB3 breakpoint. Fine Motion can still be used, but compare this with other targets. If your next scenario follows the one-Wisdom setup you described for Medium/Mile with Ramonu filling the slot, a stronger Wisdom card may take priority.`);
        }
        if (currentLevel === -1) {
          return result("warning", "Does not reach the usable LB1 level", "This exchange adds Fine Motion at LB0. You said LB1 is usable and LB3/LB4 are stronger, so this is still below the first usable breakpoint.");
        }
        return result("warning", "Below the preferred LB3 target", `This exchange would bring Fine Motion to ${levelLabel(nextLevel)}. LB1 is usable, but LB3/LB4 are stronger; this exchange does not reach LB3.`);
      }
      if (currentLevel === 2) {
        return result("positive", "Good upgrade", "This exchange takes Fine Motion from LB2 to LB3, the stronger breakpoint you identified.");
      }
      if (currentLevel === 3) {
        return result("warning", "Check the marginal Wisdom upgrade", "Fine Motion is already in its stronger LB3 range; this exchange would reach LB4. Compare the marginal value with other exchange targets before spending the exchange.");
      }
      break;
    case "agnes-tachyon":
      if (categoryId === "pc") {
        if (currentLevel < 2) {
          return result("warning", "Still below the required LB3 target", `This exchange would bring Agnes Tachyon to ${levelLabel(nextLevel)}, which remains below your LB3 requirement for Pace Chaser. Consider whether you can complete the path to LB3 before prioritizing it.`);
        }
        if (currentLevel === 2) {
          return result("positive", "Reaches the required LB3", "This exchange brings Agnes Tachyon from LB2 to LB3, your required Pace Chaser target.");
        }
        if (currentLevel === 3) {
          return result("info", "LB3 requirement already met", "Agnes Tachyon already meets your stated Pace Chaser target at LB3. This exchange would reach LB4; no additional LB4 requirement has been specified.");
        }
      }
      break;
    case "maruzensky":
      // Maruzensky's LB breakpoints remain useful whenever the card is shown,
      // including when it enters a selected style's group through Universal.
      if (currentLevel === -1) {
        return result("warning", "Not usable yet after one exchange", "One exchange would bring Maruzensky to LB0. LB1 is usable for Front Runner, while LB3 is the strong target.");
      }
      if (currentLevel === 0) {
        return result("positive", "Reaches usable LB1", "This exchange brings Maruzensky to LB1, which is usable for Front Runner. LB3 remains the stronger target.");
      }
      if (currentLevel === 1) {
        return result("warning", "Low-value LB1 → LB2 upgrade", "You specified that Maruzensky's LB1 to LB2 performance increase is poor. Consider saving this exchange toward LB3 or another target.");
      }
      if (currentLevel === 2) {
        return result("positive", "Reaches the strong LB3 target", "This exchange brings Maruzensky to LB3, a very valuable breakpoint in your strategy. This is a strong upgrade, not merely a generic Core Card exchange.");
      }
      if (currentLevel === 3) {
        return result("warning", "Small LB3 → LB4 improvement", "You specified that Maruzensky's LB3 to LB4 improvement is not significant. Compare other exchange targets first.");
      }
      break;
    case "mr-cb":
      if (categoryId === "ec") {
        if (currentLevel === -1) {
          return result("warning", "Not usable yet after one exchange", "One exchange would bring Wit CB to LB0. Your stated usable threshold for End Closer is LB1, so another copy would still be needed.");
        }
        if (currentLevel === 0) {
          return result("positive", "Reaches usable LB1", "This exchange brings Wit CB to LB1, which is already usable for End Closer. LB3 is a good target, not a requirement; evaluate later upgrades separately rather than treating LB1 as unusable.");
        }
        if (currentLevel === 1) {
          return result("warning", "Low-value LB1 → LB2 upgrade", "Using your Maruzensky-like breakpoint rule, Wit CB's LB1 to LB2 step is not a strong upgrade. Consider saving this exchange toward LB3 or another target.");
        }
        if (currentLevel === 2) {
          return result("positive", "Reaches good LB3 level", "This exchange brings Wit CB to LB3, which you identified as a good level for End Closer. LB3 is a good target, not a hard requirement.");
        }
        if (currentLevel === 3) {
          return result("warning", "Small LB3 → LB4 improvement", "Using your Maruzensky-like breakpoint rule, Wit CB's LB3 to LB4 improvement is not significant. Compare other exchange targets first.");
        }
      }
      break;
    default:
      break;
  }

  if (isWisdomCard(card)) {
    return result("warning", "Wisdom Core Card check", `This exchange would bring ${card.name} from ${levelLabel(currentLevel)} to ${levelLabel(nextLevel)}. The card-specific breakpoint guidance is tied to its intended running style, so confirm that this category is appropriate and compare the value with other exchange options.`);
  }

  if (coreCards.some((core) => String(core.id) === String(card?.id))) {
    return result("info", "Core Card exchange", `This exchange would bring ${card.name} from ${levelLabel(currentLevel)} to ${levelLabel(nextLevel)}. No automatic breakpoint rule has been defined for this card in this category yet.`);
  }

  return null;
}

/**
 * Automatically evaluates the merged recommendation list against the viewer's six Core Cards.
 * Only known card breakpoints are scored; inventory for non-Core catalog cards is not guessed.
 */
export function evaluateRecommendationItems(items, categoryId, viewerLevels, coreCards, allCards) {
  const cardMap = new Map((Array.isArray(allCards) ? allCards : []).map((card) => [String(card.id), card]));
  const coreIds = new Set((coreCards || []).map((card) => String(card.id)));
  const result = [];
  const summary = { evaluatedCoreCards: 0, wisdomWarnings: 0, positiveBreakpoints: 0, skippedMaxedCoreCards: [] };

  for (const [originalIndex, rawItem] of (Array.isArray(items) ? items : []).entries()) {
    if (!rawItem || rawItem.cardId === undefined || rawItem.cardId === null) continue;
    const cardId = String(rawItem.cardId);
    const card = cardMap.get(cardId);
    if (!card) continue;

    const isCoreTarget = coreIds.has(cardId);
    const currentLevel = isCoreTarget ? Number(viewerLevels?.[cardId]) : null;

    // A Core Card already at LB4 cannot be improved by exchanging one more copy.
    if (isCoreTarget && currentLevel === 4) {
      summary.skippedMaxedCoreCards.push({ cardId, cardName: card.name, categoryId });
      continue;
    }

    let evaluation = null;
    if (isCoreTarget && Number.isInteger(currentLevel) && currentLevel >= -1 && currentLevel <= 3) {
      evaluation = automaticEvaluation(card, categoryId, currentLevel, viewerLevels, coreCards);
      summary.evaluatedCoreCards += 1;
    } else if (isWisdomCard(card)) {
      evaluation = {
        tone: "warning",
        title: "Wisdom exchange check",
        message: "This is a Wisdom-card exchange. The current inventory selector tracks only six Core Cards, so this card's current LB and resulting level are unknown. Check its upgrade breakpoint and whether it will be used in your deck.",
      };
    }

    if (isWisdomCard(card) && evaluation?.tone === "warning") summary.wisdomWarnings += 1;
    if (evaluation?.tone === "positive") summary.positiveBreakpoints += 1;
    // Automatically move positively evaluated core breakpoints ahead of unassessed candidates,
    // and keep cautionary exchanges below them without changing relative order inside each group.
    const evaluatedStatus = isCoreTarget && evaluation
      ? (evaluation.recommendationStatus || (evaluation.tone === "positive" ? "recommended" : "alternative"))
      : (rawItem.status === "alternative" ? "alternative" : "recommended");
    const evaluationRank = evaluation?.tone === "positive" ? 3 : evaluation?.tone === "info" ? 2 : evaluation?.tone === "warning" ? 1 : 2;
    const statusRank = evaluatedStatus === "alternative" ? 0 : 1;
    result.push({ ...rawItem, status: evaluatedStatus, ...(evaluation ? { automaticEvaluation: evaluation } : {}), _automaticRank: statusRank * 10 + evaluationRank, _automaticOriginalIndex: originalIndex });
  }

  result.sort((a, b) => b._automaticRank - a._automaticRank || a._automaticOriginalIndex - b._automaticOriginalIndex);
  return {
    items: result.map(({ _automaticRank, _automaticOriginalIndex, ...item }) => item),
    summary,
  };
}

/** Evaluate the base list plus all matching overrides, then run automatic card-value checks. */
export function buildRuleBasedRecommendations(config, viewerLevels, coreCards, options = {}) {
  const model = normalizeRecommendationModel(config?.recommendationModel);
  if (!model.enabled) return null;

  const recommendations = Object.fromEntries(CATEGORY_IDS.map((categoryId) => [
    categoryId,
    [...(model.base[categoryId] || [])].map((item) => ({ ...item })),
  ]));

  const matchingRules = model.overrides
    .map((rule, index) => ({ rule, index, specificity: scenarioSpecificity(rule, coreCards), precision: scenarioConditionPrecision(rule, coreCards) }))
    .filter(({ rule }) => scenarioMatches(rule, viewerLevels, coreCards))
    // Apply broad rules first so more specific rules can override them.
    .sort((a, b) => a.specificity - b.specificity
      || a.precision - b.precision
      || Number(a.rule.priority || 0) - Number(b.rule.priority || 0)
      // For tied rules, apply the later list entry first so the earlier one wins,
      // matching the legacy scenario engine's tie-break behavior.
      || b.index - a.index);

  for (const { rule } of matchingRules) {
    for (const categoryId of CATEGORY_IDS) {
      const action = rule.actions?.[categoryId];
      if (!action?.enabled) continue;
      recommendations[categoryId] = applyRuleAction(recommendations[categoryId], action);
    }
  }

  const hasCandidateRecommendations = CATEGORY_IDS.some((categoryId) => recommendations[categoryId].length > 0);
  if (!hasCandidateRecommendations) return null;

  const activeCategories = Array.isArray(options.activeCategories)
    ? new Set(options.activeCategories.filter((categoryId) => CATEGORY_IDS.includes(categoryId)))
    : new Set(CATEGORY_IDS);
  const evaluated = Object.fromEntries(CATEGORY_IDS.map((categoryId) => [categoryId,
    activeCategories.has(categoryId)
      ? evaluateRecommendationItems(recommendations[categoryId], categoryId, viewerLevels, coreCards, config?.cards)
      : { items: recommendations[categoryId], summary: { evaluatedCoreCards: 0, wisdomWarnings: 0, positiveBreakpoints: 0, skippedMaxedCoreCards: [] } },
  ]));
  const finalRecommendations = Object.fromEntries(CATEGORY_IDS.map((categoryId) => [categoryId, evaluated[categoryId].items]));
  const evaluationSummary = CATEGORY_IDS.reduce((summary, categoryId) => {
    const current = evaluated[categoryId].summary;
    summary.evaluatedCoreCards += current.evaluatedCoreCards;
    summary.wisdomWarnings += current.wisdomWarnings;
    summary.positiveBreakpoints += current.positiveBreakpoints;
    summary.skippedMaxedCoreCards.push(...current.skippedMaxedCoreCards);
    return summary;
  }, { evaluatedCoreCards: 0, wisdomWarnings: 0, positiveBreakpoints: 0, skippedMaxedCoreCards: [] });

  return {
    id: "rule-based-recommendations",
    name: "Base recommendations + matching overrides",
    enabled: true,
    priority: 0,
    isRuleEngineResult: true,
    matchedRules: matchingRules.map(({ rule, specificity }) => ({ id: rule.id, name: rule.name, priority: rule.priority, specificity })),
    evaluationSummary,
    recommendations: finalRecommendations,
  };
}
