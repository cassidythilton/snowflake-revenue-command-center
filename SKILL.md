# Cloud Amplifier BYOS Registration

Register Snowflake tables as federated datasets in Domo via Cloud Amplifier BYOS (Bring Your Own Storage). Data stays in Snowflake — Domo queries it live.

## When to Use

Trigger on: "connect table to domo", "register table in domo", "cloud amplifier", "BYOS", "federated dataset", "make table available in domo", "bring snowflake table to domo"

## Prerequisites

- User has a Cloud Amplifier connection already configured in Domo (Snowflake → Domo)
- User has a Domo developer token (or refresh token from ryuu config)
- The Snowflake table(s) exist and the Cloud Amplifier service account has access

## Required Inputs (Prompt User)

Before executing, collect these from the user:

| Input | Description | How to find |
|-------|-------------|-------------|
| `instance` | Domo instance subdomain (e.g. `modocorp`) | Ask user or read from `~/.config/configstore/ryuu/*.json` filenames |
| `token` | Domo developer token | Read from `~/.config/configstore/ryuu/{instance}.domo.com.json` → `refreshToken` field |
| `cloud_id` | Cloud Amplifier connection UUID | Call the cloud list API (see below) and ask user to pick |
| `database` | Snowflake database name (e.g. `MY_DB`) | Ask user or parse from table reference |
| `schema` | Snowflake schema name (e.g. `PUBLIC`) | Ask user or parse from table reference |
| `table` | Snowflake table name (e.g. `MY_TABLE`) | Ask user — can be multiple tables |

### Parsing Table References

If user provides a fully qualified name like `MY_DB.PUBLIC.MY_TABLE`, split on `.` to get database, schema, table. If they provide just a table name, ask for database and schema.

## API Reference

### 1. List Cloud Connections (find cloud_id)

```
GET https://{instance}.domo.com/api/data/v1/cloud-connections
Header: X-DOMO-Developer-Token: {token}
```

Response is an array. Look for entries with `engine: "SNOWFLAKE"`. Each has an `id` field — that's the `cloud_id`.

If this endpoint doesn't work, try:

```
GET https://{instance}.domo.com/api/data/v3/datasources?type=cloud-connection&limit=50
Header: X-DOMO-Developer-Token: {token}
```

Or ask the user to provide the Cloud Amplifier connection UUID directly (they can find it in Domo → Data → Cloud Amplifier → connection settings URL).

### 2. Register Table(s) via BYOS

```
POST https://{instance}.domo.com/api/data/v1/byos/register/{cloud_id}
Header: X-DOMO-Developer-Token: {token}
Header: Content-Type: application/json
Body:
[
  {
    "dataProviderKey": "snowflake",
    "databaseName": "{database}",
    "schemaName": "{schema}",
    "tableName": "{table}"
  }
]
```

You can register multiple tables in a single call by adding more objects to the array.

### Response Handling

**Success** — returns array of registered datasets:
```json
[
  {
    "dataSourceId": "uuid-of-new-dataset",
    "tableName": "MY_TABLE",
    "status": "SUCCESS"
  }
]
```

**Already registered** — status is `SKIPPED` and the existing dataset ID is in the error message:
```json
[
  {
    "tableName": "MY_TABLE",
    "status": "SKIPPED",
    "error": {
      "message": "existing-dataset-uuid"
    }
  }
]
```

Both cases are fine — extract the dataset UUID either way.

### 3. Verify Registration

After registering, confirm the dataset exists:

```
GET https://{instance}.domo.com/api/data/v3/datasources/{dataSourceId}
Header: X-DOMO-Developer-Token: {token}
```

Check that `name` matches the table and `status` is not in error.

## Execution Flow

```
1. Resolve instance and token
   - Check ~/.config/configstore/ryuu/ for available instances
   - Read token from the matching config file
   - If multiple instances exist, ask user which one

2. Find cloud_id
   - Try GET /api/data/v1/cloud-connections
   - Filter for SNOWFLAKE engine connections
   - If multiple, ask user to pick
   - If none found, ask user for the UUID directly

3. Parse table reference(s)
   - Split fully-qualified names (DB.SCHEMA.TABLE)
   - If partial, ask for missing parts

4. Register via BYOS API
   - POST to /api/data/v1/byos/register/{cloud_id}
   - Handle SUCCESS and SKIPPED responses

5. Report results
   - Show dataset UUID(s) for each registered table
   - Show the Domo URL: https://{instance}.domo.com/datasources/{dataSourceId}/details/overview
```

## Example curl (for reference)

```bash
curl -X POST "https://modocorp.domo.com/api/data/v1/byos/register/259f7a0c-9d43-41df-a9ae-330703fa0fdb" \
  -H "X-DOMO-Developer-Token: YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '[{"dataProviderKey":"snowflake","databaseName":"PTMCOCO","schemaName":"PUBLIC","tableName":"MY_TABLE"}]'
```

## Important Notes

- The `dataProviderKey` is always `"snowflake"` for Snowflake Cloud Amplifier connections
- Table names are CASE-SENSITIVE — use the exact Snowflake casing (usually UPPERCASE)
- The registered dataset is FEDERATED — data stays in Snowflake, Domo queries live
- No ETL or data movement happens — this is just metadata registration
- The Cloud Amplifier service account must have SELECT access to the table
- Once registered, the dataset appears in Domo's data center and can be used in cards, apps, and ETL

## Error Handling

| Error | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Token expired or invalid | Get fresh token from ryuu config or ask user |
| 404 Not Found | Wrong cloud_id | Verify cloud connection UUID |
| 400 Bad Request | Malformed body | Check JSON array format |
| SKIPPED status | Table already registered | Extract existing ID from error.message — not an error |
| Empty response | Table doesn't exist in Snowflake | Verify table name and permissions |

## Bulk Registration

To register many tables at once, just add them all to the body array:

```json
[
  {"dataProviderKey":"snowflake","databaseName":"MY_DB","schemaName":"PUBLIC","tableName":"TABLE_A"},
  {"dataProviderKey":"snowflake","databaseName":"MY_DB","schemaName":"PUBLIC","tableName":"TABLE_B"},
  {"dataProviderKey":"snowflake","databaseName":"MY_DB","schemaName":"PUBLIC","tableName":"TABLE_C"}
]
```

All will be registered in a single API call and return individual status per table.