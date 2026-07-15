--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrator for the ML layer
-- Run these scripts in order to build the full ML pipeline.
-- Prerequisites: 00_setup and 10_data must be deployed first.
--------------------------------------------------------------------------------

-- Step 1: Build the feature/label table
-- !source 10_features.sql
-- (Or run manually in Snowsight / SnowSQL)

-- Step 2: Train and register the classification model
-- !source 20_train_register.sql

-- Step 3: Create the inference function and apply grants
-- !source 30_inference.sql

--------------------------------------------------------------------------------
-- Quick validation after deployment:
--------------------------------------------------------------------------------
USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Verify model exists
SHOW SNOWFLAKE.ML.CLASSIFICATION;

-- Score a single account (West Enterprise high-risk)
SELECT * FROM TABLE(PREDICT_RENEWAL_RISK('ACC-00008'));

-- Score a low-risk account
SELECT * FROM TABLE(PREDICT_RENEWAL_RISK('ACC-00000'));
