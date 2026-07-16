--------------------------------------------------------------------------------
-- 00_run.sql
-- Sprint 7 Governance: Orchestrator
-- Execute scripts in order. Idempotent (uses CREATE OR REPLACE / IF NOT EXISTS).
--
-- Prerequisites:
--   - Database SNOWFLAKE_REVENUE_CC and schema CORE exist (see 00_setup/)
--   - Data layer deployed (10_data/) with DIM_ACCOUNT populated
--   - Semantic view deployed (20_semantics/)
--------------------------------------------------------------------------------

-- 1. Roles and mapping table
!source 10_roles.sql

-- 2. Row access policy
!source 20_row_access_policy.sql

-- 3. Masking policy
!source 30_masking_policy.sql
