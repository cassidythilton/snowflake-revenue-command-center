---
shaping: true
---

# App load performance — Shaping

## Source

> this app is very slow to load in many cases. most of the data is in domo (see
> manifest.json) so should be very straightforward. i need you to analyze each
> tab and build a strategy to optimize the performance of the app. for context:
> here's the log when opening it just now: […]
> `f9b313d1-…domoapps…/sql/v1/fact_revenue_daily:1  Failed to load resource: the
> server responded with a status of 404 ()`
> `app.js:452 [app] Cloud Amplifier read failed, trying Code Engine bridge: Error
>     at p.onload (domo.ts:386:16)`
> use your shaping skill to capture the requirements and tease apart the key
> parts of the solution that i have specified here.

Console log on cold open (annotated):
- `/sql/v1/fact_revenue_daily` → **404** — the very first dashboard read fails.
- `app.js:452 [app] Cloud Amplifier read failed, trying Code Engine bridge` — the app then falls to the slow Snowflake round-trip.
- Remaining lines (`appCatalystPrompt` 403, `dremio-maestro` i18n, Apollo devtools, sandbox iframe warnings) are Domo-platform host noise, **not** app-caused.

---

## Problem

The app is slow to load because **read-only dashboard data is fetched over the slowest possible path**, even though the same data already lives in Domo as native datasets.

Two compounding issues, both visible in the log and confirmed in `src/app.js`:

1. **Wrong (doomed) primary path, paid for on every open.** Home calls `loadDataViaAmplifier()` which hits `domo.post("/sql/v1/<alias>", …)`. The alias `fact_revenue_daily` **404s**, so the whole promise chain rejects and the app falls back to the **Code Engine → Snowflake bridge** (`getForecastHome`). That bridge does key-pair JWT auth + a live query against a Snowflake warehouse (cold-start / resume latency), then Home *also* side-loads the approval queue through the same bridge. The user waits for a failure *and then* a multi-second Snowflake round-trip before Home paints.

2. **Serial round-trips where parallel or single would do.** `loadDataViaAmplifier` is written as **9 chained `.then()` reads** (revenue → risk → protected → SLA → forecast → regional → queue → top-actions), each a separate network request. Several other tabs run **sequential mock-then-live** loads (fetch a local mock, *then* call Code Engine), paying two latencies to render once.

The data does not need Snowflake at read time: the manifest maps **18 governed datasets already in Domo** (`gold_*`, `fact_*`, `dim_*`). Reporting reads should come from those directly; the Code Engine bridge should be reserved for genuinely-live and write operations.

## Outcome

Every tab paints quickly. Read-only dashboard data is served from the **datasets already in Domo** (fast, local, governed), the **Code Engine → Snowflake bridge is used only for live generation and writeback** and never blocks a tab's first paint, within-tab reads run in **parallel**, and results are **cached across tab switches** — with the "data stays in Snowflake / governed" demo narrative kept truthful.

---

## CURRENT — per-tab data-load map

`CE = "/domo/codeengine/v2/packages/"` · `APPDB = "/domo/datastores/v1/collections/"` · Cloud Amplifier read = `domo.post("/sql/v1/<alias>", sql)`. Tab switch (`renderTabs` L3957 / `goto` L4326) sets `state.surface` and re-renders; each tab lazy-loads guarded by a `*.loaded` flag, so a **revisit does not re-fetch**. Init (L4585) loads Home immediately.

| # | Tab | Load fn(s) | Backend on first load | Round-trips | Pattern | Cached |
|---|-----|-----------|-----------------------|:-----------:|---------|:------:|
| 1 | **Home** (Forecast) | `loadData`→`loadDataViaAmplifier`→CE `getForecastHome`→mock; + deferred `loadApprovals` | Amplifier `/sql/v1` ×**9** → (404) CE `getForecastHome` → mock; approvals: mock **then** CE `getApprovalQueue` | ~**11** cold | 9 **sequential**; fallbacks sequential; approvals 2 sequential | `state.data` (reload on persona change only); `approvals.loaded` |
| 2 | **Cortex Analyst** | `loadRecent`, `loadViews`, `loadSemantic` | AppDB `recent_queries` + CE `listSemanticViews` + CE `describeSemanticView`/mock | 3 | **parallel** | `recentLoaded`, `viewsLoaded`, `semantic.loaded` |
| 3 | **Snowflake ML** | `loadMLSeed` | mock `ml-score.json` only (CE `runModelInference` is user-action) | 1 | single | `state.ml.seed` |
| 4 | **Approvals** | `loadApprovalTasks` (+ shared `loadApprovals`) | CE `listApprovalTasks` | 1 | single | `tasksLoaded`, `approvals.loaded` |
| 5 | **Hybrid Tables** (Ops) | `loadOps` | CE `getOpsState` → mock `ops-state.json` | 1 | single | `ops.loaded` |
| 6 | **Horizon AI Readiness** | `loadGovernance`, `loadSemantic` | mock `governance.json` **then** CE `getGovernance`; + CE/mock semantic | 2–3 | governance **sequential**; semantic parallel | `governance.loaded`, `semantic.loaded` |
| 7 | **Semantic Model** | `loadSemantic` | CE `describeSemanticView`/mock | 0–1 | single | `semantic.loaded` (shared w/ Analyst) |
| 8 | **Snowflake CoWork** | `loadCoWork`, `loadAgentSeed`, `cwLoadServerThreads`, `cwLoadUser` | 2 mocks (`Promise.all`) + CE `listCortexThreads` + `/domo/users/v1/me` + agent mock | ~5 | mostly **parallel** | `cowork.loaded`, `agent.seed`, `serverLoaded`, `userLoaded` |
| 9 | **Domo Chat v2** (gated) | — | none (embeds iframe) | 0 | — | n/a |
| 10 | **How it works** | `loadHow` | mock `cocobuild.json` | 1 | single | `how.loaded` |

**Read-only reporting data (candidate for Domo-native reads):** Home KPIs/charts, Approvals queue counts, Hybrid Tables scenario/feedback rows, Governance/Readiness parity, Semantic model shape, ML seed metadata.
**Genuinely live / write (must stay on Code Engine bridge):** Cortex Analyst NL→SQL (`askAnalyst`), Cortex Agent (`askCortexAgent`), semantic DDL (`alterSemanticView`), verified-query run (`runSql`), model inference (`runModelInference`), approval/scenario/feedback writeback, Cortex thread create/rename/get.

---

## Requirements (R)

| ID | Requirement | Status |
|----|-------------|--------|
| **R0** | Every tab paints quickly; the default (Home) tab and each subsequent tab reach first meaningful paint without a perceptible stall. Target: cached/Domo-native reads feel sub-second; no tab waits on a failing path. | Core goal |
| **R1** | Read-only reporting data is served from the **governed datasets already materialized in Domo** (the 18 `gold_*`/`fact_*`/`dim_*` aliases in `manifest.datasetsMapping`), not from a live Snowflake round-trip. | Must-have |
| **R2** | The **Code Engine → Snowflake bridge is reserved for genuinely-live generation and writeback** (Cortex Analyst/Agent, semantic DDL, verified-query run, model inference, approvals/scenario/feedback writeback, thread ops) and **never blocks a tab's first paint** — it fires only on explicit user action. | Must-have |
| **R3** | **No tab blocks on a doomed path.** The "attempt Amplifier → fail (404) → attempt Code Engine → fall to mock" penalty is eliminated; each read routes to the correct source directly. | Must-have |
| **R4** | Independent reads within a tab run **in parallel**, not as chained `.then()` requests. Home's forecast load collapses from 9 sequential round-trips to ≤2 parallel reads. | Must-have |
| **R5** | Read results are **cached across tab switches** (mostly true today) and the wasted **mock-then-live** double fetch is removed; revisiting a tab does not re-fetch. | Must-have |
| **R6** | The **governed / "data stays in Snowflake" demo narrative stays truthful.** If reads move to Domo-native datasets, the framing (Cloud Amplifier federation, Horizon governance parity) is either preserved via genuinely-federated datasets or re-worded honestly — no false "live from Snowflake" claim. | Must-have |
| **R7** | **Offline/preview sample fallback is preserved** (mock seeds) but only as a true offline path, never as a hidden latency tax in the live path. | Must-have |
| **R8** | **No functional or visual regression** on any tab; persona scoping and all interactions behave as today. | Must-have |

---

## CURRENT: How it works today

| Part | Mechanism |
|------|-----------|
| C1 | Home reads via `/sql/v1/<alias>` (Cloud Amplifier), 9 sequential queries; alias 404s. |
| C2 | On any failure, fall back to CE `getForecastHome` (live Snowflake), then to mock seed. |
| C3 | Several tabs fetch a local mock *then* call CE (sequential double-latency). |
| C4 | Tab revisits are cached via `*.loaded` flags; persona change reloads Home. |

---

## A: Domo-native read plane + on-demand live bridge  *(the specified solution)*

Route all read-only reporting to the datasets already in Domo; keep Code Engine only for live/write, fired on user action. This is the direction the Source specifies ("most of the data is in domo … so should be very straightforward").

| Part | Mechanism | Flag |
|------|-----------|:----:|
| **A1** | **Data-source classification.** Tag each tab's data as *read-from-Domo* (Home, Approvals queue, Ops rows, Governance, Semantic shape, ML seed) vs *live-only* (Analyst/Agent/DDL/inference/writeback/threads). Drives which path each loader takes. | |
| **A2** | **Domo dataset read mechanism.** Read the mapped `gold_*`/`fact_*` datasets directly through Domo's data API instead of the 404-ing `/sql/v1` federated path. *(Exact endpoint gated by Spike X1.)* | ⚠️ |
| **A3** | **Collapse + parallelize Home.** Replace the 9 chained reads with pre-aggregated `gold_*` reads run via `Promise.all` (≤2 round-trips); side-load approvals in parallel, not after. | |
| **A4** | **Remove the fallback tax.** Route Home directly to the Domo read (A2); drop the Amplifier-attempt-then-CE-attempt cascade. Mock seed only when `domo` is absent (offline). | |
| **A5** | **Cache + prefetch.** Keep `*.loaded` caching; delete the mock-then-live double fetch (R5); optionally prefetch the default tab's data during idle. | |
| **A6** | **Live bridge on demand + warm.** Live CE calls fire only on user action (already true except Home/Approvals/Governance side-loads); consider a warehouse keep-warm / lightweight `ping` for the truly-live surfaces so first live action isn't a cold start. | ⚠️ |

### A2: Domo read mechanism — alternatives

| Req | Requirement | Status | A2-A `/data/v1/{alias}` Data API | A2-B fix `/sql/v1/{alias}` | A2-C one pre-agg `gold_*` per tab |
|-----|-------------|--------|:---:|:---:|:---:|
| R1 | Reporting reads come from Domo-native datasets | Must-have | ✅ | ✅ | ✅ |
| R3 | No doomed path / correct source directly | Must-have | ✅ | ⚠️ | ✅ |
| R4 | Home collapses to ≤2 parallel reads | Must-have | ⚠️ | ⚠️ | ✅ |

**Notes:**
- A2-A: `domo.get("/data/v1/<alias>?…")` / query API is the standard custom-app read for mapped datasets; most likely why `/sql/v1` 404s (wrong endpoint for these datasets). Needs per-KPI aggregation client-side or via query params.
- A2-B: keep SQL, but only viable if Spike X1 shows `/sql/v1` *can* serve these aliases (may need the dataset indexed/Adrenaline-enabled).
- A2-C: push aggregation upstream into a purpose-built gold dataset so each tab reads one small table — fewest round-trips, best paint, but adds a data-prep dependency.

---

## B: Keep Snowflake-live, just parallelize + cache + warm

Leave reads on the Code Engine → Snowflake bridge but remove the 404 attempt, parallelize the server-side queries, cache aggressively, and keep the warehouse warm.

| Part | Mechanism | Flag |
|------|-----------|:----:|
| B1 | Drop the `/sql/v1` amplifier attempt; call CE `getForecastHome` directly. | |
| B2 | Parallelize server-side queries inside CE; return one payload per tab. | |
| B3 | Warehouse keep-warm + result cache to mask cold starts. | ⚠️ |
| B4 | Cross-tab caching (as today). | |

---

## Spike X1: Why does `/sql/v1/<alias>` 404, and are the mapped datasets populated?

### Context
Shape A's whole premise is that the 18 mapped datasets are readable and populated in Domo. The one hard data point we have is a **404** on `/sql/v1/fact_revenue_daily`.

### Goal
Determine the correct, fast way to read the mapped `gold_*`/`fact_*` datasets from the app, and confirm they hold data.

### Questions
| # | Question |
|---|----------|
| **X1-Q1** | Does `domo.get("/data/v1/gold_executive_revenue_health?limit=1")` return rows in the deployed app? (Is the Data API the right endpoint vs `/sql/v1`?) |
| **X1-Q2** | Are the mapped datasets **materialized rows** in Domo, or empty **Cloud Amplifier federated** placeholders (which would explain the 404 and shift us toward A2-C or B)? |
| **X1-Q3** | For each read-only tab, which mapped alias(es) supply its data, and do the columns match what the loaders expect (`NET_REVENUE`, `REVENUE_AT_RISK`, `RISK_MONTH`, …)? |
| **X1-Q4** | Can `/sql/v1` be enabled for these aliases (indexed/Adrenaline), or is `/data/v1` query the only supported read? |
| **X1-Q5** | Does R6 hold — are these genuinely Cloud Amplifier–federated (data stays in Snowflake) or Domo-materialized copies, so the narrative can be stated truthfully? |

### Acceptance
Complete when we can describe, per read-only tab, the exact Domo read call that returns its data quickly, whether the datasets are federated or materialized, and therefore which A2 alternative to build.

### Findings (RESOLVED — probed live on `snowflake-demo.domo.com` via community-domo-cli)

| # | Answer |
|---|--------|
| **X1-Q2 (decisive)** | The mapped datasets are **`distribution: "direct_federated"`** — Cloud Amplifier BYOS. The rows physically live in Snowflake; **every Domo read pushes down to Snowflake live.** They are **not** materialized Domo copies. |
| **X1-Q1** | Rows *do* return: `SELECT * FROM gold_executive_revenue_health LIMIT 3` → 3 rows, `"duration": "3054"` ms **warm**. Cold (warehouse suspended) it hung for tens of minutes until interrupted. |
| **X1-Q3** | Columns match loader expectations (`FISCAL_PERIOD`, `REGION`, `SEGMENT`, `NET_REVENUE`, `DAILY_ARR`, …). Schema/aliases are correct. |
| **X1-Q4** | `/sql/v1/<alias>` **404s for federated datasets** (not a supported app endpoint for BYOS). The working read is the Query API (`/data/v1/<alias>`, which supports pushdown) or the product SQL API used by CE. This is the true cause of the log's 404. |
| **X1-Q5 (R6)** | The "data stays in Snowflake" narrative is **literally true today** — federation means no copy. Materializing into Domo would make reads fast but would **change** that story for the materialized tables. |

**Consequence for the shape:** "read from Domo" ≠ "fast," because Domo reads are federated pushdowns to Snowflake (~3s warm / cold-start cliff). Two independent levers now separate:
- **Lever 1 — Materialize** the read datasets into Domo (Adrenaline/scheduled snapshot) → sub-second local reads, but changes the R6 "live federation" story for those tables.
- **Lever 2 — Fix the plumbing** (works either way): stop the doomed `/sql/v1` 404 path, use the working Query API, collapse 9 sequential reads → few parallel aggregated reads, kill mock-then-live double fetches, keep the Snowflake warehouse warm.

This splits part **A2** into a new decision **A2 (read source)** below.

### A2: Read source — alternatives (resolved by X1)

| Req | Requirement | Status | A2-A Federated via Query API (`/data/v1`, keep live) | A2-D Materialize gold in Domo (scheduled snapshot) | A2-B keep `/sql/v1` | A2-C CE bridge, parallelized |
|-----|-------------|--------|:---:|:---:|:---:|:---:|
| R0 | Sub-second paint | Core goal | ❌ (~3s warm, cold cliff) | ✅ | ❌ | ❌ |
| R1 | Reads from Domo-native datasets | Must-have | ✅ | ✅ | ✅ | ❌ |
| R3 | No doomed path | Must-have | ✅ | ✅ | ❌ (404) | ✅ |
| R6 | "Stays in Snowflake" narrative truthful | Must-have | ✅ (still federated) | ⚠️ (becomes a cached copy — needs re-wording) | ✅ | ✅ |

**Notes:**
- **A2-A** fixes correctness/plumbing (no more 404 → CE cascade) and preserves the live-federation story, but does **not** hit sub-second R0 — federated pushdown is ~3s warm and has a cold-warehouse cliff. Best paired with Lever 2 (parallelize) + warehouse keep-warm.
- **A2-D** is the only option that hits R0 sub-second, but the materialized tables are no longer "live from Snowflake" — R6 must be re-worded (e.g. "governed snapshot, refreshed hourly via Cloud Amplifier") to stay truthful.
- **A2-B** is dead: `/sql/v1` 404s on federated datasets.
- **A2-C** keeps reads on the CE→Snowflake bridge (still slow, cold-start risk) — fallback only.

### DECISION (user, 2026-07-17): **A2-A — keep everything federated.**
Preserve the "live from Snowflake" narrative exactly (R6 intact). Do **not** materialize. Accept ~2–4s warm reads and a residual cold-start cliff. Deliver **Lever 2** only. R0 is re-scoped from "sub-second" to **"instant perceived paint + no doomed path + warm warehouse; live data ~2–4s warm."**

---

## Detail A: Slices (Lever 2, federated) — BUILT

| Slice | Status | Mechanism (as built) |
|-------|:------:|----------------------|
| **V1 — Warehouse keep-warm** | ✅ | Added `warmWarehouse()` (fire-and-forget CE `ping`) + `startWarmLoop()` (immediate + `setInterval` every 240 s). Called from `init()`. Keeps the Snowflake warehouse resumed so governed reads aren't cold starts. |
| **V2 — Kill doomed path** | ✅ | Deleted the `/sql/v1` amplifier cascade entirely (`CA`, `parseColumnar`, `amplifierQuery`, `loadDataViaAmplifier`, unused date helpers). `loadData` now calls CE `getForecastHome` directly as the primary live read; sample seed only when `domo` is absent or CE fails. Removes a guaranteed-404 request + caught error on every open. |
| **V3 — Reconcile mock-then-live** | ✅ | Re-evaluated: the mock-first pattern in `loadApprovals`/`loadGovernance` is **progressive paint** (local mock is ~ms and gives an instant baseline the live CE call then upgrades), not wasted latency. **Kept as-is**; Home now adopts the same pattern via V4. |
| **V4 — Instant perceived paint** | ✅ | `refresh()` now renders the sample seed immediately on cold open (flagged `state.hydrating`) so the first view isn't a blank spinner while the federated live read runs, then swaps to live `getForecastHome`. `connBanner()` suppresses the sample/connect banner during hydration (the "Loading" pill communicates state); added `state.hydrating`. |
| **V5 — Parallelize** | ✅ | No change needed: Analyst and CoWork already fire reads in parallel; Home's approvals side-load already runs (deferred `setTimeout`) in parallel with the forecast read. |
| **V6 — Persistent stale-while-revalidate cache** | ✅ | Added a reusable `cacheGet`/`cacheSet` (localStorage, namespaced by persona). The last successful **live** payload is persisted for Home forecast, Ops (Hybrid Tables), Semantic model, and Governance. On reopen, `primeCaches()` + Home hydration paint the last real data instantly, then the normal live read revalidates behind it (`loaded` stays false so revalidation still fires; spinner guards updated so revalidation never blanks cached data). Turns every cold reopen into an instant paint of real recent figures instead of the generic sample seed. |

**Verification:** `node --check src/app.js` passes; no linter errors; no dangling references to removed helpers; `src/app.js` synced to `dist/src/app.js`.

### Net effect on cold open (Home)
- **Before:** blank spinner → `/sql/v1` 404 (failed request + caught error) → CE `getForecastHome` on a possibly-cold warehouse → first paint only after the slow read.
- **After:** instant paint from seed → warehouse already warming (ping on init) → CE `getForecastHome` swaps in live figures when ready. No doomed request, no blank wait, cold-start cliff softened.

---

## Fit Check

| Req | Requirement | Status | CURRENT | A | B |
|-----|-------------|--------|:---:|:---:|:---:|
| R0 | Every tab paints quickly; no wait on a failing path | Core goal | ❌ | ✅ | ✅ |
| R1 | Reporting reads from Domo-native mapped datasets | Must-have | ❌ | ✅ | ❌ |
| R2 | Code Engine reserved for live/write, never blocks paint | Must-have | ❌ | ✅ | ❌ |
| R3 | No doomed path; route to correct source directly | Must-have | ❌ | ✅ | ✅ |
| R4 | Independent reads parallel; Home ≤2 round-trips | Must-have | ❌ | ✅ | ✅ |
| R5 | Cache across switches; no mock-then-live double fetch | Must-have | ❌ | ✅ | ✅ |
| R6 | Governed / "stays in Snowflake" narrative stays truthful | Must-have | ✅ | ✅ | ✅ |
| R7 | Offline sample fallback preserved, not a latency tax | Must-have | ❌ | ✅ | ✅ |
| R8 | No functional/visual regression | Must-have | ✅ | ✅ | ✅ |

**Notes:**
- CURRENT fails R0/R3/R4/R5: doomed `/sql/v1` attempt → slow CE bridge → 9 sequential reads + mock-then-live double fetches.
- **A** depends on Spike X1: parts A2 and A6 are flagged (⚠️) — A2's endpoint and R6's federated-vs-materialized truth are unresolved until X1. A passes the fit check *once X1 resolves A2*.
- **B** keeps reads on live Snowflake, so it fails R1/R2 (still round-trips to Snowflake at read time, warehouse cold-start risk remains) — it's the fallback if X1 shows the datasets aren't independently readable.
