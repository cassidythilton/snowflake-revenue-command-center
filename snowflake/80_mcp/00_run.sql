--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrates creation of the Revenue Command Center MCP Server and grants.
-- Run as SYSADMIN with REVENUE_CC_WH.
-- Status: Available (target-instance) – guarded until feature is enabled.
--------------------------------------------------------------------------------

-- 1. Create the MCP server (currently commented out; requires private-preview flag)
!source 10_mcp_server.sql;

-- 2. Verify (uncomment when feature is live)
-- SHOW MCP SERVERS IN SCHEMA SNOWFLAKE_REVENUE_CC.CORE;
-- DESCRIBE MCP SERVER SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP;
