#!/usr/bin/env python3
"""Author the "Snowflake Revenue CC - Renewal Risk Retention" Domo Workflow.

Full-parity agentic approval loop (Snowflake-native adaptation of the Databricks
Pattern 4 reference):

  rootNode (inputs from startRetentionWorkflow)
    -> AI_AGENT "Retention triage agent" (Domo AI agent tile; calls the CE tool
       askRetentionAgent -> the Snowflake Cortex Agent REVENUE_CC_AGENT)
    -> userTaskNode (human approval form in the native "Renewal Risk Approvals"
       Task Center queue)
    -> conditionalGateway (Approved? Basic Equals on the Decision output)
    -> serviceTask snowflakece.writeActionStatus (Approved/Executed | Rejected/Voided)
    -> end.

Idempotent; reuses the model/queue/form recorded in tools/workflow_state.json.
No secrets (uses the community-domo-cli ryuu-session login). After running,
open the workflow in Domo and click Deploy to register the start trigger.
"""
from __future__ import annotations

import json
import sys
import uuid
from pathlib import Path

VENV = Path.home() / ".local/pipx/venvs/community-domo-cli/lib"
for _p in VENV.glob("python*/site-packages"):
    sys.path.insert(0, str(_p))
import random
import string
from community_domo_cli.config import resolve_config  # noqa: E402
from community_domo_cli.http import DomoClient, DomoApiError  # noqa: E402

HERE = Path(__file__).resolve().parent
STATE_FILE = HERE / "workflow_state.json"

INSTANCE = "snowflake-demo"
MODEL_NAME = "Snowflake Revenue CC - Renewal Risk Retention"
VERSION = "1.0.0"
ASSIGNEE_USER_ID = "1614187674"                      # Cassidy Hilton
QUEUE_ID = "6383ccfa-54aa-4c23-b855-9f3fe619cad4"    # Renewal Risk Approvals
CE_PACKAGE_ID = "f72f6d3d-fff6-45e9-bdb3-96d040cc5d47"
CE_PACKAGE_NAME = "snowflakece"
CE_FUNCTION = "writeActionStatus"
CE_VERSION = "1.4.0"
AGENT_TOOL_FUNCTION = "askRetentionAgent"
FORM_VERSION = 1

# Workflow inputs (supplied by snowflakece.startRetentionWorkflow start API).
INPUTS = [
    ("actionId", "text", True),
    ("account", "text", False),
    ("recommendation", "text", False),
    ("persona", "text", False),
    ("protectedRevenue", "decimal", False),
    ("sourceQuestion", "text", False),
]


def client() -> DomoClient:
    cfg = resolve_config(None, INSTANCE)
    return DomoClient(instance=cfg.instance, auth_mode=cfg.auth_mode,
                      developer_token=cfg.developer_token, refresh_token=cfg.refresh_token)


def rid(n: int = 15) -> str:
    alphabet = string.ascii_letters + string.digits
    return random.choice(string.ascii_letters) + "".join(random.choice(alphabet) for _ in range(n - 1))


def pretty(obj) -> str:
    return json.dumps(obj, indent=2, default=str)


def load_state() -> dict:
    return json.loads(STATE_FILE.read_text()) if STATE_FILE.exists() else {}


def save_state(state: dict) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


def ensure_model(c, state) -> str:
    if state.get("model_id"):
        return state["model_id"]
    models = c.request("GET", "/workflow/v2/models?limit=200")
    found = [m for m in models if m.get("name") == MODEL_NAME]
    if found:
        state["model_id"] = found[0]["id"]
    else:
        r = c.request("POST", "/workflow/v1/models",
                      json_body={"name": MODEL_NAME,
                                 "description": "Agentic renewal-risk retention: Cortex Agent recommends, human approves, status writes back to Snowflake."})
        state["model_id"] = r["id"]
    save_state(state)
    return state["model_id"]


FORM_FIELDS = [
    ("Account", "SHORT_ANSWER", "text", "Account", None),
    ("Recommended action", "PARAGRAPH", "text", "Recommendation", None),
    ("Cortex Agent recommendation", "PARAGRAPH", "text", "Agent_Recommendation", None),
    ("Protected revenue ($)", "SHORT_ANSWER", "decimal", "Protected_Revenue", None),
    ("Source question / context", "PARAGRAPH", "text", "Source_Question", None),
    ("Decision", "SINGLE_CHOICE", "text", "Decision", ["Approved", "Rejected"]),
]


def ensure_form(c, state, model_id) -> dict:
    if state.get("form_id") and state.get("form_field_ids") and state.get("form_version") == FORM_VERSION:
        return {"id": state["form_id"], "fields": state["form_field_ids"]}
    field_ids = {alias: str(uuid.uuid4()) for (_, _, _, alias, _) in FORM_FIELDS}
    fields = []
    field_config = {}
    for (label, ftype, dtype, alias, choices) in FORM_FIELDS:
        fid = field_ids[alias]
        f = {
            "id": fid, "label": label, "placeholder": "",
            "optional": alias != "Decision",
            "fieldType": ftype, "dataType": dtype,
            "acceptsInput": True, "acceptsOutput": True,
            "options": {"values": choices or [], "acceptsOther": False},
            "alias": alias, "isList": False,
        }
        if choices:
            f["defaultValue"] = "Rejected"
            f["displayAsDropdown"] = False
        fields.append(f)
        field_config[fid] = {"targetMapping": {"target": alias}}
    body = {
        "domainType": "WORKFLOW", "domainId": f"{model_id} - {VERSION}",
        "name": "Approve renewal-risk retention",
        "description": "Review the Cortex Agent's recommended retention action and approve or reject.",
        "sections": [{"id": str(uuid.uuid4()), "title": "", "fields": fields}],
        "settings": {},
        "attributes": [{"type": "paragraph", "children": [{"text": ""}]}],
        "fieldConfiguration": field_config,
        "submitConfiguration": {"type": "UNASSIGNED", "isDatasetOwner": False, "submitType": "INSERT"},
        "searchable": False, "submitConfigurationType": "UNASSIGNED",
    }
    r = c.request("POST", "/forms/v2", json_body=body)
    state["form_id"] = r["id"]
    state["form_field_ids"] = field_ids
    state["form_version"] = FORM_VERSION
    save_state(state)
    return {"id": r["id"], "fields": field_ids}


def build_definition(model_id, form, queue_id) -> dict:
    form_id = form["id"]
    ff = form["fields"]

    var = {name: f"var_{rid(11)}" for (name, _, _) in INPUTS}
    var_decision = f"var_{rid(11)}"

    data_list = []
    for (name, t, _req) in INPUTS:
        data_list.append({
            "id": var[name], "paramName": name, "dataType": t, "isList": False,
            "children": [], "showChildren": False, "entitySubType": None,
            "value": None, "isOutput": False,
        })
    data_list.append({
        "id": var_decision, "paramName": "decision", "dataType": "text", "isList": False,
        "children": [], "showChildren": False, "entitySubType": None,
        "value": "Rejected", "isOutput": True,
    })

    root_inputs = []
    schema_inputs = {}
    for (name, t, req) in INPUTS:
        iid = rid()
        root_inputs.append({
            "aiDescription": None, "children": [], "configType": None, "customMappingType": None,
            "dataType": t, "displayName": name, "entitySubType": None, "flag": "input",
            "id": iid, "isList": False, "mappedTo": var[name], "paramName": name,
            "required": req, "value": None, "visible": True,
        })
        schema_inputs[iid] = {
            "name": name, "type": t, "subType": None, "isList": False,
            "isNullable": not req, "id": iid, "parent": None, "isChild": False,
        }

    root = {
        "id": "rootNode", "position": {"x": 320, "y": 40},
        "data": {"dimensions": {"width": 200, "height": 60}, "title": f"Start {MODEL_NAME}",
                 "description": "", "type": "Start", "_designNode": "rootNode",
                 "isFormStart": False, "formId": None, "input": root_inputs},
        "style": {"zIndex": 3, "outline": "none"}, "index": 0, "type": "rootNode",
    }

    var_agent = f"var_{rid(11)}"
    var_agent_rec = var_agent + ".recommendation"
    data_list.append({
        "id": var_agent, "paramName": "agentRecommendation", "dataType": "object", "isList": False,
        "children": [{
            "id": var_agent_rec, "paramName": "recommendation", "dataType": "text", "isList": False,
            "children": [], "showChildren": False, "entitySubType": None, "value": None, "isOutput": True,
        }],
        "showChildren": True, "entitySubType": None, "value": None, "isOutput": True,
    })

    display = [
        ("Account", "Account", "text", "SHORT_ANSWER", "account"),
        ("Recommendation", "Recommended action", "text", "PARAGRAPH", "recommendation"),
        ("Agent_Recommendation", "Cortex Agent recommendation", "text", "PARAGRAPH", "__agentrec__"),
        ("Protected_Revenue", "Protected revenue ($)", "decimal", "SHORT_ANSWER", "protectedRevenue"),
        ("Source_Question", "Source question / context", "text", "PARAGRAPH", "sourceQuestion"),
    ]
    ut_input = []
    ut_output = []
    for (alias, label, t, ftype, src) in display:
        mapped = var_agent_rec if src == "__agentrec__" else var[src]
        ent = {
            "acceptsInput": True, "children": [], "customMappingType": "form", "dataType": t,
            "datasetMapping": None, "displayName": label, "entitySubType": None,
            "fieldOptionsMappedTo": None, "fieldOptionsValue": None, "flag": "input",
            "formFieldId": ff[alias], "formFieldType": ftype, "id": rid(), "isList": False,
            "mappedTo": mapped, "paramName": alias, "required": False, "value": None,
            "visible": True, "configType": "forms", "useExternalValues": False,
        }
        ut_input.append(ent)
        out = dict(ent)
        out["flag"] = "output"; out["id"] = rid(); out["configType"] = "form"
        ut_output.append(out)
    dec_in = {
        "acceptsInput": True, "children": [], "customMappingType": "form", "dataType": "text",
        "datasetMapping": None, "displayName": "Decision", "entitySubType": None,
        "fieldOptionsMappedTo": None, "fieldOptionsValue": None, "flag": "input",
        "formFieldId": ff["Decision"], "formFieldType": "SINGLE_CHOICE", "id": rid(),
        "isList": False, "mappedTo": None, "paramName": "Decision", "required": True,
        "value": "Rejected", "visible": True, "configType": "forms", "useExternalValues": False,
    }
    ut_input.append(dec_in)
    dec_out = dict(dec_in)
    dec_out["flag"] = "output"; dec_out["id"] = rid(); dec_out["mappedTo"] = var_decision
    dec_out["value"] = None; dec_out["configType"] = "form"
    ut_output.append(dec_out)

    ut_id = rid()
    user_task = {
        "id": ut_id, "position": {"x": 320, "y": 360},
        "data": {
            "dimensions": {"width": 200, "height": 60}, "title": "Approve retention action", "description": "",
            "_designNode": "userTaskNode", "configType": "form",
            "selectedUserTaskTitle": "Approve renewal-risk retention",
            "selectedUserTaskDescription": "",
            "input": ut_input, "output": ut_output, "fieldOptions": [],
            "formId": form_id, "selectedQueue": queue_id,
            "assignedTo": {
                "aiDescription": None, "children": [], "configType": None, "customMappingType": None,
                "dataType": "person", "displayName": "Assigned To", "entitySubType": None,
                "flag": "input", "id": rid(), "isList": False, "mappedTo": None,
                "paramName": "DOMO_ASSIGNED_TO_", "required": True, "value": ASSIGNEE_USER_ID,
                "visible": True,
            },
        },
        "style": {"zIndex": 4, "outline": "none"}, "index": 2, "type": "userTaskNode",
    }

    def stext(t):
        return {"text": t, "bold": False, "italic": False, "underlined": False, "sql": False}

    def svar(varid, name, dtype="text"):
        return {"type": "variable", "children": [stext("")], "dataType": dtype, "id": varid, "name": name, "isList": False}

    ai_id = rid()
    result_id = rid()
    tool_in_id = rid()
    ai_agent = {
        "id": ai_id, "position": {"x": 320, "y": 200},
        "data": {
            "dimensions": {"width": 200, "height": 60},
            "title": "Retention triage agent", "description": "",
            "prompt": {
                "id": rid(), "paramName": "prompt", "dataType": "text", "mappedTo": None,
                "value": [{"type": "paragraph", "children": [
                    stext("At-risk account: "), svar(var["account"], "account"),
                    stext(". Risk context: "), svar(var["sourceQuestion"], "sourceQuestion"),
                    stext(". Seed recommendation: "), svar(var["recommendation"], "recommendation"),
                    stext(". Call the Ask Retention Agent tool (the Snowflake Cortex Agent, which reasons over the governed REVENUE_CC_ANALYST semantic view and Cortex Search) with this account and context, then return ONE concrete recommended retention action plus a one-sentence rationale."),
                ]}],
                "required": True, "isList": False, "children": [], "displayName": "Prompt",
                "visible": True, "flag": "input", "customMappingType": None, "configType": None,
                "entitySubType": None, "aiDescription": None,
            },
            "result": {
                "id": result_id, "paramName": "result", "dataType": "object", "mappedTo": var_agent,
                "value": None, "required": True, "isList": False,
                "children": [{
                    "id": result_id + ".recommendation", "paramName": "recommendation", "dataType": "text",
                    "mappedTo": var_agent_rec, "value": None, "required": True, "isList": False, "children": [],
                    "displayName": "", "visible": True, "flag": "output", "customMappingType": None,
                    "configType": None, "entitySubType": None, "aiDescription": None,
                }],
                "displayName": "Result", "visible": True, "flag": "output", "customMappingType": None,
                "configType": None, "entitySubType": None, "aiDescription": None,
            },
            "agent": {
                "instructions": (
                    "You are a renewal-risk retention analyst for a B2B revenue command center. "
                    "Use the Ask Retention Agent tool — the Snowflake Cortex Agent (REVENUE_CC_AGENT, "
                    "which reasons over the governed REVENUE_CC_ANALYST semantic view via Cortex Analyst "
                    "and grounds on Cortex Search) — passing the account name and risk context from the "
                    "prompt. Based on its governed response, return ONE concrete recommended retention "
                    "action with a one-sentence rationale and what to watch after executing. Put the final "
                    "text in result.recommendation."
                ),
                "tools": [{
                    "functionName": AGENT_TOOL_FUNCTION,
                    "functionDescription": "Ask the Snowflake Cortex Agent for a governed retention recommendation for an at-risk account.",
                    "inputs": [{
                        "id": tool_in_id, "paramName": "prompt", "dataType": "text", "mappedTo": None,
                        "value": None, "required": False, "isList": False, "children": [], "displayName": "prompt",
                        "visible": True, "flag": "input", "customMappingType": None, "configType": None,
                        "entitySubType": None, "aiDescription": None,
                    }],
                    "inputDescriptions": {tool_in_id: "The account name and risk context to analyze."},
                    "id": rid(), "name": "Ask Retention Agent",
                    "description": "Snowflake Cortex Agent (REVENUE_CC_AGENT) over the governed semantic view + Cortex Search.",
                    "packageId": CE_PACKAGE_ID, "packageVersion": CE_VERSION,
                    "output": {
                        "id": rid(), "paramName": "result", "dataType": "object", "mappedTo": None,
                        "value": None, "required": False, "isList": False, "children": [], "displayName": "result",
                        "visible": True, "flag": "output", "customMappingType": None, "configType": None,
                        "entitySubType": None, "aiDescription": None,
                    },
                    "type": "FUNCTION",
                }],
                "context": {"datasets": [], "directories": [], "files": [], "isEmpty": True},
                "outputDescriptions": {},
            },
            "_designNode": "AI_AGENT",
        },
        "style": {"zIndex": 3, "outline": "none"}, "index": 1, "type": "AI_AGENT",
    }

    gateway_id = rid()
    gateway = {
        "id": gateway_id, "position": {"x": 320, "y": 520},
        "data": {"dimensions": {"width": 200, "height": 60}, "title": "Approved?",
                 "description": "Route on the approval decision.",
                 "_designNode": "conditionalGatewayNode", "inclusive": False},
        "style": {"zIndex": 3, "outline": "none"}, "index": 3, "type": "conditionalGatewayNode",
    }

    def service_task(node_id, idx, x, y, title, approval_status, exec_status, protected_mapped):
        def inp(name, dtype, mapped, value, required):
            return {
                "aiDescription": None, "children": [], "configType": None, "customMappingType": None,
                "dataType": dtype, "displayName": name, "entitySubType": None, "flag": "input",
                "id": rid(), "isList": False, "mappedTo": mapped, "paramName": name,
                "required": required, "value": value, "visible": True,
            }
        return {
            "id": node_id, "position": {"x": x, "y": y},
            "data": {
                "dimensions": {"width": 200, "height": 60}, "title": title, "description": "",
                "_designNode": "serviceTaskNode",
                "input": [
                    inp("actionId", "text", var["actionId"], None, True),
                    inp("accountId", "text", None, "", False),
                    inp("accountName", "text", var["account"], None, False),
                    inp("region", "text", None, "", False),
                    inp("recommendation", "text", var["recommendation"], None, False),
                    inp("approvalStatus", "text", None, approval_status, False),
                    inp("approvedBy", "text", None, "cassidy.hilton@domo.com", False),
                    inp("executionStatus", "text", None, exec_status, False),
                    inp("actualRevenueProtected", "decimal", protected_mapped, None if protected_mapped else "0", False),
                ],
                "output": [],
                "taskType": "nebulaFunction",
                "metadata": {
                    "version": CE_VERSION, "settings": {},
                    "packageId": CE_PACKAGE_ID, "packageName": CE_PACKAGE_NAME,
                    "functionName": CE_FUNCTION,
                },
                "usesStructuredOutputs": False,
                "selectedTaskTitle": CE_FUNCTION,
                "selectedTaskDescription": "Write Action Status",
            },
            "style": {"zIndex": 3, "outline": "none"}, "index": idx, "type": "serviceTaskNode",
        }

    approve_id, reject_id = rid(), rid()
    approve_task = service_task(approve_id, 4, 180, 700, "Write Approved status",
                                "Approved", "Executed", var["protectedRevenue"])
    reject_task = service_task(reject_id, 5, 460, 700, "Write Rejected status",
                               "Rejected", "Voided", None)

    end1_id, end2_id = rid(), rid()
    end1 = {"id": end1_id, "position": {"x": 180, "y": 860},
            "data": {"dimensions": {"width": 200, "height": 60}, "title": "Done (approved)", "description": "",
                     "_designNode": "endNode", "terminating": False},
            "style": {"zIndex": 4, "outline": "none"}, "index": 6, "type": "endNode"}
    end2 = {"id": end2_id, "position": {"x": 460, "y": 860},
            "data": {"dimensions": {"width": 200, "height": 60}, "title": "Done (rejected)", "description": "",
                     "_designNode": "endNode", "terminating": False},
            "style": {"zIndex": 4, "outline": "none"}, "index": 7, "type": "endNode"}

    def default_edge(idx, src, tgt, sp, tp, path):
        return {"id": f"edge-{src}-{tgt}-{rid(11)}", "source": src, "target": tgt,
                "data": {"sourcePosition": sp, "targetPosition": tp, "path": path, "title": ""},
                "style": {"zIndex": 5}, "index": idx, "arrowHeadType": "arrow", "type": "defaultEdge"}

    def condition_edge(idx, src, tgt, title, kind, rules, sp, tp, path, ex, en, pill):
        data = {"sourcePosition": sp, "targetPosition": tp, "path": path,
                "entryPosition": en, "exitPosition": ex, "description": "", "title": title,
                "type": kind, "nodeId": rid(), "position": pill,
                "dimensions": {"width": 200, "height": 40}, "splitIndex": 2, "_designNode": "condition"}
        if rules is not None:
            data["rules"] = rules
        return {"id": f"edge-{src}-{tgt}-{rid(11)}", "source": src, "target": tgt,
                "data": data, "style": {}, "index": idx, "arrowHeadType": "arrow", "type": "conditionEdge"}

    approve_rules = [[{
        "variable": {"id": var_decision, "paramName": "decision", "dataType": "text",
                     "isList": False, "children": [], "showChildren": False,
                     "entitySubType": None, "value": None, "isOutput": True},
        "operator": "Equals", "valueType": "Custom", "value": "Approved",
    }]]

    edges = [
        default_edge(8, "rootNode", ai_id, "bottom", "top", [[420, 100], [420, 199]]),
        default_edge(9, ai_id, ut_id, "bottom", "top", [[420, 260], [420, 359]]),
        default_edge(10, ut_id, gateway_id, "bottom", "top", [[420, 420], [420, 519]]),
        condition_edge(11, gateway_id, approve_id, "Approved", "Basic", approve_rules,
                       "bottom", "top", [[420, 580], [280, 640], [280, 699]], "bottom", "top",
                       {"x": 280, "y": 620}),
        condition_edge(12, gateway_id, reject_id, "Rejected", "Default", None,
                       "bottom", "top", [[420, 580], [560, 640], [560, 699]], "bottom", "top",
                       {"x": 560, "y": 620}),
        default_edge(13, approve_id, end1_id, "bottom", "top", [[280, 760], [280, 859]]),
        default_edge(14, reject_id, end2_id, "bottom", "top", [[560, 760], [560, 859]]),
    ]

    return {
        "version": 2,
        "designElements": [root, ai_agent, user_task, gateway, approve_task, reject_task, end1, end2] + edges,
        "dataList": data_list,
        "schema": {"inputs": schema_inputs, "outputs": {}},
    }


def ensure_version(c, model_id) -> None:
    m = c.request("GET", f"/workflow/v1/models/{model_id}")
    have = {v.get("version") for v in (m.get("versions") or [])}
    if VERSION not in have:
        c.request("POST", f"/workflow/v1/models/{model_id}/versions", json_body={"version": VERSION})


def put_definition(c, model_id, definition):
    return c.request("PUT", f"/workflow/v2/models/{model_id}/versions/{VERSION}/definition", json_body=definition)


def validate(c, model_id):
    v = c.request("POST", f"/workflow/v2/models/{model_id}/versions/{VERSION}/validate", json_body={})
    errs = [x for x in v if (x.get("message") or {}).get("validationLevel") == "ERROR"]
    return v, errs


def main() -> int:
    c = client()
    state = load_state()
    state["queue_id"] = QUEUE_ID
    model_id = ensure_model(c, state)
    form = ensure_form(c, state, model_id)
    print("model:", model_id, "| queue:", QUEUE_ID, "| form:", form["id"])

    definition = build_definition(model_id, form, QUEUE_ID)
    (HERE / "workflow_definition.json").write_text(pretty(definition))

    ensure_version(c, model_id)
    try:
        put_definition(c, model_id, definition)
    except DomoApiError as e:
        msg = json.dumps(getattr(e, "payload", None)) if getattr(e, "payload", None) else str(e)
        if "released model version" in msg:
            print(f"NOTE: version {VERSION} is deployed/locked; bump VERSION to change the definition.")
            return 0
        print("PUT definition ERR", getattr(e, "status_code", "?"), msg[:500])
        return 1

    allv, errs = validate(c, model_id)
    print(f"validate: {len(allv)} messages, {len(errs)} ERRORs")
    for x in allv:
        m = x.get("message") or {}
        print("  ", m.get("id"), m.get("validationLevel"), x.get("source"), x.get("name") or "")

    state["version"] = VERSION
    state["start_message_name"] = f"Start {MODEL_NAME}"
    state["start_endpoint"] = "/api/workflow/v1/instances/message"
    state["assignee_user_id"] = ASSIGNEE_USER_ID
    save_state(state)
    print("\nStart contract (server-side, session identity):")
    print(f"  POST {state['start_endpoint']}")
    print(f"  body: {{messageName: {state['start_message_name']!r}, modelId: {model_id!r}, data: {{...inputs...}}}}")
    print("\nNEXT (one-click): open the workflow in Domo and click Deploy to register the start trigger.")
    return 1 if errs else 0


if __name__ == "__main__":
    raise SystemExit(main())
