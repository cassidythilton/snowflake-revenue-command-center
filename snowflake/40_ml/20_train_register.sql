--------------------------------------------------------------------------------
-- 20_train_register.sql
-- Train and register the Renewal Risk Classification Model
-- Uses: SNOWFLAKE.ML.CLASSIFICATION (native Snowflake ML)
-- Target: SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_RISK_MODEL
--------------------------------------------------------------------------------
-- APPROACH: Snowflake-native ML Classification (not Python Model Registry).
-- Reason: Local environment has snowpark but not snowflake-ml-python/xgboost.
-- The native classifier uses gradient-boosted trees internally and provides
-- interactive single-row inference via the !PREDICT() method.
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Training view: only features + target (excludes IDs and date columns)
CREATE OR REPLACE VIEW ML_RENEWAL_RISK_TRAINING AS
SELECT
    ANNUAL_RECURRING_REVENUE,
    CASES_90D,
    SLA_BREACHES_90D,
    NEGATIVE_CASES_90D,
    AVG_USAGE_SCORE_90D,
    USAGE_DROP_DAYS_90D,
    REGION,
    SEGMENT,
    INDUSTRY,
    IS_HIGH_RISK
FROM ML_RENEWAL_RISK_FEATURES;

-- Train the classification model (idempotent: DROP + CREATE)
DROP SNOWFLAKE.ML.CLASSIFICATION IF EXISTS REVENUE_CC_RISK_MODEL;

CREATE SNOWFLAKE.ML.CLASSIFICATION REVENUE_CC_RISK_MODEL(
    INPUT_DATA => SYSTEM$REFERENCE('VIEW', 'ML_RENEWAL_RISK_TRAINING'),
    TARGET_COLNAME => 'IS_HIGH_RISK'
);

-- Verify training succeeded
CALL REVENUE_CC_RISK_MODEL!SHOW_FEATURE_IMPORTANCE();
