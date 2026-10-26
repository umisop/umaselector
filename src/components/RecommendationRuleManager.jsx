import { useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  CircleHelp,
  Layers,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
  GitBranch,
} from "lucide-react";
import CardImage from "./CardImage";
import RunningStyleLogo from "./RunningStyleLogo";
import { LEVEL_OPTIONS, RECOMMENDATION_CATEGORIES, makeEmptyRecommendations, conditionIsAny, getConditionValues } from "../lib/scenarioEngine";
import {
  createEmptyRecommendationModel,
  createRecommendationOverride,
  normalizeRecommendationModel,
  recommendationModelHasContent,
} from "../lib/recommendationRules";

const CATEGORY_TABS = RECOMMENDATION_CATEGORIES;

const CONDITION_PRESETS = [
  { id: "not-owned-lb1", label: "Not owned – LB1", values: [-1, 0, 1] },
  { id: "not-owned-lb2", label: "Not owned – LB2", values: [-1, 0, 1, 2] },
  { id: "lb0-lb1", label: "LB0 – LB1", values: [0, 1] },
  { id: "lb0-lb2", label: "LB0 – LB2", values: [0, 1, 2] },
  { id: "lb1-lb3", label: "LB1 – LB3", values: [1, 2, 3] },
  { id: "lb2-lb4", label: "LB2 – LB4", values: [2, 3, 4] },
  { id: "lb3-lb4", label: "LB3 – LB4", values: [3, 4] },
];

function sameLevelSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((level) => right.includes(level));
}

function conditionSelectValue(rawValue) {
  if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue) && rawValue.mode === "levels") {
    if (rawValue.custom === true) return "custom";
    if (rawValue.preset) return `preset:${rawValue.preset}`;
  }
  const values = getConditionValues(rawValue);
  if (conditionIsAny(rawValue)) return "any";
  if (typeof rawValue !== "object" && !Array.isArray(rawValue) && values?.length === 1) return `level:${values[0]}`;
  const matchedPreset = CONDITION_PRESETS.find((preset) => sameLevelSet(values, preset.values));
  return matchedPreset ? `preset:${matchedPreset.id}` : "custom";
}

function ConditionSelector({ card, value, onChange }) {
  const selectorValue = conditionSelectValue(value);
  const currentValues = getConditionValues(value) || [];
  const showCustom = selectorValue === "custom";

  function changePreset(nextValue) {
    if (nextValue === "any") { onChange("any"); return; }
    if (nextValue === "custom") {
      onChange({ mode: "levels", custom: true, values: [...currentValues] });
      return;
    }
    if (nextValue.startsWith("level:")) { onChange(Number(nextValue.slice("level:".length))); return; }
    if (nextValue.startsWith("preset:")) {
      const preset = CONDITION_PRESETS.find((item) => item.id === nextValue.slice("preset:".length));
      if (preset) onChange({ mode: "levels", preset: preset.id, values: [...preset.values] });
    }
  }

  function toggleLevel(level, checked) {
    const nextValues = checked
      ? [...new Set([...currentValues, level])]
      : currentValues.filter((value) => value !== level);
    onChange({ mode: "levels", custom: true, values: LEVEL_OPTIONS.filter((option) => nextValues.includes(option.value)).map((option) => option.value) });
  }

  return (
    <div className="rule-condition-field">
      <span>{card.name}</span>
      <select aria-label={`${card.name} level condition`} value={selectorValue} onChange={(event) => changePreset(event.target.value)}>
        <option value="any">Any level</option>
        {LEVEL_OPTIONS.map((level) => <option key={level.value} value={`level:${level.value}`}>{level.label}</option>)}
        <optgroup label="Level ranges">
          {CONDITION_PRESETS.map((preset) => <option key={preset.id} value={`preset:${preset.id}`}>{preset.label}</option>)}
        </optgroup>
        <option value="custom">Custom selection…</option>
      </select>
      {showCustom && (
        <div className="rule-condition-custom-levels">
          {LEVEL_OPTIONS.map((level) => (
            <label key={level.value}>
              <input type="checkbox" checked={currentValues.includes(level.value)} onChange={(event) => toggleLevel(level.value, event.target.checked)} />
              <span>{level.label}</span>
            </label>
          ))}
          {currentValues.length === 0 && <small>Select at least one level. An empty custom selection will never match.</small>}
        </div>
      )}
    </div>
  );
}

function itemForDisplay(item, index) {
  return {
    cardId: String(item?.cardId ?? ""),
    status: item?.status === "alternative" ? "alternative" : "recommended",
    note: String(item?.note || ""),
    action: item?.action === "remove" ? "remove" : "add",
    _key: `${item?.cardId ?? "card"}-${index}`,
  };
}

export default function RecommendationRuleManager({ config, coreCards = [], cards = [], updateConfig, setSuccess, setError }) {
  const model = normalizeRecommendationModel(config?.recommendationModel);
  const legacyScenarios = Array.isArray(config?.scenarios) ? config.scenarios : [];
  const importedLegacyIds = new Set(model.overrides.map((rule) => String(rule.sourceLegacyScenarioId || "")).filter(Boolean));
  const unimportedLegacyCount = legacyScenarios.filter((scenario) => !importedLegacyIds.has(String(scenario.id))).length;
  const [view, setView] = useState("base");
  const [activeCategory, setActiveCategory] = useState("universal");
  const [selectedRuleId, setSelectedRuleId] = useState(model.overrides[0]?.id || "");
  const [ruleSearch, setRuleSearch] = useState("");
  const [newRecCardId, setNewRecCardId] = useState("");
  const [newRecSearch, setNewRecSearch] = useState("");

  const selectedRule = model.overrides.find((rule) => rule.id === selectedRuleId) || null;
  const activeAction = selectedRule?.actions?.[activeCategory] || { enabled: false, mode: "merge", recommendations: [] };
  const activeItems = view === "base" ? (model.base?.[activeCategory] || []) : (activeAction.recommendations || []);
  const selectedCard = cards.find((card) => String(card.id) === String(newRecCardId)) || null;
  const filteredCards = useMemo(() => {
    const query = newRecSearch.trim().toLowerCase();
    if (!query) return [];
    return cards.filter((card) => `${card.name || ""} ${card.type || ""} ${card.rarity || ""} ${card.gameCardId || ""} ${card.id || ""}`.toLowerCase().includes(query));
  }, [cards, newRecSearch]);
  const filteredRules = model.overrides.filter((rule) => !ruleSearch.trim() || `${rule.name} ${rule.id}`.toLowerCase().includes(ruleSearch.trim().toLowerCase()));
  const baseCount = CATEGORY_TABS.reduce((sum, category) => sum + (model.base?.[category.id]?.length || 0), 0);
  const activeRuleCount = model.overrides.filter((rule) => rule.enabled !== false).length;
  const configuredOverrideCount = model.overrides.filter((rule) => Object.values(rule.actions || {}).some((action) => action.enabled && action.recommendations?.length)).length;
  const canEnableEngine = recommendationModelHasContent(model);

  function patchModel(mutator) {
    updateConfig((current) => {
      const currentModel = normalizeRecommendationModel(current.recommendationModel || createEmptyRecommendationModel());
      return { ...current, recommendationModel: mutator(currentModel) };
    });
  }

  function patchSelectedRule(mutator) {
    if (!selectedRuleId) return;
    patchModel((current) => ({
      ...current,
      overrides: current.overrides.map((rule) => rule.id === selectedRuleId ? mutator(rule) : rule),
    }));
  }

  function updateActiveItems(mutator) {
    if (view === "base") {
      patchModel((current) => ({
        ...current,
        base: { ...makeEmptyRecommendations(), ...(current.base || {}), [activeCategory]: mutator([...(current.base?.[activeCategory] || [])]) },
      }));
      return;
    }
    patchSelectedRule((rule) => {
      const action = rule.actions?.[activeCategory] || { enabled: false, mode: "merge", recommendations: [] };
      return {
        ...rule,
        actions: {
          ...(rule.actions || {}),
          [activeCategory]: {
            ...action,
            enabled: true,
            recommendations: mutator([...(action.recommendations || [])]),
          },
        },
      };
    });
  }

  function selectView(nextView) {
    setView(nextView);
    setNewRecCardId("");
    setNewRecSearch("");
    setSuccess("");
    setError("");
  }

  function importLegacyScenarios() {
    const existingSources = new Set(model.overrides.map((rule) => String(rule.sourceLegacyScenarioId || "")).filter(Boolean));
    const pending = legacyScenarios.filter((scenario) => !existingSources.has(String(scenario.id)));
    if (!pending.length) {
      setSuccess("All legacy scenarios have already been imported as overrides.");
      setError("");
      return;
    }
    if (!window.confirm(`Import ${pending.length} legacy scenario${pending.length === 1 ? "" : "s"} as conditional overrides? Their existing recommendation lists and matching conditions will be copied. Original scenarios will remain untouched. Use the new base list for general recommendations, then edit or remove imported overrides as needed.`)) return;
    const imported = pending.map((scenario, index) => ({
      id: `legacy-${String(scenario.id).replace(/[^a-zA-Z0-9_-]/g, "-")}-${Date.now().toString(36)}-${index}`,
      sourceLegacyScenarioId: String(scenario.id),
      name: `Legacy: ${scenario.name || `Scenario ${index + 1}`}`.slice(0, 100),
      enabled: scenario.enabled !== false,
      priority: Number(scenario.priority || 0),
      conditions: Object.fromEntries(coreCards.map((card) => [card.id, scenario.conditions?.[card.id] ?? "any"])),
      actions: Object.fromEntries(CATEGORY_TABS.map((category) => [category.id, {
        enabled: true,
        mode: "replace",
        recommendations: [...(Array.isArray(scenario.recommendations?.[category.id]) ? scenario.recommendations[category.id] : [])].map((item) => ({ ...item })),
      }])),
    }));
    patchModel((current) => ({ ...current, overrides: [...current.overrides, ...imported] }));
    setSelectedRuleId(imported[0]?.id || "");
    setView("overrides");
    setActiveCategory("universal");
    setSuccess(`Imported ${imported.length} legacy scenario${imported.length === 1 ? "" : "s"} as overrides. Original scenarios remain unchanged. Click Save changes to publish.`);
    setError("");
  }

  function addRule() {
    const rule = createRecommendationOverride(coreCards, model.overrides.length + 1);
    patchModel((current) => ({ ...current, overrides: [...current.overrides, rule] }));
    setSelectedRuleId(rule.id);
    setView("overrides");
    setActiveCategory("universal");
    setNewRecCardId("");
    setNewRecSearch("");
  }

  function deleteRule() {
    if (!selectedRule) return;
    if (!window.confirm(`Delete override “${selectedRule.name}”? This will only remove the draft rule.`)) return;
    patchModel((current) => ({ ...current, overrides: current.overrides.filter((rule) => rule.id !== selectedRuleId) }));
    const nextRule = model.overrides.find((rule) => rule.id !== selectedRuleId);
    setSelectedRuleId(nextRule?.id || "");
    setSuccess("Override removed from the draft. Click Save changes to publish it.");
  }

  function addRecommendation() {
    if (!selectedCard) return;
    const exists = activeItems.some((item) => String(item.cardId) === String(selectedCard.id));
    if (exists) {
      setError("This card is already listed in this category. Edit the existing row instead.");
      return;
    }
    updateActiveItems((items) => [...items, { cardId: String(selectedCard.id), status: "recommended", note: "" }]);
    setNewRecCardId("");
    setNewRecSearch("");
    setError("");
  }

  function updateItem(index, patch) {
    updateActiveItems((items) => {
      items[index] = { ...items[index], ...patch };
      if (view === "overrides" && patch.action === "remove") {
        // Exclusion actions don't need status/note, but keeping them allows switching back to Add.
      }
      return items;
    });
  }

  function moveItem(index, direction) {
    updateActiveItems((items) => {
      const destination = index + direction;
      if (destination < 0 || destination >= items.length) return items;
      [items[index], items[destination]] = [items[destination], items[index]];
      return items;
    });
  }

  function removeItem(index) {
    updateActiveItems((items) => {
      items.splice(index, 1);
      return items;
    });
  }

  function toggleEnabled() {
    if (!model.enabled && !canEnableEngine) {
      setError("Add at least one base recommendation or one override recommendation before enabling the rule engine.");
      return;
    }
    patchModel((current) => ({ ...current, enabled: !current.enabled }));
    setSuccess(model.enabled ? "Rule engine disabled in the draft. The public Selector will use legacy scenarios after Save changes." : "Rule engine enabled in the draft. After saving, the public Selector will use base recommendations and matching overrides.");
    setError("");
  }

  return (
    <section className="rule-engine-workspace">
      <header className="rule-engine-header">
        <div>
          <span className="section-kicker">GRANDMASTER / RULE ENGINE</span>
          <h2>Base Recommendations &amp; Overrides</h2>
          <p>Set recommendations once for each running style, then add only the conditions that change the result. The engine checks all six Core Cards without requiring a saved scenario for every possible combination. After rules are merged, automatic evaluation hides Core Card targets already at LB4, adds strategy notes for known card breakpoints, and moves stronger known upgrades higher. Non-Core card ownership is not tracked by the six-card input, so those cards remain candidates.</p>
        </div>
        <div className="rule-engine-header-stats">
          <span>{baseCount} <small>base entries</small></span>
          <span>{model.overrides.length} <small>overrides</small></span>
          <span>{configuredOverrideCount} <small>configured overrides</small></span>
        </div>
      </header>

      <div className={`rule-engine-status ${model.enabled ? "is-enabled" : "is-disabled"}`}>
        <div className="rule-engine-status-icon">{model.enabled ? <CheckCircle2 size={19} /> : <CircleHelp size={19} />}</div>
        <div className="rule-engine-status-copy">
          <strong>{model.enabled ? "Rule engine is enabled in this draft" : "Legacy scenarios are still used by the public Selector"}</strong>
          <p>{model.enabled ? (baseCount === 0 ? "The engine is enabled, but there are no base recommendations. Only combinations covered by matching overrides will receive recommendations. Add base recommendations for a general fallback." : "The public Selector will use Base Recommendations plus all matching conditional overrides. Legacy manual/exact scenarios remain saved but are not used while this engine is enabled.") : (unimportedLegacyCount > 0 ? `You still have ${unimportedLegacyCount} legacy scenario${unimportedLegacyCount === 1 ? "" : "s"}. Import them as overrides before enabling the new engine if you want to preserve their current results.` : "You can prepare the base list and overrides first. Enable this engine when you are ready to switch public recommendations away from legacy scenarios.")}</p>
        </div>
        <button type="button" className={model.enabled ? "button-secondary" : "button-primary"} onClick={toggleEnabled} disabled={!model.enabled && !canEnableEngine}>
          {model.enabled ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}
          {model.enabled ? "Disable engine" : "Enable engine"}
        </button>
      </div>

      <div className="rule-engine-toolbar">
        <div className="rule-engine-view-switch" role="tablist" aria-label="Rule engine workspace">
          <button type="button" role="tab" aria-selected={view === "base"} className={view === "base" ? "active" : ""} onClick={() => selectView("base")}><Layers size={15} /> Base Recommendations</button>
          <button type="button" role="tab" aria-selected={view === "overrides"} className={view === "overrides" ? "active" : ""} onClick={() => selectView("overrides")}><GitBranch size={15} /> Conditional Overrides ({model.overrides.length})</button>
        </div>
        {unimportedLegacyCount > 0 && <button type="button" className="button-secondary button-compact" onClick={importLegacyScenarios}>Import {unimportedLegacyCount} legacy scenario{unimportedLegacyCount === 1 ? "" : "s"} as overrides</button>}
      </div>

      {view === "base" ? (
        <div className="rule-base-panel">
          <div className="rule-panel-intro">
            <div><span className="section-kicker">DEFAULT OUTPUT</span><h3>Base recommendations</h3><p>These are the candidate cards for this category. The automatic evaluator checks them against the visitor’s six Core Card levels, adds known breakpoint guidance, and hides Core Card targets already at LB4. For cards outside the six Core Cards, the visitor’s current limit break is not available to evaluate.</p></div>
          </div>
          <div className="recommendation-category-tabs rule-category-tabs">
            {CATEGORY_TABS.map((category) => <button type="button" key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>{category.id !== "universal" && <RunningStyleLogo styleId={category.id} className="recommendation-category-tab-logo" />}<span className="recommendation-category-tab-label">{category.label}</span><span className="recommendation-category-count">{model.base?.[category.id]?.length || 0}</span></button>)}
          </div>
          <p className="category-help">{CATEGORY_TABS.find((category) => category.id === activeCategory)?.description} The selected category is part of the reusable base, not tied to one six-card combination.</p>
          <RecommendationPicker cards={cards} search={newRecSearch} setSearch={setNewRecSearch} selectedId={newRecCardId} setSelectedId={setNewRecCardId} selectedCard={selectedCard} filteredCards={filteredCards} onAdd={addRecommendation} activeItems={activeItems} />
          <RecommendationItemList items={activeItems} cards={cards} isOverride={false} onUpdate={updateItem} onMove={moveItem} onRemove={removeItem} />
          <div className="scenario-summary-note"><ShieldCheck size={17} /><p>Universal recommendations are included for all running styles. Each style-specific category is added by the public Selector when that style is selected.</p></div>
        </div>
      ) : (
        <div className="rule-overrides-layout">
          <aside className="rule-overrides-sidebar">
            <div className="rule-overrides-sidebar-head"><div><span className="section-kicker">CONDITIONAL LOGIC</span><h3>Overrides</h3></div><button type="button" className="icon-button add-scenario-button" onClick={addRule} aria-label="Add override" title="Add override"><Plus size={17} /></button></div>
            <label className="field-label">Search overrides<div className="combination-search-wrap"><Search size={15} /><input type="search" value={ruleSearch} onChange={(event) => setRuleSearch(event.target.value)} placeholder="Search by rule name…" /></div></label>
            <div className="rule-overrides-list">
              {filteredRules.map((rule, index) => <button type="button" key={rule.id} className={`rule-override-list-item ${selectedRuleId === rule.id ? "active" : ""}`} onClick={() => setSelectedRuleId(rule.id)}><span className={`scenario-state-dot ${rule.enabled === false ? "disabled" : ""}`} /><span><strong>{rule.name}</strong><small>{rule.enabled === false ? "Disabled" : "Active"} · Priority {Number(rule.priority || 0)}</small></span></button>)}
              {!filteredRules.length && <div className="rule-overrides-empty"><GitBranch size={20} /><p>No overrides yet. Add one only when a condition changes the base recommendation.</p></div>}
            </div>
            <button type="button" className="button-secondary button-full" onClick={addRule}><Plus size={15} /> Add conditional override</button>
          </aside>

          {selectedRule ? (
            <div className="rule-override-editor">
              <div className="rule-override-title-row"><div><span className="section-kicker">OVERRIDE EDITOR</span><h3>Edit conditional override</h3></div><button type="button" className="button-danger button-compact" onClick={deleteRule}><Trash2 size={14} /> Delete rule</button></div>
              <div className="rule-override-meta-grid">
                <label className="field-label">Rule name<input value={selectedRule.name} onChange={(event) => patchSelectedRule((rule) => ({ ...rule, name: event.target.value }))} placeholder="e.g. Fine Motion LB2 to LB3" maxLength={100} /></label>
                <label className="field-label">Priority (higher wins ties)<input type="number" value={selectedRule.priority ?? 0} onChange={(event) => patchSelectedRule((rule) => ({ ...rule, priority: Number(event.target.value || 0) }))} /></label>
                <label className="rule-override-active-check"><input type="checkbox" checked={selectedRule.enabled !== false} onChange={(event) => patchSelectedRule((rule) => ({ ...rule, enabled: event.target.checked }))} /><span><strong>Rule enabled</strong><small>Disabled rules are skipped.</small></span></label>
              </div>
              <div className="rule-condition-block"><div className="rule-condition-heading"><div><span className="section-kicker">MATCH CONDITIONS</span><h4>Core Card levels</h4><p>Choose one exact level, a preset range (such as Not owned – LB1), or a custom set for each Core Card. Leave unrelated cards on Any. Every selected card condition must match for the rule to apply.</p></div></div>
                <div className="rule-condition-grid">{coreCards.map((card) => <ConditionSelector key={card.id} card={card} value={selectedRule.conditions?.[card.id] ?? "any"} onChange={(value) => patchSelectedRule((rule) => ({ ...rule, conditions: { ...(rule.conditions || {}), [card.id]: value } }))} />)}</div>
                {coreCards.every((card) => conditionIsAny(selectedRule.conditions?.[card.id])) && <p className="rule-condition-warning">This rule matches every six-card combination. Consider putting general recommendations in Base Recommendations instead.</p>}
              </div>
              <div className="rule-override-output"><div><span className="section-kicker">CONDITIONAL OUTPUT</span><h4>What changes when this rule matches?</h4><p>Merge adds cards or updates an existing base card by ID. Exclude removes a base card from the selected category. Replace swaps the whole category list for this rule.</p></div>
                <div className="recommendation-category-tabs rule-category-tabs">{CATEGORY_TABS.map((category) => { const action = selectedRule.actions?.[category.id] || {}; return <button type="button" key={category.id} className={activeCategory === category.id ? "active" : ""} onClick={() => setActiveCategory(category.id)}>{category.id !== "universal" && <RunningStyleLogo styleId={category.id} className="recommendation-category-tab-logo" />}<span className="recommendation-category-tab-label">{category.label}</span><span className="recommendation-category-count">{action.recommendations?.length || 0}</span></button>; })}</div>
                <div className="rule-category-action-settings"><label className="rule-override-active-check"><input type="checkbox" checked={activeAction.enabled === true} onChange={(event) => patchSelectedRule((rule) => ({ ...rule, actions: { ...(rule.actions || {}), [activeCategory]: { ...(rule.actions?.[activeCategory] || { mode: "merge", recommendations: [] }), enabled: event.target.checked } } }))} /><span><strong>Apply this rule to {CATEGORY_TABS.find((category) => category.id === activeCategory)?.label}</strong><small>Turn this off if the rule should not change this category.</small></span></label>
                  <label className="field-label">When this category is affected<select value={activeAction.mode || "merge"} onChange={(event) => patchSelectedRule((rule) => ({ ...rule, actions: { ...(rule.actions || {}), [activeCategory]: { ...(rule.actions?.[activeCategory] || { enabled: false, recommendations: [] }), mode: event.target.value, recommendations: event.target.value === "replace" ? (rule.actions?.[activeCategory]?.recommendations || []).map(({ action, ...item }) => item) : (rule.actions?.[activeCategory]?.recommendations || []) } } }))}><option value="merge">Merge with base recommendations</option><option value="replace">Replace entire category</option></select></label>
                </div>
                <RecommendationPicker cards={cards} search={newRecSearch} setSearch={setNewRecSearch} selectedId={newRecCardId} setSelectedId={setNewRecCardId} selectedCard={selectedCard} filteredCards={filteredCards} onAdd={addRecommendation} activeItems={activeItems} />
                <RecommendationItemList items={activeItems} cards={cards} isOverride onUpdate={updateItem} onMove={moveItem} onRemove={removeItem} mode={activeAction.mode || "merge"} />
              </div>
            </div>
          ) : (
            <div className="rule-overrides-empty rule-overrides-empty-main"><GitBranch size={28} /><h3>Select or create an override</h3><p>Overrides are only for exceptions. A rule can match one Core Card or all six, while the base remains the default for everything else.</p><button type="button" className="button-primary" onClick={addRule}><Plus size={16} /> Create first override</button></div>
          )}
        </div>
      )}
    </section>
  );
}

function RecommendationPicker({ cards, search, setSearch, selectedId, setSelectedId, selectedCard, filteredCards, onAdd, activeItems }) {
  return (
    <div className="add-recommendation-picker rule-card-picker">
      <label className="field-label">Find any support card in the catalog<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setSelectedId(""); }} placeholder="Type a card name, support type, rarity, or ID…" autoComplete="off" /></label>
      {selectedCard && <div className="picker-selected"><CardImage card={selectedCard} className="picker-selected-image" /><div><strong>{selectedCard.name}</strong><span>{selectedCard.type || "Support"} · {selectedCard.rarity || "SSR"}</span></div><button type="button" className="button-primary" onClick={onAdd} disabled={activeItems.some((item) => String(item.cardId) === String(selectedCard.id))}><Plus size={16} /> Add card</button></div>}
      {search.trim() && <div className="card-search-results" role="listbox" aria-label="Matching support cards">{filteredCards.slice(0, 12).map((card) => <button type="button" role="option" aria-selected={String(card.id) === String(selectedId)} className={`card-search-result ${String(card.id) === String(selectedId) ? "selected" : ""}`} key={card.id} onClick={() => setSelectedId(String(card.id))}><CardImage card={card} className="card-search-result-image" /><span className="card-search-result-copy"><strong>{card.name}</strong><small>{card.type || "Support"}{card.rarity ? ` · ${card.rarity}` : ""}</small></span><span className="card-search-result-id">{card.gameCardId || card.id}</span></button>)}{filteredCards.length === 0 && <p className="card-search-no-results">No cards match “{search}”.</p>}{filteredCards.length > 12 && <p className="card-search-limit">Showing 12 of {filteredCards.length} matches. Refine your search.</p>}</div>}
      {!search.trim() && !selectedCard && <p className="field-hint">{cards.length} support cards available. Search the catalog to add a recommendation.</p>}
    </div>
  );
}

function RecommendationItemList({ items, cards, isOverride, onUpdate, onMove, onRemove, mode = "merge" }) {
  if (!items.length) return <div className="recommendation-editor-empty"><Layers size={22} /><strong>No recommendations configured</strong><p>{isOverride ? "Add a card to the rule, update a base recommendation, or exclude a base card." : "Add the reusable base recommendations for this category."}</p></div>;
  return <div className="recommendation-editor-list rule-recommendation-list">{items.map((rawItem, index) => {
    const item = itemForDisplay(rawItem, index);
    const card = cards.find((candidate) => String(candidate.id) === item.cardId);
    if (!card) return <div className="notice notice-error" key={`missing-${item._key}`}>Missing catalog card ID: {item.cardId}</div>;
    const removing = isOverride && mode === "merge" && item.action === "remove";
    return <article className={`recommendation-editor-item ${removing ? "rule-item-remove" : ""}`} key={item._key}>
      <div className="rec-order-controls"><button type="button" className="icon-button" title="Move up" aria-label={`Move ${card.name} up`} disabled={index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={14} /></button><span>{index + 1}</span><button type="button" className="icon-button" title="Move down" aria-label={`Move ${card.name} down`} disabled={index === items.length - 1} onClick={() => onMove(index, 1)}><ArrowDown size={14} /></button></div>
      <CardImage card={card} className="recommendation-editor-image" />
      <div className="recommendation-editor-fields"><div className="rec-title-row"><div><strong>{card.name}</strong><small>{card.type || "Support Card"}</small></div><button type="button" className="icon-button icon-button-danger" title="Remove item" aria-label={`Remove ${card.name}`} onClick={() => onRemove(index)}><X size={16} /></button></div>
        {isOverride && mode === "merge" && <label className="field-label">Effect<select value={item.action} onChange={(event) => onUpdate(index, { action: event.target.value })}><option value="add">Add / update this card</option><option value="remove">Exclude this card from results</option></select></label>}
        {!removing && <><label className="field-label">Recommendation status<select value={item.status} onChange={(event) => onUpdate(index, { status: event.target.value })}><option value="recommended">Recommended</option><option value="alternative">Alternative</option></select></label><label className="field-label">Optional note<input value={item.note} onChange={(event) => onUpdate(index, { note: event.target.value })} placeholder={isOverride ? "Example: warning for this exact condition…" : "Example: exchange for LB3, useful for…"} /></label></>}
      </div>
    </article>;
  })}</div>;
}
