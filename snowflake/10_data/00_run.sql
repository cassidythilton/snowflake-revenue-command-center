--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrator: sets context and runs dimension, fact, and view scripts in order.
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE DATABASE SNOWFLAKE_REVENUE_CC;
USE SCHEMA CORE;

-- 1. Dimensions (must run first; facts reference dim_account)
!source '10_dimensions.sql';

-- 2. Fact tables (depend on dim_account, fact_renewal_risk needed before fact_agent_actions)
!source '20_facts.sql';

-- 3. Gold views (depend on all tables above)
!source '30_gold_views.sql';
