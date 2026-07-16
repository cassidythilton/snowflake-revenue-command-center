--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrator: creates knowledge docs, search service, and grants.
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE DATABASE SNOWFLAKE_REVENUE_CC;
USE SCHEMA CORE;

-- 1. Knowledge documents table + data
!source '10_knowledge_docs.sql';

-- 2. Cortex Search service
!source '20_search_service.sql';

-- 3. Grants to REVENUE_CC_READER
USE ROLE SECURITYADMIN;
GRANT SELECT ON TABLE SNOWFLAKE_REVENUE_CC.CORE.KNOWLEDGE_DOCS TO ROLE REVENUE_CC_READER;
GRANT USAGE ON CORTEX SEARCH SERVICE SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_SEARCH TO ROLE REVENUE_CC_READER;
