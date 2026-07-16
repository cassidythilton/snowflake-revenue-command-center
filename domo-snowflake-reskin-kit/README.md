# Domo + Snowflake Reskin Kit — Snowflake Revenue Command Center

Everything your coding agent needs to reskin an app to match the Domo design
system — same look, feel, branding, typography, and iconography — with an
approved Snowflake co-brand layer (Snowflake Blue accent, Snowflake marks, and
Cortex/Horizon iconography). Domo Blue stays dominant; Snowflake is the partner
accent and must never overpower it.

> **Provenance:** this kit is aligned as closely as possible to the
> **Warehouse Optimizer** app's `domo-reskin-kit/` (the agreed quality bar).
> Tokens, component CSS, `reference-dashboard.html`, and the Snowflake/Cortex
> brand SVGs are carried over verbatim; only the docs, brand registry, and app
> target are tuned for the **Snowflake Revenue Command Center**.

## How to use it

1. Drop this `domo-snowflake-reskin-kit/` folder into your app's repo (or
   somewhere your agent can read it) — it already lives beside
   `snowflake-command-center/`.
2. Open `RESKIN-PROMPT.md` (the app name + path are pre-filled for the Revenue
   Command Center) and paste the whole prompt block into your coding agent.
3. Let it read the references and pull the real assets, then review its plan.

## What's inside

```
domo-snowflake-reskin-kit/
├── README.md                   ← you are here
├── RESKIN-PROMPT.md            ← the prompt to paste into your agent
├── references/
│   ├── domo-styleguide.mdc     ← official Domo brand rules + Snowflake partner palette (highest authority)
│   ├── design-tokens.css       ← canonical :root tokens (Domo + Snowflake) — copy into your app
│   ├── styles.css              ← full component CSS (the pattern library)
│   ├── reference-dashboard.html← the design system applied end-to-end (match this bar)
│   └── analyzer.html           ← native Domo Analyzer chrome (look/feel reference)
├── assets/
│   ├── logos/                  ← Domo mark + app icon
│   └── brand/                  ← approved Domo + Snowflake SVGs (see below)
└── screenshots/                ← (optional) drop rendered reference screens here
```

### Brand assets in `assets/brand/`

- Domo product marks: `domo-ai-agent.svg`, `domo-approvals.svg`,
  `domo-cloud-amplifier.svg`, `domo-mcp-integrations.svg`, `domo-pdp.svg`,
  `domo-pro-code.svg`, `domo-workflows.svg`
- Domo glyph icons: `domo-link.svg`, `domo-data.svg`, `domo-join.svg`,
  `domo-sparkle.svg`, `domo-globe-hemisphere-west.svg`, `domo-chart-select.svg`,
  `domo-magic-wand.svg`
- Snowflake marks: `snowflake-full.svg` (full lockup), `snowflake-mark.svg` /
  `snowflake-individual.svg` (snowflake mark for header lockups),
  `snowflake-cortex.svg` (Cortex AI), `snowflake-color-palette-light.svg` /
  `snowflake-color-palette-dark.svg` (palette swatches)
- Co-brand lockup: `domo-snowflake-logo.svg` (Domo mark → hairline divider →
  Snowflake mark + word; Domo leads) — drop-in for the header brand row.

### Product-mark registry → Revenue Command Center surfaces

To stay aligned with the Warehouse Optimizer, we do **not** author bespoke
per-product SVGs for each Cortex sub-feature. Map surfaces to the existing marks
+ inline line icons instead:

| Surface / concept | Mark to use |
|---|---|
| Cortex Analyst · Cortex Agents · Cortex Search | `snowflake-cortex.svg` |
| Snowflake / Horizon / AI Data Cloud, header lockup | `snowflake-mark.svg` (+ `domo-snowflake-logo.svg` in the header) |
| Snowflake ML (Model Registry) · Hybrid Tables (Snowflake Ops) · CoWork · CoCo · managed MCP | inline **line icons** (24×24, `stroke-width:1.6`, `currentColor`) in the `styles.css` style — tinted with `--sf-blue` for Snowflake moments |
| Domo Workflows · AI Agent · Approvals · Cloud Amplifier · MCP · Pro-Code · PDP | matching `domo-*.svg` glyphs |

## The one rule that matters most

**No emojis. Ever.** Icons are either inline line/typeface SVG icons (the style
used in `styles.css` and `reference-dashboard.html`) or the approved Domo brand
SVGs in `assets/brand/`. This is spelled out in detail in `RESKIN-PROMPT.md` —
don't strip it out.

## Brand quick reference

- Domo Blue `#99CCEE` is dominant. Orange `#FF9922` is secondary. All other
  accents (violet `#776CB0`, sage `#ADD4C1`) are used sparingly and must never
  overpower Domo Blue.
- Neutrals: `#F1F6FA`, `#DCE4EA`, `#B7C1CB`, `#68737F`, `#3F454D`.
- Typography: Open Sans (Bold for titles, Light for subtitles, Regular for body)
  for UI; Roboto Mono for code/IDs/numbers.
- Flat panels, hairline borders, small radii, elevation only for overlays.

## Snowflake co-brand quick reference

- Snowflake Blue `#29B5E8` is the partner brand accent (logos, status chips,
  dots, accent fills). It is subordinate to Domo Blue and must never replace it
  as the dominant UI color.
- Because Snowflake Blue sits close to Domo Blue, use Star Blue `#11567F` for
  high-contrast partner action surfaces (primary partner buttons, active states).
- Snowflake Midnight `#1B2A3A` for dark partner ink. Blue ramp
  `#2CB6E8 → #B1E5F7` for charts/gradients.
- Lockup order: Domo mark → hairline divider → Snowflake mark → "Snowflake".
- Snowflake product naming: Snowflake AI Data Cloud, Snowflake Horizon
  (governance), Snowflake Cortex AI (`SNOWFLAKE.CORTEX.COMPLETE`), Cortex
  Analyst, Snowflake Arctic, Iceberg tables, Snowflake Tasks.

Full details live in `references/domo-styleguide.mdc` and
`references/design-tokens.css`.
