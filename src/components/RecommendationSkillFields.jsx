import { useMemo, useState } from "react";
import { BookOpen, LoaderCircle, Plus, Search, X } from "lucide-react";
import { getCachedSkillIndex, getSkillIndex, SKILL_REFERENCE_HOME } from "../lib/skillReference";

export default function RecommendationSkillFields({ skills = [], onChange, skillOverrides = {}, onUpdateSkillOverride }) {
  const [query, setQuery] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [catalog, setCatalog] = useState(() => getCachedSkillIndex());
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [manualId, setManualId] = useState("");
  const selectedSkills = Array.isArray(skills) ? skills.filter((skill) => skill && skill.id !== undefined).map((skill) => ({ id: String(skill.id), name: String(skill.name || "") })) : [];
  const selectedIds = selectedSkills.map((skill) => skill.id);

  async function openPicker() {
    setShowPicker(true);
    if (catalog.length > 2) return;
    setLoading(true); setLoadError("");
    try { setCatalog(await getSkillIndex()); }
    catch (error) { setLoadError(error.message || "Could not load the skill list."); }
    finally { setLoading(false); }
  }
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return catalog.filter((skill) => skill.globalAvailable !== false && !selectedIds.includes(String(skill.id)) && skill.name.toLowerCase().includes(needle)).slice(0, 8);
  }, [catalog, query, selectedIds.join(",")]);
  function addSkill(skill) {
    if (!skill?.id || selectedIds.includes(String(skill.id))) return;
    onChange([...selectedSkills, { id: String(skill.id), name: String(skill.name || `Skill ID ${skill.id}`) }]);
    setQuery(""); setManualId("");
    setCatalog((current) => current.some((entry) => String(entry.id) === String(skill.id)) ? current : [...current, skill]);
  }
  function removeSkill(id) { onChange(selectedSkills.filter((current) => current.id !== String(id))); }

  return <div className="recommendation-skill-fields">
    <div className="recommendation-skill-field-head"><span className="field-label-static">Skills from reference database</span><button type="button" className="button-secondary button-compact" onClick={openPicker}><Plus size={13} /> Add skill</button></div>
    {selectedSkills.length > 0 ? <div className="assigned-skill-list">{selectedSkills.map((selected) => {
      const id = selected.id;
      const skill = catalog.find((item) => String(item.id) === id);
      const override = skillOverrides?.[id]?.activationExplanation || "";
      return <div className="assigned-skill-item" key={id}>
        <div className="assigned-skill-heading"><BookOpen size={14} /><strong>{skill?.name || selected.name || `Skill ID ${id}`}</strong><small>#{id}</small><button type="button" className="icon-button icon-button-danger" aria-label={`Remove ${selected.name || id}`} title="Remove skill" onClick={() => removeSkill(id)}><X size={14} /></button></div>
        <label className="field-label">Custom activation explanation <span className="field-hint-inline">(optional, applies wherever this skill is used)</span><textarea rows={2} value={override} onChange={(event) => onUpdateSkillOverride?.(id, event.target.value)} placeholder="Explain the activation condition in plain language…" /></label>
      </div>;
    })}</div> : <p className="field-hint">No skills linked. Add one to show its icon and details in the public selector. Existing notes are preserved; move any old LB/skill labels into the fields above, then edit the note into your own recommendation advice.</p>}
    {showPicker && <div className="skill-picker-panel">
      <div className="skill-picker-heading"><strong>Find a Global skill</strong><button type="button" className="icon-button" aria-label="Close skill picker" onClick={() => setShowPicker(false)}><X size={14} /></button></div>
      <label className="skill-search-input"><Search size={14} /><input autoFocus type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search skill name…" /></label>
      {loading && <p className="field-hint"><LoaderCircle size={13} className="skill-modal-spinner" /> Loading skill list…</p>}
      {loadError && <p className="skill-picker-error">{loadError}</p>}
      {query.trim() && matches.length > 0 && <div className="skill-picker-results" role="listbox" aria-label="Matching skills">{matches.map((skill) => <button type="button" role="option" aria-selected="false" key={skill.id} onClick={() => addSkill(skill)}><span><strong>{skill.name}</strong><small>Global · ID {skill.id}</small></span><Plus size={14} /></button>)}</div>}
      {query.trim() && !loading && !matches.length && <p className="field-hint">No matching Global skills in the loaded catalog.</p>}
      <div className="skill-picker-manual"><label className="field-label">Add by reference ID<input inputMode="numeric" value={manualId} onChange={(event) => setManualId(event.target.value.replace(/\D/g, "").slice(0, 8))} placeholder="Example: 200721" /></label><button type="button" className="button-secondary button-compact" disabled={!/^\d{4,8}$/.test(manualId) || selectedIds.includes(manualId)} onClick={() => addSkill(catalog.find((item) => String(item.id) === manualId) || { id: manualId, name: `Skill ID ${manualId}` })}>Add ID</button></div>
      <a className="skill-picker-reference-link" href={SKILL_REFERENCE_HOME} target="_blank" rel="noopener noreferrer">Browse reference database ↗</a>
    </div>}
  </div>;
}
