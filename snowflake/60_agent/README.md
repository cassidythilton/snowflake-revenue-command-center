# 60_agent – Revenue Command Center Agent

Creates `SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT`, the shared Cortex Agent that powers the Revenue Command Center.

## Tools bundled

| Tool | Type | Resource |
|------|------|----------|
| Analyst | `cortex_analyst_text_to_sql` | Semantic view `REVENUE_CC_ANALYST` |
| Search | `cortex_search` | Search service `REVENUE_CC_SEARCH` |

## Running

```sql
-- Execute from a Snowsight worksheet or SnowSQL as SYSADMIN:
USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Run 10_agent.sql then grant:
GRANT USAGE ON AGENT SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT TO ROLE REVENUE_CC_READER;
```

## Validation

```sql
SELECT SNOWFLAKE.CORTEX.DATA_AGENT_RUN(
  'SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT',
  'Why did renewal risk increase for West Enterprise accounts this month and what should we do?'
);
```
