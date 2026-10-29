export const SELECTOR_POOLS = [
  { id: "anniversary1", label: "1st Anniversary", maxTickets: 2, maxCardId: 30078, shortLabel: "1st Anniversary", maxCardName: "Matikanefukukitaru Speed & Admire Vega Power" },
  { id: "anniversary15", label: "1.5th Anniversary", maxTickets: 1, maxCardId: 30108, shortLabel: "1.5th Anniversary", maxCardName: "Maruzensky Speed & Nakayama Festa Wit" },
  { id: "anniversary2", label: "2nd Anniversary", maxTickets: 3, maxCardId: 30128, shortLabel: "2nd Anniversary", maxCardName: "Special Week Stamina & Sweep Tosho Wit" },
];

export const DEFAULT_TICKET_COUNTS = Object.freeze({ anniversary1: 0, anniversary15: 0, anniversary2: 1 });

export function getCardGameId(card) {
  const raw = card?.gameCardId ?? card?.id;
  const parsed = Number.parseInt(String(raw ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isCardAvailableInPool(card, poolId) {
  const pool = SELECTOR_POOLS.find((entry) => entry.id === poolId);
  const gameCardId = getCardGameId(card);
  return Boolean(pool && gameCardId !== null && gameCardId <= pool.maxCardId);
}

export function getPlannedTicketCounts(plan = []) {
  return (Array.isArray(plan) ? plan : []).reduce(
    (counts, entry) => {
      if (entry?.poolId && Object.prototype.hasOwnProperty.call(counts, entry.poolId)) counts[entry.poolId] += 1;
      return counts;
    },
    Object.fromEntries(SELECTOR_POOLS.map((pool) => [pool.id, 0])),
  );
}

export function getRemainingTicketCounts(ticketCounts = DEFAULT_TICKET_COUNTS, plan = []) {
  const planned = getPlannedTicketCounts(plan);
  return Object.fromEntries(SELECTOR_POOLS.map((pool) => [pool.id, Math.max(0, Number(ticketCounts?.[pool.id] || 0) - planned[pool.id])]));
}

/** Allocate the oldest compatible pool first, preserving newer tickets for newer cards. */
export function findCompatibleTicketPool(card, ticketCounts = DEFAULT_TICKET_COUNTS, plan = []) {
  const remaining = getRemainingTicketCounts(ticketCounts, plan);
  return SELECTOR_POOLS.find((pool) => remaining[pool.id] > 0 && isCardAvailableInPool(card, pool.id)) || null;
}

export function normalizeStartingLevel(value) {
  if (value === undefined || value === null || value === "") return null;
  const level = Number(value);
  return Number.isInteger(level) && level >= -1 && level <= 4 ? level : null;
}

/** One selector copy moves Not owned (-1) to LB0, then advances one LB at a time. */
export function applyRedeemsToLevel(startingLevel, redeemCount = 0) {
  const level = normalizeStartingLevel(startingLevel);
  if (level === null) return null;
  return Math.min(4, level + Math.max(0, Number(redeemCount) || 0));
}

/** Convert a projected level (starting level plus planned redeems) back to its base level. */
export function getStartingLevelForProjectedLevel(projectedLevel, redeemCount = 0) {
  const projected = normalizeStartingLevel(projectedLevel);
  if (projected === null) return null;
  const count = Math.max(0, Math.floor(Number(redeemCount) || 0));
  const starting = projected - count;
  return starting >= -1 && starting <= 4 ? starting : null;
}

/** Lowest projected level possible after a given number of planned exchanges. */
export function getMinimumProjectedLevel(redeemCount = 0) {
  const count = Math.max(0, Math.floor(Number(redeemCount) || 0));
  return Math.min(4, count === 0 ? -1 : count - 1);
}

export function getRedeemsForCard(plan = [], cardId) {
  return (Array.isArray(plan) ? plan : []).filter((entry) => String(entry?.cardId) === String(cardId));
}

export function getMaxRedeemsFromLevel(startingLevel) {
  const level = normalizeStartingLevel(startingLevel);
  return level === null ? 0 : 4 - level;
}

export function getNextLevel(currentLevel) {
  const level = normalizeStartingLevel(currentLevel);
  if (level === null || level >= 4) return null;
  return level === -1 ? 0 : level + 1;
}

export function getExchangeSequence(plan = [], startingLevels = {}) {
  const levels = { ...startingLevels };
  return (Array.isArray(plan) ? plan : []).map((entry, index) => {
    const key = String(entry.cardId);
    const currentLevel = normalizeStartingLevel(levels[key]);
    const nextLevel = getNextLevel(currentLevel);
    if (nextLevel !== null) levels[key] = nextLevel;
    return { ...entry, index, currentLevel, nextLevel };
  });
}
