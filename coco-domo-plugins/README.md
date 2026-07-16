# Domo + Snowflake CoCo Plugins

Two Cortex Code (CoCo) plugins for bridging Snowflake and Domo:

1. **domo-ingester** — Universal data ingestion from 1,200+ sources into Snowflake via Domo connectors
2. **domo-data-model-builder** — Reads a Snowflake semantic view and creates a wired Domo Data Model (one shot)

---

## Prerequisites

- **Cortex Code Desktop** (CoCo) installed
- **Domo instance** with developer token access
- **Snowflake account** with a connection configured in CoCo
- **Python 3.11+** with `httpx` and `snowflake-connector-python` installed
- **Domo CLI** (ryuu) authenticated to your instance (`domo login -i <instance> -t <token>`)

---

## Installation

### 1. Copy plugin folders

Copy both plugin folders into your CoCo plugins directory:

```bash
cp -r domo-ingester ~/.snowflake/cortex/plugins/domo-ingester
cp -r domo-data-model-builder ~/.snowflake/cortex/plugins/domo-data-model-builder
```

### 2. Register in registry.json

Edit `~/.snowflake/cortex/plugins/registry.json` and add entries for each plugin:

```json
{
  "domo-ingester": {
    "source": "~/.snowflake/cortex/plugins/domo-ingester",
    "installedAt": "2026-07-15T00:00:00.000Z",
    "updatedAt": "2026-07-15T00:00:00.000Z",
    "active": true,
    "lastUpdateError": null,
    "location": "user",
    "installKind": "local",
    "scope": "user"
  },
  "domo-data-model-builder": {
    "source": "~/.snowflake/cortex/plugins/domo-data-model-builder",
    "installedAt": "2026-07-15T00:00:00.000Z",
    "updatedAt": "2026-07-15T00:00:00.000Z",
    "active": true,
    "lastUpdateError": null,
    "location": "user",
    "installKind": "local",
    "scope": "user"
  }
}
```

### 3. Install Python dependencies

```bash
pip install httpx snowflake-connector-python
```

### 4. Restart CoCo

Restart Cortex Code Desktop for the plugins to be recognized.

---

## Configuration

### Domo Authentication

Both plugins read your Domo developer token from the ryuu session config at:
```
~/.config/configstore/ryuu/<instance>.domo.com.json
```

To set this up:
```bash
domo login -i <your-instance>.domo.com -t <your-developer-token>
```

### Snowflake Connection

The data-model-builder plugin connects to Snowflake using your CoCo connection name (default: `domoinc-domo_modocorp_etk`). Override with the `--connection` flag.

### Instance & Cloud Configuration

Edit the following constants in the scripts to match your environment:

**domo-ingester** (`scripts/create_connector.py` and `scripts/discover.py`):
- `DOMO_INSTANCE` — your Domo instance name (e.g., `"my-company"`)
- `DEFAULT_CLOUD_ID` — your Cloud Amplifier UUID
- `DEFAULT_DATABASE` — target Snowflake database (e.g., `"MY_DB"`)
- `DEFAULT_SCHEMA` — target Snowflake schema (e.g., `"PUBLIC"`)

**domo-data-model-builder** (`scripts/build_model.py`):
- Pass `--instance`, `--cloud-id`, and `--connection` as CLI arguments

### Cloud Amplifier Setup

You need a Cloud Amplifier connection in Domo pointing to your Snowflake account. The Cloud ID is visible in:
- Domo Admin > Cloud Amplifier > your connection settings
- Or via API: `GET /api/data/v1/byos/clouds`

Tables must be registered as BYOS (federated) datasets before the data-model-builder can wire them. Use `--auto-register` flag to auto-register missing tables.

---

## Usage

### domo-ingester

**Trigger phrases in CoCo:** "ingest", "pull data from", "connect to", "import from [source]"

#### Using a recipe (instant):
```bash
python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/create_connector.py \
  --recipe ~/.snowflake/cortex/plugins/domo-ingester/recipes/jira-oauth.json \
  --values '{"report": "query", "jql": "assignee=currentUser()"}' \
  --table-name "MY_JIRA_ISSUES"
```

#### Discovering a new connector:
```bash
python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/discover.py --search "salesforce"
python3 ~/.snowflake/cortex/plugins/domo-ingester/scripts/discover.py --details "salesforce"
```

#### Adding new recipes:
After a successful ad-hoc connector creation with `--save-recipe`, the config is saved to `recipes/<provider-key>.json` for instant reuse.

### domo-data-model-builder

**Trigger phrases in CoCo:** "build a data model", "create a data model from semantic view", "push semantic view to domo"

```bash
python3 ~/.snowflake/cortex/plugins/domo-data-model-builder/scripts/build_model.py \
  --semantic-view "MY_DB.PUBLIC.MY_SEMANTIC_VIEW" \
  --instance "my-company" \
  --cloud-id "your-cloud-amplifier-uuid" \
  --auto-register
```

Options:
- `--dry-run` — print the API payload without creating
- `--dataset-map '{"DB.SCHEMA.TABLE": "uuid"}'` — manually map tables to dataset UUIDs
- `--model-name "Custom Name"` — override the auto-generated model name

---

## Included Recipes (domo-ingester)

| Recipe | Source | Auth | Notes |
|--------|--------|------|-------|
| `google-sheets.json` | Google Sheets | OAuth (account in Domo UI) | Pass sheet URL + tab name |
| `jira-oauth.json` | Jira Cloud | OAuth (account in Domo UI) | Supports JQL queries |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `No token found` | Run `domo login -i <instance>.domo.com -t <token>` |
| `httpx` not installed | `pip install httpx` |
| Snowflake connection error | Verify your CoCo connection name in settings |
| BYOS dataset not found | Register tables first via Cloud Amplifier or use `--auto-register` |
| OAuth account expired | Re-authorize in Domo UI at `/datacenter/accounts` |
| API 500 on model creation | Check: max 4 relationships, no island tables, all `primary: true` |

---

## File Structure

```
domo-ingester/
├── plugin.json              # CoCo plugin manifest
├── skills/
│   └── domo-ingester.md     # Skill definition (triggers, workflow)
├── scripts/
│   ├── discover.py          # Search/inspect connector providers
│   ├── create_connector.py  # Create stream + execute + poll
│   └── list_recipes.py      # List available recipes
└── recipes/
    ├── google-sheets.json   # Google Sheets recipe
    └── jira-oauth.json      # Jira Cloud recipe

domo-data-model-builder/
├── plugin.json              # CoCo plugin manifest
├── skills/
│   └── domo-data-model-builder.md  # Skill definition
└── scripts/
    └── build_model.py       # Parse semantic view + create model
```
