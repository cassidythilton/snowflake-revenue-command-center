---
shaping: true
---

# X3 Spike Findings — Operational Memory

## Context

The demo needs durable scenario runs and prediction feedback analogous to Lakebase without reproducing the Code Engine PostgreSQL bundling complexity.

## Questions

| ID | Question |
|---|---|
| X3-Q1 | Should app state use Hybrid Tables or Snowflake Postgres? |
| X3-Q2 | Can the secure backend perform simple CRUD without another driver/runtime? |
| X3-Q3 | Which platform limitations affect the demo? |

## Findings

- Hybrid Tables support row-oriented transactional access through ordinary Snowflake SQL and fit the two small CRUD entities.
- The secure backend can use the existing Snowflake SQL API path; no PostgreSQL driver bundle or separate credential exchange is needed.
- Hybrid Tables currently do not support streams, dynamic tables, materialized views, data sharing, replication, Snowpipe, or fail-safe.
- Those limitations do not block `scenario_runs` or `prediction_feedback`, but they prevent presenting Hybrid Tables as a universal Lakebase replacement.

## Recommendation

Select Hybrid Tables:

- `scenario_runs`: scenario inputs, score, model version, owner, timestamps, status.
- `prediction_feedback`: account, prediction, accepted/outcome state, reviewer, note, timestamps.
- Use primary keys and narrowly scoped CRUD functions.
- Copy approved action outcomes into an analytic history table separately if downstream trend reporting needs features Hybrid Tables do not support.

## Remaining gate

Validate Hybrid Table availability, grants, and SQL API CRUD in the target account.

## Acceptance

Complete when we can describe table contracts, CRUD calls, privileges, retention expectations, and the boundary between transactional state and analytic history.

## Sources

- [Hybrid Tables overview](https://docs.snowflake.com/en/user-guide/tables-hybrid)
- [Hybrid Tables limitations](https://docs.snowflake.com/en/user-guide/tables-hybrid-limitations)
