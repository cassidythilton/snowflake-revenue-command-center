# Sprint 7 — Governance Layer

## Overview

Demonstrates Snowflake-native governance (row access policies + column masking) enforced at the query engine, with a **two-persona parity test** proving the same SQL returns different governed results depending on the active role.

## Policies

| Policy | Type | Applied To | Effect |
|--------|------|-----------|--------|
| `RAP_REGION` | Row Access Policy | `DIM_ACCOUNT.REGION` | Filters rows to the caller's mapped region |
| `MASK_ARR` | Masking Policy | `DIM_ACCOUNT.ANNUAL_RECURRING_REVENUE` | Returns NULL for restricted roles |

## Fail-Open Design (Critical Safety)

Both policies are **fail-open** for all existing application roles:

- `REVENUE_CC_READER` — full access, all rows, unmasked values
- `REVENUE_CC_WRITER` — full access, all rows, unmasked values
- `SYSADMIN` — full access
- `ACCOUNTADMIN` — full access

Only the NEW region-scoped roles (`REVENUE_CC_READER_WEST`, `REVENUE_CC_READER_EAST`) receive restricted access. Existing app surfaces (Forecast Home, Cortex Analyst, Agent, ML, Approvals) are unaffected.

## Region-Scoped Roles

| Role | Region | Purpose |
|------|--------|---------|
| `REVENUE_CC_READER_WEST` | West | Sees only West-region accounts, ARR masked |
| `REVENUE_CC_READER_EAST` | East | Sees only East-region accounts, ARR masked |

Both are granted to `SVC_REVENUE_CC` (Code Engine bridge) and to `SYSADMIN` for testing.

## Two-Persona Parity Test Results

Query: `SELECT region, COUNT(*) AS accounts, ROUND(SUM(revenue_at_risk)) AS rev_at_risk FROM GOLD_CUSTOMER_RENEWAL_RISK GROUP BY region ORDER BY region`

| Role | Result |
|------|--------|
| `REVENUE_CC_READER` | Central: 799, East: 1027, South: 791, West: 1383 (total 4000) |
| `REVENUE_CC_READER_WEST` | West: 1383 |
| `REVENUE_CC_READER_EAST` | East: 1027 |

### Masking Test

Query: `SELECT ACCOUNT_ID, ANNUAL_RECURRING_REVENUE FROM DIM_ACCOUNT LIMIT 3`

| Role | ANNUAL_RECURRING_REVENUE |
|------|--------------------------|
| `REVENUE_CC_READER` | 9002.0, 27520.0, 314508.0 (real values) |
| `REVENUE_CC_READER_WEST` | NULL, NULL, NULL (masked) |

## How It Works

1. `GOV_ROLE_REGION_MAP` table maps role names to allowed regions
2. `RAP_REGION` checks `CURRENT_ROLE()` — privileged roles pass through; others are filtered via the mapping table
3. Policy on `DIM_ACCOUNT` propagates through JOINs to all gold views and the semantic view
4. `MASK_ARR` returns real values for privileged roles, NULL otherwise

## Honest Disclosure: Service Identity & C8

This governance operates under a **role-based** model using a single named service identity (`SVC_REVENUE_CC`). The Code Engine bridge switches between roles (`REVENUE_CC_READER_WEST`, `REVENUE_CC_READER_EAST`) to simulate per-persona access.

**Per-end-user identity (C8 / OAuth token passthrough)** is out of scope for this sprint. In production, each end user would authenticate independently and `CURRENT_ROLE()` / `CURRENT_USER()` would reflect their actual identity, enabling true per-user row-level security without role switching.

## Files

| File | Purpose |
|------|---------|
| `00_run.sql` | Orchestrator — runs scripts in order |
| `10_roles.sql` | Creates region-scoped roles, grants, and mapping table |
| `20_row_access_policy.sql` | Row access policy definition and attachment |
| `30_masking_policy.sql` | Masking policy definition and attachment |
