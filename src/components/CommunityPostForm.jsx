import { useMemo, useState } from "react";
import { ChevronDown, Plus, Search, Trash2, Save, X } from "lucide-react";
import CardImage from "./CardImage";
import { RECOMMENDATION_CATEGORIES } from "../lib/scenarioEngine";

const CATEGORY_LABELS = Object.fromEntries(RECOMMENDATION_CATEGORIES.map((category) => [category.id, category.label]));

function flattenRecommendations(recommendations) {
  return Object.entries(recommendations || {}).flatMap(([category, items]) =>
    (Array.isArray(items) ? items : []).map((item) => ({
      category,
      cardId: String(item.cardId || ""),
      status: item.status === "alternative" ? "alternative" : "recommended",
      note: item.note || "",
    })),
  );
}

function SupportCardPicker({ cards, value, onChange, rowIndex }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = cards.find((card) => String(card.id) === String(value));
  const filteredCards = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter((card) => `${card.name || ""} ${card.type || ""}`.toLowerCase().includes(term));
  }, [cards, search]);

  function choose(card) {
    onChange(String(card.id));
    setOpen(false);
    setSearch("");
  }

  return (
    <div className="community-field community-card-picker-field">
      <span>Support card</span>
      <button
        type="button"
        className={`community-card-picker-toggle ${selected ? "has-selection" : ""}`}
        aria-expanded={open}
        aria-controls={`community-card-picker-${rowIndex}`}
        onClick={() => setOpen((current) => !current)}
      >
        {selected ? <CardImage card={selected} className="community-card-picker-image" /> : <span className="community-card-picker-placeholder">?</span>}
        <span className="community-card-picker-selected-name">{selected?.name || "Select a card"}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="community-card-picker-menu" id={`community-card-picker-${rowIndex}`}>
          <label className="community-card-picker-search">
            <Search size={14} />
            <input autoFocus value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards by name or type…" aria-label="Search support cards" />
          </label>
          <div className="community-card-picker-options" role="listbox" aria-label="Support cards">
            {filteredCards.map((card) => {
              const isSelected = String(card.id) === String(value);
              return (
                <button type="button" role="option" aria-selected={isSelected} className={`community-card-picker-option ${isSelected ? "is-selected" : ""}`} key={card.id} onClick={() => choose(card)}>
                  <CardImage card={card} className="community-card-picker-option-image" />
                  <span className="community-card-picker-option-copy">
                    <strong>{card.name}</strong>
                    <small>{card.type || "Support Card"}</small>
                  </span>
                  {isSelected && <span className="community-card-picker-selected-mark">Selected</span>}
                </button>
              );
            })}
            {!filteredCards.length && <p className="community-card-picker-empty">No cards match your search.</p>}
          </div>
        </div>
      )}
      <input type="hidden" name={`support-card-${rowIndex}`} value={value} required />
    </div>
  );
}

export default function CommunityPostForm({ cards, coreCards, levels, initialPost, busy, error, onCancel, onSubmit }) {
  const sourceLevels = initialPost?.card_levels || levels;
  const [title, setTitle] = useState(initialPost?.title || "");
  const [body, setBody] = useState(initialPost?.body || "");
  const [items, setItems] = useState(() => {
    const saved = initialPost ? flattenRecommendations(initialPost.recommendations) : [];
    return saved.length ? saved : [{ category: "universal", cardId: "", status: "recommended", note: "" }];
  });
  const [formError, setFormError] = useState("");

  function updateItem(index, key, value) {
    setItems((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, [key]: value } : item)));
  }

  function addItem() {
    setItems((current) => (current.length >= 20 ? current : [...current, { category: "universal", cardId: "", status: "recommended", note: "" }]));
  }

  function removeItem(index) {
    setItems((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  async function submit(event) {
    event.preventDefault();
    setFormError("");
    const validItems = items.filter((item) => item.cardId);
    if (!validItems.length) {
      setFormError("Add at least one recommended card.");
      return;
    }
    const recommendations = { universal: [], fr: [], pc: [], ls: [], ec: [] };
    validItems.forEach(({ category, cardId, status, note }) => {
      recommendations[category].push({ cardId: String(cardId), status, ...(note.trim() ? { note: note.trim() } : {}) });
    });
    if (title.trim().length < 5) {
      setFormError("The title must be at least 5 characters long.");
      return;
    }
    if (!body.trim()) {
      setFormError("Please explain the reasoning behind this recommendation.");
      return;
    }
    try {
      await onSubmit({
        title: title.trim(),
        body: body.trim(),
        card_levels: sourceLevels,
        recommendations,
      });
    } catch {
      // Parent renders the persistent submission error.
    }
  }

  return (
    <form className="community-post-form" onSubmit={submit}>
      <div className="community-form-heading">
        <div>
          <span className="community-kicker">{initialPost ? "EDIT SUBMISSION" : "SHARE WITH PLAYERS"}</span>
          <h3>{initialPost ? "Edit recommendation" : "Share a recommendation"}</h3>
          <p>{initialPost ? "Your changes will be saved to the existing post." : "Your recommendation will be published as soon as it is saved."}</p>
        </div>
        <button className="community-icon-button" type="button" onClick={onCancel} aria-label="Close form">
          <X size={17} />
        </button>
      </div>
      <label className="community-field">
        Recommendation title
        <input value={title} onChange={(event) => setTitle(event.target.value)} minLength={5} maxLength={80} required placeholder="Example: Fine Motion is worth exchanging for at LB3" />
      </label>
      <label className="community-field">
        Reasoning and context
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          maxLength={1200}
          rows={4}
          required
          placeholder="Explain which account conditions this recommendation is suitable for and why…"
        />
      </label>
      <div className="community-form-subheading">
        <div>
          <strong>Support card recommendations</strong>
          <p>Choose cards by image or name. Add alternatives if needed.</p>
        </div>
        <button className="community-button community-button-muted" type="button" onClick={addItem} disabled={items.length >= 20}>
          <Plus size={15} /> Add card {items.length >= 20 ? "(20/20)" : ""}
        </button>
      </div>
      {items.length >= 20 && <p className="community-form-limit">You can add up to 20 recommended cards per post.</p>}
      <div className="community-form-card-list">
        {items.map((item, index) => (
          <div className="community-form-card-row" key={index}>
            <label className="community-field">
              Category
              <select value={item.category} onChange={(event) => updateItem(index, "category", event.target.value)}>
                {RECOMMENDATION_CATEGORIES.map((category) => (
                  <option key={category.id} value={category.id}>
                    {CATEGORY_LABELS[category.id]}
                  </option>
                ))}
              </select>
            </label>
            <SupportCardPicker cards={cards} value={item.cardId} rowIndex={index} onChange={(value) => updateItem(index, "cardId", value)} />
            <label className="community-field">
              Type
              <select value={item.status} onChange={(event) => updateItem(index, "status", event.target.value)}>
                <option value="recommended">Recommended</option>
                <option value="alternative">Alternative</option>
              </select>
            </label>
            <label className="community-field">
              Note (optional)
              <input value={item.note} onChange={(event) => updateItem(index, "note", event.target.value)} maxLength={180} placeholder="Use case or limitations" />
            </label>
            <button className="community-icon-button community-remove-card" type="button" onClick={() => removeItem(index)} disabled={items.length === 1} aria-label={`Remove card ${index + 1}`}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="community-loadout-note" aria-label="Core card snapshot">
        <strong>Core card LB's</strong>
        <div className="community-snapshot-grid community-snapshot-form-grid">
          {coreCards.map((card) => (
            <div className="community-snapshot-item" key={card.id} title={`${card.name}: ${formatLevel(sourceLevels?.[card.id])}`}>
              <CardImage card={card} className="community-snapshot-image" />
              <span className="community-snapshot-copy">
                <small>{card.name}</small>
                <strong>{formatLevel(sourceLevels?.[card.id])}</strong>
              </span>
            </div>
          ))}
          {!coreCards.length && <small className="community-snapshot-empty">Core card data unavailable.</small>}
        </div>
      </div>
      {(formError || error) && (
        <p className="community-form-error" role="alert">
          {formError || error}
        </p>
      )}
      <div className="community-form-actions">
        <button className="community-button community-button-muted" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="community-button community-button-primary" type="submit" disabled={busy}>
          <Save size={15} />
          {busy ? "Saving…" : initialPost ? "Save changes" : "Publish recommendation"}
        </button>
      </div>
    </form>
  );
}

function formatLevel(value) {
  const level = Number(value);
  if (value === undefined || value === null || value === "") return "—";
  if (level === -1) return "Not owned";
  return Number.isInteger(level) ? `LB${level}` : "—";
}
