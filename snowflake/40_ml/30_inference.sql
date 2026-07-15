--------------------------------------------------------------------------------
-- 30_inference.sql
-- Single-account inference wrapper for the Renewal Risk Model
-- Returns: predicted risk probability + label + feature values + model version
-- Callable pattern for Domo Code Engine bridge via SQL API
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

--------------------------------------------------------------------------------
-- TABLE FUNCTION: PREDICT_RENEWAL_RISK(account_id VARCHAR)
-- Given an ACCOUNT_ID, returns the latest-month prediction with all features.
--------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION PREDICT_RENEWAL_RISK(P_ACCOUNT_ID VARCHAR)
RETURNS TABLE (
    ACCOUNT_ID VARCHAR,
    REGION VARCHAR,
    SEGMENT VARCHAR,
    INDUSTRY VARCHAR,
    ANNUAL_RECURRING_REVENUE DOUBLE,
    CASES_90D NUMBER,
    SLA_BREACHES_90D NUMBER,
    NEGATIVE_CASES_90D NUMBER,
    AVG_USAGE_SCORE_90D DOUBLE,
    USAGE_DROP_DAYS_90D NUMBER,
    PREDICTED_CLASS NUMBER,
    PREDICTED_RISK_PROBABILITY DOUBLE,
    PREDICTED_LABEL VARCHAR,
    MODEL_VERSION VARCHAR
)
AS
$$
    SELECT 
        f.ACCOUNT_ID,
        f.REGION,
        f.SEGMENT,
        f.INDUSTRY,
        f.ANNUAL_RECURRING_REVENUE,
        f.CASES_90D,
        f.SLA_BREACHES_90D,
        f.NEGATIVE_CASES_90D,
        f.AVG_USAGE_SCORE_90D,
        f.USAGE_DROP_DAYS_90D,
        CAST(prediction:class AS NUMBER) AS PREDICTED_CLASS,
        CAST(prediction:probability:"1" AS DOUBLE) AS PREDICTED_RISK_PROBABILITY,
        CASE WHEN CAST(prediction:class AS NUMBER) = 1 THEN 'High Risk' ELSE 'Low Risk' END AS PREDICTED_LABEL,
        '10.0' AS MODEL_VERSION
    FROM (
        SELECT 
            f.*,
            REVENUE_CC_RISK_MODEL!PREDICT(
                INPUT_DATA => OBJECT_CONSTRUCT(
                    'ANNUAL_RECURRING_REVENUE', f.ANNUAL_RECURRING_REVENUE,
                    'CASES_90D', f.CASES_90D,
                    'SLA_BREACHES_90D', f.SLA_BREACHES_90D,
                    'NEGATIVE_CASES_90D', f.NEGATIVE_CASES_90D,
                    'AVG_USAGE_SCORE_90D', f.AVG_USAGE_SCORE_90D,
                    'USAGE_DROP_DAYS_90D', f.USAGE_DROP_DAYS_90D,
                    'REGION', f.REGION,
                    'SEGMENT', f.SEGMENT,
                    'INDUSTRY', f.INDUSTRY
                )
            ) AS prediction
        FROM ML_RENEWAL_RISK_FEATURES f
        WHERE f.ACCOUNT_ID = P_ACCOUNT_ID
        AND f.RISK_MONTH = (SELECT MAX(RISK_MONTH) FROM ML_RENEWAL_RISK_FEATURES)
    ) f
$$;

--------------------------------------------------------------------------------
-- USAGE: Single-account call pattern for the Code Engine bridge
--------------------------------------------------------------------------------
-- SELECT * FROM TABLE(PREDICT_RENEWAL_RISK('ACC-00008'));
--
-- Or inline (without the wrapper function):
--
-- SELECT 
--     f.ACCOUNT_ID,
--     f.ANNUAL_RECURRING_REVENUE,
--     f.CASES_90D,
--     f.SLA_BREACHES_90D,
--     f.NEGATIVE_CASES_90D,
--     f.AVG_USAGE_SCORE_90D,
--     f.USAGE_DROP_DAYS_90D,
--     f.REGION, f.SEGMENT, f.INDUSTRY,
--     CAST(p:class AS NUMBER) AS PREDICTED_CLASS,
--     CAST(p:probability:"1" AS DOUBLE) AS PREDICTED_RISK_PROBABILITY,
--     CASE WHEN CAST(p:class AS NUMBER) = 1 THEN 'High Risk' ELSE 'Low Risk' END AS PREDICTED_LABEL
-- FROM (
--     SELECT f.*,
--            REVENUE_CC_RISK_MODEL!PREDICT(INPUT_DATA => OBJECT_CONSTRUCT(
--                'ANNUAL_RECURRING_REVENUE', f.ANNUAL_RECURRING_REVENUE,
--                'CASES_90D', f.CASES_90D, 'SLA_BREACHES_90D', f.SLA_BREACHES_90D,
--                'NEGATIVE_CASES_90D', f.NEGATIVE_CASES_90D,
--                'AVG_USAGE_SCORE_90D', f.AVG_USAGE_SCORE_90D,
--                'USAGE_DROP_DAYS_90D', f.USAGE_DROP_DAYS_90D,
--                'REGION', f.REGION, 'SEGMENT', f.SEGMENT, 'INDUSTRY', f.INDUSTRY
--            )) AS p
--     FROM ML_RENEWAL_RISK_FEATURES f
--     WHERE f.ACCOUNT_ID = :account_id
--     AND f.RISK_MONTH = (SELECT MAX(RISK_MONTH) FROM ML_RENEWAL_RISK_FEATURES)
-- ) f;

--------------------------------------------------------------------------------
-- GRANTS
--------------------------------------------------------------------------------
USE ROLE SECURITYADMIN;

GRANT USAGE ON FUNCTION SNOWFLAKE_REVENUE_CC.CORE.PREDICT_RENEWAL_RISK(VARCHAR)
    TO ROLE REVENUE_CC_READER;

-- Ensure READER can SELECT the feature table used by the function
GRANT SELECT ON TABLE SNOWFLAKE_REVENUE_CC.CORE.ML_RENEWAL_RISK_FEATURES
    TO ROLE REVENUE_CC_READER;
