#!/usr/bin/env python3
"""Discover Domo connector providers by keyword search."""

import argparse
import json
import pathlib
import sys

import httpx

DOMO_INSTANCE = "snowflake-demo"
BASE_URL = f"https://{DOMO_INSTANCE}.domo.com/api"
RYUU_CONFIG = pathlib.Path.home() / ".config" / "configstore" / "ryuu" / f"{DOMO_INSTANCE}.domo.com.json"


def get_headers():
    config = json.loads(RYUU_CONFIG.read_text())
    return {"X-DOMO-Developer-Token": config["refreshToken"], "Accept": "application/json"}


def search_providers(keyword: str) -> list[dict]:
    headers = get_headers()
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{BASE_URL}/data/v1/providers", headers=headers, params={"limit": 1300})
        if resp.status_code >= 400:
            print(f"ERROR: {resp.status_code} {resp.text[:200]}", file=sys.stderr)
            sys.exit(1)
        providers = resp.json()

    keyword_lower = keyword.lower()
    matches = [
        p for p in providers
        if keyword_lower in p.get("key", "").lower() or keyword_lower in p.get("name", "").lower()
    ]
    return matches


def get_provider_details(provider_key: str) -> dict:
    headers = get_headers()
    with httpx.Client(timeout=30) as client:
        resp = client.get(f"{BASE_URL}/data/v1/providers/{provider_key}", headers=headers)
        if resp.status_code >= 400:
            print(f"ERROR: Provider '{provider_key}' not found ({resp.status_code})", file=sys.stderr)
            sys.exit(1)
        return resp.json()


def format_provider_summary(provider: dict) -> dict:
    auth_fields = []
    for field in provider.get("authenticationSchemeConfiguration", []):
        if field.get("name") in ("allowExternalUse", "secretId"):
            continue
        auth_fields.append({
            "name": field["name"],
            "label": field.get("text", field["name"]),
            "type": field.get("type", "string"),
            "required": field.get("required", False),
            "default": field.get("defaultValue", ""),
            "tooltip": field.get("tooltipText", ""),
        })

    return {
        "key": provider.get("key"),
        "name": provider.get("name"),
        "id": provider.get("id"),
        "auth_scheme": provider.get("authenticationScheme", "none"),
        "default_connector_id": provider.get("defaultConnectorId", ""),
        "auth_fields": auth_fields,
    }


def main():
    parser = argparse.ArgumentParser(description="Discover Domo connector providers")
    parser.add_argument("--search", help="Search keyword (e.g., 'jira', 'salesforce', 'hubspot')")
    parser.add_argument("--details", help="Get full details for a specific provider key")
    parser.add_argument("--list-accounts", action="store_true", help="List existing Domo accounts")
    args = parser.parse_args()

    if args.list_accounts:
        headers = get_headers()
        with httpx.Client(timeout=30) as client:
            resp = client.get(f"{BASE_URL}/data/v1/accounts", headers=headers, params={"limit": 100})
            accounts = resp.json()
        print(json.dumps(accounts, indent=2))
        return

    if args.details:
        provider = get_provider_details(args.details)
        summary = format_provider_summary(provider)
        print(json.dumps(summary, indent=2))
        return

    if args.search:
        matches = search_providers(args.search)
        if not matches:
            print(f"No providers found matching '{args.search}'")
            return

        results = []
        for m in matches:
            results.append({
                "key": m.get("key"),
                "name": m.get("name"),
                "auth_scheme": m.get("authenticationScheme", "none"),
                "default_connector_id": m.get("defaultConnectorId", ""),
            })

        print(json.dumps(results, indent=2))
        return

    parser.print_help()


if __name__ == "__main__":
    main()
