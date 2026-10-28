import seedConfig from '../data/seed.json';
import { supabase } from './supabase';

const CONFIG_KEY = 'main';
export const LOCAL_CONFIG_KEY = 'card-exchange-selector-preview-config-v2';

function normalizeConfig(config) {
  const source = config && typeof config === 'object' ? config : seedConfig;
  const rawIncomingCards = Array.isArray(source.cards) ? source.cards : [];
  const incomingCards = rawIncomingCards.map((card) => {
    if (!card || typeof card !== 'object') return card;
    const imageId = String(card.gameCardId || card.imageUrl?.match(/\/(\d+)\.png(?:\?.*)?$/)?.[1] || '');
    const sameGameCard = seedConfig.cards.find((defaultCard) => String(defaultCard.gameCardId || defaultCard.imageUrl?.match(/\/(\d+)\.png(?:\?.*)?$/)?.[1] || '') === imageId && imageId);
    if (!sameGameCard || String(card.id) === String(sameGameCard.id)) return card;
    return { ...sameGameCard, ...card, id: sameGameCard.id, gameCardId: imageId };
  }).filter(Boolean);
  const incomingById = new Map(incomingCards.map((card) => [String(card.id), card]));
  const coreDefaults = seedConfig.cards.filter((card) => card.isCore);
  const catalogDefaults = seedConfig.cards.filter((card) => !card.isCore);
  const cards = [
    // Core Card descriptions are source-controlled in seed.json. Persisted Supabase/local
    // configuration still controls recommendations and other card fields, but stale copies
    // of coreDescription must not mask edits made to the seed file.
    ...coreDefaults.map((card) => ({
      ...card,
      ...(incomingById.get(String(card.id)) || {}),
      isCore: true,
      coreDescription: card.coreDescription,
    })),
    ...catalogDefaults.map((card) => ({ ...card, ...(incomingById.get(String(card.id)) || {}), isCore: false })),
  ];
  incomingCards.forEach((card) => {
    if (cards.some((existing) => String(existing.id) === String(card.id))) return;
    cards.push({ ...card, isCore: false });
  });
  return { ...seedConfig, ...source, cards, scenarios: Array.isArray(source.scenarios) ? source.scenarios : [] };
}

function readLocalConfig() {
  try {
    const raw = window.localStorage.getItem(LOCAL_CONFIG_KEY);
    if (!raw) return seedConfig;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.cards) || !Array.isArray(parsed.scenarios)) return seedConfig;
    return normalizeConfig(parsed);
  } catch {
    return seedConfig;
  }
}

export async function getPublicConfig({ strict = false } = {}) {
  if (!supabase) {
    if (import.meta.env.PROD) {
      if (strict) throw new Error('Supabase is not configured for this production deployment. Configure Supabase before loading or editing live configuration.');
      return normalizeConfig(seedConfig);
    }
    return readLocalConfig();
  }
  const { data, error } = await supabase
    .from('card_exchange_config')
    .select('config, updated_at')
    .eq('id', CONFIG_KEY)
    .maybeSingle();

  if (error) {
    if (strict) throw new Error(`Could not load the latest saved configuration: ${error.message}`);
    console.warn('Could not load remote catalog; falling back to seed data.', error.message);
    return seedConfig;
  }
  if (!data?.config || typeof data.config !== 'object') {
    if (strict) throw new Error('No saved configuration row was found. Run the Supabase schema setup before editing the live configuration.');
    return seedConfig;
  }
  return normalizeConfig({ ...data.config, lastUpdated: data.updated_at ?? data.config.lastUpdated });
}

/** Save using optimistic concurrency so one dashboard session cannot silently overwrite another. */
export async function saveConfig(config, userId, expectedUpdatedAt = null) {
  const now = new Date().toISOString();
  const nextConfig = { ...config, lastUpdated: now };

  if (!supabase) {
    if (import.meta.env.PROD) {
      throw new Error('Saving is disabled in production until Supabase is configured. Configure Supabase and redeploy before publishing changes.');
    }
    window.localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(nextConfig));
    return { lastUpdated: now };
  }

  if (!expectedUpdatedAt) {
    throw new Error('The saved version could not be verified. Reload the latest configuration before saving.');
  }

  let query = supabase
    .from('card_exchange_config')
    .update({ config: nextConfig, updated_at: now, updated_by: userId })
    .eq('id', CONFIG_KEY)
    .eq('updated_at', expectedUpdatedAt);

  const { data, error } = await query.select('id, updated_at').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    throw new Error('Another dashboard session has saved changes since you loaded this configuration. Reload the latest version before saving to avoid overwriting their work.');
  }
  return { lastUpdated: data.updated_at || now };
}
