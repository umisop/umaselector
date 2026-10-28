import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, CircleHelp, Info, ListChecks, RotateCcw, Sparkles } from "lucide-react";
import CardImage from "../components/CardImage";
import RunningStyleLogo from "../components/RunningStyleLogo";
import CommunitySection from "../components/CommunitySection";
import Footer from "../components/Footer";
import SkillDetailModal from "../components/SkillDetailModal";
import { readSitePreferences, subscribeSitePreferences } from "../lib/sitePreferences";
import { findMatchingScenario, getScenarioRecommendations, LEVEL_OPTIONS, RECOMMENDATION_CATEGORIES, RUNNING_STYLES } from "../lib/scenarioEngine";
import { buildRuleBasedRecommendations, combineUniversalAndStyleRecommendations, evaluateRecommendationItems, orderRecommendationsByStatus } from "../lib/recommendationRules";

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
                    {item.minUsableLb !== null && item.minUsableLb !== undefined && item.minUsableLb !== "" && Number.isInteger(Number(item.minUsableLb)) && Number(item.minUsableLb) >= 0 && Number(item.minUsableLb) <= 4 && (
                      <> <span className="recommendation-meta-separator">·</span> Minimum usable <strong className="recommendation-usable-lb">LB{Number(item.minUsableLb)}</strong></>
                    )}
                  </p>
                  {Array.isArray(item.skills) && item.skills.length > 0 && (
                    <div className="recommendation-skills" aria-label={`Skills for ${card.name}`}>
                      <span>Skill{item.skills.length > 1 ? "s" : ""}: </span>
                      {item.skills.map((skill, skillIndex) => {
                        const skillId = String(skill?.id || "");
                        const skillName = String(skill?.name || `Skill ${skillId}`);
                        return <span className="recommendation-skill-entry" key={`${skillId}-${skillIndex}`}>
                          {skillIndex > 0 && <span className="recommendation-skill-separator">, </span>}
                          <button type="button" className="recommendation-skill-link" onClick={() => setActiveSkill({ id: skillId, name: skillName })}>{skillName}</button>
                        </span>;
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
      {activeSkill && <SkillDetailModal skillId={activeSkill.id} fallbackName={activeSkill.name} activationExplanation={skillOverrides?.[activeSkill.id]?.activationExplanation} onClose={closeSkillModal} />}
    </section>
  );
}

export default function SelectorPage({ config, loading }) {
  const [selectedStyles, setSelectedStyles] = useState([]);
  const [sitePreferences, setSitePreferences] = useState(() => readSitePreferences());
  useEffect(() => subscribeSitePreferences(setSitePreferences), []);
  const [levels, setLevels] = useState({});
  const cards = Array.isArray(config?.cards) ? config.cards : [];
  const coreCards = useMemo(() => sortCoreCards(cards.filter((card) => card.isCore)), [cards]);
  const cardMap = useMemo(() => new Map(cards.map((card) => [String(card.id), card])), [cards]);
  const allCoreFilled = coreCards.length > 0 && coreCards.every((card) => levels[card.id] !== undefined && levels[card.id] !== null);
  const legacyMatchedScenario = useMemo(() => (allCoreFilled ? findMatchingScenario(config?.scenarios, levels, coreCards) : null), [allCoreFilled, config?.scenarios, levels, coreCards]);
  const ruleEngineEnabled = config?.recommendationModel?.enabled === true;
  const ruleBasedResult = useMemo(
    () => (allCoreFilled && ruleEngineEnabled ? buildRuleBasedRecommendations(config, levels, coreCards, { activeCategories: ["universal", ...selectedStyles] }) : null),
    [allCoreFilled, ruleEngineEnabled, config, levels, coreCards, selectedStyles],
  );
  const evaluatedLegacyScenario = useMemo(() => {
    if (!legacyMatchedScenario || ruleEngineEnabled) return legacyMatchedScenario;
    const evaluatedRecommendations = Object.fromEntries(
      RECOMMENDATION_CATEGORIES.map((category) => [
        category.id,
        evaluateRecommendationItems(getScenarioRecommendations(legacyMatchedScenario, category.id), category.id, levels, coreCards, cards).items,
      ]),
    );
    return { ...legacyMatchedScenario, recommendations: evaluatedRecommendations };
  }, [legacyMatchedScenario, ruleEngineEnabled, levels, coreCards, cards]);
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
      return {
        id: `${style.id}-with-universal`,
        styleId: style.id,
        label: style.label,
        description: `Recommendations for ${style.label}.`,
        items: combineUniversalAndStyleRecommendations(universalItems, getScenarioRecommendations(matchedScenario, style.id)),
      };
    });
  }, [matchedScenario, selectedStyles]);

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
  }

  function resetViewer() {
    setLevels({});
    setSelectedStyles([]);
  }

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
          <button type="button" className="reset-viewer-button" onClick={resetViewer} disabled={Object.keys(levels).length === 0 && selectedStyles.length === 0}>
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
                    <strong>{card.coreDescription?.notes || "-"}</strong>
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
          <div className="recommendation-empty">
            <div className="recommendation-icon">
              <CircleHelp size={24} />
            </div>
            <div className="recommendation-copy">
              <h3>No recommendations available</h3>
              <p>
                {ruleEngineEnabled
                  ? "No base recommendations or matching overrides produce results for this combination yet."
                  : "There are no recommendations configured for this combination of Core Card levels yet."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="results-category-list">
              {recommendationGroups.map((group) => (
                <RecommendationPanel key={group.id} category={group} items={group.items} cardMap={cardMap} skillOverrides={config?.skillOverrides || {}} />
              ))}
            </div>
            {!selectedStyles.length && <p className="result-hint">Select one or more running styles to combine Universal recommendations with each selected style independently.</p>}
          </>
        )}
      </section>

      <CommunitySection cards={cards} coreCards={coreCards} levels={levels} allCoreFilled={allCoreFilled} matchedScenario={legacyMatchedScenario} selectedStyles={selectedStyles} />

      <Footer />
    </main>
  );
}
