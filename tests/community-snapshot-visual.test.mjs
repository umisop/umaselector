import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const section = await readFile(new URL("../src/components/CommunitySection.jsx", import.meta.url), "utf8");
const form = await readFile(new URL("../src/components/CommunityPostForm.jsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/community.css", import.meta.url), "utf8");

assert.match(section, /<section className="community-snapshot" aria-label="Core card inventory at submission">/, "community posts show the snapshot expanded instead of hiding it in a disclosure");
assert.match(section, /<CardImage card=\{card\} className="community-snapshot-image" \/>/, "published snapshots include each core card image");
assert.match(section, /formatLevel\(post\.card_levels\?\.\[card\.id\]\)/, "published snapshots show the submitted LB next to each card name");
assert.doesNotMatch(section, /<details className="community-snapshot">/, "the snapshot is no longer hidden behind a text-only disclosure");
assert.match(form, /<CardImage card=\{card\} className="community-snapshot-image" \/>/, "the post editor preview also uses card artwork");
assert.match(form, /formatLevel\(sourceLevels\?\.\[card\.id\]\)/, "the editor preview shows the LB for each core card");
assert.match(css, /\.community-snapshot-item[\s\S]*?align-items: center/, "snapshot is a compact image-and-label row");
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/, "the snapshot adapts to mobile widths");
console.log("Community core-card snapshot visual tests passed.");
