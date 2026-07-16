# 00_setup - Environment Bootstrap

## Apply Order

Run `00_setup.sql` as a single script. Internally it switches roles as needed:

| Section | Statements | Required Role |
|---------|-----------|---------------|
| 1 | Warehouse, database, schema | SYSADMIN |
| 2 | Role creation | SECURITYADMIN |
| 3 | Grants to REVENUE_CC_READER | SECURITYADMIN |
| 4 | Grants to REVENUE_CC_WRITER | SECURITYADMIN |
| 5 | Grant roles to SYSADMIN | SECURITYADMIN |

The executing user must be able to assume both SYSADMIN and SECURITYADMIN (typically ACCOUNTADMIN).

## Code Engine Credential Mapping

The app's Code Engine service identity (bridge credential) should be configured as follows:

- **REVENUE_CC_READER** for all read operations (Cortex Analyst queries, Cortex Agent tool calls, Cortex Search retrieval).
- **REVENUE_CC_WRITER** only for the approved writeback path (persisting recommendations, updating hybrid state tables).

This ensures least-privilege access: the service cannot mutate data unless explicitly routed through the write path.
