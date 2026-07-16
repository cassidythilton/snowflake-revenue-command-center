# Sprint 1 Synthetic Data Generation Spec

## Output Location

Catalog: `databricks_raptor`  
Schema: `pattern4_agent_automation`  
SQL warehouse for validation: `Main SQL Warehouse` (`ea829ba58bcae093`)

No data should be generated or written until this spec is approved.

## Business Story

The demo represents a B2B customer operations and revenue command center. A product reliability incident hits West region enterprise customers. Support case volume spikes, SLA breaches increase, product usage drops, renewal risk rises, and forecasted revenue at risk grows. A Domo agent asks Genie for root cause and affected accounts, recommends retention actions, routes human approval, and writes action status back for dashboard tracking.

This story supports the Pattern 4 and agent-to-agent demo:

- Domo shows curated executive dashboards over Databricks-governed data.
- Genie answers live root-cause questions over the same governed data.
- Domo Agent Catalyst / Workflows turn the insight into approved business action.
- UC row filters and Domo PDP can scope users by region, tenant, or account ownership.

## Generation Approach

Use a hybrid method:

- Generate the governed data in Databricks using Spark-scale patterns with deterministic seeds.
- Use Faker-style values only for names, companies, people, products, and descriptive text.
- Follow Domo data-generator conventions for entity pools, cross-dataset IDs, shared dimensions, daily grain, and card-friendly fields.
- Keep data non-uniform: skewed ARR, seasonal usage, regional imbalance, incident spikes, and remediation effects.
- Write curated Delta tables in `databricks_raptor.pattern4_agent_automation`.

Recommended implementation pattern:

- Use Databricks SQL / Spark jobs or Databricks Connect if available.
- Create parent dimensions first, then fact tables with valid foreign keys.
- Use deterministic IDs and fixed seed values so the demo can be regenerated.
- Avoid driver-side collection for large tables.

## Demo Personas and Entitlements

Initial persona model for UC row filters and Domo PDP:

| Persona | Email / Key | Scope | Purpose |
| --- | --- | --- | --- |
| Executive Sponsor | `exec@demo.local` | All tenants and regions | Shows full executive command center. |
| West Regional Manager | `west.manager@demo.local` | Region = `West` | Shows incident-affected region. |
| East Regional Manager | `east.manager@demo.local` | Region = `East` | Shows unaffected control region. |
| Account Owner | `owner.west@demo.local` | Assigned West accounts | Receives workflow actions. |
| Data Platform Admin | `admin@demo.local` | All rows | Explains governance and lineage. |

The initial row-scope fields should be:

- `tenant_id`
- `region`
- `account_owner_id`

## Core Tables

### `dim_tenant`

Purpose: Supports multi-tenant / portal isolation demo.

Rows: 6

Columns:

- `tenant_id`
- `tenant_name`
- `tenant_segment`
- `industry`
- `active_flag`

Distribution notes:

- 2 strategic tenants, 2 commercial tenants, 2 emerging tenants.
- Strategic tenants should account for most ARR.

### `dim_account`

Purpose: Customer master table for revenue, usage, support, renewal risk, and actions.

Rows: 4,000

Columns:

- `account_id`
- `tenant_id`
- `account_name`
- `region`
- `segment`
- `industry`
- `account_owner_id`
- `account_owner_name`
- `annual_recurring_revenue`
- `contract_start_date`
- `renewal_date`
- `customer_since_date`
- `health_tier`
- `active_flag`

Distribution notes:

- Region skew: West 35%, East 25%, Central 20%, South 20%.
- Segment skew: Enterprise 18%, Mid-Market 42%, SMB 40%.
- ARR should be log-normal; Enterprise accounts represent a minority of accounts but majority of ARR.
- West Enterprise accounts should have higher post-incident risk.

### `dim_user_entitlement`

Purpose: Shared entitlement model for UC row filters and Domo PDP.

Rows: 20-50

Columns:

- `user_key`
- `display_name`
- `persona`
- `tenant_id`
- `region`
- `account_owner_id`
- `access_level`

Distribution notes:

- Include all demo personas.
- Include rows that prove all-region, region-only, and owner-only access.

### `dim_product`

Purpose: Product usage and incident impact analysis.

Rows: 8-12

Columns:

- `product_id`
- `product_name`
- `product_family`
- `criticality`
- `launch_date`

Distribution notes:

- One critical product family should be tied to the incident.

### `fact_revenue_daily`

Purpose: Executive revenue health and period-over-period cards.

Rows: Approximately 2.9M (`4,000 accounts * 730 days`, sampled to active-account days as needed)

Columns:

- `date`
- `fiscal_year`
- `quarter`
- `fiscal_period`
- `tenant_id`
- `account_id`
- `region`
- `segment`
- `account_owner_id`
- `daily_arr`
- `bookings_amount`
- `expansion_arr`
- `contraction_arr`
- `churned_arr`
- `net_revenue`
- `gross_margin`
- `revenue_at_risk`

Story behavior:

- Two full years of daily data.
- Mild seasonality by quarter.
- West Enterprise accounts show elevated `revenue_at_risk` after the incident.
- Remediation should reduce `revenue_at_risk` after approved agent actions.

### `fact_product_usage_daily`

Purpose: Shows product adoption and usage drop as the leading indicator.

Rows: Approximately 1.5M-2.5M

Columns:

- `date`
- `fiscal_year`
- `quarter`
- `tenant_id`
- `account_id`
- `product_id`
- `region`
- `segment`
- `active_users`
- `sessions`
- `workflow_runs`
- `usage_score`
- `usage_drop_flag`

Story behavior:

- Incident-affected product shows usage drop for West Enterprise accounts.
- Usage gradually recovers after remediation.

### `fact_incidents`

Purpose: Explains root cause for Genie and dashboard narrative.

Rows: 80-150

Columns:

- `incident_id`
- `incident_start_ts`
- `incident_end_ts`
- `incident_date`
- `product_id`
- `region`
- `severity`
- `incident_category`
- `root_cause`
- `customer_impact_level`
- `estimated_revenue_impact`
- `status`

Story behavior:

- Include one major West-region reliability incident.
- Include smaller background incidents for realism.
- Major incident should align with support spike and usage drop.

### `fact_support_cases`

Purpose: Support pressure, SLA breach, customer pain.

Rows: 120K-180K

Columns:

- `case_id`
- `created_ts`
- `resolved_ts`
- `date`
- `tenant_id`
- `account_id`
- `product_id`
- `region`
- `segment`
- `priority`
- `case_category`
- `sla_target_hours`
- `resolution_hours`
- `sla_breached_flag`
- `customer_sentiment`
- `incident_id`

Story behavior:

- Case volume spikes 4-6x during the West reliability incident.
- SLA breaches increase for high-ARR West Enterprise accounts.
- Sentiment degrades during and shortly after the incident.

### `fact_renewal_risk`

Purpose: Agent triage, risk scoring, and revenue protection story.

Rows: Approximately 96K (`4,000 accounts * 24 months`)

Columns:

- `risk_month`
- `fiscal_year`
- `quarter`
- `tenant_id`
- `account_id`
- `region`
- `segment`
- `account_owner_id`
- `renewal_date`
- `renewal_risk_score`
- `risk_tier`
- `top_risk_driver`
- `predicted_churn_probability`
- `revenue_at_risk`
- `recommended_action`

Story behavior:

- Risk score rises for impacted West Enterprise accounts after the incident.
- Risk drivers should connect to usage drop, SLA breaches, and negative sentiment.
- Recommended actions should be suitable for workflow automation.

### `fact_agent_actions`

Purpose: Shows insight-to-action automation and human approval.

Rows: 8K-20K

Columns:

- `action_id`
- `created_ts`
- `date`
- `tenant_id`
- `account_id`
- `region`
- `segment`
- `account_owner_id`
- `source_agent`
- `source_question`
- `recommendation`
- `approval_status`
- `execution_status`
- `workflow_name`
- `approved_by`
- `completed_ts`
- `expected_revenue_protected`
- `actual_revenue_protected`

Story behavior:

- Actions increase after the incident.
- High-impact actions require approval.
- Approved actions reduce projected revenue at risk in later periods.

## Gold Views / Semantic Layer

Create these views after base tables are generated:

### `gold_executive_revenue_health`

Purpose: Executive KPI cards and trend charts.

Core fields:

- `date`
- `fiscal_year`
- `quarter`
- `fiscal_period`
- `tenant_id`
- `region`
- `segment`
- `net_revenue`
- `gross_margin`
- `expansion_arr`
- `churned_arr`
- `revenue_at_risk`

### `gold_customer_renewal_risk`

Purpose: Account triage table, agent recommendations, Genie root-cause questions.

Core fields:

- Account dimensions
- Latest `renewal_risk_score`
- `risk_tier`
- `top_risk_driver`
- `revenue_at_risk`
- `recommended_action`
- support and usage aggregates

### `gold_incident_revenue_impact`

Purpose: Explains why KPIs changed.

Core fields:

- Incident dimensions
- affected account count
- SLA breach count
- usage drop count
- estimated revenue impact
- revenue at risk after incident

### `gold_agent_action_queue`

Purpose: Domo Workflow / Agent Catalyst status dashboard.

Core fields:

- action dimensions
- approval status
- execution status
- expected and actual revenue protected
- workflow cycle time

### `gold_portal_user_scope`

Purpose: Reference table for portal persona filtering and PDP/UC testing.

Core fields:

- `user_key`
- `persona`
- `tenant_id`
- `region`
- `account_owner_id`
- `access_level`

## Validation Plan

Run validation before Domo asset creation:

- Confirm row counts for every table.
- Confirm no orphan foreign keys.
- Confirm all shared filter fields exist across all Domo-facing gold views.
- Confirm two years of daily data in `fact_revenue_daily` and `fact_product_usage_daily`.
- Confirm West Enterprise incident spike is visible.
- Confirm the major incident increases support cases, SLA breaches, usage drops, renewal risk, and revenue at risk.
- Confirm agent actions reduce projected revenue at risk after the incident.
- Confirm persona filters produce distinct row counts for executive, regional, and account owner personas.

## Example Genie Questions

These should be answerable once the Genie Space is configured:

- Why did renewal risk increase for West enterprise accounts this month?
- Which accounts were most affected by the reliability incident?
- How much revenue is at risk because of SLA breaches?
- Which recommended actions should the regional manager approve first?
- Did approved agent actions reduce revenue at risk after the incident?

## Domo Dashboard Targets

The generated data should support:

- Executive KPI strip: net revenue, revenue at risk, renewal risk, protected revenue.
- Regional trend: revenue and risk by region over time.
- Incident impact view: incident timeline, affected accounts, SLA breach spike.
- Account triage table: risk tier, owner, driver, recommended action.
- Agent action queue: pending approvals, executed workflows, failed actions.

## Approval Gate

Approve this spec before implementation. After approval, Sprint 1 implementation should:

1. Create generation code/scripts.
2. Generate parent dimensions first.
3. Generate fact tables with valid keys and incident story.
4. Write Delta tables to `databricks_raptor.pattern4_agent_automation`.
5. Create gold views.
6. Run validation queries.
7. Update the project tracker with generated object names and validation results.
