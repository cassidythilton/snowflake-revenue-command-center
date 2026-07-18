#!/usr/bin/env python3
"""Build the Code Engine v1.6.0 version body from the deployed 1.5.0 template.

Adds AI Readiness functions (Horizon read + Domo AI Readiness read/sync/wipe)
and swaps in the edited functions.js as the version `code`.
"""
import json

TEMPLATE = "/tmp/ce_v150.json"
CODE = "snowflake-command-center/codeengine/functions.js"
OUT = "/tmp/ce_v160_body.json"
NEW_VERSION = "1.6.0"
DESC = "Add AI Readiness: Horizon source-context read + Domo AI Readiness sync/wipe (governed metadata mirror)."


def txt(name, nullable=False):
    return {"name": name, "displayName": name, "type": "text", "value": None,
            "nullable": nullable, "isList": False, "children": [], "entitySubType": None}


def obj_out():
    return {"name": "result", "displayName": "result", "type": "object", "value": None,
            "nullable": True, "isList": False, "children": [], "entitySubType": None}


def fn(name, display, desc, inputs):
    return {"name": name, "displayName": display, "description": desc,
            "isPrivate": False, "inputs": inputs, "output": obj_out()}


NEW_FNS = [
    fn("getHorizonReadinessState", "Get Horizon Readiness State",
       "Read a governed gold view's Horizon column context + synonyms (source of truth).",
       [txt("view")]),
    fn("getDomoAiReadiness", "Get Domo AI Readiness",
       "Read the current Domo AI Readiness data dictionary for a federated dataset.",
       [txt("datasetId")]),
    fn("syncDomoAiReadiness", "Sync Domo AI Readiness",
       "Write Horizon-prepared column context + synonyms into the Domo AI Readiness dictionary.",
       [txt("datasetId"), txt("desiredState", True), txt("columns", True)]),
    fn("wipeDomoAiReadiness", "Wipe Domo AI Readiness",
       "Clear column context + synonyms from the Domo AI Readiness dictionary.",
       [txt("datasetId"), txt("columns", True)]),
]


def main():
    tpl = json.load(open(TEMPLATE))
    code = open(CODE).read()
    # The parts=code view omits function specs; pull them from the full package dump.
    existing = tpl.get("functions") or json.load(open("/tmp/ce_pkg.json"))["versions"][0]["functions"]
    have = {f["name"] for f in existing}
    functions = list(existing) + [f for f in NEW_FNS if f["name"] not in have]
    body = {
        "version": NEW_VERSION,
        "description": DESC,
        "code": code,
        "functions": functions,
        "configuration": tpl.get("configuration", {}),
    }
    json.dump(body, open(OUT, "w"))
    print(f"Wrote {OUT}")
    print(f"  code bytes: {len(code)}")
    print(f"  functions: {len(functions)} (added {len(functions) - len(existing)})")
    print("  new fn names:", [f['name'] for f in NEW_FNS])


if __name__ == "__main__":
    main()
