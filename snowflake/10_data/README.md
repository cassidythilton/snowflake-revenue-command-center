# Synthetic Data Generation - Snowflake Native

## Apply Order

Run from SnowSQL or Snowsight in the following order:

1. `00_run.sql` — sets USE ROLE/WAREHOUSE/DATABASE/SCHEMA, then sources the three scripts below.

If your client does not support `!source`, run manually in order:

1. `10_dimensions.sql` — dim_tenant, dim_product, dim_user_entitlement, dim_account
2. `20_facts.sql` — fact_incidents, fact_revenue_daily, fact_product_usage_daily, fact_support_cases, fact_renewal_risk, fact_agent_actions
3. `30_gold_views.sql` — gold_executive_revenue_health, gold_customer_renewal_risk, gold_incident_revenue_impact, gold_agent_action_queue, gold_portal_user_scope

All statements are idempotent (CREATE OR REPLACE).

## Target Environment

| Setting | Value |
|---------|-------|
| Role | SYSADMIN |
| Warehouse | REVENUE_CC_WH |
| Database | SNOWFLAKE_REVENUE_CC |
| Schema | CORE |

## Row-Count Expectations

| Table | Expected Rows |
|-------|--------------|
| dim_tenant | 6 |
| dim_product | 10 |
| dim_user_entitlement | 10 |
| dim_account | 4,000 |
| fact_incidents | 120 |
| fact_revenue_daily | ~2,920,000 (4000 x 730) |
| fact_product_usage_daily | ~1,460,000 (50% sample of 4000 x 730) |
| fact_support_cases | 150,000 |
| fact_renewal_risk | 96,000 (4000 x 24) |
| fact_agent_actions | 12,000 |

## Spark-to-Snowflake Translation Notes

| Spark/Databricks | Snowflake Equivalent |
|-----------------|---------------------|
| `USING DELTA` | Removed; use `CREATE OR REPLACE TABLE ... AS` |
| `range(n)` | `TABLE(GENERATOR(ROWCOUNT => n))` with `ROW_NUMBER() OVER (ORDER BY SEQ4()) - 1` |
| `explode(sequence(d1, d2, INTERVAL 1 day))` | `GENERATOR(ROWCOUNT => N)` + `DATEADD(day, idx, anchor)` |
| `explode(sequence(..., INTERVAL 1 month))` | `GENERATOR(ROWCOUNT => 24)` + `DATEADD(month, idx, anchor)` |
| `pmod(hash(a, b), n)` | `MOD(ABS(HASH(a, b)), n)` — preserves determinism with same arguments |
| `element_at(array(...), idx)` | `GET(ARRAY_CONSTRUCT(...), idx)` (0-based in Snowflake) |
| `date_sub(current_date(), n)` | `DATEADD(day, -n, CURRENT_DATE())` |
| `date_add(x, n)` | `DATEADD(day, n, x)` |
| `add_months(d, n)` | `DATEADD(month, n, d)` |
| `date_format(d, 'yyyy-MM')` | `TO_VARCHAR(d, 'YYYY-MM')` |
| `year() / quarter() / month()` | `YEAR() / QUARTER() / MONTH()` (identical) |
| `date_trunc('MONTH', d)` | `DATE_TRUNC('MONTH', d)` (identical) |
| `datediff(end, start)` | `DATEDIFF(day, start, end)` (note: argument order reversed) |
| `CAST(x AS DOUBLE)` | `CAST(x AS DOUBLE)` (Snowflake alias for FLOAT) |
| `CAST(x AS STRING)` | `CAST(x AS VARCHAR)` |
| `concat(a, b)` | `a \|\| b` or `CONCAT()` (both work) |
| `true / false` literals | `TRUE / FALSE` |

## Determinism

Snowflake `HASH()` is deterministic within a session and across sessions for the same inputs. The translated scripts use `MOD(ABS(HASH(...)), n)` to replicate Spark's `pmod(hash(...), n)`. The hash algorithms differ between platforms, so absolute output values will differ, but the statistical distributions (region 35/25/20/20, segment 18/42/40, etc.) are preserved because the same modulo thresholds are applied.

## Story Preserved

- INC-0001: West-region SEV-1 reliability incident ~45 days before CURRENT_DATE
- 30,000 incident-linked support cases concentrated on West Enterprise accounts
- Usage drop (incident_window) for West Enterprise on PROD-001
- Elevated revenue_at_risk during and after incident for West Enterprise
- Renewal risk spikes to "High" tier for affected accounts in incident month
- Agent actions drawn from high-risk accounts; 58% approved/executed
- Remediation tail: revenue_at_risk reduces to 3.5% for West Enterprise post-window
