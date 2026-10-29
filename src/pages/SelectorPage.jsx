import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Check, CheckCircle2, CircleHelp, GitCompare, Info, ListChecks, Minus, Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import CardImage from "../components/CardImage";
import RunningStyleLogo from "../components/RunningStyleLogo";
import CommunitySection from "../components/CommunitySection";
import Footer from "../components/Footer";
import SkillDetailModal from "../components/SkillDetailModal";
import CompareCardsModal from "../components/CompareCardsModal";
import { readSitePreferences, subscribeSitePreferences } from "../lib/sitePreferences";
import { findMatchingScenario, getScenarioRecommendations, LEVEL_OPTIONS, RECOMMENDATION_CATEGORIES, RUNNING_STYLES } from "../lib/scenarioEngine";
import {
  buildRuleBasedRecommendations,
  combineUniversalAndStyleRecommendations,
  evaluateMinimumUsableBreakpoint,
  evaluateRecommendationItems,
  isWisdomCard,
  orderRecommendationsByStatus,
} from "../lib/recommendationRules";
import {
  applyRedeemsToLevel,
  DEFAULT_TICKET_COUNTS,
  findCompatibleTicketPool,
  getMaxRedeemsFromLevel,
  getMinimumProjectedLevel,
  getNextLevel,
  getPlannedTicketCounts,
  getRedeemsForCard,
  getStartingLevelForProjectedLevel,
  isCardAvailableInPool,
  normalizeStartingLevel,
  SELECTOR_POOLS,
} from "../lib/redeemPlanner";

const CORE_ORDER = ["kitasan-black", "super-creek", "fine-motion", "agnes-tachyon", "maruzensky", "mr-cb"];

// Replace this ID with your own YouTube video ID when your video is ready.
const FEATURED_VIDEO_ID = "kBsB3_luYHk";
const FEATURED_VIDEO_START_SECONDS = 10;

function sortCoreCards(cards) {
  const order = new Map(CORE_ORDER.map((id, index) => [id, index]));
  return [...cards].sort((a, b) => (order.get(a.id) ?? 100) - (order.get(b.id) ?? 100));
}

function RecommendationPanel({ category, items, cardMap, skillOverrides = {} }) {
  const [activeSkill, setActiveSkill] = useState(null);
  const closeSkillModal = useCallback(() => setActiveSkill(null), []);
  // Keep the creator's order within each status group, but always show
  // Recommended entries before Alternatives in the public result list.
  const orderedItems = orderRecommendationsByStatus(items);
  return (
    <section className="result-category" key={category.id}>
      <div className="result-category-heading">
        <div className="result-category-symbol">
          {(category.styleId || category.id) === "universal" ? <Sparkles size={18} /> : <RunningStyleLogo styleId={category.styleId || category.id} className="result-category-style-logo" />}
        </div>
        <div>
          <h3>{category.label}</h3>
          <p>{category.description}</p>
        </div>
      </div>
      {items.length === 0 ? (
        <div className="category-unconfigured">
          <CircleHelp size={16} />
          <span>The creator has not added recommendations for this category, or no configured Core Card target is available at the selected levels.</span>
        </div>
      ) : (
        <div className="recommendation-cards">
          {orderedItems.map((item, index) => {
            const card = cardMap.get(String(item.cardId));
            if (!card) return null;
            const status = item.status === "alternative" ? "alternative" : "recommended";
            const evaluation = item.automaticEvaluation;
            const EvaluationIcon = evaluation?.tone === "positive" ? CheckCircle2 : evaluation?.tone === "warning" ? AlertTriangle : Info;
            return (
              <article className={`recommendation-card recommendation-${status}`} key={`${category.id}-${item.cardId}-${index}`}>
                <CardImage card={card} className="recommendation-card-image" />
                <div className="recommendation-card-detail">
                  <div className="recommendation-title-row">
                    <h4>{card.name}</h4>
                    <span className={`recommendation-status ${status}`}>{status === "recommended" ? "Recommended" : "Alternative"}</span>
                  </div>
                  <p className="recommendation-card-type">
                    {card.type || "Support Card"}
                    {item.minUsableLb !== null &&
                      item.minUsableLb !== undefined &&
                      item.minUsableLb !== "" &&
                      Number.isInteger(Number(item.minUsableLb)) &&
                      Number(item.minUsableLb) >= 0 &&
                      Number(item.minUsableLb) <= 4 && (
                        <>
                          {" "}
                          <span className="recommendation-meta-separator">·</span> Minimum usable <strong className="recommendation-usable-lb">LB{Number(item.minUsableLb)}</strong>
                        </>
                      )}
                  </p>
                  {Array.isArray(item.skills) && item.skills.length > 0 && (
                    <div className="recommendation-skills" aria-label={`Skills for ${card.name}`}>
                      <span>Skill{item.skills.length > 1 ? "s" : ""}: </span>
                      {item.skills.map((skill, skillIndex) => {
                        const skillId = String(skill?.id || "");
                        const skillName = String(skill?.name || `Skill ${skillId}`);
                        return (
                          <span className="recommendation-skill-entry" key={`${skillId}-${skillIndex}`}>
                            {skillIndex > 0 && <span className="recommendation-skill-separator">, </span>}
                            <button type="button" className="recommendation-skill-link" onClick={() => setActiveSkill({ id: skillId, name: skillName })}>
                              {skillName}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {item.note && <p className="recommendation-note">{item.note}</p>}
                  {evaluation && (
                    <div className={`recommendation-evaluation tone-${evaluation.tone}`}>
                      <strong>
                        <EvaluationIcon size={13} /> {evaluation.title}
                      </strong>
                      <p>{evaluation.message}</p>
                    </div>
                  )}
                </div>
                <span className="recommendation-number">{String(index + 1).padStart(2, "0")}</span>
              </article>
            );
          })}
        </div>
      )}
      {activeSkill && (
        <SkillDetailModal skillId={activeSkill.id} fallbackName={activeSkill.name} activationExplanation={skillOverrides?.[activeSkill.id]?.activationExplanation} onClose={closeSkillModal} />
      )}
    </section>
  );
}

function lbLabel(level) {
  if (level === null || level === undefined) return "Set current LB";
  if (level === -1) return "Not owned";
  return `LB${level}`;
}

function RedeemPlanner({
  ticketCounts,
  plannedCounts,
  remainingCounts,
  totalRemaining,
  planRows,
  candidates,
  onTicketCountChange,
  onRedeem,
  onRemoveExchange,
  onCandidateLevelChange,
  skillOverrides = {},
}) {
  const [activeSkill, setActiveSkill] = useState(null);
  const closeSkillModal = useCallback(() => setActiveSkill(null), []);

  return (
    <section className="redeem-planner" aria-label="Interactive redeem planner">
      <div className="redeem-planner-heading">
        <div>
          <span className="section-kicker">YOUR SELECTOR EXCHANGE PLAN</span>
          <h3>Redeem Planner</h3>
          <p>Choose the cards you want to exchange for.</p>
        </div>
        <div className="redeem-remaining" aria-live="polite">
          <strong>{totalRemaining}</strong>
          <span>tickets remaining</span>
        </div>
      </div>

      <div className="redeem-ticket-pools">
        {SELECTOR_POOLS.map((pool) => (
          <div className="redeem-pool-row" key={pool.id}>
            <div className="redeem-pool-copy">
              <strong>{pool.label}</strong>
              <span>Up to {pool.maxCardName}</span>
              <small>
                {remainingCounts[pool.id]} available · {plannedCounts[pool.id]} assigned
              </small>
            </div>
            <div className="redeem-pool-counter" aria-label={`${pool.label} quantity`}>
              <button type="button" onClick={() => onTicketCountChange(pool.id, -1)} disabled={ticketCounts[pool.id] <= plannedCounts[pool.id]} aria-label={`Remove one ${pool.label} ticket`}>
                <Minus size={14} />
              </button>
              <strong>{ticketCounts[pool.id]}</strong>
              <button type="button" onClick={() => onTicketCountChange(pool.id, 1)} disabled={ticketCounts[pool.id] >= pool.maxTickets} aria-label={`Add one ${pool.label} ticket`}>
                <Plus size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="redeem-section-heading">
        <div>
          <span className="section-kicker">SELECT A TARGET</span>
          <h4>Recommended exchanges</h4>
        </div>
        <span className="redeem-section-count">{candidates.length} candidates</span>
      </div>

      {candidates.length === 0 ? (
        <p className="redeem-empty">No eligible recommendations are available for this Core Card setup.</p>
      ) : (
        <div className="redeem-candidate-list">
          {candidates.map((candidate) => {
            const { card, item, currentLevel, nextLevel, isCore, levelKnown, compatiblePool, redeemedCount } = candidate;
            // The evaluator belongs to the recommendation item; it is not a top-level candidate field.
            // Read it from item so the live breakpoint note stays visible after each simulated redeem.
            const automaticEvaluation = item?.automaticEvaluation || candidate.automaticEvaluation || null;
            const EvaluationIcon = automaticEvaluation?.tone === "positive" ? CheckCircle2 : automaticEvaluation?.tone === "warning" ? AlertTriangle : Info;
            const minUsableLb = Number(item?.minUsableLb);
            const hasMinUsableLb = item?.minUsableLb !== null && item?.minUsableLb !== undefined && item?.minUsableLb !== "" && Number.isInteger(minUsableLb) && minUsableLb >= 0 && minUsableLb <= 4;
            const skills = Array.isArray(item?.skills) ? item.skills : [];
            const disabledReason = !levelKnown
              ? "Choose this card's current LB first."
              : currentLevel >= 4
                ? "Already at MLB."
                : !compatiblePool
                  ? "No unused compatible ticket remains. Add a ticket or remove a planned exchange."
                  : "";
            return (
              <article className="redeem-candidate-row" key={card.id}>
                <CardImage card={card} className="redeem-candidate-image" />
                <div className="redeem-candidate-content">
                  <div className="redeem-candidate-title-row">
                    <h5>{card.name}</h5>
                    <span className={`recommendation-status ${item.status === "alternative" ? "alternative" : "recommended"}`}>{item.status === "alternative" ? "Alternative" : "Recommended"}</span>
                  </div>
                  <div className="redeem-candidate-meta">
                    {card.type || "Support Card"} <span>·</span> {lbLabel(currentLevel)}
                    {nextLevel !== null && nextLevel !== undefined && (
                      <>
                        <ArrowRight size={12} /> {lbLabel(nextLevel)}
                      </>
                    )}
                    {hasMinUsableLb && (
                      <>
                        <span>·</span>
                        <span>
                          Minimum usable <strong className="recommendation-usable-lb">LB{minUsableLb}</strong>
                        </span>
                      </>
                    )}
                    {redeemedCount > 0 && <span className="redeem-count-note">{redeemedCount} planned</span>}
                  </div>
                  {skills.length > 0 && (
                    <div className="recommendation-skills redeem-candidate-skills" aria-label={`Skills for ${card.name}`}>
                      <span>Skill{skills.length > 1 ? "s" : ""}: </span>
                      {skills.map((skill, skillIndex) => {
                        const skillId = String(skill?.id || "");
                        const skillName = String(skill?.name || `Skill ${skillId}`);
                        return (
                          <span className="recommendation-skill-entry" key={`${skillId}-${skillIndex}`}>
                            {skillIndex > 0 && <span className="recommendation-skill-separator">, </span>}
                            <button type="button" className="recommendation-skill-link" onClick={() => setActiveSkill({ id: skillId, name: skillName })}>
                              {skillName}
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {item?.note && item.note.trim() && item.note.trim() !== automaticEvaluation?.message?.trim() && <p className="redeem-candidate-rule-note">{item.note}</p>}
                  {!isCore && (
                    <label className="redeem-current-level">
                      <span>Current level</span>
                      <select value={candidate.currentLevel ?? ""} onChange={(event) => onCandidateLevelChange(card.id, event.target.value)} aria-label={`Current level for ${card.name}`}>
                        <option value="">Choose current level</option>
                        {getMinimumProjectedLevel(candidate.redeemedCount) === -1 && <option value="-1">Not owned</option>}
                        {[0, 1, 2, 3, 4]
                          .filter((level) => level >= getMinimumProjectedLevel(candidate.redeemedCount))
                          .map((level) => (
                            <option key={level} value={level}>
                              LB{level}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {automaticEvaluation?.message && (
                    <div className={`redeem-breakpoint-note ${automaticEvaluation.tone ? `tone-${automaticEvaluation.tone}` : ""}`}>
                      <strong>
                        <EvaluationIcon size={13} /> {automaticEvaluation.title || "Breakpoint evaluation"}
                      </strong>
                      <p>{automaticEvaluation.message}</p>
                    </div>
                  )}
                  {!automaticEvaluation?.message && !item?.note && !hasMinUsableLb && skills.length === 0 && (
                    <p className="redeem-candidate-rule-note">No additional breakpoint note is configured for this target.</p>
                  )}
                  {!levelKnown && <p className="redeem-unavailable-hint">Choose the current LB to calculate a safe exchange limit.</p>}
                  {levelKnown && currentLevel < 4 && !compatiblePool && <p className="redeem-unavailable-hint">No unused compatible ticket remains. Add a ticket or remove a planned exchange.</p>}
                </div>
                <button
                  type="button"
                  className="redeem-action-button"
                  onClick={() => onRedeem(candidate)}
                  disabled={!levelKnown || currentLevel >= 4 || !compatiblePool}
                  title={disabledReason || `Use one ${compatiblePool?.label} ticket`}
                >
                  <Plus size={15} /> Redeem
                </button>
              </article>
            );
          })}
        </div>
      )}

      <div className="redeem-plan-entries">
        <div className="redeem-section-heading">
          <div>
            <span className="section-kicker">LOCKED-IN EXCHANGES</span>
            <h4>Your exchange plan</h4>
          </div>
          <span className="redeem-section-count">{planRows.length} assigned</span>
        </div>
        {planRows.length === 0 ? (
          <p className="redeem-empty">No tickets assigned yet.</p>
        ) : (
          <ol className="redeem-plan-list">
            {planRows.map((entry, index) => (
              <li className="redeem-plan-entry" key={entry.id}>
                <span className="redeem-plan-index">{String(index + 1).padStart(2, "0")}</span>
                <div className="redeem-plan-entry-copy">
                  <strong>{entry.card?.name || entry.cardId}</strong>
                  <span>
                    {entry.poolLabel} · {lbLabel(entry.currentLevel)} <ArrowRight size={12} /> {lbLabel(entry.nextLevel)}
                  </span>
                </div>
                <button type="button" className="redeem-remove-button" onClick={() => onRemoveExchange(entry.id)} aria-label={`Remove ${entry.card?.name || entry.cardId} exchange`}>
                  <Trash2 size={14} /> Remove
                </button>
              </li>
            ))}
          </ol>
        )}
      </div>
      {activeSkill && (
        <SkillDetailModal skillId={activeSkill.id} fallbackName={activeSkill.name} activationExplanation={skillOverrides?.[activeSkill.id]?.activationExplanation} onClose={closeSkillModal} />
      )}
    </section>
  );
}

export default function SelectorPage({ config, loading }) {
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [sitePreferences, setSitePreferences] = useState(() => readSitePreferences());
  useEffect(() => subscribeSitePreferences(setSitePreferences), []);
  const [levels, setLevels] = useState({});
  const [ticketCounts, setTicketCounts] = useState({ ...DEFAULT_TICKET_COUNTS });
  const [redeemPlan, setRedeemPlan] = useState([]);
  const [candidateLevels, setCandidateLevels] = useState({});
  const cards = Array.isArray(config?.cards) ? config.cards : [];
  const coreCards = useMemo(() => sortCoreCards(cards.filter((card) => card.isCore)), [cards]);
  const cardMap = useMemo(() => new Map(cards.map((card) => [String(card.id), card])), [cards]);
  const allCoreFilled = coreCards.length > 0 && coreCards.every((card) => levels[card.id] !== undefined && levels[card.id] !== null);
  const plannedTicketCounts = useMemo(() => getPlannedTicketCounts(redeemPlan), [redeemPlan]);
  const remainingTicketCounts = useMemo(
    () => Object.fromEntries(SELECTOR_POOLS.map((pool) => [pool.id, Math.max(0, Number(ticketCounts[pool.id] || 0) - plannedTicketCounts[pool.id])])),
    [ticketCounts, plannedTicketCounts],
  );
  const totalTicketsRemaining = useMemo(() => Object.values(remainingTicketCounts).reduce((sum, count) => sum + count, 0), [remainingTicketCounts]);
  const planningLevels = useMemo(() => {
    const next = { ...levels };
    for (const card of coreCards) {
      if (levels[card.id] === undefined || levels[card.id] === null) continue;
      next[card.id] = applyRedeemsToLevel(Number(levels[card.id]), getRedeemsForCard(redeemPlan, card.id).length);
    }
    return next;
  }, [levels, coreCards, redeemPlan]);
  const legacyMatchedScenario = useMemo(() => (allCoreFilled ? findMatchingScenario(config?.scenarios, levels, coreCards) : null), [allCoreFilled, config?.scenarios, levels, coreCards]);
  const planningMatchedScenario = useMemo(
    () => (allCoreFilled ? findMatchingScenario(config?.scenarios, planningLevels, coreCards) : null),
    [allCoreFilled, config?.scenarios, planningLevels, coreCards],
  );
  const ruleEngineEnabled = config?.recommendationModel?.enabled === true;
  const ruleBasedResult = useMemo(
    () => (allCoreFilled && ruleEngineEnabled ? buildRuleBasedRecommendations(config, planningLevels, coreCards, { activeCategories: ["universal", ...selectedStyles] }) : null),
    [allCoreFilled, ruleEngineEnabled, config, planningLevels, coreCards, selectedStyles],
  );
  const evaluatedLegacyScenario = useMemo(() => {
    if (!planningMatchedScenario || ruleEngineEnabled) return planningMatchedScenario;
    const evaluatedRecommendations = Object.fromEntries(
      RECOMMENDATION_CATEGORIES.map((category) => [
        category.id,
        evaluateRecommendationItems(getScenarioRecommendations(planningMatchedScenario, category.id), category.id, planningLevels, coreCards, cards).items,
      ]),
    );
    return { ...planningMatchedScenario, recommendations: evaluatedRecommendations };
  }, [planningMatchedScenario, ruleEngineEnabled, planningLevels, coreCards, cards]);
  const matchedScenario = ruleEngineEnabled ? ruleBasedResult : evaluatedLegacyScenario;

  const recommendationGroups = useMemo(() => {
    if (!matchedScenario) return [];
    const universal = RECOMMENDATION_CATEGORIES[0];
    const universalItems = getScenarioRecommendations(matchedScenario, universal.id);
    const selectedStyleDefinitions = RUNNING_STYLES.filter((style) => selectedStyles.includes(style.id));
    if (!selectedStyleDefinitions.length) {
      return [
        {
          id: universal.id,
          label: universal.label,
          description: universal.description,
          items: universalItems,
        },
      ];
    }
    return selectedStyleDefinitions.map((style) => {
      const styleItems = getScenarioRecommendations(matchedScenario, style.id);

      const mergedItems = combineUniversalAndStyleRecommendations(universalItems, styleItems);

      return {
        id: `${style.id}-with-universal`,
        styleId: style.id,
        label: style.label,
        description: `Recommendations for ${style.label}.`,
        items: mergedItems,
      };
    });
  }, [matchedScenario, selectedStyles]);

  const plannerCandidates = useMemo(() => {
    if (!matchedScenario) return [];
    const byCardId = new Map();
    for (const group of recommendationGroups) {
      const categoryId = group.styleId || "universal";
      for (const item of orderRecommendationsByStatus(group.items || [])) {
        const card = cardMap.get(String(item.cardId));
        if (!card) continue;
        const cardId = String(card.id);
        const hasSelectedEligiblePool = SELECTOR_POOLS.some((pool) => Number(ticketCounts[pool.id] || 0) > 0 && isCardAvailableInPool(card, pool.id));
        if (!hasSelectedEligiblePool) continue;
        const isCore = coreCards.some((core) => String(core.id) === cardId);
        const startingLevel = isCore ? normalizeStartingLevel(levels[cardId]) : normalizeStartingLevel(candidateLevels[cardId]);
        const redeemCount = getRedeemsForCard(redeemPlan, cardId).length;
        const currentLevel = startingLevel === null ? null : applyRedeemsToLevel(startingLevel, redeemCount);
        if (currentLevel === 4) continue;
        const reevaluated = evaluateRecommendationItems([item], categoryId, planningLevels, coreCards, cards).items[0];
        if (!reevaluated) continue;
        const coreOrWisdomEvaluation = reevaluated.automaticEvaluation || item.automaticEvaluation || null;
        const usableBreakpointEvaluation = !isCore && !isWisdomCard(card) ? evaluateMinimumUsableBreakpoint(card, currentLevel, reevaluated.minUsableLb ?? item.minUsableLb) : null;
        // For ordinary non-Core cards, the admin-defined Minimum usable LB is the live source of truth.
        // Core Cards keep their specialized rules, and Wit cards keep the existing Wit-specific caution.
        const automaticEvaluation = usableBreakpointEvaluation || coreOrWisdomEvaluation;
        const liveItem = {
          ...reevaluated,
          ...(usableBreakpointEvaluation ? { status: usableBreakpointEvaluation.recommendationStatus } : {}),
          automaticEvaluation,
        };
        const candidate = {
          card,
          item: liveItem,
          categoryId,
          isCore,
          startingLevel,
          levelKnown: startingLevel !== null,
          currentLevel,
          nextLevel: getNextLevel(currentLevel),
          redeemCount,
          compatiblePool: findCompatibleTicketPool(card, ticketCounts, redeemPlan),
        };
        const previous = byCardId.get(cardId);
        const score = (entry) => (entry.item.status === "alternative" ? 0 : 10) + (entry.item.automaticEvaluation?.tone === "positive" ? 5 : 0);
        if (!previous || score(candidate) > score(previous)) byCardId.set(cardId, candidate);
      }
    }
    return [...byCardId.values()].sort((a, b) => {
      const aRank = (a.item.status === "alternative" ? 0 : 10) + (a.item.automaticEvaluation?.tone === "positive" ? 5 : 0);
      const bRank = (b.item.status === "alternative" ? 0 : 10) + (b.item.automaticEvaluation?.tone === "positive" ? 5 : 0);
      return bRank - aRank;
    });
  }, [matchedScenario, recommendationGroups, cardMap, coreCards, levels, candidateLevels, redeemPlan, planningLevels, cards, ticketCounts]);

  const planRows = useMemo(() => {
    const cursor = {};
    for (const card of cards) {
      const id = String(card.id);
      const isCore = coreCards.some((core) => String(core.id) === id);
      cursor[id] = isCore ? normalizeStartingLevel(levels[id]) : normalizeStartingLevel(candidateLevels[id]);
    }
    return redeemPlan.map((entry, index) => {
      const id = String(entry.cardId);
      const currentLevel = normalizeStartingLevel(cursor[id]);
      const nextLevel = getNextLevel(currentLevel);
      if (nextLevel !== null) cursor[id] = nextLevel;
      const pool = SELECTOR_POOLS.find((item) => item.id === entry.poolId);
      return { ...entry, index, card: cardMap.get(id), currentLevel, nextLevel, poolLabel: pool?.label || "Selector ticket" };
    });
  }, [redeemPlan, cards, coreCards, levels, candidateLevels, cardMap]);

  const compareInitialSlots = useMemo(() => {
    const candidates = [];
    let sourceOrder = 0;
    recommendationGroups.forEach((group) => {
      (group.items || []).forEach((item) => {
        const card = cardMap.get(String(item.cardId));
        if (card) candidates.push({ card, item, sourceOrder: sourceOrder++ });
      });
    });
    candidates.sort((a, b) => {
      const rank = (entry) => (entry.item.status === "alternative" ? 1 : 0);
      return rank(a) - rank(b) || a.sourceOrder - b.sourceOrder;
    });
    const seen = new Set();
    return candidates
      .filter(({ card }) => {
        const id = String(card.gameCardId || card.id || "");
        if (!/^\d{4,8}$/.test(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .slice(0, 6)
      .map(({ card, item }) => {
        const hasUsableLb = item.minUsableLb !== null && item.minUsableLb !== undefined && item.minUsableLb !== "";
        const rawLb = hasUsableLb ? Number(item.minUsableLb) : NaN;
        const lb = Number.isInteger(rawLb) && rawLb >= 0 && rawLb <= 4 ? rawLb : 4;
        return { id: String(card.gameCardId || card.id), lb };
      });
  }, [recommendationGroups, cardMap]);

  function toggleStyle(styleId) {
    setSelectedStyles((current) => (current.includes(styleId) ? current.filter((item) => item !== styleId) : [...current, styleId]));
  }

  function changeLevel(cardId, rawValue) {
    setLevels((current) => {
      const next = { ...current };
      if (rawValue === "") delete next[cardId];
      else next[cardId] = Number(rawValue);
      return next;
    });
    setRedeemPlan((current) => {
      const startingLevel = rawValue === "" ? null : Number(rawValue);
      const capacity = getMaxRedeemsFromLevel(startingLevel);
      let keptForCard = 0;
      return current.filter((entry) => {
        if (String(entry.cardId) !== String(cardId)) return true;
        if (keptForCard >= capacity) return false;
        keptForCard += 1;
        return true;
      });
    });
  }

  function changeTicketCount(poolId, delta) {
    const pool = SELECTOR_POOLS.find((item) => item.id === poolId);
    if (!pool) return;
    const minimum = plannedTicketCounts[poolId] || 0;
    setTicketCounts((current) => ({
      ...current,
      [poolId]: Math.min(pool.maxTickets, Math.max(minimum, Number(current[poolId] || 0) + delta)),
    }));
  }

  function changeCandidateLevel(cardId, rawValue) {
    const projectedLevel = rawValue === "" ? null : Number(rawValue);
    const plannedRedeemCount = getRedeemsForCard(redeemPlan, cardId).length;
    // The dropdown shows the effective level after planned redeems. Convert that
    // selection back to the base inventory level before preserving the plan, so
    // selecting the already displayed LB cannot count the same redeem twice.
    const startingLevel = projectedLevel === null ? null : getStartingLevelForProjectedLevel(projectedLevel, plannedRedeemCount);
    if (projectedLevel !== null && startingLevel === null) return;

    setCandidateLevels((current) => ({ ...current, [cardId]: startingLevel }));
    setRedeemPlan((current) => {
      if (startingLevel === null) return current.filter((entry) => String(entry.cardId) !== String(cardId));
      const capacity = getMaxRedeemsFromLevel(startingLevel);
      let keptForCard = 0;
      return current.filter((entry) => {
        if (String(entry.cardId) !== String(cardId)) return true;
        if (keptForCard >= capacity) return false;
        keptForCard += 1;
        return true;
      });
    });
  }

  function addRedeem(candidate) {
    if (!candidate?.levelKnown || candidate.currentLevel === null || candidate.currentLevel >= 4) return;
    const pool = findCompatibleTicketPool(candidate.card, ticketCounts, redeemPlan);
    if (!pool) return;
    const currentCount = getRedeemsForCard(redeemPlan, candidate.card.id).length;
    const capacity = getMaxRedeemsFromLevel(candidate.startingLevel);
    if (currentCount >= capacity) return;
    const id = `exchange-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setRedeemPlan((current) => [...current, { id, cardId: String(candidate.card.id), poolId: pool.id }]);
  }

  function removeRedeem(exchangeId) {
    setRedeemPlan((current) => current.filter((entry) => entry.id !== exchangeId));
  }

  function resetViewer() {
    setLevels({});
    setSelectedStyles([]);
    setTicketCounts({ ...DEFAULT_TICKET_COUNTS });
    setRedeemPlan([]);
    setCandidateLevels({});
  }

  const redeemPlanner = (
    <RedeemPlanner
      ticketCounts={ticketCounts}
      plannedCounts={plannedTicketCounts}
      remainingCounts={remainingTicketCounts}
      totalRemaining={totalTicketsRemaining}
      planRows={planRows}
      candidates={plannerCandidates}
      onTicketCountChange={changeTicketCount}
      onRedeem={addRedeem}
      onRemoveExchange={removeRedeem}
      onCandidateLevelChange={changeCandidateLevel}
      skillOverrides={config?.skillOverrides || {}}
    />
  );

  return (
    <main className="page-shell">
      <section className="hero hero-selector">
        <div className="hero-copy">
          <span className="eyebrow">UMA MUSUME · SUPPORT CARD TOOL</span>
          <h1>
            2nd Anniversary
            <br />
            <span>Selector Guide.</span>
          </h1>
          <p>In the end, it all comes down to your own decision. Always use this tools as a reference</p>
        </div>
        <div className="hero-video-column">
          <div className="hero-video-heading">
            <span className="section-kicker">FEATURED VIDEO</span>
            <span className="hero-video-caption">SELECTOR GUIDE</span>
          </div>
          <div className="hero-video-frame">
            {sitePreferences.externalMedia ? (
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${FEATURED_VIDEO_ID}?start=${FEATURED_VIDEO_START_SECONDS}&rel=0`}
                title="Uma Musume support card exchange guide"
                loading="lazy"
                referrerPolicy="strict-origin-when-cross-origin"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            ) : (
              <div className="hero-video-consent">
                <span>EXTERNAL MEDIA IS DISABLED</span>
                <p>Allow optional YouTube media to load the featured video.</p>
                <a href="/cookie-settings">Open cookie settings</a>
              </div>
            )}
          </div>
          <p className="hero-video-footnote">Watch the guide, then build your exchange plan below.</p>
        </div>
      </section>

      <section className="intro-row">
        <div>
          <span className="section-kicker">01 / RUNNING STYLE</span>
          <h2>What do you play?</h2>
        </div>
        <p>Select one or more styles to show relevant recommendation categories. Universal is always included.</p>
      </section>
      <section className="style-grid" aria-label="Choose running styles">
        {RUNNING_STYLES.map((style, index) => {
          const active = selectedStyles.includes(style.id);
          return (
            <button key={style.id} type="button" className={`style-option style-${style.id} ${active ? "active" : ""}`} onClick={() => toggleStyle(style.id)} aria-pressed={active}>
              <span className="style-index">
                <span>0{index + 1}</span>
                <RunningStyleLogo styleId={style.id} className="style-option-logo" />
              </span>
              <span className="style-label">{style.label}</span>
              <span className="style-check">{active ? <Check size={16} /> : <span />}</span>
            </button>
          );
        })}
      </section>

      <section className="intro-row collection-intro">
        <div>
          <span className="section-kicker">02 / CORE INVENTORY</span>
          <h2>Your core support cards</h2>
        </div>
        <div className="collection-actions">
          <span className={`counter-pill ${allCoreFilled ? "counter-complete" : ""}`}>
            {Object.keys(levels).filter((id) => coreCards.some((card) => card.id === id)).length} / {coreCards.length} complete
          </span>
          <button
            type="button"
            className="reset-viewer-button"
            onClick={resetViewer}
            disabled={
              Object.keys(levels).length === 0 &&
              selectedStyles.length === 0 &&
              redeemPlan.length === 0 &&
              Object.values(candidateLevels).every((value) => value === null || value === undefined) &&
              SELECTOR_POOLS.every((pool) => Number(ticketCounts[pool.id] || 0) === DEFAULT_TICKET_COUNTS[pool.id])
            }
          >
            <RotateCcw size={14} /> Reset all
          </button>
        </div>
      </section>
      <p className="section-description">
        Choose a level for every card. Select <strong>Not owned</strong> if you do not own it. Do not leave a selection empty.
      </p>

      {loading ? (
        <div className="empty-state">
          <div className="loading-pulse" />
          <strong>Loading cards</strong>
          <p>Loading the latest card catalog and scenarios.</p>
        </div>
      ) : coreCards.length === 0 ? (
        <div className="empty-state catalog-empty">
          <div className="empty-icon">
            <ListChecks size={24} />
          </div>
          <h3>Core cards unavailable</h3>
          <p>The card catalog could not be loaded. Check the Supabase configuration.</p>
        </div>
      ) : (
        <div className="core-card-grid">
          {coreCards.map((card, index) => (
            <article className={`core-card ${levels[card.id] !== undefined ? "is-filled" : ""}`} key={card.id}>
              <div className="core-card-photo-wrap">
                <CardImage card={card} className="core-card-photo" eager={index < 2} />
                <span className="core-card-index">CORE 0{index + 1}</span>
              </div>
              <div className="core-card-content">
                <span className="core-card-type">{card.type || "Support Card"}</span>
                <h3>{card.name}</h3>
                <div className="core-card-description" aria-label={`${card.name} details`}>
                  <p>
                    <span>Style</span>
                    <strong>{card.coreDescription?.style || "Add running style"}</strong>
                  </p>
                  <p>
                    <span>Usable from</span>
                    <strong>{card.coreDescription?.usableFrom || "Add usable LB"}</strong>
                  </p>
                  <p>
                    <span>Strengths</span>
                    <strong>{card.coreDescription?.strengths || "Add key strengths"}</strong>
                  </p>
                  <p>
                    <span>Notes</span>
                    <strong className="core-card-note-text">{card.coreDescription?.notes || "-"}</strong>
                  </p>
                </div>
                <label className="level-control core-level-control">
                  <span>Limit break</span>
                  <select value={levels[card.id] ?? ""} onChange={(event) => changeLevel(card.id, event.target.value)} aria-label={`Choose a level ${card.name}`} required>
                    <option value="">Choose a level LB</option>
                    {LEVEL_OPTIONS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.value === -1 ? level.label : level.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {levels[card.id] !== undefined && (
                <span className="core-filled-mark">
                  <Check size={13} />
                </span>
              )}
            </article>
          ))}
        </div>
      )}

      <section className="recommendation-section public-result-section" aria-live="polite">
        <div className="recommendation-heading">
          <div>
            <span className="section-kicker">03 / EXCHANGE SUPOKA</span>
            <h2>Recommendations</h2>
          </div>
        </div>

        {!allCoreFilled ? (
          <div className="recommendation-empty">
            <div className="recommendation-icon">
              <ListChecks size={24} />
            </div>
            <div className="recommendation-copy">
              <h3>Complete all six core cards first</h3>
              <p>Your six Core Card levels are evaluated against the creator’s saved recommendation setup. Results appear after all six are selected.</p>
            </div>
          </div>
        ) : !matchedScenario ? (
          <>
            <div className="recommendation-empty">
              <div className="recommendation-icon">
                <CircleHelp size={24} />
              </div>
              <div className="recommendation-copy">
                <h3>No new recommendations available</h3>
                <p>
                  {ruleEngineEnabled
                    ? "No base recommendations or matching overrides produce results for this simulated Core Card combination yet. You can still review or undo exchanges already in your plan."
                    : "There are no recommendations configured for this simulated Core Card combination yet. You can still review or undo exchanges already in your plan."}
                </p>
              </div>
            </div>
            {redeemPlanner}
          </>
        ) : (
          <>
            {redeemPlanner}
            {plannerCandidates.length > 0 && (
              <section className="compare-callout" aria-label="Compare support cards">
                <div className="compare-callout-icon">
                  <GitCompare size={19} />
                </div>
                <div className="compare-callout-copy">
                  <h3>Still unsure which cards to exchange?</h3>
                  <p>Compare the training results of your top recommendations</p>
                </div>
                <button type="button" className="compare-callout-button" onClick={() => setCompareOpen(true)}>
                  <GitCompare size={15} /> Compare Cards
                </button>
              </section>
            )}
          </>
        )}
      </section>

      <CommunitySection cards={cards} coreCards={coreCards} levels={levels} allCoreFilled={allCoreFilled} matchedScenario={legacyMatchedScenario} selectedStyles={selectedStyles} />

      <Footer />
      {compareOpen && <CompareCardsModal initialSlots={compareInitialSlots} onClose={() => setCompareOpen(false)} />}
    </main>
  );
}
