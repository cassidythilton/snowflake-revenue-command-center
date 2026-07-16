# Sprint 0 — Capability Gate Report

Go/no-go for the six capability gates in `snowflake-revenue-command-center-reconciled-shaping.md` (§Capability gates before implementation). Per the Cortex-CLI-first mandate, every Snowflake gate was researched by **asking the `cortex` CLI** (`cortex search docs …`) and, for the compute probe, by running live SQL through the `cortex` agent (`cortex -c default --bypass -p …`). Gate 1 is Domo-side and cannot be answered by `cortex`; it is flagged for a target-instance check.

- **Date:** 2026-07-15
- **Account role observed:** `SYSADMIN` (user `Cassidy.Hilton@domo.com`), inherits 36 roles
- **Method:** `cortex search docs` for Snowflake DD; `cortex … -p` live SQL for the compute probe

## Summary

| Gate | Subject | Status | Blocks |
|:--:|---|:--:|---|
| G1 | Domo Chat v2 + Domo Essentials MCP beta access | ⛔ **DEFER — Domo-side** | C3 (Chat v2 tab), part of C7 (Domo MCP outward) |
| G2 | Snowflake OAuth/OBO for Code Engine, or disclosed service identity | ✅ **PASS** | — |
| G3 | Same Analyst/Agent question under two roles → row/masking differences | 🟡 **PASS (mechanism); runtime verify deferred to S7** | C8 (persona parity) |
| G4 | Model Registry latency for one-row interactive scoring | 🟡 **PASS (capability); latency measured in S5** | — |
| G5 | Direct CoWork agent URL + presenter SSO | ✅ **PASS** | C surface 8 |
| G6 | Managed MCP OAuth client config + tool inventory | ✅ **PASS** | C7 (Snowflake MCP outward) |

**Net:** 3 clean PASS, 2 PASS-with-runtime-check, 1 Domo-side DEFER. No Snowflake-side blockers to starting Sprint 1. Only Gate 1 requires an external (Domo instance) confirmation.

---

## G1 — Domo Chat v2 + Domo Essentials MCP beta access ⛔ DEFER (Domo-side)

**Question:** Is Domo Chat v2 (with Snowflake routing) and Domo Essentials MCP beta enabled in the target Domo instance?

**Finding:** `cortex` cannot answer this — it is a Domo-instance entitlement, not a Snowflake capability. Left as an explicit target-instance enablement per reconciled-shaping §142 (if Chat v2 is unavailable it stays a required enablement, **not** a simulated tab).

**Action required (owner: you):** Confirm in the target Domo instance that (a) Chat v2 is enabled and (b) Domo Essentials MCP beta is granted. Until confirmed, **C3 stays gated** and the Domo-MCP-outward half of C7 is labeled beta follow-on.

## G2 — Snowflake auth for Code Engine ✅ PASS

**Question:** Is an OAuth/OBO path available to Code Engine, or do we disclose a service identity?

**Evidence (`cortex search docs`):**
- `CREATE/ALTER SECURITY INTEGRATION (External API Authentication)` — OAuth2 client-credentials, authorization-code, and JWT-bearer grants. <https://docs.snowflake.com/en/sql-reference/sql/create-security-integration-oauth-external>
- External OAuth via Entra ID / Okta / PingFederate / custom authorization servers for programmatic access. <https://docs.snowflake.com/en/user-guide/oauth-azure>
- Cortex REST API for programmatic Analyst/Agent access. <https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-rest-api>

**Decision:** Code Engine bridge uses a **key-pair-JWT service identity** mapped to the two least-privilege roles (see DDL below) — READER for reads, WRITER only for the approved writeback. Per-user OBO via External OAuth (Entra/Okta) is a documented follow-on if true per-viewer enforcement is required (feeds C8). Service identity is disclosed honestly in the app, matching reconciled-shaping §142.

## G3 — Two-role policy differences 🟡 PASS (mechanism); runtime verify in S7

**Question:** Does the same Analyst/Agent question return different rows under two roles via row-access/masking policies?

**Evidence (`cortex search docs`):**
- Column-level Security + row-access policies enforce at the query engine using context functions `CURRENT_ROLE`, `INVOKER_ROLE`, and `IS_ROLE_IN_SESSION` for role-hierarchy-aware masking. <https://docs.snowflake.com/en/user-guide/security-column-advanced>

**Decision:** Mechanism is confirmed — enforcement keys off the **caller role** carried into the query, so persona differences require either per-user OBO (G2 follow-on) or switching the CE service role per persona. Actual two-role diff must be **verified at runtime once the semantic view + policies exist** (Sprint 7). Until then C8 remains gated; if it fails, the demo uses a clearly named service identity and does not claim persona-equivalent Snowflake enforcement (§142).

## G4 — ML inference latency 🟡 PASS (capability); latency measured in S5

**Question:** Is Model Registry inference fast enough for one-row interactive scoring?

**Evidence (`cortex search docs`):**
- **Native warehouse inference** (SQL `MODEL(...)` predict) — default, serverless-scaled.
- **Real-time inference REST API on SPCS** — dedicated low-latency HTTP endpoint, autoscaling, GA since `snowflake-ml-python` 1.25. <https://docs.snowflake.com/en/developer-guide/snowflake-ml/inference/real-time-inference-rest-api>

**Decision:** Default to **native warehouse inference** for the demo (reconciled-shaping capability table). Measure single-row interactive latency in Sprint 5; **only** deploy the SPCS real-time endpoint if measured latency is too slow for the interactive scoring UX.

## G5 — CoWork direct URL + presenter SSO ✅ PASS

**Question:** Can we deep-link a CoWork agent and will the presenter's SSO carry access?

**Evidence (`cortex search docs`):**
- CoWork interface is configured in Snowsight (**AI & ML » Agents » Open settings**): display name, welcome message, theme, logos. Users need **USAGE on database, schema, and the Agent** to interact. <https://docs.snowflake.com/en/user-guide/snowflake-cortex/snowflake-cowork/deploy-agents>

**Decision:** Surface CoWork as a **direct link into Snowsight/CoWork** (no external iframe embed). Presenter accesses via SSO with USAGE on the agent. Exact shareable URL form to be confirmed in-instance when the agent is built (Sprint 4/6).

## G6 — Managed MCP OAuth + tool inventory ✅ PASS

**Question:** Can the Snowflake-managed MCP server be configured with OAuth and a known tool inventory?

**Evidence (`cortex search docs`):**
- Snowflake-managed MCP server is **GA** (MCP revision 2025-11-25; not in government regions). Serves Cortex Analyst, Cortex Search, Cortex Agents, custom tools, and SQL executions as tools; built-in Snowflake OAuth; access/privacy controls enforced. <https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp>
- Known constraints (reconciled-shaping): **50-tool limit, OAuth/RBAC, no dynamic client registration.**

**Decision:** Snowflake-MCP-outward half of C7 is a **go**. Configure an MCP server exposing the Cortex Agent + Analyst + Search as tools in Sprint 8.

---

## Compute recommendation (live via `cortex` agent)

`SHOW WAREHOUSES` + `SHOW GRANTS TO USER` (run through the `cortex` agent): 57 warehouses exist (54 X-Small, 1 Small `NATIVE_APP_WH`, 1 Large). Current role `SYSADMIN`.

**Decision:** Rather than reuse a shared warehouse (`DEV_WH`), the demo provisions a **dedicated X-Small `REVENUE_CC_WH`** (auto-suspend 60s) for clean isolation and teardown — see `snowflake/00_setup/00_setup.sql`.

## Deliverable — setup DDL (authored via `cortex --mode code`)

`snowflake/00_setup/00_setup.sql` + `README.md` (files only, not executed):
- Warehouse `REVENUE_CC_WH` (X-Small, STANDARD, auto-suspend 60s, initially suspended)
- Database `SNOWFLAKE_REVENUE_CC` + schema `CORE`
- Two least-privilege roles for the Code Engine bridge: **`REVENUE_CC_READER`** (USAGE + SELECT current/future in CORE) and **`REVENUE_CC_WRITER`** (READER + INSERT/UPDATE/DELETE for the approved writeback path)
- Role rollup to `SYSADMIN`; section comments flag `SYSADMIN` vs `SECURITYADMIN`/`USERADMIN` executing roles

Apply requires a user able to assume both `SYSADMIN` and `SECURITYADMIN` (typically `ACCOUNTADMIN`). **Not yet applied** — apply is a separate, reviewed step.

---

## Go / no-go for gated surfaces

| Gated part | Depends on | Status |
|---|---|---|
| **C3** — Domo Chat v2 → Snowflake Intelligence routing | G1 | ⛔ Hold until Domo-instance confirms Chat v2 + Essentials MCP |
| **C7** — MCP both directions | G6 (Snowflake out ✅) + G1 (Domo out ⛔) | 🟡 Half-go: Snowflake MCP outward proceeds; Domo MCP outward labeled beta follow-on |
| **C8** — persona-equivalent Snowflake enforcement | G2 (OBO) + G3 (runtime) | 🟡 Gated: proceed with disclosed service identity; upgrade to per-user OBO if G2 follow-on + G3 runtime pass |

**Cleared to start Sprint 1** (data + semantic views): no Snowflake-side blockers. Only external dependency is the Gate 1 Domo-instance confirmation, which does not block S1.
