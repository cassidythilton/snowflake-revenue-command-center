# Fidelity & Parity Plan — Snowflake Revenue Command Center vs. Databricks Pattern 4 reference

Goal: achieve **near-synonymous functionality** across the Databricks (reference) and
Snowflake versions, delivered through Domo. Reference = the 9 screenshots at
`dais-demo-scenarios/media/screencapture-...2026-07-17-06_*.png`.

This plan responds to the 5 asks:
1. Tab analysis — remove/coalesce crowded + overlapping tabs (ref app is the standard).
2. Source hyperlinks — click into every source (tables/views/semantic views/models/agents) in **both** Snowflake and Domo.
3. Represent sources in the UI — "Governed Data Lineage", "datasets", etc.
4. Horizon AI Readiness ≈ reference **UC AI Readiness**.
5. MCP CoWork ≈ reference **Genie Workspace** (embed a CoWork/Intelligence agent).

---

## 0. Reference app = 7 tabs (the standard)

| # | Reference tab | What it is |
|---|---|---|
| 1 | **Forecast Home** | KPIs → full-width Actual vs. Forecast chart (26/52/78W + confidence band) → Regional Renewal Risk + Insight Rail → Agent Action Queue table → **Governed Data Lineage** (5 source cards, Open Domo dataset / Open Databricks table) |
| 2 | **ML Predictions** | Model-serving header → Ad-hoc inference form → Prediction (gauge, drivers, Accept/Adjust/Reject) → **Inference Payload & Endpoint** (cURL/Python/SQL, Open endpoint) |
| 3 | **Approvals** | Action Center table fed by the **native Domo queue** (Task / Status / Created / Completed / Approve·Reject); each task links out (↗) |
| 4 | **Lakebase Ops** | OLTP operational state: Scenario Runs + Prediction Feedback tables, editable, Open in Lakebase / Open source table |
| 5 | **UC AI Readiness** | Per-column readiness control plane: dataset rail (UC% vs Domo%), context-length gauge, prepared/synced, per-column Sync/Wipe/Inspect, Open Domo AI Readiness / Open Databricks table |
| 6 | **Genie Workspace** | **Embedded native Genie chat** (iframe) + suggested starters + Open in Databricks |
| 7 | **How It Works** | 3 sub-views: Solution Architecture (clickable tiles) · Technical Architecture (node graph, light/dark) · User Guide (8 steps) |

Every tab shares the same governance chrome: `Live · Cloud Amplifier · Unity Catalog governed`,
persona selector, and inline source links.

---

## 1. Our current 11 tabs → recommended 7 (tab coalescing)

Current: `home, chat (Domo Chat v2), analyst (Cortex Analyst), semantic (Semantic Model),
agents (Cortex Agent Queue), approvals, ml (Snowflake ML), ops (Snowflake Ops),
readiness (Horizon AI Readiness), cowork (CoWork·MCP), how`.

Overlap problem: **5 conversational/semantic surfaces** (chat, analyst, semantic, agents, cowork)
where the reference has **1 conversational tab (Genie) + inline agent + lineage/readiness**.

### Recommended target = 7 tabs (maps 1:1 to the reference)

| Target tab | Built from | Action |
|---|---|---|
| **Forecast Home** | `home` | Keep. Add Governed Data Lineage + source links + inline Agent Action Queue (see §2–3). |
| **Cortex Analyst** | `analyst` | Keep — this is our Genie/NL→SQL analog, already at reference polish (Processing card + Table/Chart/Details). |
| **Snowflake ML** | `ml` | Keep. Already mirrors ML Predictions. Add Open-endpoint / model source links. |
| **Snowflake Ops** | `ops` | Keep = Lakebase Ops analog (Hybrid Tables). Add Open-in-Snowflake / source-table links. |
| **Horizon AI Readiness** | `readiness` **+ merge `semantic`** | Rebuild to match UC AI Readiness (per-column control plane). Fold the Semantic Model entity graph + verified queries in as the "source of truth" panel (§4). |
| **Cortex Workspace** (CoWork) | `cowork` **+ absorb `chat`** | Rebuild as Genie Workspace analog: embed a Snowflake CoWork/Intelligence agent; keep Domo-chat-via-MCP as the Domo-side counterpart story (§5). |
| **How it works** | `how` | Keep. Ensure 3 sub-views (Solution / Technical / User Guide). |

### Tabs removed / coalesced (11 → 7)
- **Domo Chat v2 (`chat`)** → **absorbed into Cortex Workspace** (it is the Domo-side conversational/MCP counterpart; reference has no separate Domo-native chat tab). Removes 1.
- **Cortex Agent Queue (`agents`)** → **coalesced into Forecast Home (Agent Action Queue section) + Approvals**. In the reference the agent queue lives on Forecast Home and agentic approval lives in Approvals — there is no standalone agent-chat tab. The "agent⇄agent Action Journey" animation moves to an "Inspect agent" affordance on the queue rows. Removes 1.
- **Semantic Model (`semantic`)** → **merged into Horizon AI Readiness** as the "source of truth" panel (entity graph + verified queries + DDL), since the semantic view *is* the readiness metadata source (mirrors how UC is the source in the reference). Removes 1.

Net: **11 → 8**, then Analyst + Workspace are the two conversational tabs. If we want an exact 7,
the only further merge would be Analyst into Workspace — **not recommended**: Cortex Analyst
(governed NL→SQL over the semantic view) and CoWork (agentic + MCP + Deep Research) are genuinely
distinct Snowflake primitives and both are demo-critical. Reference parity is about *structure and
fidelity*, not literally 7; 8 tabs with zero overlap reads far cleaner than today's 11.

> **DECISION FOR USER:** approve the 8-tab target (Analyst + Workspace kept separate) vs. a strict
> 7 (Analyst folded into Workspace). Recommendation: **8-tab target.**

---

## 2. Source-hyperlink inventory (ask #2)

Principle from the reference: *everywhere a governed object is named, it is a link* — to both the
Snowflake object (Snowsight) and the Domo object (dataset / AI Readiness / queue / workflow).

Helpers to add (once): `snowsightHref(kind, fqn)` and `domoDatasetHref(dataSetId)` /
`domoModelHref(id)` (already exists) / `queueConsoleHref` (exists) / `workflowHref(modelId)`.
Snowsight base + account locator to be confirmed via Cortex CLI (open item O1).

| Tab | Object | Snowflake link | Domo link | Status |
|---|---|---|---|---|
| Forecast Home | 5 gold views (GOLD_EXECUTIVE_REVENUE_HEALTH, GOLD_CUSTOMER_RENEWAL_RISK, GOLD_INCIDENT_REVENUE_IMPACT, GOLD_AGENT_ACTION_QUEUE, GOLD_PORTAL_USER_SCOPE) | Snowsight view | Open Domo dataset (dataSetId in manifest) | **ADD** (Governed Data Lineage) |
| Forecast Home | Agent Action Queue rows | — | Inspect agent / Approvals → | **ADD** |
| Cortex Analyst | active semantic view (REVENUE_CC_ANALYST) | Snowsight semantic view | Domo AI Readiness | partial (name shown, not linked) → **ADD** |
| Snowflake ML | model + endpoint | Snowsight model registry / Open endpoint | — | **ADD** |
| Snowflake Ops | hybrid tables (SCENARIO_RUNS, PREDICTION_FEEDBACK) | Snowsight table / Open in Snowflake | Open source table | **ADD** |
| Horizon AI Readiness | each dataset/view + columns | Snowsight table/view | Open Domo AI Readiness | **ADD** |
| Approvals | task rows | — | Task Center queue (↗) | DONE |
| Approvals | workflow | — | Open workflow model | **ADD** |
| Workspace | Cortex Agent + MCP server | Snowsight agent / Snowflake Intelligence | Domo chat | **ADD** |
| How it works | all node tiles | Snowsight | Domo object | **ADD** (clickable tiles) |

---

## 3. Represent sources in the UI (ask #3)

- **Forecast Home → "Governed Data Lineage"** section (reference parity): 5 cards, one per gold
  view, each: object name, FQN (`SNOWFLAKE_REVENUE_CC.CORE.<VIEW>`), **Open Snowflake view** +
  **Open Domo dataset**. Intro line: "Five Snowflake gold views, live-federated into Domo via the
  Snowflake Cloud Amplifier integration — no copies."
- **Horizon AI Readiness → dataset rail** (reference "Unity Catalog datasets"): list of the governed
  views with Snowflake%/Domo% bars (see §4).
- **How it works** → clickable Solution + Technical architecture tiles naming each Snowflake/Domo
  component with links.
- Shared footer: "Build with Snowflake · Deliver with Domo · Govern everywhere".

Data available today: `manifest.datasetsMapping` already carries `dataSetId` for each gold view →
use directly for Domo dataset links. Snowflake FQNs are known. Snowsight URL format = open item O1.

---

## 4. Horizon AI Readiness ≈ UC AI Readiness (ask #4)

Rebuild `readiness` to match the reference control plane exactly:

**Layout**
- Header: "HORIZON · SOURCE OF TRUTH" / "AI Readiness Control Plane" + intro.
- Top-right summary bars: **Snowflake prepared %** (columns with comments/synonyms) and
  **Domo AI Readiness synced %**.
- Left rail **"Snowflake governed datasets"**: one card per gold view / semantic view, each with
  Snowflake% (prepared) + Domo% (synced) bars + status dot.
- Main panel (selected dataset): FQN + **Open Snowflake** / **Open Domo AI Readiness**;
  context-length gauge; prepared %; synced %; **Sync all prepared / Wipe all from Domo**.
- Per-column table: COLUMN (name+type) · SNOWFLAKE (Prepared) · DOMO AI READINESS (Synced/Not) ·
  SOURCE CONTEXT (comment + N synonyms) · **Sync / Wipe / Inspect**.
- Fold in the **Semantic Model** entity graph + verified-query gallery as a "source of truth" sub-panel.

**CE functions needed (open item O2 — may reference the DBX package's readiness fns):**
- `getReadinessDatasets()` → list governed views + prepared/synced counts.
- `getColumnReadiness(view)` → per-column {name, type, prepared, synced, comment, synonyms}.
  Snowflake source = `INFORMATION_SCHEMA.COLUMNS` comments + semantic-view synonyms/`COMMENT`.
- `syncColumnToDomo(view, column, context, synonyms)` / `wipeColumnFromDomo(view, column)` →
  write/clear the Domo dataset **column description / AI Readiness** for the federated dataset.
- We already have `describeSemanticView` (reuse for synonyms/metrics) + `getGovernance`.

> **ASK TO USER:** please share the reference **UC AI Readiness Code Engine functions** (names +
> I/O) so I can build faithful Snowflake equivalents (sync/wipe into Domo AI Readiness). You offered this.

---

## 5. CoWork Workspace ≈ Genie Workspace (ask #5)

Reference embeds **native Genie** as an iframe chat inside the tab (Domo-branded card, suggested
starters, "Open in Databricks"). Snowflake analog = embed a **Snowflake CoWork / Snowflake
Intelligence agent** conversation.

**Plan**
- Rebuild `cowork` as "Cortex Workspace — Native Snowflake": embedded Snowflake Intelligence / CoWork
  agent (iframe or Agent API-backed chat), suggested starters (reuse AGENT_PROMPTS), **Open in
  Snowflake** link, and a "legacy panel" fallback (our existing Cortex Agent inspector: generated SQL
  + tools fired + telemetry).
- Absorb the Domo Chat v2 MCP story here as the Domo-side counterpart.

**Cortex CLI due diligence (open item O3):** confirm the supported embed path for a CoWork/Snowflake
Intelligence agent:
- Is there an embeddable URL for a Snowflake Intelligence agent (like Genie's embed), and what auth
  (SSO / token) does the iframe need under Domo?
- Or must we drive it via the Cortex **Agent API** (`/api/v2/cortex/agent:run`) and render the
  conversation ourselves (we already call the agent via CE `askCortexAgent`)?
- Feasibility of an MCP-server-backed session (Snowflake-managed MCP) surfaced in-app.

Until embed is confirmed, the tab uses our **API-backed agent chat** (CE `askCortexAgent`) styled to
match Genie Workspace, with the "Open in Snowflake" deep link — visually + functionally synonymous.

---

## 6. Also-noted fixes
- Workflow task **attributes empty**: `startRetentionWorkflow`/form mapping should populate the task
  card (account, recommendation, protected $, agent rec) so the queue + Approvals rows show context
  (reference shows rich task rows). Fix in CE + form field bindings.
- Persona selector + governance chip consistency across all tabs.

---

## 7. Open items to confirm
- **O1** — Snowsight base URL + account/org locator for `snowsightHref` (get via Cortex CLI).
- **O2 / ASK** — reference UC AI Readiness CE functions (from user).
- **O3** — CoWork/Snowflake Intelligence embed path (Cortex CLI due diligence).
- **DECISION** — approve 8-tab target (recommended) vs strict 7 (Analyst folded into Workspace).

## 8. Execution order (after alignment)
1. Nav restructure → 8 tabs (remove chat/agents/semantic as standalone; wire redirects).
2. Forecast Home: Governed Data Lineage + source links + inline Agent Action Queue.
3. Source-link helpers + apply across all tabs (§2 table).
4. Horizon AI Readiness rebuild (needs O2).
5. Cortex Workspace rebuild (needs O3).
6. Task-attribute fix (§6).
7. Publish + QA screenshots per tab + push.
