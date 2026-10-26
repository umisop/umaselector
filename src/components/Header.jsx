import { ShieldCheck, Users } from "lucide-react";

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
        <span className="header-note"></span>
        <a className="header-community-link" href="/#community">
          <Users size={14} /> Community
        </a>
        <a className="header-admin-link" href="/admin">
          <ShieldCheck size={14} /> Creator
        </a>
      </div>
    </header>
  );
}
