# Snowflake Revenue Command Center

> **One governed brain, many governed surfaces.** A forecast-first revenue cockpit where **Snowflake predicts, explains, and remembers** and **Domo delivers and acts** — a single governed loop (Predict → Explain → Act → Remember → Govern) built on Snowflake Horizon, Cortex, and native ML, delivered as a Domo App Studio pro-code app. Metrics never fork out of Snowflake.

![version](https://img.shields.io/badge/version-0.5.0-1f5d86?style=flat-square)
![platform](https://img.shields.io/badge/platform-Domo_App_Studio-4a90c2?style=flat-square)
![Snowflake](https://img.shields.io/badge/Snowflake-Horizon_·_Cortex-29B5E8?style=flat-square&logo=snowflake&logoColor=white)
![Cortex](https://img.shields.io/badge/Cortex-Analyst_·_Agent_·_Search-29B5E8?style=flat-square)
![ML](https://img.shields.io/badge/Snowflake_ML-Native_Classification-29B5E8?style=flat-square)
![frontend](https://img.shields.io/badge/frontend-Vanilla_JS_·_ryuu.js-f7df1e?style=flat-square&logo=javascript&logoColor=black)
![license](https://img.shields.io/badge/license-Partner_Demo-5B6C5D?style=flat-square)

---

## Table of Contents

1. [What Problem Does This Solve?](#what-problem-does-this-solve)
2. [Architecture](#architecture)
3. [The Governed Loop](#the-governed-loop)
4. [Surfaces & Navigation](#surfaces--navigation)
5. [AI & Intelligence Stack](#ai--intelligence-stack)
6. [Governance & Security](#governance--security)
7. [Data Model](#data-model)
8. [The `snowflakece` Code Engine Bridge](#the-snowflakece-code-engine-bridge)
9. [Design System](#design-system)
10. [Snowflake Build (`snowflake/`)](#snowflake-build-snowflake)
11. [Development & Deployment](#development--deployment)
12. [Project Structure](#project-structure)
13. [License](#license)

---

## What Problem Does This Solve?

Revenue teams live across two planes: the **governed data + AI plane** (where the numbers, the models, and the policies live) and the **delivery + action plane** (where people actually work). Most tools copy data between them — so metrics fork, governance is lost at the boundary, and "the number in the dashboard" stops matching "the number in the warehouse."

The Command Center closes that gap. **Snowflake is the single governed brain**; **Domo is the delivery and action surface**. One semantic definition feeds Cortex, the ML model, and every Domo surface — and every action a human approves writes back to Snowflake under a distinct, least-privileged role.

It runs as **one governed loop**:

| Stage | Question it answers | Snowflake capability | Surface |
| --- | --- | --- | --- |
| ![predict](https://img.shields.io/badge/Predict-29B5E8?style=flat-square) | _"How likely is this account to churn?"_ | Snowflake ML — `REVENUE_CC_RISK_MODEL` (native classification) | Forecast Home · Snowflake ML |
| ![explain](https://img.shields.io/badge/Explain-29B5E8?style=flat-square) | _"Why did this change, and what should we do?"_ | Cortex Analyst + Cortex Agent + Cortex Search | Cortex Analyst · Semantic Model |
| ![act](https://img.shields.io/badge/Act-4a90c2?style=flat-square) | _"Approve the recommended save play."_ | Agent action queue → human approval → writeback | Approvals |
| ![remember](https://img.shields.io/badge/Remember-4a90c2?style=flat-square) | _"Keep the what-ifs and the feedback."_ | Hybrid Tables (OLTP) — scenarios + prediction feedback | Hybrid Tables |
| ![govern](https://img.shields.io/badge/Govern-1f5d86?style=flat-square) | _"Enforce who sees what, everywhere."_ | Horizon — RBAC · row-access · masking · lineage | Horizon AI Readiness |

Everything degrades gracefully: each data surface falls back to a **live-captured seed** if the bridge is unavailable (a **Sample data** pill appears), and honestly-**gated** surfaces document target-instance wiring rather than faking a call.

---

## Architecture

A **four-layer system**. Each layer is independently governed; together they keep one definition of the truth from source to action.

```
┌───────────────────────────────────────────────────────────────────────────┐
│                    EXPERIENCE LAYER  ·  Domo App Studio                     │
│                    (pro-code · vanilla JS + ryuu.js · no build step)        │
│                                                                            │
│  Forecast Home │ Cortex Analyst │ Snowflake ML │ Approvals │ Hybrid Tables │
│  Horizon AI Readiness │ Semantic Model │ CoWork·MCP │ Chat v2 │ How It Works│
└──────────────────────────────────┬─────────────────────────────────────────┘
                                    │  domo.post('/domo/codeengine/v2/packages/…')
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│             INTEROP LAYER  ·  snowflakece Code Engine bridge               │
│             (server-side · RS256 key-pair JWT · credential never in browser)│
│                                                                            │
│  SQL API           │  Cortex Analyst API      │  Cortex Agent :run         │
│  /api/v2/statements│  /cortex/analyst/message │  (Analyst + Search tools)  │
│  ───────────────── Cloud Amplifier (BYOS) — live federation, no copy ──────│
└──────────────────────────────────┬─────────────────────────────────────────┘
                                    │  assumes REVENUE_CC_READER / _WRITER per request
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│          INTELLIGENCE + PERSISTENCE LAYER  ·  Snowflake                     │
│                                                                            │
│  Cortex Analyst  (REVENUE_CC_ANALYST)   │  Snowflake ML (REVENUE_CC_RISK_MODEL) │
│  Cortex Agent    (REVENUE_CC_AGENT)     │  Hybrid Tables (SCENARIO_RUNS · …) │
│  Cortex Search   (REVENUE_CC_SEARCH)    │  Gold views  (GOLD_*)             │
└──────────────────────────────────┬─────────────────────────────────────────┘
                                    │  every object governed by…
                                    ▼
┌───────────────────────────────────────────────────────────────────────────┐
│               GOVERNANCE LAYER  ·  Snowflake Horizon                        │
│                                                                            │
│  RBAC roles  │  RAP_REGION (row-access)  │  MASK_ARR (masking)  │  lineage  │
│  REVENUE_CC_READER · _WRITER · _READER_WEST · _READER_EAST                  │
└───────────────────────────────────────────────────────────────────────────┘
```

| Layer | Technology | Core principle |
| --- | --- | --- |
| ![exp](https://img.shields.io/badge/Experience-Domo_App_Studio-4a90c2?style=flat-square) | Vanilla JS · ryuu.js · SVG charts (no framework, no build) | The delivery plane never holds a credential and never invents a number — it renders governed results or a labeled sample seed |
| ![int](https://img.shields.io/badge/Interop-Code_Engine_+_Cloud_Amplifier-6236FF?style=flat-square) | Domo Code Engine (`snowflakece`) · Cloud Amplifier BYOS · MCP | One server-side bridge holds the key-pair, assumes least-privilege roles, and speaks SQL API + Cortex REST; Cloud Amplifier federates gold views with no copy |
| ![sf](https://img.shields.io/badge/Intelligence-Snowflake_Cortex_+_ML-29B5E8?style=flat-square&logo=snowflake&logoColor=white) | Cortex Analyst/Agent/Search · Snowflake ML · Hybrid Tables | One semantic definition feeds NL→SQL, the agent, and the model — no metric drift; operational state lives next to the analytics |
| ![gov](https://img.shields.io/badge/Governance-Snowflake_Horizon-1f5d86?style=flat-square) | RBAC · row-access · masking · lineage | Policy is enforced at the query engine, not in the app — the same query returns different rows for different roles |

---

## The Governed Loop

Predict → Explain → Act → Remember → Govern is not a slogan — each arrow is a real Snowflake object called through the bridge:

```
 Snowflake ML            Cortex Analyst / Agent        Approvals → writeback
 PREDICT_RENEWAL_RISK ──▶ REVENUE_CC_ANALYST ─────────▶ AGENT_ACTION_WRITEBACK
        │                 REVENUE_CC_AGENT                     │
        │                 REVENUE_CC_SEARCH                    ▼
        │                                             Hybrid Tables (OLTP)
        └───────────────── governed by Horizon ──────  SCENARIO_RUNS
          RBAC · RAP_REGION · MASK_ARR · lineage        PREDICTION_FEEDBACK
```

- **Predict** — `runModelInference(accountId)` calls the table function `PREDICT_RENEWAL_RISK` against `REVENUE_CC_RISK_MODEL`, a native `SNOWFLAKE.ML.CLASSIFICATION` model trained + served in-warehouse. Returns probability, the exact feature vector, and a SQL/cURL/Snowpark inspector.
- **Explain** — Cortex Analyst turns a natural-language question into governed SQL over `REVENUE_CC_ANALYST`; the Cortex Agent bundles Analyst + Search into a cited recommendation.
- **Act** — the agent stages save plays into an action queue; a human approves in-app (or via a Domo Workflow + Task Center overlay), and `writeActionStatus` does an idempotent `MERGE` into `AGENT_ACTION_WRITEBACK`.
- **Remember** — what-if scenarios and human prediction feedback persist in Snowflake **Hybrid Tables** (`SCENARIO_RUNS`, `PREDICTION_FEEDBACK`).
- **Govern** — Horizon enforces it all: reads as `REVENUE_CC_READER`, writes as `REVENUE_CC_WRITER`, region scoping via `RAP_REGION`, ARR masking via `MASK_ARR`.

---

## Surfaces & Navigation

A collapsing left rail with **10 surfaces**. Live surfaces read through the bridge with a sample-seed fallback; gated surfaces document target-instance wiring.

| # | Surface | What it does | Status |
| --- | --- | --- | --- |
| 1 | **Forecast Home** | KPI hero (Net Revenue, Revenue at Risk, Protected Revenue, SLA Breaches), Actual-vs-Forecast chart with confidence band, regional renewal-risk hotspot, agent action queue | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 2 | **Cortex Analyst** | Multi-turn NL→SQL chatbot over `REVENUE_CC_ANALYST` — answer + generated SQL + switchable chart + CSV + per-turn API inspector; "Recent questions" persists to AppDB | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 3 | **Snowflake ML** | Score any account live via `PREDICT_RENEWAL_RISK`; feature vector, model card, SQL/cURL/Snowpark inspector; "Accept → seed scenario" | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 4 | **Approvals** | Agent action queue → human approve/reject → `writeActionStatus` MERGE; protected-revenue hero, READER→WRITER privilege chips, action journey timeline | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 5 | **Hybrid Tables** | OLTP workspace — browse/add/edit/delete what-if **scenario runs** and log **prediction feedback** (operational memory) | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 6 | **Horizon AI Readiness** | Two-persona parity test at the query engine, `RAP_REGION` + `MASK_ARR` evidence, policy/guardrail inventory, Horizon ↔ Domo AI Readiness parity | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 7 | **Semantic Model** | Live `DESCRIBE SEMANTIC VIEW` → entity graph (tables · dims/facts/metrics · relationships), verified-query gallery, DDL builder | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |
| 8 | **Snowflake CoWork · MCP** | Launch the same `REVENUE_CC_AGENT` in Snowflake Intelligence (Deep Research + Skills); Snowflake-managed MCP outward tool inventory | ![preview](https://img.shields.io/badge/-target_instance-eab308?style=flat-square) |
| 9 | **Domo Chat v2** | Native Domo Chat v2 reaching Snowflake through the managed MCP server (same Agent/Analyst/Search tools, inheriting the semantic view + policies) | ![gated](https://img.shields.io/badge/-gated-6236FF?style=flat-square) |
| 10 | **How It Works** | Four views: **Solution Architecture** (clickable governed planes) · **Technical Architecture** (interactive blueprint with flow tracing) · **User Guide** · **Built with CoCo** | ![live](https://img.shields.io/badge/-live-56E39F?style=flat-square) |

---

## AI & Intelligence Stack

Every AI call routes through the `snowflakece` Code Engine bridge — API keys stay server-side, the frontend stays stateless, and Horizon governs the underlying objects.

| Capability | Snowflake object | Endpoint / mechanism | Purpose |
| --- | --- | --- | --- |
| ![cortex](https://img.shields.io/badge/Cortex_Analyst-29B5E8?style=flat-square&logo=snowflake&logoColor=white) | `REVENUE_CC_ANALYST` (semantic view) | `POST /api/v2/cortex/analyst/message` | Multi-turn NL → governed SQL; interpretation + SQL + suggestions, executed as `REVENUE_CC_READER` |
| ![agent](https://img.shields.io/badge/Cortex_Agent-29B5E8?style=flat-square&logo=snowflake&logoColor=white) | `REVENUE_CC_AGENT` | Agents REST `…:run` | Orchestrates Analyst + Search + SQL into a cited, grounded recommendation |
| ![search](https://img.shields.io/badge/Cortex_Search-29B5E8?style=flat-square&logo=snowflake&logoColor=white) | `REVENUE_CC_SEARCH` over `KNOWLEDGE_DOCS` | Cortex Search service | Hybrid retrieval over incident notes / QBRs / playbooks — the agent's unstructured grounding |
| ![ml](https://img.shields.io/badge/Snowflake_ML-29B5E8?style=flat-square&logo=snowflake&logoColor=white) | `REVENUE_CC_RISK_MODEL` · `PREDICT_RENEWAL_RISK()` | `SNOWFLAKE.ML.CLASSIFICATION` (native, in-warehouse) | Renewal-risk probability per account with the exact feature vector |
| ![nlq](https://img.shields.io/badge/Verified_Queries-29B5E8?style=flat-square) | `AI_VERIFIED_QUERY` set on the semantic view | `runSql` | The query set Cortex trusts, runnable live from the Semantic Model gallery |

> All external calls are made from **Domo Code Engine functions** using an RS256 key-pair JWT read at call time from a Domo-managed account — no key is pasted into code, committed to git, or exposed to the browser.

---

## Governance & Security

Governance is enforced **at the Snowflake query engine**, not in the app. The Horizon AI Readiness surface proves it with a live **two-persona parity test**: the _same_ governed query returns different rows for different roles.

| Role | Scope | Proof (same query) |
| --- | --- | --- |
| `REVENUE_CC_READER` | All regions (base read) | **4,000** rows |
| `REVENUE_CC_READER_WEST` | West only (via `RAP_REGION`) | **1,383** rows |
| `REVENUE_CC_READER_EAST` | East only (via `RAP_REGION`) | **1,027** rows |
| `REVENUE_CC_WRITER` | Writes only (writeback + Hybrid CRUD) | distinct privilege from reads |

- **`RAP_REGION`** — a row-access policy on `DIM_ACCOUNT` scopes rows by region for the scoped roles; **fail-open** for the base reader/writer so every other surface is untouched.
- **`MASK_ARR`** — a masking policy redacts `ANNUAL_RECURRING_REVENUE` for scoped roles.
- **Least privilege** — reads run as `REVENUE_CC_READER`; the writeback + Hybrid-Table writers run as `REVENUE_CC_WRITER` — a deliberately separate grant.
- **No pasted keys** — the bridge builds a `KEYPAIR_JWT` from a Domo-managed key-pair account (`sdk.getAccount(148)` → `domopartner.us-east-1`, user `DOMO_CE_USER`); the private key never touches the repo or the browser.
- **Lineage** — every governed object deep-links to Snowsight (and gold views to their federated Domo datasets) so consumers can trace source → surface.

> Governance today is role-based under a named service identity. Per-end-user identity passthrough (Snowflake OAuth U2M / token federation) is disclosed as a target-instance enablement, not simulated.

---

## Data Model

One definition of the truth: a governed **DIM/FACT** core → **gold views** → a **semantic view** that feeds Cortex, the model, and Domo. Operational state lives in **Hybrid Tables**.

### Core warehouse

| Object type | Objects |
| --- | --- |
| **Dimensions** | `DIM_ACCOUNT` · `DIM_TENANT` · `DIM_PRODUCT` · `DIM_USER_ENTITLEMENT` |
| **Facts** | `FACT_REVENUE_DAILY` · `FACT_RENEWAL_RISK` · `FACT_SUPPORT_CASES` · `FACT_AGENT_ACTIONS` · `FACT_PRODUCT_USAGE_DAILY` · `FACT_INCIDENTS` |
| **Semantic view** | `REVENUE_CC_ANALYST` — 9 tables · 14 relationships · 5 verified queries (the layer Cortex Analyst reasons over) |

### Gold views

| View | Purpose |
| --- | --- |
| `GOLD_EXECUTIVE_REVENUE_HEALTH` | Net revenue, forecast, protected + at-risk rollups |
| `GOLD_CUSTOMER_RENEWAL_RISK` | Per-account renewal-risk scores and drivers |
| `GOLD_INCIDENT_REVENUE_IMPACT` | Reliability incidents mapped to revenue at risk |
| `GOLD_AGENT_ACTION_QUEUE` | Cortex Agent save plays + approval status |
| `GOLD_PORTAL_USER_SCOPE` | Row-scope + entitlement for governed delivery |
| `GOLD_REVENUE_FORECAST` | Actual-vs-forecast time series with confidence band |
| `GOLD_PROTECTED_REVENUE_ROLLUP` | Protected-revenue rollup driven by executed actions |
| `GOLD_REGION_SAVEPLAY_LEADERBOARD` | The additive/reversible view built live via CoCo |

### Hybrid Tables (OLTP state)

| Table | Purpose |
| --- | --- |
| `SCENARIO_RUNS` | What-if scenario runs (browse / add / edit / delete) |
| `PREDICTION_FEEDBACK` | Human feedback on model predictions (operational memory) |
| `AGENT_ACTION_WRITEBACK` | Approve/reject/execute writeback via idempotent `MERGE` |

### Domo federation (Cloud Amplifier · BYOS)

The gold views surface in Domo as **direct-federated datasets** (no copy), mapped to the app by stable aliases in `manifest.json` `datasetsMapping`, plus three companion **Data Models** (Account / Tenant / Product hubs) that mirror the semantic view on the Domo side.

---

## The `snowflakece` Code Engine Bridge

A single server-side Domo Code Engine package (`codeengine/functions.js`, conservative ES5) is the only thing that holds the Snowflake credential. The app calls it via `domo.post('/domo/codeengine/v2/packages/<fn>')`; it assumes the right role per request and returns governed results. **27 functions**, grouped:

| Group | Functions |
| --- | --- |
| **Connectivity** | `ping` · `runSql` |
| **Forecast Home** | `getForecastHome` |
| **Cortex Analyst** | `askAnalyst` (multi-turn) · `createCortexThread` · `renameCortexThread` · `listCortexThreads` · `getCortexThread` |
| **Semantic Model** | `listSemanticViews` · `describeSemanticView` · `alterSemanticView` |
| **Cortex Agent** | `askCortexAgent` · `askRetentionAgent` |
| **Snowflake ML** | `runModelInference` |
| **Hybrid Tables** | `getOpsState` · `createScenario` · `updateScenarioStatus` · `deleteScenario` · `createFeedback` |
| **Approvals + Workflow** | `getApprovalQueue` · `writeActionStatus` · `startRetentionWorkflow` · `listApprovalTasks` · `completeApprovalTask` |
| **Governance** | `getGovernance` (two-persona parity) |
| **Cloud Amplifier (BYOS)** | `getSnowflakeIntegrations` · `registerCloudAmplifierTable` |

> Reads route through `REVENUE_CC_READER`; the Hybrid-Table writers and `writeActionStatus` route through `REVENUE_CC_WRITER`; `getGovernance` additionally assumes `REVENUE_CC_READER_WEST` / `_EAST` to prove enforcement. The app unwraps nested `response` envelopes and falls back to the matching `public/mock/*.json` seed if a live call fails, so a missing credential degrades gracefully rather than breaking the shell. Full contract in [`snowflake-command-center/SNOWFLAKE-CONNECT.md`](snowflake-command-center/SNOWFLAKE-CONNECT.md).

---

## Design System

Built on the `domo-snowflake-reskin-kit` — **Domo Blue is dominant**, with **Snowflake Blue as a subordinate partner accent** (never overpowering Domo Blue). Tokens live in `snowflake-command-center/src/design-tokens.css`; typography is Open Sans (UI) + Roboto Mono (code/IDs).

| Swatch | Name | Hex | Usage |
| --- | --- | --- | --- |
| ![domo-blue](https://img.shields.io/badge/-99CCEE-99CCEE?style=flat-square) | Domo Blue | `#99CCEE` | Primary brand — dominant |
| ![domo-deep](https://img.shields.io/badge/-4A90C2-4A90C2?style=flat-square) | Domo Blue Deep | `#4A90C2` | Lines, fills, focus |
| ![domo-ink](https://img.shields.io/badge/-1F5D86-1F5D86?style=flat-square) | Domo Blue Ink | `#1F5D86` | Links, active text |
| ![sf-blue](https://img.shields.io/badge/-29B5E8-29B5E8?style=flat-square) | Snowflake Blue | `#29B5E8` | Partner accent — chips, dots, status |
| ![sf-star](https://img.shields.io/badge/-11567F-11567F?style=flat-square) | Star Blue | `#11567F` | High-contrast partner actions |
| ![sf-mid](https://img.shields.io/badge/-1B2A3A-1B2A3A?style=flat-square) | Snowflake Midnight | `#1B2A3A` | Dark partner ink / blueprint |
| ![ink](https://img.shields.io/badge/-3F454D-3F454D?style=flat-square) | Neutral 700 | `#3F454D` | Body text |

The **How It Works → Technical Architecture** view ships a light/dark "blueprint" theme; everything else follows the light Domo styleguide.

---

## Snowflake Build (`snowflake/`)

The entire Snowflake side is authored as ordered, re-runnable SQL (each folder has its own README). Apply in order:

| Folder | Builds |
| --- | --- |
| `00_setup/` | Warehouse `REVENUE_CC_WH`, database `SNOWFLAKE_REVENUE_CC.CORE`, base roles `REVENUE_CC_READER` / `_WRITER` |
| `10_data/` | Dimensions, facts, and the `GOLD_*` views |
| `20_semantics/` | The `REVENUE_CC_ANALYST` semantic view + verified queries |
| `30_search/` | `KNOWLEDGE_DOCS` + the `REVENUE_CC_SEARCH` Cortex Search service |
| `40_ml/` | Feature table, `REVENUE_CC_RISK_MODEL` training/registration, `PREDICT_RENEWAL_RISK` inference function |
| `50_state/` | Hybrid Tables (`SCENARIO_RUNS`, `PREDICTION_FEEDBACK`, `AGENT_ACTION_WRITEBACK`) + writeback ops |
| `60_agent/` | `REVENUE_CC_AGENT` and its Analyst/Search/SQL tools |
| `70_governance/` | Region-scoped roles, `RAP_REGION` row-access policy, `MASK_ARR` masking policy, AI-readiness context |
| `80_mcp/` | Snowflake-managed MCP server (private preview — DDL staged, not GA) |
| `90_coco/` | The `GOLD_REGION_SAVEPLAY_LEADERBOARD` view built live via the Cortex CLI (CoCo) |
| `99_reset/` | Teardown / reset for repeatable demos |

---

## Development & Deployment

### Local preview (no Domo runtime)

```bash
cd snowflake-command-center
python3 -m http.server 8899
# open http://localhost:8899/index.html
```

In preview there is no Domo SDK, so the app renders from `public/mock/*.json` seeds (captured from live reads) and shows a **Sample data** pill. A `domo.js` 404 in the console is expected offline.

### Going live

The steps that flip the mode pill from **Sample data** to **Live · Snowflake** happen in the target Domo instance + Snowflake account (not code in this repo). See [`snowflake-command-center/SNOWFLAKE-CONNECT.md`](snowflake-command-center/SNOWFLAKE-CONNECT.md):

1. Apply the `snowflake/` DDL (or confirm it's already applied) and grant the service user (`DOMO_CE_USER`) the `REVENUE_CC_*` roles.
2. Publish the Code Engine package (`snowflakece` proxy) and share the Domo-managed key-pair account with it.
3. (Optional) Register the gold views via **Cloud Amplifier** and paste each `dataSetId` into `manifest.json` `datasetsMapping`.
4. Publish the App Studio pro-code app; capture the app id on first publish.
5. Smoke test: `ping()` → expect `IDENTITY.ROLE = REVENUE_CC_READER`, `ACCOUNT = DOMOPARTNER`.

---

## Project Structure

```
snowflake-revenue-command-center/
├── README.md                        # ← this file
├── snowflake/                       # All Snowflake DDL, ordered + re-runnable
│   ├── 00_setup/                    # warehouse, database, schema, base roles
│   ├── 10_data/                     # dimensions, facts, GOLD_* views
│   ├── 20_semantics/                # REVENUE_CC_ANALYST semantic view + verified queries
│   ├── 30_search/                   # KNOWLEDGE_DOCS + REVENUE_CC_SEARCH
│   ├── 40_ml/                       # features, REVENUE_CC_RISK_MODEL, PREDICT_RENEWAL_RISK
│   ├── 50_state/                    # Hybrid Tables + writeback ops
│   ├── 60_agent/                    # REVENUE_CC_AGENT + tools
│   ├── 70_governance/               # roles, RAP_REGION, MASK_ARR, AI-readiness context
│   ├── 80_mcp/                      # Snowflake-managed MCP server (staged DDL)
│   ├── 90_coco/                     # GOLD_REGION_SAVEPLAY_LEADERBOARD (built via CoCo)
│   └── 99_reset/                    # teardown / reset
│
├── snowflake-command-center/        # The Domo App Studio pro-code app
│   ├── index.html                   # shell: header/co-brand, persona select, view rail, footer
│   ├── manifest.json                # proxyId snowflakece · datasetsMapping · packagesMapping · collectionsMapping
│   ├── src/
│   │   ├── design-tokens.css        # reskin tokens (Domo Blue dominant · Snowflake accent)
│   │   ├── kit-styles.css           # reskin component library
│   │   ├── app.css                  # app-only additions (charts, How It Works blueprint, accents)
│   │   └── app.js                   # data layer + all 10 surfaces + SVG charts + persona/tab machinery
│   ├── public/
│   │   ├── brand/                   # Domo + Snowflake/Cortex marks used by the shell
│   │   └── mock/                    # live-captured seeds (one per data surface)
│   ├── codeengine/
│   │   └── functions.js             # snowflakece bridge (reference copy; deployed via Domo CE IDE)
│   ├── tools/                       # Puppeteer screenshot harness (QA)
│   ├── README.md                    # app-level notes + sprint log
│   └── SNOWFLAKE-CONNECT.md         # Domo-instance wiring + full Code Engine contract
│
├── domo-snowflake-reskin-kit/       # Design system: tokens, component CSS, brand assets
├── docs/
│   ├── demo/                        # golden-path runbook
│   └── planning/                    # frame, shaping, spikes, sprint + gate reports
└── coco-domo-plugins/               # CoCo / Cortex CLI plugin references
```

> `node_modules/`, `.qa/`, and `reference-ce.js` (a token-bearing reference) are `.gitignore`d. The Code Engine package is deployed via the Domo Code Engine IDE, not built from this repo.

---

## License

Partner demonstration asset — Snowflake AI Data Cloud + Domo. Built with Open Sans + Roboto Mono over synthetic, story-driven data. Not for production use without instance-specific governance review.
