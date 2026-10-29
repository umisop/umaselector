import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, ChevronDown, ChevronUp, ExternalLink, GitCompare, LoaderCircle, Search, X } from "lucide-react";
import CardImage from "./CardImage";
import {
  calculateTraining,
  getComparisonEffectEntries,
  hasFacilityLevelScaledUniquePassive,
  DEFAULT_COMPARE_DECK_COMPOSITION,
  getCardTrainingLevel,
  loadSupportCardCatalog,
  MOODS,
  SCENARIO_CONFIG,
  TRAINING_TYPES,
  canonicalSupportEffectKey,
} from "../lib/supportCardCompare";

const STAT_ORDER = ["Speed", "Stamina", "Power", "Guts", "Wit", "Skill Points"];
const STAT_SHORT = { Speed: "Spd", Stamina: "Sta", Power: "Pow", Guts: "Guts", Wit: "Wit", "Skill Points": "SP" };
const LB_LABELS = ["LB0", "LB1", "LB2", "LB3", "LB4 / MLB"];
const EFFECT_PRIORITY = [
  "Friendship Bonus",
  "Training Effectiveness",
  "Mood Effect",
  "Specialty Priority",
  "Race Bonus",
  "Fan Bonus",
  "Hint Levels",
  "Hint Frequency",
  "Initial Friendship Gauge",
  "Initial Skill Points",
  "Wit Friendship Recovery",
  "Special: All Stats Training Bonus",
  "Initial Speed",
  "Initial Stamina",
  "Initial Power",
  "Initial Guts",
  "Initial Wit",
  "Speed Bonus",
  "Stamina Bonus",
  "Power Bonus",
  "Guts Bonus",
  "Wit Bonus",
  "Skill Point Bonus",
];
const EFFECT_GROUPS = [
  { id: "support", label: "SUPPORT EFFECTS", test: (name) => !/^Initial (Speed|Stamina|Power|Guts|Wit)$/i.test(name) && !/^(Speed|Stamina|Power|Guts|Wit|Skill Point) Bonus$/i.test(name) },
  { id: "initial", label: "INITIAL STATS", test: (name) => /^Initial (Speed|Stamina|Power|Guts|Wit)$/i.test(name) },
  { id: "bonuses", label: "STAT BONUSES", test: (name) => /^(Speed|Stamina|Power|Guts|Wit|Skill Point) Bonus$/i.test(name) },
];

function normalizeSlot(slot) {
  return {
    id: slot?.id ? String(slot.id) : "",
    lb: slot?.id ? Math.max(0, Math.min(4, Number(slot.lb) || 0)) : 4,
    // Every selected support card gets its own passive switch. Default ON to
    // preserve the reference calculator behavior; OFF excludes all unique
    // passive contributions for that slot only.
    uniquePassiveEnabled: slot?.uniquePassiveEnabled !== false,
  };
}

function MiniSelect({ label, value, onChange, children, disabled = false }) {
  return (
    <label className={`compare-control${disabled ? " is-disabled" : ""}`}>
      <span>{label}</span>
      <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

function formatEffectValue(effect) {
  if (!effect || !Number.isFinite(Number(effect.value)) || Number(effect.value) === 0) return "—";
  const value = Number(effect.value);
  if (effect.symbol === "percent") return `${value}%`;
  if (effect.symbol === "level") return `+${value}`;
  if (/specialty priority/i.test(effect.name)) return String(value);
  if (/^(Initial |.* Bonus$|.* Recovery$|.* Reduction$)/i.test(effect.name)) return `${value > 0 ? "+" : ""}${value}`;
  return String(value);
}

function isPassiveEnabledForSlot(slot, card) {
  // Facility-level uniques are the explicit exception: they are calculated
  // automatically from the selected facility level and have no toggle.
  return Boolean(card && hasFacilityLevelScaledUniquePassive(card)) || slot?.uniquePassiveEnabled !== false;
}

function effectRowsForSlots(slots, cardsById, facilityLevel, mechanicsContext) {
  const slotMaps = slots.map((slot) => {
    const card = cardsById.get(String(slot.id));
    const entries = card ? getComparisonEffectEntries(card, slot.lb, facilityLevel, { ...mechanicsContext, uniquePassiveEnabled: isPassiveEnabledForSlot(slot, card) }) : [];
    return new Map(entries.map((effect) => [effect.key, effect]));
  });
  const names = new Map();
  slotMaps.forEach((map) => map.forEach((effect, key) => names.set(key, effect.name)));
  const sortedEntries = [...names.entries()].sort(([aKey, aName], [bKey, bName]) => {
    const ai = EFFECT_PRIORITY.findIndex((name) => canonicalSupportEffectKey(name) === aKey);
    const bi = EFFECT_PRIORITY.findIndex((name) => canonicalSupportEffectKey(name) === bKey);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    return aName.localeCompare(bName);
  });
  const groups = EFFECT_GROUPS.map((group) => ({
    ...group,
    rows: sortedEntries
      .filter(([, name]) => group.test(name))
      .map(([key, name]) => ({
        name,
        cells: slotMaps.map((map) => map.get(key) || null),
      })),
  })).filter((group) => group.rows.length);
  const assigned = new Set(groups.flatMap((group) => group.rows.map((row) => canonicalSupportEffectKey(row.name))));
  const otherRows = sortedEntries
    .filter(([key]) => !assigned.has(key))
    .map(([key, name]) => ({
      name,
      cells: slotMaps.map((map) => map.get(key) || null),
    }));
  if (otherRows.length) groups.push({ id: "other", label: "OTHER SUPPORT EFFECTS", rows: otherRows });
  return { groups, slotMaps };
}

function UniquePassiveToggle({ card, lb = 0, enabled, onChange, compact = false }) {
  const hasUnique = Boolean(card?.unique && Array.isArray(card.unique.effects) && card.unique.effects.length);
  const facilityScaled = hasFacilityLevelScaledUniquePassive(card);
  const uniqueLevel = Number(card?.unique?.level) || 0;
  const cardLevel = card ? getCardTrainingLevel(card, lb) : 0;
  const unlocked = Boolean(hasUnique && cardLevel >= uniqueLevel);
  const cardLevelText = card ? `Selected card level ${cardLevel}; unique unlocks at level ${uniqueLevel || "unknown"}${hasUnique && !unlocked ? " and is currently locked" : ""}` : "";
  const label = !hasUnique ? "No passive" : enabled ? "Passive ON" : "Passive OFF";
  if (facilityScaled)
    return (
      <span
        className={`compare-facility-passive-note${compact ? " is-compact" : ""}`}
        title="This unique passive scales automatically with the selected Facility Level; it is not controlled by the generic passive toggle."
      >
        <span className="compare-facility-passive-full">Facility-level passive</span>
        <span className="compare-facility-passive-short">Facility auto</span>
      </span>
    );
  return (
    <button
      type="button"
      className={`compare-unique-passive-toggle${enabled ? " is-on" : " is-off"}${compact ? " is-compact" : ""}${!hasUnique ? " is-empty" : ""}`}
      disabled={!hasUnique}
      aria-pressed={hasUnique ? enabled : undefined}
      aria-label={card ? `${label} for ${card.name}` : "Unique passive"}
      title={!hasUnique ? "This catalogue entry has no unique passive effect" : `${label}. ${cardLevelText}. Unique effect only applies after its unlock level.`}
      onClick={() => hasUnique && onChange(!enabled)}
    >
      <span>Passive</span>
      <strong>{hasUnique ? (enabled ? "ON" : "OFF") : "—"}</strong>
    </button>
  );
}

function CardImageButton({ card, index, onClick, compact = false }) {
  return (
    <button
      type="button"
      className={`compare-card-image-button${compact ? " is-compact" : ""}${card ? "" : " is-empty"}`}
      aria-label={card ? `Replace ${card.name} support card in slot ${index + 1}` : `Select a support card for slot ${index + 1}`}
      title={card ? `Click to replace ${card.name}` : "Click to select a support card"}
      onClick={onClick}
    >
      {card ? (
        <CardImage card={card} className="compare-matrix-card-image" />
      ) : (
        <span className="compare-image-placeholder">
          <Search size={compact ? 13 : 18} />
          <small>Select</small>
        </span>
      )}
    </button>
  );
}

function trainingStatEntries(output) {
  if (!output) return [];
  return STAT_ORDER.filter((name) => Number(output.stats?.[name]) > 0).map((name) => ({ name, short: STAT_SHORT[name], value: Number(output.stats[name]) }));
}

function TrainingCell({ card, output, facility }) {
  if (!card || !output) return <span className="compare-muted-cell">—</span>;
  const rainbow = Boolean(output.rainbow);
  const stats = trainingStatEntries(output);
  const energy = Number(output.energy) || 0;
  const energyLabel = energy > 0 ? `+${energy}` : String(energy);
  return (
    <div className={`compare-training-cell${rainbow ? " is-rainbow" : ""}`}>
      <span className={rainbow ? "compare-rainbow-mark" : "compare-training-mark"}>
        {rainbow ? "◆ Rainbow " : ""}
        {facility} Training
      </span>
      <div className="compare-training-stat-list">
        {stats.map((stat) => (
          <div className="compare-training-stat" key={stat.name}>
            <span>{stat.short}</span>
            <strong>+{stat.value}</strong>
          </div>
        ))}
        {!stats.length && <span className="compare-muted-cell">—</span>}
      </div>
      <span className="compare-training-energy" title={`Energy change ${energyLabel}; ${output.energyAfterFromFull}/${output.energyCap} remaining if starting at maximum energy`}>
        EN {energyLabel} · {output.energyAfterFromFull}/{output.energyCap}
      </span>
    </div>
  );
}

function getPrimaryFacility(card) {
  return card && TRAINING_TYPES.includes(card.type) ? card.type : "";
}

export default function CompareCardsModal({ initialSlots = [], onClose }) {
  const [catalogState, setCatalogState] = useState({ loading: true, cards: [], error: "" });
  const [slots, setSlots] = useState(() => Array.from({ length: 6 }, (_, index) => normalizeSlot(initialSlots[index])));
  // This comparison modal is intentionally locked to Grand Masters.
  const scenario = "grand-masters";
  const [facilityLevel, setFacilityLevel] = useState("5");
  // Keep the reference-style energy baseline fixed at 120. Some unique passives
  // (e.g. Max Energy scaling) depend on this value, so it remains in the
  // calculator even though the UI no longer exposes a selector.
  const maxEnergy = 120;
  const [mood, setMood] = useState("0.2");
  const [activePicker, setActivePicker] = useState(-1);
  const [search, setSearch] = useState("");
  const [showOtherTrainings, setShowOtherTrainings] = useState(false);

  useEffect(() => {
    let active = true;
    loadSupportCardCatalog()
      .then((payload) => {
        if (active) setCatalogState({ loading: false, cards: payload.cards, error: "" });
      })
      .catch((error) => {
        if (active) setCatalogState({ loading: false, cards: [], error: error?.message || "Could not load the Global support-card catalog." });
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        if (activePicker >= 0) setActivePicker(-1);
        else onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activePicker, onClose]);

  const cardsById = useMemo(() => new Map(catalogState.cards.map((card) => [String(card.id), card])), [catalogState.cards]);
  const filteredCards = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return catalogState.cards.filter((card) => !query || `${card.name} ${card.type} ${card.rarity} ${card.id}`.toLocaleLowerCase().includes(query));
  }, [catalogState.cards, search]);
  const normalizedMood = Number(mood);
  const scenarioInfo = SCENARIO_CONFIG.scenarios.find((item) => item.id === scenario) || SCENARIO_CONFIG.scenarios[0];
  const scenarioLabel = scenarioInfo?.label || "Training";
  // Match the reference comparison defaults: friendship/rainbow training is
  // assumed (bond 100) and one support card is present at a time.
  const mechanicsContext = useMemo(
    () => ({
      // Reference-style baseline: one other card of each training type. This
      // lets Highlander and per-type deck uniques resolve without a 5-card form.
      deckComposition: DEFAULT_COMPARE_DECK_COMPOSITION,
      supportCardsAtTraining: 1,
      totalBond: 600,
      // Unset fan, friendship-history and skill-history values resolve to their
      // documented cap in this reference-style comparison preset.
      currentEnergy: Number(maxEnergy),
      maxEnergy: Number(maxEnergy),
      totalFacilityLevel: Number(facilityLevel) * 5,
    }),
    [maxEnergy, facilityLevel],
  );
  const outputs = useMemo(
    () =>
      slots.map((slot) => {
        const card = cardsById.get(String(slot.id));
        return card
          ? calculateTraining(card, slot.lb, scenario, Number(facilityLevel), normalizedMood, Number(maxEnergy), 100, {
              ...mechanicsContext,
              uniquePassiveEnabled: isPassiveEnabledForSlot(slot, card),
            })
          : null;
      }),
    [slots, cardsById, scenario, facilityLevel, normalizedMood, maxEnergy, mechanicsContext],
  );
  const effectData = useMemo(() => effectRowsForSlots(slots, cardsById, Number(facilityLevel), mechanicsContext), [slots, cardsById, facilityLevel, mechanicsContext]);

  function patchSlot(index, patch) {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? { ...slot, ...patch } : slot)));
  }
  function chooseCard(index, card) {
    setSlots((current) => current.map((slot, slotIndex) => (slotIndex === index ? { id: card.id, lb: Math.min(Number(slot.lb) || 0, 4), uniquePassiveEnabled: true } : slot)));
    setActivePicker(-1);
    setSearch("");
  }

  return (
    <div
      className="compare-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && activePicker < 0) onClose();
      }}
    >
      <section className="compare-modal compare-matrix-modal" role="dialog" aria-modal="true" aria-labelledby="compare-modal-title">
        <header className="compare-modal-header">
          <div className="compare-modal-title-mark">
            <GitCompare size={18} />
          </div>
          <div className="compare-modal-heading">
            <h2 id="compare-modal-title">Compare Support Cards</h2>
            <p>Compare up to six cards and calculate friendship training output</p>
          </div>
          <button type="button" className="compare-icon-button" aria-label="Close comparison" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <div className="compare-modal-content compare-matrix-content">
          <div className="compare-control-grid">
            <MiniSelect label="Scenario" value="grand-masters" disabled onChange={() => {}}>
              <option value="grand-masters">Grand Masters</option>
            </MiniSelect>
            <MiniSelect label="Facility level" value={facilityLevel} onChange={setFacilityLevel}>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>
                  Level {level}
                </option>
              ))}
            </MiniSelect>
            <MiniSelect label="Mood" value={mood} onChange={setMood}>
              {MOODS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </MiniSelect>
          </div>

          <div className="compare-section-heading">
            <div>
              <h3>Support card comparison</h3>
              <p>Click a card image to replace it. Set its Limit Break below the card.</p>
            </div>
            <span>{slots.filter((slot) => slot.id).length}/6 cards</span>
          </div>
          {catalogState.loading && (
            <div className="compare-state">
              <LoaderCircle size={18} className="compare-spinner" /> Loading Global support-card catalogue…
            </div>
          )}
          {catalogState.error && (
            <div className="compare-state compare-state-error">
              <AlertCircle size={17} />
              <div>
                <strong>Catalogue unavailable</strong>
                <p>{catalogState.error}</p>
                <button
                  type="button"
                  onClick={() => {
                    setCatalogState({ loading: true, cards: [], error: "" });
                    loadSupportCardCatalog({ force: true })
                      .then((payload) => setCatalogState({ loading: false, cards: payload.cards, error: "" }))
                      .catch((error) => setCatalogState({ loading: false, cards: [], error: error?.message || "Could not load catalog." }));
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          )}

          {!catalogState.error && (
            <div className="compare-matrix-desktop">
              <div className="compare-matrix-scroll" aria-label="Support card effect comparison table">
                <table className="compare-matrix">
                  <colgroup>
                    <col className="compare-row-label-col" />
                    {slots.map((slot, index) => (
                      <col key={index} className="compare-card-col" />
                    ))}
                  </colgroup>
                  <thead>
                    <tr className="compare-matrix-card-row">
                      <th scope="col" className="compare-sticky-label compare-card-stats-heading">
                        Cards / LB
                      </th>
                      {slots.map((slot, index) => {
                        const card = cardsById.get(String(slot.id));
                        const cardLevel = card ? getCardTrainingLevel(card, slot.lb) : 0;
                        return (
                          <th scope="col" key={`card-head-${index}`} className="compare-matrix-card-head">
                            <span className="compare-col-number">{String(index + 1).padStart(2, "0")}</span>
                            {card ? (
                              <>
                                <CardImageButton
                                  card={card}
                                  index={index}
                                  onClick={() => {
                                    setActivePicker(index);
                                    setSearch("");
                                  }}
                                />
                                <strong className="compare-matrix-card-name">{card.name}</strong>
                                <span className="compare-matrix-card-meta">
                                  {card.type} · {card.rarity}
                                </span>
                                <span className="compare-matrix-card-level">Lv {cardLevel}</span>
                                <MiniSelect label="Limit break" value={String(slot.lb)} onChange={(value) => patchSlot(index, { lb: Number(value) })}>
                                  {[0, 1, 2, 3, 4].map((lb) => (
                                    <option value={lb} key={lb}>
                                      {LB_LABELS[lb]}
                                    </option>
                                  ))}
                                </MiniSelect>
                                <UniquePassiveToggle
                                  card={card}
                                  lb={slot.lb}
                                  enabled={slot.uniquePassiveEnabled !== false}
                                  onChange={(enabled) => patchSlot(index, { uniquePassiveEnabled: enabled })}
                                />
                              </>
                            ) : (
                              <CardImageButton
                                card={null}
                                index={index}
                                onClick={() => {
                                  setActivePicker(index);
                                  setSearch("");
                                }}
                              />
                            )}
                            <div className="compare-matrix-card-actions">
                              {card && (
                                <button type="button" className="compare-remove-button" aria-label={`Remove ${card.name}`} onClick={() => patchSlot(index, { id: "" })}>
                                  <X size={12} />
                                </button>
                              )}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {effectData.groups.map((group) => (
                      <EffectTableGroup key={group.id} group={group} />
                    ))}
                    <tr className="compare-matrix-group-row">
                      <th colSpan={7} className="compare-matrix-section-title">
                        {scenarioLabel.toUpperCase()} TRAINING RESULT
                      </th>
                    </tr>
                    <tr className="compare-primary-training-row">
                      <th scope="row" className="compare-sticky-label">
                        Matching training
                      </th>
                      {slots.map((slot, index) => {
                        const card = cardsById.get(String(slot.id));
                        const facility = getPrimaryFacility(card);
                        const output = facility ? outputs[index]?.[facility] : null;
                        return (
                          <td key={`primary-${index}`}>
                            {card ? (
                              facility ? (
                                <TrainingCell card={card} output={output} facility={facility} />
                              ) : (
                                <span className="compare-no-specialty">No preferred facility. Expand below.</span>
                              )
                            ) : (
                              <span className="compare-muted-cell">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {showOtherTrainings &&
                      TRAINING_TYPES.map((facility) => (
                        <tr key={`other-${facility}`}>
                          <th scope="row" className="compare-sticky-label">
                            {facility} training
                          </th>
                          {slots.map((slot, index) => {
                            const card = cardsById.get(String(slot.id));
                            const primary = getPrimaryFacility(card);
                            if (!card)
                              return (
                                <td key={`${facility}-${index}`}>
                                  <span className="compare-muted-cell">—</span>
                                </td>
                              );
                            if (primary === facility)
                              return (
                                <td key={`${facility}-${index}`}>
                                  <span className="compare-already-shown">Shown above</span>
                                </td>
                              );
                            return (
                              <td key={`${facility}-${index}`}>
                                <TrainingCell card={card} output={outputs[index]?.[facility]} facility={facility} />
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {!catalogState.error && (
            <div className="compare-mobile-cards">
              {slots.map((slot, index) => {
                const card = cardsById.get(String(slot.id));
                const cardLevel = card ? getCardTrainingLevel(card, slot.lb) : 0;
                const primary = getPrimaryFacility(card);
                return (
                  <article className="compare-mobile-card" key={`mobile-card-${index}`}>
                    <div className="compare-mobile-card-head">
                      <span className="compare-mobile-card-number">{String(index + 1).padStart(2, "0")}</span>
                      <CardImageButton
                        card={card}
                        index={index}
                        compact
                        onClick={() => {
                          setActivePicker(index);
                          setSearch("");
                        }}
                      />
                      <div className="compare-mobile-card-title">
                        <strong>{card?.name || "Empty card slot"}</strong>
                        <span>{card ? `${card.type} · ${card.rarity} · Lv ${cardLevel}` : "Choose a Global support card"}</span>
                        <div className="compare-mobile-card-actions">
                          {card && (
                            <button type="button" className="compare-remove-button" aria-label={`Remove ${card.name}`} onClick={() => patchSlot(index, { id: "" })}>
                              <X size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                      {card && (
                        <label className="compare-mobile-lb">
                          <span>LB</span>
                          <select aria-label={`Limit break for ${card.name}`} value={String(slot.lb)} onChange={(event) => patchSlot(index, { lb: Number(event.target.value) })}>
                            {[0, 1, 2, 3, 4].map((lb) => (
                              <option key={lb} value={lb}>
                                {LB_LABELS[lb]}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {card && (
                        <div className="compare-mobile-passive-toggle">
                          <UniquePassiveToggle
                            compact
                            card={card}
                            lb={slot.lb}
                            enabled={slot.uniquePassiveEnabled !== false}
                            onChange={(enabled) => patchSlot(index, { uniquePassiveEnabled: enabled })}
                          />
                        </div>
                      )}
                    </div>
                    {card && (
                      <>
                        <div className="compare-mobile-section">
                          <h4>Support effects</h4>
                          {effectData.groups.map((group) => {
                            const rows = group.rows.filter((row) => row.cells[index]);
                            return rows.length ? (
                              <div className="compare-mobile-effect-group" key={`${group.id}-${index}`}>
                                <h5>{group.label}</h5>
                                {rows.map((row) => (
                                  <div className="compare-mobile-effect-row" key={row.name}>
                                    <span>{row.name}</span>
                                    <strong>{formatEffectValue(row.cells[index])}</strong>
                                  </div>
                                ))}
                              </div>
                            ) : null;
                          })}
                        </div>
                        <div className="compare-mobile-section compare-mobile-training-section">
                          <h4>{scenarioLabel} training result</h4>
                          {primary ? <TrainingCell card={card} output={outputs[index]?.[primary]} facility={primary} /> : <span className="compare-no-specialty">No preferred facility.</span>}
                          {showOtherTrainings &&
                            TRAINING_TYPES.filter((facility) => facility !== primary).map((facility) => (
                              <div className="compare-mobile-other-training" key={`${facility}-${index}`}>
                                <TrainingCell card={card} output={outputs[index]?.[facility]} facility={facility} />
                              </div>
                            ))}
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          {!catalogState.error && (
            <div className="compare-matrix-footer-row">
              <button type="button" className="compare-expand-button" onClick={() => setShowOtherTrainings((value) => !value)}>
                {showOtherTrainings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {showOtherTrainings ? "Hide other trainings" : "Show other trainings"}
              </button>
              <p className="compare-method-note">We apologize for any calculation inaccuracies. Please refer to uma.guide or Gamewith.jp for better training calculations.</p>
            </div>
          )}
        </div>

        <footer className="compare-modal-footer">
          <span>
            Global catalogue: {catalogState.cards.length || "—"} cards · Card data:{" "}
            <a href="https://github.com/daftuyda/UmaTools" target="_blank" rel="noreferrer">
              UmaTools <ExternalLink size={11} />
            </a>{" "}
            · Base training:{" "}
            <a href={scenarioInfo?.source || "https://gametora.vercel.app/umamusume/grand-masters"} target="_blank" rel="noreferrer">
              GameTora <ExternalLink size={11} />
            </a>{" "}
            · Reference:{" "}
            <a href="https://uma.guide/support-cards/compare" target="_blank" rel="noreferrer">
              UmaGuide <ExternalLink size={11} />
            </a>
          </span>
          <button type="button" className="compare-done-button" onClick={onClose}>
            Done
          </button>
        </footer>

        {activePicker >= 0 && (
          <div
            className="compare-picker-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setActivePicker(-1);
            }}
          >
            <section className="compare-picker" role="dialog" aria-modal="true" aria-labelledby="compare-picker-title">
              <header>
                <div>
                  <h3 id="compare-picker-title">Choose Global support card</h3>
                  <p>{catalogState.cards.length} cards in the catalogue</p>
                </div>
                <button type="button" className="compare-icon-button" aria-label="Close card picker" onClick={() => setActivePicker(-1)}>
                  <X size={17} />
                </button>
              </header>
              <label className="compare-search">
                <Search size={16} />
                <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, type, rarity, or ID" />
              </label>
              <div className="compare-picker-list">
                {filteredCards.map((card) => (
                  <button type="button" key={card.id} className="compare-picker-option" onClick={() => chooseCard(activePicker, card)}>
                    <CardImage card={card} className="compare-picker-image" />
                    <span>
                      <strong>{card.name}</strong>
                      <small>
                        {card.type} · {card.rarity} · ID {card.id}
                      </small>
                    </span>
                    {slots[activePicker]?.id === card.id && <Check size={16} />}
                  </button>
                ))}
                {filteredCards.length === 0 && <p className="compare-empty-search">No Global support cards match that search.</p>}
              </div>
            </section>
          </div>
        )}
      </section>
    </div>
  );
}

function EffectTableGroup({ group }) {
  return (
    <>
      <tr className="compare-matrix-group-row">
        <th colSpan={7} className="compare-matrix-section-title">
          {group.label}
        </th>
      </tr>
      {group.rows.map((row) => (
        <tr key={`${group.id}-${row.name}`}>
          <th scope="row" className="compare-sticky-label">
            {row.name}
          </th>
          {row.cells.map((effect, index) => (
            <td key={`${row.name}-${index}`} className={effect ? "compare-effect-value" : "compare-muted-cell"}>
              {effect ? formatEffectValue(effect) : "—"}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
