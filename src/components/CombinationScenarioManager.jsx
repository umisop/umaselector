import { useMemo, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ArrowDown,
  ArrowUp,
  CircleDot,
  Filter,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import CardImage from "./CardImage";
import RunningStyleLogo from "./RunningStyleLogo";
import { RECOMMENDATION_CATEGORIES } from "../lib/scenarioEngine";
import {
  combinationAt,
  combinationLevelLabel,
  countCombinationRecommendations,
  getCombinationCount,
  getCombinationName,
  getCompactCombinationName,
  hasCombinationRecommendations,
  makeCombinationScenario,
  orderCombinationCoreCards,
  scenarioCombinationKey,
  COMBINATION_LEVEL_ORDER,
} from "../lib/combinationEngine";

const LEVEL_ORDER = COMBINATION_LEVEL_ORDER;
const PAGE_SIZE = 40;

export default function CombinationScenarioManager({ config, coreCards: sourceCoreCards, cards, updateConfig, setSuccess, setError }) {
  const coreCards = orderCombinationCoreCards(sourceCoreCards || []);
  const coreCardSignature = coreCards.map((card) => `${card.id}:${card.name || ""}`).join("~");
  const scenarioList = Array.isArray(config?.scenarios) ? config.scenarios : [];
  const totalCombinations = getCombinationCount(coreCards);
  const [selectedComboKey, setSelectedComboKey] = useState(() => Array(coreCards.length).fill(0).join("|"));
  const [conditionFilters, setConditionFilters] = useState(() => Object.fromEntries(coreCards.map((card) => [card.id, "any"])));
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [activeCategory, setActiveCategory] = useState("universal");
  const [newRecCardId, setNewRecCardId] = useState("");
  const [newRecSearch, setNewRecSearch] = useState("");

  const scenariosByCombo = useMemo(() => {
    const map = new Map();
    for (const scenario of scenarioList) {
      const key = scenarioCombinationKey(scenario, coreCards);
      if (!key) continue;
      const previous = map.get(key);
      const candidateEnabled = scenario.enabled !== false;
      const previousEnabled = previous ? previous.enabled !== false : false;
      if (
        !previous ||
        (candidateEnabled && !previousEnabled) ||
        (candidateEnabled === previousEnabled && Number(scenario.priority || 0) > Number(previous.priority || 0))
      ) map.set(key, scenario);
    }
    return map;
  }, [scenarioList, coreCards]);

  const configuredKeys = useMemo(() => {
    const keys = new Set();
    for (const [key, scenario] of scenariosByCombo.entries()) if (hasCombinationRecommendations(scenario)) keys.add(key);
    return keys;
  }, [scenariosByCombo]);
  const configuredKeysSignature = useMemo(() => [...configuredKeys].join(","), [configuredKeys]);
  const configuredCount = configuredKeys.size;

  const matchingIndexes = useMemo(() => {
    const indexes = [];
    const query = search.trim().toLowerCase();
    for (let index = 0; index < totalCombinations; index += 1) {
      const combo = combinationAt(index, coreCards);
      let matches = true;
      for (const card of coreCards) {
        const filterValue = conditionFilters[card.id] ?? "any";
        if (filterValue !== "any" && Number(filterValue) !== combo.conditions[card.id]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      const configured = configuredKeys.has(combo.key);
      if (statusFilter === "configured" && !configured) continue;
      if (statusFilter === "not-configured" && configured) continue;
      if (query && !getCombinationName(combo, coreCards).toLowerCase().includes(query) && !getCompactCombinationName(combo, coreCards).toLowerCase().includes(query) && !String(index + 1).includes(query)) continue;
      indexes.push(index);
    }
    return indexes;
  }, [totalCombinations, coreCardSignature, conditionFilters, search, statusFilter, configuredKeysSignature]);

  const totalPages = Math.max(1, Math.ceil(matchingIndexes.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visibleCombinations = useMemo(() => matchingIndexes.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE).map((index) => {
    const combo = combinationAt(index, coreCards);
    const savedScenario = scenariosByCombo.get(combo.key) || null;
    return { ...combo, savedScenario, configured: hasCombinationRecommendations(savedScenario) };
  }), [matchingIndexes, safePage, coreCards, scenariosByCombo]);

  const selectedValues = selectedComboKey.split("|").map(Number);
  const selectedCombo = useMemo(() => {
    const values = selectedValues.length === coreCards.length && selectedValues.every((value) => Number.isInteger(value) && value >= -1 && value <= 4)
      ? selectedValues
      : Array(coreCards.length).fill(0);
    return {
      index: 0,
      key: values.join("|"),
      values,
      conditions: Object.fromEntries(coreCards.map((card, index) => [card.id, values[index]])),
    };
  // selectedValues is derived from selectedComboKey and core card count.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedComboKey, coreCards]);
  const selectedSavedScenario = scenariosByCombo.get(selectedCombo.key) || null;
  const selectedScenario = selectedSavedScenario || makeCombinationScenario(selectedCombo, coreCards);
  const activeRecommendations = selectedScenario.recommendations?.[activeCategory] || [];
  const recommendationCards = cards || [];
  const selectedRecommendationCard = recommendationCards.find((card) => String(card.id) === String(newRecCardId)) || null;
  const filteredRecommendationCards = useMemo(() => {
    const query = newRecSearch.trim().toLowerCase();
    if (!query) return [];
    return recommendationCards.filter((card) => `${card.name} ${card.type || ""} ${card.rarity || ""} ${card.gameCardId || ""}`.toLowerCase().includes(query));
  }, [recommendationCards, newRecSearch]);

  function selectCombo(combo) {
    setSelectedComboKey(combo.key);
    setActiveCategory("universal");
    setNewRecCardId("");
    setNewRecSearch("");
    setSuccess("");
    setError("");
  }

  function changeScenario(mutator) {
    const currentKey = selectedCombo.key;
    updateConfig((currentConfig) => {
      const currentScenarios = Array.isArray(currentConfig.scenarios) ? currentConfig.scenarios : [];
      const preferredId = selectedSavedScenario?.id;
      const preferredIndex = preferredId ? currentScenarios.findIndex((scenario) => scenario.id === preferredId) : -1;
      const index = preferredIndex >= 0 ? preferredIndex : currentScenarios.findIndex((scenario) => scenarioCombinationKey(scenario, coreCards) === currentKey);
      const currentScenario = index >= 0 ? currentScenarios[index] : makeCombinationScenario(selectedCombo, coreCards);
      const nextScenario = { ...currentScenario, ...mutator(currentScenario) };
      const nextScenarios = [...currentScenarios];
      if (index >= 0) nextScenarios[index] = nextScenario;
      else nextScenarios.push(nextScenario);
      return { ...currentConfig, scenarios: nextScenarios };
    });
  }

  function addRecommendation() {
    if (!newRecCardId) return;
    if (activeRecommendations.some((item) => String(item.cardId) === String(newRecCardId))) {
      setError("That card is already in this category. Update its status in the existing row.");
      return;
    }
    changeScenario((scenario) => ({
      recommendations: {
        ...makeEmptyRecommendations(),
        ...(scenario.recommendations || {}),
        [activeCategory]: [...(scenario.recommendations?.[activeCategory] || []), { cardId: newRecCardId, status: "recommended", note: "" }],
      },
    }));
    setNewRecCardId("");
    setNewRecSearch("");
  }

  function updateRecommendation(index, patch) {
    changeScenario((scenario) => {
      const list = [...(scenario.recommendations?.[activeCategory] || [])];
      list[index] = { ...list[index], ...patch };
      return { recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}), [activeCategory]: list } };
    });
  }

  function removeRecommendation(index) {
    changeScenario((scenario) => {
      const list = [...(scenario.recommendations?.[activeCategory] || [])];
      list.splice(index, 1);
      return { recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}), [activeCategory]: list } };
    });
  }

  function moveRecommendation(index, direction) {
    changeScenario((scenario) => {
      const list = [...(scenario.recommendations?.[activeCategory] || [])];
      const destination = index + direction;
      if (destination < 0 || destination >= list.length) return {};
      [list[index], list[destination]] = [list[destination], list[index]];
      return { recommendations: { ...makeEmptyRecommendations(), ...(scenario.recommendations || {}), [activeCategory]: list } };
    });
  }

  function clearSelectedCombination() {
    if (!selectedSavedScenario) return;
    if (!window.confirm("Remove the saved recommendations for this exact combination? A broader legacy scenario may match again after this is removed.")) return;
    updateConfig((current) => ({
      ...current,
      scenarios: current.scenarios.filter((scenario) => scenarioCombinationKey(scenario, coreCards) !== selectedCombo.key),
    }));
    setSuccess("This exact combination was removed from the draft. Click Save changes to publish it.");
  }

  function updateFilter(cardId, value) {
    setConditionFilters((current) => ({ ...current, [cardId]: value }));
    setPage(1);
  }

  return (
    <section className="combination-manager">
      <header className="combination-manager-header">
        <div>
          <span className="section-kicker">GRANDMASTER / COMBINATION WORKSPACE</span>
          <h2>All Core Card Combinations</h2>
          <p>All {totalCombinations.toLocaleString()} combinations are generated automatically. Configure recommendations only for combinations you want to publish; empty combinations do not add bulk to the saved configuration.</p>
        </div>
        <div className="combination-manager-stats">
          <span>{totalCombinations.toLocaleString()} <small>possible</small></span>
          <span>{configuredCount.toLocaleString()} <small>with recommendations</small></span>
        </div>
      </header>

      <div className="combination-layout">
        <aside className="combination-browser">
          <div className="combination-browser-title">
            <div>
              <span className="section-kicker">BROWSE</span>
              <h3>Find a combination</h3>
            </div>
            <Filter size={18} />
          </div>
          <label className="field-label">
            Search by card name or level
            <div className="combination-search-wrap"><Search size={15} /><input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="e.g. Kitasan LB1" /></div>
          </label>
          <div className="combination-level-filters">
            {coreCards.map((card) => (
              <label className="field-label" key={card.id}>
                {card.name}
                <select value={conditionFilters[card.id] ?? "any"} onChange={(event) => updateFilter(card.id, event.target.value)}>
                  <option value="any">Any level</option>
                  {LEVEL_ORDER.map((value) => <option key={value} value={value}>{combinationLevelLabel(value)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="field-label">
            Recommendation status
            <select value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}>
              <option value="all">All combinations</option>
              <option value="configured">Has recommendations</option>
              <option value="not-configured">Needs recommendations</option>
            </select>
          </label>
          <div className="combination-results-meta">
            <strong>{matchingIndexes.length.toLocaleString()} matches</strong>
            <span>Page {safePage} of {totalPages}</span>
          </div>
          <div className="combination-results-list">
            {visibleCombinations.map((combo, localIndex) => (
              <button type="button" key={combo.key} className={`combination-result ${selectedCombo.key === combo.key ? "active" : ""}`} onClick={() => selectCombo(combo)}>
                <span className="combination-result-index">{String((safePage - 1) * PAGE_SIZE + localIndex + 1).padStart(2, "0")}</span>
                <span className="combination-result-copy">
                  <strong>{getCompactCombinationName(combo, coreCards)}</strong>
                  <small>{combo.configured ? `${countCombinationRecommendations(combo.savedScenario)} recommendation entries` : "No recommendations yet"}</small>
                </span>
                <span className={`combination-state-dot ${combo.configured ? "configured" : ""}`} title={combo.configured ? "Has recommendations" : "Needs recommendations"} />
              </button>
            ))}
            {visibleCombinations.length === 0 && <div className="combination-empty"><Layers size={22} /><strong>No matching combinations</strong><span>Change the filters and try again.</span></div>}
          </div>
          <div className="combination-pagination">
            <button type="button" className="button-secondary button-compact" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft size={15} /> Previous</button>
            <button type="button" className="button-secondary button-compact" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next <ChevronRight size={15} /></button>
          </div>
        </aside>

        <div className="combination-editor-panel">
          <div className="combination-detail-head">
            <div>
              <span className="section-kicker">SELECTED COMBINATION</span>
              <h3>Six-card condition</h3>
              <p>Recommendations saved here are used when a visitor's six Core Card levels match this combination exactly.</p>
            </div>
            {selectedSavedScenario && (
              <button type="button" className="button-danger button-compact" onClick={clearSelectedCombination} title="Remove the exact-combination configuration"><Trash2 size={14} /> Clear combination</button>
            )}
          </div>
          <div className="combination-selected-grid">
            {coreCards.map((card, index) => (
              <div className="combination-selected-card" key={card.id}>
                <CardImage card={card} className="combination-selected-image" />
                <div><strong>{card.name}</strong><span>{combinationLevelLabel(selectedCombo.values[index])}</span></div>
              </div>
            ))}
          </div>
          <div className="combination-selected-status">
            {selectedSavedScenario ? <><CheckCircle2 size={16} /><span>{hasCombinationRecommendations(selectedSavedScenario) ? "This combination has saved recommendations in the current draft." : "This combination has an exact entry but no recommendations yet."}</span></> : <><CircleDot size={16} /><span>This combination has not been configured yet. Add a recommendation to create its exact entry.</span></>}
          </div>
          {selectedSavedScenario && (
            <label className="combination-enable-toggle">
              <input type="checkbox" checked={selectedSavedScenario.enabled !== false} onChange={(event) => changeScenario(() => ({ enabled: event.target.checked }))} />
              <span><strong>Publish this combination</strong><small>Disable it to stop this exact combination from overriding broader saved scenarios.</small></span>
            </label>
          )}

          <div className="recommendation-category-tabs combination-category-tabs">
            {RECOMMENDATION_CATEGORIES.map((category) => (
              <button type="button" key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>
                {category.id !== "universal" && <RunningStyleLogo styleId={category.id} className="recommendation-category-tab-logo" />}
                <span className="recommendation-category-tab-label">{category.label}</span>
                <span className="recommendation-category-count">{(selectedScenario.recommendations?.[category.id] || []).length}</span>
              </button>
            ))}
          </div>
          <p className="category-help">{RECOMMENDATION_CATEGORIES.find((category) => category.id === activeCategory)?.description} The selected combination is exact; only the running-style categories shown above are layered with Universal by the public selector.</p>

          <div className="add-recommendation-picker">
            <label className="field-label" htmlFor="combination-recommendation-search">
              Find any support card in the catalog
              <input id="combination-recommendation-search" type="search" value={newRecSearch} onChange={(event) => { setNewRecSearch(event.target.value); setNewRecCardId(""); }} placeholder="Type a card name, support type, rarity, or ID…" autoComplete="off" />
            </label>
            {selectedRecommendationCard && (
              <div className="picker-selected">
                <CardImage card={selectedRecommendationCard} className="picker-selected-image" />
                <div><strong>{selectedRecommendationCard.name}</strong><span>{selectedRecommendationCard.type || "Support"} · {selectedRecommendationCard.rarity || "SSR"}</span></div>
                <button type="button" className="button-primary" onClick={addRecommendation}><Plus size={16} /> Add recommendation</button>
              </div>
            )}
            {newRecSearch.trim() && (
              <div className="card-search-results" role="listbox" aria-label="Matching support cards">
                {filteredRecommendationCards.slice(0, 12).map((card) => (
                  <button type="button" role="option" aria-selected={String(card.id) === String(newRecCardId)} className={`card-search-result ${String(card.id) === String(newRecCardId) ? "selected" : ""}`} key={card.id} onClick={() => setNewRecCardId(String(card.id))}>
                    <CardImage card={card} className="card-search-result-image" />
                    <span className="card-search-result-copy"><strong>{card.name}</strong><small>{card.type || "Support"}{card.rarity ? ` · ${card.rarity}` : ""}</small></span>
                    <span className="card-search-result-id">{card.gameCardId || card.id}</span>
                  </button>
                ))}
                {filteredRecommendationCards.length === 0 && <p className="card-search-no-results">No cards match “{newRecSearch}”.</p>}
                {filteredRecommendationCards.length > 12 && <p className="card-search-limit">Showing 12 of {filteredRecommendationCards.length} matches. Refine your search.</p>}
              </div>
            )}
            {!newRecSearch.trim() && !selectedRecommendationCard && <p className="field-hint">{recommendationCards.length} support cards available. Start typing to search the catalog.</p>}
          </div>

          {activeRecommendations.length === 0 ? (
            <div className="recommendation-editor-empty"><Layers size={24} /><strong>No recommendations for this combination yet</strong><p>Search the card catalog above and add the recommendations that apply to these exact six Core Card levels.</p></div>
          ) : (
            <div className="recommendation-editor-list">
              {activeRecommendations.map((item, index) => {
                const card = recommendationCards.find((candidate) => String(candidate.id) === String(item.cardId));
                if (!card) return <div className="notice notice-error" key={`missing-${item.cardId}`}>Card ID {item.cardId} is missing from the catalog. Fix it in Advanced JSON.</div>;
                return (
                  <article className="recommendation-editor-item" key={`${item.cardId}-${index}`}>
                    <div className="rec-order-controls">
                      <button type="button" className="icon-button" title="Move up" aria-label={`Move ${card.name} up`} disabled={index === 0} onClick={() => moveRecommendation(index, -1)}><ArrowUp size={14} /></button>
                      <span>{index + 1}</span>
                      <button type="button" className="icon-button" title="Move down" aria-label={`Move ${card.name} down`} disabled={index === activeRecommendations.length - 1} onClick={() => moveRecommendation(index, 1)}><ArrowDown size={14} /></button>
                    </div>
                    <CardImage card={card} className="recommendation-editor-image" />
                    <div className="recommendation-editor-fields">
                      <div className="rec-title-row"><div><strong>{card.name}</strong><small>{card.type || "Support Card"}</small></div><button type="button" className="icon-button icon-button-danger" title="Remove recommendation" aria-label={`Remove recommendation ${card.name}`} onClick={() => removeRecommendation(index)}><X size={16} /></button></div>
                      <label className="field-label">Recommendation status<select value={item.status || "recommended"} onChange={(event) => updateRecommendation(index, { status: event.target.value })}><option value="recommended">Recommended</option><option value="alternative">Alternative</option></select></label>
                      <label className="field-label">Optional note<input value={item.note || ""} onChange={(event) => updateRecommendation(index, { note: event.target.value })} placeholder="Example: exchange for LB3, useful for…" /></label>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          <div className="scenario-summary-note"><ShieldCheck size={17} /><p>Only this exact six-card combination is configured by this entry. The public selector continues to use any broader legacy scenario if no enabled exact-combination entry matches.</p></div>
        </div>
      </div>
    </section>
  );
}
