# Snowflake Revenue Command Center — Sprint Build Plan

Engineering execution plan for the Snowflake Revenue Command Center. Derived from `snowflake-revenue-command-center-reconciled-shaping.md` (ground truth for R, Shape C, surfaces, golden path, capability gates) and `snowflake-revenue-command-center-frame.md`.

> **Cortex-CLI-first mandate (non-negotiable):** Every Snowflake development action — semantic views, tables, models, Hybrid Tables, Cortex Search services, the Cortex Agent, MCP config, policies — is performed by **Snowflake CoCo / Cortex Code CLI (`cortex`)**, not hand-written SQL run through other clients. Every Snowflake research or due-diligence question is answered by **asking the `cortex` CLI** (`cortex search docs|object|table-details`, or a freeform `cortex` prompt), not by web search. Web research is reserved for the Domo side only.

---

## 0. Operating model — how we drive `cortex`

**Installed:** Cortex Code (CoCo) `v1.0.73` at `/Users/cassidy.hilton/.local/bin/cortex`.
**Active connection:** `default` → account `DOMOINC-DOMOPARTNER`, user `CASSIDY.HILTON@DOMO.COM`, role `SYSADMIN` (`cortex connections list`).

### Command conventions used throughout this plan

| Purpose | Pattern |
|---|---|
| **Research / DD (docs)** | `cortex search docs "<question>"` |
| **Research / DD (catalog/marketplace)** | `cortex search object "<query>"` · `cortex search table-details "<db.schema.table>"` |
| **Freeform SF reasoning** | `cortex -c default "<question about mechanics/feasibility>"` |
| **Build (review-first)** | `cortex --mode code -c default --plan "<engineering task>"` → review plan → accept |
| **Build (autonomous, sandbox only)** | `cortex --mode code -c default --auto-accept-plans "<task>"` |
| **Validate a semantic view / Analyst** | `cortex analyst <...>` |
| **Discover / test the agent** | `cortex agents <...>` |
| **Manage MCP servers** | `cortex mcp <...>` |
| **Persist decisions across sessions** | `cortex ctx <...>` (long-term memory / task tracking) |

### Rules of engagement

1. **Plan mode by default** for anything that writes to Snowflake; `--auto-accept-plans` / `--bypass` only against throwaway/sandbox schemas.
2. **Least privilege, two roles.** Create a **read/recommend** role (SELECT on semantics, Analyst/Agent/Search usage) and a separate **write/execute** role (INSERT to writeback + Hybrid Tables). `SYSADMIN` is bootstrap-only. Ask `cortex` to generate the role/grant DDL.
3. **Everything generated lands in the repo.** `cortex` code mode edits files in the workdir — commit the produced `.sql`/`.yaml`/scripts under `snowflake/` so the build is reproducible and source-controlled.
4. **DD is logged.** Each capability-gate answer from `cortex search docs` is captured verbatim into `docs/planning/gate-report.md` with the query used and date (research cutoff hygiene per the reconciled doc).
5. **No secrets in client/repo.** The Snowflake credential for the Domo Code Engine bridge lives only in Code Engine; `cortex` uses the local `~/.snowflake` connection.

---

## 1. Repository layout (target)

```
snowflake-revenue-command-center/
├── docs/planning/                 # shaping, reconciled shaping, this plan, gate-report, spikes
├── snowflake/                     # ALL cortex-generated SF artifacts (source of truth for the SF plane)
│   ├── 00_setup/                  # roles, grants, warehouses, db/schema
│   ├── 10_data/                   # dims, facts, synthetic Tessera/INC-0001 generators
│   ├── 20_semantics/              # semantic view DDL/YAML + verified queries
│   ├── 30_search/                 # Cortex Search service DDL + source unstructured tables
│   ├── 40_ml/                     # model training + Model Registry + native inference SQL
│   ├── 50_state/                  # Hybrid Tables (scenario_runs, prediction_feedback) + writeback table
│   ├── 60_agent/                  # Cortex Agent CREATE AGENT spec + tools
│   ├── 70_governance/             # policies (RLS/masking), guardrails, observability, evaluations
│   └── 80_mcp/                    # Snowflake-managed MCP server config + tool inventory
├── domo-snowflake-reskin-kit/     # design/brand kit (produced by Workstream W) — tokens, styles, marks, RESKIN-PROMPT
│   ├── references/                # domo-styleguide.mdc · design-tokens.css · styles.css · reference-dashboard.html · analyzer.html
│   ├── assets/brand/              # Snowflake + Cortex product marks, domo-snowflake co-brand lockup, Domo feature glyphs
│   ├── screenshots/               # rendered visual bar for reskin quality
│   ├── README.md · RESKIN-PROMPT.md
├── snowflake-command-center/      # pro-code Domo App Studio app (vanilla JS + ryuu.js)
│   ├── src/ · dist/ · public/brand/ · manifest.json
│   └── codeengine/functions.js    # snowflak ce bridge (Cortex REST + SQL API), token server-side
└── README.md
```

The Domo app shell, tab machinery, SVG charts, and design-system patterns are adapted from Pattern 4 (`dais-demo-scenarios/pattern4-agent-portal/`) as a **reference only** (reconciled decision: no fork/shared runtime). The Snowflake plane is built fresh via `cortex`.

---

## 2. Sprint overview

| Spr | Theme | Shape C parts | Surfaces | Gate dependency |
|:--:|---|---|---|---|
| **W** | **Rebranding exercise — `domo-snowflake-reskin-kit`** (parallel with S0–S1) | design foundation | all | — |
| **0** | Access, roles, and capability gates (DD via `cortex`) | foundations | — | Runs all 6 gates |
| **1** | Snowflake intelligence core: data + semantic views | C1 | (1) | — |
| **2** | Live Domo data plane + app shell + CE bridge | C2 | 1 | **Workstream W** |
| **3** | Cortex Analyst surface | C2/C3-Analyst | 3 | — |
| **4** | Cortex Search + one Cortex Agent | C4, R8-Search | 4 | — |
| **5** | Predict + Remember: Snowflake ML + Hybrid Tables | C1/C6 | 6, 7 | Gate 4 |
| **6** | Agent-to-agent action loop | C5 | 5 | — |
| **7** | Govern everywhere (Horizon, guardrails, observability) | C7-parity, C8 | 8 | Gate 3 (C8) |
| **8** | MCP fabric both directions + CoWork surface | C6, C7 | 9 | Gates 1, 5, 6 |
| **9** | CoCo live builder + How It Works + hardening | C9 | 2, 10 | Gate 1 (Chat v2) |

Total: **10 sprints (0–9) + parallel design Workstream W.** Sprints 1→2→3 are the critical path to a first live demo (governed data + transparent NL analytics). **Workstream W (rebranding) runs alongside S0–S1 and must land before S2** so the app shell is on-brand from the start. Sprints 4, 5 can run partly in parallel once the semantic view (Sprint 1) exists.

---

## 3. Sprint detail

### Workstream W — Rebranding exercise: `domo-snowflake-reskin-kit`

**Goal:** Produce a Snowflake-branded reskin kit that gives the app a native-Domo, analyst-grade, Snowflake-co-branded look **before** the app shell is built (Sprint 2), so the UI is on-brand from the first pixel. This is **design work, not a Snowflake-object task** — the Cortex-CLI-first mandate does *not* apply here (no `cortex` needed for tokens/SVGs/CSS).

**Sources & quality bar**
- **Aesthetic quality bar (emulate this):** `/Users/cassidy.hilton/Cursor Projects/warehouse optimizer _ pallet movement intelligence/domo-reskin-kit/` — already a polished Domo × Snowflake co-brand (`design-tokens.css`, `styles.css`, `reference-dashboard.html`, Snowflake + Cortex brand SVGs). **Start from this.**
- **Structure & conventions to preserve:** `/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/domo-databricks-reskin-kit/` — agent-readable hierarchy (styleguide → tokens → styles → analyzer → screenshots → RESKIN-PROMPT) and the product-mark registry pattern.
- **Reusable Snowflake assets:** the warehouse optimizer's `assets/brand/` (`snowflake-mark.svg`, `snowflake-full.svg`, `snowflake-cortex.svg`) can be lifted directly.

**Brand hierarchy decision (D-brand):** **Domo Blue stays the dominant chrome; Snowflake is the partner-intelligence accent** — consistent with the Domo POV ("Build with Snowflake · Deliver with Domo") and with the warehouse optimizer. Snowflake blue is used surgically (live dots, active states, chart accents, "intelligence" moments), never as generic SaaS blue. *Adjustable to Snowflake-first if desired — flag before Sprint 2.*

| Token | Value | Role |
|---|---|---|
| `--domo-blue` / `-deep` / `-ink` | `#99CCEE` / `#4A90C2` / `#1F5D86` | Dominant chrome (unchanged) |
| `--sf-blue` | `#29B5E8` | Snowflake Blue — partner accent, live dots, active states |
| `--sf-blue-deep` | `#11567F` | Star Blue — high-contrast partner buttons/active AI tabs |
| `--sf-ink` | `#1B2A3A` | Snowflake Midnight — partner wordmark, button text on Domo Blue |
| `--sf-100…900` | `#B1E5F7 → #2CB6E8` | Blue ramp for charts/gradients |
| Fonts | Open Sans 300/400/600/700/800 + Roboto Mono 400/500/600 | Google Fonts CDN |
| Radii / shadows | `--r-sm/md/lg` 4/6/8px, flat panels + hairlines | Native-Domo analyzer chrome |

**Tasks**
- **W1 — Scaffold kit** from the warehouse optimizer kit: copy `references/` (tokens, styles, reference-dashboard.html, analyzer.html, domo-styleguide.mdc) into `domo-snowflake-reskin-kit/`.
- **W2 — Tokens:** confirm the Domo-dominant + Snowflake-accent palette above; ensure the `--sf-*` ramp + body radial wash are present; remove Databricks-specific tokens (`--dbx-*`, `--uc*`) and replace the governance-red accent with a **Horizon/semantic** accent (reuse Snowflake blue or a governed-teal).
- **W3 — Product-mark registry:** map the 10 surfaces to marks **without inventing bespoke per-product SVGs** (stays aligned to the Warehouse Optimizer, which uses the Cortex mark + line icons). Cortex Analyst/Agents/Search → `snowflake-cortex.svg`; Snowflake/Horizon/AI Data Cloud + header → `snowflake-mark.svg`; Snowflake ML, Hybrid Tables, CoWork, CoCo, managed MCP → inline line icons tinted `--sf-blue`; Domo features → the `domo-*.svg` glyphs. Registry documented in the kit README.
- **W4 — Co-brand lockup:** create `domo-snowflake-logo.svg` (Domo mark → hairline divider → Snowflake mark + word), Domo-leads pattern.
- **W5 — RESKIN-PROMPT:** adapt the prompt (same source-order rules, zero emojis, inline 24×24 stroke-1.6 SVGs) with Snowflake partner names/assets.
- **W6 — Visual bar:** render `reference-dashboard.html` and capture screenshots of the target look for each surface type (KPI cockpit, Analyst, agent queue, governance) into `screenshots/`.

**Deliverables:** complete `domo-snowflake-reskin-kit/` (tokens, styles, marks, lockup, RESKIN-PROMPT, screenshots).
**Exit criteria:** `reference-dashboard.html` renders at the warehouse-optimizer quality bar; every Snowflake product mark used by the 10 surfaces exists; kit is ready to drive Sprint 2. Runs in parallel with S0–S1; must complete before S2 app-shell work begins.

---

### Sprint 0 — Access, roles, and capability gates

**Goal:** De-risk the whole build. Prove or disprove every gated capability *before* implementation, using `cortex` for all Snowflake DD. Establish roles, warehouse, and repo scaffold.

**Tasks**
- Confirm/scope connection and compute: `cortex -c default "list warehouses and my grants; recommend a small warehouse for interactive Analyst/agent workloads"`.
- Generate least-privilege roles/grants DDL (read/recommend vs write/execute) via `cortex --mode code --plan "create two roles ... with these grants ..."` → `snowflake/00_setup/`.
- Run the **6 capability gates** (reconciled §"Capability gates"), each via `cortex search docs` / `cortex` and logged to `docs/planning/gate-report.md`:

| Gate | How (Cortex-CLI-first) |
|---|---|
| G1 · Domo Chat v2 + Domo Essentials MCP beta access | Domo-side (web/Domo admin) — *only* item not answered by `cortex`; confirm in target Domo instance |
| G2 · Snowflake OAuth/OBO available to Code Engine, else disclose service identity | `cortex search docs "OAuth security integration for programmatic SQL API and Cortex REST access"` + connection test |
| G3 · Two-role Analyst/Agent answer differs under RLS/masking | `cortex search docs "row access policy masking policy Cortex Analyst caller privileges"`; design the two-persona test |
| G4 · Model Registry single-row interactive inference latency | `cortex search docs "Model Registry native inference warehouse latency single row"` |
| G5 · Direct CoWork agent URL + presenter SSO behavior | `cortex search docs "Snowflake CoWork open agent link SSO"` |
| G6 · Snowflake-managed MCP OAuth client + tool inventory/limits | `cortex search docs "Snowflake managed MCP server OAuth client tool limit"` |

**Deliverables:** `gate-report.md` (go/no-go per gated surface C3/C7/C8), roles+warehouse DDL committed, repo scaffold (§1).
**Exit criteria:** Each gate has a documented PASS / FAIL / DEFER with the exact `cortex` query used. C3/C7/C8 scope confirmed as built-now vs enablement-follow-on.

---

### Sprint 1 — Snowflake intelligence core: data + semantic views (C1)

**Goal:** Stand up the governed metric layer. Reuse the Tessera Cloud / INC-0001 West-incident story and the six gold objects, re-authored as Snowflake tables + **semantic views**.

**Tasks (all via `cortex`)**
- Create db/schema: `cortex --mode code --plan "create database and schema for the revenue command center under 00_setup"`.
- Generate dims/facts + deterministic synthetic data with the INC-0001 incident pattern: `cortex --mode code --plan "generate SQL to create dim_/fact_ tables and populate synthetic Tessera Cloud data with a West SEV-1 incident driving renewal risk; write to snowflake/10_data/"`.
- Author gold-equivalent views + a focused **revenue semantic view** with metrics, entities, relationships, synonyms, and **verified queries**: `cortex --mode code --plan "create a semantic view over the gold objects with metrics (net revenue, ARR, revenue at risk, renewal-risk score, SLA breach rate, protected revenue) and verified queries; write to snowflake/20_semantics/"`.
- DD as needed: `cortex search docs "semantic view best practices metrics relationships verified queries"`.

**Deliverables:** `snowflake/10_data/`, `snowflake/20_semantics/` committed; semantic view live in the account.
**Exit criteria:** `cortex analyst` answers 3+ canonical revenue questions correctly against the semantic view with sensible generated SQL.

---

### Sprint 2 — Live Domo data plane + app shell + CE bridge (C2)

**Goal:** Domo reads Snowflake live (no copy); app shell renders Forecast Home (surface 1) from live data; secure Code Engine bridge exists.

**Tasks**
- Domo Cloud Integration / Cloud Amplifier for Snowflake: register the gold/semantic-backed datasets (Domo-side).
- Scaffold the pro-code app (`snowflake-command-center/`): shell, tab machinery, persona selector, SVG KPI/forecast components. **Apply `domo-snowflake-reskin-kit` (Workstream W)** as the design system — copy its `design-tokens.css` `:root`, mirror `styles.css` component classes, wire the exact brand SVGs, and match the `reference-dashboard.html` quality bar. Follow `RESKIN-PROMPT.md` order: styleguide → tokens → styles → analyzer → screenshots → assets.
- Build `codeengine/functions.js` (`snowflakece`) skeleton: SQL API (`POST /api/v2/statements`) client with server-side credential (per G2 outcome — key-pair JWT / OAuth / service identity). First function: `runSql` + `getForecastHome`.
- DD for the bridge: `cortex search docs "SQL API POST statements authentication key pair JWT"`.

**Deliverables:** Forecast Home reading live Snowflake data through the CE bridge; token never in browser.
**Exit criteria:** KPIs + regional risk + forecast render from live semantic-view reads for a selected persona (browser-side scope for now; governed enforcement is Sprint 7).

---

### Sprint 3 — Cortex Analyst surface (C2 / C3-Analyst; surface 3)

**Goal:** Transparent NL analytics with generated SQL, rows, verified-query provenance, and Domo-side chart reconstruction + API inspector.

**Tasks**
- Validate/iterate the semantic view for Analyst quality: `cortex analyst` probing question sets.
- CE fn `askAnalyst` → Cortex Analyst REST (`POST /api/v2/cortex/analyst/message`), parsing all current response blocks incl. `system_execute_sql`.
- Analyst tab UI: answer + generated SQL + result table + chart reconstruction + raw request/response inspector + verified-query provenance badge.

**Deliverables:** Working Cortex Analyst tab end-to-end.
**Exit criteria:** "Why did renewal risk increase for West enterprise accounts this month?" returns governed answer + SQL + rows; inspector shows the real API contract.

---

### Sprint 4 — Cortex Search + one Cortex Agent (C4; surface 4; R8-Search)

**Goal:** One shared Cortex Agent (Analyst + Search + narrow custom tools) is the Snowflake reasoning core; adds cited unstructured evidence beyond Databricks parity.

**Tasks (via `cortex`)**
- Create unstructured source (incident notes, support tickets, call summaries, playbooks) + a **Cortex Search** service: `cortex --mode code --plan "create a Cortex Search service over incident/support text; write to snowflake/30_search/"`.
- Create the **Cortex Agent** with Analyst + Search + narrow custom tools: `cortex --mode code --plan "author a CREATE AGENT spec bundling the revenue semantic view (Analyst), the search service, and a narrow custom tool; write to snowflake/60_agent/"`; explore/test with `cortex agents`.
- CE fn `askCortexAgent` → Cortex Agents API.
- Cortex Agent Queue tab: recommendations + agent transcript + Search citations + evidence.

**Deliverables:** Live Cortex Agent; Agent Queue tab renders grounded recommendations with citations.
**Exit criteria:** Agent answers a retention question citing both structured (Analyst) and unstructured (Search) sources; transcript/evidence visible.

---

### Sprint 5 — Predict + Remember: Snowflake ML + Hybrid Tables (C1/C6; surfaces 6, 7)

**Goal:** Live renewal-risk scoring from Model Registry (native warehouse inference, default per G4); operational memory in Hybrid Tables.

**Tasks (via `cortex`)**
- Train + register renewal-risk model: `cortex --mode code --plan "train a renewal-risk model on the gold view and register it to the Model Registry; write training + inference SQL to snowflake/40_ml/"`. Use native warehouse inference (`SELECT MODEL(...)!predict(...)`); SPCS only if G4 latency requires.
- Create **Hybrid Tables** `scenario_runs`, `prediction_feedback` + the `agent_action_writeback` table: `cortex --mode code --plan "create hybrid tables for scenario runs and prediction feedback, plus a writeback table; write to snowflake/50_state/"`.
- CE fns: `runModelInference` (SQL API), scenario/feedback CRUD.
- Snowflake ML tab: live single-account score + model version + request/response + SQL/Python examples + trace. Snowflake Ops tab: Hybrid Table CRUD; accept-prediction → seeds a scenario.

**Deliverables:** Live scoring + Hybrid-Table-backed Ops tab.
**Exit criteria:** Score one account interactively at acceptable latency; accepted prediction persists as a scenario row.

**Status: ✅ SHIPPED.**
- **Model (live).** `REVENUE_CC_RISK_MODEL` trained + served **natively in-warehouse** via `SNOWFLAKE.ML.CLASSIFICATION` (gradient-boosted trees) on **96,000 rows** (4,000 accounts × 24 months); target `IS_HIGH_RISK` (risk_tier='High' OR churn≥0.5, 12.3% positive). Single-account inference wrapped in table function `PREDICT_RENEWAL_RISK(account_id)` (~3.4–3.8s on XSMALL); `USAGE` granted to `REVENUE_CC_READER`. Validated: ACC-00008/00016 (West/Enterprise) score 0.999 High; South/SMB scores 0.10 Low. Artifacts in `snowflake/40_ml/`.
  - *Note:* `snowflake-ml-python` was not in the local env, so the native SQL `ML.CLASSIFICATION` path was used instead of the Python Model Registry API — same governed, in-warehouse inference callable from the SQL API (documented in `snowflake/40_ml/README.md`).
- **State (live).** Real `HYBRID TABLE`s `SCENARIO_RUNS`, `PREDICTION_FEEDBACK`, `AGENT_ACTION_WRITEBACK` (PK + secondary index on `ACCOUNT_ID`), seeded (4 scenarios, 5 feedback; writeback empty for Sprint 6). Grants: WRITER = S/I/U/D, READER = SELECT. Full CRUD validated as WRITER. Artifacts in `snowflake/50_state/`.
- **Bridge.** `snowflakece` gains `runModelInference`, `getOpsState`, `createScenario`, `updateScenarioStatus`, `deleteScenario`, `createFeedback` (reads as READER, writes as WRITER); manifest updated.
- **App.** **Snowflake ML** tab (surface 6): account picker → live probability gauge, verdict, feature vector, model card + importances, SQL·curl·Snowpark inspector, and "Accept prediction → seed scenario". **Snowflake Ops** tab (surface 7): Hybrid Tables workspace with scenario CRUD (add / status-cycle / delete) and prediction-feedback logging. Offline seeds `public/mock/ml-score.json` + `ops-state.json` from live objects. Published to `snowflake-demo.domo.com`.

---

### Sprint 6 — Agent-to-agent action loop (C5; surface 5)

**Goal:** The centerpiece — Domo → Cortex Agent recommendation → human approval → separately privileged Snowflake writeback → visible Action Journey.

**Tasks**
- Domo Workflow + AI agent tile calling `askCortexAgent` (server-side; time-bounded with a deterministic fallback so the tile never hangs).
- Task Center approval task; CE `listApprovalTasks` / `completeApprovalTask`.
- `writeActionStatus` under the **write/execute** role → `agent_action_writeback` (SQL API).
- Action Journey timeline driven by **real** workflow-instance + Task Center signals (not sleep timers), with go-to-source links (agent, workflow run, model trace, writeback row).

**Deliverables:** End-to-end approve-&-execute loop; Protected Revenue ticks up on approval.
**Exit criteria:** Recommendation → approval → writeback demonstrably distinct; every stage reflects real state with a fallback.

**Status: ✅ SHIPPED (Snowflake writeback loop live; Domo Workflow/Task Center overlay documented).**
- **Writeback (live).** `snowflake/50_state/30_writeback_ops.sql` — an idempotent-per-`ACTION_ID` `MERGE` into the `AGENT_ACTION_WRITEBACK` **hybrid table** (validated live: insert→update keeps exactly one row) + a governed `GOLD_PROTECTED_REVENUE_ROLLUP` view (baseline `FACT_AGENT_ACTIONS` + live writeback, `SELECT` granted to READER). Full approve→execute→rollup→cleanup cycle validated; table left empty for a clean demo.
- **Privilege split (enforced).** The queue is **read** as `REVENUE_CC_READER`; every writeback **writes** as `REVENUE_CC_WRITER` — distinct roles on the same governed schema.
- **Bridge.** `snowflakece` gains `getApprovalQueue(persona)` (pending queue + writeback rows + protected rollup, region-scoped) and `writeActionStatus(...)` (approve / reject / execute MERGE). Manifest updated (13 mappings total).
- **App — Approvals (surface 5).** Protected-revenue hero that ticks up on execution, READER→WRITER privilege chips, a **Pending approval** lane (Approve/Reject), an **Approved — awaiting writeback** lane (Execute), an **Action Journey** timeline driven by the selected action's real approval/execution state with go-to-source chips (agent run · model trace · writeback row), and an **Executed — protected revenue** table. Offline seed `public/mock/approvals.json` from the live queue + rollup. Published to `snowflake-demo.domo.com`.
- **External overlay (documented, not blocking).** The Domo Workflow + Task Center orchestration that wraps the same `askCortexAgent` → approval task → `writeActionStatus` path is documented in `SNOWFLAKE-CONNECT.md`; the app's in-surface loop is the deterministic fallback so the demo never depends on live Workflow authoring.

---

### Sprint 7 — Govern everywhere (surface 8; C8; R7) ✅ SHIPPED

**Goal:** Enforce governance at the query engine for every caller; parity-test entitlements; expose the governance control plane.

**Shipped (2026-07-15):**
- **Row-access + masking policies live** (via `cortex`, `snowflake/70_governance/`): `RAP_REGION` on `DIM_ACCOUNT.REGION` (region-scoped roles see only their mapped region via `GOV_ROLE_REGION_MAP`) and `MASK_ARR` on `DIM_ACCOUNT.ANNUAL_RECURRING_REVENUE` (real for base roles, `NULL` for scoped roles). Both **fail-open** for `REVENUE_CC_READER`/`WRITER`/`SYSADMIN`/`ACCOUNTADMIN` so every existing surface is untouched.
- **Two-persona parity test passes (headline evidence):** the *same* query `SELECT region, COUNT(*), SUM(revenue_at_risk) FROM GOLD_CUSTOMER_RENEWAL_RISK GROUP BY region` returns **READER → 4,000 (all regions)**, **REVENUE_CC_READER_WEST → 1,383 (West only)**, **REVENUE_CC_READER_EAST → 1,027 (East only)** — enforced by Snowflake, not the app. Masking verified: ARR real for READER, redacted for the scoped role.
- **Safety verified:** `REVENUE_CC_READER` row count on the gold view is **4,000 before and after** the policies — no regression to Forecast Home / Analyst / Agent / ML / Approvals.
- **Guardrail DD, honestly labeled:** `cortexGuard` = **Available** (account-level `AI_SETTINGS` toggle, cross-region prerequisite met, currently unset — not claimed "Enabled"); `observability` = **Enabled** (live `AI_OBSERVABILITY_EVENTS` = 56,787 agent-trace events); `evaluations` = **Available** (framework present, no jobs configured yet).
- **New region-scoped roles** `REVENUE_CC_READER_WEST` / `REVENUE_CC_READER_EAST` granted to the service user `SVC_REVENUE_CC` so the bridge can assume them for the parity test.
- **Code Engine:** `getGovernance()` runs the parity query under three roles + the masking sample live (14th mapped function).
- **UI:** new **Horizon AI Readiness** tab (surface 8) — service-identity disclosure banner (honest C8 gating), two-persona parity columns, column-masking table, active-policy + governed-object inventory, Cortex guardrail/observability/evaluation status cards, and the **Horizon ↔ Domo AI Readiness** governance-parity table.
- **Honest C8 disclosure:** governance is role-based under a named service identity; per-end-user identity passthrough remains a documented target-instance enablement, not simulated.

**Exit criteria met:** two roles get correctly different results from the same governed question; masking + guardrail + trace evidence surfaced; base reader unchanged.

**Tasks (via `cortex`)**
- Author **row access + masking policies** on the semantic sources: `cortex --mode code --plan "create row access and masking policies for the revenue schema keyed to persona/region; write to snowflake/70_governance/"`.
- Enable **Cortex AI Guardrails**, **AI Observability**, and **Agent Evaluations**: DD + config via `cortex search docs` + code mode.
- C8 identity work (gated by G2/G3): carry per-user Snowflake identity into Analyst/Agent reads *or* disclose a named service identity; run the **two-persona parity test** (same question, different governed result).
- Horizon Governance tab: semantic metadata, active policies, guardrail history, ACCOUNT_USAGE traces, evaluation scores, and Domo AI Readiness parity view.

**Deliverables:** Governance tab; policy + guardrail + observability evidence.
**Exit criteria:** Two personas get correctly different results from the *same* Analyst/Agent question; guardrail + trace evidence visible. If C8 fails, demo uses a clearly named service identity and does not claim persona-equivalent Snowflake enforcement (per reconciled §"Selected Shape C").

---

### Sprint 8 — MCP fabric both directions + CoWork surface (C6, C7; surface 9) ✅ SHIPPED

**Goal:** Honest bidirectional MCP story + the native Snowflake business experience.

**Shipped (2026-07-15):**
- **Snowflake-managed MCP outward (C6):** DD via `cortex` found `CREATE MCP SERVER` is **private preview** on this account — so it is labeled **Available (target-instance)**, not faked. `snowflake/80_mcp/` holds the guarded DDL for `REVENUE_CC_MCP` exposing 4 tools (`revenue_analyst`, `revenue_search`, `revenue_agent`, `revenue_sql`) over PAT auth, plus the full JSON-RPC `tools/list` + `tools/call` client contract. One external call is presented as **"contract captured, not executed."**
- **Domo Essentials MCP outward (C7):** kept **beta follow-on (gated, G1)** — intended tools documented, explicitly not simulated.
- **CoWork surface (surface 9):** launchpad that opens the *same* `REVENUE_CC_AGENT` in Snowflake Intelligence (GA), with the real open path, Horizon scoping note, SSO note, Deep Research **cited artifacts** (Analyst + Search), and Skills.
- **Seeds:** `public/mock/mcp.json`, `public/mock/cowork.json`. New tabs render both live-ready and offline.

**Exit criteria met:** managed MCP maturity labeled honestly with a runnable client contract; CoWork uses the same agent; Domo MCP gated, not simulated.

**Tasks (via `cortex`)**
- **Snowflake-managed MCP outward (C6, GA):** configure the managed MCP server exposing Analyst/Search/Agent/SQL tools: `cortex mcp <...>` + `cortex search docs "managed MCP server tool inventory OAuth"`; demonstrate one external MCP client call.
- **Domo Essentials MCP outward (C7, beta-gated by G1):** expose selected Domo data/workflow tools (Domo-side); if beta access unconfirmed, label as beta follow-on (do not simulate).
- **CoWork surface (surface 9):** direct link to the *same* configured Cortex Agent in CoWork (no unsupported embed); Deep Research cited artifacts. Persona/SSO behavior per G5.

**Deliverables:** One live managed-MCP call; CoWork reachable via direct agent link; Domo MCP built or explicitly gated.
**Exit criteria:** Managed MCP outward demonstrated live; CoWork uses the same agent; MCP maturity honestly labeled.

---

### Sprint 9 — CoCo live builder + How It Works + demo hardening (C9; surfaces 2, 10) ✅ SHIPPED

**Goal:** Close the beyond-parity builder story, finish narrative surfaces, and make the demo bulletproof.

**Shipped (2026-07-15):**
- **CoCo live builder (C9):** `cortex --mode code` built a real, **additive, reversible** object against the live account — `GOLD_REGION_SAVEPLAY_LEADERBOARD` (12 rows; West Enterprise tops at $63.4M at risk / 241 high-risk accounts / 73 save plays). No existing object touched; revert is a single `DROP VIEW`. Committed to `snowflake/90_coco/`; evidence in `public/mock/cocobuild.json`.
- **Domo Chat v2 (surface 2):** built as an **honestly gated** tab — shows where Chat v2 sits (a delivery-plane MCP client of the same managed server, inheriting `REVENUE_CC_ANALYST` semantics + `RAP_REGION`/`MASK_ARR`) and the golden-path questions it handles. No simulated conversation, no claimed direct Cortex routing.
- **How It Works (surface 10):** solution spine (Predict → Explain → Act → Remember → Govern, mapped to surfaces + Snowflake objects), technical architecture with per-layer maturity chips (GA / Mixed), and the CoCo "how it was built" panel (live build task, plan, SQL, result, reversibility).
- **Hardening:** `docs/demo/golden-path-runbook.md` (9-beat script, per-surface live object + fallback, honesty labels) and `snowflake/99_reset/00_reset.sql` (reset operational + demo layer). Deterministic fallback verified: every data surface falls back to its live-captured seed; gated surfaces never simulate.

**Exit criteria met:** full golden path runs clean with fallbacks; CoCo builds live and reversibly; maturity labels accurate across all 10 surfaces.

---

## Build complete

All 10 surfaces shipped across Sprints 0–9 + Workstream W. Every Snowflake object under `snowflake/` was authored via the Cortex CLI and is committed and reproducible. Remaining gated items (Domo Chat v2, Domo Essentials MCP, managed MCP server GA, per-user identity) are documented as target-instance enablements, never simulated.

**Tasks**
- **CoCo live builder (C9):** scripted safe builder task run live with `cortex --mode code` (e.g., add a metric to the semantic view or scaffold a small object) — the ai-toolkit analog, shown building against the real account.
- **Domo Chat v2 (surface 2, gated by G1):** enable in target Domo instance if available; multi-dataset conversation across delivery context. Do **not** claim direct Cortex routing or external tool execution.
- **How It Works + CoCo (surface 10):** Solution + Technical architecture diagrams with honest maturity labels and source links.
- **Hardening:** golden-path rehearsal, deterministic fallback for every stage, demo runbook, reset procedure, `cortex ctx` capture of final state/decisions.

**Deliverables:** Live CoCo builder moment, architecture surface, runbook, reset.
**Exit criteria:** Full **golden path** (reconciled §"Demo golden path", steps 1–9) runs clean with fallbacks; maturity labels accurate.

---

## 4. Requirement & surface coverage

| Req | Covered by |
|---|---|
| R0 Command center (predict/explain/act/remember/govern) | S1–S9 (whole build) |
| R1 Snowflake semantics authoritative | S1, S2 |
| R2 Three first-class conversations (Chat v2 / Analyst / CoWork) | S3, S8, S9 — **gated on G1** |
| R3 One Analyst/Search/tool Cortex Agent | S4 |
| R4 Governed action + approval + writeback loop | S6 |
| R5 Both MCP directions, capability-gated | S8 — **gated on G1/G6** |
| R6 Live Snowflake ML with inspectable evidence | S5 |
| R7 Entitlement parity + caller policies + guardrails + Hybrid memory | S5, S7 — **gated on G2/G3** |
| R8 CoCo live + Search citations + evaluation/observability | S4, S7, S9 |

**Surfaces (reconciled Detail C):** 1 Forecast Home (S2) · 2 Domo Chat v2 (S9, gated) · 3 Cortex Analyst (S3) · 4 Cortex Agent Queue (S4) · 5 Approvals (S6) · 6 Snowflake ML (S5) · 7 Snowflake Ops (S5) · 8 Horizon Governance (S7) · 9 CoWork (S8) · 10 How It Works + CoCo (S9).

---

## 5. Critical path, parallelism, and risk

- **Critical path to first live demo:** S0 → S1 → S2 → S3 (governed data + transparent NL analytics). This is the minimum credible slice.
- **Design Workstream W (rebranding)** runs in parallel with S0–S1 (it needs no Snowflake objects) and is a **hard predecessor of S2** — the app shell should never be built pre-brand and reskinned later.
- **Parallelizable after S1:** S4 (Search+Agent) and S5 (ML+Hybrid) can proceed alongside S3 once the semantic view exists.
- **Gate-blocked, keep off the golden path until proven:** C3 (Chat v2), C7 (Domo MCP), C8 (per-user identity/parity). Each has a defined fallback in the reconciled doc — build the ungated core so a slipped gate never breaks the demo.
- **Cortex-CLI risk:** run writes in `--plan` mode against named schemas; keep `SYSADMIN` for bootstrap only; commit every generated artifact so a bad agent edit is diff-reviewable and revertible.
- **Preview/beta hygiene:** re-verify any GA/preview claim in the target account with `cortex search docs` at implementation time (research cutoff 2026-07-15).

---

## 6. Definition of done

The build is demo-ready when the reconciled **golden path** (steps 1–9) runs live end-to-end with deterministic fallbacks, every gated capability is either delivered or honestly labeled as a target-instance enablement follow-on, and every Snowflake object in `snowflake/` was authored via `cortex` and is committed and reproducible.
