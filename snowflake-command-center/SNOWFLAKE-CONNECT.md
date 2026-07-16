# Connecting the Command Center to Snowflake (Domo-instance steps)

These are the **live-instance** steps that turn the sample-data app into a live
one. Everything here happens in the target **Domo instance** and **Snowflake
account** — it is not code in this repo. The app already renders from a live
Cortex seed (`public/mock/forecast-home.json`); completing these steps flips the
mode pill from **Sample data** to **Live · Snowflake**.

## 0. Prerequisites (already done in this repo + instance)
- `snowflake/00_setup/00_setup.sql` applied → `REVENUE_CC_WH`, `SNOWFLAKE_REVENUE_CC.CORE`, roles `REVENUE_CC_READER` / `REVENUE_CC_WRITER`.
- `snowflake/10_data/` loaded, `snowflake/20_semantics/REVENUE_CC_ANALYST` created, `REVENUE_CC_READER` granted `SELECT` on it.
- Capability gate **G2** (auth) = PASS: key-pair JWT service identity via a Domo-managed account.
- **Grants applied** (via `cortex`, `SECURITYADMIN`): `DOMO_CE_USER` now holds `REVENUE_CC_READER`, `REVENUE_CC_WRITER`, `REVENUE_CC_READER_WEST`, `REVENUE_CC_READER_EAST`; `DOMO_CE_ROLE` holds `REVENUE_CC_READER` (default context for the Agent `:run` endpoint, which takes no explicit role).

## Auth model (adopted from the reference package)
`codeengine/functions.js` uses the **exact** auth/integration strategy of the reference
**"Snowflake Cortex Analyst"** package `7b6a2baa-1ef1-4b7d-b0c5-ca750c452c89`, against the same
`DOMOINC-DOMOPARTNER` environment:

- **No pasted keys.** `getSnowflakeJwt(ACCOUNT_ID)` calls `sdk.getAccount(148)` and reads
  `properties.{privateKey, account, username}` from the **Domo-managed key-pair account 148**
  (`domopartner.us-east-1`, Snowflake user `DOMO_CE_USER`), then hand-builds an RS256
  `KEYPAIR_JWT` (`iss = DOMOPARTNER.DOMO_CE_USER.SHA256:<fp>`). The private key never touches
  this file, git, or the browser.
- **Host:** `https://domopartner.us-east-1.snowflakecomputing.com` — `/api/v2/statements`,
  `/api/v2/cortex/analyst/message`, and the Agent `:run` endpoint.
- **Cloud Amplifier (BYOS):** `getSnowflakeIntegrations()` (`GET /api/query/v1/byos/accounts?filter=deviceEngine:SNOWFLAKE`)
  and `registerCloudAmplifierTable(integrationId, database, schema, table, dataProviderKey)`
  (`POST /api/data/v1/byos/register/{integrationId}`) — both via `codeengine.sendRequest` (session
  identity), no Snowflake JWT needed.

## 1. Code Engine package — CREATED (not yet released)
Created via `community-domo-cli code-engine create-package`, then a new version added via
`POST /codeengine/v2/packages` with `id`+`version` (create/new-version only — **not released**, per instruction):

- **Package name:** `Snowflake Revenue Command Center`
- **Package id:** `f72f6d3d-fff6-45e9-bdb3-96d040cc5d47`
- **Version:** `1.1.0` (unreleased; `1.0.0` retained). The app manifest points at `1.1.0`.
- **Functions (18):** `ping`, `runSql`, `getForecastHome`, `askAnalyst` *(now multi-turn)*, `askCortexAgent`, `runModelInference`, `getOpsState`, `createScenario`, `updateScenarioStatus`, `deleteScenario`, `createFeedback`, `getApprovalQueue`, `writeActionStatus`, `getGovernance`, **`describeSemanticView`**, **`alterSemanticView`**, `getSnowflakeIntegrations`, `registerCloudAmplifierTable`.
- **Code:** the full `codeengine/functions.js` (~49 KB) is stored in the version; `configuration.accountsMapping` is `[]` (auth is via `sdk.getAccount(148)`, same as the reference).

The app `manifest.json` `packagesMapping` is wired to this `packageId` + `version 1.1.0` with full
`parameters`/`output` contracts for all 18 functions, and `collectionsMapping` declares the two
AppDB collections the Cortex Analyst chatbot uses (see below).

### AppDB collections (Cortex Analyst chatbot)
Declared in `manifest.json` `collectionsMapping`; Domo provisions them on publish:
- **`recent_queries`** — persisted question history for the chat's "Recent questions" rail
  (`query_text`, `sql_generated`, `result_columns`, `result_row_count`, `created_at`, `analyst_message`).
- **`configuration`** — Snowflake connection defaults the app can read/write
  (`snowflake_warehouse`, `snowflake_database`, `snowflake_schema`, `snowflake_role`, `snowflake_view`).

Offline (no Domo runtime) these fall back to `localStorage`, so the rail + config survive preview reloads.

## 2. Remaining manual steps before the app runs live
1. **Share account 148 with the package.** `sdk.getAccount(148)` only succeeds if the account is
   accessible to the package owner. In Domo → **Admin → Authentication → Accounts** (or the account's
   share dialog), share the `domopartner.us-east-1` Snowflake key-pair account (id `148`, user
   `DOMO_CE_USER`) with this Code Engine package / its owner. (The reference package already has it;
   this new package must be granted the same access.)
2. **Release when ready.** Version `1.1.0` is intentionally unreleased. When you want the app to call it
   in production, say **"release"** and it will be released.
3. **Smoke test** after sharing + release: call `ping()` → expect `IDENTITY.ROLE = REVENUE_CC_READER`,
   `ACCOUNT` = `DOMOPARTNER`. Then `getForecastHome("Executive Sponsor")` should return live KPIs, and
   `describeSemanticView()` should return the parsed model (9 tables / 14 rels / 5 verified queries).

## 3. Register live data via Cloud Amplifier (optional for Forecast Home)
Forecast Home reads through the CE bridge (`getForecastHome`) and does **not**
require dataset mappings. Cloud Amplifier is still recommended so other Domo
surfaces (cards, Chat v2) can read the same governed objects with no copy:
1. Domo → Data → **Cloud Amplifier / Snowflake** connection using `SVC_REVENUE_CC`.
2. Register the 5 gold views as federated datasets.
3. Paste each `dataSetId` into `manifest.json` `datasetsMapping` (replace `REPLACE_AFTER_CLOUD_AMPLIFIER`).

## 4. Publish the app
1. `manifest.json` `proxyId` must equal the Code Engine proxy alias (`snowflakece`).
2. Publish the pro-code app (App Studio). On first publish, capture the returned app id.
3. Open the app: the mode pill should read **Live · Snowflake** and KPIs/forecast/regional risk/queue should match the semantic-view numbers, scoped by the selected persona.

## Code Engine contract (for the app + manifest)
| Function | Params | Output shape |
|---|---|---|
| `ping` | — | `{ status, identity:{VERSION,ACCOUNT,ROLE,WAREHOUSE} }` |
| `runSql` | `statement:string`, `role?:string` | SQL API ResultSet `{ resultSetMetaData, data }` |
| `getForecastHome` | `persona?:string` | `{ response: { status, mode, kpis, actualVsForecast[], regionalRisk[], actionQueue, ... } }` |
| `askAnalyst` | `question:string`, `persona?:string`, `conversationHistory?:object[]` | `{ response: { status, interpretation, sql, columns[], rows[], suggestions[], conversationHistory[], turn, api } }` — multi-turn (threads history back to `/message`) |
| `describeSemanticView` | `view?:string` | `{ response: { status, view, sql, model:{ stats, tables[], relationships[], verifiedQueries[], customInstruction } } }` — parsed `DESCRIBE SEMANTIC VIEW` |
| `alterSemanticView` | `ddl:string` | `{ response: { status, executed, ddl, error? } }` — guarded, best-effort `ALTER SEMANTIC VIEW` (WRITER; succeeds only if the identity owns the view) |
| `askCortexAgent` | `question:string`, `persona?:string` | `{ response: { status, answer, sql, searchQuery, citations[], toolsFired, api } }` |
| `runModelInference` | `accountId:string` | `{ response: { status, prediction:{probability,label,predictedClass}, features, model, sql } }` |
| `getOpsState` | — | `{ response: { status, scenarios[], feedback[] } }` |
| `createScenario` / `updateScenarioStatus` / `deleteScenario` / `createFeedback` | scalar params | `{ response: { status, action } }` (WRITER) |
| `getApprovalQueue` | `persona?:string` | `{ response: { status, pending[], writeback[], protected:{baseline,writeback,total,...} } }` |
| `writeActionStatus` | `actionId, accountId?, accountName?, region?, recommendation?, approvalStatus?, approvedBy?, executionStatus?, actualRevenueProtected?` | `{ response: { status, action } }` (WRITER, MERGE) |
| `getGovernance` | — | `{ response: { status, parity:{query,roles[]}, masking:{sample[]} } }` — runs the same query under `REVENUE_CC_READER` / `_WEST` / `_EAST` |
| `getSnowflakeIntegrations` | — | `{ response: { status, integrations[] } }` — Cloud Amplifier (BYOS) Snowflake integrations |
| `registerCloudAmplifierTable` | `integrationId, database, schema, table, dataProviderKey?` | `{ response: { status, datasourceId, displayName, datasetStatus } }` — registers a Snowflake object as a Domo dataset |

Reads route through `REVENUE_CC_READER`; the four hybrid-table writers +
`writeActionStatus` route through `REVENUE_CC_WRITER`. `getGovernance` additionally
assumes the region-scoped roles `REVENUE_CC_READER_WEST` / `_EAST` (granted to the
service user) to prove policy enforcement at the query engine. The app unwraps nested
`response` envelopes and falls back to the sample seed if the live call fails, so
a missing credential degrades gracefully rather than breaking the shell.

## 5. Domo Workflow + Task Center overlay (Sprint 6 — optional orchestration)
The Approvals surface runs a fully governed loop on its own (Approve → Execute →
`writeActionStatus` MERGE → protected-revenue rollup), which is the deterministic
fallback. To wrap it in enterprise orchestration on the target instance:
1. **Workflow.** Author a Domo Workflow with an AI-agent tile that calls
   `snowflakece.askCortexAgent` server-side (time-bounded; on timeout, fall back to
   the last cached recommendation so the tile never hangs).
2. **Task Center.** Add an approval task routed to the account owner / regional
   manager. Approve/Reject in Task Center resolves the task.
3. **Writeback.** On approval, the Workflow calls `snowflakece.writeActionStatus`
   (`approvalStatus:'Approved'`, then `executionStatus:'Executed'` with
   `actualRevenueProtected`) — the **`REVENUE_CC_WRITER`** path, distinct from the
   read that built the queue.
4. **Journey.** Drive the app's Action Journey from real Workflow-instance +
   Task-Center signals (not sleep timers); the writeback row + rollup are the
   source of truth for Protected Revenue.

This overlay depends on target-instance Workflow authoring (capability gate G1
context) and is intentionally not required for the demo.

## Governance note (per capability gates)
- Reads run under `REVENUE_CC_READER`; the approved writeback path (Sprint 6) uses `REVENUE_CC_WRITER`.
- Persona scoping is **client-side in sample mode** and **server-side (role/region) in the CE bridge**; true per-viewer Horizon RLS/masking parity is Sprint 7 (gate G3/C8).
