## SSR catalog and images

Catalog scope: Global support cards marked SSR available through **2026-10-20**. Each catalog entry uses a GameTora card ID and a direct CDN image URL with this pattern:

`https://media.gametora.com/umamusume/supports/full/small/{CARD_ID}.png`

The catalog was mapped from the GameTora support list and Global support banner history:

- https://gametora.com/umamusume/supports
- https://gametora.com/umamusume/gacha/history-supports-2026
- https://gametora.com/umamusume/supports/30067-the-thrones-assemblage (Heirs to the Throne, SSR Group)
- https://gametora.com/umamusume/supports/30127-special-week (Special Week, SSR Stamina, 2026-10-20)
- https://gametora.com/umamusume/supports/30128-sweep-tosho (Sweep Tosho, SSR Wit, 2026-10-20)

Images are loaded directly from GameTora with lazy loading and a fallback when an image fails. These external URLs are not controlled by this project; if GameTora changes CDN paths, update the catalog entry. GameTora is an independent database and is not affiliated with Cygames.

## Creator workspace

The creator can add/edit scenarios, configure each core-card condition as Ignore / any level, Not owned, or LB0–LB4, then search for cards and add them to Universal, Front Runner, Pace Chaser, Late Surger, or End Closer. Each recommendation can be marked Recommended or Alternative, contain an optional note, and be reordered manually. Empty categories are allowed. No exchange logic or score is generated automatically.
