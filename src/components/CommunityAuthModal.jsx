import { useState } from 'react';
import { X, LogIn, UserPlus, LoaderCircle, Mail, KeyRound, MessageCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

const RESET_REDIRECT_PATH = '/?community-password-reset=1';

export default function CommunityAuthModal({ onClose, onAuthenticated, initialMode = 'login', redirectTo }) {
  const [mode, setMode] = useState(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  function changeMode(nextMode) {
    setMode(nextMode);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmPassword('');
  }

  async function signInWithDiscord() {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!supabase) throw new Error('Community is unavailable because Supabase has not been configured.');
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
          redirectTo: redirectTo || window.location.origin,
          scopes: 'identify email',
        },
      });
      if (oauthError) throw oauthError;
    } catch (caught) {
      setError(caught?.message || 'Discord sign-in could not be started. Please try again.');
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if (!supabase) throw new Error('Community is unavailable because Supabase has not been configured.');

      if (mode === 'forgot') {
        const redirectTo = `${window.location.origin}${RESET_REDIRECT_PATH}`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
        if (resetError) throw resetError;
        setMessage('If an account exists for this email, a password reset link has been sent. Please check your inbox.');
      } else if (mode === 'reset') {
        if (password.length < 12) throw new Error('Your new password must be at least 12 characters long.');
        if (password !== confirmPassword) throw new Error('The password confirmation does not match.');
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await supabase.auth.signOut();
        setPassword('');
        setConfirmPassword('');
        setMode('login');
        setMessage('Your password has been updated. Sign in with your new password.');
        window.history.replaceState({}, document.title, window.location.pathname);
      } else if (mode === 'signup') {
        if (password.length < 12) throw new Error('Your password must be at least 12 characters long.');
        const name = displayName.trim();
        if (name.length < 2 || name.length > 32) throw new Error('Display name must be between 2 and 32 characters.');
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: name } },
        });
        if (authError) throw authError;
        if (data?.session) {
          onAuthenticated?.(data.session);
          onClose();
        } else {
          setMessage('Account created successfully. Check your email for a confirmation link before signing in.');
        }
      } else {
        const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
        onAuthenticated?.(data.session);
        onClose();
      }
    } catch (caught) {
      const reason = caught?.message || 'Authentication failed.';
      setError(mode === 'signup' && /signups? not allowed|sign up is disabled|registration is disabled/i.test(reason)
        ? 'New account registration is disabled in Supabase. Enable user sign-ups in Auth settings to allow players to create Community accounts.'
        : reason);
    } finally {
      setBusy(false);
    }
  }

  const title = {
    login: 'Welcome back',
    signup: 'Create your account',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode];
  const intro = {
    login: 'Sign in to share recommendations, upvote posts, or report content.',
    signup: 'Create an account to share recommendations and help other players.',
    forgot: 'Enter the email address associated with your account. We will send a password reset link if the account exists.',
    reset: 'Enter a new password for your Community account.',
  }[mode];

  return (
    <div className="community-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="community-modal" role="dialog" aria-modal="true" aria-labelledby="community-auth-title">
        <button className="community-modal-close" type="button" onClick={onClose} aria-label="Close dialog"><X size={18} /></button>
        <span className="community-kicker">CARD EXCHANGE COMMUNITY</span>
        <h2 id="community-auth-title">{title}</h2>
        <p>{intro}</p>
        {(mode === 'login' || mode === 'signup') && <div className="community-oauth-group">
          <button className="community-discord-button" type="button" onClick={signInWithDiscord} disabled={busy}>
            {busy ? <LoaderCircle className="community-spin" size={16} /> : <MessageCircle size={16} fill="currentColor" />}
            <span>Continue with Discord</span>
          </button>
          <div className="community-auth-divider"><span>OR CONTINUE WITH EMAIL</span></div>
        </div>}
        <form className="community-form" onSubmit={submit}>
          {mode === 'signup' && <label className="community-field">Display name<input value={displayName} onChange={(event) => setDisplayName(event.target.value)} minLength={2} maxLength={32} autoComplete="nickname" required placeholder="Your public display name" /></label>}
          {(mode === 'login' || mode === 'signup' || mode === 'forgot') && <label className="community-field">Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="you@example.com" /></label>}
          {(mode === 'login' || mode === 'signup' || mode === 'reset') && <label className="community-field">{mode === 'reset' ? 'New password' : 'Password'}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'signup' || mode === 'reset' ? 12 : undefined} required placeholder={mode === 'login' ? 'Enter your password' : 'At least 12 characters'} /></label>}
          {mode === 'reset' && <label className="community-field">Confirm new password<input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={12} required placeholder="Enter the new password again" /></label>}
          {error && <p className="community-form-error" role="alert">{error}</p>}
          {message && <p className="community-form-success" role="status">{message}</p>}
          <button className="community-button community-button-primary" type="submit" disabled={busy}>
            {busy ? <LoaderCircle className="community-spin" size={16} /> : mode === 'login' ? <LogIn size={16} /> : mode === 'signup' ? <UserPlus size={16} /> : mode === 'forgot' ? <Mail size={16} /> : <KeyRound size={16} />}
            {busy ? 'Processing…' : mode === 'login' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'forgot' ? 'Send reset link' : 'Update password'}
          </button>
        </form>
        <div className="community-auth-switch">
          {mode === 'login' && <>
            <button type="button" onClick={() => changeMode('forgot')}>Forgot password?</button>
            <span className="community-auth-switch-separator">·</span>
            Don't have an account? <button type="button" onClick={() => changeMode('signup')}>Sign up</button>
          </>}
          {mode === 'signup' && <>Already have an account? <button type="button" onClick={() => changeMode('login')}>Sign in</button></>}
          {mode === 'forgot' && <>Remember your password? <button type="button" onClick={() => changeMode('login')}>Back to sign in</button></>}
          {mode === 'reset' && <span>Use a password you have not used before.</span>}
        </div>
        {mode !== 'reset' && <p className="community-privacy-note">Your email address is never shown publicly. Your display name appears on the recommendations you share.</p>}
      </section>
    </div>
  );
}
