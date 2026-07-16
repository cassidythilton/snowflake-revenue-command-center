---
shaping: true
---

# X5 Spike Findings — CoWork Presentation

## Context

CoWork must be first-class without pretending Snowflake provides an embeddable CoWork widget for Domo.

## Questions

| ID | Question |
|---|---|
| X5-Q1 | Can CoWork be embedded in the Domo app? |
| X5-Q2 | How can the Domo experience and CoWork share intelligence? |
| X5-Q3 | What should the presenter show in CoWork? |

## Findings

- CoWork is a first-party Snowflake application accessed at `ai.snowflake.com` or through a direct agent URL.
- Snowflake documents Cortex Agent REST APIs as the extension point for custom applications; no supported external CoWork iframe/embed is documented.
- CoWork and a Domo custom app can use the same Cortex Agent object, semantic views, Search services, tools, and Snowflake policies while remaining separate UIs.
- Deep Research and persistent chart/table artifacts are GA as of July 2026.

## Recommendation

Make CoWork an equal first-class presenter surface through a direct agent link:

1. Start the investigation in Domo.
2. Open the configured agent in CoWork under presenter SSO.
3. Run a deeper cited investigation over the same Analyst/Search sources.
4. Return to Domo for approval, execution, and operational tracking.

The Domo Cortex Analyst and Agent panels call supported APIs; they do not visually imitate or embed CoWork.

## Remaining gate

Confirm the direct agent URL, role/warehouse selection, SSO behavior, and cross-region inference settings in the target account.

## Acceptance

Complete when the presenter handoff, shared-agent proof, role context, deep-research prompt, citation output, and return-to-Domo step are documented and repeatable.

## Sources

- [Snowflake CoWork overview](https://docs.snowflake.com/en/user-guide/snowflake-cortex/snowflake-cowork)
- [CoWork agent access and direct links](https://docs.snowflake.com/en/user-guide/snowflake-cortex/snowflake-cowork/deploy-agents)
- [Cortex Agent programmatic reference](https://docs.snowflake.com/en/user-guide/snowflake-cortex/snowflake-cowork/reference)
