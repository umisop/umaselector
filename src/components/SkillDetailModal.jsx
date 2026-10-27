import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, LoaderCircle, X, Zap } from "lucide-react";
import { getSkillDetail } from "../lib/skillReference";

function Meta({ label, children }) {
  if (children === undefined || children === null || children === "") return null;
  return <div className="skill-modal-meta"><span>{label}</span><strong>{children}</strong></div>;
}

export default function SkillDetailModal({ skillId, fallbackName, activationExplanation, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showTechnical, setShowTechnical] = useState(false);

  useEffect(() => {
    if (!skillId) return undefined;
    let active = true;
    setLoading(true); setError(""); setDetail(null);
    getSkillDetail(skillId, { name: fallbackName, id: skillId })
      .then((value) => { if (active) setDetail(value); })
      .catch((reason) => { if (active) setError(reason.message || "Skill details are unavailable right now."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [skillId, fallbackName]);

  useEffect(() => {
    if (!skillId) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKey(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleKey);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener("keydown", handleKey); };
  }, [skillId, onClose]);

  if (!skillId) return null;
  const title = detail?.name || fallbackName || `Skill ${skillId}`;
  const condition = String(activationExplanation || "").trim() || detail?.activationSummary;
  const sourceUrl = detail?.sourceUrl || `https://www.mihonostudios.com/database/skills/${encodeURIComponent(skillId)}`;

  return (
    <div className="skill-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="skill-modal" role="dialog" aria-modal="true" aria-labelledby="skill-modal-title">
        <header className="skill-modal-header">
          {detail?.iconUrl ? <img className="skill-modal-icon" src={detail.iconUrl} alt="" loading="lazy" referrerPolicy="strict-origin-when-cross-origin" /> : <span className="skill-modal-icon skill-modal-icon-fallback"><Zap size={22} /></span>}
          <div className="skill-modal-heading"><h2 id="skill-modal-title">{title}</h2><p>{[detail?.type, detail?.rarity].filter(Boolean).join(" · ") || "Skill details"}</p></div>
          <button className="skill-modal-close" type="button" aria-label="Close skill details" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="skill-modal-content">
          {loading && <div className="skill-modal-state"><LoaderCircle className="skill-modal-spinner" size={18} /> Loading skill data…</div>}
          {error && <div className="skill-modal-error"><AlertCircle size={16} /><span>{error} You can still open the reference page below.</span></div>}
          {!loading && detail?.description && <section className="skill-modal-section"><h3>Description</h3><p>{detail.description}</p></section>}
          {(condition || loading) && <section className="skill-modal-section"><h3>Activation condition</h3><p>{condition || "Loading the reference condition…"}</p></section>}
          {!activationExplanation && !loading && detail?.activationSummary && <p className="skill-modal-source-note">Summary from the reference database; technical terms may be abbreviated.</p>}
          {!loading && detail?.effect && <section className="skill-modal-section"><h3>Effect</h3><p>{detail.effect}</p></section>}
          {!loading && <div className="skill-modal-meta-grid"><Meta label="Duration">{detail?.duration}</Meta><Meta label="SP cost">{detail?.spCost}</Meta><Meta label="Wit check">{detail?.witCheck}</Meta></div>}
          {!loading && detail?.technicalCondition && <div className="skill-modal-technical"><button type="button" aria-expanded={showTechnical} onClick={() => setShowTechnical((value) => !value)}>{showTechnical ? "Hide technical condition" : "Show technical condition"}<span>{showTechnical ? "−" : "+"}</span></button>{showTechnical && <code>{detail.technicalCondition}</code>}</div>}
        </div>
        <footer className="skill-modal-footer"><span>Reference: Uma Musume Hub</span><a href={sourceUrl} target="_blank" rel="noopener noreferrer">Open source <ExternalLink size={13} /></a></footer>
      </section>
    </div>
  );
}
