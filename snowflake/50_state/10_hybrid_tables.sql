--------------------------------------------------------------------------------
-- 10_hybrid_tables.sql
-- Operational-state layer: Hybrid Tables for the Revenue Command Center
-- Target: SNOWFLAKE_REVENUE_CC.CORE
-- Prerequisites: 00_setup deployed (database, schema, roles exist)
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

--------------------------------------------------------------------------------
-- 1. SCENARIO_RUNS — what-if / accepted-prediction scenarios
--------------------------------------------------------------------------------
CREATE OR REPLACE HYBRID TABLE SCENARIO_RUNS (
    SCENARIO_ID                 STRING      DEFAULT UUID_STRING()   PRIMARY KEY,
    CREATED_TS                  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    CREATED_BY                  STRING,
    ACCOUNT_ID                  STRING,
    ACCOUNT_NAME                STRING,
    REGION                      STRING,
    SEGMENT                     STRING,
    SCENARIO_NAME               STRING,
    PREDICTED_RISK_PROBABILITY  DOUBLE,
    ASSUMPTION_NOTES            STRING,
    PROJECTED_REVENUE_AT_RISK   DOUBLE,
    STATUS                      STRING      DEFAULT 'Open',
    INDEX idx_scenario_account (ACCOUNT_ID)
);

--------------------------------------------------------------------------------
-- 2. PREDICTION_FEEDBACK — human feedback on model predictions
--------------------------------------------------------------------------------
CREATE OR REPLACE HYBRID TABLE PREDICTION_FEEDBACK (
    FEEDBACK_ID                 STRING      DEFAULT UUID_STRING()   PRIMARY KEY,
    CREATED_TS                  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    CREATED_BY                  STRING,
    ACCOUNT_ID                  STRING,
    MODEL_VERSION               STRING,
    PREDICTED_RISK_PROBABILITY  DOUBLE,
    HUMAN_VERDICT               STRING,
    CORRECTED_LABEL             STRING,
    COMMENT                     STRING,
    INDEX idx_feedback_account (ACCOUNT_ID)
);

--------------------------------------------------------------------------------
-- 3. AGENT_ACTION_WRITEBACK — approved agent action results (Sprint 6)
--------------------------------------------------------------------------------
CREATE OR REPLACE HYBRID TABLE AGENT_ACTION_WRITEBACK (
    WRITEBACK_ID                STRING      DEFAULT UUID_STRING()   PRIMARY KEY,
    CREATED_TS                  TIMESTAMP_NTZ DEFAULT CURRENT_TIMESTAMP(),
    ACTION_ID                   STRING,
    ACCOUNT_ID                  STRING,
    ACCOUNT_NAME                STRING,
    REGION                      STRING,
    RECOMMENDATION              STRING,
    APPROVAL_STATUS             STRING,
    APPROVED_BY                 STRING,
    EXECUTION_STATUS            STRING      DEFAULT 'Pending',
    ACTUAL_REVENUE_PROTECTED    DOUBLE,
    COMPLETED_TS                TIMESTAMP_NTZ,
    INDEX idx_writeback_account (ACCOUNT_ID)
);
