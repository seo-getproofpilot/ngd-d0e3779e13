---
type: index
pilot: proposalpilot
---

# Template assets

| File | Source |
|---|---|
| `fonts/*.woff2` | `proofpilot-website/public/fonts` (Bebas Neue, Onest, Space Mono) |
| `img/logo-white.svg`, `logo-navy.svg`, `google-g.svg` | `proofpilot-website/public/images` |
| `img/logo-mark.svg` | ProofPilot chevron from the logo polygons |
| `img/marker-lime.svg`, `marker-blue.svg` | Homepage Figma brushstrokes (`fig/markers`) |
| `img/torn-standard.svg`, `torn-tall.svg` | Homepage Figma torn edges (`TornDivider.tsx`). Also inlined in the page CSS so masks work from file:// |
| `img/pledge-stamp.svg`, `founder-signature.svg` | Homepage `MeetMatthew.tsx`. The signature only renders when the rep is Matthew |
| `img/route-intelligence-dark.webp`, `revenue-signal-dark.webp`, `proof-wall-dark.webp`, `local-map-contours-light.webp` | Homepage brand texture library (`brand-textures`) |
| `img/hero-circuit-dark.webp`, `signal-rings-dark.webp`, `paper-warm-light.webp`, `ledger-lime-dark.webp` | Generated with Codex image generation for this page, 2026-09-29 |

The hero circuit texture fits electricians. For another trade, generate a matching backdrop and
point the hero `.tex` at it.
