--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrates creation of the Revenue Command Center Agent and grants.
-- Run as SYSADMIN with REVENUE_CC_WH.
--------------------------------------------------------------------------------

-- 1. Create the agent
!source 10_agent.sql;

-- 2. Grant usage to the reader role
USE ROLE SYSADMIN;
GRANT USAGE ON AGENT SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT TO ROLE REVENUE_CC_READER;
