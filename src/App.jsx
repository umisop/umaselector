import { lazy, Suspense, useEffect, useState } from "react";
import Header from "./components/Header";
import SelectorPage from "./pages/SelectorPage";
import { getPublicConfig } from "./lib/catalog";
import { isSupabaseConfigured } from "./lib/supabaseConfig";
import { SITE_INFO_PATHS } from "./lib/siteInfoRoutes";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import "./styles.css";

// Route-level code splitting keeps admin, profile, moderation, and legal pages
// out of the initial selector bundle until the user opens them.
const AdminPage = lazy(() => import("./pages/AdminPage"));
const CommunityModerationPage = lazy(() => import("./pages/CommunityModerationPage"));
const ProfilePage = lazy(() => import("./pages/ProfilePage"));
const SiteInfoPage = lazy(() => import("./pages/SiteInfoPage"));

function RouteLoading() {
  return <div className="route-loading" role="status" aria-live="polite">Loading page…</div>;
}

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
    return <Suspense fallback={<RouteLoading />}><SiteInfoPage path={currentPath} /></Suspense>;
  }

  if (isProfileRoute) {
    return <Suspense fallback={<RouteLoading />}><ProfilePage config={config} /></Suspense>;
  }

  if (isCommunityModerationRoute) {
    if (import.meta.env.PROD && !isSupabaseConfigured) return <AdminSetupRequired />;
    return <Suspense fallback={<RouteLoading />}><CommunityModerationPage /></Suspense>;
  }

  if (isAdminRoute) {
    // Local browser preview is allowed only during development. In production, fail closed.
    if (import.meta.env.PROD && !isSupabaseConfigured) return <AdminSetupRequired />;
    return <Suspense fallback={<RouteLoading />}><AdminPage /></Suspense>;
  }

  return (
    <div className="app-root">
      <Header />
      <SelectorPage config={config} loading={loading} />
    </div>
  );
}
