import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, ArrowDownWideNarrow, ChevronLeft, ChevronRight, Flag, LoaderCircle, LogIn, MessageSquareText, Plus, RefreshCw, ShieldCheck, ThumbsUp, Trash2, UserRound, X } from "lucide-react";
import CardImage from "./CardImage";
import "../community.css";
import CommunityAuthModal from "./CommunityAuthModal";
import CommunityPostForm from "./CommunityPostForm";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import {
  createCommunityRecommendation,
  deleteCommunityRecommendation,
  getCommunityProfileName,
  getCommunityRecommendations,
  reportCommunityRecommendation,
  toggleCommunityVote,
  updateCommunityProfileName,
  updateCommunityRecommendation,
} from "../lib/community";
import { RECOMMENDATION_CATEGORIES } from "../lib/scenarioEngine";

const ITEMS_PER_PAGE = 6;
const REPORT_REASONS = [
  { value: "misleading", label: "Misleading information" },
  { value: "spam", label: "Spam or promotion" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "wrong_data", label: "Incorrect support card data" },
  { value: "other", label: "Other" },
];
const CATEGORY_MAP = Object.fromEntries(RECOMMENDATION_CATEGORIES.map((category) => [category.id, category]));

function formatDate(value) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
  } catch {
    return "";
  }
}

function relevantRecommendations(post, selectedStyles) {
  const categoryIds = ["universal", ...selectedStyles.filter((id) => ["fr", "pc", "ls", "ec"].includes(id))];
  return categoryIds.flatMap((categoryId) => {
    const items = Array.isArray(post.recommendations?.[categoryId]) ? post.recommendations[categoryId] : [];
    return items.map((item, index) => ({ ...item, categoryId, index, cardKey: `${categoryId}-${index}-${item.cardId}` }));
  });
}

function ReportModal({ post, busy, error, onClose, onSubmit }) {
  const [reason, setReason] = useState("misleading");
  const [details, setDetails] = useState("");
  return (
    <div
      className="community-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="community-modal community-report-modal" role="dialog" aria-modal="true" aria-labelledby="community-report-title">
        <button className="community-modal-close" type="button" onClick={onClose} aria-label="Close dialog">
          <X size={18} />
        </button>
        <span className="community-kicker">COMMUNITY SAFETY</span>
        <h2 id="community-report-title">Report recommendation</h2>
        <p>
          Recommendation: <strong>{post.title}</strong>. Your report will be sent to moderators and will not automatically remove the recommendation.
        </p>
        <form
          className="community-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit({ reason, details });
          }}
        >
          <label className="community-field">
            Report reason
            <select value={reason} onChange={(event) => setReason(event.target.value)}>
              {REPORT_REASONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="community-field">
            Details (optional)
            <textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} maxLength={500} placeholder="Describe the issue you found." />
          </label>
          {error && (
            <p className="community-form-error" role="alert">
              {error}
            </p>
          )}
          <div className="community-form-actions">
            <button className="community-button community-button-muted" type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="community-button community-button-primary" type="submit" disabled={busy}>
              <Flag size={15} />
              {busy ? "Sending…" : "Send report"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function suggestedDisplayName(user) {
  const metadata = user?.user_metadata || {};
  const identityNames = (Array.isArray(user?.identities) ? user.identities : [])
    .map((identity) => identity?.identity_data || {})
    .flatMap((identity) => [identity.global_name, identity.full_name, identity.name, identity.preferred_username, identity.user_name, identity.username]);
  const candidates = [metadata.display_name, metadata.global_name, metadata.full_name, metadata.name, metadata.preferred_username, metadata.user_name, metadata.username, ...identityNames];
  for (const candidate of candidates) {
    const value = String(candidate || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 32);
    if (value.length >= 2 && !["trainer", "community member"].includes(value.toLowerCase())) return value;
  }
  return `Player-${
    String(user?.id || "")
      .replaceAll("-", "")
      .slice(0, 6) || "Unknown"
  }`;
}

function formatLevel(value) {
  const level = Number(value);
  if (value === undefined || value === null || value === "") return "—";
  if (level === -1) return "Not owned";
  return Number.isInteger(level) ? `LB${level}` : "—";
}

function CommunityRecommendationCard({ post, items, cardMap, coreCards, user, onVote, onEdit, onDelete, onReport, voting, ownVote }) {
  return (
    <article className="community-post">
      <div className="community-post-main">
        <div className="community-post-topline">
          <span className="community-post-type">
            <MessageSquareText size={13} /> COMMUNITY
          </span>
          <time dateTime={post.created_at}>{formatDate(post.created_at)}</time>
        </div>
        <h3>{post.title}</h3>
        <div className="community-post-author">
          <span className="community-avatar">
            <UserRound size={14} />
          </span>
          <span>{post.authorName}</span>
        </div>
        <details className="community-snapshot">
          <summary>Core-card inventory at submission</summary>
          <div className="community-snapshot-grid">
            {coreCards.map((card) => (
              <span key={card.id}>
                <small>{card.name}</small>
                <strong>{formatLevel(post.card_levels?.[card.id])}</strong>
              </span>
            ))}
          </div>
        </details>
        <p className="community-post-body">{post.body}</p>
        <div className="community-card-suggestions">
          {items.map((item) => {
            const card = cardMap.get(String(item.cardId));
            if (!card) return null;
            const status = item.status === "alternative" ? "alternative" : "recommended";
            return (
              <div className="community-card-suggestion" key={item.cardKey}>
                <CardImage card={card} className="community-card-suggestion-image" />
                <div className="community-card-suggestion-copy">
                  <span className={`community-recommendation-status ${status}`}>{status === "recommended" ? "Recommended" : "Alternative"}</span>
                  <strong>{card.name}</strong>
                  <span className="community-category-label">{CATEGORY_MAP[item.categoryId]?.label || item.categoryId}</span>
                  {item.note && <p>{item.note}</p>}
                </div>
              </div>
            );
          })}
          {!items.length && <p className="community-no-style-match">Select a running style above to show recommendations for this category.</p>}
        </div>
        <div className="community-post-foot">
          <div className="community-post-vote-actions">
            <button
              type="button"
              className={`community-upvote-button ${ownVote ? "is-active" : ""}`}
              onClick={() => onVote(post)}
              disabled={voting}
              aria-pressed={ownVote}
              title={user ? (ownVote ? "Remove upvote" : "Upvote recommendation") : "Sign in to upvote"}
            >
              {voting ? <LoaderCircle className="community-spin" size={15} /> : <ThumbsUp size={15} />}
              <span>{post.upvote_count || 0}</span>
              <span>{ownVote ? "Upvoted" : "Upvote"}</span>
            </button>
          </div>
          <div className="community-post-actions">
            {user?.id === post.user_id && (
              <>
                <button type="button" onClick={() => onEdit(post)} aria-label="Edit recommendation">
                  <span>Edit</span>
                </button>
                <button type="button" className="community-action-danger" onClick={() => onDelete(post)} aria-label="Delete recommendation">
                  <Trash2 size={13} />
                  <span>Delete</span>
                </button>
              </>
            )}
            {user && user.id !== post.user_id && (
              <button type="button" onClick={() => onReport(post)}>
                <Flag size={13} />
                <span>Report</span>
              </button>
            )}
            {!user && (
              <button type="button" onClick={() => onReport(post)}>
                <Flag size={13} />
                <span>Report</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function CommunitySection({ cards, coreCards, levels, allCoreFilled, matchedScenario, selectedStyles }) {
  const [session, setSession] = useState(null);
  const [profileName, setProfileName] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [posts, setPosts] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(0);
  const [sortBy, setSortBy] = useState("upvotes");
  const [authMode, setAuthMode] = useState("login");
  const [formOpen, setFormOpen] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [voteBusyId, setVoteBusyId] = useState(null);
  const [reportPost, setReportPost] = useState(null);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (queryParams.get("community-password-reset") === "1" || hashParams.get("type") === "recovery") {
      setAuthMode("reset");
      setAuthOpen(true);
    }
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSession(data?.session || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession || null);
      if (event === "PASSWORD_RECOVERY") {
        setAuthMode("reset");
        setAuthOpen(true);
      }
    });
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = session?.user;
    if (!user?.id) {
      setProfileName("");
      return undefined;
    }
    let active = true;
    const fallbackName = suggestedDisplayName(user);
    getCommunityProfileName(user.id)
      .then(async (savedName) => {
        if (!active) return;
        const isPlaceholder = !savedName || ["trainer", "community member"].includes(savedName.trim().toLowerCase()) || /^Player-[a-f0-9]{6}$/i.test(savedName.trim());
        if (isPlaceholder) {
          setProfileName(fallbackName);
          try {
            const saved = await updateCommunityProfileName(user.id, fallbackName);
            if (active) setProfileName(saved);
          } catch {
            // Keep the metadata-based name visible even if the profile row needs the migration.
          }
        } else {
          setProfileName(savedName);
        }
      })
      .catch(() => {
        if (active) setProfileName(fallbackName);
      });
    return () => {
      active = false;
    };
  }, [session?.user?.id]);

  const reload = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    if (!isSupabaseConfigured || !allCoreFilled) {
      setPosts([]);
      setTotalCount(0);
      setLoading(false);
      setLoadError("");
      return undefined;
    }
    let active = true;
    setLoading(true);
    setLoadError("");
    // Keep posts scoped to the exact six Core Card levels. A public scenario match
    // adds a scenario filter; without one, the fallback is only for this exact loadout,
    // not a global feed mixing different Core Card combinations.
    getCommunityRecommendations({ sortBy, userId: session?.user?.id || null, scenarioId: matchedScenario?.id || null, cardLevels: levels })
      .then((result) => {
        if (!active) return;
        setPosts(result.posts);
        setTotalCount(result.count);
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          /relation .* does not exist|could not find the table/i.test(error?.message || "")
            ? "The Community tables have not been created yet. Run supabase/community-schema.sql in the Supabase SQL Editor first."
            : error?.message || "Failed to load Community recommendations.",
        );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sortBy, session?.user?.id, refreshKey, matchedScenario?.id, allCoreFilled, levels]);

  const cardMap = useMemo(() => new Map(cards.map((card) => [String(card.id), card])), [cards]);
  const selectedStyleIds = useMemo(() => (Array.isArray(selectedStyles) ? selectedStyles : []), [selectedStyles]);
  const relevantPosts = useMemo(() => posts.filter((post) => relevantRecommendations(post, selectedStyleIds).some((item) => cardMap.has(String(item.cardId)))), [posts, selectedStyleIds, cardMap]);
  const pageCount = Math.max(1, Math.ceil(relevantPosts.length / ITEMS_PER_PAGE));
  const visiblePosts = relevantPosts.slice(page * ITEMS_PER_PAGE, (page + 1) * ITEMS_PER_PAGE);

  useEffect(() => {
    if (page >= pageCount) setPage(Math.max(0, pageCount - 1));
  }, [page, pageCount]);

  async function handleSave(payload) {
    if (!session?.user) {
      setAuthMode("login");
      setAuthOpen(true);
      throw new Error("Sign-in is required.");
    }
    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      if (editingPost) await updateCommunityRecommendation(editingPost.id, payload);
      else await createCommunityRecommendation(payload, session.user.id);
      setFormOpen(false);
      setEditingPost(null);
      setPage(0);
      setNotice(editingPost ? "Recommendation updated successfully." : "Recommendation published successfully.");
      reload();
    } catch (error) {
      setFormError(error?.message || "Failed to save the recommendation.");
      throw error;
    } finally {
      setSaving(false);
    }
  }

  async function handleVote(post) {
    if (!session?.user) {
      setNotice("Sign in to upvote.");
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    setVoteBusyId(post.id);
    setNotice("");
    try {
      await toggleCommunityVote({ recommendationId: post.id, userId: session.user.id, hasUpvoted: post.hasUpvoted });
      reload();
    } catch (error) {
      setNotice(error?.message || "Failed to save your upvote. Please try again.");
    } finally {
      setVoteBusyId(null);
    }
  }

  async function handleDelete(post) {
    const confirmed = window.confirm(`Delete the recommendation “${post.title}”? This action cannot be undone.`);
    if (!confirmed) return;
    setNotice("");
    try {
      await deleteCommunityRecommendation(post.id);
      setNotice("Recommendation deleted successfully.");
      reload();
    } catch (error) {
      setNotice(error?.message || "Failed to delete the recommendation.");
    }
  }

  async function handleReport({ reason, details }) {
    if (!session?.user || !reportPost) return;
    setReportBusy(true);
    setReportError("");
    try {
      await reportCommunityRecommendation({ recommendationId: reportPost.id, recommendationTitle: reportPost.title, reporterId: session.user.id, reason, details });
      setReportPost(null);
      setNotice("Report submitted. A moderator will review this recommendation.");
    } catch (error) {
      setReportError(error?.message || "Failed to submit the report.");
    } finally {
      setReportBusy(false);
    }
  }

  function openEdit(post) {
    setEditingPost(post);
    setFormError("");
    setFormOpen(true);
    setNotice("");
    document.getElementById("community")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function openCreate() {
    if (!session?.user) {
      setAuthMode("login");
      setAuthOpen(true);
      return;
    }
    if (!allCoreFilled) {
      setNotice("Select all six Core Cards before creating a recommendation.");
      return;
    }
    // Public scenario matching is used to filter the feed, not to gate publishing.
    // When no scenario matches, the post is saved and shown only for this exact six-card loadout.
    setEditingPost(null);
    setFormError("");
    setFormOpen(true);
    setNotice("");
  }

  return (
    <>
      <section className="community-section" id="community" aria-labelledby="community-heading">
        <div className="community-heading-row">
          <div>
            <span className="community-kicker">04 / COMMUNITY KNOWLEDGE</span>
            <h2 id="community-heading">Community Recommendations</h2>
            <p className="community-section-description">Compare strategies shared by other players</p>
          </div>
          <div className="community-heading-actions">
            {session?.user ? (
              <>
                <span className="community-signed-in">
                  <span className="community-signed-dot" /> Signed in as {profileName || suggestedDisplayName(session.user)}
                </span>
                <a className="community-button community-button-muted" href="/profile">
                  <UserRound size={14} /> My profile
                </a>
              </>
            ) : isSupabaseConfigured ? (
              <button
                type="button"
                className="community-button community-button-muted"
                onClick={() => {
                  setAuthMode("login");
                  setAuthOpen(true);
                }}
              >
                <LogIn size={15} /> Sign in
              </button>
            ) : null}
            <button type="button" className="community-button community-button-primary" onClick={openCreate} disabled={!isSupabaseConfigured}>
              <Plus size={15} /> Share recommendation
            </button>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="community-system-message">
            <AlertCircle size={17} />
            <div>
              <strong>Community is unavailable in this deployment.</strong>
              <p>Configure Supabase to enable submissions, accounts, and voting.</p>
            </div>
          </div>
        )}

        <div className="community-scope-row community-sort-row">
          <div>
            <ArrowDownWideNarrow size={15} />
            <span>Sort recommendations</span>
          </div>
          <select
            value={sortBy}
            onChange={(event) => {
              setSortBy(event.target.value);
              setPage(0);
            }}
            aria-label="Sort community recommendations"
          >
            <option value="upvotes">Most upvoted</option>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        {formOpen && (
          <CommunityPostForm
            key={editingPost?.id || "new"}
            cards={cards}
            coreCards={coreCards}
            levels={levels}
            initialPost={editingPost}
            busy={saving}
            error={formError}
            onCancel={() => {
              setFormOpen(false);
              setEditingPost(null);
              setFormError("");
            }}
            onSubmit={handleSave}
          />
        )}

        {notice && (
          <div className="community-notice" role="status">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">
              <X size={14} />
            </button>
          </div>
        )}

        {loading ? (
          <div className="community-loading">
            <LoaderCircle className="community-spin" size={19} />
            <span>Loading community recommendations…</span>
          </div>
        ) : loadError ? (
          <div className="community-system-message">
            <AlertCircle size={17} />
            <div>
              <strong>Community could not be loaded</strong>
              <p>{loadError}</p>
              <button type="button" className="community-text-button" onClick={reload}>
                <RefreshCw size={13} /> Retry
              </button>
            </div>
          </div>
        ) : relevantPosts.length ? (
          <>
            <div className="community-results-meta">
              <span>{sortBy === "upvotes" ? "Ranked by community upvotes" : sortBy === "newest" ? "Newest submissions first" : "Oldest submissions first"}</span>
              <span>
                {relevantPosts.length} recommendation{relevantPosts.length === 1 ? "" : "s"}
                {totalCount > posts.length ? ` · ${posts.length} loaded of ${totalCount}` : ""}
              </span>
            </div>
            <div className="community-post-list">
              {visiblePosts.map((post) => (
                <CommunityRecommendationCard
                  key={post.id}
                  post={post}
                  items={relevantRecommendations(post, selectedStyleIds).filter((item) => cardMap.has(String(item.cardId)))}
                  cardMap={cardMap}
                  coreCards={coreCards}
                  user={session?.user}
                  ownVote={post.hasUpvoted}
                  voting={voteBusyId === post.id}
                  onVote={handleVote}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onReport={(target) => {
                    if (!session?.user) {
                      setAuthMode("login");
                      setAuthOpen(true);
                      return;
                    }
                    setReportError("");
                    setReportPost(target);
                  }}
                />
              ))}
            </div>
            {pageCount > 1 && (
              <div className="community-pagination">
                <button type="button" className="community-button community-button-muted" onClick={() => setPage((value) => Math.max(0, value - 1))} disabled={page === 0}>
                  <ChevronLeft size={15} /> Previous
                </button>
                <span>
                  Page {page + 1} of {pageCount}
                </span>
                <button type="button" className="community-button community-button-muted" onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} disabled={page >= pageCount - 1}>
                  Next <ChevronRight size={15} />
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="community-empty-state">
            <div className="community-empty-icon">
              <MessageSquareText size={22} />
            </div>
            {!allCoreFilled ? (
              <>
                <h3>Select your Core Cards to browse Community posts</h3>
                <p>Community recommendations are matched to the public scenario selected automatically from the six Core Card levels above. Select all six cards to see relevant posts.</p>
              </>
            ) : !matchedScenario?.id ? (
              <>
                <h3>No Community recommendations for these Core Card levels yet</h3>
                <p>You can still share a recommendation for this exact six-card combination.</p>
                <button type="button" className="community-button community-button-muted" onClick={openCreate}>
                  <Plus size={15} /> Share the first recommendation
                </button>
              </>
            ) : (
              <>
                <h3>No Community recommendations for these scenario yet</h3>
                <p>
                  {selectedStyleIds.length
                    ? "No posts for this public scenario match the selected running styles yet."
                    : "Be the first to share a recommendation for the public scenario currently matched by your Core Card levels."}
                </p>
                <button type="button" className="community-button community-button-muted" onClick={openCreate}>
                  <Plus size={15} /> Share the first recommendation
                </button>
              </>
            )}
          </div>
        )}
      </section>

      {authOpen && (
        <CommunityAuthModal
          key={authMode}
          initialMode={authMode}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(nextSession) => {
            setSession(nextSession || null);
            setNotice("Signed in successfully.");
          }}
        />
      )}
      {reportPost && <ReportModal post={reportPost} busy={reportBusy} error={reportError} onClose={() => setReportPost(null)} onSubmit={handleReport} />}
    </>
  );
}
