--------------------------------------------------------------------------------
-- 10_features.sql
-- ML Feature Table for Renewal Risk Classification
-- Target: SNOWFLAKE_REVENUE_CC.CORE.ML_RENEWAL_RISK_FEATURES
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

CREATE OR REPLACE TABLE ML_RENEWAL_RISK_FEATURES AS
WITH support_90d AS (
    SELECT
        sc.account_id,
        frr.risk_month,
        COUNT(*) AS cases_90d,
        SUM(CASE WHEN sc.sla_breached_flag THEN 1 ELSE 0 END) AS sla_breaches_90d,
        SUM(CASE WHEN sc.customer_sentiment = 'Negative' THEN 1 ELSE 0 END) AS negative_cases_90d
    FROM fact_support_cases sc
    JOIN fact_renewal_risk frr
        ON sc.account_id = frr.account_id
        AND sc.date BETWEEN DATEADD(day, -90, frr.risk_month) AND frr.risk_month
    GROUP BY sc.account_id, frr.risk_month
),
usage_90d AS (
    SELECT
        pu.account_id,
        frr.risk_month,
        AVG(pu.usage_score) AS avg_usage_score_90d,
        SUM(CASE WHEN pu.usage_drop_flag THEN 1 ELSE 0 END) AS usage_drop_days_90d
    FROM fact_product_usage_daily pu
    JOIN fact_renewal_risk frr
        ON pu.account_id = frr.account_id
        AND pu.date BETWEEN DATEADD(day, -90, frr.risk_month) AND frr.risk_month
    GROUP BY pu.account_id, frr.risk_month
)
SELECT
    frr.account_id,
    frr.risk_month,
    da.annual_recurring_revenue,
    COALESCE(s.cases_90d, 0) AS cases_90d,
    COALESCE(s.sla_breaches_90d, 0) AS sla_breaches_90d,
    COALESCE(s.negative_cases_90d, 0) AS negative_cases_90d,
    COALESCE(u.avg_usage_score_90d, 75.0) AS avg_usage_score_90d,
    COALESCE(u.usage_drop_days_90d, 0) AS usage_drop_days_90d,
    da.region,
    da.segment,
    da.industry,
    -- Encoded categoricals
    CASE da.region WHEN 'West' THEN 0 WHEN 'East' THEN 1 WHEN 'Central' THEN 2 ELSE 3 END AS region_encoded,
    CASE da.segment WHEN 'Enterprise' THEN 0 WHEN 'Mid-Market' THEN 1 ELSE 2 END AS segment_encoded,
    CASE da.industry
        WHEN 'Retail' THEN 0 WHEN 'Financial Services' THEN 1 WHEN 'Manufacturing' THEN 2
        WHEN 'Healthcare' THEN 3 WHEN 'Transportation' THEN 4 ELSE 5
    END AS industry_encoded,
    -- Binary target: High risk = risk_tier='High' OR predicted_churn_probability >= 0.5
    CASE WHEN frr.risk_tier = 'High' OR frr.predicted_churn_probability >= 0.5 THEN 1 ELSE 0 END AS is_high_risk
FROM fact_renewal_risk frr
JOIN dim_account da ON frr.account_id = da.account_id
LEFT JOIN support_90d s ON frr.account_id = s.account_id AND frr.risk_month = s.risk_month
LEFT JOIN usage_90d u ON frr.account_id = u.account_id AND frr.risk_month = u.risk_month;
