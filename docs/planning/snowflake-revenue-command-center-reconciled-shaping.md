---
shaping: true
---

# Snowflake Revenue Command Center — Reconciled Shaping

This companion document applies the 2026-07-15 Databricks scaffold audit and Snowflake/Domo product research without modifying `snowflake-revenue-command-center-shaping.md`. The original remains intact. This file records the evidence-backed recommendation for a completely separate Snowflake solution.

> Research cutoff: 2026-07-15. Recheck all preview/beta capabilities in the target instances before implementation.

## Frame decisions

| Decision | Selection |
|---|---|
| Delivery depth | Demo-grade with real Snowflake integrations and explicit capability gates |
| Relationship to Pattern 4 | Functional and narrative reference only; no fork, shared runtime, or required code reuse |
| Snowflake account | CoWork, Cortex Analyst, Cortex Agents, and managed MCP assumed enabled |
| Conversational hierarchy | Domo Chat v2, Cortex Analyst, and CoWork are equally first-class, with distinct jobs |
| CoCo | Live builder showcase; not a runtime dependency or required authoring path |
| Narrative | Preserve Predict → Explain → Act → Remember → Govern; parity is the floor |

## CURRENT: what the Databricks demo actually proves

The current Pattern 4 build is a substantial, demo-ready Domo portal with live Databricks integrations, not merely a concept. Live paths include five Cloud Amplifier datasets, Genie, model serving, the MAS supervisor call, Domo Workflow/Task Center approvals, Delta writeback, Lakebase CRUD, Unity Catalog metadata, and Unity AI Gateway endpoints.

Its reusable lessons are architectural and experiential:

- Keep cloud credentials server-side.
- Separate recommendation from approval and execution.
- Drive the Action Journey from real workflow/task signals.
- Show generated SQL, request payloads, traces, and source links.
- Keep a deterministic fallback for every stage presentation.

Its gaps must not be copied as claims:

- Persona scoping is browser-side, not governed row-level enforcement.
- Domo PDP ↔ Unity Catalog row-filter parity is shaped, not implemented.
- Per-user OBO is documented, not live.
- The forecast hero, canned Genie answers, heuristic ML fallback, and some readiness data are mocked.
- The Code Engine bridge is MCP-aligned in narrative, not an MCP implementation.

Primary evidence:

- `/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/docs/demo/pattern-4-solution-summary.md`
- `/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/pattern4-agent-portal/src/app.js`
- `/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/pattern4-agent-portal/codeengine/functions.js`
- `/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/docs/planning/pattern-4-domo-pdp-rls-shaping.md`

## FUTURE: capability and gap map

| Capability | Databricks reference | Snowflake mechanism | Maturity | Gap / decision |
|---|---|---|---|---|
| Governed semantics | UC gold views and metadata | Horizon Catalog + native Semantic Views + verified queries | GA | Author a focused revenue semantic view; source-control SQL/YAML |
| Live Domo data | Cloud Amplifier | Domo Cloud Integration/Cloud Amplifier for Snowflake | Available | Validate per-user OAuth separately from connector reachability |
| Transparent NL analytics | Genie | Cortex Analyst REST API | GA | Parse current response blocks, including `system_execute_sql` |
| Managed agent | MAS supervisor | Cortex Agent object with Analyst, Search, and custom tools | GA core | Remote MCP connectors and some tools remain preview-gated |
| Unstructured evidence | Not first-class | Cortex Search over incident notes, calls, tickets, and playbooks | GA | New scope; build citations into the explanation flow |
| Predictive ML | MLflow + Model Serving | Model Registry + native warehouse inference | GA | Default for demo; use SPCS only if measured latency requires it |
| Operational memory | Lakebase | Hybrid Tables | Available | Selected; accept limits on streams, sharing, replication, and dynamic tables |
| AI governance | Unity AI Gateway | Horizon policies + Cortex AI Guardrails + AI Observability + Agent Evaluations | GA core | No single gateway object; explain controls as a system |
| Agent action | Domo Workflow → MAS | Domo Workflow → secure backend → Cortex Agent → approval → Snowflake writeback | Feasible | Use separate read/recommend and write/execute privileges |
| Snowflake MCP outward | Databricks MCP direction | Snowflake-managed MCP server exposing Analyst/Search/Agent/SQL/tools | GA | OAuth/RBAC; tools only, 50-tool limit, no dynamic client registration |
| Snowflake MCP inward | External MCP services | Cortex Agent/CoWork MCP connectors | Public Preview | Do not make remote actions required for the golden path |
| Domo MCP outward | Unfinished Pattern 4 MCP contract | Domo Essentials MCP / Toolkits | Beta | Confirm target Domo access before claiming a live bidirectional proof |
| Domo conversation | No equivalent | Domo Chat v2 multi-dataset analysis | Beta | Do not claim direct Cortex routing or external tool execution |
| Snowflake business experience | Genie embed | CoWork using the same Cortex Agent | GA | No supported external embed; use a direct agent link |
| Builder experience | Databricks assistant/toolkit reference | Snowflake CoCo (Cortex Code) | Available | Live showcase only; not part of runtime |

## Requirements (R)

| ID | Requirement | Status |
|---|---|---|
| R0 | Deliver a completely separate Snowflake Revenue Command Center that predicts, explains, acts, remembers, and governs through a Domo delivery and action experience | Core goal |
| R1 | Keep Snowflake semantic views, metrics, policies, and governed objects authoritative; Domo consumes live data without recreating the metric layer | Must-have |
| R2 | Provide three equally first-class but distinct conversational experiences: Domo Chat v2 for Domo context, Cortex Analyst for transparent text-to-SQL, and CoWork for native deep research | Must-have |
| R3 | Use one Cortex Agent with Cortex Analyst, Cortex Search, and narrow custom tools as the shared Snowflake reasoning core | Must-have |
| R4 | Complete a real agent-to-agent action loop: Domo agent/workflow → Cortex Agent recommendation → human approval → Snowflake writeback → visible Action Journey | Must-have |
| R5 | Demonstrate both MCP directions honestly: Snowflake-managed MCP outward and Domo Essentials MCP outward, with preview/beta paths capability-gated | Must-have |
| R6 | Score renewal risk live from Snowflake Model Registry and expose request, generated SQL/API contract, response, model version, and trace evidence | Must-have |
| R7 | Preserve one entitlement outcome across Domo and Snowflake, enforce Snowflake row/masking policies under the actual caller, apply Cortex guardrails, and retain operational state in Hybrid Tables | Must-have |
| R8 | Show CoCo live as the builder experience and add Cortex Search citations plus agent observability/evaluation beyond Databricks parity | Nice-to-have |

## Shapes

### A: Endpoint-swap parity

| Part | Mechanism | Flag |
|---|---|:---:|
| A1 | Independent Domo app calls a new `snowflakece` package for Analyst, Agent, ML, metadata, and CRUD | |
| A2 | Preserve the seven-stage Pattern 4 experience with Snowflake labels and endpoints | |
| A3 | Mention CoWork, Chat v2, MCP, and CoCo only in architecture content | ⚠️ |

### B: Snowflake-agent-led experience

| Part | Mechanism | Flag |
|---|---|:---:|
| B1 | Cortex Agent is the primary user and orchestration surface, with Analyst and Search tools | |
| B2 | CoWork is the primary business experience; Domo handles dashboarding, approval, and action | |
| B3 | Domo Chat v2 and Domo MCP remain secondary | ⚠️ |

### C: Governed multi-surface command center

| Part | Mechanism | Flag |
|---|---|:---:|
| C1 | Semantic views, verified queries, Horizon policies, Model Registry, Search, and Hybrid Tables form the Snowflake intelligence core | |
| C2 | Domo command center reads Snowflake live and invokes Cortex Analyst/Agent through a secure backend | |
| C3 | Domo Chat v2, Cortex Analyst, and CoWork are separate first-class surfaces with explicit jobs | ⚠️ |
| C4 | One Cortex Agent serves the Domo action flow and CoWork, using Analyst, Search, and narrow custom tools | |
| C5 | Domo Workflow and Task Center enforce human approval before a separately privileged writeback updates Snowflake | |
| C6 | Snowflake-managed MCP exposes Snowflake tools to an external MCP client | |
| C7 | Domo Essentials MCP exposes selected Domo data/workflow tools when beta access is confirmed | ⚠️ |
| C8 | Per-user Snowflake identity is carried into Analyst/Agent reads; Domo PDP and Snowflake policies are parity-tested by persona | ⚠️ |
| C9 | CoCo is demonstrated live against a safe builder task; no runtime dependency | |

## Fit check

| Req | Requirement | Status | A | B | C |
|---|---|---|:---:|:---:|:---:|
| R0 | Deliver a separate Snowflake command center that predicts, explains, acts, remembers, and governs | Core goal | ✅ | ✅ | ✅ |
| R1 | Keep Snowflake semantics and policies authoritative while Domo consumes live data | Must-have | ✅ | ✅ | ✅ |
| R2 | Make Domo Chat v2, Cortex Analyst, and CoWork equally first-class with distinct jobs | Must-have | ❌ | ❌ | ❌ |
| R3 | Use one Analyst/Search/tool-enabled Cortex Agent as the shared reasoning core | Must-have | ❌ | ✅ | ✅ |
| R4 | Complete the governed Domo-to-Cortex action, approval, and writeback loop | Must-have | ✅ | ✅ | ✅ |
| R5 | Demonstrate both MCP directions honestly with capability gates | Must-have | ❌ | ❌ | ❌ |
| R6 | Score live from Snowflake ML with inspectable evidence | Must-have | ✅ | ✅ | ✅ |
| R7 | Enforce entitlement parity, caller-aware Snowflake policies, guardrails, and Hybrid Table memory | Must-have | ❌ | ❌ | ❌ |
| R8 | Show CoCo live plus Search citations and agent evaluation/observability | Nice-to-have | ❌ | ❌ | ✅ |

Notes:

- A fails the explicit net-new experience and repeats Pattern 4's identity ambiguity.
- B centers Snowflake well but under-serves the required Domo-native chat and MCP story.
- C is selected because it is the only shape that addresses all required surfaces and the beyond-parity mandate.
- C still fails R2 until Domo Chat v2 beta access is proven in the target Domo instance.
- C still fails R5 until Domo Essentials MCP beta access is proven in the target Domo instance.
- C still fails R7 until per-user authentication for Cortex API reads and Domo PDP ↔ Snowflake policy parity are proven with two personas.

## Selected Shape C

Shape C is selected conditionally. Its known core is buildable now:

`C = C1 + C2 + C4 + C5 + C6 + C9`

`C3`, `C7`, and `C8` are gated. They must not be represented as delivered until Chat v2 access, MCP access, and identity spikes pass. If Chat v2 is unavailable, it remains a required target-instance enablement rather than a simulated tab. If C7 fails, the golden path still demonstrates Snowflake-managed MCP outward and labels Domo Essentials MCP as beta follow-on. If C8 fails, the demo uses a clearly named service identity and does not claim persona-equivalent Snowflake enforcement.

## Detail C: experience surfaces

| # | Surface | Distinct job | Live mechanism |
|---|---|---|---|
| 1 | Forecast Home | Persona-scoped KPIs, forecast, regional risk, action queue, and Action Journey | Cloud Integration/Amplifier reads + workflow/task signals |
| 2 | Domo Chat v2 | Domo-native, multi-dataset conversation across delivery context | Domo Chat v2; no claimed Cortex tool routing |
| 3 | Cortex Analyst | Explain with generated SQL, rows, verified-query provenance, and reconstructed chart | Analyst REST API through secure backend |
| 4 | Cortex Agent Queue | Search-grounded recommendations and agent transcript/evidence | Cortex Agent API using Analyst + Search |
| 5 | Approvals · Action Center | Approve/reject; distinguish recommendation from execution | Domo Workflow + Task Center |
| 6 | Snowflake ML | Live account score, model version, request/response, SQL/Python examples | Model Registry native inference |
| 7 | Snowflake Ops | Scenario and feedback CRUD | Hybrid Tables through Snowflake SQL API |
| 8 | Horizon Governance | Semantic metadata, policies, guardrail history, traces, evaluation, readiness parity | Horizon, ACCOUNT_USAGE, AI Observability, Domo AI Readiness |
| 9 | CoWork | Native Snowflake deep research, cited artifacts, and same-agent conversation | Direct link to the configured Cortex Agent in CoWork |
| 10 | How It Works + CoCo | Architecture, maturity labels, source links, and live builder showcase | Static architecture plus controlled CoCo demo task |

## Demo golden path

1. Open Forecast Home as West Regional Manager and identify the renewal-risk incident.
2. Ask Domo Chat v2 a multi-dataset business-context question.
3. Open Cortex Analyst and show the governed semantic interpretation, generated SQL, and result rows.
4. Open CoWork through a direct link and run deeper cited research using the same Cortex Agent.
5. Score one account with Snowflake ML and save the result to a Hybrid Table scenario.
6. Trigger the Domo-to-Cortex recommendation, inspect Search citations and the agent trace, then approve it in Task Center.
7. Confirm the writeback and Protected Revenue update.
8. Show role/policy behavior, guardrail/observability evidence, and one managed MCP call.
9. Close with a short CoCo builder task and the architecture view.

## Capability gates before implementation

1. Confirm Domo Chat v2 and Domo Essentials MCP beta access in the target Domo instance.
2. Prove the Snowflake OAuth/OBO path available to Code Engine or choose and disclose a service identity.
3. Run the same Analyst/Agent question under two roles and verify row/masking-policy differences.
4. Confirm Model Registry inference latency for one-row interactive scoring.
5. Confirm direct CoWork agent URL and presenter SSO behavior.
6. Confirm managed MCP OAuth client configuration and tool inventory.

## Source register

- [Snowflake CoWork](https://docs.snowflake.com/en/user-guide/snowflake-cortex/snowflake-cowork)
- [Cortex Agents](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents)
- [Cortex Analyst](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst)
- [Semantic view practices](https://docs.snowflake.com/en/user-guide/views-semantic/best-practices-dev)
- [Cortex Search](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-search/cortex-search-overview)
- [Snowflake-managed MCP server](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp)
- [Cortex MCP connectors](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp-connectors)
- [Snowflake Model Registry](https://docs.snowflake.com/en/developer-guide/snowflake-ml/model-registry/overview)
- [Cortex AI Guardrails](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-ai-guardrails)
- [AI Observability](https://docs.snowflake.com/en/user-guide/snowflake-cortex/ai-observability)
- [Domo AI Agents and MCP announcements](https://www.domo.com/product/new-features/ai-agents-mcp-domopalooza-announcements)
- [Domo Essentials MCP](https://www.domo.com/product/new-features/domo-essentials-mcp)
