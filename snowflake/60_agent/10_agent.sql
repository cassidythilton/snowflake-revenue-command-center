--------------------------------------------------------------------------------
-- 10_agent.sql
-- Creates the Revenue Command Center Cortex Agent — the shared reasoning core
-- that powers the "Cortex Workspace" tab (Snowflake Intelligence / CoWork).
-- Target: SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT
-- Role: SYSADMIN | Warehouse: REVENUE_CC_WH
--
-- Prereq: run 20_agent_tools.sql first (creates SCORE_RENEWAL_RISK and
-- PROPOSE_RETENTION_ACTION, the generic tools referenced below).
--
-- Tools (Predict -> Explain -> Act):
--   Analyst                  cortex_analyst_text_to_sql  -> REVENUE_CC_ANALYST
--   Search                   cortex_search               -> REVENUE_CC_SEARCH
--   Score_Renewal_Risk       generic (procedure)         -> SCORE_RENEWAL_RISK
--   Propose_Retention_Action generic (procedure)         -> PROPOSE_RETENTION_ACTION
--   data_to_chart            data_to_chart               -> (no resource)
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

CREATE OR REPLACE AGENT REVENUE_CC_AGENT
  COMMENT = 'Revenue Command Center shared reasoning agent – Cortex Analyst (metrics), Cortex Search (evidence), live ML renewal-risk scoring, and governed action proposals. Powers the Cortex Workspace tab in CoWork / Snowflake Intelligence.'
  PROFILE = '{"display_name": "Revenue Command Center Agent", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: claude-sonnet-4-5

  orchestration:
    budget:
      seconds: 90
      tokens: 24000

  instructions:
    response: >
      You are the revenue-retention analyst for the Revenue Command Center, serving
      revenue leaders inside Snowflake CoWork / Snowflake Intelligence.
      Work the Predict -> Explain -> Act loop and always show your evidence:
      (a) QUANTIFY with Analyst – revenue at risk, average renewal risk, high-risk
          account counts, SLA breaches – and prefer a chart (data_to_chart) when a
          trend or breakdown helps.
      (b) EXPLAIN WHY with Search – cite incident postmortems, support notes, and QBR
          summaries verbatim, naming each source (title, doc_type, date).
      (c) PREDICT with Score_Renewal_Risk when asked about a specific account's
          renewal risk – report probability, label, model version, and the top drivers.
      (d) ACT with Propose_Retention_Action to stage a concrete save play (drawn from
          the renewal playbooks found via Search) for human approval. Make clear that
          you are PROPOSING, not approving or executing – approval and any revenue
          writeback happen through the governed human-approval path, never by you.
      Keep answers concise and decision-oriented. Always cite the unstructured sources
      you used.
    orchestration: >
      Route by intent. For revenue metrics, risk scores, ARR, renewal rates, segment
      or region breakdowns, or account counts, use Analyst first. For root causes,
      incidents, support history, QBR notes, or playbook recommendations, use Search.
      For a single account's predicted renewal risk (e.g. "score ACC-00008" or "how
      risky is this account"), use Score_Renewal_Risk. When the user asks you to log,
      stage, draft, or recommend a save play / retention action for an account, use
      Propose_Retention_Action – but only after you have the quantitative risk (Analyst
      or Score_Renewal_Risk) and a playbook-grounded rationale (Search). Use data_to_chart
      to visualize Analyst results when it aids the decision. For compound questions,
      chain the tools.
    sample_questions:
      - question: "What is our total revenue at risk this quarter, by region?"
      - question: "Which Enterprise accounts in the West region have the highest renewal risk and why?"
      - question: "Score renewal risk for account ACC-00008 and explain the top drivers."
      - question: "Summarize recent incidents affecting high-ARR West accounts, recommend a save play, and stage it for approval."

  tools:
    - tool_spec:
        type: cortex_analyst_text_to_sql
        name: Analyst
        description: "Converts natural-language revenue/risk questions into SQL against the Revenue Command Center semantic model (accounts, ARR, renewal risk scores, SLA metrics, segments, regions)."
    - tool_spec:
        type: cortex_search
        name: Search
        description: "Searches unstructured Revenue Command Center documents – incident postmortems, support case notes, QBR summaries, and renewal playbooks – returning cited passages."
    - tool_spec:
        type: generic
        name: Score_Renewal_Risk
        description: "Predict: returns the live renewal-risk score for ONE account from the Snowflake Model Registry model – probability, High/Low label, ARR, top drivers, and model version. Use for a specific account_id (format ACC-#####). Do not use for portfolio aggregates (use Analyst for those)."
        input_schema:
          type: object
          properties:
            account_id:
              type: string
              description: "The account identifier to score, e.g. 'ACC-00008'."
          required:
            - account_id
    - tool_spec:
        type: generic
        name: Propose_Retention_Action
        description: "Act (governed): stages ONE retention recommendation for an account as a PROPOSED action awaiting human approval. This does NOT approve or execute anything and never moves protected revenue. Use only after quantifying risk and grounding the play in Search."
        input_schema:
          type: object
          properties:
            account_id:
              type: string
              description: "The account identifier, e.g. 'ACC-03221'."
            account_name:
              type: string
              description: "The account display name."
            region:
              type: string
              description: "The account's region (e.g. 'West', 'East')."
            recommendation:
              type: string
              description: "One concise save play to propose, grounded in the renewal playbooks."
          required:
            - account_id
            - account_name
            - region
            - recommendation
    - tool_spec:
        type: data_to_chart
        name: data_to_chart
        description: "Generates a chart from tabular data returned by the Analyst tool when a visualization aids the decision."

  tool_resources:
    Analyst:
      semantic_view: "SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST"
      execution_environment:
        type: "warehouse"
        warehouse: "REVENUE_CC_WH"
    Search:
      search_service: "SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_SEARCH"
      max_results: 5
      title_column: "TITLE"
      id_column: "DOC_ID"
    Score_Renewal_Risk:
      type: "procedure"
      identifier: "SNOWFLAKE_REVENUE_CC.CORE.SCORE_RENEWAL_RISK"
      execution_environment:
        type: "warehouse"
        warehouse: "REVENUE_CC_WH"
    Propose_Retention_Action:
      type: "procedure"
      identifier: "SNOWFLAKE_REVENUE_CC.CORE.PROPOSE_RETENTION_ACTION"
      execution_environment:
        type: "warehouse"
        warehouse: "REVENUE_CC_WH"
  $$;
