# Domo Data Model Builder

**Trigger:** User says "build a data model", "create a data model from semantic view", "push semantic view to domo data model", or mentions "data model" + a semantic view name.

**Purpose:** Reads a Snowflake semantic view definition, resolves the underlying tables to their Domo BYOS dataset UUIDs, and creates a fully-wired Domo Data Model via API — tables on canvas with relationships defined.

---

## Prerequisites

- Tables referenced in the semantic view must already be registered as BYOS/federated datasets in Domo
- You need the Domo instance URL and a developer token (from ryuu config)
- The Cloud Amplifier cloud ID for the instance

---

## Workflow

### Step 1: Read the Semantic View

Get the semantic view definition from Snowflake:

```sql
SELECT GET_DDL('SEMANTIC VIEW', 'DB.SCHEMA.VIEW_NAME');
```

Parse the DDL to extract:
- **Tables** — each table referenced (fully qualified name)
- **Relationships** — join keys, cardinality (many_to_one, one_to_many, one_to_one)
- **Model name** — use the semantic view name or let user override

### Step 2: Resolve Dataset UUIDs

For each table in the semantic view, find the corresponding Domo BYOS dataset UUID.

Check the user's memory/context first (project-context.md often has these).

If not found, use the BYOS list API:
```
GET https://<instance>.domo.com/api/data/v1/byos/list/<cloudId>
```

Or ask the user for the mapping.

### Step 3: Build the Model Payload

Use this exact API structure:

```
POST https://<instance>.domo.com/api/query/v1/semantic-models
Headers:
  Content-Type: application/json;charset=utf-8
  X-DOMO-Developer-Token: <token>
  accept: application/json
```

**Request body:**
```json
{
  "dataSourceName": "<model_name>",
  "dataSourceDescription": "<description>",
  "lastUpdated": null,
  "schema": {
    "objects": {
      "<FULLY.QUALIFIED.TABLE_NAME>": {
        "type": "DATASET",
        "datasource": "<domo_dataset_uuid>",
        "isNew": true,
        "include": [],
        "exclude": [],
        "dataProviderType": "snowflake",
        "cloudId": "<cloud_amplifier_uuid>"
      }
    },
    "relationships": [
      {
        "primary": true,
        "joinType": "INNER",
        "left": "<FULLY.QUALIFIED.LEFT_TABLE>",
        "right": "<FULLY.QUALIFIED.RIGHT_TABLE>",
        "cardinality": "many_to_one",
        "leftKeys": [{"@type": "COLUMN", "columnName": "<LEFT_COL>"}],
        "rightKeys": [{"@type": "COLUMN", "columnName": "<RIGHT_COL>"}],
        "alias": null
      }
    ]
  },
  "cloudId": "",
  "canEdit": false
}
```

**Cardinality values:** `many_to_one`, `one_to_many`, `one_to_one`
**Join types:** `INNER`, `LEFT`, `RIGHT`, `FULL`

### Step 4: Create the Model

Execute the POST. Response returns:
```json
{
  "dataSourceId": "<model_uuid>",
  "indexRequestKey": "...",
  "schema": { ... }
}
```

Save the `dataSourceId` — this is the model UUID.

### Step 5: Save UI Layout (canvas positions)

```
POST https://<instance>.domo.com/api/query/v1/property/save
Headers: same as above
```

**Request body:**
```json
{
  "type": "json",
  "context": "data_model",
  "name": "ui_settings",
  "datasource": "<model_uuid_from_step_4>",
  "value": "<json_string_of_positions>"
}
```

The `value` is a JSON string where each key is a dataset UUID:
```json
{
  "<dataset_uuid_1>": {"c": "#31689B", "x": 0, "y": 0},
  "<dataset_uuid_2>": {"c": "#31689B", "x": 448, "y": 0},
  "<dataset_uuid_3>": {"c": "#31689B", "x": 896, "y": 0}
}
```

Auto-layout: space tables 448px apart horizontally. For >4 tables, wrap to a new row (y += 300).

### Step 6: Report Success

Output:
- Model name and UUID
- URL: `https://<instance>.domo.com/datasources/<model_uuid>/details/overview`
- Tables added (count)
- Relationships created (count)

---

## Semantic View → Data Model Mapping

| Snowflake Semantic View | Domo Data Model API |
|---|---|
| Table name (e.g. `PTMCOCO.PUBLIC.CLIENTS`) | `schema.objects` key |
| Table's BYOS dataset UUID | `objects[key].datasource` |
| `relationship_type: many_to_one` | `relationships[].cardinality: "many_to_one"` |
| `left_on: "COL"` | `leftKeys: [{"@type": "COLUMN", "columnName": "COL"}]` |
| `right_on: "COL"` | `rightKeys: [{"@type": "COLUMN", "columnName": "COL"}]` |
| Semantic view name | `dataSourceName` |
| Semantic view comment | `dataSourceDescription` |

---

## Script

Run the builder script:
```bash
python3 ~/.snowflake/cortex/plugins/domo-data-model-builder/scripts/build_model.py \
  --semantic-view "PTMCOCO.PUBLIC.VIEW_NAME" \
  --instance "snowflake-demo" \
  --cloud-id "5a22c855-8a4b-4fb4-81b5-4706ccd039c8" \
  --dataset-map '{"PTMCOCO.PUBLIC.TABLE1": "uuid1", "PTMCOCO.PUBLIC.TABLE2": "uuid2"}'
```

Or let the skill interactively resolve datasets and build the payload in-conversation.

---

## Notes

- The `x-csrf-token` header is only needed for browser-session calls. Developer token auth does NOT require CSRF.
- `isNew: true` should be set for all objects on initial creation.
- `include: []` and `exclude: []` mean "include all columns" (empty = no filter).
- **CRITICAL: All relationships must be `primary: true`** — the beta API does not support non-primary relationships (alias-based) via this endpoint.
- **CRITICAL: Max 4 relationships per API call** — the beta endpoint returns 500 if you send more than 4. For models with >4 relationships, prioritize the most important ones.
- **Only include tables that participate in relationships** — "island" tables with no connections cause 500 errors.
- The response includes `"v": 1` on keys in relationships — this is added server-side, not needed in the request.
- Do NOT include `"alias": null` on relationships — omit the field entirely.
- Existing models can be updated via `PUT /api/query/v1/semantic-models/{model_id}` with the same payload format.
- Dataset names in Domo match the fully-qualified Snowflake table name exactly (e.g. `PTMCOCO.PUBLIC.FINSERV_CLIENTS`).
- Use `/api/data/v3/datasources?nameLike=TABLE_NAME` to resolve table names to dataset UUIDs.
