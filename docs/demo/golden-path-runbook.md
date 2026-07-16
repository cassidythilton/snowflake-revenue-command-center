# Revenue Command Center — Demo Golden-Path Runbook

**App:** Domo App Studio pro-code app `snowflake-command-center` (proxy `snowflakece`).
**Instance:** `snowflake-demo.domo.com` · Design `db8047cf-49ad-4c2b-8665-e0970d5ed874`.
**Snowflake:** `SNOWFLAKE_REVENUE_CC.CORE` · warehouse `REVENUE_CC_WH` · reads `REVENUE_CC_READER`, writes `REVENUE_CC_WRITER`.

The whole demo is one sentence: **one governed brain (Snowflake), many governed surfaces (Domo).** Metrics never fork out of Snowflake.

---

## Pre-flight (2 min)
1. Confirm the `snowflakece` Code Engine package is published and all 14 functions are routed (see `SNOWFLAKE-CONNECT.md`).
2. Confirm the Cloud Amplifier / key-pair credential is set. If not, the app runs in **Sample seed** mode — every surface still works from committed live-captured seeds; the header pill reads "Sample seed."
3. Optional reset to a clean state: run `snowflake/99_reset/00_reset.sql` (see below).

**Deterministic fallback contract:** every data surface tries the live `snowflakece` call, and on any failure silently falls back to its `public/mock/*.json` seed (captured from the live account). Gated surfaces (Chat v2, Domo MCP) **never** simulate — they document the target-instance wiring. So the demo cannot hard-fail on stage.

---

## Golden path (9 beats, ~12 min)

| # | Beat | Tab | What to show | Live object | Fallback |
|---|---|---|---|---|---|
| 1 | **Predict** | Forecast Home | KPIs, actual-vs-forecast, regional risk, action queue. "West is hot." | gold views via `getForecastHome` | `forecast-home.json` |
| 2 | **Predict (ML)** | Snowflake ML | Score `ACC-00008` live; probability gauge + feature importance; inspect SQL/curl/Python. | `PREDICT_RENEWAL_RISK` table fn | `ml-score.json` |
| 3 | **Explain** | Cortex Analyst | **Conversational** — ask "Why did West Enterprise renewal risk rise this month?", then a follow-up (context threaded). Each answer = generated SQL (copy) + rows + switchable bar/line/pie chart + CSV + API inspector; recent questions persist to AppDB. | `REVENUE_CC_ANALYST` via `askAnalyst` (multi-turn) | `analyst-answers.json` |
| 3b | **Explain (semantic layer)** | Semantic Model | Show the governed layer the whole app runs on: live entity graph (tables/dims/metrics/relationships), the verified-query gallery Cortex trusts, and the Model DDL builder (`ALTER SEMANTIC VIEW`). "Metrics are defined once, here." | `DESCRIBE SEMANTIC VIEW` via `describeSemanticView`; `alterSemanticView` | `semantic-model.json` |
| 4 | **Explain (agentic)** | Cortex Agent Queue | Same question to the agent → recommendation with Analyst + Search citations; save plays queued. | `REVENUE_CC_AGENT` via `askCortexAgent` | `agent-queue.json` |
| 5 | **Act** | Approvals | Approve a save play (READER queue) → **Execute writeback** (WRITER); protected-revenue hero ticks up; Action Journey animates. | `AGENT_ACTION_WRITEBACK` MERGE via `writeActionStatus` | `approvals.json` |
| 6 | **Remember** | Snowflake Ops | Hybrid Tables workspace — scenario runs + prediction feedback CRUD (operational memory). | `SCENARIO_RUNS`, `PREDICTION_FEEDBACK` | `ops-state.json` |
| 7 | **Govern** | Horizon AI Readiness | **Two-persona parity**: same query → READER 4,000 vs WEST 1,383 vs EAST 1,027. Column masking. Guardrail/observability status. Horizon↔Domo AI Readiness parity. | `RAP_REGION` + `MASK_ARR` via `getGovernance` | `governance.json` |
| 8 | **Everywhere (MCP + CoWork)** | CoWork · MCP | Same agent opens in Snowflake Intelligence (Deep Research, cited). Managed MCP exposes the same tools outward (contract captured; private preview). Domo MCP honestly gated. | `REVENUE_CC_AGENT`; MCP DDL template | `cowork.json`, `mcp.json` |
| 9 | **Beyond parity (build)** | How it works | Solution spine (Predict→…→Govern), technical architecture with honest maturity labels, and the **CoCo live build** (`GOLD_REGION_SAVEPLAY_LEADERBOARD`, built via Cortex CLI, reversible). | `cortex --mode code` | `cocobuild.json` |

**Chat v2 (surface 2)** is shown as the third first-class conversation but is **gated** — it documents that Chat v2 reaches Snowflake through the *same* managed MCP server, inheriting the semantic view + policies. Never simulated.

---

## Reset procedure
`snowflake/99_reset/00_reset.sql` returns the operational + demo layer to a known baseline so the golden path can be re-run:
- Re-seeds `SCENARIO_RUNS` + `PREDICTION_FEEDBACK` from `snowflake/50_state/20_seed.sql`.
- Clears session writeback rows in `AGENT_ACTION_WRITEBACK` (baseline protected revenue only).
- Optionally drops the CoCo demo view so beat 9 can rebuild it live: `DROP VIEW IF EXISTS SNOWFLAKE_REVENUE_CC.CORE.GOLD_REGION_SAVEPLAY_LEADERBOARD;`

Governance objects (roles, policies), the semantic view, search service, agent, and ML model are **not** reset — they are stable infrastructure.

---

## Honesty labels (say these out loud)
- **GA / live:** Horizon policies, semantic view, Cortex Analyst, Cortex Search, the Agent, Snowflake ML, Hybrid Tables, the writeback loop, AI Observability.
- **Available / target-instance:** Snowflake-managed MCP server (private preview — DDL + client contract captured, not executed), Snowflake Intelligence seat for CoWork, per-end-user identity passthrough (C8).
- **Beta / gated:** Domo Chat v2, Domo Essentials MCP outward (gate G1).
- Governance is **role-based under a named service identity** (`SVC_REVENUE_CC`); we do not claim per-end-user Snowflake enforcement.
