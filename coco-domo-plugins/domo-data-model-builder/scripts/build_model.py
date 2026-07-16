#!/usr/bin/env python3
"""
Domo Data Model Builder
Reads a Snowflake semantic view and creates a Domo Data Model via API.
"""

import argparse
import json
import os
import re
import ssl
import sys
import urllib.request
import urllib.error

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE


def get_domo_token(instance):
    """Resolve token from ryuu config."""
    config_path = os.path.expanduser(f"~/.config/configstore/ryuu/{instance}.domo.com.json")
    if os.path.exists(config_path):
        with open(config_path) as f:
            data = json.load(f)
        return data.get("refreshToken") or data.get("accessToken") or data.get("token")
    return None


def domo_request(instance, path, method="GET", body=None, token=None):
    """Make a Domo API request."""
    url = f"https://{instance}.domo.com{path}"
    headers = {
        "Content-Type": "application/json;charset=utf-8",
        "Accept": "application/json",
        "X-DOMO-Developer-Token": token,
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        error_body = e.read().decode() if e.fp else ""
        print(f"ERROR {e.code}: {error_body}", file=sys.stderr)
        sys.exit(1)


def get_semantic_view_ddl(view_name, connection="domoinc-domo_modocorp_etk"):
    """Get semantic view DDL from Snowflake via connector."""
    import snowflake.connector
    conn = snowflake.connector.connect(connection_name=connection)
    try:
        cur = conn.cursor()
        cur.execute(f"SELECT GET_DDL('SEMANTIC VIEW', '{view_name}')")
        row = cur.fetchone()
        return row[0] if row else ""
    finally:
        conn.close()


def parse_semantic_view(ddl):
    """Parse semantic view DDL to extract tables and relationships.
    
    DDL format:
      tables ( ALIAS as DB.SCHEMA.TABLE primary key (COL), ... )
      relationships ( NAME as ALIAS(COL) references ALIAS(COL), ... )
    """
    tables = []
    relationships = []

    table_pattern = re.compile(
        r"tables\s*\((.*?)\)\s*relationships",
        re.DOTALL | re.IGNORECASE
    )
    table_match = table_pattern.search(ddl)
    if table_match:
        table_block = table_match.group(1)
        table_refs = re.findall(
            r"(\w+)\s+as\s+(\w+\.\w+\.\w+)",
            table_block, re.IGNORECASE
        )
        for alias, full_name in table_refs:
            tables.append({"name": full_name.upper(), "alias": alias.upper()})

    alias_to_table = {t["alias"]: t["name"] for t in tables}

    rel_pattern = re.compile(
        r"relationships\s*\((.*?)\)\s*(?:facts|dimensions|metrics)",
        re.DOTALL | re.IGNORECASE
    )
    rel_match = rel_pattern.search(ddl)
    if rel_match:
        rel_block = rel_match.group(1)
        rel_items = re.findall(
            r"\w+\s+as\s+(\w+)\((\w+)\)\s+references\s+(\w+)\((\w+)\)",
            rel_block, re.IGNORECASE
        )
        for left_alias, left_col, right_alias, right_col in rel_items:
            left_table = alias_to_table.get(left_alias.upper(), left_alias.upper())
            right_table = alias_to_table.get(right_alias.upper(), right_alias.upper())
            relationships.append({
                "left": left_table,
                "right": right_table,
                "left_col": left_col.upper(),
                "right_col": right_col.upper(),
                "cardinality": "many_to_one",
            })

    return tables, relationships


def resolve_dataset_map(tables, instance, cloud_id, token, auto_register=False):
    """Resolve Snowflake table names to Domo BYOS dataset UUIDs.
    
    1. Query /api/data/v3/datasources by table name to find existing BYOS datasets
    2. Match by exact name (dataset name == fully qualified Snowflake table name)
    3. Optionally register missing tables via BYOS register API
    """
    dataset_map = {}
    
    for t in tables:
        resp = domo_request(
            instance,
            f"/api/data/v3/datasources?limit=5&offset=0&sort=name&nameLike={t['name']}",
            token=token
        )
        found = False
        for ds in resp.get("dataSources", []):
            if ds["name"] == t["name"]:
                dataset_map[t["name"]] = ds["id"]
                print(f"    FOUND: {t['name']} -> {ds['id']}")
                found = True
                break
        if not found:
            print(f"    MISSING: {t['name']}")

    missing = [t for t in tables if t["name"] not in dataset_map]

    if missing and auto_register:
        print(f"  Registering {len(missing)} tables via BYOS...")
        register_payload = []
        for t in missing:
            parts = t["name"].split(".")
            register_payload.append({
                "dataProviderKey": "snowflake",
                "databaseName": parts[0],
                "schemaName": parts[1],
                "tableName": parts[2],
            })
        resp = domo_request(
            instance,
            f"/api/data/v1/byos/register/{cloud_id}",
            method="POST",
            body=register_payload,
            token=token
        )
        results = resp.get("results", []) if isinstance(resp, dict) else resp
        for item in results:
            table_name = f"{item.get('databaseName','')}.{item.get('schemaName','')}.{item.get('tableName','')}"
            ds_id = item.get("datasource")
            if not ds_id and item.get("error", {}).get("code") == "ALREADY_REGISTERED":
                msg = item["error"].get("message", "")
                import re as _re
                match = _re.search(r"registered as ([0-9a-f-]+)", msg)
                if match:
                    ds_id = match.group(1)
            if ds_id:
                dataset_map[table_name] = ds_id
                print(f"    REGISTERED: {table_name} -> {ds_id}")

    return dataset_map


def build_model_payload(model_name, description, tables, relationships, dataset_map, cloud_id):
    """Build the Domo Data Model creation payload."""
    MAX_RELS = 4  # Beta API limit: max 4 primary relationships per model

    rels = []
    for i, r in enumerate(relationships[:MAX_RELS]):
        rels.append({
            "primary": True,
            "joinType": "INNER",
            "left": r["left"],
            "right": r["right"],
            "cardinality": r["cardinality"],
            "leftKeys": [{"@type": "COLUMN", "columnName": r["left_col"]}],
            "rightKeys": [{"@type": "COLUMN", "columnName": r["right_col"]}],
        })
    if len(relationships) > MAX_RELS:
        print(f"  WARNING: Beta API limit is {MAX_RELS} relationships. Skipping {len(relationships) - MAX_RELS} relationships.", file=sys.stderr)
        print(f"  Skipped: {[f'{r[\"left\"]}->{r[\"right\"]}' for r in relationships[MAX_RELS:]]}", file=sys.stderr)

    connected = set()
    for r in rels:
        connected.add(r["left"])
        connected.add(r["right"])

    objects = {}
    for t in tables:
        if t["name"] not in connected:
            continue
        ds_id = dataset_map.get(t["name"])
        if not ds_id:
            print(f"WARNING: No dataset UUID for {t['name']}, skipping", file=sys.stderr)
            continue
        objects[t["name"]] = {
            "type": "DATASET",
            "datasource": ds_id,
            "isNew": True,
            "include": [],
            "exclude": [],
            "dataProviderType": "snowflake",
            "cloudId": cloud_id,
        }

    return {
        "dataSourceName": model_name,
        "dataSourceDescription": description,
        "lastUpdated": None,
        "schema": {
            "objects": objects,
            "relationships": rels,
        },
        "cloudId": "",
        "canEdit": False,
    }


def build_layout(tables, dataset_map):
    """Generate canvas positions for tables."""
    positions = {}
    col = 0
    row = 0
    for t in tables:
        ds_id = dataset_map.get(t["name"])
        if not ds_id:
            continue
        positions[ds_id] = {
            "c": "#31689B",
            "x": col * 448,
            "y": row * 300,
        }
        col += 1
        if col >= 4:
            col = 0
            row += 1
    return positions


def main():
    parser = argparse.ArgumentParser(description="Create Domo Data Model from Snowflake Semantic View")
    parser.add_argument("--semantic-view", required=True, help="Fully qualified semantic view name")
    parser.add_argument("--instance", required=True, help="Domo instance (e.g. snowflake-demo)")
    parser.add_argument("--cloud-id", required=True, help="Cloud Amplifier UUID")
    parser.add_argument("--dataset-map", help="JSON object mapping table names to dataset UUIDs (auto-resolved if omitted)")
    parser.add_argument("--auto-register", action="store_true", help="Auto-register missing tables via BYOS")
    parser.add_argument("--model-name", help="Override model name (default: semantic view name)")
    parser.add_argument("--description", default="", help="Model description")
    parser.add_argument("--connection", default="domoinc-domo_modocorp_etk", help="Snowflake connection name")
    parser.add_argument("--token", help="Domo developer token (auto-resolved from ryuu config if omitted)")
    parser.add_argument("--ddl-file", help="Path to a file containing the semantic view DDL (skip Snowflake query)")
    parser.add_argument("--dry-run", action="store_true", help="Print payload without creating")
    args = parser.parse_args()

    token = args.token or get_domo_token(args.instance)
    if not token:
        print("ERROR: No token found. Pass --token or ensure ryuu config exists.", file=sys.stderr)
        sys.exit(1)

    if args.dataset_map:
        dataset_map = json.loads(args.dataset_map)
    else:
        dataset_map = None

    print(f"Reading semantic view: {args.semantic_view}")
    if args.ddl_file:
        with open(args.ddl_file) as f:
            ddl = f.read()
    else:
        ddl = get_semantic_view_ddl(args.semantic_view, args.connection)
    if not ddl:
        print("ERROR: Could not retrieve DDL", file=sys.stderr)
        sys.exit(1)

    tables, relationships = parse_semantic_view(ddl)
    print(f"  Found {len(tables)} tables, {len(relationships)} relationships")

    if not dataset_map:
        print("  Resolving dataset UUIDs from Domo...")
        dataset_map = resolve_dataset_map(tables, args.instance, args.cloud_id, token, args.auto_register)
        unresolved = [t["name"] for t in tables if t["name"] not in dataset_map]
        if unresolved:
            print(f"\nERROR: Could not resolve {len(unresolved)} tables:", file=sys.stderr)
            for name in unresolved:
                print(f"  - {name}", file=sys.stderr)
            print("\nRe-run with --auto-register to register them, or pass --dataset-map manually.", file=sys.stderr)
            sys.exit(1)

    model_name = args.model_name or args.semantic_view.split(".")[-1].replace("_", " ").title()
    payload = build_model_payload(model_name, args.description, tables, relationships, dataset_map, args.cloud_id)

    if args.dry_run:
        print("\n--- DRY RUN: Payload ---")
        print(json.dumps(payload, indent=2))
        return

    print(f"Creating model: {model_name}")
    result = domo_request(args.instance, "/api/query/v1/semantic-models", method="POST", body=payload, token=token)
    model_id = result.get("dataSourceId")
    print(f"  Model created: {model_id}")

    positions = build_layout(tables, dataset_map)
    layout_body = {
        "type": "json",
        "context": "data_model",
        "name": "ui_settings",
        "datasource": model_id,
        "value": json.dumps(positions),
    }
    domo_request(args.instance, "/api/query/v1/property/save", method="POST", body=layout_body, token=token)
    print(f"  Layout saved ({len(positions)} tables positioned)")

    print(f"\nDone!")
    print(f"  URL: https://{args.instance}.domo.com/datasources/{model_id}/details/overview")
    print(f"  Tables: {len(tables)}")
    print(f"  Relationships: {len(relationships)}")


if __name__ == "__main__":
    main()
