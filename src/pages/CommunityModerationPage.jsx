import { useCallback, useEffect, useState } from "react";
import { AlertCircle, ArrowLeft, Check, Eye, EyeOff, Flag, LoaderCircle, LogIn, LogOut, RefreshCw, ShieldCheck, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { getCommunityReports, setCommunityRecommendationHidden, updateCommunityReportStatus } from "../lib/community";
import "../community.css";

const REASON_LABELS = {
  misleading: "Misleading information",
  spam: "Spam or promotion",
  inappropriate: "Inappropriate content",
  wrong_data: "Incorrect card or scenario data",
  other: "Other",
};

function reportDate(value) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function CommunityModerationPage() {
  const [session, setSession] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [reports, setReports] = useState([]);
  const [loadingReports, setLoadingReports] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("pending");

  useEffect(() => {
    if (!supabase) {
      setLoadingSession(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data?.session || null);
      setLoadingSession(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setError("");
      setNotice("");
    });
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  const reload = useCallback(async () => {
    if (!session?.user || session.user.app_metadata?.role !== "admin") return;
    setLoadingReports(true);
    setError("");
    try {
      const result = await getCommunityReports();
      setReports(result);
    } catch (caught) {
      const message = caught?.message || "Failed to load reports.";
      setError(
        /relation .* does not exist|could not find the table/i.test(message) ? "The Community tables are not available. Run supabase/community-schema.sql in the Supabase SQL Editor." : message,
      );
    } finally {
      setLoadingReports(false);
    }
  }, [session]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function login(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!supabase) return;
    const { data, error: loginError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (loginError) {
      setError(loginError.message);
      return;
    }
    if (data.user?.app_metadata?.role !== "admin") {
      await supabase.auth.signOut();
      setError("This account does not have the admin role in app_metadata.");
      return;
    }
    setSession(data.session);
  }

  async function logout() {
    if (supabase) await supabase.auth.signOut();
    window.location.href = "/";
  }

  async function act(report, action) {
    setBusyId(report.id);
    setError("");
    setNotice("");
    try {
      if (action === "dismiss") {
        await updateCommunityReportStatus(report.id, "dismissed");
        setNotice("Report dismissed.");
      } else if (action === "review") {
        await updateCommunityReportStatus(report.id, "reviewed");
        setNotice("Report marked as reviewed.");
      } else if (action === "hide") {
        if (!report.community_recommendations?.id) throw new Error("The original recommendation could not be found.");
        await setCommunityRecommendationHidden(report.community_recommendations.id, true);
        await updateCommunityReportStatus(report.id, "reviewed");
        setNotice("Recommendation hidden and report marked as reviewed.");
      } else if (action === "unhide") {
        if (!report.community_recommendations?.id) throw new Error("The original recommendation could not be found.");
        await setCommunityRecommendationHidden(report.community_recommendations.id, false);
        await updateCommunityReportStatus(report.id, "reviewed");
        setNotice("Recommendation is visible again.");
      }
      await reload();
    } catch (caught) {
      setError(caught?.message || "Moderator action failed.");
    } finally {
      setBusyId(null);
    }
  }

  const isAdmin = session?.user?.app_metadata?.role === "admin";
  const visibleReports = reports.filter((report) => filter === "all" || report.status === filter);

  if (loadingSession)
    return (
      <main className="community-admin-page">
        <div className="community-admin-centered">
          <LoaderCircle className="community-spin" size={22} /> Loading session…
        </div>
      </main>
    );

  if (!isSupabaseConfigured)
    return (
      <main className="community-admin-page">
        <section className="community-admin-panel">
          <a className="community-admin-back" href="/">
            <ArrowLeft size={15} /> Back to selector
          </a>
          <ShieldCheck size={26} />
          <h1>Community moderation unavailable</h1>
          <p>Supabase must be configured to use the moderation page.</p>
        </section>
      </main>
    );

  if (!session)
    return (
      <main className="community-admin-page">
        <section className="community-admin-login">
          <a className="community-admin-back" href="/">
            <ArrowLeft size={15} /> Back to selector
          </a>
          <span className="community-kicker">PRIVATE WORKSPACE</span>
          <h1>Community moderation</h1>
          <p>
            Sign in with an account that has <code>app_metadata.role = admin</code>.
          </p>
          <form className="community-form" onSubmit={login}>
            <label className="community-field">
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required />
            </label>
            <label className="community-field">
              Password
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            {error && (
              <p className="community-form-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="community-button community-button-primary">
              <LogIn size={15} /> Sign in
            </button>
          </form>
        </section>
      </main>
    );

  if (!isAdmin)
    return (
      <main className="community-admin-page">
        <section className="community-admin-panel">
          <ShieldCheck size={26} />
          <h1>Admin access required</h1>
          <p>This account does not have moderation permissions.</p>
          <button className="community-button community-button-muted" type="button" onClick={logout}>
            <LogOut size={15} /> Sign out
          </button>
        </section>
      </main>
    );

  return (
    <main className="community-admin-page">
      <header className="community-admin-topbar">
        <a className="community-admin-brand" href="/admin">
          <ShieldCheck size={20} />
          <span>
            <strong>CARD EXCHANGE</strong>
            <small>COMMUNITY MODERATION</small>
          </span>
        </a>
        <div className="community-admin-user">
          <span>{session.user.email}</span>
          <button className="community-button community-button-muted" type="button" onClick={logout}>
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </header>
      <section className="community-admin-content">
        <a className="community-admin-back" href="/admin">
          <ArrowLeft size={15} /> Back to creator workspace
        </a>
        <div className="community-admin-title-row">
          <div>
            <span className="community-kicker">SAFETY & QUALITY</span>
            <h1>Community reports</h1>
            <p>Review user reports. Reports do not automatically remove recommendations.</p>
          </div>
          <button className="community-button community-button-muted" type="button" onClick={reload} disabled={loadingReports}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div className="community-admin-toolbar">
          <label className="community-field">
            Report status
            <select value={filter} onChange={(event) => setFilter(event.target.value)}>
              <option value="pending">Pending</option>
              <option value="reviewed">Reviewed</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All reports</option>
            </select>
          </label>
          <span>{visibleReports.length} report(s)</span>
        </div>
        {error && (
          <div className="community-system-message">
            <AlertCircle size={17} />
            <div>{error}</div>
          </div>
        )}
        {notice && <div className="community-form-success">{notice}</div>}
        {loadingReports ? (
          <div className="community-loading">
            <LoaderCircle className="community-spin" size={19} /> Loading reports…
          </div>
        ) : visibleReports.length ? (
          <div className="community-report-list">
            {visibleReports.map((report) => {
              const post = report.community_recommendations;
              const reporter = report.community_profiles?.display_name || "Trainer";
              const hidden = Boolean(post?.is_hidden);
              return (
                <article className="community-report-item" key={report.id}>
                  <div className="community-report-item-head">
                    <span className={`community-report-status status-${report.status}`}>{report.status}</span>
                    <time>{reportDate(report.created_at)}</time>
                  </div>
                  <h2>{post?.title || report.recommendation_title || "Deleted or unavailable recommendation"}</h2>
                  <div className="community-report-reason">
                    <Flag size={14} />
                    <strong>{REASON_LABELS[report.reason] || report.reason}</strong>
                  </div>
                  {report.details && <p className="community-report-details">{report.details}</p>}
                  <p className="community-report-reporter">Reported by {reporter}</p>
                  <div className="community-report-actions">
                    {report.status === "pending" && (
                      <button className="community-button community-button-muted" type="button" disabled={busyId === report.id} onClick={() => act(report, "review")}>
                        <Check size={14} /> Mark reviewed
                      </button>
                    )}
                    {report.status === "pending" && (
                      <button className="community-button community-button-muted" type="button" disabled={busyId === report.id} onClick={() => act(report, "dismiss")}>
                        <X size={14} /> Dismiss
                      </button>
                    )}
                    {post?.id && !hidden && (
                      <button className="community-button community-button-danger" type="button" disabled={busyId === report.id} onClick={() => act(report, "hide")}>
                        <EyeOff size={14} /> Hide recommendation
                      </button>
                    )}
                    {post?.id && hidden && (
                      <button className="community-button community-button-muted" type="button" disabled={busyId === report.id} onClick={() => act(report, "unhide")}>
                        <Eye size={14} /> Unhide recommendation
                      </button>
                    )}
                    {busyId === report.id && <LoaderCircle className="community-spin" size={16} />}
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="community-empty-state">
            <div className="community-empty-icon">
              <Check size={22} />
            </div>
            <h3>No reports in this view</h3>
            <p>There are no reports with the selected status.</p>
          </div>
        )}
        <div className="community-section-footnote">
          <ShieldCheck size={14} />
          <span>Moderation is protected by app_metadata.role = admin and Supabase RLS policies.</span>
        </div>
      </section>
    </main>
  );
}
