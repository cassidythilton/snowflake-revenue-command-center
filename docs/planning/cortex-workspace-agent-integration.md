# Cortex Workspace ↔ CoWork / Snowflake Intelligence Agent — Integration Contract

Handoff for the agent building the app. **Nothing in `snowflake-command-center/`
was changed by this work** — this document is the contract for wiring the
`cowork` tab ("Cortex Workspace") to the live agent that was just deployed.

> Deployed live on `DOMOINC-DOMOPARTNER` on 2026-07-17 and validated end-to-end
> via the Cortex CLI (`cortex agents run`, i.e. Snowflake Intelligence mode).

## 1. What is live in Snowflake now

**Agent:** `SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT` (owner `SYSADMIN`,
`USAGE` granted to `REVENUE_CC_READER`). Orchestration model `claude-sonnet-4-5`.

Five tools (the Predict → Explain → Act loop):

| Tool name (in spec) | Type | Backing object | Job |
|---|---|---|---|
| `Analyst` | `cortex_analyst_text_to_sql` | `REVENUE_CC_ANALYST` semantic view | Quantify metrics / NL→SQL |
| `Search` | `cortex_search` | `REVENUE_CC_SEARCH` service | Cite incidents / QBRs / playbooks |
| `Score_Renewal_Risk` | `generic` (procedure) | `CORE.SCORE_RENEWAL_RISK(VARCHAR)` | **Predict**: live ML score for one account |
| `Propose_Retention_Action` | `generic` (procedure) | `CORE.PROPOSE_RETENTION_ACTION(account_id, account_name, region, recommendation)` | **Act (governed)**: stage a PROPOSED action |
| `data_to_chart` | `data_to_chart` | — | Visualize Analyst results |

New callable objects (source: `snowflake/60_agent/20_agent_tools.sql`):

- `SCORE_RENEWAL_RISK(account_id)` → `VARIANT`. Wraps the existing
  `PREDICT_RENEWAL_RISK` table function (Model Registry inference). Returns
  `{status, account_id, region, segment, industry, annual_recurring_revenue,
  predicted_risk_probability, predicted_label, predicted_class, model_version,
  drivers:{cases_90d, sla_breaches_90d, negative_cases_90d, avg_usage_score_90d,
  usage_drop_days_90d}}`.
- `PROPOSE_RETENTION_ACTION(account_id, account_name, region, recommendation)` →
  `VARIANT`. Inserts one row into `AGENT_ACTION_WRITEBACK` as
  `APPROVAL_STATUS='Proposed'`, `EXECUTION_STATUS='Pending'`,
  `APPROVED_BY=NULL`, `ACTUAL_REVENUE_PROTECTED=NULL`, with a generated
  `ACTION_ID` (`ACT-xxxxxxxxxx`). Returns `{status:'proposed', action_id, ...}`.

## 2. Governance boundary (do not blur this in the UI)

The agent can **recommend/propose** but **cannot approve, execute, or move
protected revenue**. `PROPOSE_RETENTION_ACTION` writes a `Proposed`/`Pending`
row only. `GOLD_PROTECTED_REVENUE_ROLLUP` counts only `Approved`+`Executed`
rows, so agent proposals never inflate Protected Revenue. Approval + writeback
stay on the separately privileged `REVENUE_CC_WRITER` path
(`snowflakece.writeActionStatus`). This is the honest recommendation ≠ execution
story — surface agent output as "Proposed — awaiting approval," routed into the
existing Approvals flow.

## 3. CoWork / Snowflake Intelligence surfacing

`CREATE/SHOW/ALTER SNOWFLAKE INTELLIGENCE` grammar is **not available** on this
account/version, so there is **no SI object and no `SNOWFLAKE_INTELLIGENCE.AGENTS`
copy** (that schema mechanism is deprecated anyway). On this account CoWork shows
every agent the caller can access, so `REVENUE_CC_AGENT` appears from its
canonical `CORE` location once `USAGE` is granted (done for `REVENUE_CC_READER`).

- **CoWork home:** `https://ai.snowflake.com/domoinc/domopartner/#/ai` → select
  **"Revenue Command Center Agent."**
- **Snowsight path:** AI & ML → Agents → `REVENUE_CC_AGENT`.
- The exact per-agent deep link should be copied from the CoWork UI once open
  (the "share/open" affordance) — treat the home URL above as the reliable
  launch target and the deep link as a nicety to confirm in-app.

## 4. Recommended `public/mock/cowork.json` updates

The current file is accurate in spirit; update these fields to match what's live:

- `agent`: keep `SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT`.
- `experience`: keep `"Snowflake Intelligence / CoWork"`.
- `openPath`: set to the CoWork home URL above (`.../#/ai`, select the agent),
  not a `snowflakecomputing.com/#/agents/...` path.
- `status` / `statusNote`: the agent is deployed and callable via the Agent API
  (proven with `cortex agents run`). It is **not yet confirmed launched to a
  business user in the CoWork UI** — keep that caveat honest.
- `skills`: the three listed skills map cleanly to the new tools —
  "Renewal Risk Briefing" = Analyst + Search + `Score_Renewal_Risk`;
  "Account Deep Dive" = `Score_Renewal_Risk` + Search (+ optional
  `Propose_Retention_Action`); "Forecast Variance Explainer" = Analyst + Search.
  You may add a 4th, e.g. **"Save-Play Proposer"** = Search + `Propose_Retention_Action`
  (governed, stages a Proposed action).
- `deepResearch.artifacts`: the sample artifacts are representative; if you want
  them to reflect the new tools, add one sourced from `Score_Renewal_Risk`
  (e.g. "ACC-00008 scored 99.9% High Risk, model v10.0, driver: 125 SLA breaches").

## 5. Agent API contract for the `snowflakece` bridge (`askCortexAgent`)

The CE bridge already calls the agent (see `snowflake-command-center/SNOWFLAKE-CONNECT.md`,
`askCortexAgent(question, persona?)`). No signature change is required. Two notes:

- The agent may now fire `Score_Renewal_Risk`, `Propose_Retention_Action`, and
  `data_to_chart` in addition to Analyst/Search. If the bridge surfaces a
  `toolsFired` array, expect those names to appear; render `Propose_Retention_Action`
  distinctly as a **proposed action** (link into Approvals), not a completed one.
- Host/auth are unchanged (`domopartner.us-east-1.snowflakecomputing.com`,
  key-pair JWT via Domo account 148, default context role `REVENUE_CC_READER`).
  `REVENUE_CC_READER` has `USAGE` on both new procedures, so the bridge identity
  can invoke every tool.

## 6. Validation evidence (2026-07-17, live)

- `SCORE_RENEWAL_RISK('ACC-00008')` → `predicted_risk_probability 0.9989`,
  `High Risk`, ARR `624,829`, drivers returned. ✅
- Agent run *"Score renewal risk for account ACC-00008 and explain the top
  drivers"* → fired `Score_Renewal_Risk` + `Search`; cited INC-0001. ✅
- Agent run *"…recommend one save play for ACC-03221 and stage it for
  approval"* → fired `Score_Renewal_Risk` + `Search` + `Propose_Retention_Action`;
  created `ACT-…` as `Proposed`/`Pending`; explicitly labeled PROPOSED-only. ✅
- `GOLD_PROTECTED_REVENUE_ROLLUP` unchanged by the proposal (governance holds). ✅
- Test proposal rows deleted; `cortex agents discover` lists the agent. ✅

## 7. What NOT to claim in the tab

- Do not claim the agent auto-executes actions or updates Protected Revenue.
- Do not claim a native CoWork iframe embed — there is no supported external
  embed; the tab's launch is a **direct link** into CoWork plus the Agent-API
  console (the deterministic in-app fallback), which is the correct pattern.
- Do not claim `SNOWFLAKE_INTELLIGENCE.AGENTS` / SI-object visibility management
  on this account — neither is active here.

## 8. Embed options — reproducing the CoWork chat experience in-app

**Bottom line:** you **cannot** iframe the native CoWork UI (`ai.snowflake.com`
is Snowsight-hosted, SSO-gated, no supported embed). You **can** fully reproduce
the *experience* — same agent, same tools, streaming, multi-turn, charts,
citations — by calling the Agent Run REST API and rendering the stream yourself.
This is the path the `snowflakece` bridge already uses.

### 8.1 Endpoint

Reference the deployed agent object (no spec in the body):

```
POST https://domopartner.us-east-1.snowflakecomputing.com/api/v2/databases/SNOWFLAKE_REVENUE_CC/schemas/CORE/agents/REVENUE_CC_AGENT:run
Authorization: Bearer <token>        # key-pair JWT (current) or per-user OAuth (see 8.5)
Content-Type: application/json
Accept: text/event-stream            # SSE; use application/json only if stream:false
```

### 8.2 Request body (multi-turn via server-side threads)

```json
{
  "thread_id": 0,
  "parent_message_id": 0,
  "messages": [
    { "role": "user",
      "content": [ { "type": "text", "text": "What is our total revenue at risk this quarter, by region?" } ] }
  ],
  "stream": true
}
```

- First turn: `thread_id: 0`, `parent_message_id: 0`.
- Each response emits a `metadata` event containing the new `thread_id` and the
  assistant `message_id`. Persist both; on the next turn send the same
  `thread_id` and set `parent_message_id` to that assistant `message_id`. This
  is exactly how CoWork keeps conversation history (the left-rail threads).
- `stream` defaults to `true` (SSE). Set `false` + `Accept: application/json`
  for a single blocking JSON response (simpler, but no typewriter effect).

### 8.3 SSE event types to render (this is what produces the CoWork look)

Handle these `event:` types off the stream — each maps to a piece of the UI in
the screenshots:

| SSE event | Render as |
|---|---|
| `response.status` | The grey status line ("Reviewed context, retrieved data, searched Search, loaded skill, created chart…"). |
| `response.thinking.delta` | Optional "Extended thinking" reasoning stream. |
| `response.text.delta` | The main answer, streamed token-by-token (typewriter). |
| `response.tool_use` | A tool was invoked — `type` (`cortex_analyst_text_to_sql`, `cortex_search`, `generic`), `name`, and `input`. Show as a tool chip. |
| `response.tool_result` / `response.tool_result.status` / `response.tool_result.analyst.delta` | Tool output (e.g. generated SQL, generic-tool VARIANT, streamed Analyst rows). |
| `response.table` | The result **table cards** (column metadata + rows). |
| `response.chart` | The **chart cards** (chart spec from `data_to_chart`) — render with your charting lib. |
| annotations `cortex_search_citation` | The numbered **citations** (doc title, index, text excerpt). |
| `response` | Final consolidated assistant message (content array of text/table/chart/thinking/tool_use/tool_result). |
| `metadata` | `thread_id` + `message_id` — save for the next turn (see 8.2). |

### 8.4 Custom tools: server-side vs. permission prompts

- Our two custom tools (`Score_Renewal_Risk`, `Propose_Retention_Action`) declare
  `execution_environment: warehouse`, so Snowflake executes them **server-side**
  (`client_side_execute: false`) — the app just renders the `tool_use` /
  `tool_result`. You do **not** need to implement the procedure logic client-side.
- Watch for a `permission` object on `response.tool_use` and the
  `permission_decision` content type: the agent may ask the user to approve a
  tool call (relevant for the write-capable `Propose_Retention_Action`). Render
  an Allow/Deny prompt and echo the decision back. This is a natural governance
  beat — the user consents before a proposal is staged.

### 8.5 Governance identity (the important parity gap)

- **Today (service identity):** the bridge signs a key-pair JWT as `DOMO_CE_USER`
  with default role `REVENUE_CC_READER`. Every viewer's answers are governed
  under that one role — not per-viewer. This reproduces the *experience* but not
  CoWork's per-user enforcement.
- **For true parity (per-user OBO):** pass a **per-user OAuth token** in
  `Authorization` instead of the service JWT. Snowflake then runs Analyst/Search/
  tools under the *actual viewer's* identity, and Horizon row-access + masking
  apply per persona — matching native CoWork. The API accepts PAT, OAuth, or
  key-pair JWT interchangeably; only the token changes. This is the C8/G3 gate.

### 8.6 Reusable building blocks

Snowflake ships drop-in components that already parse this SSE schema —
`cortex-chat-interface` (frontend: streaming, threads, agent selection, chart
rendering) and `cortex-chat-server` (backend proxy: auth, session attrs, SSE).
Use them as reference implementations; keep the token minting server-side in the
Code Engine bridge so no Snowflake credential ever reaches the browser.

## 9. UI fidelity — replicate the CoWork UI as closely as possible

Product direction: the Cortex Workspace tab should **look and feel like the
native CoWork chat**, not a generic chatbot. Match it closely:

- **Capture the real UI as ground truth.** Use the live CoWork session at
  `https://ai.snowflake.com/domoinc/domopartner/#/ai` and inspect via Chrome
  DevTools to lift exact layout, spacing, type scale, colors, border radii,
  status-line copy, tool/citation chip styling, table + chart card treatments,
  the left thread rail, and the composer (with "Extended thinking" toggle). The
  saved screenshots in `assets/` are reference frames; DevTools gives the precise
  tokens. Reconcile against the app's existing `design-tokens.css` /
  `kit-styles.css` so it still reads as native-Domo, not a pixel clone that
  fights the shell.
- **Map 1:1 to the SSE events in §8.3** so the reproduced UI is driven by real
  agent output (status line, streamed answer, tool chips, table/chart cards,
  numbered citations, thread history) — fidelity of *behavior*, not just chrome.
- **Attribution:** it's fine to visually echo CoWork, but keep it clearly the
  Domo app surface (Domo shell/nav, "Open in CoWork" affordance for the native
  experience). Don't misrepresent the reproduced console as the Snowflake-hosted
  UI itself.
