const STORAGE_KEY = 'card-exchange-selector-site-preferences-v1';
// Load the featured video by default for new visitors; honor an explicit saved opt-out.
const DEFAULT_PREFERENCES = Object.freeze({ externalMedia: true });

export function readSitePreferences() {
  if (typeof window === 'undefined') return { ...DEFAULT_PREFERENCES };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return { ...DEFAULT_PREFERENCES };
    const value = JSON.parse(stored);
    // Preserve visitors' explicit choice, including externalMedia: false.
    return { externalMedia: typeof value.externalMedia === 'boolean' ? value.externalMedia : DEFAULT_PREFERENCES.externalMedia };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function saveSitePreferences(preferences) {
  const value = { externalMedia: preferences?.externalMedia === true };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('site-preferences-change', { detail: value }));
  } catch (error) {
    throw new Error('Your browser could not save these preferences. Check its storage settings and try again.');
  }
  return value;
}

export function subscribeSitePreferences(callback) {
  if (typeof window === 'undefined') return () => {};
  const update = () => callback(readSitePreferences());
  window.addEventListener('site-preferences-change', update);
  window.addEventListener('storage', update);
  return () => {
    window.removeEventListener('site-preferences-change', update);
    window.removeEventListener('storage', update);
  };
}
