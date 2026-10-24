import { ShieldCheck } from "lucide-react";

export default function Header() {
  return (
    <header className="site-header">
      <a className="brand" href="/" aria-label="Card Exchange Selector home">
        <img className="site-logo" src="/assets/card-exchange-logo.png" alt="Card Exchange Selector logo" />
        <span className="brand-copy">
          <strong>SUPPORT CARD</strong>
          <small>SELECTOR</small>
        </span>
      </a>
      <div className="site-header-actions">
        <span className="header-note">
          <span className="status-dot" /> TOOL FOR UMA MUSUME PLAYERS
        </span>
        <a className="header-admin-link" href="/admin">
          <ShieldCheck size={14} /> Creator
        </a>
      </div>
    </header>
  );
}
