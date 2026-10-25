import { useEffect, useState } from "react";
import Header from "./components/Header";
import SelectorPage from "./pages/SelectorPage";
import AdminPage from "./pages/AdminPage";
import CommunityModerationPage from "./pages/CommunityModerationPage";
import ProfilePage from "./pages/ProfilePage";
import SiteInfoPage, { SITE_INFO_PATHS } from "./pages/SiteInfoPage";
import { getPublicConfig } from "./lib/catalog";
import { isSupabaseConfigured } from "./lib/supabase";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import "./styles.css";

function AdminSetupRequired() {
  return (
    <main className="admin-page">
      <section className="setup-panel" aria-labelledby="admin-setup-title">
        <a className="back-link" href="/">
          <ArrowLeft size={16} /> Back to selector
        </a>
        <div className="setup-icon">
          <ShieldAlert size={25} />
        </div>
        <span className="section-kicker">CREATOR WORKSPACE UNAVAILABLE</span>
        <h1 id="admin-setup-title">Dashboard not configured</h1>
        <a className="button-secondary" href="/">
          Return to public selector
        </a>
      </section>
    </main>
  );
}

export default function App() {
  const currentPath = window.location.pathname.replace(/\/$/, "") || "/";
  const isProfileRoute = currentPath === "/profile";
  const isCommunityModerationRoute = currentPath === "/admin/community";
  const isAnyAdminRoute = window.location.pathname.startsWith("/admin");
  const isSiteInfoRoute = SITE_INFO_PATHS.includes(currentPath);
  const isAdminRoute = isAnyAdminRoute && !isCommunityModerationRoute;
  const [config, setConfig] = useState({ cards: [], scenarios: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAnyAdminRoute || isSiteInfoRoute) return undefined;
    let active = true;
    getPublicConfig()
      .then((data) => {
        if (active) setConfig(data);
      })
      .catch((error) => console.error("Catalog load failed:", error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [isAnyAdminRoute, isSiteInfoRoute]);

  if (isSiteInfoRoute) {
    return <SiteInfoPage path={currentPath} />;
  }

  if (isProfileRoute) {
    return <ProfilePage config={config} />;
  }

  if (isCommunityModerationRoute) {
    if (import.meta.env.PROD && !isSupabaseConfigured) return <AdminSetupRequired />;
    return <CommunityModerationPage />;
  }

  if (isAdminRoute) {
    // Local browser preview is allowed only during development. In production, fail closed.
    if (import.meta.env.PROD && !isSupabaseConfigured) return <AdminSetupRequired />;
    return <AdminPage />;
  }

  return (
    <div className="app-root">
      <Header />
      <SelectorPage config={config} loading={loading} />
    </div>
  );
}
