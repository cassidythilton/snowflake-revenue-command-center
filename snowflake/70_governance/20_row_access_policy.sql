--------------------------------------------------------------------------------
-- 20_row_access_policy.sql
-- Sprint 7 Governance: Row Access Policy for region-based filtering
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--
-- FAIL-OPEN design: REVENUE_CC_READER, REVENUE_CC_WRITER, SYSADMIN,
-- ACCOUNTADMIN always get full unrestricted access. Only region-scoped
-- roles are filtered via GOV_ROLE_REGION_MAP.
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

CREATE OR REPLACE ROW ACCESS POLICY RAP_REGION
  AS (region_val VARCHAR) RETURNS BOOLEAN ->
    CASE
      WHEN CURRENT_ROLE() IN ('REVENUE_CC_READER', 'REVENUE_CC_WRITER', 'SYSADMIN', 'ACCOUNTADMIN')
        THEN TRUE
      WHEN EXISTS (
        SELECT 1 FROM SNOWFLAKE_REVENUE_CC.CORE.GOV_ROLE_REGION_MAP
        WHERE ROLE_NAME = CURRENT_ROLE() AND REGION = region_val
      ) THEN TRUE
      ELSE FALSE
    END;

-- Apply to DIM_ACCOUNT.REGION (primary region dimension; gold views join through here)
ALTER TABLE DIM_ACCOUNT ADD ROW ACCESS POLICY RAP_REGION ON (REGION);
