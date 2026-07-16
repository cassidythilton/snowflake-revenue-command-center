# Revenue Command Center - Semantic View (C1 Deliverable)

## Overview

The `SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST` semantic view is the governed metric layer for the Revenue Command Center. It enables Cortex Analyst to answer natural-language questions about revenue performance, renewal risk, support quality, product usage, incidents, and AI-agent interventions.

## How It Works

### Cortex Analyst Integration
Cortex Analyst uses the semantic view definition (tables, relationships, dimensions, metrics, synonyms, and verified queries) to translate natural-language questions into SQL. No separate YAML model file is required when using semantic views - the semantic view IS the model.

### Querying
Query the semantic view using the `SEMANTIC_VIEW()` clause in a `FROM` statement:

```sql
SELECT *
FROM SEMANTIC_VIEW(
  SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST
  DIMENSIONS risk.region, risk.segment
  METRICS risk.avg_renewal_risk_score, risk.high_risk_account_count
  WHERE risk.region = 'West'
);
```

Key rules:
- Specify `METRICS` or `FACTS` (not both) plus optional `DIMENSIONS` and `WHERE`
- Results are automatically grouped by dimensions
- Column order in results follows the clause order (DIMENSIONS first or METRICS first)

## Logical Tables

| Alias | Physical Table | Description |
|-------|---------------|-------------|
| acct | dim_account | Customer accounts with ARR, health, renewal dates |
| tenant | dim_tenant | Multi-tenant organizations |
| product | dim_product | Product catalog |
| rev | fact_revenue_daily | Daily revenue grain (ARR, bookings, margin, risk) |
| risk | fact_renewal_risk | Monthly renewal risk assessments |
| support | fact_support_cases | Support cases with SLA and sentiment |
| usage | fact_product_usage_daily | Daily product usage metrics |
| incident | fact_incidents | Product incidents and outages |
| actions | fact_agent_actions | AI agent recommendations and outcomes |

## Metrics Catalog

| Metric | Table | Aggregation | Synonyms |
|--------|-------|-------------|----------|
| net_revenue_total | rev | SUM | revenue, total revenue |
| gross_margin_total | rev | SUM | margin |
| revenue_at_risk_total | rev | SUM | revenue at risk |
| expansion_arr_total | rev | SUM | expansion ARR, upsell |
| churned_arr_total | rev | SUM | churned ARR, churn amount |
| avg_renewal_risk_score | risk | AVG | average risk score |
| high_risk_account_count | risk | COUNT_IF | high risk accounts |
| avg_predicted_churn_probability | risk | AVG | churn probability |
| support_case_count | support | COUNT | case count, tickets |
| sla_breach_count | support | SUM | SLA breaches |
| sla_breach_rate | support | AVG | breach percentage |
| avg_resolution_hours | support | AVG | MTTR |
| negative_sentiment_case_count | support | COUNT_IF | negative sentiment |
| avg_usage_score | usage | AVG | engagement score |
| usage_drop_day_count | usage | SUM | declining usage days |
| expected_revenue_protected_total | actions | SUM | expected savings |
| actual_revenue_protected_total | actions | SUM | protected revenue |
| account_count | rev | COUNT DISTINCT | customer count |

## Dimensions Catalog

| Category | Key Dimensions |
|----------|---------------|
| Geography | region (West, East, Central, South) |
| Segmentation | segment (Enterprise, Mid-Market, SMB), industry |
| Time | date, fiscal_year, quarter, fiscal_period, risk_month |
| Risk | risk_tier, top_risk_driver, recommended_action |
| Support | priority, customer_sentiment, incident_id |
| Incident | severity, incident_category, root_cause |
| Product | product_name, product_family, criticality |
| Actions | approval_status, execution_status, workflow_name |

## Verified Queries (5 Business Questions)

1. **Why did renewal risk increase for West Enterprise accounts?** - avg_renewal_risk_score + high_risk_account_count by region/segment/month
2. **Which accounts were most affected by the reliability incident?** - SLA breaches by account for INC-0001
3. **How much revenue is at risk from SLA breaches?** - revenue_at_risk_total by region/segment
4. **Which actions should the West manager approve first?** - risk metrics by recommended_action
5. **Did agent actions reduce revenue at risk?** - actual_revenue_protected by date

## Limitations and Notes

- **No YAML export needed**: Semantic views replace the legacy YAML semantic model for Cortex Analyst. The `AI_SQL_GENERATION` and `AI_VERIFIED_QUERIES` clauses provide the same guidance that YAML files previously offered.
- **Row-level security**: The semantic view does not enforce RLS directly. Apply row access policies on the underlying tables or use `CURRENT_ROLE()` / session context for persona-based filtering.
- **Cortex Analyst access**: Grant `SELECT` on the semantic view to roles that should use Cortex Analyst with this model.
- **Window function metrics**: Not yet defined; add as needed for period-over-period comparisons.

## Deployment

```sql
-- Run as SYSADMIN
USE ROLE SYSADMIN;
USE WAREHOUSE REVENUE_CC_WH;
USE SCHEMA SNOWFLAKE_REVENUE_CC.CORE;

-- Deploy semantic view
@snowflake/20_semantics/10_semantic_view.sql

-- Validate with verified queries
@snowflake/20_semantics/20_verified_queries.sql
```
