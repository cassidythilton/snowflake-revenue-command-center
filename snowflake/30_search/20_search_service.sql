--------------------------------------------------------------------------------
-- 20_search_service.sql
-- Creates the Cortex Search service over KNOWLEDGE_DOCS.
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

CREATE OR REPLACE CORTEX SEARCH SERVICE SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_SEARCH
  ON BODY
  ATTRIBUTES DOC_TYPE, REGION, SEGMENT, ACCOUNT_NAME, SOURCE_DATE, TITLE
  WAREHOUSE = REVENUE_CC_WH
  TARGET_LAG = '1 hour'
AS
  SELECT
      DOC_ID,
      DOC_TYPE,
      TITLE,
      REGION,
      SEGMENT,
      ACCOUNT_NAME,
      SOURCE_DATE,
      BODY
  FROM SNOWFLAKE_REVENUE_CC.CORE.KNOWLEDGE_DOCS;
