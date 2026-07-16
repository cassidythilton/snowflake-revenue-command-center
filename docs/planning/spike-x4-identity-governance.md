---
shaping: true
---

# X4 Spike Findings — Identity and Governance Parity

## Context

Pattern 4 claims one entitlement model but uses browser persona filters and a service identity. The Snowflake solution must not repeat that claim without caller-aware evidence.

## Questions

| ID | Question |
|---|---|
| X4-Q1 | Which identity executes Domo live queries, Cortex Analyst, Cortex Agent, and writeback? |
| X4-Q2 | Do Snowflake row-access and masking policies produce the same effective scope as Domo PDP? |
| X4-Q3 | How are guardrails, traces, and sensitive event data governed? |

## Findings

- Snowflake row-access and masking policies execute under the authenticated Snowflake context and apply to Analyst/Agent tool queries.
- Cortex Agent behavior derives from the authenticated user's default role and object privileges.
- A shared Code Engine credential collapses users into one Snowflake role; a UI persona selector does not create governed scope.
- Cortex AI Guardrails protect Cortex Code, CoWork, and Cortex Agents against prompt injection/jailbreaks through an account-level setting.
- AI Observability stores traces and evaluations. Raw prompts/tool content require the additional `READ UNREDACTED AI OBSERVABILITY EVENTS TABLE` privilege.

## Recommendation

Use split identity paths:

- Read/analysis: per-user Snowflake OAuth/OBO if the target Domo and Code Engine path supports it.
- Write/execute: narrowly privileged service identity invoked only after Domo approval.
- Domo PDP: mirror the same entitlement source and parity-test results against Snowflake policies.
- Demo: run the same Analyst/Agent question as two real users/roles and show different permitted results.

If per-user Cortex API tokens are unavailable, use an explicitly named demo service identity and remove any claim of end-user Snowflake enforcement.

## Remaining gate

R7 remains unsatisfied until the target-instance authentication flow is proven and a two-persona parity test passes for Domo data, Analyst, and Agent.

## Acceptance

Complete when every read/write hop names its executing identity, privileges, policy enforcement point, audit record, and failure behavior.

## Sources

- [Snowflake Horizon Catalog](https://docs.snowflake.com/en/user-guide/snowflake-horizon)
- [Cortex Agent monitoring](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-monitor)
- [Cortex AI Guardrails](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-ai-guardrails)
- [AI Observability](https://docs.snowflake.com/en/user-guide/snowflake-cortex/ai-observability)
