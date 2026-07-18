---
shaping: true
---

# "How It Works" tab — parity with the reference app (Shaping)

## Source

> the How It Works tab in our app is but a fraction of what the same tab in the
> reference app ('/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/')
> looks like. see [three screenshots]. I need you to take great care to affirm
> how to match the design depth, fidelity, detail and level of functionality in
> the reference app in our app. use your shaping skill to capture the
> requirements and tease apart the key parts of the solution that i have
> specified here.

Reference implementation:
- `dais-demo-scenarios/pattern4-agent-portal/index.html` — `#viewGuide` (lines ~502–573)
- `dais-demo-scenarios/pattern4-agent-portal/src/app.js` — `How It Works` section (lines ~2421–3002)
- `dais-demo-scenarios/pattern4-agent-portal/src/styles.css` — ~156 `.ta-/.arch-/.ac-/.guide-/.ha-subtab/.techarch/.flow-/.req-/.io-` rules

Our implementation:
- `snowflake-command-center/src/app.js` — `renderHow()` + helpers (lines ~3856–3940)

---

## Problem

Our "How It Works" tab is three **static, always-stacked** panels:

1. `howSpinePanel` — a 5-node spine rail (Predict → Explain → Act → Remember → Govern). Read-only.
2. `howArchPanel` — a 5-card grid (Data plane / AI plane / State / Interop / Delivery) with a maturity chip + bullets. Read-only.
3. `howCocoPanel` — the "Built with CoCo" builder narrative from a mock JSON.

The reference "How It Works" is a **three-view, sub-tabbed, interactive surface** — each view is its own deliverable at a depth our whole tab does not reach:

- **Solution Architecture** (executive): a context strip, a sources-&-ingestion strip, three governed planes of **clickable brand-marked cards**, a **live detail panel** that rewrites on click (lead + bullets + input/output/governed-by), a build-requirements row, and a "View lineage →" link.
- **Technical Architecture** (engineer): a **dark blueprint SVG stage** of the *real deployed system* — positioned component nodes across three regions, **drawn bezier integration edges with protocol labels**, **six selectable data-flow traces** that light up the request path, a **governance-boundary overlay** toggle, a **light/dark theme** toggle (persisted), and a **click-to-detail node panel** (contract/id, governed-by, in/out).
- **User Guide** (business): a numbered step-by-step walkthrough grid.

The gap is not cosmetic — we are missing an entire interactive information architecture (view switching, two interactive diagrams, a walkthrough) and the content depth behind it.

## Outcome

The Snowflake app's "How It Works" tab reaches **functional and visual parity** with the reference: the same three switchable views, the same interactivity (clickable cards/nodes, flow tracing, governance overlay, theme toggle, live detail panels), and the same content density — **re-authored truthfully against our real Snowflake + Domo deployment** (Cortex, Snowflake ML, Hybrid Tables, Horizon, Cloud Amplifier, the `snowflakece` Code Engine bridge), with no Databricks vocabulary left behind.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| **R0** | The "How It Works" tab matches the reference's design depth, fidelity, detail, and interactivity: three distinct, switchable views (Solution Architecture · Technical Architecture · User Guide) at the same level of polish and functionality. | Core goal |
| **R1** | **View shell & navigation** — icon sub-tabs (grid / network / bookmark) switch between the three panes; one pane visible at a time; ARIA `tablist`/`tab`/`aria-selected`; a sensible default view; tooltips per sub-tab. | Must-have |
| **R2** | **Solution Architecture view** (executive) — see R2.1–R2.6 below. | Must-have |
| R2.1 | Context strip: Industry · Primary users · Trigger · Outcome. | Must-have |
| R2.2 | Sources & ingestion strip: data generation → governed gold, and Cloud Amplifier live federation ("no copy"). | Must-have |
| R2.3 | Three governed planes of clickable, brand-marked cards: Snowflake · Governed Intelligence / Interop & Governance / Domo · Activation & Action (with an AGENT ⇄ AGENT tag on interop). | Must-have |
| R2.4 | Live detail panel that rewrites on card click: title, plane badge, lead paragraph, bullets, and Input / Output / Governed-by cells. | Must-have |
| R2.5 | Build-requirements row: Identity · Governance · Safety · Human-in-loop · Observability · State. | Must-have |
| R2.6 | 🟡 Governed-lineage affordance: "View Horizon lineage →" opens the governed object in Snowsight via the existing `snowsightObjHref()` helper + `SNOWSIGHT_BASE` (`https://app.snowflake.com/domoinc/domopartner`) — e.g. the `REVENUE_CC_ANALYST` semantic view / `SNOWFLAKE_REVENUE_CC.CORE` schema, where lineage is shown. | Must-have |
| **R3** | **Technical Architecture view** (engineer) — see R3.1–R3.6 below. | Must-have |
| R3.1 | Blueprint SVG stage: real component nodes positioned in a left→right topology, grouped under region headers (Domo · Integration Hub · Snowflake) with platform logos. | Must-have |
| R3.2 | Drawn integration edges (bezier) between nodes, each with a protocol/contract label. | Must-have |
| R3.3 | Selectable data-flow traces (one per demo capability) that highlight the participating nodes + edges and reveal each edge's protocol label. | Must-have |
| R3.4 | Governance-boundary overlay toggle (dashed identity/governance edges). | Must-have |
| R3.5 | Light/dark "blueprint" theme toggle, persisted to `localStorage`. | Must-have |
| R3.6 | Click-to-detail node panel: plane badge + logo, lead, Contract/id, Governed-by, In/Out. | Must-have |
| **R4** | **User Guide view** (business) — numbered step grid; plain-language walkthrough from "choose your persona" to "trust the governance", mapped to *our* tabs. | Must-have |
| **R5** | **Content accuracy** — every node, card, edge, flow, and step reflects our real Snowflake/Domo deployment (real object names: `SNOWFLAKE_REVENUE_CC.CORE`, `REVENUE_CC_ANALYST`, `REVENUE_CC_AGENT`, `REVENUE_CC_SEARCH`, `PREDICT_RENEWAL_RISK`, `SCENARIO_RUNS`/`PREDICTION_FEEDBACK`, `AGENT_ACTION_WRITEBACK`, `RAP_REGION`/`MASK_ARR`, `snowflakece`, Cloud Amplifier BYOS). Maturity labeled honestly. No Databricks terms. | Must-have |
| **R6** | **Visual fidelity** — matches our Domo styleguide design tokens (`design-tokens.css`, `kit-styles.css`), is responsive, and reaches the reference's finish (spacing, typography, blueprint depth, micro-interactions). 🟡 Brand marks: reuse existing SVGs in `public/brand/` + `domo-snowflake-reskin-kit/assets/brand/` (Snowflake: `snowflake-cortex`, `snowflake-hybrid-tables`, `snowflake-mark`, `domo-snowflake-logo`; full Domo set); **fall back to typeface/stroke glyphs where no mark exists**. | Must-have |
| **R7** | 🟡 **CoCo "how it was built" narrative** — kept as a **4th sub-tab** ("Built with CoCo"), preserving the builder story alongside the three reference views. | Decided |
| **R8** | **Self-contained & safe** — the diagrams are UI-only (no Code Engine calls); the tab renders identically in sample and live modes and never blocks on network. | Must-have |

---

## CURRENT: Three static stacked panels

| Part | Mechanism |
|------|-----------|
| CUR1 | `renderHow()` appends three `<section class="grid">` panels, always all visible — no sub-tabs. |
| CUR2 | `howSpinePanel` — static `SPINE[]` rail (5 nodes), no click behavior. |
| CUR3 | `howArchPanel` — static `ARCH[]` grid (5 cards), maturity chip + bullets, no detail panel. |
| CUR4 | `howCocoPanel` — `state.how.coco` from `./public/mock/cocobuild.json`. |

Gaps vs. reference: no view switching, no interactive Solution Architecture (context/ingestion/clickable cards/detail/build-reqs/lineage), no Technical Architecture blueprint at all, no User Guide.

---

## Shapes (pick one)

### A: Direct port — lift the reference and re-content it for Snowflake

| Part | Mechanism | Flag |
|------|-----------|:----:|
| A1 | Copy the reference `#viewGuide` markup, the `.ha-subtabs`/`.guide-pane` shell, and the ~156 `styles.css` rules into our app. | |
| A2 | Copy the reference JS (`FLOW_STAGES`, `ARCH_PLANES`, `BUILD_REQ`, `GUIDE_STEPS`, `TA_NODES/EDGES/FLOWS`, `renderArchitecture`/`renderTechArch`/`renderGuideSteps` + edge-drawing + flow-trace logic) verbatim. | |
| A3 | Rewrite all *content* (planes, nodes, edges, flows, steps, contracts) from Databricks → Snowflake. | |
| A4 | Reconcile the reference's raw-DOM + `markerHtml`/`BRAND_ICONS` helpers with our app's `h()` hyperscript + brand-asset conventions. | ⚠️ |
| A5 | Decide CoCo placement (R7). | ⚠️ |

### B: Rebuild in our idiom — reimplement all three views natively

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | Build the sub-tab shell + three panes with our `h()` helper and design tokens. | |
| B2 | Reimplement Solution Architecture (context/ingestion/planes/detail/build-reqs) from a fresh Snowflake data model. | |
| B3 | Reimplement Technical Architecture from scratch: node layout, **SVG bezier edge math**, **flow-trace state machine**, governance overlay, theme toggle, detail panel. | ⚠️ |
| B4 | Reimplement User Guide grid. | |
| B5 | Author all Snowflake content + brand marks; decide CoCo placement (R7). | ⚠️ |

### C: Hybrid — port the hard interactive logic, re-skin + re-content in our idiom

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **C1** | **View shell** — sub-tab nav + three panes built with our `h()` helper + design tokens (from B1). | |
| **C2** | **Solution Architecture** — port the reference's data-driven card/detail *pattern*, author a Snowflake `ARCH_PLANES`/`FLOW_STAGES`/`BUILD_REQ`/context/ingestion model, render via our `h()` + brand marks. | |
| **C3** | **Technical Architecture** — port the reference's *proven interactive engine as the spec* (SVG anchor/side/bezier math `taAnchor`/`taSides`/`taPath`/`drawTaEdges`, flow-trace `setTaFlow`, governance overlay, persisted theme, `selectTaNode` detail), re-expressed through our conventions; author a Snowflake `TA_NODES`/`TA_EDGES`/`TA_FLOWS`/`TA_REGIONS` model. | |
| **C4** | **User Guide** — Snowflake `GUIDE_STEPS[]` rendered as a numbered grid (from B4). | |
| **C5** | **Styling** — adapt the reference's `.ta-*`/`.arch-*`/`.ac-*`/`.guide-*` CSS to our `design-tokens.css`/`kit-styles.css` scales so it reads as native, not pasted. | |
| **C6** | **Brand assets** — map each node/card to a Snowflake/Domo mark; produce missing marks (Horizon, Cortex Analyst/Search/Agent, Model Registry, Hybrid Tables, guardrails, SQL API/warehouse, `snowflakece`). | ⚠️ |
| **C7** | **CoCo decision (R7)** — recommend: keep as a 4th "Built with CoCo" sub-tab so the builder story survives without diluting the executive view. | ⚠️ |

---

## Fit Check

| Req | Requirement | Status | A | B | C |
|-----|-------------|--------|---|---|---|
| R0 | Match reference depth/fidelity/detail/interactivity across three switchable views | Core goal | ✅ | ✅ | ✅ |
| R1 | View shell & navigation (icon sub-tabs, a11y, default, tooltips) | Must-have | ✅ | ✅ | ✅ |
| R2 | Solution Architecture view (context/ingestion/planes/detail/build-reqs/lineage) | Must-have | ✅ | ✅ | ✅ |
| R3 | Technical Architecture view (nodes/edges/flows/overlay/theme/detail) | Must-have | ✅ | ❌ | ✅ |
| R4 | User Guide view | Must-have | ✅ | ✅ | ✅ |
| R5 | Content accuracy (real Snowflake/Domo objects, no Databricks terms) | Must-have | ❌ | ✅ | ✅ |
| R6 | Visual fidelity to our Domo styleguide tokens (native, not pasted) | Must-have | ❌ | ✅ | ✅ |
| R8 | Self-contained & safe (UI-only, sample+live) | Must-have | ✅ | ✅ | ✅ |

**Notes:**
- A fails R5/R6: a verbatim lift keeps the reference's raw-DOM + Databricks-tuned CSS; retro-fitting it to our idiom + content is error-prone and tends to leave Databricks residue and off-token styling (A4/A5 flagged).
- B fails R3: rebuilding the blueprint's SVG edge math + flow-trace engine from scratch (B3 flagged) risks not reaching the reference's interactive fidelity — the exact thing the user is asking us to match.
- C passes all: it reuses the reference's *proven* interactive logic (guaranteeing R3 fidelity) while authoring native content (R5) and native styling (R6). Remaining flags are content/asset tasks (C6/C7), not mechanism unknowns.

**Recommendation: Shape C** — highest-fidelity Technical Architecture (borrow the working engine) with fully native, accurate Snowflake content and styling. **✅ Selected.**

---

## Detail C: the four views

Selected shape **C = C1 + C2 + C3 + C4 + C5 + C6 + C7**. 🟡 Per R7, the tab has **four** sub-tabs (the reference's three + our "Built with CoCo"). The tab decomposes into vertical slices, each ending in a demo-able view:

| Slice | View | Contains | Ends in |
|-------|------|----------|---------|
| V1 | Shell | C1 sub-tab nav (🟡 four tabs) + empty panes, default = Solution Architecture, a11y + tooltips | Switchable (empty) tab |
| V2 | Solution Architecture | C2 context + ingestion + 3 planes + live detail panel + build-reqs + lineage link; C5 styling; C6 marks | Clickable executive diagram |
| V3 | Technical Architecture | C3 nodes/edges/flows/overlay/theme/detail engine; C5 blueprint styling; C6 marks | Interactive blueprint |
| V4 | User Guide | C4 numbered Snowflake step grid; C5 styling | Walkthrough |
| V5 | Built with CoCo | 🟡 C7 existing CoCo narrative moved into a dedicated 4th sub-tab (reuse `howCocoPanel` content) | Builder narrative preserved |

### Snowflake content translation map (reference → ours)

| Reference (Databricks) | Ours (Snowflake) |
|------------------------|------------------|
| Unity Catalog (governance/source of truth) | Snowflake Horizon (`RAP_REGION`, `MASK_ARR`, lineage, roles) |
| Delta gold views | Governed gold views in `SNOWFLAKE_REVENUE_CC.CORE` |
| Genie Space (NL→SQL) | Cortex Analyst (`REVENUE_CC_ANALYST` semantic view) |
| Agent Bricks MAS (supervisor) | Cortex Agent (`REVENUE_CC_AGENT`, Analyst + `REVENUE_CC_SEARCH`) |
| Model Serving (regressor v6) | Snowflake ML native inference (`PREDICT_RENEWAL_RISK`, Model Registry) |
| Lakebase (OLTP state) | Snowflake Hybrid Tables (`SCENARIO_RUNS`, `PREDICTION_FEEDBACK`) |
| Unity AI Gateway (guardrails) | Cortex guardrails + observability |
| Code Engine bridge (`pattern4ce`) | `snowflakece` Code Engine bridge (SQL API, key-pair JWT) |
| Cloud Amplifier (Databricks Raptor AWS) | Cloud Amplifier BYOS (`domopartner.us-east-1`, federated — no copy) |
| SQL Warehouse | `REVENUE_CC_WH` warehouse / SQL API |
| MLflow traces | Cortex/ML observability + writeback audit |
| Domo (Pro-code app, Workflow, Approvals, Agent Catalyst, PDP) | Unchanged — same Domo activation layer |

### Technical Architecture data flows (proposed, mirror our real demo capabilities)

| Flow | Trace |
|------|-------|
| F1 · Live federation | App → Federated DataSets → Cloud Amplifier → SQL API → gold views (no copy) |
| F2 · Ask Cortex Analyst | App → `snowflakece` → Cortex Analyst → generated SQL → warehouse → rows |
| F3 · Score account | App → `snowflakece` → `PREDICT_RENEWAL_RISK` (native ML) → score |
| F4 · Agent + writeback | App → Workflow → Agent Catalyst → Cortex Agent → approval → `writeActionStatus` → `AGENT_ACTION_WRITEBACK` |
| F5 · Hybrid Table state | App → `snowflakece` → Hybrid Tables (`SCENARIO_RUNS`/`PREDICTION_FEEDBACK`) |
| F6 · AI Readiness sync | Horizon prepared metadata → `snowflakece` → Domo AI Readiness |

---

## Open questions (to resolve before/while slicing)

| # | Question | Status |
|---|----------|--------|
| Q1 | 🟡 **CoCo (R7):** keep as a 4th sub-tab. | ✅ Decided — 4th sub-tab |
| Q2 | 🟡 **Node "Contract/id":** show **object names only** (`REVENUE_CC_ANALYST`, `SNOWFLAKE_REVENUE_CC.CORE`, etc.); real IDs can be swapped in later. | ✅ Decided — names only |
| Q3 | 🟡 **Brand marks (C6):** reuse existing marks in `public/brand/` + reskin-kit; fall back to typeface/stroke glyphs where none exists (no new marks required). | ✅ Decided — reuse + glyph fallback |
| Q4 | 🟡 **Lineage link (R2.6):** open Snowsight via existing `snowsightObjHref()` + `SNOWSIGHT_BASE`; no new URL needed. | ✅ Decided — Snowsight deep-link |
| Q5 | 🟡 **Context strip:** fixed narrative (matches the reference), not persona-reactive. | ✅ Decided — fixed |
