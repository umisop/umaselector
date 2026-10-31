import { normalizeGlobalSupportCards } from '../src/lib/supportCardCompare.js';

const SUPPORT_DATA_URL = 'https://beta.daftuyda.moe/assets/support_hints.json';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_BYTES = 8 * 1024 * 1024;
let cache = null;
let inFlight = null;

async function loadCatalog() {
  if (cache && cache.expiresAt > Date.now()) return cache.cards;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(SUPPORT_DATA_URL, { signal: controller.signal, headers: { Accept: 'application/json' } });
    } finally { clearTimeout(timeout); }
    if (!response.ok) throw new Error(`Support-card source returned HTTP ${response.status}.`);
    const finalUrl = new URL(response.url || SUPPORT_DATA_URL);
    if (finalUrl.origin !== new URL(SUPPORT_DATA_URL).origin) throw new Error('Support-card source redirected to an unsupported host.');
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw new Error('Support-card source is too large.');
    const text = await response.text();
    if (!text || text.length > MAX_BYTES) throw new Error('Support-card source returned empty or oversized data.');
    const raw = JSON.parse(text);
    const cards = normalizeGlobalSupportCards(raw);
    if (cards.length < 200) throw new Error(`Global catalog looks incomplete (${cards.length} cards); refusing to cache partial data.`);
    cache = { cards, expiresAt: Date.now() + CACHE_TTL_MS };
    return cards;
  })().finally(() => { inFlight = null; });
  return inFlight;
}

export default async function handler(req, res) {
  // Unique-effect parsing is calculation-critical; prevent stale normalized API data.
  // The upstream JSON is cached in-process for five minutes so parser/source changes surface quickly.
  res.setHeader('Cache-Control', 'no-store, max-age=0, must-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });
  try {
    const cards = await loadCatalog();
    return res.status(200).json({ schemaVersion: 10, sourceName: 'UmaTools Global support-card dataset', sourceUrl: 'https://beta.daftuyda.moe/guides/deck-tools', cardCount: cards.length, cards });
  } catch (error) {
    return res.status(502).json({ error: 'The Global support-card catalog could not be loaded.', detail: String(error?.message || error) });
  }
}
