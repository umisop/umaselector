import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../src/components/CompareCardsModal.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const library = readFileSync(new URL('../src/lib/supportCardCompare.js', import.meta.url), 'utf8');

assert.match(modal, /uniquePassiveEnabled:\s*slot\?\.uniquePassiveEnabled !== false/, 'new card slots default each passive to ON unless explicitly turned off');
assert.match(modal, /function isPassiveEnabledForSlot\(slot, card\)/, 'unique passive state is resolved per card slot');
assert.match(modal, /getComparisonEffectEntries\(card, slot\.lb, facilityLevel, \{ \.\.\.mechanicsContext, uniquePassiveEnabled: isPassiveEnabledForSlot\(slot, card\) \}\)/, 'the switch controls the effect table on a per-card basis');
assert.match(modal, /uniquePassiveEnabled: isPassiveEnabledForSlot\(slot, card\)/, 'the switch controls the training calculation on a per-card basis');
assert.equal((modal.match(/<UniquePassiveToggle(?:\s|>)/g) || []).length, 2, 'toggle is rendered in both desktop matrix and mobile card layout');
assert.match(modal, /setSlots\(\(current\) => current\.map\(\(slot, slotIndex\) => slotIndex === index \? \{ id: card\.id, lb: Math\.min\(Number\(slot\.lb\) \|\| 0, 4\), uniquePassiveEnabled: true \} : slot\)\)/, 'replacing a card starts the newly selected unique passive ON');
assert.match(modal, /hasFacilityLevelScaledUniquePassive/, 'facility-level unique passives are handled automatically rather than by the generic toggle');
assert.match(library, /export function hasFacilityLevelScaledUniquePassive/, 'facility-level passive detection uses a shared mechanic-level helper');
assert.match(styles, /\.compare-unique-passive-toggle\.is-off/, 'OFF state has a distinct visual style');
assert.match(styles, /\.compare-facility-passive-note/, 'facility-level exception has a visible explanatory note');

console.log('Per-card unique passive toggle UI wiring tests passed.');
