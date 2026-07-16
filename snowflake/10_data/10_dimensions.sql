--------------------------------------------------------------------------------
-- 10_dimensions.sql
-- Snowflake-native dimension tables for Revenue Command Center
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

CREATE OR REPLACE TABLE dim_tenant AS
SELECT * FROM VALUES
  ('TEN-001', 'Asteria Retail Group', 'Strategic', 'Retail', TRUE),
  ('TEN-002', 'Northstar Financial', 'Strategic', 'Financial Services', TRUE),
  ('TEN-003', 'Helio Manufacturing', 'Commercial', 'Manufacturing', TRUE),
  ('TEN-004', 'Summit Health Network', 'Commercial', 'Healthcare', TRUE),
  ('TEN-005', 'Bluebird Logistics', 'Emerging', 'Transportation', TRUE),
  ('TEN-006', 'Canyon Software', 'Emerging', 'Technology', TRUE)
AS t(tenant_id, tenant_name, tenant_segment, industry, active_flag);

CREATE OR REPLACE TABLE dim_product AS
SELECT * FROM VALUES
  ('PROD-001', 'Raptor Workflow Engine', 'Automation', 'Critical', DATEADD(day, -900, CURRENT_DATE())),
  ('PROD-002', 'Raptor Data Sync', 'Integration', 'Critical', DATEADD(day, -820, CURRENT_DATE())),
  ('PROD-003', 'Raptor Insights', 'Analytics', 'High', DATEADD(day, -760, CURRENT_DATE())),
  ('PROD-004', 'Raptor Mobile', 'Experience', 'Medium', DATEADD(day, -680, CURRENT_DATE())),
  ('PROD-005', 'Raptor Alerts', 'Automation', 'High', DATEADD(day, -620, CURRENT_DATE())),
  ('PROD-006', 'Raptor Forecast', 'AI', 'High', DATEADD(day, -540, CURRENT_DATE())),
  ('PROD-007', 'Raptor Connectors', 'Integration', 'Critical', DATEADD(day, -500, CURRENT_DATE())),
  ('PROD-008', 'Raptor Governance', 'Security', 'High', DATEADD(day, -460, CURRENT_DATE())),
  ('PROD-009', 'Raptor Pages', 'Experience', 'Medium', DATEADD(day, -390, CURRENT_DATE())),
  ('PROD-010', 'Raptor Copilot', 'AI', 'High', DATEADD(day, -270, CURRENT_DATE()))
AS t(product_id, product_name, product_family, criticality, launch_date);

CREATE OR REPLACE TABLE dim_user_entitlement AS
SELECT * FROM VALUES
  ('exec@demo.local', 'Executive Sponsor', 'Executive Sponsor', NULL, NULL, NULL, 'ALL'),
  ('admin@demo.local', 'Data Platform Admin', 'Data Platform Admin', NULL, NULL, NULL, 'ALL'),
  ('west.manager@demo.local', 'West Regional Manager', 'Regional Manager', NULL, 'West', NULL, 'REGION'),
  ('east.manager@demo.local', 'East Regional Manager', 'Regional Manager', NULL, 'East', NULL, 'REGION'),
  ('central.manager@demo.local', 'Central Regional Manager', 'Regional Manager', NULL, 'Central', NULL, 'REGION'),
  ('south.manager@demo.local', 'South Regional Manager', 'Regional Manager', NULL, 'South', NULL, 'REGION'),
  ('owner.west@demo.local', 'West Account Owner', 'Account Owner', NULL, 'West', 'OWN-WEST-01', 'OWNER'),
  ('owner.east@demo.local', 'East Account Owner', 'Account Owner', NULL, 'East', 'OWN-EAST-01', 'OWNER'),
  ('tenant.asteria@demo.local', 'Asteria Tenant Admin', 'Tenant Admin', 'TEN-001', NULL, NULL, 'TENANT'),
  ('tenant.northstar@demo.local', 'Northstar Tenant Admin', 'Tenant Admin', 'TEN-002', NULL, NULL, 'TENANT')
AS t(user_key, display_name, persona, tenant_id, region, account_owner_id, access_level);

CREATE OR REPLACE TABLE dim_account AS
WITH base AS (
  SELECT ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1 AS account_idx
  FROM TABLE(GENERATOR(ROWCOUNT => 4000))
),
shaped AS (
  SELECT
    account_idx,
    MOD(account_idx, 6) + 1 AS tenant_num,
    CASE
      WHEN MOD(ABS(HASH(account_idx, 'region')), 100) < 35 THEN 'West'
      WHEN MOD(ABS(HASH(account_idx, 'region')), 100) < 60 THEN 'East'
      WHEN MOD(ABS(HASH(account_idx, 'region')), 100) < 80 THEN 'Central'
      ELSE 'South'
    END AS region,
    CASE
      WHEN MOD(ABS(HASH(account_idx, 'segment')), 100) < 18 THEN 'Enterprise'
      WHEN MOD(ABS(HASH(account_idx, 'segment')), 100) < 60 THEN 'Mid-Market'
      ELSE 'SMB'
    END AS segment,
    GET(ARRAY_CONSTRUCT('Retail', 'Financial Services', 'Manufacturing', 'Healthcare', 'Transportation', 'Technology'), MOD(ABS(HASH(account_idx, 'industry')), 6))::VARCHAR AS industry,
    GET(ARRAY_CONSTRUCT('Acme', 'Beacon', 'Cobalt', 'Delta', 'Evergreen', 'Frontier', 'Granite', 'Harbor', 'Ion', 'Juniper'), MOD(account_idx, 10))::VARCHAR AS prefix,
    GET(ARRAY_CONSTRUCT('Analytics', 'Systems', 'Holdings', 'Partners', 'Group', 'Labs', 'Industries', 'Networks'), MOD(ABS(HASH(account_idx, 'suffix')), 8))::VARCHAR AS suffix
  FROM base
)
SELECT
  'ACC-' || LPAD(CAST(account_idx AS VARCHAR), 5, '0') AS account_id,
  'TEN-' || LPAD(CAST(tenant_num AS VARCHAR), 3, '0') AS tenant_id,
  prefix || ' ' || suffix || ' ' || CAST(account_idx AS VARCHAR) AS account_name,
  region,
  segment,
  industry,
  'OWN-' || UPPER(region) || '-' || LPAD(CAST(MOD(account_idx, 12) + 1 AS VARCHAR), 2, '0') AS account_owner_id,
  region || ' Owner ' || LPAD(CAST(MOD(account_idx, 12) + 1 AS VARCHAR), 2, '0') AS account_owner_name,
  CAST(
    CASE segment
      WHEN 'Enterprise' THEN 180000 + MOD(ABS(HASH(account_idx, 'arr')), 1200000)
      WHEN 'Mid-Market' THEN 35000 + MOD(ABS(HASH(account_idx, 'arr')), 180000)
      ELSE 5000 + MOD(ABS(HASH(account_idx, 'arr')), 45000)
    END AS DOUBLE
  ) AS annual_recurring_revenue,
  DATEADD(day, -(365 + MOD(ABS(HASH(account_idx, 'contract')), 1095)), CURRENT_DATE()) AS contract_start_date,
  DATEADD(day, 15 + MOD(ABS(HASH(account_idx, 'renewal')), 365), CURRENT_DATE()) AS renewal_date,
  DATEADD(day, -(365 + MOD(ABS(HASH(account_idx, 'since')), 1825)), CURRENT_DATE()) AS customer_since_date,
  CASE
    WHEN region = 'West' AND segment = 'Enterprise' THEN 'Watch'
    WHEN MOD(ABS(HASH(account_idx, 'health')), 100) < 15 THEN 'At Risk'
    WHEN MOD(ABS(HASH(account_idx, 'health')), 100) < 70 THEN 'Healthy'
    ELSE 'Growth'
  END AS health_tier,
  TRUE AS active_flag
FROM shaped;
