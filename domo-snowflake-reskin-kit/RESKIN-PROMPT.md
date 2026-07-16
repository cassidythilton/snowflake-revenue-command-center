# Reskin Prompt — paste this into your coding agent

> Copy everything inside the horizontal rules below into your coding agent. Drop
> the whole `domo-snowflake-reskin-kit/` folder into your project first (or point
> the agent at it) so it can read the references and pull the real logo/brand
> assets. The app name + path are pre-filled for the Snowflake Revenue Command
> Center — adjust if reusing this kit for another app.

---

You are reskinning the **Snowflake Revenue Command Center** — a governed Domo
App Studio delivery + action portal over Snowflake (predict, explain, act,
remember, govern), to match the **Domo design system with a Snowflake
co-brand**. The current code lives at
**`snowflake-command-center/`** (pro-code vanilla JS + `ryuu.js` app). Do not
change behavior, routes, data, or business logic — this is a **visual reskin
only**: styling, layout chrome, typography, color, iconography, and brand
assets.

Domo Blue is the dominant brand color. Snowflake is the **partner accent** —
Snowflake Blue `#29B5E8` for brand moments (logos, status chips, dots, accent
fills) and the deeper Star Blue `#11567F` for high-contrast partner actions
(primary partner buttons, active states). Snowflake must **never** overpower
Domo Blue.

## Source of truth (read these first, in this order)

A folder named `domo-snowflake-reskin-kit/` has been added to the project. Read
it completely before writing any code:

1. `references/domo-styleguide.mdc` — the official Domo brand rules (colors,
   fonts, how accents may be used) plus the Snowflake partner palette. This is
   the highest authority. Domo Blue `#99CCEE` is the dominant color; orange
   `#FF9922` is secondary; accents (violet, sage) and the Snowflake partner
   blues must **never** overpower Domo Blue.
2. `references/design-tokens.css` — the canonical `:root` token block. Copy this
   into the app and theme **everything** off these CSS variables. Do not
   introduce new one-off hex values when a token already exists.
3. `references/styles.css` — the full component CSS. Treat this as the pattern
   library: header, KPI cards, panels, tables, pills/badges, status chips, tabs,
   buttons, dropdowns, drawers, charts, forms, process timelines, code blocks,
   insight rails, footer. Mirror these patterns and class conventions instead of
   inventing new ones.
4. `references/reference-dashboard.html` — the design system applied end-to-end
   (header, tabs, KPI row, panels, chart, table, timeline, drawer). This is your
   visual + structural bar. Match it.
5. `references/analyzer.html` — the native Domo Analyzer chrome, for reference on
   how a real Domo surface feels (header, tabs, dense panels, spacing).
6. `assets/` — the real, approved Domo logo and product SVGs (see Iconography).

If anything in my app conflicts with the styleguide or tokens, the
styleguide/tokens win.

## Absolute rule: NO EMOJIS. EVER.

This is non-negotiable and applies to **everything you produce** — UI text,
buttons, labels, headings, empty states, tooltips, toasts, placeholder copy,
chart labels, code comments, commit messages, and your chat responses.

- **Never** use emoji or pictographic/emoji-style Unicode characters (no 🚀, ✅,
  📊, ⚠️, 🎉, ❌, 🔥, etc.) anywhere in the app or its content.
- For icons, you may use **only** one of these two approaches:
  1. **Typeface / line icons** — inline SVG line icons in the style already used
     in `references/styles.css` (24×24 viewBox, `fill="none"`,
     `stroke="currentColor"`, `stroke-width:1.6`, round caps/joins). Keep them
     monochrome and let them inherit color via `currentColor`. Reuse the existing
     icon set rather than inventing divergent styles.
  2. **Approved Domo + Snowflake brand SVGs** — the product marks in
     `assets/brand/`: Domo product marks (Domo AI Agent, Domo Approvals, Domo
     Cloud Amplifier, Domo MCP Integrations, Domo PDP, Domo Pro-Code, Domo
     Workflows), Domo glyph icons (`domo-link`, `domo-data`, `domo-join`,
     `domo-sparkle`, `domo-globe-hemisphere-west`, `domo-chart-select`,
     `domo-magic-wand`), and Snowflake marks (`snowflake-full`,
     `snowflake-mark` / `snowflake-individual`, `snowflake-cortex`).
- Plain typographic glyphs that are already part of the UI vocabulary are fine
  (e.g. `→ ↗ ← · — ✓ ▲ ▼` arrows/checks/middots used in the reference CSS).
  Decorative emoji are not.
- If you're ever tempted to reach for an emoji to convey status or meaning, use a
  status pill / colored dot / line icon from the system instead.

## Brand assets (use these exact files)

Wire these in from `assets/` — do not regenerate, recolor, or trace your own
versions:

- `assets/logos/domo-logo.png` — the Domo mark (use in the header brand lockup
  via the `.logo-chip` pattern in `styles.css`)
- `assets/logos/app-icon.png` — app icon
- `assets/brand/*.svg` — approved Domo + Snowflake marks for features, nav,
  dataset tiles, and diagrams. Surface → mark mapping for this app:
  - **Cortex Analyst / Cortex Agents / Cortex Search** → `snowflake-cortex.svg`
  - **Snowflake / Horizon / AI Data Cloud** and the header → `snowflake-mark.svg`
  - **Snowflake ML (Model Registry) · Hybrid Tables (Snowflake Ops) · CoWork ·
    CoCo · managed MCP** → inline **line icons** (24×24, `stroke-width:1.6`,
    `currentColor`), tinted `--sf-blue` for Snowflake moments — do **not**
    invent new brand SVGs for these (stay aligned to the reference app)
  - **Domo Workflows / AI Agent / Approvals / Cloud Amplifier / MCP / Pro-Code /
    PDP** → the matching `domo-*.svg` glyph

Co-brand lockup: use `assets/brand/domo-snowflake-logo.svg` (Domo mark →
hairline divider → Snowflake mark + word; Domo leads) as the drop-in header
lockup, or compose it from `domo-logo.png` + `snowflake-mark.svg` following the
same order. Domo always leads.

## Look & feel to reproduce

- **Typography:** Open Sans (300/400/600/700/800) for all UI — Bold for titles,
  Light for subtitles, Regular for body; Roboto Mono for code, IDs, and
  table-style numbers. Load both from Google Fonts (link in `design-tokens.css`).
  Use tabular numbers (`font-variant-numeric: tabular-nums`) for metrics.
- **Color discipline:** Domo Blue dominant; orange/violet/sage as sparing accents
  only. Snowflake Blue `#29B5E8` is the partner accent (brand moments), with
  Star Blue `#11567F` for high-contrast partner actions — both subordinate to
  Domo Blue. Backgrounds are the soft neutral `--bg` with the subtle blue radial
  wash from the reference body style.
- **Chrome:** flat panels — hairline `--line` borders, small radii
  (`--r-md`/`--r-sm`), **no drop shadows on panels**. Reserve elevation
  (`--shadow-md`/`--shadow-lg`) for true overlays only (modals, drawers, menus).
- **Components:** reuse the reference patterns — KPI cards with the colored left
  accent bar; uppercase micro-labels with letter-spacing; pill badges/status
  chips with a leading dot; underlined-on-hover link buttons; tab bars with a
  2px bottom-border active state; tables with uppercase thead and right-aligned
  numeric cells.
- **Density:** compact, "native Domo analyzer" feel — 13px base, tight but
  breathable spacing. Match `reference-dashboard.html`.
- **Motion:** subtle only (150–250ms ease transitions, gentle hover lifts). No
  flashy animations.

## How to work

1. Read the kit, then audit my app's current screens/components.
2. Propose a short mapping of my existing components → the reference patterns
   before mass-editing, and confirm the token wiring.
3. Replace ad-hoc colors/spacing/fonts with the design tokens.
4. Swap any emoji or off-brand icons for line icons or approved Domo brand SVGs.
5. Apply the chrome, typography, and component styling across all screens.
6. Keep it responsive and accessible (focus states, color contrast, aria labels
   as in the reference).
7. Do a final pass to confirm **zero emojis** anywhere and that only approved
   assets/icon styles are used.

When done, give me a brief summary of what changed and flag anything in my app
that didn't map cleanly to the system so I can decide.

---
