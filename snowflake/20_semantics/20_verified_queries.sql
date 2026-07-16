--------------------------------------------------------------------------------
-- 20_verified_queries.sql
-- Verified SEMANTIC_VIEW() queries for Revenue Command Center
-- These demonstrate the 5 key business questions the semantic view answers.
-- Target: SNOWFLAKE_REVENUE_CC.CORE (run as SYSADMIN with REVENUE_CC_WH)
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- =============================================================================
-- Q1: Why did renewal risk increase for West Enterprise accounts this month?
-- Metrics: avg_renewal_risk_score, high_risk_account_count
-- Dimensions: region, segment, risk_month
-- =============================================================================

SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS risk.region, risk.segment, risk.risk_month
  METRICS risk.avg_renewal_risk_score, risk.high_risk_account_count
  WHERE risk.region = 'West'
    AND risk.segment = 'Enterprise'
    AND risk.risk_month = DATE_TRUNC('month', CURRENT_DATE())
);

-- =============================================================================
-- Q2: Which accounts were most affected by the reliability incident (INC-0001)?
-- Metrics: sla_breach_count, support_case_count
-- Dimensions: account_id, region, segment (filtered by incident_id)
-- =============================================================================

SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS support.account_id, support.region, support.segment
  METRICS support.sla_breach_count, support.support_case_count
  WHERE support.incident_id = 'INC-0001'
)
ORDER BY SLA_BREACH_COUNT DESC
LIMIT 20;

-- =============================================================================
-- Q3: How much revenue is at risk because of SLA breaches?
-- Metrics: revenue_at_risk_total
-- Dimensions: region, segment
-- =============================================================================

SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS rev.region, rev.segment
  METRICS rev.revenue_at_risk_total
);

-- =============================================================================
-- Q4: Which recommended actions should the West regional manager approve first?
-- Metrics: avg_renewal_risk_score, high_risk_account_count
-- Dimensions: recommended_action, region (filtered to West)
-- =============================================================================

SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS risk.recommended_action, risk.region
  METRICS risk.avg_renewal_risk_score, risk.high_risk_account_count
  WHERE risk.region = 'West'
)
ORDER BY HIGH_RISK_ACCOUNT_COUNT DESC;

-- =============================================================================
-- Q5: Did approved agent actions reduce revenue at risk after the incident?
-- Metrics: actual_revenue_protected_total
-- Dimensions: date (filtered to approved actions)
-- =============================================================================

SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS actions.date
  METRICS actions.actual_revenue_protected_total
  WHERE actions.approval_status = 'Approved'
)
ORDER BY DATE;


-- =============================================================================
-- VALIDATION QUERIES (used to confirm semantic view is operational)
-- =============================================================================

-- V1: Net revenue by region
SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS rev.region
  METRICS rev.net_revenue_total
);

-- V2: Avg renewal risk score by region + segment for current month
SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS risk.region, risk.segment, risk.risk_month
  METRICS risk.avg_renewal_risk_score
  WHERE risk.risk_month = DATE_TRUNC('month', CURRENT_DATE())
);

-- V3: Revenue at risk by recommended action for West
SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS risk.recommended_action
  METRICS risk.avg_renewal_risk_score, risk.high_risk_account_count
  WHERE risk.region = 'West'
)
ORDER BY HIGH_RISK_ACCOUNT_COUNT DESC;
