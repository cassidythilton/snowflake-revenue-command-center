--------------------------------------------------------------------------------
-- 00_run.sql
-- Orchestrator: create hybrid tables, apply grants, seed data
-- Run as SYSADMIN (table creation) then SECURITYADMIN (grants).
-- Prerequisites: 00_setup deployed.
--------------------------------------------------------------------------------

-- ============================================================================
-- STEP 1: Create hybrid tables
-- ============================================================================
-- !source 10_hybrid_tables.sql

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- 1. SCENARIO_RUNS
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

-- 2. PREDICTION_FEEDBACK
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

-- 3. AGENT_ACTION_WRITEBACK
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

-- ============================================================================
-- STEP 2: Grants (least-privilege)
-- ============================================================================
USE ROLE SECURITYADMIN;

-- REVENUE_CC_WRITER: full DML on state tables
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE SNOWFLAKE_REVENUE_CC.CORE.SCENARIO_RUNS
    TO ROLE REVENUE_CC_WRITER;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE SNOWFLAKE_REVENUE_CC.CORE.PREDICTION_FEEDBACK
    TO ROLE REVENUE_CC_WRITER;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE SNOWFLAKE_REVENUE_CC.CORE.AGENT_ACTION_WRITEBACK
    TO ROLE REVENUE_CC_WRITER;

-- REVENUE_CC_READER: read-only on state tables
GRANT SELECT ON TABLE SNOWFLAKE_REVENUE_CC.CORE.SCENARIO_RUNS
    TO ROLE REVENUE_CC_READER;
GRANT SELECT ON TABLE SNOWFLAKE_REVENUE_CC.CORE.PREDICTION_FEEDBACK
    TO ROLE REVENUE_CC_READER;
GRANT SELECT ON TABLE SNOWFLAKE_REVENUE_CC.CORE.AGENT_ACTION_WRITEBACK
    TO ROLE REVENUE_CC_READER;

-- ============================================================================
-- STEP 3: Seed data
-- ============================================================================
-- !source 20_seed.sql

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Seed SCENARIO_RUNS (4 rows)
INSERT INTO SCENARIO_RUNS
    (CREATED_BY, ACCOUNT_ID, ACCOUNT_NAME, REGION, SEGMENT,
     SCENARIO_NAME, PREDICTED_RISK_PROBABILITY, ASSUMPTION_NOTES,
     PROJECTED_REVENUE_AT_RISK, STATUS)
VALUES
    ('west.manager@demo.local', 'ACC-00008', 'Harbor Networks 8', 'West', 'Enterprise',
     'Delayed renewal - budget freeze', 0.78,
     'Customer indicated budget freeze through Q3; assume 60-day delay.',
     420000, 'Open'),
    ('west.manager@demo.local', 'ACC-00016', 'Cobalt Holdings 16', 'West', 'Enterprise',
     'Competitor displacement risk', 0.65,
     'Competitor POC confirmed by champion; engagement declining.',
     310000, 'Under Review'),
    ('owner.west@demo.local', 'ACC-00003', 'Delta Partners 3', 'West', 'Enterprise',
     'Executive sponsor departure', 0.72,
     'VP Data left the company; new sponsor TBD. Risk of re-evaluation.',
     540000, 'Open'),
    ('exec@demo.local', 'ACC-00014', 'Evergreen Industries 14', 'West', 'Enterprise',
     'Product gap - missing governance module', 0.55,
     'Customer requires Raptor Governance GA before renewal; currently in preview.',
     275000, 'Accepted');

-- Seed PREDICTION_FEEDBACK (5 rows)
INSERT INTO PREDICTION_FEEDBACK
    (CREATED_BY, ACCOUNT_ID, MODEL_VERSION,
     PREDICTED_RISK_PROBABILITY, HUMAN_VERDICT, CORRECTED_LABEL, COMMENT)
VALUES
    ('west.manager@demo.local', 'ACC-00008', 'v1.0-2026-06',
     0.78, 'Agree', 'High Risk',
     'Model correctly identified risk; budget freeze confirmed via CSM notes.'),
    ('west.manager@demo.local', 'ACC-00016', 'v1.0-2026-06',
     0.65, 'Agree', 'Medium Risk',
     'Competitor POC real but champion still engaged — medium, not high.'),
    ('owner.west@demo.local', 'ACC-00003', 'v1.0-2026-06',
     0.72, 'Disagree', 'Low Risk',
     'New VP already onboarded and is a prior Snowflake customer. Risk overstated.'),
    ('exec@demo.local', 'ACC-00014', 'v1.0-2026-06',
     0.55, 'Unsure', NULL,
     'Governance module on roadmap for Q4. Outcome depends on release timing.'),
    ('east.manager@demo.local', 'ACC-00008', 'v1.0-2026-06',
     0.78, 'Agree', 'High Risk',
     'Cross-regional review concurs with West assessment.');

-- ============================================================================
-- STEP 4: Validation
-- ============================================================================
SELECT 'SCENARIO_RUNS' AS table_name, COUNT(*) AS row_count FROM SCENARIO_RUNS
UNION ALL
SELECT 'PREDICTION_FEEDBACK', COUNT(*) FROM PREDICTION_FEEDBACK
UNION ALL
SELECT 'AGENT_ACTION_WRITEBACK', COUNT(*) FROM AGENT_ACTION_WRITEBACK;
