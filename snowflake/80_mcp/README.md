# 80_mcp – Snowflake-Managed MCP Server

## Status

**Available (target-instance)** – The Snowflake-managed MCP server capability was
announced at Summit 2025 and is in private preview. CREATE MCP SERVER DDL is not
publicly documented and is not available on this account as of July 2026. The DDL
in `10_mcp_server.sql` is provided as a guarded template ready to execute once the
feature flag is enabled.

## Mechanism

Snowflake's managed MCP server exposes native Cortex services as MCP-protocol tools
that external clients (Claude Desktop, Cursor, VS Code Copilot, custom agents) can
discover and invoke over HTTPS using the Model Context Protocol.

### Tool Inventory

| Tool Name | Type | Target Object | Description |
|-----------|------|---------------|-------------|
| `revenue_analyst` | `cortex_analyst_text_to_sql` | `REVENUE_CC_ANALYST` semantic view | NL-to-SQL over revenue data model |
| `revenue_search` | `cortex_search` | `REVENUE_CC_SEARCH` service | Unstructured doc retrieval (incidents, playbooks) |
| `revenue_agent` | `cortex_agent` | `REVENUE_CC_AGENT` | Full multi-tool reasoning agent |
| `revenue_sql` | `sql` | Gold-layer views (scoped) | Read-only SQL execution over core facts/dims |

### Authentication

External MCP clients authenticate using a **Programmatic Access Token (PAT)**
issued to a Snowflake user with the appropriate role (e.g., `REVENUE_CC_READER`).

Steps:
1. Generate a PAT in Snowsight: User Menu → Programmatic Access Tokens → Generate.
2. Configure the MCP client with the token and endpoint URL.

### Endpoint URL Shape

```
https://<account_identifier>.snowflakecomputing.com/api/v2/mcp/servers/SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP
```

### External Client Configuration

Example `mcp_config.json` for Claude Desktop or compatible client:

```json
{
  "mcpServers": {
    "revenue-cc": {
      "url": "https://<account>.snowflakecomputing.com/api/v2/mcp/servers/SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP",
      "headers": {
        "Authorization": "Bearer <PAT_TOKEN>",
        "Content-Type": "application/json"
      }
    }
  }
}
```

### Sample Tool-List Request (contract captured, not executed)

```http
POST /api/v2/mcp/servers/SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP HTTP/1.1
Host: <account>.snowflakecomputing.com
Authorization: Bearer <PAT_TOKEN>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
```

Expected response shape:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "revenue_analyst",
        "description": "Converts natural-language revenue/risk questions into SQL against the Revenue Command Center data model.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "question": { "type": "string", "description": "Natural language question about revenue metrics" }
          },
          "required": ["question"]
        }
      },
      {
        "name": "revenue_search",
        "description": "Searches unstructured revenue documents.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "query": { "type": "string" },
            "max_results": { "type": "integer", "default": 5 }
          },
          "required": ["query"]
        }
      },
      {
        "name": "revenue_agent",
        "description": "Full reasoning agent combining Analyst + Search.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "message": { "type": "string" }
          },
          "required": ["message"]
        }
      },
      {
        "name": "revenue_sql",
        "description": "Executes read-only SQL against gold-layer views.",
        "inputSchema": {
          "type": "object",
          "properties": {
            "sql": { "type": "string" }
          },
          "required": ["sql"]
        }
      }
    ]
  }
}
```

### Sample Tool-Call Request (contract captured, not executed)

```http
POST /api/v2/mcp/servers/SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_MCP HTTP/1.1
Host: <account>.snowflakecomputing.com
Authorization: Bearer <PAT_TOKEN>
Content-Type: application/json

{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "revenue_analyst",
    "arguments": {
      "question": "What is total revenue at risk this quarter by region?"
    }
  }
}
```

## Files

| File | Purpose |
|------|---------|
| `00_run.sql` | Orchestrator script |
| `10_mcp_server.sql` | DDL for REVENUE_CC_MCP (guarded) |
| `README.md` | This documentation |
