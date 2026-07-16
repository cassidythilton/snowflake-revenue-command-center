---
shaping: true
---

# Snowflake Revenue Command Center — Shaping

Working document for scoping the Snowflake sibling of Databricks **Pattern 4 — Revenue Command Center**. See `snowflake-revenue-command-center-frame.md` for the why. Ground truth for requirements (R), the capability map, shapes, and the fit check.

> **Location note:** These docs live in the `snowflake-revenue-command-center/` workspace (mirroring how `dais-demo-scenarios/` houses the Databricks build). The original ask said "in `dais-demo-scenarios/`" — if you'd rather nest the Snowflake scope under the Databricks repo, say so and the files move.

---

## 1. Deep dive: CURRENT (Databricks) vs FUTURE (Snowflake) — capability map

Each row is a *part* of the Pattern 4 solution and its Snowflake-plane translation. "Gap" flags where the Snowflake path is **not** a clean 1:1 and needs a decision or spike.

| # | Pattern 4 part (Databricks) | Role | Snowflake equivalent (FUTURE) | Gap / note |
|---|------------------------------|------|-------------------------------|------------|
| 1 | Unity Catalog gold views + tags/comments/lineage (**source of truth**) | Governed metric layer | **Snowflake Horizon Catalog + Horizon Context + Semantic Views** (governed, schema-level metric objects) | Low. Semantic views are a *stronger* metric layer than tagged views — they carry business metrics/relationships and are what Cortex Analyst reads. Requires authoring semantic views (Autopilot/CoCo can bootstrap). |
| 2 | Cloud Amplifier (`Databricks Raptor AWS`) live federation, no copy | Interop / delivery of data to Domo | **Domo Cloud Amplifier for Snowflake** (native, no-copy live query + writeback + OAuth OBO) | None — arguably the most mature Cloud Amplifier target. Read via service account or per-user OAuth; writeback via service account. |
| 3 | Genie Space + Conversation API | Conversational analytics (explain) | **Cortex Analyst** REST API (`POST /api/v2/cortex/analyst/message`) over a semantic view; returns text + generated SQL + result rows | Low. 1:1 for the "ask why, see the SQL, reconstruct the chart" panel. Analyst writes SQL; app (or `SYSTEM$CORTEX_ANALYST`) executes it. |
| 4 | Agent Bricks Supervisor (MAS), Genie-grounded | Multi-agent orchestration for the action loop | **Snowflake Cortex Agents** (orchestrates Cortex Analyst + Cortex Search + custom tools + MCP) via Cortex Agents API | Low-med. Cortex Agents is the direct analog; agent is a first-class Snowflake object (`CREATE AGENT`) with RBAC + eval + versioning. |
| 5 | Model Serving + MLflow (renewal-risk regressor v6), Unity AI Gateway-governed endpoint | Predict | **Snowflake ML**: Model Registry + **Native Batch Inference (SQL)** `MODEL(name)!predict(...)` or **ML Functions** (CLASSIFICATION), or SPCS real-time for sub-second scoring | Med. Choose serving mode: SQL/native (simplest, warehouse-scaled) vs SPCS (real-time, sub-second live scoring in the ML tab). Governance via Horizon (models versioned/tagged under RBAC). |
| 6 | Lakebase Postgres (`cobra-v1`) — OLTP app state | Remember (scenarios, feedback) | **Snowflake Hybrid Tables** (native OLTP, unified governance) **or Snowflake Postgres** (managed PG next to the platform) | Med — a real fork. Hybrid Tables = zero new surface, native governance. Snowflake Postgres = closest literal analog to "Lakebase Postgres." Pick one (see C6). |
| 7 | Unity AI Gateway (usage, rate limits, guardrails, inference tables) | Govern the model + LLM calls | **Cortex Guard / AI Guardrails** + **Horizon Catalog AI governance** (PII detect/redact/block on agent outputs) + budget/cost controls + Cortex observability | Med. No single "gateway" object; governance is enforced *at the query engine* by Horizon + Cortex Guard rather than a fronting proxy. Reframe the "gateway" narrative accordingly. |
| 8 | Domo PDP ↔ UC row filters (one entitlement model) | Govern (entitlement parity) | **Domo PDP ↔ Snowflake RLS/masking (Horizon)** parity; OAuth OBO scopes reads per-user | Low-med. Same shaping problem as Pattern 4; Snowflake RLS/masking apply automatically to every caller including Cortex/CoWork. |
| 9 | Domo Workflow + AI agent tile + Task Center approvals + Delta writeback | Act (human-in-loop) | **Unchanged on Domo side**; AI agent tile calls a **Cortex Agent** instead of MAS; writeback lands in Snowflake (Cloud Amplifier writeback or CE `INSERT`) | Low. This is the centerpiece and transfers almost verbatim. |
| 10 | Code Engine `pattern4ce` (server-side bridge; token never in browser) | Interop bridge (MCP-direction) | **New CE package** (`snowflakece`/`cortexce`): swap Databricks REST for Cortex Analyst API, Cortex Agents API, ML inference SQL, Hybrid Table/PG CRUD, Horizon metadata read/write | Low. Same manifest `proxyId` + typed-param pattern; only endpoint bodies change. |
| 11 | UC AI Readiness sync (UC metadata → Domo AI Readiness) | Govern (AI-readiness) | **Horizon Context / semantic-view metadata → Domo AI Readiness**; plus **Domo Chat v2 → Snowflake Intelligence** direct routing (queries never leave Snowflake) | Med — *expands*. Two flows: (a) metadata sync into Domo AI Readiness, (b) Domo Chat v2 routing NL to Snowflake Intelligence for Snowflake-resident, AI-ready datasets. |
| 12 | Pro-code App Studio app, 7 tabs, vanilla JS + ryuu.js | Delivery surface | **Same app shell**, restyled to a Snowflake co-brand kit; tabs re-pointed at Snowflake surfaces | Low. Shell, tab machinery, SVG charts, design system transfer; brand kit + a few new tabs are the work. |

### Net-new (beyond parity — the "not held hostage" items)

| # | New capability (Snowflake side) | Why it's here | Maps to Databricks? |
|---|---------------------------------|---------------|---------------------|
| N1 | **Snowflake CoWork** embedded/linked | Explicit ask. App-level governed agent (Deep Research, User Memory, Skills, MCP actions) — the "Snowflake Intelligence everywhere" surface | Loosely = "Genie everywhere" elevated to an agent app; no clean Databricks analog |
| N2 | **Domo Chat v2 + Domo MCP Server (bidirectional MCP)** | Explicit ask. Domo-native chat routed to Snowflake Intelligence; Domo MCP Server exposes governed Domo tools/data to external agents (Claude/Gemini/CoWork) | Pattern 4's "MCP-based integration contract" (was 🔄 in progress) — here it's first-class |
| N3 | **CoCo** as the build/dev surface | Explicit ask; user's ai-toolkit analog. Data-native coding agent authors semantic views, pipelines, app scaffolding; SDK + MCP server + Async API | = Databricks ai-toolkit repo (build-time), not a runtime tab necessarily |
| N4 | **Cortex Search** (optional) over unstructured (support tickets, incident notes) | Enriches Cortex Agent answers; explains the incident story with cited docs | New; Databricks version was structured-only |

---

## 1b. Code Engine reachability (what is actually wireable)

Code Engine is a server-side Node function (outbound HTTPS, one stored secret, typed params) — exactly how `pattern4ce` calls Databricks. "CE-supported" = "has a REST or SQL API." All runtime surfaces reduce to **two Snowflake endpoints** (Cortex REST APIs + the SQL API), plus Domo's own REST APIs; the token lives only in CE.

| Capability | CE-callable? | How | Pattern 4 analog |
|---|---|---|---|
| Cortex Analyst | ✅ | REST `POST /api/v2/cortex/analyst/message` (answer + SQL + rows) | `askGenie` |
| Cortex Agents (CoWork's brain) | ✅ | Cortex Agents REST API | `askRetentionAgent` |
| Snowflake ML inference | ✅ | SQL API `POST /api/v2/statements` → `SELECT MODEL(...)!predict(...)` | `runModelInference` |
| Writeback + Horizon metadata r/w | ✅ | SQL API (`INSERT`, `ALTER`, `SHOW`/`DESC`, tags/comments) | `writeActionStatus`, `updateUcColumnContext` |
| **Hybrid Tables** CRUD (OLTP memory) | ✅ | SQL API — plain SQL, **no driver** | Lakebase CRUD |
| **Snowflake Postgres** (OLTP alt) | ⚠️ | needs a bundled `pg` driver in the CE Lambda (replays Pattern 4 Lakebase pain) | Lakebase CRUD |
| Domo AI Readiness sync | ✅ | Domo REST API | `syncDomoAiReadiness` |
| CoWork (the app) | ➖ | front-end iframe embed / deep-link; brain = Cortex Agents (CE-callable) | native Genie embed |
| Domo Chat v2 | ➖ | Domo platform surface; Domo→SF Intelligence routing is config, not a function | — |
| Domo MCP Server / Toolkits | ✅ indirect | `snowflakece` CE functions are packaged as Toolkit tools, exposed over MCP to external agents | "MCP contract" (in progress) |
| CoCo | ➖ | build-time coding agent (SDK/MCP/Async API); authors semantic views + scaffold, not a runtime dep | ai-toolkit repo |

**Implications:** (1) Every *live-at-runtime* need is CE-reachable via Cortex REST + SQL API with one stored Snowflake credential (key-pair JWT / OAuth / PAT). (2) CoWork / Chat v2 / CoCo are surfaces/build-tools, not CE functions — they connect through **embed** (CoWork), **platform config** (Chat v2), and **MCP** (CE functions become the exposed tools). (3) **OLTP leans Hybrid Tables** — pure SQL-API vs. the `pg`-driver bundling friction of Snowflake Postgres (spike X3 to confirm).

---

## 2. Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| **R0** | Deliver a Snowflake-plane **Revenue Command Center**: a governed Domo delivery+action surface over Snowflake that **predicts, explains, acts, remembers, governs** — without governance forking out of Snowflake | Core goal |
| **R1** | Keep Snowflake as the governed source of data and business meaning: semantic views, verified queries, Horizon metadata, and live Domo access must not create a competing metric layer | Must-have |
| **R2** | Provide three equally first-class, non-redundant conversational experiences: **Domo Chat v2** for Domo-native analysis, **Cortex Analyst** for transparent text-to-SQL, and **CoWork** for Snowflake-native deep research | Must-have |
| **R3** | Run a real **Cortex Agent** over structured and unstructured context, and let a Domo Workflow request its recommendation before a human-approved action and Snowflake writeback | Must-have |
| **R4** | Score renewal risk live from a governed Snowflake Model Registry model and show the exact input/output contract and model evidence | Must-have |
| **R5** | Persist scenarios and prediction feedback in Snowflake operational state and expose reviewable CRUD in the command center | Must-have |
| **R6** | Enforce and visibly demonstrate governance across every caller, without claiming parity that has not been tested | Must-have |
| **R6.1** | Snowflake row-access and masking policies scope Analyst, Agent, CoWork, managed MCP, and live-query paths under the authenticated Snowflake role | Must-have |
| **R6.2** | Domo PDP and Snowflake policies produce equivalent persona outcomes; per-user OAuth/OBO is proven or the demo labels service-identity limits | Must-have |
| **R6.3** | Cortex AI Guardrails, AI Observability, and Agent Evaluations provide visible safety and assurance; Horizon metadata can be mirrored into Domo AI Readiness | Must-have |
| **R7** | Demonstrate both governed MCP directions without conflating them: Snowflake tools exposed outward and Domo data/workflows exposed outward where Domo beta access is enabled | Must-have |
| **R8** | Showcase **CoCo live** as the Snowflake builder experience while keeping it outside the runtime and source-of-truth contract | Nice-to-have |

---

## 3. CURRENT

The Databricks Pattern 4 build is demo-grade and largely live: five Cloud Amplifier datasets, Genie API/embed, Model Serving, a Domo Workflow calling a Databricks supervisor, Task Center approval, writeback, Lakebase CRUD, and UC metadata sync. Its important limitations are equally instructive: browser-only persona filtering, no implemented PDP↔row-filter parity, no per-user OBO, a client-generated forecast series, heuristic attribution, fallback/canned experiences, and an MCP-aligned Code Engine bridge that is not MCP-native.

The Snowflake project reuses the **business scenario and proven interaction patterns only**. It does not copy the app or bridge. Snowflake parity must improve the weak points: real semantic views, Cortex Search citations, role-aware demonstrations, managed MCP, and visible AI observability/evaluation.

---

## 4. Shapes (mutually-exclusive spines)

The key architectural decision is **what is the primary conversational/agentic spine** connecting Domo and Snowflake. Everything else (data layer, ML, OLTP, governance) is shared plumbing that composes into whichever spine we pick.

### A: Endpoint-swap parity — Code Engine is the spine

| Part | Mechanism | Flag |
|------|-----------|:----:|
| A1 | Build an independent Domo app and `snowflakece` backend that reproduce the Pattern 4 endpoint contracts with Snowflake APIs | |
| A2 | Preserve the seven-act surface pattern with Cortex Analyst replacing Genie and Cortex Agent replacing MAS | |
| A3 | Use Horizon policies, Guardrails, and Observability for the governance narrative | |
| A4 | Mention CoWork, Chat v2, MCP, and CoCo only in architecture content | |

*Fastest to parity; least showcases the explicitly-requested net-new items (R4, R5, R8).*

### B: Snowflake-agent spine — Cortex Agents / CoWork own orchestration

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | A **Cortex Agent** (`CREATE AGENT`) is the brain: bundles Cortex Analyst (semantic view) + Cortex Search (unstructured) + custom tools; Domo calls it via Cortex Agents API through CE | |
| B2 | The agent-to-agent loop calls this Cortex Agent from the Domo Workflow AI tile (R3) | |
| B3 | Present **CoWork by direct agent link** as the Snowflake-native Deep Research and cited-artifact surface | |
| B4 | Cortex Analyst still available as the "show me the SQL" inspector panel (R2) | |
| B5 | Keep Domo Chat v2 secondary and expose no bidirectional MCP proof | |

*Centers Snowflake's agent stack; strong for R3/R4; under-serves R5 (Domo Chat v2 + MCP bidirectional).*

### C: MCP-native bidirectional command center — MCP is the spine

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **C1** | **Governed Snowflake layer** — semantic views + Horizon Context as source of truth; Cloud Amplifier live no-copy federation to Domo (R1) | |
| **C2** | **Cortex Analyst panel** — text-to-SQL over the semantic view; NL answer + SQL + rows + API inspector + Domo-side chart reconstruction (R2) | |
| **C3** | **Cortex Agent** — `CREATE AGENT` bundling Analyst + Cortex Search + custom tools; the reasoning brain for the action loop and for CoWork (R3, R4) | |
| **C4** | **Agent-to-agent action loop** — Domo Workflow AI tile → CE `askCortexAgent` → Cortex Agent → human approval (Task Center) → writeback to Snowflake → Action Journey timeline (R3) | |
| **C5** | **Two governed MCP directions** — Snowflake-managed MCP exposes Analyst/Search/Agent/SQL tools to external clients; Domo Essentials MCP exposes authorized Domo datasets/workflows where beta is enabled. Chat v2 is not used as an undocumented Cortex router | ⚠️ (target Domo beta entitlement and OAuth setup) |
| **C6** | **Predict + Remember** — Model Registry with native warehouse inference **[C6-A selected]**; Hybrid Tables **[C6-C selected]** for scenarios and feedback | |
| **C7** | **Govern everywhere** — Snowflake row/masking policies + Cortex Guardrails + Observability/Evaluations; Domo PDP parity and Horizon→AI Readiness mapping | ⚠️ (per-user/OBO and PDP parity require target-instance proof) |
| **C8** | **Three conversational surfaces** — Domo Chat v2 in Domo, Cortex Analyst inspector in the app, and direct-link CoWork using the same Cortex Agent | |
| **C9** | **CoCo showcase** — live builder segment edits or explains a semantic view/agent asset, with no runtime dependency | |

*Maximally showcases every explicitly-requested item (Cortex Analyst, CoWork, CoCo, Domo Chat v2 + MCP) and keeps parity via C1–C4/C6/C7. Heaviest scope; several flags to resolve via spikes.*

---

## 5. Fit Check

| Req | Requirement | Status | A | B | C |
|-----|-------------|--------|---|---|---|
| R0 | Snowflake-plane Revenue Command Center (predict/explain/act/remember/govern), no governance fork | Core goal | ✅ | ✅ | ✅ |
| R1 | Governed metric+data layer on Snowflake (Horizon + semantic views + Cloud Amplifier, no copy) | Must-have | ✅ | ✅ | ✅ |
| R2 | Conversational analytics parity via Cortex Analyst (answer + SQL + rows + inspector) | Must-have | ✅ | ✅ | ✅ |
| R3 | Cortex Agent recommendation → Domo approval → Snowflake writeback | Must-have | ❌ | ✅ | ✅ |
| R4 | Governed live renewal-risk scoring with contract inspection | Must-have | ✅ | ✅ | ✅ |
| R5 | Operational scenario and feedback state in Snowflake | Must-have | ✅ | ✅ | ✅ |
| R6 | Proven cross-surface governance, identity parity, guardrails, and observability | Must-have | ❌ | ❌ | ❌ |
| R7 | Two governed MCP directions, clearly separated | Must-have | ❌ | ❌ | ❌ |
| R8 | Live CoCo builder showcase without runtime dependency | Nice-to-have | ❌ | ❌ | ✅ |

**Notes:**
- **A** fails the net-new conversational, agentic, MCP, and CoCo requirements.
- **B** proves the Snowflake agent path but does not give Domo Chat v2, bidirectional MCP, or CoCo equal weight.
- **C** is the selected direction. It intentionally fails R6 and R7 until target-instance identity/PDP and Domo MCP beta checks produce concrete evidence. The selected direction is sound; those two implementation gates remain open.

---

## 5b. Selected shape — R × C (2026-07-15)

Shape **C** is selected (decision D4). Per the shaping method, the check below is scoped to the selected shape only; ✅ = satisfied and the *how* is known, ❌ = still flagged (an unresolved mechanism pending its spike).

| Req | Requirement | Status | C | Unsolved (flag) |
|-----|-------------|--------|---|-----------------|
| R0 | Snowflake-plane Revenue Command Center | Core goal | ✅ | — |
| R1 | Governed metric+data layer (Horizon + semantic views + Cloud Amplifier) | Must-have | ✅ | — |
| R2 | Cortex Analyst conversational parity | Must-have | ✅ | — |
| R3 | Agent-to-agent action loop (Domo ⇄ Cortex Agent, approval, writeback) | Must-have | ✅ | — |
| R4 | Snowflake CoWork first-class surface | Must-have | ❌ | C8 — embed vs deep-link path + persona scope (spike X5) |
| R5 | Domo Chat v2 + MCP bidirectional | Must-have | ❌ | C5 — Chat v2→SF Intelligence routing availability + auth (spike X1) |
| R6 | Predictive ML from Snowflake ML + live scoring | Must-have | ❌ | C6 — serving mode: native SQL vs SPCS (spike X2) |
| R7 | Governance/guardrails + PDP↔RLS parity + AI-readiness sync + OLTP memory | Must-have | ❌ | C7 — PDP↔RLS parity (spike X4); OLTP store leaning Hybrid Tables (spike X3) |
| R8 | CoCo documented as build/dev surface | Nice-to-have | ✅ | — (narrative-only, D5) |

**Unsolved summary:** R4, R5, R6, R7 remain ❌ until spikes X1–X5 resolve their flagged mechanisms. Everything else (R0–R3, R8) is known and buildable now.

---

## 6. Decision (2026-07-15) — Shape C selected

**Build Shape C**, composed as **C = C1 + C2 + C3 + C4 + C6 + C7** (parity core) **+ C5 + C8 + C9** (the explicitly-requested net-new). It is the only shape that satisfies all must-haves *and* the "not held hostage to parity" directive.

To flip the remaining ❌s (R4–R7) to ✅, stand up spikes for:

| Spike | Resolves | Question |
|-------|----------|----------|
| **X1 — MCP fabric** | C5 / R5 | Is Domo Chat v2 → Snowflake Intelligence routing available in the target instance today, or do we demo Domo MCP Server → CoWork (Domo-as-tool) as the bidirectional proof? What auth (OAuth/service account) does each direction use? |
| **X2 — ML serving mode** | C6 / R6 | Native SQL inference (`MODEL()!predict`) vs SPCS real-time — which gives believable live single-account scoring in the ML tab, and how is it governed/traced under Horizon? |
| **X3 — OLTP memory store** | C6 / R7.4 | Hybrid Tables vs Snowflake Postgres for `scenario_runs` + `prediction_feedback` — governance, CRUD ergonomics from Code Engine, and which reads best as the "Lakebase analog." |
| **X4 — Governance parity** | C7 / R7 | Domo PDP ↔ Snowflake RLS/masking parity mechanics; confirm Cortex Analyst/CoWork answers inherit the same scope automatically. |
| **X5 — CoWork surface** | C8 / R4 | Embed vs deep-link CoWork (ai.snowflake.com), and how persona scope carries into the CoWork session. |

---

## 6b. Detail C — the 9-tab surface (decision D6)

Reshaped from Pattern 4's 7 tabs. Each tab maps to shape components (§4) and the CE functions that back it (`snowflakece`, §1b). This is the pre-breadboard surface map; the next step is to breadboard each tab into affordances + wiring, then slice.

| # | Tab | Purpose | Components | Backing CE functions |
|---|-----|---------|-----------|----------------------|
| 1 | **Forecast Home** | Persona-scoped cockpit: Net/At-Risk/Protected Revenue + SLA KPIs, Actual-vs-Forecast hero, Regional Renewal Risk, Agent Action Queue + Action Journey | C1, C4, C7 | SQL API (semantic-view reads), `askCortexAgent`, `writeActionStatus` |
| 2 | **Cortex Analyst** | Ask "why" in NL → answer + generated SQL + rows; API inspector + Domo-side chart reconstruction | C2 | `askAnalyst` |
| 3 | **Cortex Agent Queue** | Recommendations with human-approval gates + animated agent⇄agent Action Journey | C3, C4 | `askCortexAgent`, `startWorkflow`, `getWorkflowResult` |
| 4 | **Approvals · Action Center** | Workflow approval queue (open/completed/voided); in-app Approve/Reject resumes workflow → writeback | C4 | `listApprovalTasks`, `completeApprovalTask`, `writeActionStatus` |
| 5 | **Snowflake ML** | Score any account live via Model Registry inference; request/response inspector (SQL/curl/Python); accept → seeds a scenario | C6 (C6-A/B) | `runModelInference` (SQL API) |
| 6 | **Snowflake Ops** | Hybrid-Tables workspace: browse/add/edit/delete `scenario_runs` + `prediction_feedback` | C6 (C6-C) | `listScenarios`/`createScenario`/`updateScenario`/`deleteScenario`, feedback CRUD |
| 7 | **Horizon AI Readiness** | Compare Horizon Context / semantic-view metadata vs Domo AI Readiness, column-by-column; sync/wipe; governed Inspect/Edit-semantics drawer | C7 | `getHorizonReadinessState`, `updateSemanticColumnContext`, `getDomoAiReadiness`, `syncDomoAiReadiness`, `wipeDomoAiReadiness` |
| 8 | **CoWork** | Embed/deep-link Snowflake CoWork (Deep Research, Skills, cited reports) scoped by Horizon; + the bidirectional MCP story (Domo MCP Server exposes CE tools) | C5, C8 | *(embed; MCP exposes existing CE fns as Toolkit tools)* |
| 9 | **How it works** | Solution + Technical architecture diagrams (clickable nodes), user guide, and the **CoCo "how it was built"** narrative | C9 | *(static/narrative)* |

**Notes:**
- Tab 2 (Cortex Analyst) and Tab 3 (Cortex Agent) are deliberately distinct: Analyst = "show me the SQL" transparency; Agent = orchestrated action loop. Tab 8 (CoWork) = the human-facing governed agent app.
- **Domo Chat v2** is not its own tab — it's the Domo-native chat surface available across the portal (config-level, routes to Snowflake Intelligence per open-question 1); its MCP counterpart (Domo MCP Server exposing `snowflakece` tools) is narrated on Tab 8.

---

## 7. Decisions & open questions

### Decided (2026-07-15)

| # | Decision | Rationale |
|---|----------|-----------|
| D1 | **Live = fully live** — Cortex Analyst, the Cortex Agent, ML scoring, and writeback all real on a Snowflake instance | User selection; all four are CE-reachable via Cortex REST + SQL API (§1b) |
| D2 | **Reuse the story** — Tessera Cloud / INC-0001 West incident + the same 6 gold objects, re-authored as **semantic views** | User selection; preserves narrative parity, focuses effort on the semantic-view + agent layer |
| D3 | **OLTP store leaning Hybrid Tables** (spike X3 to confirm) | Pure SQL-API from CE; avoids the Snowflake Postgres `pg`-driver bundling friction (§1b) |
| D4 | **Spine = Shape C** (MCP-native bidirectional) | Only shape hitting all must-haves + the explicit net-new items |
| D5 | **CoCo = narrative-only** ("How it was built"); no runtime CoCo dependency | User selection; keeps CoCo as the build/ai-toolkit story without a live dep |
| D6 | **Reshape to a 9-tab surface** (see §6b) | User selection; surfaces Cortex Analyst, Cortex Agent, CoWork, Horizon as first-class |

### Still open

1. **Snowflake auth for CE** — key-pair JWT vs OAuth client-creds vs PAT for the stored Snowflake credential (affects OBO/per-user scope story). Resolve alongside spike X4.
2. Spike outcomes X1–X5 (§6) — these flip R4–R7 from ❌ to ✅.

---

## 8. Next step

Shape C is selected and the surface is mapped (§6b). Before implementation, the natural progression is:
1. **Run spikes X1–X5** (§6) to flip R4–R7 to ✅ and lock C6's alternatives (ML serving mode, OLTP store).
2. **Breadboard Shape C** (via `/breadboarding`) — expand each of the 9 tabs into UI + non-UI affordances and wiring, producing the slices doc.
3. **Slice** into vertical, demo-able increments (V1…Vn), each ending in visible UI.

---

## 9. Notation audit trail

- Shapes A / B / C are mutually-exclusive spines (pick one).
- C1–C9 are components of Shape C (combine).
- C6-A/C6-B (ML serving) and C6-C/C6-D (OLTP store) are alternatives within C6 (pick one each) — resolved by spikes X2/X3.
- Recommended composition: **C = C1 + C2 + C3 + C4 + C6 + C7 + C5 + C8 + C9**, with C6 alternatives pending.
