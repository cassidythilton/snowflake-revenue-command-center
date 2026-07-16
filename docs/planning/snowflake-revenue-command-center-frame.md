---
shaping: true
---

# Snowflake Revenue Command Center — Frame

> **One line:** Snowflake is the governed *intelligence* plane; Domo is the business *delivery + action* plane. One identity and one governed semantic layer, surfaced as an executive command center that **predicts**, **explains**, **acts**, **remembers**, and **governs** — with the metric definitions and entitlements living in Snowflake Horizon and never forking into the delivery layer.

This is a **completely separate Snowflake solution**. It uses the Databricks **Pattern 4 — Revenue Command Center** (`/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/`) only as a functional and narrative reference: it does not fork that app, share its runtime, or require code reuse. The frame captures the *why*; `snowflake-revenue-command-center-shaping.md` remains the original working document, while `snowflake-revenue-command-center-reconciled-shaping.md` records the evidence-backed companion analysis without overwriting it.

---

## Source (verbatim)

> see /Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/docs/demo/pattern-4-solution-summary.md and the broader app scaffold (/Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/) in that directory. i need to scope a snowflake version of this same app in /Users/cassidy.hilton/Cursor Projects/dais-demo-scenarios/. the snowflake version should include synonyous snowflake functionality to the databricks version, but we should not hold ourselves hostoage to just that. the top items that we need to make sure we include in this solution need to include snowflake cowork, cortex analyst, coco (somewhat synonymous with the databricks ai-tookit repo). we also should include domo's "chat v2" with mcp integration with snowflake, etc. do a deep dive analysis of current vs future solution, gap analysis, then use your shaping skill to capture the requirements and tease apart the key parts of the solution/ask that i have specified here.

**Explicit must-include items (from the ask):**
1. **Snowflake CoWork** (formerly Snowflake Intelligence) — the ready-to-use, governed enterprise intelligence *agent* / conversational app.
2. **Cortex Analyst** — text-to-SQL conversational analytics over governed **semantic views** (the Genie 1:1).
3. **CoCo** (formerly Cortex Code) — Snowflake's data-native coding agent; the user maps this to the Databricks **ai-toolkit** repo (the build/dev surface).
4. **Domo Chat v2 + MCP integration with Snowflake** — Domo-native conversational analytics plus a bidirectional MCP fabric.

**Latitude granted:** "synonymous Snowflake functionality to the Databricks version, but we should not hold ourselves hostage to just that" — parity is the floor, not the ceiling.

**Scope decisions (2026-07-15):**
- Build for a **demo-grade, live** outcome; use real Snowflake integrations where supported and label preview gates or fallbacks explicitly.
- Assume the target Snowflake account has CoWork, Cortex Analyst, Cortex Agents, and managed MCP enabled.
- Treat **Domo Chat v2, Cortex Analyst, and CoWork as equally first-class but non-redundant experiences**.
- Demonstrate **CoCo live as a builder showcase**, but do not make it a runtime dependency or require CoCo-generated assets to be the source of truth.
- Keep this project independent from the Databricks repository.

---

## Problem

Enterprises increasingly run their *governed intelligence* on Snowflake (Horizon Catalog + semantic views + Cortex) but deliver day-to-day decisions and operational action in a business platform (Domo). The risk is that **governance forks**: metric definitions, row-/column-level access, masking, and AI-readiness metadata that Snowflake Horizon enforces get re-implemented (and drift) inside the BI/action layer.

A second, Snowflake-specific problem: the Snowflake stack now exposes **many overlapping conversational/agentic surfaces** — Cortex Analyst, Cortex Agents, CoWork, and (on the Domo side) Domo Chat v2 with MCP. Without deliberate shaping, a demo becomes a confusing tour of redundant chat boxes instead of a coherent "one governed brain, many governed surfaces" story.

---

## Outcome

A regional operations leader opens a governed Domo command center powered live by Snowflake. A KPI shows elevated renewal risk in the West. They can investigate through three deliberate surfaces — Domo Chat v2 for Domo-native multi-dataset conversation, Cortex Analyst for transparent governed text-to-SQL, and CoWork for Snowflake-native deep research — then score an account, approve an action, and watch protected revenue update. The same Snowflake policies and semantic definitions govern every Snowflake query path; any Domo-side mirror is explicitly validated rather than assumed.

Success looks like:
- **Predict** — a renewal-risk model served from Snowflake ML scores an account live, governed under Horizon RBAC.
- **Explain** — Cortex Analyst answers "why did renewal risk increase for West enterprise accounts this month?" over the same governed semantic view; CoWork runs a deeper, cited Deep Research pass; Domo Chat v2 explores the Domo delivery context without being misrepresented as a direct Cortex router.
- **Act (agent ⇄ agent)** — a Domo AI agent inside a governed Domo Workflow calls a **Snowflake Cortex Agent**, a human approves in-app, and status writes back to Snowflake.
- **Remember** — saved what-if scenarios + prediction feedback persist in Snowflake Hybrid Tables, with their transactional feature limits disclosed.
- **Govern** — Horizon Context is the source of truth for semantics; RLS/masking apply to Snowflake calls under the identity that actually executes them; Domo PDP parity and any per-user OAuth/OBO path are demonstrated before they are claimed.
- **Build** — a live **CoCo** showcase demonstrates the data-native build path for semantic views, agent specs, SQL, and app work; production assets do not depend on CoCo-generated output.

**Anchor positioning (Domo POV):** *Build with Snowflake · Deliver with Domo · Govern everywhere.* Snowflake provides the governed data, semantics, models, and agent runtime; Domo puts those capabilities into operational business context, approvals, and workflows. MCP connects governed tools in both directions where the released products support it; the story never depends on an undocumented direct Chat v2-to-CoWork route.
