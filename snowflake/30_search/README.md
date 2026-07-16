# 30_search — Cortex Search Layer

Adds unstructured knowledge retrieval to the Revenue Command Center via Snowflake Cortex Search.

## Objects Created

| Object | Type | Purpose |
|--------|------|---------|
| `KNOWLEDGE_DOCS` | Table | 75+ rows of business documents (postmortems, support notes, QBR summaries, playbooks, escalations) |
| `REVENUE_CC_SEARCH` | Cortex Search Service | Full-text semantic search over KNOWLEDGE_DOCS with attribute filtering |

## How to Run

```sql
-- From SnowSQL or Snowsight worksheet, in the snowflake/30_search/ directory:
!source '00_run.sql';
```

Or run each file individually in order: `10_knowledge_docs.sql`, then `20_search_service.sql`, then execute the grants from `00_run.sql`.

## Querying the Search Service

```sql
SELECT PARSE_JSON(
  SNOWFLAKE.CORTEX.SEARCH_PREVIEW(
    'SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_SEARCH',
    '{
      "query": "why did renewal risk increase for West Enterprise",
      "columns": ["TITLE", "DOC_TYPE", "ACCOUNT_NAME", "REGION"],
      "limit": 5
    }'
  )
);
```

## Corpus Design

The documents are weighted toward the West/Enterprise reliability incident narrative (INC-0001) to support the demo story: a West region platform outage drove SLA breaches and elevated renewal risk across 241 Enterprise accounts. The corpus enables an analyst to ask "why did renewal risk increase for West Enterprise this month and what should we do?" and receive grounded, citable answers spanning root cause, customer impact, and recommended save plays.
