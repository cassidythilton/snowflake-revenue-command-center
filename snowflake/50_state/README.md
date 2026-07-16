# 50_state — Operational State Layer (Hybrid Tables)

## Purpose

This layer provides **mutable operational state** for the Revenue Command Center using Snowflake Hybrid Tables. These tables support low-latency, row-level CRUD operations required by the application's interactive features (what-if scenarios, prediction feedback, agent writebacks).

## Tables

| Table | Purpose | Rows (seed) |
|-------|---------|-------------|
| `SCENARIO_RUNS` | What-if / accepted-prediction scenarios | 4 |
| `PREDICTION_FEEDBACK` | Human feedback on ML model predictions (operational memory) | 5 |
| `AGENT_ACTION_WRITEBACK` | Approved agent action results written back (Sprint 6) | 0 |

## Table Type

**Hybrid Tables** (`CREATE HYBRID TABLE`) — GA on this AWS account.

> **Fallback note:** If hybrid tables are not enabled on your account, change `CREATE HYBRID TABLE` to `CREATE TABLE` in `10_hybrid_tables.sql` and `00_run.sql`. Standard tables support the same SQL interface but lack the row-level locking and HTAP optimizations of hybrid tables. Document the fallback in deployment notes.

## Grants (Least-Privilege)

| Role | Privileges |
|------|-----------|
| `REVENUE_CC_WRITER` | SELECT, INSERT, UPDATE, DELETE on all three tables |
| `REVENUE_CC_READER` | SELECT on all three tables |

`REVENUE_CC_WRITER` inherits `REVENUE_CC_READER` (established in `00_setup`).

## Files

| File | Description |
|------|-------------|
| `00_run.sql` | Full orchestrator: create tables, grants, seed, validate |
| `10_hybrid_tables.sql` | DDL only (hybrid table definitions) |
| `20_seed.sql` | Seed INSERT statements |
| `30_writeback_ops.sql` | Sprint 6: MERGE template + GOLD_PROTECTED_REVENUE_ROLLUP view + grants |

## Deployment

```sql
-- Run in Snowsight or SnowSQL as SYSADMIN:
USE ROLE SYSADMIN;
!source 00_run.sql
```

Or execute each file sequentially:
1. `10_hybrid_tables.sql` (as SYSADMIN)
2. Grant statements from `00_run.sql` Step 2 (as SECURITYADMIN)
3. `20_seed.sql` (as SYSADMIN)

## Sprint 6 — Agent-Action Writeback Operations

`30_writeback_ops.sql` provides the idempotent MERGE template and governed rollup view for the agent-action approval/execution loop.

| Object | Type | Purpose |
|--------|------|---------|
| `AGENT_ACTION_WRITEBACK` | Hybrid Table | Stores approved/executed agent actions (keyed on ACTION_ID) |
| MERGE template | DML | Idempotent upsert — INSERT on first call, UPDATE on subsequent calls for same ACTION_ID |
| `GOLD_PROTECTED_REVENUE_ROLLUP` | View | Combines baseline + writeback protected revenue for app dashboards |

**Flow (Domo Code Engine bridge via SQL API):**
1. User approves action -> MERGE with APPROVAL_STATUS='Approved', EXECUTION_STATUS='Pending'
2. Workflow completes -> MERGE same ACTION_ID with EXECUTION_STATUS='Executed', ACTUAL_REVENUE_PROTECTED, COMPLETED_TS
3. App reads `GOLD_PROTECTED_REVENUE_ROLLUP` for live totals

**Validated live:** MERGE works on the hybrid table (insert + idempotent update confirmed), rollup correctly reflects writeback deltas, table left empty for clean demo state.

## CRUD Validation

After deployment, the following validation proves full row-level operations work as expected:

```sql
-- INSERT a test scenario
INSERT INTO SCENARIO_RUNS (CREATED_BY, ACCOUNT_ID, ACCOUNT_NAME, REGION, SEGMENT,
    SCENARIO_NAME, PREDICTED_RISK_PROBABILITY, PROJECTED_REVENUE_AT_RISK)
VALUES ('test@demo.local', 'ACC-00099', 'Test Account', 'West', 'Enterprise',
    'CRUD validation test', 0.50, 100000);

-- UPDATE its status
UPDATE SCENARIO_RUNS SET STATUS = 'Closed' WHERE ACCOUNT_ID = 'ACC-00099';

-- SELECT it back
SELECT * FROM SCENARIO_RUNS WHERE ACCOUNT_ID = 'ACC-00099';

-- DELETE the test row
DELETE FROM SCENARIO_RUNS WHERE ACCOUNT_ID = 'ACC-00099';
```
