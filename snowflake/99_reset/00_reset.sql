-- =============================================================================
-- Revenue Command Center — demo reset
-- Returns the operational + demo layer to a clean baseline so the golden path
-- can be re-run end to end. Safe + idempotent. Run as SYSADMIN (or a role with
-- ownership of the CORE schema objects).
--
-- Does NOT touch stable infrastructure: roles, row-access/masking policies,
-- the semantic view, search service, agent, or the ML model.
--
-- Usage:
--   snow sql -f snowflake/99_reset/00_reset.sql
-- =============================================================================
USE DATABASE SNOWFLAKE_REVENUE_CC;
USE SCHEMA CORE;
USE WAREHOUSE REVENUE_CC_WH;

-- 1) Clear session writeback so protected revenue returns to its baseline.
--    (GOLD_PROTECTED_REVENUE_ROLLUP = baseline + only Executed writeback rows.)
TRUNCATE TABLE IF EXISTS CORE.AGENT_ACTION_WRITEBACK;

-- 2) Re-seed the operational Hybrid Tables to their committed baseline.
--    Re-run the Sprint 5 seed (idempotent MERGE/INSERT patterns live there).
--    From the repo root:  snow sql -f snowflake/50_state/20_seed.sql
--    (kept as a separate file so the seed stays the single source of truth).

-- 3) Optional: drop the CoCo demo view so beat 9 rebuilds it live.
--    Comment out to keep the leaderboard between runs.
DROP VIEW IF EXISTS CORE.GOLD_REGION_SAVEPLAY_LEADERBOARD;

-- 4) Sanity check.
SELECT 'writeback_rows' AS metric, COUNT(*) AS value FROM CORE.AGENT_ACTION_WRITEBACK
UNION ALL SELECT 'scenario_runs', COUNT(*) FROM CORE.SCENARIO_RUNS
UNION ALL SELECT 'prediction_feedback', COUNT(*) FROM CORE.PREDICTION_FEEDBACK;
