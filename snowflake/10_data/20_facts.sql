--------------------------------------------------------------------------------
-- 20_facts.sql
-- Snowflake-native fact tables for Revenue Command Center
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

-- =============================================================================
-- fact_incidents (120 rows: 1 major + 119 background)
-- =============================================================================
CREATE OR REPLACE TABLE fact_incidents AS
SELECT
  'INC-0001' AS incident_id,
  CAST(DATEADD(day, -45, CURRENT_DATE()) AS TIMESTAMP) AS incident_start_ts,
  CAST(DATEADD(day, -42, CURRENT_DATE()) AS TIMESTAMP) AS incident_end_ts,
  DATEADD(day, -45, CURRENT_DATE()) AS incident_date,
  'PROD-001' AS product_id,
  'West' AS region,
  'SEV-1' AS severity,
  'Reliability' AS incident_category,
  'Workflow queue saturation after regional failover' AS root_cause,
  'High' AS customer_impact_level,
  CAST(2400000 AS DOUBLE) AS estimated_revenue_impact,
  'Resolved' AS status
UNION ALL
SELECT
  'INC-' || LPAD(CAST(incident_idx + 2 AS VARCHAR), 4, '0') AS incident_id,
  CAST(DATEADD(day, -(5 + MOD(ABS(HASH(incident_idx, 'start')), 700)), CURRENT_DATE()) AS TIMESTAMP) AS incident_start_ts,
  CAST(DATEADD(day, -(4 + MOD(ABS(HASH(incident_idx, 'start')), 700)), CURRENT_DATE()) AS TIMESTAMP) AS incident_end_ts,
  DATEADD(day, -(5 + MOD(ABS(HASH(incident_idx, 'start')), 700)), CURRENT_DATE()) AS incident_date,
  'PROD-' || LPAD(CAST(MOD(ABS(HASH(incident_idx, 'product')), 10) + 1 AS VARCHAR), 3, '0') AS product_id,
  GET(ARRAY_CONSTRUCT('West', 'East', 'Central', 'South'), MOD(ABS(HASH(incident_idx, 'region')), 4))::VARCHAR AS region,
  GET(ARRAY_CONSTRUCT('SEV-2', 'SEV-3', 'SEV-4'), MOD(ABS(HASH(incident_idx, 'sev')), 3))::VARCHAR AS severity,
  GET(ARRAY_CONSTRUCT('Reliability', 'Latency', 'Data Freshness', 'Authentication'), MOD(ABS(HASH(incident_idx, 'cat')), 4))::VARCHAR AS incident_category,
  GET(ARRAY_CONSTRUCT('Deployment regression', 'Upstream API degradation', 'Warehouse capacity pressure', 'Connector retry backlog'), MOD(ABS(HASH(incident_idx, 'root')), 4))::VARCHAR AS root_cause,
  GET(ARRAY_CONSTRUCT('Low', 'Medium', 'Medium', 'High'), MOD(ABS(HASH(incident_idx, 'impact')), 4))::VARCHAR AS customer_impact_level,
  CAST(10000 + MOD(ABS(HASH(incident_idx, 'rev')), 220000) AS DOUBLE) AS estimated_revenue_impact,
  'Resolved' AS status
FROM (
  SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS incident_idx
  FROM TABLE(GENERATOR(ROWCOUNT => 119))
);

-- =============================================================================
-- fact_revenue_daily (~2.92M rows: 4000 accounts x 730 days)
-- =============================================================================
CREATE OR REPLACE TABLE fact_revenue_daily AS
WITH dates AS (
  SELECT DATEADD(day, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, DATEADD(day, -729, CURRENT_DATE())) AS date
  FROM TABLE(GENERATOR(ROWCOUNT => 730))
),
base AS (
  SELECT
    d.date,
    YEAR(d.date) AS fiscal_year,
    'Q' || QUARTER(d.date) AS quarter,
    TO_VARCHAR(d.date, 'YYYY-MM') AS fiscal_period,
    a.tenant_id,
    a.account_id,
    a.region,
    a.segment,
    a.account_owner_id,
    a.annual_recurring_revenue,
    CASE
      WHEN a.region = 'West'
        AND a.segment = 'Enterprise'
        AND d.date BETWEEN DATEADD(day, -45, CURRENT_DATE()) AND DATEADD(day, 40, DATEADD(day, -45, CURRENT_DATE()))
      THEN 1 ELSE 0
    END AS incident_window,
    CASE
      WHEN MONTH(d.date) IN (3, 6, 9, 12) THEN 1.18
      WHEN MONTH(d.date) IN (1, 7) THEN 0.92
      ELSE 1.0
    END AS seasonality
  FROM dates d
  CROSS JOIN dim_account a
)
SELECT
  date,
  fiscal_year,
  quarter,
  fiscal_period,
  tenant_id,
  account_id,
  region,
  segment,
  account_owner_id,
  CAST(annual_recurring_revenue / 365.0 AS DOUBLE) AS daily_arr,
  CAST((annual_recurring_revenue / 365.0) * seasonality * (0.16 + (MOD(ABS(HASH(account_id, date, 'bookings')), 100) / 650.0)) AS DOUBLE) AS bookings_amount,
  CAST(CASE WHEN MOD(ABS(HASH(account_id, date, 'expansion')), 100) < 8 THEN annual_recurring_revenue * 0.004 ELSE 0 END AS DOUBLE) AS expansion_arr,
  CAST(CASE WHEN incident_window = 1 THEN annual_recurring_revenue * 0.0016 WHEN MOD(ABS(HASH(account_id, date, 'contraction')), 100) < 3 THEN annual_recurring_revenue * 0.001 ELSE 0 END AS DOUBLE) AS contraction_arr,
  CAST(CASE WHEN incident_window = 1 AND MOD(ABS(HASH(account_id, date, 'churn')), 100) < 2 THEN annual_recurring_revenue * 0.003 ELSE 0 END AS DOUBLE) AS churned_arr,
  CAST((annual_recurring_revenue / 365.0) * seasonality AS DOUBLE) AS net_revenue,
  CAST((annual_recurring_revenue / 365.0) * seasonality * (0.58 + MOD(ABS(HASH(account_id, 'margin')), 18) / 100.0) AS DOUBLE) AS gross_margin,
  CAST(
    CASE
      WHEN incident_window = 1 THEN annual_recurring_revenue * (0.10 + MOD(ABS(HASH(account_id, 'risk')), 18) / 100.0)
      WHEN region = 'West' AND segment = 'Enterprise' AND date > DATEADD(day, 40, DATEADD(day, -45, CURRENT_DATE())) THEN annual_recurring_revenue * 0.035
      ELSE annual_recurring_revenue * (MOD(ABS(HASH(account_id, date, 'baseline-risk')), 5) / 1000.0)
    END AS DOUBLE
  ) AS revenue_at_risk
FROM base;

-- =============================================================================
-- fact_product_usage_daily (~1.46M rows: 4000 accounts x 730 days, 50% sampled)
-- =============================================================================
CREATE OR REPLACE TABLE fact_product_usage_daily AS
WITH dates AS (
  SELECT DATEADD(day, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, DATEADD(day, -729, CURRENT_DATE())) AS date
  FROM TABLE(GENERATOR(ROWCOUNT => 730))
),
base AS (
  SELECT
    d.date,
    YEAR(d.date) AS fiscal_year,
    'Q' || QUARTER(d.date) AS quarter,
    a.tenant_id,
    a.account_id,
    CASE WHEN a.region = 'West' AND a.segment = 'Enterprise' THEN 'PROD-001'
      ELSE 'PROD-' || LPAD(CAST(MOD(ABS(HASH(a.account_id, 'product')), 10) + 1 AS VARCHAR), 3, '0')
    END AS product_id,
    a.region,
    a.segment,
    a.annual_recurring_revenue,
    CASE
      WHEN a.region = 'West'
        AND a.segment = 'Enterprise'
        AND d.date BETWEEN DATEADD(day, -45, CURRENT_DATE()) AND DATEADD(day, 35, DATEADD(day, -45, CURRENT_DATE()))
      THEN 1 ELSE 0
    END AS incident_window
  FROM dates d
  CROSS JOIN dim_account a
  WHERE MOD(ABS(HASH(d.date, a.account_id, 'usage-sample')), 2) = 0
)
SELECT
  date,
  fiscal_year,
  quarter,
  tenant_id,
  account_id,
  product_id,
  region,
  segment,
  CAST(GREATEST(1, (annual_recurring_revenue / 18000) * CASE WHEN incident_window = 1 THEN 0.42 ELSE 1.0 END + MOD(ABS(HASH(account_id, date, 'users')), 60)) AS INT) AS active_users,
  CAST(GREATEST(1, (annual_recurring_revenue / 6000) * CASE WHEN incident_window = 1 THEN 0.48 ELSE 1.0 END + MOD(ABS(HASH(account_id, date, 'sessions')), 220)) AS INT) AS sessions,
  CAST(GREATEST(0, (annual_recurring_revenue / 9000) * CASE WHEN incident_window = 1 THEN 0.38 ELSE 1.0 END + MOD(ABS(HASH(account_id, date, 'runs')), 140)) AS INT) AS workflow_runs,
  CAST(CASE WHEN incident_window = 1 THEN 38 + MOD(ABS(HASH(account_id, date, 'score')), 18) ELSE 70 + MOD(ABS(HASH(account_id, date, 'score')), 28) END AS DOUBLE) AS usage_score,
  CASE WHEN incident_window = 1 THEN TRUE ELSE FALSE END AS usage_drop_flag
FROM base;

-- =============================================================================
-- fact_support_cases (150,000 rows: 30k incident-linked + 120k background)
-- =============================================================================
CREATE OR REPLACE TABLE fact_support_cases AS
WITH west_accounts AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY account_id) AS rn,
    COUNT(*) OVER () AS total_rows,
    account_id,
    tenant_id,
    region,
    segment,
    account_owner_id
  FROM dim_account
  WHERE region = 'West' AND segment = 'Enterprise'
),
all_accounts AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY account_id) AS rn,
    COUNT(*) OVER () AS total_rows,
    account_id,
    tenant_id,
    region,
    segment,
    account_owner_id
  FROM dim_account
),
seed AS (
  SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS case_idx
  FROM TABLE(GENERATOR(ROWCOUNT => 150000))
),
assigned AS (
  SELECT
    s.case_idx,
    CASE WHEN s.case_idx < 30000 THEN DATEADD(day, MOD(s.case_idx, 18), DATEADD(day, -45, CURRENT_DATE()))
      ELSE DATEADD(day, -MOD(ABS(HASH(s.case_idx, 'case-date')), 730), CURRENT_DATE())
    END AS date,
    COALESCE(w.account_id, a.account_id) AS account_id,
    COALESCE(w.tenant_id, a.tenant_id) AS tenant_id,
    COALESCE(w.region, a.region) AS region,
    COALESCE(w.segment, a.segment) AS segment,
    COALESCE(w.account_owner_id, a.account_owner_id) AS account_owner_id,
    CASE WHEN s.case_idx < 30000 THEN TRUE ELSE FALSE END AS incident_case
  FROM seed s
  LEFT JOIN west_accounts w
    ON s.case_idx < 30000 AND w.rn = MOD(s.case_idx, w.total_rows) + 1
  LEFT JOIN all_accounts a
    ON s.case_idx >= 30000 AND a.rn = MOD(s.case_idx, a.total_rows) + 1
)
SELECT
  'CASE-' || LPAD(CAST(case_idx AS VARCHAR), 7, '0') AS case_id,
  CAST(date AS TIMESTAMP) AS created_ts,
  CAST(DATEADD(day, CASE WHEN incident_case THEN 2 + MOD(ABS(HASH(case_idx, 'resolve')), 8) ELSE MOD(ABS(HASH(case_idx, 'resolve')), 4) END, date) AS TIMESTAMP) AS resolved_ts,
  date,
  tenant_id,
  account_id,
  CASE WHEN incident_case THEN 'PROD-001' ELSE 'PROD-' || LPAD(CAST(MOD(ABS(HASH(case_idx, 'product')), 10) + 1 AS VARCHAR), 3, '0') END AS product_id,
  region,
  segment,
  CASE
    WHEN incident_case AND MOD(ABS(HASH(case_idx, 'priority')), 100) < 55 THEN 'P1'
    WHEN incident_case THEN 'P2'
    WHEN MOD(ABS(HASH(case_idx, 'priority')), 100) < 8 THEN 'P1'
    WHEN MOD(ABS(HASH(case_idx, 'priority')), 100) < 28 THEN 'P2'
    ELSE 'P3'
  END AS priority,
  CASE WHEN incident_case THEN 'Workflow Reliability'
    ELSE GET(ARRAY_CONSTRUCT('How To', 'Data Freshness', 'Authentication', 'Performance', 'Integration'), MOD(ABS(HASH(case_idx, 'cat')), 5))::VARCHAR
  END AS case_category,
  CASE WHEN incident_case THEN 8 ELSE 24 END AS sla_target_hours,
  CAST(CASE WHEN incident_case THEN 18 + MOD(ABS(HASH(case_idx, 'hours')), 72) ELSE 2 + MOD(ABS(HASH(case_idx, 'hours')), 30) END AS DOUBLE) AS resolution_hours,
  CASE WHEN incident_case THEN TRUE ELSE MOD(ABS(HASH(case_idx, 'breach')), 100) < 9 END AS sla_breached_flag,
  CASE WHEN incident_case THEN GET(ARRAY_CONSTRUCT('Negative', 'Negative', 'Neutral'), MOD(ABS(HASH(case_idx, 'sentiment')), 3))::VARCHAR
    ELSE GET(ARRAY_CONSTRUCT('Positive', 'Neutral', 'Neutral', 'Negative'), MOD(ABS(HASH(case_idx, 'sentiment')), 4))::VARCHAR
  END AS customer_sentiment,
  CASE WHEN incident_case THEN 'INC-0001' ELSE NULL END AS incident_id
FROM assigned;

-- =============================================================================
-- fact_renewal_risk (96,000 rows: 4000 accounts x 24 months)
-- =============================================================================
CREATE OR REPLACE TABLE fact_renewal_risk AS
WITH months AS (
  SELECT DATEADD(month, ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1, DATEADD(month, -23, DATE_TRUNC('MONTH', CURRENT_DATE()))) AS risk_month
  FROM TABLE(GENERATOR(ROWCOUNT => 24))
),
base AS (
  SELECT
    m.risk_month,
    YEAR(m.risk_month) AS fiscal_year,
    'Q' || QUARTER(m.risk_month) AS quarter,
    a.tenant_id,
    a.account_id,
    a.region,
    a.segment,
    a.account_owner_id,
    a.renewal_date,
    a.annual_recurring_revenue,
    CASE WHEN a.region = 'West' AND a.segment = 'Enterprise' AND m.risk_month >= DATE_TRUNC('MONTH', DATEADD(day, -45, CURRENT_DATE())) THEN 1 ELSE 0 END AS incident_period
  FROM months m
  CROSS JOIN dim_account a
)
SELECT
  risk_month,
  fiscal_year,
  quarter,
  tenant_id,
  account_id,
  region,
  segment,
  account_owner_id,
  renewal_date,
  CAST(CASE WHEN incident_period = 1 THEN 72 + MOD(ABS(HASH(account_id, risk_month, 'risk')), 24) ELSE 18 + MOD(ABS(HASH(account_id, risk_month, 'risk')), 45) END AS DOUBLE) AS renewal_risk_score,
  CASE
    WHEN incident_period = 1 THEN 'High'
    WHEN MOD(ABS(HASH(account_id, risk_month, 'risk-tier')), 100) < 12 THEN 'High'
    WHEN MOD(ABS(HASH(account_id, risk_month, 'risk-tier')), 100) < 42 THEN 'Medium'
    ELSE 'Low'
  END AS risk_tier,
  CASE WHEN incident_period = 1 THEN GET(ARRAY_CONSTRUCT('SLA Breach Spike', 'Product Usage Drop', 'Negative Support Sentiment'), MOD(ABS(HASH(account_id, risk_month, 'driver')), 3))::VARCHAR
    ELSE GET(ARRAY_CONSTRUCT('Low Adoption', 'Budget Pressure', 'Champion Change', 'Expansion Delay'), MOD(ABS(HASH(account_id, risk_month, 'driver')), 4))::VARCHAR
  END AS top_risk_driver,
  CAST(CASE WHEN incident_period = 1 THEN 0.42 + MOD(ABS(HASH(account_id, risk_month, 'churn-prob')), 30) / 100.0 ELSE 0.05 + MOD(ABS(HASH(account_id, risk_month, 'churn-prob')), 28) / 100.0 END AS DOUBLE) AS predicted_churn_probability,
  CAST(CASE WHEN incident_period = 1 THEN annual_recurring_revenue * 0.32 ELSE annual_recurring_revenue * (MOD(ABS(HASH(account_id, risk_month, 'risk-rev')), 10) / 100.0) END AS DOUBLE) AS revenue_at_risk,
  CASE WHEN incident_period = 1 THEN GET(ARRAY_CONSTRUCT('Executive outreach', 'Reliability credit review', 'Technical success plan', 'Renewal save play'), MOD(ABS(HASH(account_id, risk_month, 'action')), 4))::VARCHAR
    ELSE GET(ARRAY_CONSTRUCT('Usage enablement', 'QBR follow-up', 'Champion mapping', 'No action'), MOD(ABS(HASH(account_id, risk_month, 'action')), 4))::VARCHAR
  END AS recommended_action
FROM base;

-- =============================================================================
-- fact_agent_actions (12,000 rows)
-- =============================================================================
CREATE OR REPLACE TABLE fact_agent_actions AS
WITH high_risk AS (
  SELECT
    ROW_NUMBER() OVER (ORDER BY revenue_at_risk DESC, account_id) AS rn,
    COUNT(*) OVER () AS total_rows,
    *
  FROM fact_renewal_risk
  WHERE risk_tier = 'High'
),
seed AS (
  SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS action_idx
  FROM TABLE(GENERATOR(ROWCOUNT => 12000))
),
assigned AS (
  SELECT
    s.action_idx,
    h.*
  FROM seed s
  JOIN high_risk h
    ON h.rn = MOD(s.action_idx, h.total_rows) + 1
)
SELECT
  'ACT-' || LPAD(CAST(action_idx AS VARCHAR), 7, '0') AS action_id,
  CAST(DATEADD(day, MOD(ABS(HASH(action_idx, 'created')), 24), risk_month) AS TIMESTAMP) AS created_ts,
  DATEADD(day, MOD(ABS(HASH(action_idx, 'created')), 24), risk_month) AS date,
  tenant_id,
  account_id,
  region,
  segment,
  account_owner_id,
  CASE WHEN MOD(ABS(HASH(action_idx, 'source')), 100) < 70 THEN 'Domo Agent Catalyst' ELSE 'Genie-assisted triage' END AS source_agent,
  'Why did renewal risk increase and which action should we take?' AS source_question,
  recommended_action AS recommendation,
  CASE
    WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 58 THEN 'Approved'
    WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 78 THEN 'Pending'
    WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 90 THEN 'Rejected'
    ELSE 'Not Required'
  END AS approval_status,
  CASE
    WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 58 THEN 'Executed'
    WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 78 THEN 'Waiting'
    WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 90 THEN 'Cancelled'
    ELSE 'Executed'
  END AS execution_status,
  CASE recommended_action
    WHEN 'Executive outreach' THEN 'Executive Retention Outreach'
    WHEN 'Reliability credit review' THEN 'Credit Approval Workflow'
    WHEN 'Technical success plan' THEN 'Technical Success Plan'
    WHEN 'Renewal save play' THEN 'Renewal Save Play'
    ELSE 'Customer Health Follow-up'
  END AS workflow_name,
  CASE WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 58 THEN 'vp.success@demo.local' ELSE NULL END AS approved_by,
  CASE WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 58 THEN CAST(DATEADD(day, 3 + MOD(ABS(HASH(action_idx, 'done')), 18), risk_month) AS TIMESTAMP) ELSE NULL END AS completed_ts,
  CAST(revenue_at_risk * (0.28 + MOD(ABS(HASH(action_idx, 'expected')), 22) / 100.0) AS DOUBLE) AS expected_revenue_protected,
  CAST(CASE WHEN MOD(ABS(HASH(action_idx, 'approval')), 100) < 58 THEN revenue_at_risk * (0.16 + MOD(ABS(HASH(action_idx, 'actual')), 26) / 100.0) ELSE 0 END AS DOUBLE) AS actual_revenue_protected
FROM assigned;
