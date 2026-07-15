--------------------------------------------------------------------------------
-- 10_agent.sql
-- Creates the Revenue Command Center Cortex Agent.
-- Target: SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_AGENT
-- Role: SYSADMIN | Warehouse: REVENUE_CC_WH
--------------------------------------------------------------------------------

USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

CREATE OR REPLACE AGENT REVENUE_CC_AGENT
  COMMENT = 'Revenue Command Center shared reasoning agent – bundles Cortex Analyst (structured metrics) and Cortex Search (unstructured docs) for revenue-retention analysis.'
  PROFILE = '{"display_name": "Revenue Command Center Agent", "color": "blue"}'
  FROM SPECIFICATION
  $$
  models:
    orchestration: claude-sonnet-4-5

  orchestration:
    budget:
      seconds: 60
      tokens: 16000

  instructions:
    response: >
      You are a revenue-retention analyst for the Revenue Command Center.
      When answering a risk or renewal question:
      (a) Use Analyst to quantify the risk – revenue at risk, average renewal risk score, high-risk account count, SLA breaches.
      (b) Use Search to explain WHY – citing incident postmortems, support notes, and QBR summaries verbatim with source titles.
      (c) Recommend concrete save plays drawn from the renewal playbooks found via Search.
      Always cite unstructured sources you used (title, doc_type, date).
      Keep answers concise and decision-oriented for a revenue leader.
    orchestration: >
      For any question involving revenue metrics, risk scores, ARR, renewal rates, or account counts use the Analyst tool first.
      For any question involving root causes, incidents, support history, QBR notes, or playbook recommendations use the Search tool.
      For compound questions use both tools.
    sample_questions:
      - question: "What is our total revenue at risk this quarter?"
      - question: "Which Enterprise accounts in the West region have the highest renewal risk and why?"
      - question: "Summarize recent incidents affecting high-ARR accounts and recommend save plays."

  tools:
    - tool_spec:
        type: cortex_analyst_text_to_sql
        name: Analyst
        description: "Converts natural-language revenue/risk questions into SQL against the Revenue Command Center data model (accounts, ARR, renewal risk scores, SLA metrics, segments, regions)."
    - tool_spec:
        type: cortex_search
        name: Search
        description: "Searches unstructured Revenue Command Center documents – incident postmortems, support case notes, QBR summaries, and renewal playbooks – returning cited passages."

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
  $$;
