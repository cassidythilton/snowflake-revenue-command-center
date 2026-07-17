#!/usr/bin/env python3
"""End-to-end test of the deployed "Snowflake Revenue CC - Renewal Risk Retention"
agentic workflow:

  start (message API)
    -> AI_AGENT tile calls CE askRetentionAgent -> Snowflake Cortex Agent
    -> userTask lands in the native "Renewal Risk Approvals" queue (with the
       agent recommendation as an attribute)
    -> approve the task (Decision=Approved)
    -> conditionalGateway -> serviceTask writeActionStatus -> Snowflake writeback
    -> instance COMPLETED.

Uses the community-domo-cli session (no secrets). Read-through prints so we can
see the agent recommendation + task attributes as proof Cortex ran.
"""
from __future__ import annotations

import json
import sys
import time
import uuid
from pathlib import Path

VENV = Path.home() / ".local/pipx/venvs/community-domo-cli/lib"
for _p in VENV.glob("python*/site-packages"):
    sys.path.insert(0, str(_p))
from community_domo_cli.config import resolve_config  # noqa: E402
from community_domo_cli.http import DomoClient, DomoApiError  # noqa: E402

HERE = Path(__file__).resolve().parent
STATE = json.loads((HERE / "workflow_state.json").read_text())

INSTANCE = "snowflake-demo"
MODEL_ID = STATE["model_id"]
QUEUE_ID = STATE["queue_id"]
START_MSG = STATE["start_message_name"]

ACTION_ID = "TEST-" + uuid.uuid4().hex[:8].upper()
DATA = {
    "actionId": ACTION_ID,
    "account": "ACC-03452 (Meridian Capital)",
    "recommendation": "Technical success plan + reliability credit review",
    "persona": "Executive Sponsor",
    "protectedRevenue": 243938.70,
    "sourceQuestion": "Which West Enterprise accounts have elevated renewal risk?",
}


def c() -> DomoClient:
    cfg = resolve_config(None, INSTANCE)
    dc = DomoClient(instance=cfg.instance, auth_mode=cfg.auth_mode,
                    developer_token=cfg.developer_token, refresh_token=cfg.refresh_token)
    dc.timeout_seconds = 120
    return dc


def jp(label, obj):
    print(f"\n=== {label} ===")
    print(json.dumps(obj, indent=2, default=str)[:2400])


def get_instance(dc, iid):
    for path in (f"/workflow/v1/instances/{iid}", f"/workflow/v2/instances/{iid}"):
        try:
            return dc.request("GET", path)
        except DomoApiError:
            continue
    return None


def get_tasks(dc):
    try:
        data = dc.request("GET", f"/queues/v1/{QUEUE_ID}/tasks")
    except DomoApiError as e:
        print("task fetch error:", e)
        return []
    return data if isinstance(data, list) else data.get("tasks", [])


def main():
    dc = c()
    print(f"actionId={ACTION_ID}  model={MODEL_ID}  queue={QUEUE_ID}")

    # 1) Start the workflow via the deployed start message
    start_body = {"messageName": START_MSG, "modelId": MODEL_ID, "data": DATA}
    started = dc.request("POST", "/workflow/v1/instances/message", json_body=start_body)
    jp("START RESPONSE", started)
    iid = started.get("id") or started.get("instanceId") if isinstance(started, dict) else None

    # 2) Poll for the queue task to appear (proves AI agent ran + userTask created)
    task = None
    for i in range(24):
        time.sleep(2.5)
        if iid:
            inst = get_instance(dc, iid)
            status = (inst or {}).get("status") or (inst or {}).get("state")
            print(f"[{i}] instance status: {status}")
        tasks = get_tasks(dc)
        pending = [t for t in tasks if (t.get("attributes") or []) and t.get("status") not in ("COMPLETED", "COMPLETE")
                   and ACTION_ID in json.dumps(t.get("attributes") or [])]
        if not pending:
            # fall back: newest non-completed task
            pending = [t for t in tasks if t.get("status") not in ("COMPLETED", "COMPLETE")]
        if pending:
            task = sorted(pending, key=lambda t: t.get("createdOn") or "", reverse=True)[0]
            if ACTION_ID in json.dumps(task.get("attributes") or []):
                break
    if not task:
        print("\nNO TASK APPEARED — check that the workflow is deployed and the AI agent tile succeeded.")
        return
    jp("QUEUE TASK (agent recommendation should be in attributes)", task)

    tid = task.get("id")
    ver = task.get("version", 1)

    # 3) Approve the task
    comp_path = f"/queues/v1/{QUEUE_ID}/tasks/{tid}/complete?version={ver}"
    try:
        comp = dc.request("POST", comp_path, json_body={"Decision": "Approved"})
        jp("COMPLETE RESPONSE", comp)
    except DomoApiError as e:
        print("complete error:", e)

    # 4) Poll instance to completion (COMPLETED => writeActionStatus writeback ran)
    final = None
    for i in range(16):
        time.sleep(2.5)
        if iid:
            inst = get_instance(dc, iid)
            final = (inst or {}).get("status") or (inst or {}).get("state")
            print(f"[post {i}] instance status: {final}")
            if final in ("COMPLETED", "SUCCESS", "COMPLETE", "FINISHED"):
                break
    # Re-fetch the task to confirm completion metadata
    tasks = get_tasks(dc)
    done = [t for t in tasks if t.get("id") == tid]
    if done:
        jp("TASK AFTER APPROVAL", done[0])

    print("\n===== RESULT =====")
    print(f"actionId: {ACTION_ID}")
    print(f"instance: {iid}  final status: {final}")
    print("If final status is COMPLETED/SUCCESS, the serviceTask writeActionStatus")
    print("wrote Approved/Executed back to SNOWFLAKE_REVENUE_CC.CORE.AGENT_ACTION_WRITEBACK.")


if __name__ == "__main__":
    main()
