# Snowflake ML Layer: Renewal Risk Classification

## Model Overview

| Property | Value |
|----------|-------|
| **Model Name** | `REVENUE_CC_RISK_MODEL` |
| **Model Version** | `10.0` |
| **Type** | `SNOWFLAKE.ML.CLASSIFICATION` (native gradient-boosted trees) |
| **Database/Schema** | `SNOWFLAKE_REVENUE_CC.CORE` |
| **Training Rows** | 96,000 (4,000 accounts x 24 months) |
| **Positive Class Rate** | 12.3% (11,809 high-risk rows) |
| **Owner** | `SYSADMIN` |

## Approach

The local environment has `snowflake-snowpark-python` but not `snowflake-ml-python` or `xgboost`/`scikit-learn`. Therefore this uses the **Snowflake-native ML Classification** (`CREATE SNOWFLAKE.ML.CLASSIFICATION`) which trains a gradient-boosted tree classifier entirely within the warehouse. This provides interactive single-row inference callable from SQL with no external dependencies.

## Target Definition

Binary label `IS_HIGH_RISK` defined as:

```
CASE WHEN risk_tier = 'High' OR predicted_churn_probability >= 0.5 THEN 1 ELSE 0 END
```

This combines the categorical risk tier from `FACT_RENEWAL_RISK` with the continuous churn probability threshold to identify accounts requiring proactive intervention.

## Features

| Feature | Description | Importance Rank | Score |
|---------|-------------|-----------------|-------|
| `ANNUAL_RECURRING_REVENUE` | Account ARR from dim_account | 1 | 0.343 |
| `AVG_USAGE_SCORE_90D` | Average product usage score (90-day window) | 2 | 0.340 |
| `CASES_90D` | Support cases opened in last 90 days | 3 | 0.112 |
| `NEGATIVE_CASES_90D` | Cases with negative sentiment (90d) | 4 | 0.070 |
| `SLA_BREACHES_90D` | SLA-breached cases (90d) | 5 | 0.067 |
| `INDUSTRY` | Account industry (categorical) | 6 | 0.036 |
| `REGION` | Account region (categorical) | 7 | 0.020 |
| `SEGMENT` | Account segment (categorical) | 8 | 0.013 |
| `USAGE_DROP_DAYS_90D` | Days with usage_drop_flag=TRUE (90d) | 9 | 0.000 |

## Files

| File | Purpose |
|------|---------|
| `00_run.sql` | Orchestrator / validation script |
| `10_features.sql` | Creates `ML_RENEWAL_RISK_FEATURES` table (join of fact_renewal_risk + dim_account + 90d aggregates) |
| `20_train_register.sql` | Creates training view and trains `REVENUE_CC_RISK_MODEL` |
| `30_inference.sql` | Creates `PREDICT_RENEWAL_RISK(account_id)` table function + grants |

## Single-Account Inference SQL (Code Engine Bridge)

The exact call the Domo Code Engine bridge should execute via the SQL API:

```sql
SELECT * FROM TABLE(SNOWFLAKE_REVENUE_CC.CORE.PREDICT_RENEWAL_RISK('ACC-00008'));
```

This returns a single row with columns:
- `ACCOUNT_ID`, `REGION`, `SEGMENT`, `INDUSTRY`
- `ANNUAL_RECURRING_REVENUE`, `CASES_90D`, `SLA_BREACHES_90D`, `NEGATIVE_CASES_90D`, `AVG_USAGE_SCORE_90D`, `USAGE_DROP_DAYS_90D`
- `PREDICTED_CLASS` (0 or 1)
- `PREDICTED_RISK_PROBABILITY` (0.0 to 1.0)
- `PREDICTED_LABEL` ("High Risk" or "Low Risk")
- `MODEL_VERSION` ("10.0")

## Validation Results

| Account | Region | Segment | P(High Risk) | Predicted | Actual | Latency |
|---------|--------|---------|--------------|-----------|--------|---------|
| ACC-00008 | West | Enterprise | 0.9989 | High Risk | 1 | ~3.4s |
| ACC-00016 | West | Enterprise | 0.9988 | High Risk | 1 | ~3.8s |
| ACC-00000 | South | SMB | 0.1042 | Low Risk | 0 | ~3.4s |

Latency is interactive (3-4 seconds on XSMALL warehouse, includes cold-start overhead).

## Grants Applied

- `USAGE ON FUNCTION PREDICT_RENEWAL_RISK(VARCHAR)` granted to `REVENUE_CC_READER`
- `SELECT ON TABLE ML_RENEWAL_RISK_FEATURES` granted to `REVENUE_CC_READER`
- The function runs with owner's rights (`SYSADMIN`), which has access to the ML model instance

## Retraining

To retrain after data refresh:

```sql
USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Refresh features
-- (re-run 10_features.sql)

-- Retrain
DROP SNOWFLAKE.ML.CLASSIFICATION IF EXISTS REVENUE_CC_RISK_MODEL;
CREATE SNOWFLAKE.ML.CLASSIFICATION REVENUE_CC_RISK_MODEL(
    INPUT_DATA => SYSTEM$REFERENCE('VIEW', 'ML_RENEWAL_RISK_TRAINING'),
    TARGET_COLNAME => 'IS_HIGH_RISK'
);

-- Update MODEL_VERSION in the function if needed
```
