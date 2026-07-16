---
shaping: true
---

# X1 Spike Findings — MCP Fabric and Domo Chat v2

## Context

Shape C requires a credible bidirectional MCP story without treating every conversational product as the same runtime.

## Questions

| ID | Question |
|---|---|
| X1-Q1 | Which Snowflake capabilities can be exposed to external MCP clients today? |
| X1-Q2 | Which Domo capabilities can be exposed through MCP today? |
| X1-Q3 | Can Domo Chat v2 directly invoke Snowflake Intelligence/Cortex tools today? |
| X1-Q4 | Which paths are safe for the golden demo flow? |

## Findings

- Snowflake-managed MCP is GA and can expose Cortex Analyst, Cortex Search, Cortex Agents, SQL, UDFs, and stored procedures as tools under Snowflake OAuth and RBAC.
- Snowflake's managed server is tools-only, supports at most 50 tools, does not support dynamic client registration, and truncates some large tool responses.
- Cortex Agent/CoWork remote MCP connectors are Public Preview; external MCP calls do not have the same monitoring-table coverage as native tools.
- Domo Essentials MCP is Beta and can expose authorized Domo datasets and workflows to external agents.
- Domo Chat v2 is Beta for deeper, multi-part, multi-dataset analysis. Public material describes tool use and asset/workflow creation as future functionality, not a current direct Snowflake route.

## Recommendation

Demonstrate two explicit outward servers:

1. Snowflake-managed MCP → a known external client → Analyst/Search/Agent tools.
2. Domo Essentials MCP → a known external client → a narrowly scoped Domo dataset query or workflow.

Keep Domo Chat v2 first-class for Domo-native conversation, but do not claim it invokes Cortex. Do not require Snowflake remote MCP connectors for the golden path.

## Remaining gate

R5 remains unsatisfied until Domo Essentials MCP is confirmed in the target Domo instance and one authorized tool call succeeds. If unavailable, show the Snowflake-managed MCP call live and label Domo Essentials MCP as a beta follow-on.

## Acceptance

Complete when we can describe both MCP directions, their authentication and tool boundaries, the live demo call in each direction, and the explicit Chat v2 limitation.

## Sources

- [Snowflake-managed MCP server](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp)
- [Snowflake MCP connectors](https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-agents-mcp-connectors)
- [Domo AI Agents and MCP announcements](https://www.domo.com/product/new-features/ai-agents-mcp-domopalooza-announcements)
- [Domo Essentials MCP](https://www.domo.com/product/new-features/domo-essentials-mcp)
