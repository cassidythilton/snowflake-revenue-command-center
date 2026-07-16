# Snowflake Revenue Command Center — pro-code app

Governed Domo App Studio pro-code app (vanilla JS + ryuu.js) over the Snowflake
intelligence plane. **Snowflake** (Horizon + semantic views + Cortex) is the
governed brain; **Domo** is the delivery + action surface. Built on the
`domo-snowflake-reskin-kit` design system (Domo Blue dominant, Snowflake accent).

## Status
- **Sprint 2:** Forecast Home (surface 1) rendering from the `snowflakece` Code
  Engine bridge, with a live → sample-seed fallback so the shell renders anywhere.
- **Sprint 3:** Cortex Analyst — ask "why" in natural
  language over the governed `REVENUE_CC_ANALYST` semantic view. The bridge posts
  to `/api/v2/cortex/analyst/message`, returns the interpretation + generated SQL
  + follow-up suggestions, then executes that SQL as `REVENUE_CC_READER` so the
  browser gets live rows it charts. Offline preview is seeded from real Cortex
  Analyst runs (`public/mock/analyst-answers.json`).
- **Cortex Analyst upgrade + Semantic Model (this build):** two surfaces modeled on
  the instance's *Cortex Chatbot* and *Nexus/FinServ Semantic Explorer* apps.
  - **Cortex Analyst (surface 3) is now a conversational chatbot** — a multi-turn
    transcript that threads `conversationHistory` back through `askAnalyst` so
    Analyst keeps context. Each answer carries the generated SQL (copy), live rows
    with a **switchable bar/line/pie chart + CSV export**, follow-up chips, and a
    per-turn API inspector. A "Recent questions" rail persists to the
    **`recent_queries` AppDB collection** (localStorage offline); "New chat" resets.
  - **Semantic Model (new surface)** — a live view of the governed semantic layer
    that powers the app, via `describeSemanticView` (`DESCRIBE SEMANTIC VIEW`
    parsed into a graph). Three tabs: an **entity graph** (tables → dims/facts/
    metrics, relationships drawn, AI custom instructions), a **verified-query
    gallery** (the `AI_VERIFIED_QUERY` set Cortex trusts — run live via `runSql`),
    and a **Model DDL** builder that evolves the layer through `alterSemanticView`
    (best-effort `ALTER SEMANTIC VIEW`, honestly labeled re: view ownership).
    Offline seed captured from the live view: `public/mock/semantic-model.json`
    (9 tables, 14 relationships, 5 verified queries).
- **Sprint 4 (this build):** Cortex Agent Queue (surface 4) — one shared Cortex
  Agent (`REVENUE_CC_AGENT`) bundling Cortex Analyst (structured metrics over the
  semantic view) + Cortex Search (unstructured incident/QBR/playbook docs). The
  bridge calls the non-streaming Agents REST `…:run` endpoint and flattens the
  `tool_use` / `tool_result` / `text` blocks into a grounded recommendation, the
  Analyst-generated SQL, and cited evidence. The surface shows the agent answer
  with Analyst/Search tool badges, a cited-evidence rail, and an Agent Action
  Queue of playbook-grounded save plays with human-approval gates (writeback
  lands in Sprint 6). Offline preview is seeded from a real agent run
  (`public/mock/agent-queue.json`).
- **Sprint 5 (this build):** two Snowflake-native surfaces.
  - **Snowflake ML** (surface 6) — score any account live against
    `REVENUE_CC_RISK_MODEL`, a native `SNOWFLAKE.ML.CLASSIFICATION` renewal-risk
    model trained + served in-warehouse (96K rows). The bridge calls the table
    function `PREDICT_RENEWAL_RISK(account_id)` as `REVENUE_CC_READER` and returns
    the probability, the exact feature vector, model card (type/target/importances),
    and a request/response inspector (SQL · curl · Snowpark). "Accept prediction →
    seed scenario" writes a row to the Hybrid Table and jumps to Ops.
  - **Snowflake Ops** (surface 7) — a Hybrid Tables workspace. Browse / add /
    change-status / delete what-if **scenario runs** and log human **prediction
    feedback** (operational memory). Reads run as `REVENUE_CC_READER`; writes as
    `REVENUE_CC_WRITER` (least privilege). Offline preview is seeded from live
    objects (`public/mock/ml-score.json`, `public/mock/ops-state.json`).
- **Sprint 6:** Approvals (surface 5) — the agent-to-agent action
  loop. `getApprovalQueue` **reads** the pending queue + protected-revenue rollup
  as `REVENUE_CC_READER`; `writeActionStatus` **writes** approve/reject/execute
  results as `REVENUE_CC_WRITER` via an idempotent `MERGE` into the
  `AGENT_ACTION_WRITEBACK` hybrid table — a deliberately distinct privilege. The
  surface shows a protected-revenue hero that ticks up on execution, READER→WRITER
  privilege chips, Pending → Approved-awaiting-writeback → Executed lanes, and an
  Action Journey timeline driven by the selected action's real state with
  go-to-source chips. Offline seed: `public/mock/approvals.json` (live queue +
  rollup). The Domo Workflow + Task Center orchestration overlay is documented in
  `SNOWFLAKE-CONNECT.md`; the in-surface loop is the deterministic fallback.
- **Sprint 7 (this build):** Horizon AI Readiness (surface 8) — governance enforced
  at the query engine. `getGovernance` runs the **two-persona parity test** live:
  the *same* governed query returns 4,000 rows (all regions) under `REVENUE_CC_READER`
  but only West (1,383) / East (1,027) under the region-scoped roles
  `REVENUE_CC_READER_WEST` / `_EAST` — via the `RAP_REGION` row-access policy on
  `DIM_ACCOUNT`. A `MASK_ARR` masking policy redacts `ANNUAL_RECURRING_REVENUE` for
  scoped roles. Both policies are **fail-open** for the base reader/writer, so every
  other surface is untouched. The tab also surfaces active-policy + governed-object
  inventory, honestly-labeled Cortex guardrail / observability / evaluation status,
  and a Horizon ↔ Domo AI Readiness parity table. Governance is role-based under a
  named service identity — per-end-user identity passthrough (C8) is disclosed as a
  target-instance enablement, not simulated. DDL in `snowflake/70_governance/`; offline
  seed `public/mock/governance.json`.
- **Sprint 8:** CoWork · MCP (surface 9). Launchpad that opens the *same*
  `REVENUE_CC_AGENT` in Snowflake Intelligence (Deep Research + cited artifacts,
  Skills), the **Snowflake-managed MCP outward** panel (tool inventory + JSON-RPC
  client contract; labeled *Available (target-instance)* since `CREATE MCP SERVER`
  is private preview), and the **Domo Essentials MCP** panel (beta follow-on,
  gated). Seeds: `public/mock/mcp.json`, `public/mock/cowork.json`.
- **Sprint 9 (this build):** Domo Chat v2 (surface 2), How It Works (surface 10),
  and the CoCo live-builder story. **Chat v2** is an honestly **gated** tab —
  it documents that Chat v2 reaches Snowflake through the same managed MCP server
  (inheriting the semantic view + `RAP_REGION`/`MASK_ARR`) and never simulates a
  conversation. **How It Works** shows the Predict→Explain→Act→Remember→Govern
  spine, the technical architecture with honest maturity chips, and the **CoCo**
  panel — a real additive/reversible view (`GOLD_REGION_SAVEPLAY_LEADERBOARD`)
  built live via the Cortex CLI. Seed: `public/mock/cocobuild.json`. Demo runbook
  + reset live in `docs/demo/` and `snowflake/99_reset/`.
- Every data surface falls back to its live-captured seed if the bridge is
  unavailable; gated surfaces (Chat v2, Domo MCP) document target-instance wiring
  and never fake a conversation or a call.

## Layout
```
snowflake-command-center/
├── index.html               # shell: header/co-brand, persona select, view tabs, footer
├── manifest.json            # proxyId snowflakece + packagesMapping (18 fns @ 1.1.0) + collectionsMapping (recent_queries, configuration)
├── src/
│   ├── design-tokens.css    # reskin tokens (verbatim)
│   ├── kit-styles.css        # reskin component library (verbatim)
│   ├── app.css              # app-only additions (donut, banner, Snowflake accents, placeholders)
│   └── app.js               # data layer + Forecast Home render + SVG charts + persona/tab machinery
├── public/
│   ├── brand/               # Domo + Snowflake/Cortex SVG marks used by the shell
│   └── mock/
│       ├── forecast-home.json     # live Cortex-read seed (Forecast Home sample data)
│       ├── analyst-answers.json   # real Cortex Analyst runs (Analyst chatbot sample data)
│       ├── semantic-model.json    # captured DESCRIBE SEMANTIC VIEW (Semantic Model sample data)
│       ├── agent-queue.json       # real Cortex Agent run + save-play queue (Agent sample data)
│       ├── ml-score.json          # live model scores + model card (Snowflake ML sample data)
│       ├── ops-state.json         # live hybrid-table rows (Snowflake Ops sample data)
│       ├── approvals.json         # live action queue + protected-revenue rollup (Approvals sample data)
│       ├── governance.json        # live parity test + masking + policy/guardrail inventory (Horizon AI Readiness sample data)
│       ├── mcp.json               # managed-MCP tool inventory + JSON-RPC client contract + Domo MCP gating (CoWork·MCP sample data)
│       ├── cowork.json            # CoWork agent link + Deep Research citations + Skills (CoWork·MCP sample data)
│       └── cocobuild.json         # live CoCo builder task evidence (How It Works sample data)
├── codeengine/
│   └── functions.js         # snowflakece bridge: SQL API + Cortex Analyst (multi-turn) + Agent + ML inference + Hybrid CRUD + action writeback + governance parity + semantic-view introspection/DDL
└── SNOWFLAKE-CONNECT.md     # Domo-instance wiring: service identity, CE publish, Cloud Amplifier, publish
```

## Data flow
`app.js` → `domo.post('/domo/codeengine/v2/packages/getForecastHome', {persona})`
→ `snowflakece` (Code Engine, server-side) → Snowflake SQL API (`POST /api/v2/statements`)
under `REVENUE_CC_READER` → aggregates → Forecast Home. The Snowflake credential
never touches the browser. If the live call is unavailable, the app renders the
`public/mock/forecast-home.json` seed (produced by a live `cortex` read) and shows
a **Sample data** pill.

Cortex Analyst uses the same bridge: `app.js` → `askAnalyst({question, persona,
conversationHistory})` → `snowflakece` posts to `POST /api/v2/cortex/analyst/message`
(semantic view `SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST`, prior turns threaded in)
→ parses the `text`/`sql`/`suggestions` content blocks → executes the generated SQL
via the SQL API as `REVENUE_CC_READER` → returns answer + SQL + columns/rows +
the updated `conversationHistory` + the full API request/response for the inspector.

The Semantic Model surface calls `describeSemanticView({view})` → `snowflakece` runs
`DESCRIBE SEMANTIC VIEW` and parses the flat metadata into a graph (tables, dims,
facts, metrics, relationships, verified queries, custom instruction). Verified
queries run via `runSql`; `alterSemanticView({ddl})` evolves the layer (best-effort).

## Local preview
```bash
python3 -m http.server 8899   # from this folder
# open http://localhost:8899/index.html  (renders in sample mode; /domo.js 404 is expected)
```

## Going live
See `SNOWFLAKE-CONNECT.md`. The one external dependency for the whole program
that this app can't self-serve is capability gate **G1** (Domo Chat v2 + Domo
Essentials MCP beta) — a target-instance confirmation.
