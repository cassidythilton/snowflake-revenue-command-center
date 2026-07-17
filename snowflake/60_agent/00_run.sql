--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrates creation of the Revenue Command Center Agent, its custom tools,
-- and grants. Run as SYSADMIN with REVENUE_CC_WH.
--------------------------------------------------------------------------------

-- 1. Create the custom (generic) tools: live ML scoring + governed action proposal
!source 20_agent_tools.sql;

-- 2. Create/replace the agent (Analyst + Search + the two custom tools + charts)
!source 10_agent.sql;

-- 3. Grant usage on the agent to the reader role (business users open it in CoWork)
USE ROLE SYSADMIN;
GRANT USAGE ON AGENT SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT TO ROLE REVENUE_CC_READER;
