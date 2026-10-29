import assert from 'node:assert/strict';

const values = new Map();
globalThis.window = {
  localStorage: {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { values.set(key, String(value)); },
  },
};

const { readSitePreferences } = await import('../src/lib/sitePreferences.js');
const key = 'card-exchange-selector-site-preferences-v1';

// New visitors should see the featured video without opening Cookie settings.
assert.deepEqual(readSitePreferences(), { externalMedia: true });

// A saved explicit opt-out must continue to be respected.
values.set(key, JSON.stringify({ externalMedia: false }));
assert.deepEqual(readSitePreferences(), { externalMedia: false });

// A saved opt-in remains enabled.
values.set(key, JSON.stringify({ externalMedia: true }));
assert.deepEqual(readSitePreferences(), { externalMedia: true });

// An older/partial saved record falls back to the default.
values.set(key, JSON.stringify({}));
assert.deepEqual(readSitePreferences(), { externalMedia: true });

console.log('YouTube default preference tests passed.');
