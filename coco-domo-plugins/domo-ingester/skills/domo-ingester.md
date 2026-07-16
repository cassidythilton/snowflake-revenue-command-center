---
name: domo-ingester
description: "**[REQUIRED]** Use for ALL data ingestion requests. Ingest data from any external source (Jira, Google Sheets, Salesforce, HubSpot, etc.) into Snowflake via Domo connectors. Triggers: ingest, ingest jira, ingest salesforce, pull data from, connect to, import from, connector, pull my issues, get data from."
---

# Domo Snowflake Ingester

Ingest data from any source into Snowflake via Domo's 1,200+ connectors. Uses cached "recipes" for known connectors (instant) and a discovery flow for new ones.

## When to Use

- User wants to ingest data from an external source (Google Sheets, Jira, Salesforce, HubSpot, etc.)
- User says "ingest", "connect", "pull data from", "import from"
- User mentions a third-party data source they want in Snowflake

## Constants

- **Domo Instance:** snowflake-demo
- **Snowflake Target:** PTMCOCO.PUBLIC.<TABLE_NAME>
- **Cloud ID:** 5a22c855-8a4b-4fb4-81b5-4706ccd039c8
- **Scripts Dir:** ~/.snowflake/cortex/plugins/domo-ingester/scripts/
- **Recipes Dir:** ~/.snowflake/cortex/plugins/domo-ingester/recipes/

## Workflow

### Step 1: Identify the Data Source

Determine what connector type the user needs. Extract the source name (e.g., "google sheets", "jira", "salesforce").

### Step 2: Check for Existing Recipe

```bash
python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/list_recipes.py
```

Look for a recipe matching the requested source. If found, go to **Path A**. If not, go to **Path B**.

---

## Path A: Known Connector (Recipe Exists)

### A1: Load the Recipe

Read the recipe file from `~/.snowflake/cortex/plugins/domo-ingester/recipes/<provider_key>.json`.

### A2: Determine Values (AUTO-FILL when possible)

**CRITICAL: Do NOT ask the user questions that can be inferred from context.** Use these rules:

1. **Table name**: Auto-derive from context. E.g., "ingest jira issues" → `JIRA_MY_ISSUES`. Only ask if truly ambiguous.
2. **Recipe fields with defaults**: Use the default value automatically unless the user specified something different.
3. **Jira-specific**: If user says "my jira issues" or "jira issues assigned to me", auto-use:
   - `report` = `"query"`
   - `jql` = `"assignee=currentUser()"`
   - `table_name` = `"JIRA_MY_ISSUES"`
4. **Google Sheets**: If user provides a sheet URL, extract the ID and use it directly.
5. **Only ask** when the user's request is genuinely ambiguous (e.g., "ingest jira" with no indication of what data).

For each `user_input` field in the recipe:
- If the value can be inferred from the user's message → use it
- If a sensible default exists → use the default
- Only ask if truly unknown

### A3: Create and Execute

```bash
DOMO_INSTANCE=snowflake-demo DOMO_AUTH_MODE=ryuu-session python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/create_connector.py \
  --recipe ~/.snowflake/cortex/plugins/domo-ingester/recipes/<provider_key>.json \
  --values '{"field1": "value1", "field2": "value2"}' \
  --table-name "<TABLE_NAME>"
```

### A4: Verify

After the script reports SUCCESS, verify in Snowflake:

```sql
SELECT * FROM PTMCOCO.PUBLIC.<TABLE_NAME> LIMIT 5;
```

Report the Domo datasource URL and Snowflake table location to the user.

---

## Path B: Unknown Connector (No Recipe)

### B1: Discover the Provider

```bash
DOMO_INSTANCE=snowflake-demo DOMO_AUTH_MODE=ryuu-session python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/discover.py --search "<keyword>"
```

This returns matching providers with their keys and auth schemes. If multiple matches, ask the user which one they want. Then get full details:

```bash
DOMO_INSTANCE=snowflake-demo DOMO_AUTH_MODE=ryuu-session python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/discover.py --details "<provider_key>"
```

### B2: Handle Authentication

Check the `auth_scheme` from the provider details:

- **oauth** or **oauth-metadata**: Tell the user to create an account in Domo UI:
  > "Go to https://snowflake-demo.domo.com/datacenter/accounts and create a new **[Provider Name]** account via OAuth. Once done, tell me the account ID (visible in the URL or account list)."

- **fields** (API key, username/password): Tell the user to create an account in Domo UI:
  > "Go to https://snowflake-demo.domo.com/datacenter/accounts and create a new **[Provider Name]** account. You'll need: [list auth_fields with labels]. Once done, tell me the account ID."

- **none**: No account needed (use account_id 0 or skip).

To look up existing accounts:

```bash
DOMO_INSTANCE=snowflake-demo DOMO_AUTH_MODE=ryuu-session python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/discover.py --list-accounts
```

### B3: Determine Configuration

This is the hardest part for unknown connectors. The configuration fields are connector-specific and not fully documented in the provider API. Strategy:

1. **Check if an existing stream of this type exists** on the instance — inspect its configuration to learn the field names:
   ```bash
   # List all streams, look for matching transport description
   ```

2. **If no existing stream**, use the `defaultConnectorId` from the provider details as the `transport_description`. For configuration fields, start with a minimal set:
   - The connector may work with just the cloud/storage fields
   - Or it may need source-specific fields (project name, report type, etc.)

3. **Try creating with minimal config** — if it fails, check the error message to determine what additional fields are needed.

4. **Ask the user** what data they want to pull (table name, project, report type, date range, etc.) and map those to configuration fields.

### B4: Create the Connector (Ad-hoc Mode)

```bash
DOMO_INSTANCE=snowflake-demo DOMO_AUTH_MODE=ryuu-session python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/create_connector.py \
  --provider-key "<provider_key>" \
  --account-id <ACCOUNT_ID> \
  --transport "<defaultConnectorId or com.domo.connector.xxx>" \
  --transport-version "1" \
  --config '[{"category":"METADATA","name":"...","type":"string","value":"..."},...]' \
  --table-name "<TABLE_NAME>" \
  --save-recipe "<provider_key>"
```

### B5: If It Fails

If the connector fails:
1. Check the execution errors
2. Look at the Domo UI for more details: `https://snowflake-demo.domo.com/datasources/<dataset_id>`
3. Adjust configuration and retry
4. Once successful, the `--save-recipe` flag ensures the working config is saved for next time

### B6: Save the Recipe

Once successful with `--save-recipe`, edit the saved recipe to:
- Add proper `prompt` values for user_input fields
- Mark fixed fields appropriately
- Set `tested: true`
- Add `account_note` for reference

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Insufficient privileges" on Snowflake | Grant CREATE FILE FORMAT / CREATE TABLE on PTMCOCO.DOMO_UTIL and PTMCOCO.PUBLIC to SYSADMIN |
| Execution stuck in ACTIVE | Wait longer (indexing to Snowflake takes 30-60s after data pull) |
| Account invalid | Re-authorize in Domo UI at /datacenter/accounts |
| Unknown config fields | Inspect an existing stream of same type, or try minimal config and iterate |
| OAuth expired | User must re-auth in Domo UI |

## Available Recipes

Run `python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/list_recipes.py` to see all available recipes.

Current recipes:
- **google-sheets** — Google Sheets (OAuth, account 161)
- **jira-oauth** — Jira Cloud (OAuth, account 162). Supports JQL queries like `assignee=currentUser()`, `project=X`, etc.
