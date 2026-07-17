--------------------------------------------------------------------------------
-- 20_agent_tools.sql
-- Custom (generic) tools for the Revenue Command Center Cortex Agent.
-- These are the "Predict" and "Act" capabilities the CoWork / Snowflake
-- Intelligence agent calls in addition to Analyst (Explain) and Search (Why).
--
--   SCORE_RENEWAL_RISK(account_id)                     -> Predict : live ML score
--   PROPOSE_RETENTION_ACTION(account_id, name, region, -> Act     : stage a
--                            recommendation)                        PROPOSED action
--
-- Governance note: PROPOSE_RETENTION_ACTION only *stages* a recommendation
-- (APPROVAL_STATUS='Proposed', EXECUTION_STATUS='Pending'). It never approves
-- or executes. Human approval + revenue writeback stay on the separately
-- privileged REVENUE_CC_WRITER path (see 50_state/30_writeback_ops.sql), so the
-- agent can recommend but cannot self-approve or move protected revenue.
--
-- Procedure argument names are intentionally LLM-friendly because they surface
-- verbatim as the generic-tool input_schema property names in 10_agent.sql.
--
-- Target: SNOWFLAKE_REVENUE_CC.CORE | Role: SYSADMIN | Warehouse: REVENUE_CC_WH
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

--------------------------------------------------------------------------------
-- 1. SCORE_RENEWAL_RISK — single-account live inference (Predict)
--    Wraps the PREDICT_RENEWAL_RISK table function (Model Registry native
--    inference) into a single VARIANT result the agent can read and cite.
--------------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE SCORE_RENEWAL_RISK(account_id VARCHAR)
RETURNS VARIANT
LANGUAGE SQL
COMMENT = 'Predict: returns the live renewal-risk score (probability, label, ARR, drivers, model version) for one account via the Snowflake Model Registry model. Input: account_id like ''ACC-00008''.'
AS
$$
DECLARE
  v_result VARIANT;
  v_count  INTEGER;
BEGIN
  SELECT COUNT(*) INTO :v_count
    FROM TABLE(PREDICT_RENEWAL_RISK(:account_id));

  IF (v_count = 0) THEN
    RETURN OBJECT_CONSTRUCT(
      'status',     'not_found',
      'account_id', :account_id,
      'message',    'No feature row for that account in the latest risk month. Confirm the account_id (format ACC-#####).'
    );
  END IF;

  SELECT OBJECT_CONSTRUCT(
           'status',                     'ok',
           'account_id',                 ACCOUNT_ID,
           'region',                     REGION,
           'segment',                    SEGMENT,
           'industry',                   INDUSTRY,
           'annual_recurring_revenue',   ANNUAL_RECURRING_REVENUE,
           'predicted_risk_probability', PREDICTED_RISK_PROBABILITY,
           'predicted_label',            PREDICTED_LABEL,
           'predicted_class',            PREDICTED_CLASS,
           'model_version',              MODEL_VERSION,
           'drivers',                    OBJECT_CONSTRUCT(
             'cases_90d',            CASES_90D,
             'sla_breaches_90d',     SLA_BREACHES_90D,
             'negative_cases_90d',   NEGATIVE_CASES_90D,
             'avg_usage_score_90d',  AVG_USAGE_SCORE_90D,
             'usage_drop_days_90d',  USAGE_DROP_DAYS_90D
           )
         )
    INTO :v_result
    FROM TABLE(PREDICT_RENEWAL_RISK(:account_id))
   LIMIT 1;

  RETURN v_result;
END;
$$;

--------------------------------------------------------------------------------
-- 2. PROPOSE_RETENTION_ACTION — stage a recommendation for human approval (Act)
--    Inserts a PROPOSED / Pending row into AGENT_ACTION_WRITEBACK. Does NOT
--    approve or execute. The GOLD_PROTECTED_REVENUE_ROLLUP only counts
--    Approved+Executed rows, so a proposal never inflates protected revenue.
--------------------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE PROPOSE_RETENTION_ACTION(
  account_id     VARCHAR,
  account_name   VARCHAR,
  region         VARCHAR,
  recommendation VARCHAR
)
RETURNS VARIANT
LANGUAGE SQL
COMMENT = 'Act (governed): stages a retention recommendation for one account as a PROPOSED action awaiting human approval. Never approves or executes. Inputs: account_id, account_name, region, recommendation (one concise save play).'
AS
$$
DECLARE
  v_action_id STRING := 'ACT-' || LEFT(REPLACE(UUID_STRING(), '-', ''), 10);
BEGIN
  INSERT INTO AGENT_ACTION_WRITEBACK
    (ACTION_ID, ACCOUNT_ID, ACCOUNT_NAME, REGION, RECOMMENDATION,
     APPROVAL_STATUS, APPROVED_BY, EXECUTION_STATUS,
     ACTUAL_REVENUE_PROTECTED, COMPLETED_TS)
  VALUES
    (:v_action_id, :account_id, :account_name, :region, :recommendation,
     'Proposed', NULL, 'Pending',
     NULL, NULL);

  RETURN OBJECT_CONSTRUCT(
    'status',           'proposed',
    'action_id',        :v_action_id,
    'account_id',       :account_id,
    'account_name',     :account_name,
    'region',           :region,
    'recommendation',   :recommendation,
    'approval_status',  'Proposed',
    'execution_status', 'Pending',
    'note',             'Recommendation staged for human approval. Execution and revenue writeback happen only after approval via the governed REVENUE_CC_WRITER path.'
  );
END;
$$;

--------------------------------------------------------------------------------
-- 3. GRANTS — the agent runs the tools with owner's rights; callers need USAGE
--------------------------------------------------------------------------------
USE ROLE SECURITYADMIN;

GRANT USAGE ON PROCEDURE SNOWFLAKE_REVENUE_CC.CORE.SCORE_RENEWAL_RISK(VARCHAR)
  TO ROLE REVENUE_CC_READER;
GRANT USAGE ON PROCEDURE SNOWFLAKE_REVENUE_CC.CORE.PROPOSE_RETENTION_ACTION(VARCHAR, VARCHAR, VARCHAR, VARCHAR)
  TO ROLE REVENUE_CC_READER;

-- Writer inherits both (approval/execution stays a separate WRITER-only path).
GRANT USAGE ON PROCEDURE SNOWFLAKE_REVENUE_CC.CORE.SCORE_RENEWAL_RISK(VARCHAR)
  TO ROLE REVENUE_CC_WRITER;
GRANT USAGE ON PROCEDURE SNOWFLAKE_REVENUE_CC.CORE.PROPOSE_RETENTION_ACTION(VARCHAR, VARCHAR, VARCHAR, VARCHAR)
  TO ROLE REVENUE_CC_WRITER;

--------------------------------------------------------------------------------
-- 4. VALIDATION (commented — run manually)
--------------------------------------------------------------------------------
/*
CALL SNOWFLAKE_REVENUE_CC.CORE.SCORE_RENEWAL_RISK('ACC-00008');
CALL SNOWFLAKE_REVENUE_CC.CORE.PROPOSE_RETENTION_ACTION(
  'ACC-00008', 'Test Account 00008', 'West',
  'Executive escalation + multi-year commitment incentive within 30 days of renewal.');
SELECT * FROM AGENT_ACTION_WRITEBACK WHERE APPROVAL_STATUS = 'Proposed' ORDER BY CREATED_TS DESC;
*/
