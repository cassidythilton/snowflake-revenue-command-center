# Sprint 9 - CoCo Live Builder Evidence

## What was built

**GOLD_REGION_SAVEPLAY_LEADERBOARD** - a gold-layer analytic view summarizing renewal risk by region and segment. It surfaces:

- Account counts per region/segment
- Total revenue at risk
- Average renewal risk score
- Count of high-risk accounts
- Count of save-play recommendations

Source table: `fact_renewal_risk` (current month only).

## Why

Provides a single-query leaderboard for revenue leaders to identify which region/segment combinations need the most urgent save-play attention, without scanning the full renewal risk fact table.

## How to revert

```sql
DROP VIEW SNOWFLAKE_REVENUE_CC.CORE.GOLD_REGION_SAVEPLAY_LEADERBOARD;
```

This is purely additive. No existing objects were modified or replaced.
