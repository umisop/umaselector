import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../src/components/CompareCardsModal.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');

assert.match(modal, /<span>Passive<\/span><strong>\{hasUnique \? \(enabled \? 'ON' : 'OFF'\) : '—'\}<\/strong>/,
  'passive label and ON/OFF pill remain distinct inline elements');
assert.match(modal, /compare-facility-passive-full.*Facility-level passive.*compare-facility-passive-short.*Facility auto/s,
  'facility-scaled passives have a shorter mobile label');
assert.match(styles, /\.compare-unique-passive-toggle\s*\{[^}]*flex-wrap:\s*nowrap;[^}]*white-space:\s*nowrap;/s,
  'passive button prevents wrapping');
assert.match(styles, /@media \(max-width:\s*700px\)\s*\{[\s\S]*?\.compare-matrix-card-head \.compare-unique-passive-toggle\s*\{[^}]*gap:\s*2px;[^}]*font-size:\s*6\.2px;[^}]*white-space:\s*nowrap;/s,
  'mobile six-column matrix uses compact single-line passive controls');
assert.match(styles, /\.compare-matrix-card-head \.compare-facility-passive-full\s*\{\s*display:\s*none;\s*\}/,
  'long facility passive label is hidden on mobile');
assert.match(styles, /\.compare-matrix-card-head \.compare-facility-passive-short\s*\{\s*display:\s*inline;/,
  'short facility passive label is shown on mobile');

console.log('Mobile passive toggle layout tests passed.');
