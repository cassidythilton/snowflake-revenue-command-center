#!/usr/bin/env python3
"""List available connector recipes."""

import json
import pathlib
import sys

RECIPES_DIR = pathlib.Path(__file__).parent.parent / "recipes"


def main():
    if not RECIPES_DIR.exists():
        print("No recipes directory found.")
        sys.exit(1)

    recipes = sorted(RECIPES_DIR.glob("*.json"))
    if not recipes:
        print("No recipes available yet.")
        return

    results = []
    for r in recipes:
        data = json.loads(r.read_text())
        results.append({
            "file": r.name,
            "provider_key": data.get("provider_key"),
            "provider_name": data.get("provider_name"),
            "account_id": data.get("account_id"),
            "account_note": data.get("account_note", ""),
            "tested": data.get("tested", False),
            "last_used": data.get("last_used", "never"),
        })

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
