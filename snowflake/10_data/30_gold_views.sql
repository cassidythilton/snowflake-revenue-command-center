--------------------------------------------------------------------------------
-- 30_gold_views.sql
-- Snowflake-native gold/semantic views for Revenue Command Center
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

CREATE OR REPLACE VIEW gold_executive_revenue_health AS
SELECT
  date,
  fiscal_year,
  quarter,
  fiscal_period,
  tenant_id,
  region,
  segment,
  SUM(net_revenue) AS net_revenue,
  SUM(gross_margin) AS gross_margin,
  SUM(expansion_arr) AS expansion_arr,
  SUM(churned_arr) AS churned_arr,
  SUM(revenue_at_risk) AS revenue_at_risk
FROM fact_revenue_daily
GROUP BY date, fiscal_year, quarter, fiscal_period, tenant_id, region, segment;

CREATE OR REPLACE VIEW gold_customer_renewal_risk AS
WITH latest_risk AS (
  SELECT *
  FROM fact_renewal_risk
  WHERE risk_month = DATE_TRUNC('MONTH', CURRENT_DATE())
),
support_90 AS (
  SELECT
    account_id,
    COUNT(*) AS cases_90d,
    SUM(CASE WHEN sla_breached_flag THEN 1 ELSE 0 END) AS sla_breaches_90d,
    SUM(CASE WHEN customer_sentiment = 'Negative' THEN 1 ELSE 0 END) AS negative_cases_90d
  FROM fact_support_cases
  WHERE date >= DATEADD(day, -90, CURRENT_DATE())
  GROUP BY account_id
),
usage_90 AS (
  SELECT
    account_id,
    AVG(usage_score) AS avg_usage_score_90d,
    SUM(CASE WHEN usage_drop_flag THEN 1 ELSE 0 END) AS usage_drop_days_90d
  FROM fact_product_usage_daily
  WHERE date >= DATEADD(day, -90, CURRENT_DATE())
  GROUP BY account_id
)
SELECT
  a.account_id,
  a.account_name,
  a.tenant_id,
  a.region,
  a.segment,
  a.industry,
  a.account_owner_id,
  a.account_owner_name,
  a.annual_recurring_revenue,
  r.renewal_date,
  r.renewal_risk_score,
  r.risk_tier,
  r.top_risk_driver,
  r.predicted_churn_probability,
  r.revenue_at_risk,
  r.recommended_action,
  COALESCE(s.cases_90d, 0) AS cases_90d,
  COALESCE(s.sla_breaches_90d, 0) AS sla_breaches_90d,
  COALESCE(s.negative_cases_90d, 0) AS negative_cases_90d,
  COALESCE(u.avg_usage_score_90d, 0) AS avg_usage_score_90d,
  COALESCE(u.usage_drop_days_90d, 0) AS usage_drop_days_90d
FROM latest_risk r
JOIN dim_account a ON r.account_id = a.account_id
LEFT JOIN support_90 s ON r.account_id = s.account_id
LEFT JOIN usage_90 u ON r.account_id = u.account_id;

CREATE OR REPLACE VIEW gold_incident_revenue_impact AS
WITH support_rollup AS (
  SELECT
    incident_id,
    COUNT(*) AS support_case_count,
    SUM(CASE WHEN sla_breached_flag THEN 1 ELSE 0 END) AS sla_breach_count,
    SUM(CASE WHEN customer_sentiment = 'Negative' THEN 1 ELSE 0 END) AS negative_case_count,
    COUNT(DISTINCT account_id) AS affected_account_count
  FROM fact_support_cases
  WHERE incident_id IS NOT NULL
  GROUP BY incident_id
),
affected_accounts AS (
  SELECT DISTINCT incident_id, account_id
  FROM fact_support_cases
  WHERE incident_id IS NOT NULL
),
risk_rollup AS (
  SELECT
    a.incident_id,
    SUM(r.revenue_at_risk) AS renewal_revenue_at_risk
  FROM affected_accounts a
  JOIN fact_renewal_risk r
    ON a.account_id = r.account_id
    AND r.risk_month = DATE_TRUNC('MONTH', CURRENT_DATE())
  GROUP BY a.incident_id
)
SELECT
  i.incident_id,
  i.incident_date,
  i.product_id,
  i.region,
  i.severity,
  i.incident_category,
  i.root_cause,
  i.customer_impact_level,
  i.estimated_revenue_impact,
  COALESCE(s.affected_account_count, 0) AS affected_account_count,
  COALESCE(s.support_case_count, 0) AS support_case_count,
  COALESCE(s.sla_breach_count, 0) AS sla_breach_count,
  COALESCE(s.negative_case_count, 0) AS negative_case_count,
  COALESCE(r.renewal_revenue_at_risk, 0) AS renewal_revenue_at_risk
FROM fact_incidents i
LEFT JOIN support_rollup s ON i.incident_id = s.incident_id
LEFT JOIN risk_rollup r ON i.incident_id = r.incident_id;

CREATE OR REPLACE VIEW gold_agent_action_queue AS
SELECT
  action_id,
  created_ts,
  date,
  tenant_id,
  account_id,
  region,
  segment,
  account_owner_id,
  source_agent,
  source_question,
  recommendation,
  approval_status,
  execution_status,
  workflow_name,
  approved_by,
  completed_ts,
  expected_revenue_protected,
  actual_revenue_protected,
  CASE WHEN completed_ts IS NOT NULL THEN DATEDIFF(day, CAST(created_ts AS DATE), CAST(completed_ts AS DATE)) ELSE NULL END AS workflow_cycle_days
FROM fact_agent_actions;

CREATE OR REPLACE VIEW gold_portal_user_scope AS
SELECT
  user_key,
  display_name,
  persona,
  tenant_id,
  region,
  account_owner_id,
  access_level
FROM dim_user_entitlement;
