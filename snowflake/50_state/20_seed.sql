--------------------------------------------------------------------------------
-- 20_seed.sql
-- Seed operational-state tables with realistic sample data
-- Accounts referenced: ACC-00008 (West Enterprise), ACC-00016 (West Enterprise),
--   ACC-00003 (West Enterprise), ACC-00014 (West Enterprise)
-- These exist in DIM_ACCOUNT / ML_RENEWAL_RISK_FEATURES.
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

--------------------------------------------------------------------------------
-- SCENARIO_RUNS (4 rows)
--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- PREDICTION_FEEDBACK (5 rows)
--------------------------------------------------------------------------------
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

--------------------------------------------------------------------------------
-- AGENT_ACTION_WRITEBACK: intentionally empty (Sprint 6 populates)
--------------------------------------------------------------------------------
