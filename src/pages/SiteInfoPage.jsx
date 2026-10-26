import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, ChevronRight, CircleHelp, Cookie, ExternalLink, FileText, Info, LoaderCircle, LockKeyhole, Mail, MessageSquare, Save, Send, ShieldCheck, Users } from "lucide-react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import CommunityAuthModal from "../components/CommunityAuthModal";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { readSitePreferences, saveSitePreferences } from "../lib/sitePreferences";
import "../site-info.css";

const EFFECTIVE_DATE = "October 25, 2026";

function InfoTitle({ kicker, title, description, icon: Icon = FileText }) {
  return (
    <div className="site-info-title">
      <span className="community-kicker">{kicker}</span>
      <div className="site-info-title-main">
        <span className="site-info-title-icon">
          <Icon size={22} />
        </span>
        <h1>{title}</h1>
      </div>
      {description && <p>{description}</p>}
    </div>
  );
}

function InfoSection({ title, children }) {
  return (
    <section className="site-info-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function AboutContent() {
  return (
    <>
      <InfoTitle
        kicker="ABOUT THE PROJECT"
        title="About Card Exchange Selector"
        description="A fan-made planning tool for Uma Musume players who want a clearer way to compare support-card exchange options."
        icon={Info}
      />
      <InfoSection title="What this tool does">
        <p>Card Exchange Selector helps players review support-card exchange options using their selected running styles and the limit-break levels of six core support cards.</p>
        <p>The Community section lets signed-in players share their own card recommendations, explain the account conditions they had in mind, and learn from other players' experiences.</p>
      </InfoSection>
      <InfoSection title="Community contributions">
        <p>
          Community recommendations are opinions and player-submitted strategies, not official instructions. Upvotes show community feedback; they do not guarantee that a recommendation is correct or
          optimal for every account.
        </p>
        <p>Use the card images, descriptions, and recommendations as reference material, and make your own decision based on your goals and available resources.</p>
      </InfoSection>
      <InfoSection title="Independent fan project">
        <p>
          This is an independent, fan-made tool. It is not affiliated with, endorsed by, or sponsored by Cygames or the Uma Musume Pretty Derby team. Game names, card artwork, and other third-party
          assets belong to their respective owners.
        </p>
      </InfoSection>
    </>
  );
}

function FAQContent() {
  const items = [
    [
      "Why can I only see recommendations for my current Core Card levels?",
      "The Community feed compares the six Core Card levels selected in the Selector with the snapshot attached to each post. A post for a different loadout is not shown as a match.",
    ],
    ["Do upvotes change the Selector results?", "No. Upvotes only help sort and compare Community posts. They do not modify official recommendations or the Selector rules."],
    [
      "Can I edit or delete my own post?",
      "Yes. Sign in and open My Profile. You can edit or delete recommendations submitted by your account. Hidden posts may remain visible to you in your profile but not in the public feed.",
    ],
    [
      "How do I reset my password?",
      "For an email-and-password account, use “Forgot password?” in the Community sign-in form. Discord users should use Discord to manage access to their Discord account.",
    ],
    [
      "Why is my post hidden?",
      "A moderator may hide a post after reviewing a report or for another moderation reason. Use the Feedback page to ask about an account or content issue. Never share your password or sign-in codes.",
    ],
    ["Why is the featured video not loading?", "The featured YouTube video is optional. Open Cookie settings and allow the video if you want to watch it."],
  ];
  return (
    <>
      <InfoTitle kicker="HELP CENTER" title="Frequently asked questions" description="Quick answers about recommendations, accounts, and how this tool works." icon={CircleHelp} />
      <div className="site-info-faq-list">
        {items.map(([question, answer]) => (
          <details className="site-info-faq" key={question}>
            <summary>
              {question}
              <ChevronRight size={16} />
            </summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
      <div className="site-info-callout">
        <MessageSquare size={18} />
        <div>
          <strong>Still need help?</strong>
          <p>
            Send a message through the <a href="/feedback">Feedback page</a>.
          </p>
        </div>
      </div>
    </>
  );
}

function FeedbackContent() {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [category, setCategory] = useState("suggestion");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return undefined;
    }
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (active) {
          setSession(data?.session || null);
          setAuthReady(true);
        }
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

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");
    if (!supabase || !session?.user) {
      setError("Sign in before submitting feedback.");
      return;
    }
    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();
    if (cleanSubject.length < 3 || cleanSubject.length > 120) {
      setError("Subject must be between 3 and 120 characters.");
      return;
    }
    if (cleanMessage.length < 10 || cleanMessage.length > 3000) {
      setError("Message must be between 10 and 3,000 characters.");
      return;
    }
    setBusy(true);
    try {
      const { error: submitError } = await supabase.from("site_feedback").insert({ user_id: session.user.id, category, subject: cleanSubject, message: cleanMessage });
      if (submitError) {
        if (/relation .* does not exist|could not find the table|PGRST20[45]/i.test(submitError.message || "")) throw new Error("Feedback is temporarily unavailable. Please try again later.");
        if (/feedback limit|submissions per hour|rate limit|too many/i.test(submitError.message || "")) throw new Error("You have reached the feedback limit. Please try again later.");
        throw submitError;
      }
      setSubject("");
      setMessage("");
      setSuccess("Thank you. Your feedback has been submitted for review.");
    } catch (caught) {
      setError(caught?.message || "Feedback could not be submitted. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <InfoTitle kicker="HELP US IMPROVE" title="Feedback" description="Report a bug, suggest an improvement, or ask a question about the tool." icon={MessageSquare} />
      {!isSupabaseConfigured ? (
        <div className="site-info-callout">
          <ShieldCheck size={18} />
          <div>
            <strong>Feedback form unavailable</strong>
            <p>Feedback is temporarily unavailable. Please try again later.</p>
          </div>
        </div>
      ) : !authReady ? (
        <p className="site-info-muted-note">
          <LoaderCircle size={15} className="community-spin" /> Checking sign-in…
        </p>
      ) : !session?.user ? (
        <div className="site-info-signin">
          <LockKeyhole size={22} />
          <h2>Sign in to send feedback</h2>
          <p>Your feedback is sent privately to the site owner and is not shown on your public profile.</p>
          <button type="button" className="community-button community-button-primary" onClick={() => setAuthOpen(true)}>
            Sign in or create account
          </button>
        </div>
      ) : (
        <form className="site-info-feedback-form" onSubmit={submit}>
          <label className="community-field">
            Category
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="suggestion">Feature suggestion</option>
              <option value="bug">Bug report</option>
              <option value="question">Question</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="community-field">
            Subject
            <input value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} maxLength={120} required placeholder="A short summary" />
          </label>
          <label className="community-field">
            Message
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              minLength={10}
              maxLength={3000}
              required
              rows={7}
              placeholder="Describe what happened or what you would like to see…"
            />
          </label>
          <p className="site-info-muted-note">Do not include passwords, one-time sign-in codes, or private information about yourself or others. Limit: 5 submissions per account per hour.</p>
          {error && (
            <div className="community-form-error" role="alert">
              {error}
            </div>
          )}
          {success && (
            <div className="community-form-success" role="status">
              <CheckCircle2 size={16} /> {success}
            </div>
          )}
          <button type="submit" className="community-button community-button-primary" disabled={busy}>
            {busy ? <LoaderCircle size={15} className="community-spin" /> : <Send size={15} />} Submit feedback
          </button>
        </form>
      )}
      {authOpen && (
        <CommunityAuthModal
          initialMode="login"
          redirectTo={`${window.location.origin}/feedback`}
          onClose={() => setAuthOpen(false)}
          onAuthenticated={(nextSession) => {
            setSession(nextSession || null);
            setAuthOpen(false);
          }}
        />
      )}
    </>
  );
}

function PrivacyContent() {
  return (
    <>
      <InfoTitle
        kicker="YOUR PRIVACY"
        title="Privacy Policy"
        description={`Effective date: ${EFFECTIVE_DATE}. Here is what information this site uses, why it is needed, and what choices you have.`}
        icon={LockKeyhole}
      />
      <p className="site-info-legal-intro">
        Your privacy matters. This fan-made site uses a limited amount of information to let you sign in, share card recommendations, and keep the Community safe. We do not sell your personal
        information.
      </p>
      <InfoSection title="What information is used?">
        <ul>
          <li>
            <strong>Account details:</strong> if you sign in with email, your email address is used to manage your account. If you choose Discord, Discord shares the basic account details needed to
            sign you in.
          </li>
          <li>
            <strong>Your public profile:</strong> the display name you choose is shown with your Community posts. Your email address and password are not shown publicly.
          </li>
          <li>
            <strong>Your recommendations:</strong> posts may include a title, written explanation, selected support cards, Core Card levels, and dates when a post was created or edited.
          </li>
          <li>
            <strong>Votes and reports:</strong> your upvote is linked to your account so the same account cannot vote repeatedly on one post. Reports include the details you submit and are available
            to the people responsible for reviewing them.
          </li>
          <li>
            <strong>Feedback:</strong> when you send feedback, the site stores your message and its category along with your account so the site owner can review it and respond if needed.
          </li>
          <li>
            <strong>Information saved in your browser:</strong> the site remembers that you are signed in and whether you have allowed the optional video to load.
          </li>
        </ul>
      </InfoSection>
      <InfoSection title="How is it used?">
        <p>
          Information is used to run the Selector and Community, show your posts and display name, count votes, let you manage your own recommendations, respond to feedback, review reports, and reduce
          spam or abuse. Your information is not sold to advertisers or used to build advertising profiles.
        </p>
      </InfoSection>
      <InfoSection title="What can other people see?">
        <p>
          Community posts, your chosen display name, the Core Card levels included with a post, its publication date, and its upvote count may be visible to all visitors. Please do not include private
          or sensitive information in a public post. Reports and feedback are not shown in the public feed; they are reviewed by the site owner or moderators.
        </p>
      </InfoSection>
      <InfoSection title="Who helps run the site?">
        <p>
          The site uses outside service providers to keep accounts and Community information working. If you sign in with Discord, Discord is involved in confirming your identity. If you allow the
          embedded YouTube video to load, YouTube may receive information about that visit. These providers handle information under their own privacy policies. You can decline the optional video in
          Cookie settings.
        </p>
      </InfoSection>
      <InfoSection title="Your choices and requests">
        <p>
          You can change your public display name and edit or delete your own recommendations from My Profile. You can sign out at any time. If you use an email-and-password account, use “Forgot
          password?” on the sign-in form to reset your password.
        </p>
      </InfoSection>
      <InfoSection title="How is information protected?">
        <p>The site uses account restrictions and access controls to help protect information.Do not share your password, one-time sign-in codes, or private information.</p>
      </InfoSection>
      <InfoSection title="Changes to this policy">
        <p>
          This notice may change when the site changes. The effective date at the top will be updated when there is a meaningful change to how information is handled. The site will not use a revised
          notice to claim that information is absolutely safe or that risk does not exist.
        </p>
      </InfoSection>
    </>
  );
}

function CookieSettingsContent() {
  const [preferences, setPreferences] = useState(() => readSitePreferences());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [externalMedia, setExternalMedia] = useState(preferences.externalMedia);
  useEffect(() => {
    setExternalMedia(preferences.externalMedia);
  }, [preferences.externalMedia]);
  function save(nextExternalMedia = externalMedia) {
    try {
      const next = saveSitePreferences({ externalMedia: nextExternalMedia });
      setPreferences(next);
      setExternalMedia(next.externalMedia);
      setSaved(true);
      setError("");
    } catch (caught) {
      setError(caught?.message || "Could not save preferences.");
      setSaved(false);
    }
  }
  return (
    <>
      <InfoTitle kicker="YOUR CHOICES" title="Cookie settings" description="Choose whether the optional YouTube video can load on this device." icon={Cookie} />
      <div className="site-info-preference-list">
        <div className="site-info-preference">
          <div>
            <strong>Sign-in information</strong>
            <p>The site remembers that you are signed in so account features can work. This is essential for login and cannot be switched off here.</p>
          </div>
          <span className="site-info-always-on">Required</span>
        </div>
        <div className="site-info-preference">
          <div>
            <strong>YouTube video</strong>
            <p>If allowed, the featured video can load from YouTube. YouTube may receive information about your visit when the video loads. If blocked, the video will not load.</p>
          </div>
          <label className="site-info-switch">
            <input
              type="checkbox"
              checked={externalMedia}
              onChange={(event) => {
                setExternalMedia(event.target.checked);
                setSaved(false);
              }}
            />
            <span>{externalMedia ? "Allowed" : "Blocked"}</span>
          </label>
        </div>
      </div>
      <p className="site-info-muted-note">
        Your choice is saved in this browser only. It will not automatically carry over to your other devices. This version does not use optional ads or visitor-tracking tools.
      </p>
      {error && (
        <div className="community-form-error" role="alert">
          {error}
        </div>
      )}
      {saved && (
        <div className="community-form-success" role="status">
          <CheckCircle2 size={16} /> Your preference has been saved.
        </div>
      )}
      <div className="site-info-button-row">
        <button
          className="community-button community-button-muted"
          type="button"
          onClick={() => {
            setExternalMedia(false);
            save(false);
          }}
        >
          Block video
        </button>
        <button className="community-button community-button-primary" type="button" onClick={() => save()}>
          <Save size={15} /> Save choice
        </button>
      </div>
      <p className="site-info-back-home">
        <a href="/">
          Return to Selector <ExternalLink size={13} />
        </a>
      </p>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <InfoTitle
        kicker="USING THIS SITE"
        title="Terms of Use"
        description={`Effective date: ${EFFECTIVE_DATE}. These simple rules help keep the Selector and Community useful for everyone.`}
        icon={FileText}
      />
      <InfoSection title="What the site is for">
        <p>
          Card Exchange Selector is a fan-made planning tool. It is not an official Uma Musume service. The Selector and player-submitted recommendations are for reference only; they cannot guarantee
          that an exchange or strategy is right for every account. Game details and recommendations can become outdated.
        </p>
      </InfoSection>
      <InfoSection title="Your account">
        <p>
          Keep your sign-in details private and use an account you are allowed to access. Do not impersonate another person or try to gain access to someone else's account. Signing in with Discord
          does not make an account an administrator.
        </p>
      </InfoSection>
      <InfoSection title="Community rules">
        <ul>
          <li>Share recommendations honestly and only submit content you have the right to share.</li>
          <li>Do not post spam, scams, harassment, threats, illegal content, or another person's private information.</li>
          <li>Do not try to inflate votes, submit duplicates to get around restrictions, or make false reports.</li>
          <li>Do not try to break, disrupt, or bypass the site's protections.</li>
        </ul>
      </InfoSection>
      <InfoSection title="Your posts and moderation">
        <p>
          You are responsible for what you post. You allow the site to display and store your recommendations as needed to run the Community. You can edit or delete your own recommendations from My
          Profile. The site owner or moderators may hide or remove content and review reports to keep the Community safe. An upvote shows a user's opinion; it does not mean the recommendation has been
          verified.
        </p>
      </InfoSection>
      <InfoSection title="Availability and ownership">
        <p>
          The site may change, become temporarily unavailable, or close. To the extent allowed by law, the site owner is not responsible for decisions made solely from the tool or Community posts.
          Cygames, Uma Musume Pretty Derby, card artwork, and other third-party names and materials belong to their respective owners.
        </p>
      </InfoSection>
      <InfoSection title="Changes and questions">
        <p>These rules may be updated as the site changes. Questions can be sent through the Feedback page.</p>
      </InfoSection>
    </>
  );
}

function ContactContent() {
  return (
    <>
      <InfoTitle kicker="GET IN TOUCH" title="Contact" description="Use the appropriate channel for questions, problems, and safety concerns." icon={Mail} />
      <div className="site-info-contact-list">
        <a href="/feedback">
          <MessageSquare size={19} />
          <span>
            <strong>Feedback and bug reports</strong>
            <small>Send a private message about a problem or improvement. Sign-in is required.</small>
          </span>
          <ChevronRight size={16} />
        </a>
        <a href="/#community">
          <Users size={19} />
          <span>
            <strong>Community recommendations</strong>
            <small>Use the report action on a post to flag suspicious or inappropriate content.</small>
          </span>
          <ChevronRight size={16} />
        </a>
        <a href="/privacy-policy">
          <LockKeyhole size={19} />
          <span>
            <strong>Privacy questions</strong>
            <small>Review the Privacy Policy, then contact the site owner through Feedback.</small>
          </span>
          <ChevronRight size={16} />
        </a>
      </div>
      <p className="site-info-muted-note">There is no public support email listed at this time. Please use the Feedback form. Never send passwords, sign-in codes, or other private account details.</p>
    </>
  );
}

const PAGE_CONTENT = {
  "/about": AboutContent,
  "/faq": FAQContent,
  "/feedback": FeedbackContent,
  "/privacy-policy": PrivacyContent,
  "/cookie-settings": CookieSettingsContent,
  "/terms": TermsContent,
  "/contact": ContactContent,
};

const PAGE_TITLES = {
  "/about": "About",
  "/faq": "FAQ",
  "/feedback": "Feedback",
  "/privacy-policy": "Privacy Policy",
  "/cookie-settings": "Cookie settings",
  "/terms": "Terms of Use",
  "/contact": "Contact",
};

const RETIRED_INFO_PATHS = ["/changelog", "/supporters"];
export const SITE_INFO_PATHS = [...Object.keys(PAGE_CONTENT), ...RETIRED_INFO_PATHS];

export default function SiteInfoPage({ path = window.location.pathname.replace(/\/$/, "") || "/" }) {
  const Content = PAGE_CONTENT[path] || AboutContent;
  const pageTitle = useMemo(() => PAGE_TITLES[path] || "About", [path]);
  useEffect(() => {
    if (RETIRED_INFO_PATHS.includes(path)) {
      window.location.replace("/about");
      return;
    }
    document.title = `${pageTitle} | Card Exchange Selector`;
  }, [pageTitle, path]);
  return (
    <div className="app-root site-info-root">
      <Header />
      <main className="site-info-shell">
        <a className="site-info-back" href="/">
          <ArrowLeft size={14} /> Back to Selector
        </a>
        <article className="site-info-article">
          <Content key={path} />
        </article>
      </main>
      <Footer />
    </div>
  );
}
