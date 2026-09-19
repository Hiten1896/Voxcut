# Voxcut — Brand spec sheet

## Colors (exact values)
- **Vox (dark text)**: `#0f172a` on light backgrounds / `#f8fafc` on dark backgrounds
- **cut (accent)**: `#2563eb` on light backgrounds / `#60a5fa` on dark backgrounds
- Icon mark stroke: `#2563eb` (light bg) / `#3b82f6` (dark bg)
- Icon mark badge background: `#eff6ff` (light bg) / `rgba(37,99,235,0.12)` (dark bg)

Note: use the dark-background variants everywhere in the actual app, since Voxcut's UI is dark-themed. The light-background variants are for anything that renders on white (e.g. a printed doc, an email signature, a light-mode marketing page if one ever exists).

## Typography
- Font: Geist (already in the project via `next/font/google`) — fallback stack: `'Geist', 'Inter', -apple-system, 'Segoe UI', Arial, sans-serif`
- Wordmark weight: 600 (semibold)
- "Vox" and "cut" are one continuous word, no space — only the color changes between the two halves

## Files in this folder
- `public/favicon/favicon.ico` — multi-resolution browser favicon
- `public/favicon/favicon.svg` — scalable source for crisp high-DPI rendering
- `public/favicon/favicon-16.png` / `public/favicon/favicon-32.png` / `public/favicon/favicon-48.png` — standard PNG sizes if needed by a platform
- `public/favicon/favicon-180.png` — iOS home-screen icon size
- `public/favicon/favicon-512.png` — social / PWA fallback icon
- `public/favicon/wordmark.svg` — text-only “Voxcut” lockup, tuned for light backgrounds
- `public/favicon/lockup-dark-bg.svg` — icon + wordmark combined for dark surfaces
- `public/favicon/lockup-light-bg.svg` — icon + wordmark combined for light surfaces

## Where each asset goes in the app
- **Browser tab favicon**: `/favicon/favicon.ico`
- **Top nav bar logo (every screen)**: `/favicon/lockup-dark-bg.svg`
- **Landing page hero**: `/favicon/favicon.svg` or the icon portion of the lockup
- **iOS/PWA home screen icon**: `/favicon/favicon-180.png`
- **Social share preview / Open Graph image fallback**: `/favicon/favicon-512.png`

## Rules
- Never recolor "Vox" and "cut" to the same color — the two-tone split is the identifying mark of the wordmark
- Never use the icon mark without its rounded-square badge background when placed directly on a busy/photo background; on a flat dark surface (like the app nav bar) the badge can be omitted if it reads cleanly, as in the current lockup
- Minimum clear space around the lockup: roughly the height of the icon mark on all sides — don't crowd it against other nav bar elements
- Don't stretch or skew either the icon or the wordmark non-uniformly
