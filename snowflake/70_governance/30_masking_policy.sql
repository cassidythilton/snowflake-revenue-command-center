--------------------------------------------------------------------------------
-- 30_masking_policy.sql
-- Sprint 7 Governance: Column masking policy on ARR for region-scoped roles
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--
-- FAIL-OPEN design: privileged roles see real values. Region-scoped roles
-- see NULL to demonstrate column-level masking for lower-privilege personas.
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

CREATE OR REPLACE MASKING POLICY MASK_ARR AS (val FLOAT) RETURNS FLOAT ->
  CASE
    WHEN CURRENT_ROLE() IN ('REVENUE_CC_READER', 'REVENUE_CC_WRITER', 'SYSADMIN', 'ACCOUNTADMIN')
      THEN val
    ELSE NULL
  END;

-- Apply to DIM_ACCOUNT.ANNUAL_RECURRING_REVENUE (FLOAT/DOUBLE column)
ALTER TABLE DIM_ACCOUNT MODIFY COLUMN ANNUAL_RECURRING_REVENUE SET MASKING POLICY MASK_ARR;
