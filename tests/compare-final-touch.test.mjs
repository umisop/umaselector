import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../src/components/CompareCardsModal.jsx', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
const docs = readFileSync(new URL('../SUPPORT-CARD-COMPARE.md', import.meta.url), 'utf8');

assert.match(modal, /const scenario = 'grand-masters'/, 'scenario is fixed to Grand Masters');
assert.match(modal, /<MiniSelect label="Scenario" value="grand-masters" disabled/, 'scenario selector is visibly locked');
assert.doesNotMatch(modal, /<MiniSelect label="Max energy"/, 'max energy selector is removed from the UI');
assert.match(modal, /const maxEnergy = 120;/, 'max energy remains a fixed calculation baseline for energy-dependent unique passives');
assert.match(modal, /Energy-dependent passives use a fixed Max Energy baseline of 120\./, 'the fixed energy assumption is disclosed');
assert.match(modal, /maxEnergy: Number\(maxEnergy\)/, 'fixed max energy still reaches unique-passive calculations');
assert.doesNotMatch(modal, /Trainee \/ growth|GROWTH_PRESETS|customGrowthRates|compare-growth-custom-grid/, 'trainer/growth controls are removed');
assert.match(modal, /We apologize for any calculation inaccuracies\. Please consult UmaGuide or GameWith for reference training calculations\./, 'professional calculation disclaimer is shown beside other trainings');
assert.match(modal, /Reference: <a href="https:\/\/uma\.guide\/support-cards\/compare" target="_blank" rel="noreferrer">UmaGuide/, 'UmaGuide compare reference link is displayed beside base training');
assert.doesNotMatch(styles, /compare-growth-custom-grid/, 'unused trainee growth layout styles are removed');
assert.match(docs, /locked Grand Masters scenario/, 'compare documentation reflects the locked scenario');
assert.match(docs, /uma\.guide\/support-cards\/compare/, 'reference link is documented');

console.log('Compare final-touch UI tests passed.');
