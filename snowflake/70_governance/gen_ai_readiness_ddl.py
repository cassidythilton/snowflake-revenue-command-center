#!/usr/bin/env python3
"""Generate AI Readiness source-context DDL for the 5 governed gold views.

Snowflake Horizon is the source of truth: each gold-view column gets a business
COMMENT (context) and a DOMO_AI_SYNONYMS tag (comma-separated synonyms). These
are read live by the Code Engine bridge (getHorizonReadinessState) and synced
into the Domo AI Readiness data dictionary for the federated dataset.

View-column DDL notes (validated against the live account):
  - COMMENT ON COLUMN does NOT work on views -> use ALTER VIEW ... MODIFY COLUMN ... COMMENT '...'
  - Tags: ALTER VIEW ... MODIFY COLUMN ... SET TAG DOMO_AI_SYNONYMS = '...'
  - Read comments: INFORMATION_SCHEMA.COLUMNS.COMMENT
  - Read tags: TABLE(INFORMATION_SCHEMA.TAG_REFERENCES_ALL_COLUMNS('<fqn>','TABLE'))
"""

DB = "SNOWFLAKE_REVENUE_CC"
SCHEMA = "CORE"

# view -> list of (column, context, [synonyms])
CATALOG = {
    "GOLD_EXECUTIVE_REVENUE_HEALTH": [
        ("DATE", "Calendar date of the weekly revenue snapshot (week ending). Primary time grain for executive revenue trend and forecast comparison.", ["snapshot date", "week ending", "as of date"]),
        ("FISCAL_YEAR", "Fiscal year the snapshot belongs to, for year-over-year executive reporting.", ["FY", "financial year"]),
        ("QUARTER", "Fiscal quarter label (e.g. Q3) used to group revenue for quarterly business reviews.", ["fiscal quarter", "qtr"]),
        ("FISCAL_PERIOD", "Fiscal period / month bucket within the quarter for period-level revenue analysis.", ["period", "fiscal month"]),
        ("TENANT_ID", "Governed tenant identifier that scopes the row for multi-tenant row-level security.", ["tenant", "customer tenant"]),
        ("REGION", "Sales region the revenue is attributed to (West, East, Central, South).", ["territory", "geo", "area"]),
        ("SEGMENT", "Customer segment (Enterprise, Mid-Market, SMB) for segment-level revenue mix.", ["customer segment", "tier"]),
        ("NET_REVENUE", "Net recognized revenue for the segment/region on the snapshot date, after discounts and credits.", ["revenue", "net rev", "recognized revenue"]),
        ("GROSS_MARGIN", "Gross margin dollars for the revenue in the row, used for profitability views.", ["margin", "GM"]),
        ("EXPANSION_ARR", "Expansion ARR added from upsell/cross-sell within the period.", ["upsell ARR", "expansion", "growth ARR"]),
        ("CHURNED_ARR", "ARR lost to churn/downgrade within the period.", ["lost ARR", "churn", "contraction ARR"]),
        ("REVENUE_AT_RISK", "Probability-weighted revenue at risk of churn for the segment/region — the executive headline risk metric.", ["at-risk revenue", "revenue at risk", "ARR at risk"]),
    ],
    "GOLD_CUSTOMER_RENEWAL_RISK": [
        ("ACCOUNT_ID", "Unique account identifier (primary key) joining renewal risk to the account dimension.", ["account key", "customer id"]),
        ("ACCOUNT_NAME", "Customer account display name shown in renewal and retention views.", ["customer name", "account"]),
        ("TENANT_ID", "Governed tenant identifier used for row-level security scoping.", ["tenant", "customer tenant"]),
        ("REGION", "Sales region the account belongs to.", ["territory", "geo"]),
        ("SEGMENT", "Customer segment classification (Enterprise, Mid-Market, SMB).", ["tier", "customer segment"]),
        ("INDUSTRY", "Account industry vertical for cohort and benchmark analysis.", ["vertical", "sector"]),
        ("ACCOUNT_OWNER_ID", "Identifier of the owning account executive / CSM.", ["owner id", "AE id", "CSM id"]),
        ("ACCOUNT_OWNER_NAME", "Name of the owning account executive / CSM responsible for the renewal.", ["account owner", "AE", "CSM"]),
        ("ANNUAL_RECURRING_REVENUE", "Account annual recurring revenue (ARR) — the renewal value exposure.", ["ARR", "annual recurring revenue", "contract value"]),
        ("RENEWAL_DATE", "Contract renewal date driving the renewal-risk time horizon.", ["renewal", "contract end", "expiry date"]),
        ("RENEWAL_RISK_SCORE", "Model renewal-risk score (0-100); higher means greater churn risk.", ["risk score", "churn score"]),
        ("RISK_TIER", "Categorical risk tier (Low, Medium, High, Critical) derived from the risk score.", ["risk level", "risk band", "risk category"]),
        ("TOP_RISK_DRIVER", "Primary explanatory driver of the renewal risk (e.g. SLA breaches, usage drop, negative sentiment).", ["risk driver", "top driver", "root risk factor"]),
        ("PREDICTED_CHURN_PROBABILITY", "Model-predicted probability the account churns at renewal.", ["churn probability", "churn likelihood", "P(churn)"]),
        ("REVENUE_AT_RISK", "Probability-weighted ARR at risk for the account (ARR x churn probability).", ["at-risk revenue", "ARR at risk"]),
        ("RECOMMENDED_ACTION", "Governed recommended retention play for the account.", ["recommendation", "next best action", "save play"]),
        ("CASES_90D", "Count of support cases opened in the trailing 90 days.", ["support cases", "tickets 90d", "case count"]),
        ("SLA_BREACHES_90D", "Count of SLA breaches in the trailing 90 days — a leading churn indicator.", ["SLA misses", "SLA breaches", "missed SLAs"]),
        ("NEGATIVE_CASES_90D", "Count of support cases with negative sentiment in the trailing 90 days.", ["negative tickets", "unhappy cases"]),
        ("AVG_USAGE_SCORE_90D", "Average product usage/health score over the trailing 90 days.", ["usage score", "product health", "engagement score"]),
        ("USAGE_DROP_DAYS_90D", "Number of days in the trailing 90 with a material usage drop.", ["usage drop days", "declining usage days"]),
    ],
    "GOLD_INCIDENT_REVENUE_IMPACT": [
        ("INCIDENT_ID", "Unique reliability incident identifier (primary key).", ["incident key", "incident number"]),
        ("INCIDENT_DATE", "Date the incident was declared.", ["date", "occurred on"]),
        ("PRODUCT_ID", "Identifier of the affected product/service.", ["product key", "service id"]),
        ("REGION", "Region most affected by the incident.", ["territory", "geo"]),
        ("SEVERITY", "Incident severity level (e.g. SEV1-SEV4).", ["sev", "priority", "impact level"]),
        ("INCIDENT_CATEGORY", "Classification of the incident (e.g. availability, performance, data).", ["category", "incident type"]),
        ("ROOT_CAUSE", "Root cause summary from the post-incident review.", ["cause", "RCA", "root cause analysis"]),
        ("CUSTOMER_IMPACT_LEVEL", "Assessed level of customer impact for the incident.", ["impact", "customer impact"]),
        ("ESTIMATED_REVENUE_IMPACT", "Estimated revenue impact attributed to the incident.", ["revenue impact", "estimated impact"]),
        ("AFFECTED_ACCOUNT_COUNT", "Distinct number of accounts affected by the incident.", ["accounts affected", "impacted accounts"]),
        ("SUPPORT_CASE_COUNT", "Number of support cases linked to the incident.", ["case count", "tickets"]),
        ("SLA_BREACH_COUNT", "Number of SLA breaches tied to the incident.", ["SLA breaches", "SLA misses"]),
        ("NEGATIVE_CASE_COUNT", "Number of negative-sentiment cases tied to the incident.", ["negative cases", "unhappy tickets"]),
        ("RENEWAL_REVENUE_AT_RISK", "Renewal revenue at risk across accounts affected by the incident.", ["revenue at risk", "at-risk ARR"]),
    ],
    "GOLD_AGENT_ACTION_QUEUE": [
        ("ACTION_ID", "Unique identifier for the agent-proposed action (primary key).", ["action key", "action number"]),
        ("CREATED_TS", "Timestamp the action was proposed by the agent.", ["created at", "proposed at"]),
        ("DATE", "Business date the action belongs to.", ["action date"]),
        ("TENANT_ID", "Governed tenant identifier for row-level security scoping.", ["tenant"]),
        ("ACCOUNT_ID", "Account the action targets.", ["account key", "customer id"]),
        ("REGION", "Region of the target account.", ["territory", "geo"]),
        ("SEGMENT", "Segment of the target account.", ["tier", "customer segment"]),
        ("ACCOUNT_OWNER_ID", "Owner (AE/CSM) responsible for the account.", ["owner id", "AE id"]),
        ("SOURCE_AGENT", "Name of the Cortex agent that proposed the action.", ["agent", "proposing agent"]),
        ("SOURCE_QUESTION", "The natural-language question that produced the recommendation.", ["prompt", "question", "ask"]),
        ("RECOMMENDATION", "The proposed retention/save recommendation text.", ["recommendation", "save play", "next best action"]),
        ("APPROVAL_STATUS", "Human approval status (Proposed, Approved, Rejected) from the governed Task Center.", ["approval", "review status"]),
        ("EXECUTION_STATUS", "Execution status of the approved action (Pending, Executed, Voided).", ["exec status", "fulfillment status"]),
        ("WORKFLOW_NAME", "Name of the Domo workflow that governs execution.", ["workflow", "process"]),
        ("APPROVED_BY", "Identity of the approver who actioned the item.", ["approver", "reviewed by"]),
        ("COMPLETED_TS", "Timestamp the action reached a terminal state.", ["completed at", "closed at"]),
        ("EXPECTED_REVENUE_PROTECTED", "Expected revenue protected if the action succeeds.", ["expected protected revenue", "projected save"]),
        ("ACTUAL_REVENUE_PROTECTED", "Actual revenue protected after execution.", ["protected revenue", "realized save"]),
        ("WORKFLOW_CYCLE_DAYS", "Days from proposal to completion — approval cycle time.", ["cycle time", "days to close", "SLA days"]),
    ],
    "GOLD_PORTAL_USER_SCOPE": [
        ("USER_KEY", "Unique key for the portal user (primary key).", ["user id", "user key"]),
        ("DISPLAY_NAME", "Display name of the portal user.", ["name", "user name"]),
        ("PERSONA", "Governed persona (e.g. Executive Sponsor, Regional VP) driving default scope.", ["role", "persona"]),
        ("TENANT_ID", "Tenant the user belongs to, for multi-tenant isolation.", ["tenant"]),
        ("REGION", "Region the user is entitled to see (row-level security).", ["territory", "geo scope"]),
        ("ACCOUNT_OWNER_ID", "Account-owner scope granted to the user.", ["owner id", "AE id"]),
        ("ACCESS_LEVEL", "Entitlement/access level controlling data visibility.", ["access", "entitlement", "permission level"]),
    ],
}


def esc(s: str) -> str:
    return s.replace("'", "''")


DATASETS = [
    ("GOLD_EXECUTIVE_REVENUE_HEALTH", "executiveRevenueHealth", "3cd5a0ac-e059-4dff-bbc2-ad639468dcab"),
    ("GOLD_CUSTOMER_RENEWAL_RISK", "customerRenewalRisk", "9bba0fc2-9ec9-4ee1-8b1e-491cb8ddef7e"),
    ("GOLD_INCIDENT_REVENUE_IMPACT", "incidentRevenueImpact", "eadda0cf-8bd1-4ad0-8f9c-c72cc36b7380"),
    ("GOLD_AGENT_ACTION_QUEUE", "agentActionQueue", "7715806a-4c6d-42a1-808c-046643ff1435"),
    ("GOLD_PORTAL_USER_SCOPE", "portalUserScope", "f00f292a-0fc5-41d7-a80d-996f58934859"),
]


def guess_type(col):
    c = col.lower()
    if c.endswith("_ts") or c in ("created_ts", "completed_ts"):
        return "TIMESTAMP_NTZ"
    if c == "date" or c.endswith("_date"):
        return "DATE"
    if any(k in c for k in ("revenue", "arr", "margin", "score", "probability", "impact", "protected", "risk")) and "tier" not in c and "driver" not in c and "status" not in c:
        return "NUMBER(38,2)"
    if any(k in c for k in ("count", "days", "breaches", "cases", "year")):
        return "NUMBER(38,0)"
    return "VARCHAR(16777216)"


def write_mock():
    import json as _json
    # Preview state mirrors the reference demo: one dataset partially synced, rest at 0.
    synced_preview = {"GOLD_EXECUTIVE_REVENUE_HEALTH": 7}
    datasets = []
    for view, name, dsid in DATASETS:
        cols = CATALOG[view]
        n_sync = synced_preview.get(view, 0)
        columns = []
        for idx, (col, ctx, syns) in enumerate(cols):
            columns.append({"name": col, "type": guess_type(col), "context": ctx, "synonyms": syns,
                            "prepared": True, "synced": idx < n_sync})
        datasets.append({"view": view, "name": name, "dataSetId": dsid, "columns": columns})
    path = "snowflake-command-center/public/mock/ai-readiness.json"
    with open(path, "w") as f:
        _json.dump({"datasets": datasets}, f, indent=0)
    total = sum(len(d["columns"]) for d in datasets)
    print(f"Wrote {path}: {len(datasets)} datasets, {total} columns.")


def main():
    write_mock()
    out = []
    out.append("--------------------------------------------------------------------------------")
    out.append("-- 40_ai_readiness_context.sql  (generated by gen_ai_readiness_ddl.py)")
    out.append("-- Horizon source-of-truth column context + synonyms for the 5 governed gold")
    out.append("-- views. Read live by the Code Engine bridge and synced into Domo AI Readiness.")
    out.append("--------------------------------------------------------------------------------")
    out.append("USE ROLE SYSADMIN;")
    out.append(f"USE DATABASE {DB};")
    out.append(f"USE SCHEMA {SCHEMA};")
    out.append("")
    out.append("CREATE TAG IF NOT EXISTS DOMO_AI_SYNONYMS COMMENT = 'Comma-separated business synonyms surfaced to Domo AI Readiness.';")
    out.append("")
    for view, cols in CATALOG.items():
        out.append(f"-- {view} ({len(cols)} columns)")
        for col, ctx, syns in cols:
            out.append(f"ALTER VIEW {view} MODIFY COLUMN {col} COMMENT '{esc(ctx)}';")
            out.append(f"ALTER VIEW {view} MODIFY COLUMN {col} SET TAG DOMO_AI_SYNONYMS = '{esc(', '.join(syns))}';")
        out.append("")
    total = sum(len(c) for c in CATALOG.values())
    out.append(f"-- Total: {total} columns across {len(CATALOG)} governed datasets.")
    path = "snowflake/70_governance/40_ai_readiness_context.sql"
    with open(path, "w") as f:
        f.write("\n".join(out) + "\n")
    print(f"Wrote {path}: {total} columns, {len(CATALOG)} views.")


if __name__ == "__main__":
    main()
