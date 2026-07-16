--------------------------------------------------------------------------------
-- 10_mcp_server.sql
-- Creates a Snowflake-managed MCP Server exposing Revenue Command Center tools.
-- Status: Available (target-instance) – DDL based on announced capability;
--         CREATE MCP SERVER is not yet publicly documented or GA.
-- Role: SYSADMIN | Warehouse: REVENUE_CC_WH
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

/*
  NOTE: As of July 2026 the CREATE MCP SERVER DDL is in private preview and
  not available on all accounts/editions. The syntax below reflects Snowflake's
  announced design (Summit 2025 / roadmap) and will need validation once the
  feature reaches public preview or GA on this account.

  Guard: uncomment or run manually when the account has the feature enabled.
*/

-- CREATE OR REPLACE MCP SERVER REVENUE_CC_MCP
--   COMMENT = 'Revenue Command Center MCP fabric – exposes Analyst, Search, Agent, and scoped SQL tools to external MCP clients.'
--   WAREHOUSE = REVENUE_CC_WH
--   AUTHENTICATION = (TYPE = 'PROGRAMMATIC_ACCESS_TOKEN')
--   TOOLS = (
--     -- 1. Cortex Analyst (text-to-SQL over semantic view)
--     TOOL(
--       NAME = 'revenue_analyst',
--       TYPE = 'CORTEX_ANALYST_TEXT_TO_SQL',
--       SEMANTIC_VIEW = 'SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST',
--       DESCRIPTION = 'Converts natural-language revenue/risk questions into SQL against the Revenue Command Center data model.'
--     ),
--     -- 2. Cortex Search (unstructured document retrieval)
--     TOOL(
--       NAME = 'revenue_search',
--       TYPE = 'CORTEX_SEARCH',
--       SEARCH_SERVICE = 'SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_SEARCH',
--       MAX_RESULTS = 5,
--       DESCRIPTION = 'Searches unstructured revenue documents – incident postmortems, support notes, QBR summaries, renewal playbooks.'
--     ),
--     -- 3. Cortex Agent (full agentic orchestration)
--     TOOL(
--       NAME = 'revenue_agent',
--       TYPE = 'CORTEX_AGENT',
--       AGENT = 'SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT',
--       DESCRIPTION = 'Full reasoning agent combining Analyst + Search for multi-step revenue-retention analysis.'
--     ),
--     -- 4. Scoped SQL (read-only over gold views)
--     TOOL(
--       NAME = 'revenue_sql',
--       TYPE = 'SQL',
--       ALLOWED_OBJECTS = (
--         'SNOWFLAKE_REVENUE_CC.CORE.DIM_ACCOUNT',
--         'SNOWFLAKE_REVENUE_CC.CORE.FACT_MONTHLY_REVENUE',
--         'SNOWFLAKE_REVENUE_CC.CORE.FACT_RENEWAL_RISK',
--         'SNOWFLAKE_REVENUE_CC.CORE.FACT_USAGE_DAILY',
--         'SNOWFLAKE_REVENUE_CC.CORE.FACT_SUPPORT_CASES',
--         'SNOWFLAKE_REVENUE_CC.CORE.FACT_FORECAST'
--       ),
--       READ_ONLY = TRUE,
--       DESCRIPTION = 'Executes read-only SQL against the Revenue Command Center gold-layer views. Scoped to core facts/dims only.'
--     )
--   );

-- Grant usage to the reader role for external client access
-- GRANT USAGE ON MCP SERVER SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP TO ROLE REVENUE_CC_READER;

-- Verification (once created):
-- SHOW MCP SERVERS IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE;
-- DESCRIBE MCP SERVER SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP;
