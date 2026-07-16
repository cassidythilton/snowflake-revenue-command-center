#!/usr/bin/env python3
"""Create a Domo connector stream from a recipe or ad-hoc config, and execute it."""

import argparse
import json
import pathlib
import re
import sys
import time

import httpx

DOMO_INSTANCE = "snowflake-demo"
BASE_URL = f"https://{DOMO_INSTANCE}.domo.com/api"
RYUU_CONFIG = pathlib.Path.home() / ".config" / "configstore" / "ryuu" / f"{DOMO_INSTANCE}.domo.com.json"
RECIPES_DIR = pathlib.Path(__file__).parent.parent / "recipes"

DEFAULT_CLOUD_ID = "5a22c855-8a4b-4fb4-81b5-4706ccd039c8"
DEFAULT_DATABASE = "PTMCOCO"
DEFAULT_SCHEMA = "PUBLIC"


def get_headers():
    config = json.loads(RYUU_CONFIG.read_text())
    return {"X-DOMO-Developer-Token": config["refreshToken"], "Accept": "application/json"}


def sanitize_table_name(name: str) -> str:
    name = re.sub(r"[^a-zA-Z0-9_]", "_", name)
    name = re.sub(r"_+", "_", name).strip("_").upper()
    return name


def build_configuration(recipe: dict, user_values: dict, table_name: str) -> list[dict]:
    config = []
    for field in recipe.get("configuration_template", []):
        if field["type"] == "fixed":
            config.append({"category": "METADATA", "name": field["name"], "type": "string", "value": field["value"]})
        elif field["type"] == "user_input":
            value = user_values.get(field["name"], field.get("default", ""))
            config.append({"category": "METADATA", "name": field["name"], "type": "string", "value": value})

    cloud_id = recipe.get("cloud_id", DEFAULT_CLOUD_ID)
    database = recipe.get("target_database", DEFAULT_DATABASE)
    schema = recipe.get("target_schema", DEFAULT_SCHEMA)

    config.extend([
        {"category": "METADATA", "name": "cloud", "type": "string", "value": cloud_id},
        {"category": "METADATA", "name": "cloudStorageLocation.database", "type": "string", "value": database},
        {"category": "METADATA", "name": "cloudStorageLocation.schemaName", "type": "string", "value": schema},
        {"category": "METADATA", "name": "cloudStorageLocation.tableName", "type": "string", "value": table_name},
        {"category": "METADATA", "name": "castToStringFields", "type": "string", "value": ""},
        {"category": "METADATA", "name": "retry.retryNumber", "type": "string", "value": "0"},
        {"category": "METADATA", "name": "_description_", "type": "string", "value": ""},
    ])
    return config


def create_stream(recipe: dict, table_name: str, configuration: list[dict]) -> dict:
    headers = get_headers()
    payload = {
        "transport": {
            "type": "CONNECTOR",
            "description": recipe["transport_description"],
            "version": recipe.get("transport_version", "1"),
        },
        "updateMethod": "REPLACE",
        "dataProvider": {"key": recipe["provider_key"]},
        "account": {"id": recipe["account_id"], "accountId": recipe["account_id"]},
        "dataSource": {
            "name": table_name,
            "description": f"Created by domo-ingester plugin",
            "dataProviderType": recipe["provider_key"],
        },
        "configuration": configuration,
    }

    with httpx.Client(timeout=60) as client:
        resp = client.post(f"{BASE_URL}/data/v1/streams", headers={**headers, "Content-Type": "application/json"}, json=payload)
        if resp.status_code >= 400:
            print(f"ERROR creating stream: {resp.status_code}", file=sys.stderr)
            print(resp.text, file=sys.stderr)
            sys.exit(1)
        return resp.json()


def execute_stream(stream_id: int) -> dict:
    headers = get_headers()
    with httpx.Client(timeout=60) as client:
        resp = client.post(
            f"{BASE_URL}/data/v1/streams/{stream_id}/executions",
            headers={**headers, "Content-Type": "application/json"},
            json={},
        )
        if resp.status_code >= 400:
            print(f"ERROR executing stream: {resp.status_code}", file=sys.stderr)
            print(resp.text, file=sys.stderr)
            sys.exit(1)
        return resp.json()


def poll_execution(stream_id: int, execution_id: int, timeout: int = 300) -> dict:
    headers = get_headers()
    start = time.time()
    with httpx.Client(timeout=30) as client:
        while time.time() - start < timeout:
            resp = client.get(f"{BASE_URL}/data/v1/streams/{stream_id}/executions/{execution_id}", headers=headers)
            if resp.status_code >= 400:
                return {"currentState": "ERROR", "error": resp.text}
            data = resp.json()
            state = data.get("currentState", "UNKNOWN")
            if state in ("SUCCESS", "FAILED", "CANCELLED"):
                return data
            rows = data.get("rowsInserted", 0)
            phase = data.get("latestPhase", {}).get("phaseType", "")
            print(f"  ... {state} ({phase}, {rows} rows so far)")
            time.sleep(10)
    return {"currentState": "TIMEOUT", "message": f"Execution did not complete within {timeout}s. Check Domo UI."}


def save_recipe(recipe: dict, provider_key: str):
    recipe_path = RECIPES_DIR / f"{provider_key}.json"
    RECIPES_DIR.mkdir(parents=True, exist_ok=True)
    recipe_path.write_text(json.dumps(recipe, indent=2))
    print(f"Recipe saved: {recipe_path}")


def main():
    parser = argparse.ArgumentParser(description="Create a Domo connector and ingest data to Snowflake")
    parser.add_argument("--recipe", help="Path to recipe JSON file")
    parser.add_argument("--values", help="JSON string of user_input values (key=config field name)")
    parser.add_argument("--table-name", help="Snowflake table name (uppercase, no spaces)")
    parser.add_argument("--execute-only", type=int, help="Just execute an existing stream by ID")
    parser.add_argument("--no-execute", action="store_true", help="Create stream but don't execute")
    parser.add_argument("--no-poll", action="store_true", help="Execute but don't wait for completion")
    parser.add_argument("--save-recipe", help="After success, save config as a recipe with this provider key")

    # Ad-hoc mode (no recipe file)
    parser.add_argument("--provider-key", help="Provider key for ad-hoc creation")
    parser.add_argument("--account-id", type=int, help="Account ID for ad-hoc creation")
    parser.add_argument("--transport", help="Transport description for ad-hoc creation")
    parser.add_argument("--transport-version", default="1", help="Transport version")
    parser.add_argument("--config", help="JSON string of full configuration array for ad-hoc creation")

    args = parser.parse_args()

    if args.execute_only:
        result = execute_stream(args.execute_only)
        exec_id = result.get("executionId")
        print(f"Execution started: {exec_id}")
        if not args.no_poll:
            print("Polling for completion...")
            final = poll_execution(args.execute_only, exec_id)
            print(f"State: {final.get('currentState')}")
            print(f"Rows: {final.get('rowsInserted', 0)}")
        return

    if args.recipe:
        recipe = json.loads(pathlib.Path(args.recipe).read_text())
    elif args.provider_key and args.account_id and args.transport:
        recipe = {
            "provider_key": args.provider_key,
            "provider_name": args.provider_key,
            "transport_description": args.transport,
            "transport_version": args.transport_version,
            "account_id": args.account_id,
            "cloud_id": DEFAULT_CLOUD_ID,
            "target_database": DEFAULT_DATABASE,
            "target_schema": DEFAULT_SCHEMA,
            "configuration_template": [],
        }
    else:
        parser.error("Provide --recipe OR (--provider-key, --account-id, --transport)")
        return

    if not args.table_name:
        parser.error("--table-name is required")
        return

    table_name = sanitize_table_name(args.table_name)
    user_values = json.loads(args.values) if args.values else {}

    if args.config:
        configuration = json.loads(args.config)
    else:
        configuration = build_configuration(recipe, user_values, table_name)

    print(f"Creating connector:")
    print(f"  Provider: {recipe['provider_key']}")
    print(f"  Account: {recipe['account_id']}")
    print(f"  Table: {recipe.get('target_database', DEFAULT_DATABASE)}.{recipe.get('target_schema', DEFAULT_SCHEMA)}.{table_name}")
    print()

    result = create_stream(recipe, table_name, configuration)
    stream_id = result.get("id")
    ds_id = result.get("dataSource", {}).get("id")

    print(f"Stream created: {stream_id}")
    print(f"Dataset ID: {ds_id}")
    print(f"View at: https://{DOMO_INSTANCE}.domo.com/datasources/{ds_id}")

    if args.no_execute:
        print("Skipping execution (--no-execute)")
        return

    print("\nTriggering execution...")
    exec_result = execute_stream(stream_id)
    exec_id = exec_result.get("executionId")
    print(f"Execution started: {exec_id}")

    if not args.no_poll:
        print("Polling for completion...")
        final = poll_execution(stream_id, exec_id)
        state = final.get("currentState")
        rows = final.get("rowsInserted", 0)
        print(f"\nResult: {state}")
        print(f"Rows ingested: {rows}")

        if state == "SUCCESS":
            db = recipe.get("target_database", DEFAULT_DATABASE)
            schema = recipe.get("target_schema", DEFAULT_SCHEMA)
            print(f"\nData available at: {db}.{schema}.{table_name}")

            if args.save_recipe:
                recipe["tested"] = True
                recipe["last_used"] = time.strftime("%Y-%m-%d")
                save_recipe(recipe, args.save_recipe)
        else:
            errors = final.get("errors", [])
            if errors:
                print(f"Errors: {json.dumps(errors, indent=2)}")
            sys.exit(1)
    else:
        print(f"Execution running (stream={stream_id}, execution={exec_id})")
        print(f"Check status: python3 {__file__} --execute-only {stream_id}")


if __name__ == "__main__":
    main()
