--------------------------------------------------------------------------------
-- 00_run.sql
-- Sprint 9 CoCo Live Builder: GOLD_REGION_SAVEPLAY_LEADERBOARD
-- Target: SNOWFLAKE_REVENUE_CC.CORE
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE DATABASE SNOWFLAKE_REVENUE_CC;
USE SCHEMA CORE;

CREATE OR REPLACE VIEW GOLD_REGION_SAVEPLAY_LEADERBOARD AS
SELECT
  r.region,
  r.segment,
  COUNT(DISTINCT r.account_id) AS account_count,
  ROUND(SUM(r.revenue_at_risk), 2) AS total_revenue_at_risk,
  ROUND(AVG(r.renewal_risk_score), 2) AS avg_renewal_risk_score,
  SUM(CASE WHEN r.risk_tier = 'High' THEN 1 ELSE 0 END) AS high_risk_accounts,
  SUM(CASE WHEN r.recommended_action = 'Renewal save play' THEN 1 ELSE 0 END) AS saveplay_recommendations
FROM fact_renewal_risk r
WHERE r.risk_month = DATE_TRUNC('MONTH', CURRENT_DATE())
GROUP BY r.region, r.segment
ORDER BY total_revenue_at_risk DESC;

-- Grants
GRANT SELECT ON VIEW SNOWFLAKE_REVENUE_CC.CORE.GOLD_REGION_SAVEPLAY_LEADERBOARD TO ROLE REVENUE_CC_READER;
GRANT SELECT ON VIEW SNOWFLAKE_REVENUE_CC.CORE.GOLD_REGION_SAVEPLAY_LEADERBOARD TO ROLE REVENUE_CC_READER_WEST;
GRANT SELECT ON VIEW SNOWFLAKE_REVENUE_CC.CORE.GOLD_REGION_SAVEPLAY_LEADERBOARD TO ROLE REVENUE_CC_READER_EAST;
