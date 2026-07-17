# 60_agent – Revenue Command Center Agent

Creates `SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT`, the shared Cortex Agent that
powers the Revenue Command Center — and the agent that surfaces in **Snowflake
CoWork / Snowflake Intelligence** behind the app's **Cortex Workspace** tab.

## Files

| File | Purpose |
|------|---------|
| `20_agent_tools.sql` | Custom (generic) tool procedures: `SCORE_RENEWAL_RISK` (Predict) and `PROPOSE_RETENTION_ACTION` (governed Act). Run **first**. |
| `10_agent.sql` | `CREATE OR REPLACE AGENT REVENUE_CC_AGENT` with all tools. |
| `00_run.sql` | Orchestrates tools → agent → grant. |

## Tools bundled

| Tool | Type | Resource | Plane |
|------|------|----------|-------|
| Analyst | `cortex_analyst_text_to_sql` | Semantic view `REVENUE_CC_ANALYST` | Explain |
| Search | `cortex_search` | Search service `REVENUE_CC_SEARCH` | Why |
| Score_Renewal_Risk | `generic` (procedure) | `SCORE_RENEWAL_RISK(VARCHAR)` → Model Registry inference | Predict |
| Propose_Retention_Action | `generic` (procedure) | `PROPOSE_RETENTION_ACTION(...)` → stages a PROPOSED row | Act (governed) |
| data_to_chart | `data_to_chart` | — | Explain (viz) |

### Governance boundary (important)

`Propose_Retention_Action` only **stages** a recommendation into
`AGENT_ACTION_WRITEBACK` as `APPROVAL_STATUS='Proposed'` / `EXECUTION_STATUS='Pending'`
with `ACTUAL_REVENUE_PROTECTED=NULL`. The agent **cannot approve or execute** and
**cannot move protected revenue** — `GOLD_PROTECTED_REVENUE_ROLLUP` only counts
`Approved`+`Executed` rows. Human approval and revenue writeback remain on the
separately privileged `REVENUE_CC_WRITER` path (`50_state/30_writeback_ops.sql`).

## Running

```sql
-- Execute from a Snowsight worksheet or the Cortex CLI as SYSADMIN:
USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Run 20_agent_tools.sql then 10_agent.sql (or just 00_run.sql), then grant:
GRANT USAGE ON AGENT SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT TO ROLE REVENUE_CC_READER;
```

## Validation

```sql
-- Structured + unstructured + custom tools, all via the agent:
SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN(
  'SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT',
  'Score renewal risk for account ACC-00008 and explain the top drivers.'
);
```

Or via the Cortex CLI (Snowflake Intelligence mode — the same runtime CoWork uses):

```bash
cortex agents run SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT \
  "Score renewal risk for account ACC-00008 and explain the top drivers."
```

## CoWork / Snowflake Intelligence

On this account (`DOMOINC-DOMOPARTNER`) the `SNOWFLAKE INTELLIGENCE` object grammar
is not yet available, so CoWork surfaces every agent the caller can access. The
agent therefore appears in CoWork from its canonical `CORE` location once
`USAGE` is granted — no `SNOWFLAKE_INTELLIGENCE.AGENTS` copy is required. Open it at
`https://ai.snowflake.com/domoinc/domopartner/#/ai` and select **Revenue Command
Center Agent**.

See `docs/planning/cortex-workspace-agent-integration.md` for the app-side
integration contract.
