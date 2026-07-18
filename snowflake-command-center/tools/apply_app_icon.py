#!/usr/bin/env python3
"""Upload the generated icon to Domo and set it (plus a description) on the
Snowflake Revenue Command Center App Studio app.

Uses the community-domo-cli ryuu session for auth (no secrets in repo).
"""
from __future__ import annotations

import sys
from pathlib import Path

import httpx

VENV = Path.home() / ".local/pipx/venvs/community-domo-cli/lib"
for _p in VENV.glob("python*/site-packages"):
    sys.path.insert(0, str(_p))

from community_domo_cli.config import resolve_config  # noqa: E402
from community_domo_cli.http import DomoClient  # noqa: E402

INSTANCE = "snowflake-demo"
APP_ID = 1378989657
ICON = Path(__file__).resolve().parent / "app-icon.png"

DESCRIPTION = (
    "Executive revenue command center built on Snowflake, delivered by Domo. "
    "Data stays in Snowflake and is queried live through Cloud Amplifier federation — "
    "Snowflake Horizon, semantic views, and Cortex are the intelligence plane, while "
    "Domo delivers governed KPIs, ML-adjusted forecasts, revenue-at-risk, and agentic "
    "renewal-risk approvals as the action plane."
)


def client() -> DomoClient:
    cfg = resolve_config(None, INSTANCE)
    return DomoClient(instance=cfg.instance, auth_mode=cfg.auth_mode,
                      developer_token=cfg.developer_token, refresh_token=cfg.refresh_token)


def upload_icon(c: DomoClient) -> int:
    data = ICON.read_bytes()
    base = c.base_url
    with httpx.Client(timeout=c.timeout_seconds) as hc:
        headers = dict(c._headers(hc))
        headers["Content-Type"] = "image/png"
        params = {
            "name": "snowflake-revenue-cc-icon.png",
            "description": "Snowflake Revenue Command Center icon",
            "public": "true",
        }
        r = hc.post(f"{base}/data/v1/data-files", params=params, headers=headers, content=data)
        if r.status_code >= 400:
            raise SystemExit(f"upload failed {r.status_code}: {r.text[:400]}")
        payload = r.json()
    file_id = payload.get("dataFileId") or payload.get("id")
    if not file_id:
        raise SystemExit(f"no dataFileId in response: {payload}")
    print(f"uploaded icon -> dataFileId={file_id}")
    return int(file_id)


def main():
    c = client()
    file_id = upload_icon(c)

    app = c.request("GET", f"/content/v1/dataapps/{APP_ID}")
    print(f"app: {app.get('title')!r}  current icon={app.get('iconDataFileId')} "
          f"navIcon={app.get('navIconDataFileId')}")

    app["iconDataFileId"] = file_id
    app["navIconDataFileId"] = file_id
    app["description"] = DESCRIPTION

    c.request("PUT", f"/content/v1/dataapps/{APP_ID}",
              params={"includeHiddenViews": "true"}, json_body=app)

    check = c.request("GET", f"/content/v1/dataapps/{APP_ID}")
    print("--- after update ---")
    print("iconDataFileId   :", check.get("iconDataFileId"))
    print("navIconDataFileId:", check.get("navIconDataFileId"))
    print("description      :", (check.get("description") or "")[:120], "...")


if __name__ == "__main__":
    main()
