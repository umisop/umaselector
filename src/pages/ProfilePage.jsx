import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, LogIn, Pencil, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import CommunityAuthModal from "../components/CommunityAuthModal";
import CommunityPostForm from "../components/CommunityPostForm";
import CardImage from "../components/CardImage";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { getPublicConfig } from "../lib/catalog";
import { deleteCommunityRecommendation, getCommunityProfileName, getMyCommunityRecommendations, updateCommunityProfileName, updateCommunityRecommendation } from "../lib/community";
import "../community.css";

const CORE_ORDER = ["kitasan-black", "super-creek", "fine-motion", "agnes-tachyon", "maruzensky", "mr-cb"];

function sortCoreCards(cards) {
  const order = new Map(CORE_ORDER.map((id, index) => [id, index]));
  return [...cards].sort((a, b) => (order.get(a.id) ?? 100) - (order.get(b.id) ?? 100));
}

function suggestedName(user) {
  const metadata = user?.user_metadata || {};
  const candidates = [metadata.display_name, metadata.global_name, metadata.full_name, metadata.name, metadata.preferred_username, metadata.username];
  for (const item of candidates) {
    const value = String(item || "")
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

function dateLabel(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" }).format(new Date(value));
}

export default function ProfilePage({ config }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [editingName, setEditingName] = useState(false);
  const [nameBusy, setNameBusy] = useState(false);
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingPost, setSavingPost] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const cards = Array.isArray(config?.cards) ? config.cards : [];
  const coreCards = useMemo(() => sortCoreCards(cards.filter((card) => card.isCore)), [cards]);
  const cardMap = useMemo(() => new Map(cards.map((card) => [String(card.id), card])), [cards]);

  const loadPosts = useCallback(async (userId) => {
    if (!userId) {
      setPosts([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setPosts(await getMyCommunityRecommendations(userId));
    } catch (caught) {
      setError(caught?.message || "Could not load your recommendations.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data?.session || null);
        setAuthReady(true);
      })
      .catch(() => {
        if (active) setAuthReady(true);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setAuthReady(true);
    });
    return () => {
      active = false;
      listener?.subscription?.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const user = session?.user;
    if (!user?.id) {
      setDisplayName("");
      setNameDraft("");
      setPosts([]);
      return;
    }
    let active = true;
    const fallback = suggestedName(user);
    getCommunityProfileName(user.id)
      .then(async (saved) => {
        let name = saved;
        if (!name || ["trainer", "community member"].includes(name.trim().toLowerCase()) || /^Player-[a-f0-9]{6}$/i.test(name.trim())) {
          try {
            name = await updateCommunityProfileName(user.id, fallback);
          } catch {
            name = fallback;
          }
        }
        if (active) {
          setDisplayName(name || fallback);
          setNameDraft(name || fallback);
        }
      })
      .catch(() => {
        if (active) {
          setDisplayName(fallback);
          setNameDraft(fallback);
        }
      });
    loadPosts(user.id);
    return () => {
      active = false;
    };
  }, [session?.user?.id, loadPosts]);

  async function saveName(event) {
    event.preventDefault();
    if (!session?.user?.id) return;
    const normalized = nameDraft.trim().replace(/\s+/g, " ");
    if (normalized.length < 2 || normalized.length > 32) {
      setError("Display name must be between 2 and 32 characters.");
      return;
    }
    setNameBusy(true);
    setError("");
    setNotice("");
    try {
      const saved = await updateCommunityProfileName(session.user.id, normalized);
      setDisplayName(saved);
      setNameDraft(saved);
      setEditingName(false);
      setNotice("Your display name has been updated.");
    } catch (caught) {
      setError(caught?.message || "Could not update your display name.");
    } finally {
      setNameBusy(false);
    }
  }

  async function savePost(payload) {
    if (!editingPost) return;
    setSavingPost(true);
    setError("");
    setNotice("");
    try {
      await updateCommunityRecommendation(editingPost.id, payload);
      setEditingPost(null);
      setNotice("Recommendation updated successfully.");
      await loadPosts(session.user.id);
    } catch (caught) {
      setError(caught?.message || "Could not update this recommendation.");
      throw caught;
    } finally {
      setSavingPost(false);
    }
  }

  async function deletePost(post) {
    if (!window.confirm(`Delete “${post.title}”? This cannot be undone.`)) return;
    setError("");
    setNotice("");
    try {
      await deleteCommunityRecommendation(post.id);
      setPosts((current) => current.filter((item) => item.id !== post.id));
      if (editingPost?.id === post.id) setEditingPost(null);
      setNotice("Recommendation deleted successfully.");
    } catch (caught) {
      setError(caught?.message || "Could not delete this recommendation.");
    }
  }

  async function signOut() {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError(signOutError.message);
    else {
      setSession(null);
      setNotice("You have signed out.");
      window.location.href = "/";
    }
  }

  return (
    <div className="app-root profile-page-root">
      <Header />
      <main className="profile-page-shell">
        <a className="profile-back-link" href="/#community">
          <ArrowLeft size={15} /> Back to Community
        </a>
        <div className="profile-page-heading">
          <div>
            <span className="community-kicker">COMMUNITY ACCOUNT</span>
            <h1>My profile</h1>
            <p>Manage your public identity and the recommendations you have shared.</p>
          </div>
          {session?.user && (
            <button type="button" className="community-button community-button-muted" onClick={signOut}>
              <LogIn size={15} /> Sign out
            </button>
          )}
        </div>

        {!isSupabaseConfigured ? (
          <div className="community-system-message">
            <ShieldCheck size={18} />
            <div>
              <strong>Community is unavailable.</strong>
              <p>Supabase is not configured for this deployment.</p>
            </div>
          </div>
        ) : !authReady ? (
          <div className="community-loading">
            <LoaderCircle className="community-spin" size={18} /> Checking your session…
          </div>
        ) : !session?.user ? (
          <section className="profile-signin-panel">
            <div className="community-empty-icon">
              <UserRound size={22} />
            </div>
            <h2>Sign in to view your profile</h2>
            <p>Your profile contains your display name and the recommendations you have shared.</p>
            <button type="button" className="community-button community-button-primary" onClick={() => setAuthOpen(true)}>
              <LogIn size={15} /> Sign in or create account
            </button>
          </section>
        ) : (
          <>
            <section className="profile-account-panel">
              <div className="profile-avatar">
                <UserRound size={24} />
              </div>
              <div className="profile-account-details">
                <span className="community-kicker">PUBLIC DISPLAY NAME</span>
                <h2>{displayName || suggestedName(session.user)}</h2>
                <p>
                  Signed in with {session.user.app_metadata?.provider === "discord" ? "Discord" : session.user.app_metadata?.provider || "your account"}. Your email and provider details are not shown
                  publicly.
                </p>
              </div>
              {!editingName && (
                <button
                  type="button"
                  className="community-button community-button-muted"
                  onClick={() => {
                    setNameDraft(displayName);
                    setEditingName(true);
                  }}
                >
                  <Pencil size={14} /> Change name
                </button>
              )}
              {editingName && (
                <form className="profile-name-form" onSubmit={saveName}>
                  <label className="community-field">
                    Display name
                    <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} minLength={2} maxLength={32} autoComplete="nickname" required autoFocus />
                  </label>
                  <div className="profile-name-actions">
                    <button
                      className="community-button community-button-muted"
                      type="button"
                      onClick={() => {
                        setEditingName(false);
                        setNameDraft(displayName);
                      }}
                    >
                      <X size={14} /> Cancel
                    </button>
                    <button className="community-button community-button-primary" type="submit" disabled={nameBusy}>
                      {nameBusy ? <LoaderCircle className="community-spin" size={14} /> : <Check size={14} />} Save name
                    </button>
                  </div>
                </form>
              )}
            </section>

            {notice && (
              <div className="community-notice" role="status">
                <span>{notice}</span>
                <button type="button" onClick={() => setNotice("")} aria-label="Dismiss message">
                  <X size={14} />
                </button>
              </div>
            )}
            {error && (
              <div className="community-form-error" role="alert">
                {error}
              </div>
            )}

            <section className="profile-recommendations-section">
              <div className="profile-recommendations-heading">
                <div>
                  <span className="community-kicker">YOUR CONTRIBUTIONS</span>
                  <h2>Your recommendations</h2>
                  <p>Review, edit, or remove recommendations you have published.</p>
                </div>
                <span className="profile-count">
                  {posts.length} post{posts.length === 1 ? "" : "s"}
                </span>
              </div>
              {loading ? (
                <div className="community-loading">
                  <LoaderCircle className="community-spin" size={18} /> Loading your recommendations…
                </div>
              ) : !posts.length ? (
                <div className="profile-no-posts">
                  <UserRound size={20} />
                  <h3>No recommendations yet</h3>
                  <p>Share your first recommendation to help other players.</p>
                  <a className="community-button community-button-primary" href="/#community">
                    Go to Community
                  </a>
                </div>
              ) : (
                <div className="profile-recommendation-list">
                  {posts.map((post) => {
                    const recommendedItems = Object.entries(post.recommendations || {}).flatMap(([category, values]) => (Array.isArray(values) ? values : []).map((item) => ({ ...item, category })));
                    return (
                      <article className="profile-recommendation-item" key={post.id}>
                        <div className="profile-recommendation-top">
                          <div>
                            <span className="community-post-type">COMMUNITY RECOMMENDATION</span>
                            <h3>{post.title}</h3>
                            <p>
                              {dateLabel(post.created_at)} · {post.upvote_count || 0} upvote{post.upvote_count === 1 ? "" : "s"}
                              {post.updated_at && post.updated_at !== post.created_at ? " · Edited" : ""}
                            </p>
                          </div>
                          <span className={`profile-post-status ${post.is_hidden ? "is-hidden" : ""}`}>{post.is_hidden ? "Hidden" : "Published"}</span>
                        </div>
                        <p className="profile-recommendation-body">{post.body}</p>
                        <div className="profile-card-preview-list">
                          {recommendedItems.map((item, index) => {
                            const card = cardMap.get(String(item.cardId));
                            if (!card) return null;
                            return (
                              <div className="profile-card-preview" key={`${post.id}-${item.category}-${item.cardId}-${index}`}>
                                <CardImage card={card} className="profile-card-preview-image" />
                                <span>
                                  <strong>{card.name}</strong>
                                  <small>
                                    {item.status === "alternative" ? "Alternative" : "Recommended"} · {item.category === "universal" ? "Universal" : item.category.toUpperCase()}
                                  </small>
                                </span>
                              </div>
                            );
                          })}
                        </div>
                        <div className="profile-recommendation-actions">
                          <button
                            type="button"
                            className="community-button community-button-muted"
                            onClick={() => {
                              setEditingPost(post);
                              setError("");
                            }}
                          >
                            <Pencil size={14} /> Edit
                          </button>
                          <button type="button" className="community-button community-button-danger" onClick={() => deletePost(post)}>
                            <Trash2 size={14} /> Delete
                          </button>
                        </div>
                        {editingPost?.id === post.id && (
                          <CommunityPostForm
                            cards={cards}
                            coreCards={coreCards}
                            levels={post.card_levels || {}}
                            initialPost={post}
                            busy={savingPost}
                            error={error}
                            onCancel={() => {
                              setEditingPost(null);
                              setError("");
                            }}
                            onSubmit={savePost}
                          />
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
        <Footer />
      </main>
      {authOpen && (
        <CommunityAuthModal
          initialMode="login"
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(nextSession) => {
            setSession(nextSession || null);
            setAuthOpen(false);
          }}
        />
      )}
    </div>
  );
}
