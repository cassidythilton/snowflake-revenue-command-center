--------------------------------------------------------------------------------
-- 10_semantic_view.sql
-- Governed Semantic View for the Revenue Command Center (Cortex Analyst layer)
-- Target: SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
-- Role: SYSADMIN | Warehouse: REVENUE_CC_WH
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

CREATE OR REPLACE SEMANTIC VIEW REVENUE_CC_ANALYST

  -- =========================================================================
  -- LOGICAL TABLES
  -- =========================================================================
  TABLES (
    acct AS SNOWFLAKE_REVENUE_CC.CORE.DIM_ACCOUNT
      PRIMARY KEY (account_id)
      WITH SYNONYMS = ('account', 'customer', 'client')
      COMMENT = 'Customer accounts with ARR, region, segment, health tier, and renewal dates',

    tenant AS SNOWFLAKE_REVENUE_CC.CORE.DIM_TENANT
      PRIMARY KEY (tenant_id)
      WITH SYNONYMS = ('tenant', 'organization')
      COMMENT = 'Multi-tenant organizations grouping accounts',

    product AS SNOWFLAKE_REVENUE_CC.CORE.DIM_PRODUCT
      PRIMARY KEY (product_id)
      WITH SYNONYMS = ('product', 'service', 'module')
      COMMENT = 'Product catalog with family and criticality',

    rev AS SNOWFLAKE_REVENUE_CC.CORE.FACT_REVENUE_DAILY
      WITH SYNONYMS = ('revenue', 'daily revenue', 'ARR', 'bookings')
      COMMENT = 'Daily revenue grain with ARR, bookings, expansion, contraction, churn, margin, and risk',

    risk AS SNOWFLAKE_REVENUE_CC.CORE.FACT_RENEWAL_RISK
      WITH SYNONYMS = ('renewal risk', 'churn risk', 'risk assessment')
      COMMENT = 'Monthly renewal-risk scores, predicted churn probability, risk drivers, and recommended actions',

    support AS SNOWFLAKE_REVENUE_CC.CORE.FACT_SUPPORT_CASES
      WITH SYNONYMS = ('support case', 'ticket', 'case')
      COMMENT = 'Support cases with SLA, resolution time, and sentiment',

    usage AS SNOWFLAKE_REVENUE_CC.CORE.FACT_PRODUCT_USAGE_DAILY
      WITH SYNONYMS = ('product usage', 'adoption', 'engagement')
      COMMENT = 'Daily product usage metrics per account and product',

    incident AS SNOWFLAKE_REVENUE_CC.CORE.FACT_INCIDENTS
      WITH SYNONYMS = ('incident', 'outage', 'reliability event')
      COMMENT = 'Product incidents with severity, root cause, and estimated revenue impact',

    actions AS SNOWFLAKE_REVENUE_CC.CORE.FACT_AGENT_ACTIONS
      WITH SYNONYMS = ('agent action', 'recommendation', 'intervention')
      COMMENT = 'AI agent recommended and executed actions with protected revenue outcomes'
  )

  -- =========================================================================
  -- RELATIONSHIPS
  -- =========================================================================
  RELATIONSHIPS (
    rev_to_acct     AS rev(account_id)     REFERENCES acct(account_id),
    rev_to_tenant   AS rev(tenant_id)      REFERENCES tenant(tenant_id),
    risk_to_acct    AS risk(account_id)     REFERENCES acct(account_id),
    risk_to_tenant  AS risk(tenant_id)      REFERENCES tenant(tenant_id),
    support_to_acct AS support(account_id)  REFERENCES acct(account_id),
    support_to_tenant AS support(tenant_id) REFERENCES tenant(tenant_id),
    support_to_product AS support(product_id) REFERENCES product(product_id),
    usage_to_acct   AS usage(account_id)    REFERENCES acct(account_id),
    usage_to_tenant AS usage(tenant_id)     REFERENCES tenant(tenant_id),
    usage_to_product AS usage(product_id)   REFERENCES product(product_id),
    incident_to_product AS incident(product_id) REFERENCES product(product_id),
    actions_to_acct AS actions(account_id)  REFERENCES acct(account_id),
    actions_to_tenant AS actions(tenant_id) REFERENCES tenant(tenant_id),
    acct_to_tenant  AS acct(tenant_id)      REFERENCES tenant(tenant_id)
  )

  -- =========================================================================
  -- FACTS (raw measurable columns exposed for ad-hoc use)
  -- =========================================================================
  FACTS (
    rev.daily_arr AS rev.daily_arr
      WITH SYNONYMS = ('daily ARR', 'recurring revenue')
      COMMENT = 'Daily annual recurring revenue for an account',

    rev.bookings_amount AS rev.bookings_amount
      WITH SYNONYMS = ('bookings')
      COMMENT = 'Bookings amount for the day',

    rev.expansion_arr AS rev.expansion_arr
      WITH SYNONYMS = ('expansion', 'upsell')
      COMMENT = 'Expansion ARR for the day',

    rev.contraction_arr AS rev.contraction_arr
      WITH SYNONYMS = ('contraction', 'downsell')
      COMMENT = 'Contraction ARR for the day',

    rev.churned_arr AS rev.churned_arr
      WITH SYNONYMS = ('churned ARR', 'churn amount')
      COMMENT = 'Churned ARR for the day',

    rev.net_revenue AS rev.net_revenue
      WITH SYNONYMS = ('net revenue', 'revenue')
      COMMENT = 'Net revenue for the day',

    rev.gross_margin AS rev.gross_margin
      WITH SYNONYMS = ('margin', 'gross margin')
      COMMENT = 'Gross margin for the day',

    rev.revenue_at_risk AS rev.revenue_at_risk
      WITH SYNONYMS = ('revenue at risk', 'at-risk revenue')
      COMMENT = 'Revenue at risk from fact_revenue_daily',

    risk.renewal_risk_score AS risk.renewal_risk_score
      WITH SYNONYMS = ('risk score', 'renewal score')
      COMMENT = 'Renewal risk score 0-100',

    risk.predicted_churn_probability AS risk.predicted_churn_probability
      WITH SYNONYMS = ('churn probability', 'churn likelihood')
      COMMENT = 'ML-predicted probability of churn',

    risk.risk_revenue_at_risk AS risk.revenue_at_risk
      WITH SYNONYMS = ('risk revenue at risk')
      COMMENT = 'Revenue at risk from renewal risk assessment',

    support.resolution_hours AS support.resolution_hours
      WITH SYNONYMS = ('resolution time', 'time to resolve')
      COMMENT = 'Hours to resolve the support case',

    support.sla_breached_flag AS support.sla_breached_flag
      WITH SYNONYMS = ('SLA breach', 'SLA breached')
      COMMENT = 'Flag indicating SLA was breached (1=breached)',

    usage.usage_score AS usage.usage_score
      WITH SYNONYMS = ('usage score', 'engagement score')
      COMMENT = 'Composite usage score 0-100',

    usage.usage_drop_flag AS usage.usage_drop_flag
      WITH SYNONYMS = ('usage drop', 'declining usage')
      COMMENT = 'Flag indicating significant usage drop',

    actions.expected_revenue_protected AS actions.expected_revenue_protected
      WITH SYNONYMS = ('expected protected revenue')
      COMMENT = 'Expected revenue protected by the action',

    actions.actual_revenue_protected AS actions.actual_revenue_protected
      WITH SYNONYMS = ('actual protected revenue', 'saved revenue')
      COMMENT = 'Actual revenue confirmed protected after action execution'
  )

  -- =========================================================================
  -- DIMENSIONS
  -- =========================================================================
  DIMENSIONS (
    -- Revenue dimensions
    rev.region AS rev.region
      WITH SYNONYMS = ('region', 'geo')
      COMMENT = 'Geographic region (West, East, Central, South)',
    rev.segment AS rev.segment
      WITH SYNONYMS = ('segment', 'customer segment')
      COMMENT = 'Customer segment (Enterprise, Mid-Market, SMB)',
    rev.date AS rev.date
      WITH SYNONYMS = ('revenue date', 'date')
      COMMENT = 'Calendar date for revenue',
    rev.fiscal_year AS rev.fiscal_year
      WITH SYNONYMS = ('fiscal year', 'FY')
      COMMENT = 'Fiscal year',
    rev.quarter AS rev.quarter
      WITH SYNONYMS = ('quarter', 'fiscal quarter')
      COMMENT = 'Fiscal quarter (Q1-Q4)',
    rev.fiscal_period AS rev.fiscal_period
      WITH SYNONYMS = ('fiscal period', 'period', 'month')
      COMMENT = 'Fiscal period / month grain',

    -- Account dimensions
    acct.region AS acct.region
      WITH SYNONYMS = ('account region')
      COMMENT = 'Account region',
    acct.segment AS acct.segment
      WITH SYNONYMS = ('account segment')
      COMMENT = 'Account segment',
    acct.industry AS acct.industry
      WITH SYNONYMS = ('industry', 'vertical')
      COMMENT = 'Account industry vertical',
    acct.account_name AS acct.account_name
      WITH SYNONYMS = ('account name', 'customer name')
      COMMENT = 'Account display name',
    acct.account_id AS acct.account_id
      WITH SYNONYMS = ('account ID')
      COMMENT = 'Account identifier',
    acct.health_tier AS acct.health_tier
      WITH SYNONYMS = ('health tier', 'account health', 'health status')
      COMMENT = 'Account health classification (Healthy, Growth, Watch, At Risk)',
    acct.account_owner_name AS acct.account_owner_name
      WITH SYNONYMS = ('account owner', 'CSM')
      COMMENT = 'Account owner / CSM name',

    -- Tenant dimensions
    tenant.tenant_name AS tenant.tenant_name
      WITH SYNONYMS = ('tenant name', 'organization name')
      COMMENT = 'Tenant organization name',
    tenant.tenant_segment AS tenant.tenant_segment
      WITH SYNONYMS = ('tenant segment')
      COMMENT = 'Tenant segment (Strategic, Commercial, Emerging)',
    tenant.industry AS tenant.industry
      WITH SYNONYMS = ('tenant industry')
      COMMENT = 'Tenant industry',

    -- Renewal risk dimensions
    risk.region AS risk.region
      WITH SYNONYMS = ('risk region')
      COMMENT = 'Region from renewal risk',
    risk.segment AS risk.segment
      WITH SYNONYMS = ('risk segment')
      COMMENT = 'Segment from renewal risk',
    risk.risk_tier AS risk.risk_tier
      WITH SYNONYMS = ('risk tier', 'risk level', 'risk category')
      COMMENT = 'Risk classification tier (Critical, High, Medium, Low)',
    risk.top_risk_driver AS risk.top_risk_driver
      WITH SYNONYMS = ('risk driver', 'churn driver', 'risk reason')
      COMMENT = 'Primary driver of renewal risk',
    risk.recommended_action AS risk.recommended_action
      WITH SYNONYMS = ('recommended action', 'action', 'recommendation')
      COMMENT = 'AI-recommended action to mitigate risk',
    risk.risk_month AS risk.risk_month
      WITH SYNONYMS = ('risk month', 'assessment month')
      COMMENT = 'Month of the risk assessment',
    risk.account_id AS risk.account_id
      WITH SYNONYMS = ('risk account ID')
      COMMENT = 'Account ID from risk table',

    -- Support dimensions
    support.region AS support.region
      WITH SYNONYMS = ('support region')
      COMMENT = 'Region from support cases',
    support.segment AS support.segment
      WITH SYNONYMS = ('support segment')
      COMMENT = 'Segment from support cases',
    support.priority AS support.priority
      WITH SYNONYMS = ('priority', 'case priority', 'severity level')
      COMMENT = 'Support case priority (P1-P4)',
    support.customer_sentiment AS support.customer_sentiment
      WITH SYNONYMS = ('sentiment', 'customer sentiment', 'CSAT')
      COMMENT = 'Customer sentiment on the case (Positive, Neutral, Negative)',
    support.date AS support.date
      WITH SYNONYMS = ('support date', 'case date')
      COMMENT = 'Date the support case was created',
    support.incident_id AS support.incident_id
      WITH SYNONYMS = ('linked incident')
      COMMENT = 'Incident ID linked to the support case',
    support.account_id AS support.account_id
      WITH SYNONYMS = ('support account ID')
      COMMENT = 'Account from support case',

    -- Incident dimensions
    incident.incident_id AS incident.incident_id
      WITH SYNONYMS = ('incident ID')
      COMMENT = 'Incident identifier',
    incident.severity AS incident.severity
      WITH SYNONYMS = ('incident severity')
      COMMENT = 'Incident severity (SEV-1 through SEV-4)',
    incident.incident_category AS incident.incident_category
      WITH SYNONYMS = ('incident category', 'incident type')
      COMMENT = 'Category of the incident (Reliability, Latency, etc.)',
    incident.root_cause AS incident.root_cause
      WITH SYNONYMS = ('root cause', 'cause')
      COMMENT = 'Root cause of the incident',
    incident.region AS incident.region
      WITH SYNONYMS = ('incident region')
      COMMENT = 'Region affected by the incident',
    incident.incident_date AS incident.incident_date
      WITH SYNONYMS = ('incident date')
      COMMENT = 'Date of the incident',
    incident.customer_impact_level AS incident.customer_impact_level
      WITH SYNONYMS = ('customer impact', 'impact level')
      COMMENT = 'Customer impact level (Low, Medium, High)',

    -- Product dimensions
    product.product_name AS product.product_name
      WITH SYNONYMS = ('product name', 'product')
      COMMENT = 'Product display name',
    product.product_family AS product.product_family
      WITH SYNONYMS = ('product family', 'product category')
      COMMENT = 'Product family (Automation, Integration, Analytics, etc.)',
    product.criticality AS product.criticality
      WITH SYNONYMS = ('product criticality')
      COMMENT = 'Product criticality level',

    -- Usage dimensions
    usage.region AS usage.region
      WITH SYNONYMS = ('usage region')
      COMMENT = 'Region from usage data',
    usage.segment AS usage.segment
      WITH SYNONYMS = ('usage segment')
      COMMENT = 'Segment from usage data',
    usage.date AS usage.date
      WITH SYNONYMS = ('usage date')
      COMMENT = 'Date of usage measurement',

    -- Agent actions dimensions
    actions.region AS actions.region
      WITH SYNONYMS = ('action region')
      COMMENT = 'Region for agent actions',
    actions.segment AS actions.segment
      WITH SYNONYMS = ('action segment')
      COMMENT = 'Segment for agent actions',
    actions.recommendation AS actions.recommendation
      WITH SYNONYMS = ('action recommendation')
      COMMENT = 'Specific recommendation text',
    actions.approval_status AS actions.approval_status
      WITH SYNONYMS = ('approval status', 'approved')
      COMMENT = 'Whether the action was approved',
    actions.execution_status AS actions.execution_status
      WITH SYNONYMS = ('execution status', 'executed')
      COMMENT = 'Whether the action was executed',
    actions.workflow_name AS actions.workflow_name
      WITH SYNONYMS = ('workflow', 'workflow name')
      COMMENT = 'Name of the automated workflow',
    actions.date AS actions.date
      WITH SYNONYMS = ('action date')
      COMMENT = 'Date of the agent action'
  )

  -- =========================================================================
  -- METRICS
  -- =========================================================================
  METRICS (
    -- Revenue metrics
    rev.net_revenue_total AS SUM(rev.net_revenue)
      WITH SYNONYMS = ('total net revenue', 'revenue', 'total revenue')
      COMMENT = 'Total net revenue (SUM)',

    rev.gross_margin_total AS SUM(rev.gross_margin)
      WITH SYNONYMS = ('total gross margin', 'margin')
      COMMENT = 'Total gross margin (SUM)',

    rev.revenue_at_risk_total AS SUM(rev.revenue_at_risk)
      WITH SYNONYMS = ('total revenue at risk', 'revenue at risk', 'at-risk revenue')
      COMMENT = 'Total revenue at risk from daily revenue (SUM)',

    rev.expansion_arr_total AS SUM(rev.expansion_arr)
      WITH SYNONYMS = ('total expansion', 'expansion ARR', 'upsell total')
      COMMENT = 'Total expansion ARR (SUM)',

    rev.churned_arr_total AS SUM(rev.churned_arr)
      WITH SYNONYMS = ('total churned ARR', 'churn amount', 'lost ARR')
      COMMENT = 'Total churned ARR (SUM)',

    -- Renewal risk metrics
    risk.avg_renewal_risk_score AS AVG(risk.renewal_risk_score)
      WITH SYNONYMS = ('average risk score', 'avg renewal risk', 'mean risk score')
      COMMENT = 'Average renewal risk score (0-100)',

    risk.high_risk_account_count AS COUNT_IF(risk.risk_tier IN ('Critical', 'High'))
      WITH SYNONYMS = ('high risk accounts', 'critical accounts', 'at-risk account count')
      COMMENT = 'Count of accounts in Critical or High risk tiers',

    risk.avg_predicted_churn_probability AS AVG(risk.predicted_churn_probability)
      WITH SYNONYMS = ('average churn probability', 'avg churn rate', 'predicted churn')
      COMMENT = 'Average predicted churn probability',

    -- Support metrics
    support.support_case_count AS COUNT(support.case_id)
      WITH SYNONYMS = ('case count', 'support cases', 'ticket count', 'number of cases')
      COMMENT = 'Total support case count',

    support.sla_breach_count AS COUNT_IF(support.sla_breached_flag)
      WITH SYNONYMS = ('SLA breaches', 'breached SLAs', 'SLA violations')
      COMMENT = 'Count of SLA breaches',

    support.sla_breach_rate AS AVG(IFF(support.sla_breached_flag, 1.0, 0.0))
      WITH SYNONYMS = ('SLA breach rate', 'breach percentage')
      COMMENT = 'SLA breach rate (proportion of cases that breached SLA)',

    support.avg_resolution_hours AS AVG(support.resolution_hours)
      WITH SYNONYMS = ('average resolution time', 'mean time to resolve', 'MTTR')
      COMMENT = 'Average support case resolution time in hours',

    support.negative_sentiment_case_count AS COUNT_IF(support.customer_sentiment = 'Negative')
      WITH SYNONYMS = ('negative sentiment cases', 'unhappy customers', 'negative CSAT')
      COMMENT = 'Count of cases with negative customer sentiment',

    -- Usage metrics
    usage.avg_usage_score AS AVG(usage.usage_score)
      WITH SYNONYMS = ('average usage score', 'mean engagement', 'adoption score')
      COMMENT = 'Average product usage/engagement score',

    usage.usage_drop_day_count AS COUNT_IF(usage.usage_drop_flag)
      WITH SYNONYMS = ('usage drop days', 'declining usage days', 'drop count')
      COMMENT = 'Count of days with significant usage drop',

    -- Agent action metrics
    actions.expected_revenue_protected_total AS SUM(actions.expected_revenue_protected)
      WITH SYNONYMS = ('total expected protected revenue', 'expected savings')
      COMMENT = 'Total expected revenue protected by agent actions (SUM)',

    actions.actual_revenue_protected_total AS SUM(actions.actual_revenue_protected)
      WITH SYNONYMS = ('total actual protected revenue', 'actual savings', 'saved revenue', 'protected revenue')
      COMMENT = 'Total actual revenue protected after action execution (SUM)',

    -- Cross-entity count
    rev.account_count AS COUNT(DISTINCT rev.account_id)
      WITH SYNONYMS = ('number of accounts', 'account count', 'customer count')
      COMMENT = 'Distinct count of accounts'
  )

  COMMENT = 'Revenue Command Center semantic model for Cortex Analyst. Covers revenue performance, renewal risk, support quality, product usage, incidents, and AI-agent actions across all regions and segments.'

  AI_SQL_GENERATION 'When asked about revenue at risk, prefer the rev.revenue_at_risk_total metric from fact_revenue_daily. When asked about renewal risk or churn, use the risk table metrics. For SLA or support questions, use support table metrics. Region values are: West, East, Central, South. Segment values are: Enterprise, Mid-Market, SMB. Risk tier values are: Critical, High, Medium, Low. Current month means the most recent risk_month in the risk table.'

  AI_VERIFIED_QUERIES (
    q1_west_enterprise_risk AS (
      QUESTION 'Why did renewal risk increase for West Enterprise accounts this month?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST DIMENSIONS risk.region, risk.segment, risk.risk_month METRICS risk.avg_renewal_risk_score, risk.high_risk_account_count WHERE risk.region = ''West'' AND risk.segment = ''Enterprise'' AND risk.risk_month = DATE_TRUNC(''month'', CURRENT_DATE()))'
    ),
    q2_incident_affected_accounts AS (
      QUESTION 'Which accounts were most affected by the reliability incident?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST DIMENSIONS support.account_id, support.region, support.segment METRICS support.sla_breach_count, support.support_case_count WHERE support.incident_id = ''INC-0001'') ORDER BY SLA_BREACH_COUNT DESC LIMIT 20'
    ),
    q3_revenue_at_risk_sla AS (
      QUESTION 'How much revenue is at risk because of SLA breaches?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST DIMENSIONS rev.region, rev.segment METRICS rev.revenue_at_risk_total)'
    ),
    q4_recommended_actions_west AS (
      QUESTION 'Which recommended actions should the regional manager approve first?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST DIMENSIONS risk.recommended_action, risk.region METRICS risk.avg_renewal_risk_score, risk.high_risk_account_count WHERE risk.region = ''West'') ORDER BY HIGH_RISK_ACCOUNT_COUNT DESC'
    ),
    q5_agent_actions_protected_revenue AS (
      QUESTION 'Did approved agent actions reduce revenue at risk after the incident?'
      SQL 'SELECT * FROM SEMANTIC_VIEW(SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST DIMENSIONS actions.date METRICS actions.actual_revenue_protected_total WHERE actions.approval_status = ''Approved'') ORDER BY DATE'
    )
  )
;
