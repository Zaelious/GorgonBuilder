# Gorgon Builder branding artwork

Optimized web copies of the two original Greek-mosaic artworks supplied by the GorgonBuilder product owner for T0022
(see `docs/UI_Visual_Redesign.md`). They are not generated, stock or hotlinked images, and they do not come from
Project Gorgon game data.

| Supplied source | Bundled files | Notes |
| --- | --- | --- |
| `mosaic_medusa_with_serpent_crown.png` — Gorgon bust, transparent background (1254×1254) | `mosaic-medusa-with-serpent-crown-{96,192,384}.webp` | Lossy WebP (q82) with alpha; header portrait. |
| `moonlit_gorgon_mosaic_ruins.png` — panoramic mosaic ruins banner (1916×821) | `moonlit-gorgon-mosaic-ruins-{960,1440,1916}.webp` | Lossy WebP (q72–74), full composition; header background, cropped by CSS only. |

Each file is a proportional Lanczos resize of the supplied image (no cropping, recoloring or retouching). The header
anchors the banner to the right and fades its left third so the banner's own Gorgon is not shown beside the portrait.
Regenerate from the supplied originals rather than re-encoding these files.
