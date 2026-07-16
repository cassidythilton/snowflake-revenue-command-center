CREATE OR REPLACE TABLE dim_tenant
USING DELTA
AS
SELECT * FROM VALUES
  ('TEN-001', 'Asteria Retail Group', 'Strategic', 'Retail', true),
  ('TEN-002', 'Northstar Financial', 'Strategic', 'Financial Services', true),
  ('TEN-003', 'Helio Manufacturing', 'Commercial', 'Manufacturing', true),
  ('TEN-004', 'Summit Health Network', 'Commercial', 'Healthcare', true),
  ('TEN-005', 'Bluebird Logistics', 'Emerging', 'Transportation', true),
  ('TEN-006', 'Canyon Software', 'Emerging', 'Technology', true)
AS t(tenant_id, tenant_name, tenant_segment, industry, active_flag);

CREATE OR REPLACE TABLE dim_product
USING DELTA
AS
SELECT * FROM VALUES
  ('PROD-001', 'Raptor Workflow Engine', 'Automation', 'Critical', date_sub(current_date(), 900)),
  ('PROD-002', 'Raptor Data Sync', 'Integration', 'Critical', date_sub(current_date(), 820)),
  ('PROD-003', 'Raptor Insights', 'Analytics', 'High', date_sub(current_date(), 760)),
  ('PROD-004', 'Raptor Mobile', 'Experience', 'Medium', date_sub(current_date(), 680)),
  ('PROD-005', 'Raptor Alerts', 'Automation', 'High', date_sub(current_date(), 620)),
  ('PROD-006', 'Raptor Forecast', 'AI', 'High', date_sub(current_date(), 540)),
  ('PROD-007', 'Raptor Connectors', 'Integration', 'Critical', date_sub(current_date(), 500)),
  ('PROD-008', 'Raptor Governance', 'Security', 'High', date_sub(current_date(), 460)),
  ('PROD-009', 'Raptor Pages', 'Experience', 'Medium', date_sub(current_date(), 390)),
  ('PROD-010', 'Raptor Copilot', 'AI', 'High', date_sub(current_date(), 270))
AS t(product_id, product_name, product_family, criticality, launch_date);

CREATE OR REPLACE TABLE dim_user_entitlement
USING DELTA
AS
SELECT * FROM VALUES
  ('exec@demo.local', 'Executive Sponsor', 'Executive Sponsor', null, null, null, 'ALL'),
  ('admin@demo.local', 'Data Platform Admin', 'Data Platform Admin', null, null, null, 'ALL'),
  ('west.manager@demo.local', 'West Regional Manager', 'Regional Manager', null, 'West', null, 'REGION'),
  ('east.manager@demo.local', 'East Regional Manager', 'Regional Manager', null, 'East', null, 'REGION'),
  ('central.manager@demo.local', 'Central Regional Manager', 'Regional Manager', null, 'Central', null, 'REGION'),
  ('south.manager@demo.local', 'South Regional Manager', 'Regional Manager', null, 'South', null, 'REGION'),
  ('owner.west@demo.local', 'West Account Owner', 'Account Owner', null, 'West', 'OWN-WEST-01', 'OWNER'),
  ('owner.east@demo.local', 'East Account Owner', 'Account Owner', null, 'East', 'OWN-EAST-01', 'OWNER'),
  ('tenant.asteria@demo.local', 'Asteria Tenant Admin', 'Tenant Admin', 'TEN-001', null, null, 'TENANT'),
  ('tenant.northstar@demo.local', 'Northstar Tenant Admin', 'Tenant Admin', 'TEN-002', null, null, 'TENANT')
AS t(user_key, display_name, persona, tenant_id, region, account_owner_id, access_level);

CREATE OR REPLACE TABLE dim_account
USING DELTA
AS
WITH base AS (
  SELECT CAST(id AS INT) AS account_idx FROM range(4000)
),
shaped AS (
  SELECT
    account_idx,
    pmod(account_idx, 6) + 1 AS tenant_num,
    CASE
      WHEN pmod(hash(account_idx, 'region'), 100) < 35 THEN 'West'
      WHEN pmod(hash(account_idx, 'region'), 100) < 60 THEN 'East'
      WHEN pmod(hash(account_idx, 'region'), 100) < 80 THEN 'Central'
      ELSE 'South'
    END AS region,
    CASE
      WHEN pmod(hash(account_idx, 'segment'), 100) < 18 THEN 'Enterprise'
      WHEN pmod(hash(account_idx, 'segment'), 100) < 60 THEN 'Mid-Market'
      ELSE 'SMB'
    END AS segment,
    element_at(array('Retail', 'Financial Services', 'Manufacturing', 'Healthcare', 'Transportation', 'Technology'), pmod(hash(account_idx, 'industry'), 6) + 1) AS industry,
    element_at(array('Acme', 'Beacon', 'Cobalt', 'Delta', 'Evergreen', 'Frontier', 'Granite', 'Harbor', 'Ion', 'Juniper'), pmod(account_idx, 10) + 1) AS prefix,
    element_at(array('Analytics', 'Systems', 'Holdings', 'Partners', 'Group', 'Labs', 'Industries', 'Networks'), pmod(hash(account_idx, 'suffix'), 8) + 1) AS suffix
  FROM base
)
SELECT
  concat('ACC-', lpad(CAST(account_idx AS STRING), 5, '0')) AS account_id,
  concat('TEN-', lpad(CAST(tenant_num AS STRING), 3, '0')) AS tenant_id,
  concat(prefix, ' ', suffix, ' ', CAST(account_idx AS STRING)) AS account_name,
  region,
  segment,
  industry,
  concat('OWN-', upper(region), '-', lpad(CAST(pmod(account_idx, 12) + 1 AS STRING), 2, '0')) AS account_owner_id,
  concat(region, ' Owner ', lpad(CAST(pmod(account_idx, 12) + 1 AS STRING), 2, '0')) AS account_owner_name,
  CAST(
    CASE segment
      WHEN 'Enterprise' THEN 180000 + pmod(hash(account_idx, 'arr'), 1200000)
      WHEN 'Mid-Market' THEN 35000 + pmod(hash(account_idx, 'arr'), 180000)
      ELSE 5000 + pmod(hash(account_idx, 'arr'), 45000)
    END AS DOUBLE
  ) AS annual_recurring_revenue,
  date_sub(current_date(), 365 + pmod(hash(account_idx, 'contract'), 1095)) AS contract_start_date,
  date_add(current_date(), 15 + pmod(hash(account_idx, 'renewal'), 365)) AS renewal_date,
  date_sub(current_date(), 365 + pmod(hash(account_idx, 'since'), 1825)) AS customer_since_date,
  CASE
    WHEN region = 'West' AND segment = 'Enterprise' THEN 'Watch'
    WHEN pmod(hash(account_idx, 'health'), 100) < 15 THEN 'At Risk'
    WHEN pmod(hash(account_idx, 'health'), 100) < 70 THEN 'Healthy'
    ELSE 'Growth'
  END AS health_tier,
  true AS active_flag
FROM shaped;

CREATE OR REPLACE TABLE fact_incidents
USING DELTA
AS
WITH generated AS (
  SELECT CAST(id AS INT) AS incident_idx FROM range(119)
)
SELECT
  'INC-0001' AS incident_id,
  CAST(date_sub(current_date(), 45) AS TIMESTAMP) AS incident_start_ts,
  CAST(date_sub(current_date(), 42) AS TIMESTAMP) AS incident_end_ts,
  date_sub(current_date(), 45) AS incident_date,
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
  concat('INC-', lpad(CAST(incident_idx + 2 AS STRING), 4, '0')) AS incident_id,
  CAST(date_sub(current_date(), 5 + pmod(hash(incident_idx, 'start'), 700)) AS TIMESTAMP) AS incident_start_ts,
  CAST(date_sub(current_date(), 4 + pmod(hash(incident_idx, 'start'), 700)) AS TIMESTAMP) AS incident_end_ts,
  date_sub(current_date(), 5 + pmod(hash(incident_idx, 'start'), 700)) AS incident_date,
  concat('PROD-', lpad(CAST(pmod(hash(incident_idx, 'product'), 10) + 1 AS STRING), 3, '0')) AS product_id,
  element_at(array('West', 'East', 'Central', 'South'), pmod(hash(incident_idx, 'region'), 4) + 1) AS region,
  element_at(array('SEV-2', 'SEV-3', 'SEV-4'), pmod(hash(incident_idx, 'sev'), 3) + 1) AS severity,
  element_at(array('Reliability', 'Latency', 'Data Freshness', 'Authentication'), pmod(hash(incident_idx, 'cat'), 4) + 1) AS incident_category,
  element_at(array('Deployment regression', 'Upstream API degradation', 'Warehouse capacity pressure', 'Connector retry backlog'), pmod(hash(incident_idx, 'root'), 4) + 1) AS root_cause,
  element_at(array('Low', 'Medium', 'Medium', 'High'), pmod(hash(incident_idx, 'impact'), 4) + 1) AS customer_impact_level,
  CAST(10000 + pmod(hash(incident_idx, 'rev'), 220000) AS DOUBLE) AS estimated_revenue_impact,
  'Resolved' AS status
FROM generated;

CREATE OR REPLACE TABLE fact_revenue_daily
USING DELTA
AS
WITH dates AS (
  SELECT explode(sequence(date_sub(current_date(), 729), current_date(), interval 1 day)) AS date
),
base AS (
  SELECT
    d.date,
    year(d.date) AS fiscal_year,
    concat('Q', quarter(d.date)) AS quarter,
    date_format(d.date, 'yyyy-MM') AS fiscal_period,
    a.tenant_id,
    a.account_id,
    a.region,
    a.segment,
    a.account_owner_id,
    a.annual_recurring_revenue,
    CASE
      WHEN a.region = 'West'
        AND a.segment = 'Enterprise'
        AND d.date BETWEEN date_sub(current_date(), 45) AND date_add(date_sub(current_date(), 45), 40)
      THEN 1 ELSE 0
    END AS incident_window,
    CASE
      WHEN month(d.date) IN (3, 6, 9, 12) THEN 1.18
      WHEN month(d.date) IN (1, 7) THEN 0.92
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
  CAST((annual_recurring_revenue / 365.0) * seasonality * (0.16 + (pmod(hash(account_id, date, 'bookings'), 100) / 650.0)) AS DOUBLE) AS bookings_amount,
  CAST(CASE WHEN pmod(hash(account_id, date, 'expansion'), 100) < 8 THEN annual_recurring_revenue * 0.004 ELSE 0 END AS DOUBLE) AS expansion_arr,
  CAST(CASE WHEN incident_window = 1 THEN annual_recurring_revenue * 0.0016 WHEN pmod(hash(account_id, date, 'contraction'), 100) < 3 THEN annual_recurring_revenue * 0.001 ELSE 0 END AS DOUBLE) AS contraction_arr,
  CAST(CASE WHEN incident_window = 1 AND pmod(hash(account_id, date, 'churn'), 100) < 2 THEN annual_recurring_revenue * 0.003 ELSE 0 END AS DOUBLE) AS churned_arr,
  CAST((annual_recurring_revenue / 365.0) * seasonality AS DOUBLE) AS net_revenue,
  CAST((annual_recurring_revenue / 365.0) * seasonality * (0.58 + pmod(hash(account_id, 'margin'), 18) / 100.0) AS DOUBLE) AS gross_margin,
  CAST(
    CASE
      WHEN incident_window = 1 THEN annual_recurring_revenue * (0.10 + pmod(hash(account_id, 'risk'), 18) / 100.0)
      WHEN region = 'West' AND segment = 'Enterprise' AND date > date_add(date_sub(current_date(), 45), 40) THEN annual_recurring_revenue * 0.035
      ELSE annual_recurring_revenue * (pmod(hash(account_id, date, 'baseline-risk'), 5) / 1000.0)
    END AS DOUBLE
  ) AS revenue_at_risk
FROM base;

CREATE OR REPLACE TABLE fact_product_usage_daily
USING DELTA
AS
WITH dates AS (
  SELECT explode(sequence(date_sub(current_date(), 729), current_date(), interval 1 day)) AS date
),
base AS (
  SELECT
    d.date,
    year(d.date) AS fiscal_year,
    concat('Q', quarter(d.date)) AS quarter,
    a.tenant_id,
    a.account_id,
    CASE WHEN a.region = 'West' AND a.segment = 'Enterprise' THEN 'PROD-001'
      ELSE concat('PROD-', lpad(CAST(pmod(hash(a.account_id, 'product'), 10) + 1 AS STRING), 3, '0'))
    END AS product_id,
    a.region,
    a.segment,
    a.annual_recurring_revenue,
    CASE
      WHEN a.region = 'West'
        AND a.segment = 'Enterprise'
        AND d.date BETWEEN date_sub(current_date(), 45) AND date_add(date_sub(current_date(), 45), 35)
      THEN 1 ELSE 0
    END AS incident_window
  FROM dates d
  CROSS JOIN dim_account a
  WHERE pmod(hash(d.date, a.account_id, 'usage-sample'), 2) = 0
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
  CAST(greatest(1, (annual_recurring_revenue / 18000) * CASE WHEN incident_window = 1 THEN 0.42 ELSE 1.0 END + pmod(hash(account_id, date, 'users'), 60)) AS INT) AS active_users,
  CAST(greatest(1, (annual_recurring_revenue / 6000) * CASE WHEN incident_window = 1 THEN 0.48 ELSE 1.0 END + pmod(hash(account_id, date, 'sessions'), 220)) AS INT) AS sessions,
  CAST(greatest(0, (annual_recurring_revenue / 9000) * CASE WHEN incident_window = 1 THEN 0.38 ELSE 1.0 END + pmod(hash(account_id, date, 'runs'), 140)) AS INT) AS workflow_runs,
  CAST(CASE WHEN incident_window = 1 THEN 38 + pmod(hash(account_id, date, 'score'), 18) ELSE 70 + pmod(hash(account_id, date, 'score'), 28) END AS DOUBLE) AS usage_score,
  CASE WHEN incident_window = 1 THEN true ELSE false END AS usage_drop_flag
FROM base;

CREATE OR REPLACE TABLE fact_support_cases
USING DELTA
AS
WITH west_accounts AS (
  SELECT
    row_number() OVER (ORDER BY account_id) AS rn,
    count(*) OVER () AS total_rows,
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
    row_number() OVER (ORDER BY account_id) AS rn,
    count(*) OVER () AS total_rows,
    account_id,
    tenant_id,
    region,
    segment,
    account_owner_id
  FROM dim_account
),
seed AS (
  SELECT CAST(id AS INT) AS case_idx FROM range(150000)
),
assigned AS (
  SELECT
    s.case_idx,
    CASE WHEN s.case_idx < 30000 THEN date_add(date_sub(current_date(), 45), pmod(s.case_idx, 18))
      ELSE date_sub(current_date(), pmod(hash(s.case_idx, 'case-date'), 730))
    END AS date,
    coalesce(w.account_id, a.account_id) AS account_id,
    coalesce(w.tenant_id, a.tenant_id) AS tenant_id,
    coalesce(w.region, a.region) AS region,
    coalesce(w.segment, a.segment) AS segment,
    coalesce(w.account_owner_id, a.account_owner_id) AS account_owner_id,
    CASE WHEN s.case_idx < 30000 THEN true ELSE false END AS incident_case
  FROM seed s
  LEFT JOIN west_accounts w
    ON s.case_idx < 30000 AND w.rn = pmod(s.case_idx, w.total_rows) + 1
  LEFT JOIN all_accounts a
    ON s.case_idx >= 30000 AND a.rn = pmod(s.case_idx, a.total_rows) + 1
)
SELECT
  concat('CASE-', lpad(CAST(case_idx AS STRING), 7, '0')) AS case_id,
  CAST(date AS TIMESTAMP) AS created_ts,
  CAST(date_add(date, CASE WHEN incident_case THEN 2 + pmod(hash(case_idx, 'resolve'), 8) ELSE pmod(hash(case_idx, 'resolve'), 4) END) AS TIMESTAMP) AS resolved_ts,
  date,
  tenant_id,
  account_id,
  CASE WHEN incident_case THEN 'PROD-001' ELSE concat('PROD-', lpad(CAST(pmod(hash(case_idx, 'product'), 10) + 1 AS STRING), 3, '0')) END AS product_id,
  region,
  segment,
  CASE
    WHEN incident_case AND pmod(hash(case_idx, 'priority'), 100) < 55 THEN 'P1'
    WHEN incident_case THEN 'P2'
    WHEN pmod(hash(case_idx, 'priority'), 100) < 8 THEN 'P1'
    WHEN pmod(hash(case_idx, 'priority'), 100) < 28 THEN 'P2'
    ELSE 'P3'
  END AS priority,
  CASE WHEN incident_case THEN 'Workflow Reliability'
    ELSE element_at(array('How To', 'Data Freshness', 'Authentication', 'Performance', 'Integration'), pmod(hash(case_idx, 'cat'), 5) + 1)
  END AS case_category,
  CASE WHEN incident_case THEN 8 ELSE 24 END AS sla_target_hours,
  CAST(CASE WHEN incident_case THEN 18 + pmod(hash(case_idx, 'hours'), 72) ELSE 2 + pmod(hash(case_idx, 'hours'), 30) END AS DOUBLE) AS resolution_hours,
  CASE WHEN incident_case THEN true ELSE pmod(hash(case_idx, 'breach'), 100) < 9 END AS sla_breached_flag,
  CASE WHEN incident_case THEN element_at(array('Negative', 'Negative', 'Neutral'), pmod(hash(case_idx, 'sentiment'), 3) + 1)
    ELSE element_at(array('Positive', 'Neutral', 'Neutral', 'Negative'), pmod(hash(case_idx, 'sentiment'), 4) + 1)
  END AS customer_sentiment,
  CASE WHEN incident_case THEN 'INC-0001' ELSE null END AS incident_id
FROM assigned;

CREATE OR REPLACE TABLE fact_renewal_risk
USING DELTA
AS
WITH months AS (
  SELECT explode(sequence(add_months(date_trunc('MONTH', current_date()), -23), date_trunc('MONTH', current_date()), interval 1 month)) AS risk_month
),
base AS (
  SELECT
    m.risk_month,
    year(m.risk_month) AS fiscal_year,
    concat('Q', quarter(m.risk_month)) AS quarter,
    a.tenant_id,
    a.account_id,
    a.region,
    a.segment,
    a.account_owner_id,
    a.renewal_date,
    a.annual_recurring_revenue,
    CASE WHEN a.region = 'West' AND a.segment = 'Enterprise' AND m.risk_month >= date_trunc('MONTH', date_sub(current_date(), 45)) THEN 1 ELSE 0 END AS incident_period
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
  CAST(CASE WHEN incident_period = 1 THEN 72 + pmod(hash(account_id, risk_month, 'risk'), 24) ELSE 18 + pmod(hash(account_id, risk_month, 'risk'), 45) END AS DOUBLE) AS renewal_risk_score,
  CASE
    WHEN incident_period = 1 THEN 'High'
    WHEN pmod(hash(account_id, risk_month, 'risk-tier'), 100) < 12 THEN 'High'
    WHEN pmod(hash(account_id, risk_month, 'risk-tier'), 100) < 42 THEN 'Medium'
    ELSE 'Low'
  END AS risk_tier,
  CASE WHEN incident_period = 1 THEN element_at(array('SLA Breach Spike', 'Product Usage Drop', 'Negative Support Sentiment'), pmod(hash(account_id, risk_month, 'driver'), 3) + 1)
    ELSE element_at(array('Low Adoption', 'Budget Pressure', 'Champion Change', 'Expansion Delay'), pmod(hash(account_id, risk_month, 'driver'), 4) + 1)
  END AS top_risk_driver,
  CAST(CASE WHEN incident_period = 1 THEN 0.42 + pmod(hash(account_id, risk_month, 'churn-prob'), 30) / 100.0 ELSE 0.05 + pmod(hash(account_id, risk_month, 'churn-prob'), 28) / 100.0 END AS DOUBLE) AS predicted_churn_probability,
  CAST(CASE WHEN incident_period = 1 THEN annual_recurring_revenue * 0.32 ELSE annual_recurring_revenue * (pmod(hash(account_id, risk_month, 'risk-rev'), 10) / 100.0) END AS DOUBLE) AS revenue_at_risk,
  CASE WHEN incident_period = 1 THEN element_at(array('Executive outreach', 'Reliability credit review', 'Technical success plan', 'Renewal save play'), pmod(hash(account_id, risk_month, 'action'), 4) + 1)
    ELSE element_at(array('Usage enablement', 'QBR follow-up', 'Champion mapping', 'No action'), pmod(hash(account_id, risk_month, 'action'), 4) + 1)
  END AS recommended_action
FROM base;

CREATE OR REPLACE TABLE fact_agent_actions
USING DELTA
AS
WITH high_risk AS (
  SELECT
    row_number() OVER (ORDER BY revenue_at_risk DESC, account_id) AS rn,
    count(*) OVER () AS total_rows,
    *
  FROM fact_renewal_risk
  WHERE risk_tier = 'High'
),
seed AS (
  SELECT CAST(id AS INT) AS action_idx FROM range(12000)
),
assigned AS (
  SELECT
    s.action_idx,
    h.*
  FROM seed s
  JOIN high_risk h
    ON h.rn = pmod(s.action_idx, h.total_rows) + 1
)
SELECT
  concat('ACT-', lpad(CAST(action_idx AS STRING), 7, '0')) AS action_id,
  CAST(date_add(risk_month, pmod(hash(action_idx, 'created'), 24)) AS TIMESTAMP) AS created_ts,
  date_add(risk_month, pmod(hash(action_idx, 'created'), 24)) AS date,
  tenant_id,
  account_id,
  region,
  segment,
  account_owner_id,
  CASE WHEN pmod(hash(action_idx, 'source'), 100) < 70 THEN 'Domo Agent Catalyst' ELSE 'Genie-assisted triage' END AS source_agent,
  'Why did renewal risk increase and which action should we take?' AS source_question,
  recommended_action AS recommendation,
  CASE
    WHEN pmod(hash(action_idx, 'approval'), 100) < 58 THEN 'Approved'
    WHEN pmod(hash(action_idx, 'approval'), 100) < 78 THEN 'Pending'
    WHEN pmod(hash(action_idx, 'approval'), 100) < 90 THEN 'Rejected'
    ELSE 'Not Required'
  END AS approval_status,
  CASE
    WHEN pmod(hash(action_idx, 'approval'), 100) < 58 THEN 'Executed'
    WHEN pmod(hash(action_idx, 'approval'), 100) < 78 THEN 'Waiting'
    WHEN pmod(hash(action_idx, 'approval'), 100) < 90 THEN 'Cancelled'
    ELSE 'Executed'
  END AS execution_status,
  CASE recommended_action
    WHEN 'Executive outreach' THEN 'Executive Retention Outreach'
    WHEN 'Reliability credit review' THEN 'Credit Approval Workflow'
    WHEN 'Technical success plan' THEN 'Technical Success Plan'
    WHEN 'Renewal save play' THEN 'Renewal Save Play'
    ELSE 'Customer Health Follow-up'
  END AS workflow_name,
  CASE WHEN pmod(hash(action_idx, 'approval'), 100) < 58 THEN 'vp.success@demo.local' ELSE null END AS approved_by,
  CASE WHEN pmod(hash(action_idx, 'approval'), 100) < 58 THEN CAST(date_add(risk_month, 3 + pmod(hash(action_idx, 'done'), 18)) AS TIMESTAMP) ELSE null END AS completed_ts,
  CAST(revenue_at_risk * (0.28 + pmod(hash(action_idx, 'expected'), 22) / 100.0) AS DOUBLE) AS expected_revenue_protected,
  CAST(CASE WHEN pmod(hash(action_idx, 'approval'), 100) < 58 THEN revenue_at_risk * (0.16 + pmod(hash(action_idx, 'actual'), 26) / 100.0) ELSE 0 END AS DOUBLE) AS actual_revenue_protected
FROM assigned;

CREATE OR REPLACE VIEW gold_executive_revenue_health AS
SELECT
  date,
  fiscal_year,
  quarter,
  fiscal_period,
  tenant_id,
  region,
  segment,
  sum(net_revenue) AS net_revenue,
  sum(gross_margin) AS gross_margin,
  sum(expansion_arr) AS expansion_arr,
  sum(churned_arr) AS churned_arr,
  sum(revenue_at_risk) AS revenue_at_risk
FROM fact_revenue_daily
GROUP BY date, fiscal_year, quarter, fiscal_period, tenant_id, region, segment;

CREATE OR REPLACE VIEW gold_customer_renewal_risk AS
WITH latest_risk AS (
  SELECT *
  FROM fact_renewal_risk
  WHERE risk_month = date_trunc('MONTH', current_date())
),
support_90 AS (
  SELECT
    account_id,
    count(*) AS cases_90d,
    sum(CASE WHEN sla_breached_flag THEN 1 ELSE 0 END) AS sla_breaches_90d,
    sum(CASE WHEN customer_sentiment = 'Negative' THEN 1 ELSE 0 END) AS negative_cases_90d
  FROM fact_support_cases
  WHERE date >= date_sub(current_date(), 90)
  GROUP BY account_id
),
usage_90 AS (
  SELECT
    account_id,
    avg(usage_score) AS avg_usage_score_90d,
    sum(CASE WHEN usage_drop_flag THEN 1 ELSE 0 END) AS usage_drop_days_90d
  FROM fact_product_usage_daily
  WHERE date >= date_sub(current_date(), 90)
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
  coalesce(s.cases_90d, 0) AS cases_90d,
  coalesce(s.sla_breaches_90d, 0) AS sla_breaches_90d,
  coalesce(s.negative_cases_90d, 0) AS negative_cases_90d,
  coalesce(u.avg_usage_score_90d, 0) AS avg_usage_score_90d,
  coalesce(u.usage_drop_days_90d, 0) AS usage_drop_days_90d
FROM latest_risk r
JOIN dim_account a ON r.account_id = a.account_id
LEFT JOIN support_90 s ON r.account_id = s.account_id
LEFT JOIN usage_90 u ON r.account_id = u.account_id;

CREATE OR REPLACE VIEW gold_incident_revenue_impact AS
WITH support_rollup AS (
  SELECT
    incident_id,
    count(*) AS support_case_count,
    sum(CASE WHEN sla_breached_flag THEN 1 ELSE 0 END) AS sla_breach_count,
    sum(CASE WHEN customer_sentiment = 'Negative' THEN 1 ELSE 0 END) AS negative_case_count,
    count(DISTINCT account_id) AS affected_account_count
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
    sum(r.revenue_at_risk) AS renewal_revenue_at_risk
  FROM affected_accounts a
  JOIN fact_renewal_risk r
    ON a.account_id = r.account_id
    AND r.risk_month = date_trunc('MONTH', current_date())
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
  coalesce(s.affected_account_count, 0) AS affected_account_count,
  coalesce(s.support_case_count, 0) AS support_case_count,
  coalesce(s.sla_breach_count, 0) AS sla_breach_count,
  coalesce(s.negative_case_count, 0) AS negative_case_count,
  coalesce(r.renewal_revenue_at_risk, 0) AS renewal_revenue_at_risk
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
  CASE WHEN completed_ts IS NOT NULL THEN datediff(CAST(completed_ts AS DATE), CAST(created_ts AS DATE)) ELSE null END AS workflow_cycle_days
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
