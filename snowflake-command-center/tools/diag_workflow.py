#!/usr/bin/env python3
import json, sys
from pathlib import Path
VENV = Path.home() / ".local/pipx/venvs/community-domo-cli/lib"
for _p in VENV.glob("python*/site-packages"):
    sys.path.insert(0, str(_p))
from community_domo_cli.config import resolve_config
from community_domo_cli.http import DomoClient, DomoApiError

STATE = json.loads((Path(__file__).resolve().parent / "workflow_state.json").read_text())
MODEL_ID = STATE["model_id"]; QUEUE_ID = STATE["queue_id"]
IID = sys.argv[1] if len(sys.argv) > 1 else None

cfg = resolve_config(None, "snowflake-demo")
dc = DomoClient(instance=cfg.instance, auth_mode=cfg.auth_mode,
                developer_token=cfg.developer_token, refresh_token=cfg.refresh_token)
dc.timeout_seconds = 60

def try_get(path):
    try:
        r = dc.request("GET", path)
        print(f"\n### GET {path}\n" + json.dumps(r, indent=2, default=str)[:3000])
        return r
    except DomoApiError as e:
        print(f"\n### GET {path}  -> ERROR {e}")
        return None

# Queue tasks (raw)
try_get(f"/queues/v1/{QUEUE_ID}/tasks")
try_get(f"/queues/v1/{QUEUE_ID}")
# Recent instances for the model
insts = try_get(f"/workflow/v1/models/{MODEL_ID}/instances?limit=5")
if IID:
    inst = try_get(f"/workflow/v1/instances/{IID}")
    try_get(f"/workflow/v1/instances/{IID}/activities")
    try_get(f"/workflow/v1/instances/{IID}/history")
