/* Snowflake Revenue Command Center — app shell (vanilla JS, no build step).
 * Sprint 2: Forecast Home over the snowflakece Code Engine bridge, with a
 * live -> sample fallback so the shell renders even without a Domo runtime. */
(function () {
  "use strict";

  /* ------------------------------- config -------------------------------- */
  var PERSONAS = [
    "Executive Sponsor",
    "West Regional Manager",
    "East Regional Manager",
    "Central Regional Manager",
    "South Regional Manager",
    "West Account Owner",
    "East Account Owner",
    "Data Platform Admin"
  ];

  // The 10-surface plan. Only Forecast Home is built in Sprint 2; the rest render
  // an on-brand placeholder so the shell is complete and never fakes a gated tab.
  var SURFACES = [
    { id: "home", label: "Forecast Home", sprint: null },
    { id: "analyst", label: "Cortex Analyst", sprint: 3, mark: "snowflake-cortex.svg",
      items: ["Ask \u201cwhy\u201d in natural language over the governed semantic view", "Answer + generated SQL + result rows", "Domo-side chart reconstruction + API inspector"] },
    { id: "ml", label: "Snowflake ML", sprint: 5, mark: "snowflake-mark.svg",
      items: ["Score any account live from the Model Registry", "Request / response inspector (SQL · curl · Python)", "Accept a prediction \u2192 seeds a scenario"] },
    { id: "approvals", label: "Approvals", sprint: 6, mark: "domo-approvals.svg",
      items: ["Native Domo Task Center approval queue", "In-app Approve / Reject resumes the workflow", "Cortex Agent save plays start governed approvals \u2014 status writes back to Snowflake"] },
    { id: "ops", label: "Hybrid Tables", sprint: 5, mark: "snowflake-mark.svg",
      items: ["Operational state in Snowflake Hybrid Tables (OLTP)", "What-if scenario runs \u2014 browse / add / edit / delete", "Human prediction feedback on the model (operational memory)"] },
    { id: "readiness", label: "Horizon AI Readiness", sprint: 7, mark: "domo-pdp.svg",
      items: ["AI Readiness control plane \u2014 Horizon prepared \u2192 Domo AI Readiness synced, column-level", "Two-persona parity test \u2014 same question, different governed rows", "Row-access + column-masking policies enforced at the query engine"] },
    { id: "semantic", label: "Semantic Model", sprint: 4, mark: "snowflake-cortex.svg",
      items: ["Governed semantic view \u2014 entities, relationships, and metrics", "Verified queries Cortex trusts", "DESCRIBE SEMANTIC VIEW introspection + DDL builder"] },
    { id: "cowork", label: "Snowflake CoWork", sprint: 8, mark: "snowflake-cortex.svg",
      items: ["The CoWork agent chat, reproduced in-app via the snowflakece bridge", "Deep Research + Skills scoped by Horizon", "Snowflake-managed MCP + Domo Essentials MCP outward"] },
    { id: "chat", label: "Domo Chat v2", sprint: 9, mark: "domo-ai-agent.svg", gated: true,
      items: ["Embedded native Domo Chat v2 agent", "MCP client \u2192 the Snowflake-managed MCP server (same Agent/Analyst/Search tools)", "Answers inherit REVENUE_CC_ANALYST semantics + Horizon policies"] },
    { id: "how", label: "How it works", sprint: 9, mark: "domo-pro-code.svg",
      items: ["Solution + technical architecture", "Clickable governed lineage", "The CoCo \u201chow it was built\u201d narrative"] }
  ];

  // Persona rows the golden path narrates around (used by Chat v2 gated preview).
  var CHAT_PROMPTS = [
    "Why did West Enterprise renewal risk rise this month, and what should we do?",
    "Summarize the incidents driving revenue at risk and the save plays in flight.",
    "How much revenue have executed agent actions protected quarter-to-date?"
  ];

  var CE = "/domo/codeengine/v2/packages/";

  // Golden-path prompts for the Cortex Analyst surface (chips).
  var ANALYST_SUGGESTED = [
    "Why did renewal risk increase for West Enterprise accounts this month?",
    "Which regions have the highest revenue at risk this month?",
    "How much revenue have executed agent actions protected so far?"
  ];

  // Golden-path prompts for the Cortex Agent surface.
  var AGENT_SUGGESTED = [
    "Why did renewal risk increase for West Enterprise accounts this month and what should we do?",
    "Summarize recent incidents affecting high-ARR accounts and recommend save plays.",
    "Which Enterprise accounts in the West region have the highest renewal risk and why?"
  ];

  // Starter questions for the Snowflake Intelligence (CoWork) home, mirroring
  // the native CoWork suggested-question rows.
  var CW_STARTERS = [
    "What is our total revenue at risk this quarter, by region?",
    "Which Enterprise accounts in the West region have the highest renewal risk and why?",
    "Score renewal risk for account ACC-00008 and explain the top drivers.",
    "Summarize recent incidents affecting high-ARR West accounts, recommend a save play, and stage it for approval."
  ];

  // Domo instance + Cloud Amplifier data models. These mirror the Snowflake
  // semantic view REVENUE_CC_ANALYST on the Domo side: the same federated
  // Snowflake tables (registered via Cloud Amplifier) joined into governed
  // star schemas. The beta Data Model API caps at 4 primary relationships per
  // model, so the 14-relationship semantic view is represented as three
  // companion models (account / tenant / product hubs).
  var DOMO_INSTANCE = "https://snowflake-demo.domo.com";
  // Snowsight org/account for deep links into governed Snowflake objects
  // (org DOMOINC / account DOMOPARTNER on domopartner.us-east-1).
  var SNOWSIGHT_BASE = "https://app.snowflake.com/domoinc/domopartner";

  // The 5 governed gold views federated into Domo via Cloud Amplifier (the
  // reference app's "Governed Data Lineage"). dataSetId => manifest datasetsMapping.
  var LINEAGE_VIEWS = [
    { title: "Executive Revenue Health", view: "GOLD_EXECUTIVE_REVENUE_HEALTH", dataSetId: "3cd5a0ac-e059-4dff-bbc2-ad639468dcab", note: "Net revenue, forecast, protected + at-risk rollups." },
    { title: "Customer Renewal Risk", view: "GOLD_CUSTOMER_RENEWAL_RISK", dataSetId: "9bba0fc2-9ec9-4ee1-8b1e-491cb8ddef7e", note: "Per-account renewal-risk scores and drivers." },
    { title: "Incident Revenue Impact", view: "GOLD_INCIDENT_REVENUE_IMPACT", dataSetId: "eadda0cf-8bd1-4ad0-8f9c-c72cc36b7380", note: "Reliability incidents mapped to revenue at risk." },
    { title: "Agent Action Queue", view: "GOLD_AGENT_ACTION_QUEUE", dataSetId: "7715806a-4c6d-42a1-808c-046643ff1435", note: "Cortex Agent save plays + approval status." },
    { title: "Portal User Scope", view: "GOLD_PORTAL_USER_SCOPE", dataSetId: "f00f292a-0fc5-41d7-a80d-996f58934859", note: "Row-scope + entitlement for governed delivery." }
  ];

  var DOMO_MODELS = [
    { name: "Account Model", id: "c14ef7a7-edfb-46ca-8498-cb42b5809902", hub: "DIM_ACCOUNT", join: "ACCOUNT_ID", rels: 4,
      facts: ["FACT_REVENUE_DAILY", "FACT_RENEWAL_RISK", "FACT_SUPPORT_CASES", "FACT_AGENT_ACTIONS"],
      note: "Revenue, renewal risk, support, and agent actions joined to the account dimension." },
    { name: "Tenant Model", id: "4549a343-a65d-48bd-aff0-fbd15d76dee5", hub: "DIM_TENANT", join: "TENANT_ID", rels: 4,
      facts: ["FACT_REVENUE_DAILY", "FACT_RENEWAL_RISK", "FACT_SUPPORT_CASES", "FACT_AGENT_ACTIONS"],
      note: "The same facts rolled up to the multi-tenant organization." },
    { name: "Product Model", id: "da0439aa-e998-4e90-afeb-9cab5e668cb7", hub: "DIM_PRODUCT", join: "PRODUCT_ID", rels: 3,
      facts: ["FACT_PRODUCT_USAGE_DAILY", "FACT_SUPPORT_CASES", "FACT_INCIDENTS"],
      note: "Usage, support, and incident facts joined to the product dimension." }
  ];

  var state = {
    persona: "Executive Sponsor",
    surface: "home",
    data: null,
    mode: "loading",
    dataSource: null,
    home: { range: 24, showBand: true },
    analyst: { input: "", loading: false, error: null, messages: [], conversationHistory: [], recent: [], recentLoaded: false, seq: 0,
      views: [], viewsLoaded: false, viewsLoading: false, selectedViews: ["REVENUE_CC_ANALYST"], pickerOpen: false },
    semantic: { loading: false, loaded: false, error: null, live: false, model: null, view: null, sql: null, tab: "graph", selected: null, vqResults: {}, vqBusy: {}, ddlResult: null, ddlBusy: false },
    config: { warehouse: "REVENUE_CC_WH", database: "SNOWFLAKE_REVENUE_CC", schema: "CORE", role: "REVENUE_CC_READER", view: "REVENUE_CC_ANALYST" },
    agent: { question: "", loading: false, error: null, result: null, queue: [], seed: null, inspector: false },
    ml: { accountId: "", loading: false, error: null, result: null, inspector: false, seed: null, codeTab: "curl", fbNote: "" },
    ops: { loading: false, loaded: false, error: null, scenarios: [], feedback: [], note: null, tab: "scenarios", selected: null, adding: false },
    approvals: { loading: false, loaded: false, error: null, live: false, seed: null, pending: [], writeback: [], history: [], protected: null, byId: {}, active: null, note: null, busy: null,
      tasks: [], tasksLoaded: false, tasksLoading: false, tasksLive: false, tasksError: null, busyTask: null, starting: null },
    governance: { loading: false, loaded: false, error: null, live: false, seed: null, parity: null, masking: null, rlSelected: null, synced: {}, wiped: {}, showDetail: false },
    cowork: { loading: false, loaded: false, error: null, live: false, mcp: null, cowork: null },
    cw: { threads: [], activeId: null, thinking: false, sending: false, draft: "", showWiring: false, serverThreads: [], serverLoaded: false, serverLoading: false, replay: null, userName: "", userLoaded: false, userLoading: false },
    diag: { entries: [], open: false },
    how: { loading: false, loaded: false, error: null, coco: null }
  };

  // Monotonic id source for CoWork chat threads + messages.
  var cwSeq = 0;

  function isLive() { return typeof domo !== "undefined" && domo && typeof domo.post === "function"; }

  /* ---- Source deep-links (both planes): Snowsight + Domo. Everywhere a
   * governed object is named it should link to its source (reference parity). */
  // Verified object types (via Cortex CLI: SHOW TABLES/VIEWS/SEMANTIC VIEWS in
  // SNOWFLAKE_REVENUE_CC.CORE). Snowsight deep-links use a different path
  // segment per type, so guessing "view" for everything produces dead links
  // (e.g. GOLD_REVENUE_FORECAST is a TABLE, REVENUE_CC_ANALYST a SEMANTIC VIEW).
  var SNOWSIGHT_OBJTYPE = {
    REVENUE_CC_ANALYST: "semantic-view",
    GOLD_AGENT_ACTION_QUEUE: "view", GOLD_CUSTOMER_RENEWAL_RISK: "view",
    GOLD_EXECUTIVE_REVENUE_HEALTH: "view", GOLD_INCIDENT_REVENUE_IMPACT: "view",
    GOLD_PORTAL_USER_SCOPE: "view", GOLD_PROTECTED_REVENUE_ROLLUP: "view",
    GOLD_REGION_SAVEPLAY_LEADERBOARD: "view", ML_RENEWAL_RISK_TRAINING: "view",
    GOLD_REVENUE_FORECAST: "table", ML_RENEWAL_RISK_FEATURES: "table",
    DIM_ACCOUNT: "table", DIM_PRODUCT: "table", DIM_TENANT: "table", DIM_USER_ENTITLEMENT: "table",
    FACT_AGENT_ACTIONS: "table", FACT_INCIDENTS: "table", FACT_PRODUCT_USAGE_DAILY: "table",
    FACT_RENEWAL_RISK: "table", FACT_REVENUE_DAILY: "table", FACT_SUPPORT_CASES: "table",
    AGENT_ACTION_WRITEBACK: "table", GOV_ROLE_REGION_MAP: "table", KNOWLEDGE_DOCS: "table",
    PREDICTION_FEEDBACK: "table", SCENARIO_RUNS: "table"
  };
  function snowsightObjHref(objType, name, db, schema) {
    db = db || (state.config && state.config.database) || "SNOWFLAKE_REVENUE_CC";
    schema = schema || (state.config && state.config.schema) || "CORE";
    var base = SNOWSIGHT_BASE + "/#/data/databases/" + encodeURIComponent(db) + "/schemas/" + encodeURIComponent(schema);
    if (!name) return base;
    // The verified type is authoritative; the caller's objType is only a fallback.
    var t = SNOWSIGHT_OBJTYPE[String(name).toUpperCase()] || objType || "view";
    var seg = t === "table" ? "/table/" : (t === "semantic-view" || t === "semantic") ? "/semantic-view/" : "/view/";
    return base + seg + encodeURIComponent(name);
  }
  function snowsightAgentHref() { return SNOWSIGHT_BASE + "/#/studio/agents"; }
  function domoDatasetHref(id) { return DOMO_INSTANCE + "/datasources/" + id + "/details/overview"; }
  function domoAiReadinessHref(id) { return DOMO_INSTANCE + "/datasources/" + id + "/details/ai-readiness"; }
  function workflowHref(modelId, version) { return DOMO_INSTANCE + "/workflows/models/" + modelId + "/" + (version || "1.0.0"); }
  // Small "Open in Snowflake / Open Domo dataset" link element with an out arrow.
  function srcLink(label, href, cls) {
    return h("a", { class: "src-link" + (cls ? " " + cls : ""), href: href, target: "_blank", rel: "noopener" }, [label, h("span", { class: "src-arrow" }, ["\u2197"])]);
  }

  /* ------------------------------ helpers -------------------------------- */
  function el(id) { return document.getElementById(id); }
  function h(tag, attrs, kids) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") node.className = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else node.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c != null) node.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return node;
  }
  function money(v) {
    v = Number(v) || 0; var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
    return "$" + v.toFixed(0);
  }
  function num(v) { return (Number(v) || 0).toLocaleString("en-US"); }
  function toNum(v) { return Number(v) || 0; }
  function regionOf(persona) {
    var p = String(persona || "").toLowerCase();
    if (p.indexOf("west") > -1) return "West";
    if (p.indexOf("east") > -1) return "East";
    if (p.indexOf("central") > -1) return "Central";
    if (p.indexOf("south") > -1) return "South";
    return null;
  }
  function unwrap(resp) {
    var cur = resp && (resp.body || resp.data || resp);
    var depth = 0;
    // Peel the Code Engine execution envelope ({executionId, status:'SUCCESS',
    // result:{...}}) and any nested {response:{...}} wrappers, so callers always
    // see the function's own return payload regardless of proxy shape.
    while (cur && typeof cur === "object" && depth < 8) {
      if (cur.executionId && cur.result && typeof cur.result === "object") { cur = cur.result; depth += 1; continue; }
      if ("response" in cur && cur.response && typeof cur.response === "object") { cur = cur.response; depth += 1; continue; }
      break;
    }
    return cur;
  }

  /* ------------------------- CE diagnostics logging ----------------------- */
  // Transparently log every Code Engine call (function, status, latency, error)
  // so bridge failures are visible in-app instead of silently degrading. A
  // floating "CE" pill opens a panel with the recent calls.
  function pushDiag(e) {
    var d = state.diag; d.entries.unshift(e); if (d.entries.length > 80) d.entries.pop();
    updateDiagBadge(); if (d.open) renderDiagPanel();
  }
  function ceInstrument() {
    if (typeof domo === "undefined" || !domo || typeof domo.post !== "function" || domo.__ceInstrumented) return;
    var _post = domo.post.bind(domo);
    domo.post = function (path, body) {
      var isCE = typeof path === "string" && path.indexOf("/codeengine/") > -1;
      if (!isCE) return _post(path, body);
      var fn = String(path).split("/").pop();
      var t0 = Date.now();
      return _post(path, body).then(function (resp) {
        var d = unwrap(resp); var st = d && d.status;
        pushDiag({ t: Date.now(), fn: fn, ok: (st === "SUCCEEDED" || st === "SUCCESS"), status: st || "(no status)", ms: Date.now() - t0, error: (d && d.error) || null });
        console.log("[ce]", fn, "\u2192", st, (Date.now() - t0) + "ms", (d && d.error) ? ("ERR: " + d.error) : "");
        return resp;
      }, function (err) {
        var msg = (err && err.message) ? err.message : (typeof err === "string" ? err : JSON.stringify(err)).slice(0, 300);
        pushDiag({ t: Date.now(), fn: fn, ok: false, status: "THROW", ms: Date.now() - t0, error: msg });
        console.warn("[ce]", fn, "THROW", msg);
        throw err;
      });
    };
    domo.__ceInstrumented = true;
  }
  function ensureDiagWidget() {
    if (el("ceDiagBtn")) return;
    var btn = h("button", { id: "ceDiagBtn", class: "ce-diag-btn", title: "Code Engine call log" }, [
      h("span", { class: "ce-diag-dot" }), "CE", h("span", { class: "ce-diag-count", id: "ceDiagCount" }, ["0"])
    ]);
    btn.addEventListener("click", function () { state.diag.open = !state.diag.open; renderDiagPanel(); });
    document.body.appendChild(btn);
    var panel = h("div", { id: "ceDiagPanel", class: "ce-diag-panel" });
    document.body.appendChild(panel);
    renderDiagPanel(); updateDiagBadge();
  }
  function updateDiagBadge() {
    var c = el("ceDiagCount"), btn = el("ceDiagBtn"); if (!c || !btn) return;
    var errs = state.diag.entries.filter(function (e) { return !e.ok; }).length;
    c.textContent = String(state.diag.entries.length);
    btn.classList.toggle("has-err", errs > 0);
  }
  function renderDiagPanel() {
    var panel = el("ceDiagPanel"); if (!panel) return;
    panel.classList.toggle("open", !!state.diag.open);
    if (!state.diag.open) { panel.innerHTML = ""; return; }
    panel.innerHTML = "";
    var head = h("div", { class: "ce-diag-head" }, [
      h("span", {}, ["Code Engine \u00b7 recent calls"]),
      (function () { var b = h("button", { class: "ce-diag-x" }, ["\u00d7"]); b.addEventListener("click", function () { state.diag.open = false; renderDiagPanel(); }); return b; })()
    ]);
    panel.appendChild(head);
    var body = h("div", { class: "ce-diag-body" });
    if (!state.diag.entries.length) body.appendChild(h("p", { class: "ce-diag-empty" }, ["No Code Engine calls yet."]));
    state.diag.entries.forEach(function (e) {
      body.appendChild(h("div", { class: "ce-diag-row" + (e.ok ? "" : " err") }, [
        h("span", { class: "ce-diag-fn" }, [e.fn]),
        h("span", { class: "ce-diag-st" }, [e.status]),
        h("span", { class: "ce-diag-ms" }, [e.ms + "ms"]),
        e.error ? h("div", { class: "ce-diag-msg" }, [String(e.error).slice(0, 300)]) : null
      ]));
    });
    panel.appendChild(body);
  }

  // Pretty-print generated SQL for the read-only "View generated SQL" blocks.
  // Uses sql-formatter (Snowflake dialect) when available; falls back to a light
  // keyword-based line break so it degrades gracefully if the CDN is blocked.
  function fmtSql(sql) {
    var s = String(sql == null ? "" : sql).trim();
    if (!s) return "";
    try {
      if (window.sqlFormatter && typeof window.sqlFormatter.format === "function") {
        return window.sqlFormatter.format(s, { language: "snowflake", keywordCase: "upper", tabWidth: 2, linesBetweenQueries: 1 });
      }
    } catch (e) { /* fall through to lite */ }
    return s.replace(/\s+/g, " ")
      .replace(/\s*\b(FROM|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|QUALIFY|WINDOW|UNION ALL|UNION|EXCEPT|INTERSECT|LEFT OUTER JOIN|RIGHT OUTER JOIN|FULL OUTER JOIN|INNER JOIN|LEFT JOIN|RIGHT JOIN|CROSS JOIN|JOIN|ON)\b/gi, "\n$1")
      .trim();
  }
  function copyText(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    } catch (e) { /* noop */ }
    var ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); } catch (e) { /* noop */ }
    document.body.removeChild(ta); return Promise.resolve();
  }
  function downloadCsv(name, columns, rows) {
    var cols = columns.map(function (c) { return c.name; });
    function esc(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lines = [cols.map(esc).join(",")];
    rows.forEach(function (r) { lines.push(cols.map(function (c) { return esc(r[c]); }).join(",")); });
    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* --------------------------- AppDB (Domo datastores) ------------------- */
  /* Live: ryuu domo.get/post against /domo/datastores/v1/collections/<name>.
   * Offline: localStorage so the recent-query rail + config persist in preview. */
  var APPDB = "/domo/datastores/v1/collections/";
  function lsKey(col) { return "rcc_appdb_" + col; }
  function appdbList(col) {
    if (isLive()) {
      return domo.get(APPDB + col + "/documents?limit=50&orderby=createdOn desc")
        .then(function (docs) { return (docs || []).map(function (d) { var c = d.content || {}; c._id = d.id; return c; }); })
        .catch(function () { return appdbListLocal(col); });
    }
    return Promise.resolve(appdbListLocal(col));
  }
  function appdbListLocal(col) {
    try { return JSON.parse(localStorage.getItem(lsKey(col)) || "[]"); } catch (e) { return []; }
  }
  function appdbAdd(col, content) {
    if (isLive()) {
      return domo.post(APPDB + col + "/documents", { content: content })
        .then(function (d) { var c = (d && d.content) || content; c._id = d && d.id; return c; })
        .catch(function () { return appdbAddLocal(col, content); });
    }
    return Promise.resolve(appdbAddLocal(col, content));
  }
  function appdbAddLocal(col, content) {
    var list = appdbListLocal(col);
    content = JSON.parse(JSON.stringify(content)); content._id = "local-" + Date.now();
    list.unshift(content); list = list.slice(0, 50);
    try { localStorage.setItem(lsKey(col), JSON.stringify(list)); } catch (e) { /* noop */ }
    return content;
  }

  /* ------------------------------- data ---------------------------------- */
  /* Forecast Home is powered by the Cloud Amplifier federated datasets: the
   * same Snowflake tables (registered via Cloud Amplifier / Cobra Evo) queried
   * live through Domo's SQL API — data never leaves Snowflake. Aliases are
   * declared in manifest.datasetsMapping. If the federation read fails we fall
   * back to the Code Engine bridge, then to the local sample seed. */
  var CA = {
    rev: "fact_revenue_daily",
    risk: "fact_renewal_risk",
    actions: "fact_agent_actions",
    support: "fact_support_cases",
    forecast: "gold_revenue_forecast"
  };
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function ymOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1); }
  function ymdOf(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }

  // Parse Domo's SQL API columnar response. The payload is wrapped in .body
  // (or .data): { columns:[names], rows:[[...]] }. Keys are lower-cased so
  // consumers can reference columns case-insensitively.
  function parseColumnar(res) {
    var b = (res && (res.body || res.data)) || res || {};
    var rawCols = b.columns || [];
    var rows = b.rows || [];
    var cols = rawCols.map(function (c) {
      var name = (c && typeof c === "object") ? (c.name || c.alias || c.label || c.columnName) : c;
      return String(name).toLowerCase();
    });
    return rows.map(function (row) {
      var o = {};
      if (Array.isArray(row)) cols.forEach(function (c, i) { o[c] = row[i]; });
      else Object.keys(row || {}).forEach(function (k) { o[String(k).toLowerCase()] = row[k]; });
      return o;
    });
  }

  // Run SQL against a federated (Cloud Amplifier) dataset alias. The dataset is
  // referenced by its alias as the table name in FROM (Domo SQL API convention).
  function amplifierQuery(alias, sql) {
    return domo.post("/sql/v1/" + alias, sql, { contentType: "text/plain" }).then(parseColumnar);
  }

  function loadDataViaAmplifier(persona) {
    var region = regionOf(persona);
    var regClause = region ? " AND `REGION` = '" + region + "'" : "";
    var now = new Date();
    var monthStart = ymOf(now) + "-01";
    var date90 = ymdOf(new Date(now.getTime() - 90 * 864e5));

    var out = {
      status: "SUCCEEDED", mode: "LIVE", persona: persona || "Executive Sponsor",
      regionScope: region || "All regions",
      source: "Cloud Amplifier federation \u00b7 SNOWFLAKE_REVENUE_CC.CORE (live, data stays in Snowflake)",
      generatedAt: new Date().toISOString(),
      kpis: {}, actualVsForecast: [], revenueForecast: null, regionalRisk: [], actionQueue: {}, incident: null
    };

    var qAV = "SELECT `FISCAL_PERIOD` AS period, SUM(`NET_REVENUE`) AS actual, SUM(`DAILY_ARR`) AS forecast " +
      "FROM " + CA.rev + " WHERE 1=1" + regClause + " GROUP BY `FISCAL_PERIOD` ORDER BY `FISCAL_PERIOD` DESC LIMIT 14";
    var qRar = "SELECT SUM(`REVENUE_AT_RISK`) AS v FROM " + CA.risk + " WHERE `RISK_MONTH` = '" + monthStart + "'" + regClause;
    var qProtected = "SELECT SUM(`ACTUAL_REVENUE_PROTECTED`) AS v FROM " + CA.actions + " WHERE `EXECUTION_STATUS` = 'Executed'" + regClause;
    var qSla = "SELECT SUM(CASE WHEN `SLA_BREACHED_FLAG` = 'true' THEN 1 ELSE 0 END) AS breaches, COUNT(*) AS cases " +
      "FROM " + CA.support + " WHERE `DATE` >= '" + date90 + "'" + regClause;
    var qForecast = "SELECT `PERIOD_MONTH` AS period_month, `KIND` AS kind, `ACTUAL` AS actual, `FORECAST` AS forecast, " +
      "`LOWER_BOUND` AS lower_bound, `UPPER_BOUND` AS upper_bound FROM " + CA.forecast + " ORDER BY `PERIOD_MONTH`";
    var qRegional = "SELECT `REGION` AS region, `SEGMENT` AS segment, ROUND(AVG(`RENEWAL_RISK_SCORE`),1) AS avgrisk, " +
      "SUM(CASE WHEN `RISK_TIER` = 'High' THEN 1 ELSE 0 END) AS highrisk, SUM(`REVENUE_AT_RISK`) AS rar " +
      "FROM " + CA.risk + " WHERE `RISK_MONTH` = '" + monthStart + "'" + regClause + " GROUP BY `REGION`, `SEGMENT` ORDER BY rar DESC LIMIT 12";
    var qQueue = "SELECT SUM(CASE WHEN `APPROVAL_STATUS`='Pending' THEN 1 ELSE 0 END) AS pending, " +
      "SUM(CASE WHEN `APPROVAL_STATUS`='Approved' THEN 1 ELSE 0 END) AS approved, " +
      "SUM(CASE WHEN `EXECUTION_STATUS`='Executed' THEN 1 ELSE 0 END) AS executed, " +
      "SUM(CASE WHEN `APPROVAL_STATUS`='Rejected' THEN 1 ELSE 0 END) AS rejected, " +
      "SUM(CASE WHEN `APPROVAL_STATUS`='Not Required' THEN 1 ELSE 0 END) AS notrequired " +
      "FROM " + CA.actions + " WHERE 1=1" + regClause;
    var qTop = "SELECT `RECOMMENDATION` AS action, COUNT(*) AS cnt, SUM(`EXPECTED_REVENUE_PROTECTED`) AS rar " +
      "FROM " + CA.actions + " WHERE 1=1" + regClause + " GROUP BY `RECOMMENDATION` ORDER BY cnt DESC LIMIT 5";

    return amplifierQuery(CA.rev, qAV).then(function (av) {
      if (!av.length) throw new Error("no federated revenue rows");
      var cur = toNum(av[0].actual), prior = av.length > 1 ? toNum(av[1].actual) : 0;
      out.kpis.netRevenue = { label: "Net Revenue (MTD)", value: cur, priorValue: prior,
        deltaPct: prior ? Math.round(((cur - prior) / prior) * 1000) / 10 : 0, unit: "USD" };
      out.actualVsForecast = av.slice().reverse().map(function (r) { return { period: r.period, actual: toNum(r.actual), forecast: toNum(r.forecast) }; });
      return amplifierQuery(CA.risk, qRar);
    }).then(function (rows) {
      out.kpis.revenueAtRisk = { label: "Revenue at Risk", value: toNum(rows[0] && rows[0].v), unit: "USD", context: "current month" };
      return amplifierQuery(CA.actions, qProtected);
    }).then(function (rows) {
      out.kpis.protectedRevenue = { label: "Protected Revenue", value: toNum(rows[0] && rows[0].v), unit: "USD", context: "executed agent actions" };
      return amplifierQuery(CA.support, qSla);
    }).then(function (rows) {
      var r = rows[0] || {}; var breaches = toNum(r.breaches), cases = toNum(r.cases);
      out.kpis.slaBreachRate = { label: "SLA Breach Rate (90d)", value: cases ? Math.round((breaches / cases) * 1000) / 10 : 0, unit: "%", breaches: breaches, cases: cases };
      return amplifierQuery(CA.forecast, qForecast).catch(function () { return []; });
    }).then(function (rows) {
      if (rows && rows.length) {
        var history = [], forecast = [];
        rows.forEach(function (r) {
          var period = String(r.period_month || "").slice(0, 7);
          if (String(r.kind) === "forecast") forecast.push({ period: period, forecast: toNum(r.forecast), lower: toNum(r.lower_bound), upper: toNum(r.upper_bound) });
          else history.push({ period: period, actual: toNum(r.actual) });
        });
        out.revenueForecast = { source: "SNOWFLAKE_REVENUE_CC.CORE.GOLD_REVENUE_FORECAST via Cloud Amplifier (SNOWFLAKE.ML.FORECAST)",
          grain: "month", unit: "USD", predictionInterval: 0.95, history: history, forecast: forecast };
      }
      return amplifierQuery(CA.risk, qRegional);
    }).then(function (rows) {
      out.regionalRisk = rows.map(function (r) { return { region: r.region, segment: r.segment, avgRisk: toNum(r.avgrisk), highRiskAccounts: toNum(r.highrisk), revenueAtRisk: toNum(r.rar) }; });
      return amplifierQuery(CA.actions, qQueue);
    }).then(function (rows) {
      var r = rows[0] || {};
      out.actionQueue = { pending: toNum(r.pending), approved: toNum(r.approved), executed: toNum(r.executed), rejected: toNum(r.rejected), notRequired: toNum(r.notrequired), topActions: [] };
      return amplifierQuery(CA.actions, qTop);
    }).then(function (rows) {
      out.actionQueue.topActions = rows.map(function (r) { return { action: r.action, count: toNum(r.cnt), revenueAtRisk: toNum(r.rar) }; });
      // Guard: if the federation read parsed to empty/zero (e.g. an unexpected
      // response shape), reject so loadData falls back to the Code Engine bridge
      // rather than rendering a $0 / NaN dashboard.
      if (!(toNum(out.kpis.netRevenue && out.kpis.netRevenue.value) > 0)) throw new Error("Cloud Amplifier returned empty/zero data");
      return out;
    });
  }

  function loadData(persona) {
    state.mode = "loading";
    if (isLive()) {
      return loadDataViaAmplifier(persona)
        .then(function (d) { if (d && d.status === "SUCCEEDED") { state.mode = "live"; state.dataSource = "amplifier"; return d; } throw new Error("amplifier empty"); })
        .catch(function (aerr) {
          console.warn("[app] Cloud Amplifier read failed, trying Code Engine bridge:", aerr);
          return domo.post(CE + "getForecastHome", { persona: persona })
            .then(function (resp) {
              var d = unwrap(resp);
              if (d && d.status === "SUCCEEDED") { state.mode = "live"; state.dataSource = "codeengine"; return d; }
              throw new Error(d && d.error ? d.error : "Code Engine returned no data");
            })
            .catch(function (err) { console.warn("[app] live read failed, using sample seed:", err); return sampleData(persona); });
        });
    }
    return sampleData(persona);
  }
  function sampleData(persona) {
    return fetch("./public/mock/forecast-home.json")
      .then(function (r) { return r.json(); })
      .then(function (seed) {
        state.mode = "sample";
        var region = regionOf(persona);
        if (region) {
          seed = JSON.parse(JSON.stringify(seed));
          seed.regionalRisk = seed.regionalRisk.filter(function (row) { return row.region === region; });
          seed.regionScope = region + " (client-side; server-side scoping runs live)";
        }
        return seed;
      });
  }

  /* --------------------------- Cortex Analyst (conversational) ----------- */
  /* A multi-turn Cortex Analyst chatbot. Each turn carries the generated SQL,
   * live rows (switchable bar/line/pie chart + CSV), follow-ups, and a per-turn
   * API inspector. conversationHistory is threaded back to the CE bridge so
   * Analyst keeps context; every answered turn is persisted to AppDB
   * (recent_queries) so the rail survives reloads. */
  function loadRecent() {
    if (state.analyst.recentLoaded) return Promise.resolve(state.analyst.recent);
    return appdbList("recent_queries").then(function (list) {
      state.analyst.recent = list || [];
      state.analyst.recentLoaded = true;
      return state.analyst.recent;
    });
  }
  function saveRecent(turn) {
    var res = turn.res || {};
    var doc = {
      query_text: turn.question,
      sql_generated: res.sql || "",
      result_columns: (res.columns || []).map(function (c) { return c.name; }).join(", "),
      result_row_count: (res.rows || []).length,
      created_at: new Date().toISOString(),
      analyst_message: (res.interpretation || "").slice(0, 800)
    };
    return appdbAdd("recent_queries", doc).then(function (saved) {
      state.analyst.recent.unshift(saved);
      state.analyst.recent = state.analyst.recent.slice(0, 50);
    }).catch(function () { /* best-effort */ });
  }

  // Auto-discover the governed semantic views (SHOW SEMANTIC VIEWS via the CE
  // bridge) so the Analyst picker is live, not hardcoded. Falls back to the
  // primary view offline.
  function loadViews() {
    if (state.analyst.viewsLoaded || state.analyst.viewsLoading) return Promise.resolve();
    state.analyst.viewsLoading = true;
    var apply = function (views, primary) {
      state.analyst.views = views && views.length ? views : [{ name: "REVENUE_CC_ANALYST", fqn: "SNOWFLAKE_REVENUE_CC.CORE.REVENUE_CC_ANALYST", comment: "" }];
      if (primary) {
        var pn = String(primary).split(".").pop();
        if (state.analyst.selectedViews.indexOf(pn) === -1 && state.analyst.views.some(function (v) { return v.name === pn; })) state.analyst.selectedViews = [pn];
      }
      // Keep only still-valid selections.
      var valid = state.analyst.views.map(function (v) { return v.name; });
      state.analyst.selectedViews = state.analyst.selectedViews.filter(function (n) { return valid.indexOf(n) > -1; });
      if (!state.analyst.selectedViews.length && state.analyst.views[0]) state.analyst.selectedViews = [state.analyst.views[0].name];
      state.analyst.viewsLoading = false; state.analyst.viewsLoaded = true;
    };
    if (isLive()) {
      return domo.post(CE + "listSemanticViews", {})
        .then(function (resp) { var d = unwrap(resp); if (d && d.status === "SUCCEEDED") apply(d.views || [], d.primary); else apply(null); })
        .catch(function () { apply(null); });
    }
    apply(null);
    return Promise.resolve();
  }

  // The semantic view Cortex Analyst should query for this turn: the first
  // selected view (Analyst is single-model per call). FQN resolved from discovery.
  function activeView() {
    var name = state.analyst.selectedViews[0] || "REVENUE_CC_ANALYST";
    var v = (state.analyst.views || []).filter(function (x) { return x.name === name; })[0];
    return v ? (v.fqn || v.name) : name;
  }

  function newChat() {
    state.analyst.messages = [];
    state.analyst.conversationHistory = [];
    state.analyst.error = null;
    state.analyst.input = "";
    renderView();
  }

  // Cortex Analyst "Processing Query" steps (mirrors the reference app's modal).
  var ANALYST_STEPS = [
    { title: "Connecting to Snowflake", sub: function () { return (state.config.database || "SNOWFLAKE_REVENUE_CC") + "." + (state.config.schema || "CORE"); } },
    { title: "Analyzing with Cortex Analyst", sub: function () { return "Natural language processing"; } },
    { title: "Generating SQL Query", sub: function () { return "Optimizing for performance"; } },
    { title: "Executing Query", sub: function () { return "Fetching results"; } }
  ];
  function startAnalystSteps() {
    stopAnalystSteps();
    state.analyst.step = 0;
    state.analyst.stepTimer = setInterval(function () {
      if (!state.analyst.loading) { stopAnalystSteps(); return; }
      if (state.analyst.step < ANALYST_STEPS.length - 1) { state.analyst.step++; renderView(); scrollChat(); }
    }, 850);
  }
  function stopAnalystSteps() {
    if (state.analyst.stepTimer) { clearInterval(state.analyst.stepTimer); state.analyst.stepTimer = null; }
  }

  function runAnalyst(question) {
    var q = String(question || "").trim();
    if (!q || state.analyst.loading) return;
    state.analyst.input = "";
    state.analyst.loading = true;
    state.analyst.error = null;
    state.analyst.pending = q;
    startAnalystSteps();
    renderView(); scrollChat();
    var done = function (res) {
      stopAnalystSteps();
      state.analyst.loading = false; state.analyst.pending = null;
      if (Array.isArray(res.conversationHistory)) state.analyst.conversationHistory = res.conversationHistory;
      var turn = { id: state.analyst.seq++, question: q, res: res, chartType: "bar", inspector: false, resultTab: (res.rows || []).length ? "table" : "details" };
      state.analyst.messages.push(turn);
      saveRecent(turn);
      renderView(); scrollChat();
    };
    var fail = function (err) {
      stopAnalystSteps();
      state.analyst.loading = false; state.analyst.pending = null;
      state.analyst.error = String(err && err.message ? err.message : err);
      renderView();
    };
    if (isLive()) {
      domo.post(CE + "askAnalyst", { question: q, persona: state.persona, conversationHistory: state.analyst.conversationHistory, view: activeView() })
        .then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") { d.live = true; done(d); }
          else throw new Error(d && d.error ? d.error : "Analyst call failed");
        })
        .catch(function (err) { console.warn("[app] live analyst failed, using sample seed:", err); sampleAnalyst(q).then(done).catch(fail); });
      return;
    }
    sampleAnalyst(q).then(done).catch(fail);
  }

  function sampleAnalyst(question) {
    return fetch("./public/mock/analyst-answers.json")
      .then(function (r) { return r.json(); })
      .then(function (seed) {
        var ql = question.toLowerCase();
        var match = (seed.answers || []).filter(function (a) {
          var aq = String(a.question || "").toLowerCase();
          return aq === ql || aq.indexOf(ql) > -1 || ql.indexOf(aq.slice(0, 24)) > -1;
        })[0];
        if (!match) {
          return {
            sampled: true, question: question, unmatched: true,
            interpretation: "This offline preview ships answers for the golden-path questions only. Connect the snowflakece Code Engine bridge to ask anything against the governed semantic view \u2014 the live chatbot keeps full conversation context.",
            sql: "", columns: [], rows: [], rowCount: 0, suggestions: seed.suggested || ANALYST_SUGGESTED
          };
        }
        var res = JSON.parse(JSON.stringify(match));
        res.sampled = true;
        return res;
      });
  }

  function scrollChat() {
    requestAnimationFrame(function () {
      var sc = document.querySelector(".chat-scroll");
      if (sc) sc.scrollTop = sc.scrollHeight;
    });
  }

  // Normalize confidence across live (confidence.verified_query_used) and mock (confidenceVerified).
  function analystVerified(res) {
    if (res.confidenceVerified != null) return { verified: !!res.confidenceVerified, name: res.verifiedQueryName || "" };
    var vq = res.confidence && res.confidence.verified_query_used;
    if (vq && vq.name) return { verified: true, name: vq.name };
    return { verified: false, name: "" };
  }

  function fmtCell(v) {
    if (v === null || v === undefined) return "\u2014";
    if (typeof v === "number") return v.toLocaleString("en-US");
    var s = String(v);
    if (/^-?\d+(\.\d+)?$/.test(s) && s.length <= 15) return Number(s).toLocaleString("en-US");
    return s;
  }
  function isNumType(t) { t = String(t || "").toLowerCase(); return t.indexOf("fixed") > -1 || t.indexOf("real") > -1 || t.indexOf("number") > -1 || t.indexOf("float") > -1 || t.indexOf("int") > -1; }
  function isMoneyCol(name) { return /(revenue|amount|arr|protected|at_risk|risk_amount|\bmrr\b|\bacv\b|\btcv\b|value)/i.test(name) && !/score|rate|pct|percent|prob|count|days|rank/i.test(name); }

  // Pick a label column (text/date) + numeric column for auto-visualization.
  function chartSpec(res) {
    var cols = res.columns || [];
    var rows = res.rows || [];
    if (!cols.length || rows.length < 2 || rows.length > 24) return null;
    var labelCol = null, valCol = null;
    cols.forEach(function (c) {
      if (isNumType(c.type) && !valCol) valCol = c.name;
      else if (!isNumType(c.type) && !labelCol) labelCol = c.name;
    });
    if (!labelCol) { var first = cols[0]; if (first) labelCol = first.name; }
    if (!labelCol || !valCol || labelCol === valCol) return null;
    return { labelCol: labelCol, valCol: valCol };
  }

  var PIE_COLORS = ["#29B5E8", "#1E6FBF", "#11567F", "#2FC08C", "#F5A623", "#8B5CF6", "#EF5B6E", "#0EA5B7"];
  function buildChart(turn) {
    var res = turn.res, spec = chartSpec(res);
    if (!spec) return null;
    var rows = (res.rows || []).slice(0, 24);
    var moneyish = isMoneyCol(spec.valCol);
    var fmtVal = function (v) { return moneyish ? money(v) : fmtCell(v); };
    var type = turn.chartType || "bar";
    var svgNS = "http://www.w3.org/2000/svg";

    if (type === "line") {
      var W = 640, H = 220, x0 = 48, x1 = 624, y0 = 16, y1 = 184;
      var max = 0, min = 0; rows.forEach(function (r) { var v = Number(r[spec.valCol]) || 0; max = Math.max(max, v); min = Math.min(min, v); });
      if (max === min) max = min + 1;
      var n = rows.length;
      var X = function (i) { return x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)); };
      var Y = function (v) { return y1 - (y1 - y0) * ((v - min) / (max - min)); };
      var svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("viewBox", "0 0 " + W + " " + H); svg.setAttribute("width", "100%"); svg.setAttribute("height", "220");
      [y0, (y0 + y1) / 2, y1].forEach(function (gy) { var l = document.createElementNS(svgNS, "line"); l.setAttribute("class", "chart-grid"); l.setAttribute("x1", x0); l.setAttribute("y1", gy); l.setAttribute("x2", x1); l.setAttribute("y2", gy); svg.appendChild(l); });
      var pts = rows.map(function (r, i) { return X(i) + "," + Y(Number(r[spec.valCol]) || 0); });
      var poly = document.createElementNS(svgNS, "polyline"); poly.setAttribute("class", "chart-line"); poly.setAttribute("points", pts.join(" ")); svg.appendChild(poly);
      rows.forEach(function (r, i) {
        var c = document.createElementNS(svgNS, "circle"); c.setAttribute("class", "chart-dot"); c.setAttribute("cx", X(i)); c.setAttribute("cy", Y(Number(r[spec.valCol]) || 0)); c.setAttribute("r", 3.4); svg.appendChild(c);
        if (i % Math.ceil(n / 8) === 0 || i === n - 1) {
          var t = document.createElementNS(svgNS, "text"); t.setAttribute("class", "chart-xlab"); t.setAttribute("x", X(i)); t.setAttribute("y", y1 + 16); t.textContent = String(r[spec.labelCol]).slice(0, 8); svg.appendChild(t);
        }
      });
      return h("div", { class: "chart chart-svg" }, [svg]);
    }

    if (type === "pie") {
      var total = 0; rows.forEach(function (r) { total += Math.abs(Number(r[spec.valCol]) || 0); });
      if (total <= 0) total = 1;
      var cx = 110, cy = 110, rad = 96, ang = -Math.PI / 2;
      var svgP = document.createElementNS(svgNS, "svg"); svgP.setAttribute("viewBox", "0 0 220 220"); svgP.setAttribute("width", "220"); svgP.setAttribute("height", "220");
      var legend = h("div", { class: "pie-legend" });
      rows.forEach(function (r, i) {
        var v = Math.abs(Number(r[spec.valCol]) || 0); var frac = v / total; var a2 = ang + frac * Math.PI * 2;
        var large = frac > 0.5 ? 1 : 0;
        var x1p = cx + rad * Math.cos(ang), y1p = cy + rad * Math.sin(ang), x2p = cx + rad * Math.cos(a2), y2p = cy + rad * Math.sin(a2);
        var path = document.createElementNS(svgNS, "path");
        path.setAttribute("d", "M " + cx + " " + cy + " L " + x1p.toFixed(2) + " " + y1p.toFixed(2) + " A " + rad + " " + rad + " 0 " + large + " 1 " + x2p.toFixed(2) + " " + y2p.toFixed(2) + " Z");
        path.setAttribute("fill", PIE_COLORS[i % PIE_COLORS.length]); path.setAttribute("stroke", "#fff"); path.setAttribute("stroke-width", "1.5");
        svgP.appendChild(path); ang = a2;
        legend.appendChild(h("span", { class: "pie-item" }, [
          h("span", { class: "pie-dot", style: "background:" + PIE_COLORS[i % PIE_COLORS.length] }),
          h("span", { class: "pie-lab" }, [String(r[spec.labelCol])]),
          h("span", { class: "pie-val" }, [fmtVal(Number(r[spec.valCol]) || 0) + " \u00b7 " + Math.round(frac * 100) + "%"])
        ]));
      });
      return h("div", { class: "chart chart-pie" }, [svgP, legend]);
    }

    // bar (default)
    var maxB = 1; rows.forEach(function (r) { maxB = Math.max(maxB, Math.abs(Number(r[spec.valCol]) || 0)); });
    var chart = h("div", { class: "bar-chart" });
    rows.forEach(function (r) {
      var v = Number(r[spec.valCol]) || 0;
      var label = String(r[spec.labelCol] == null ? "\u2014" : r[spec.labelCol]);
      chart.appendChild(h("div", { class: "bar-row" }, [
        h("span", { class: "bar-label" }, [label]),
        h("span", { class: "bar-track" }, [h("span", { class: "bar-fill", style: "width: " + Math.max(3, (Math.abs(v) / maxB) * 100) + "%" })]),
        h("span", { class: "bar-value" }, [fmtVal(v)])
      ]));
    });
    return chart;
  }

  function resultTable(res, limit) {
    var cols = res.columns || [];
    var rows = res.rows || [];
    var table = h("table", { class: "result-table" });
    var thead = h("thead"), htr = h("tr");
    cols.forEach(function (c) { htr.appendChild(h("th", {}, [c.name])); });
    thead.appendChild(htr); table.appendChild(thead);
    var tbody = h("tbody");
    rows.slice(0, limit || 50).forEach(function (r) {
      var tr = h("tr");
      cols.forEach(function (c) { tr.appendChild(h("td", { class: isNumType(c.type) ? "num" : "" }, [fmtCell(r[c.name])])); });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return h("div", { class: "table-wrap" }, [table]);
  }

  function copyBtn(text, label) {
    var b = h("button", { class: "mini-btn" }, [label || "Copy"]);
    b.addEventListener("click", function () { copyText(text).then(function () { var o = b.textContent; b.textContent = "Copied"; b.classList.add("ok"); setTimeout(function () { b.textContent = o; b.classList.remove("ok"); }, 1200); }); });
    return b;
  }

  // "Processing Query" step card shown while Cortex Analyst runs (reference parity).
  var CHECK_SVG = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6L9 17l-5-5'/></svg>";
  var PLAY_SVG = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polygon points='6 4 20 12 6 20 6 4'/></svg>";
  function analystProcessing() {
    var cur = state.analyst.step || 0;
    var card = h("div", { class: "proc-card" }, [
      h("div", { class: "proc-head" }, [
        h("img", { class: "proc-mark", src: "./public/brand/snowflake-cortex.svg", alt: "" }),
        h("span", { class: "proc-title" }, ["Processing Query"])
      ])
    ]);
    var list = h("div", { class: "proc-steps" });
    ANALYST_STEPS.forEach(function (s, i) {
      var stateCls = i < cur ? "done" : (i === cur ? "active" : "todo");
      var icon = h("span", { class: "proc-ico", html: i < cur ? CHECK_SVG : (i === cur ? PLAY_SVG : "") });
      var row = h("div", { class: "proc-step " + stateCls }, [
        icon,
        h("div", { class: "proc-body" }, [
          h("span", { class: "proc-step-title" }, [s.title]),
          h("span", { class: "proc-step-sub" }, [typeof s.sub === "function" ? s.sub() : s.sub])
        ])
      ]);
      if (i === cur) row.appendChild(h("span", { class: "proc-bar" }));
      list.appendChild(row);
    });
    card.appendChild(list);
    card.appendChild(h("div", { class: "proc-foot" }, ["Powered by ", h("span", { class: "proc-foot-b" }, ["Cortex Analyst"])]));
    return card;
  }

  // Render one analyst answer card (interpretation, SQL, chart+switcher, table, follow-ups, inspector).
  function analystAnswer(turn) {
    var res = turn.res;
    var card = h("div", { class: "msg msg-analyst" });
    card.appendChild(h("div", { class: "msg-avatar" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "Cortex" })]));
    var body = h("div", { class: "msg-body" });

    if (res.unmatched) {
      body.appendChild(h("p", { class: "msg-interp" }, [res.interpretation]));
    } else {
      var v = analystVerified(res);
      var head = h("div", { class: "msg-head" }, [
        h("span", { class: "msg-who" }, ["Cortex Analyst"]),
        v.verified ? h("span", { class: "confidence verified" }, ["\u2713 Verified \u00b7 " + v.name]) : h("span", { class: "confidence generated" }, ["Cortex-generated SQL"])
      ]);
      body.appendChild(head);
      if (res.interpretation) body.appendChild(h("p", { class: "msg-interp" }, [res.interpretation]));

      // Query Results panel with Table / Chart / Details tabs (reference parity).
      var cols = res.columns || [];
      var rows = res.rows || [];
      var hasRows = rows.length > 0;
      var spec = chartSpec(res);
      var tabs = [];
      if (hasRows) tabs.push("table");
      if (spec) tabs.push("chart");
      tabs.push("details");
      var tab = turn.resultTab || (hasRows ? "table" : "details");
      if (tabs.indexOf(tab) === -1) tab = tabs[0];

      var seg = h("div", { class: "qr-tabs" });
      tabs.forEach(function (t) {
        var b = h("button", { class: "qr-tab" + (t === tab ? " active" : "") }, [t.charAt(0).toUpperCase() + t.slice(1)]);
        b.addEventListener("click", function () { turn.resultTab = t; renderView(); });
        seg.appendChild(b);
      });
      var qrHead = h("div", { class: "qr-head" }, [
        h("span", { class: "qr-count" }, [hasRows ? (num(rows.length) + " rows, " + num(cols.length) + " columns") : "No rows returned"]),
        seg
      ]);
      var qrBody = h("div", { class: "qr-body" });

      if (tab === "table") {
        qrBody.appendChild(resultTable(res, 100));
        var csv = h("button", { class: "mini-btn" }, ["Download CSV"]);
        csv.addEventListener("click", function () { downloadCsv("analyst-result-" + turn.id + ".csv", cols, rows); });
        qrBody.appendChild(h("div", { class: "qr-actions" }, [csv]));
      } else if (tab === "chart") {
        var ct = h("div", { class: "chart-tools" });
        ["bar", "line", "pie"].forEach(function (t) {
          var b = h("button", { class: "seg" + (turn.chartType === t ? " active" : "") }, [t.charAt(0).toUpperCase() + t.slice(1)]);
          b.addEventListener("click", function () { turn.chartType = t; renderView(); });
          ct.appendChild(b);
        });
        qrBody.appendChild(h("div", { class: "qr-charttools" }, [ct]));
        var ch = buildChart(turn);
        qrBody.appendChild(ch || h("p", { class: "qr-empty" }, ["This result isn\u2019t chartable \u2014 view it as a table."]));
      } else {
        qrBody.appendChild(h("div", { class: "qr-detail" }, [h("div", { class: "qr-d-label" }, ["Question"]), h("p", { class: "qr-d-q" }, [turn.question])]));
        qrBody.appendChild(h("div", { class: "qr-detail" }, [h("div", { class: "qr-d-label" }, ["Analyst response"]), h("p", { class: "qr-d-a" }, [res.interpretation || "Cortex Analyst interpreted your question over the governed semantic view."])]));
        if (res.sql) {
          qrBody.appendChild(h("div", { class: "qr-detail" }, [
            h("div", { class: "qr-d-label row" }, [h("span", {}, ["Generated SQL"]), copyBtn(res.sql, "Copy SQL")]),
            h("pre", { class: "sql-block" }, [h("code", {}, [fmtSql(res.sql)])])
          ]));
        }
        var api = res.api || {};
        var insp = h("button", { class: "mini-btn ghost" }, [turn.inspector ? "Hide API payload" : "Inspect API payload"]);
        insp.addEventListener("click", function () { turn.inspector = !turn.inspector; renderView(); });
        qrBody.appendChild(h("div", { class: "qr-detail" }, [
          h("div", { class: "qr-d-label row" }, [h("span", {}, [res.semanticView || "REVENUE_CC_ANALYST"]),
            res.requestId ? h("span", { class: "req" }, ["request_id " + String(res.requestId).slice(0, 8)]) : null, insp])
        ]));
        if (turn.inspector) {
          var ins = h("div", { class: "inspector-body" });
          ins.appendChild(h("div", { class: "insp-label" }, ["POST " + (api.endpoint || "/api/v2/cortex/analyst/message")]));
          ins.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(api.request || { note: "Populated on live calls through the snowflakece bridge." }, null, 2)])]));
          if (api.response) { ins.appendChild(h("div", { class: "insp-label" }, ["Response"])); ins.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(api.response, null, 2)])])); }
          qrBody.appendChild(ins);
        }
      }
      body.appendChild(h("div", { class: "qr-panel" }, [qrHead, qrBody]));

      // Follow-up chips
      if ((res.suggestions || []).length) {
        var chips = h("div", { class: "suggest-chips inline" });
        res.suggestions.slice(0, 4).forEach(function (s) {
          var c = h("button", { class: "chip" }, [s]);
          c.addEventListener("click", function () { runAnalyst(s); });
          chips.appendChild(c);
        });
        body.appendChild(h("div", { class: "msg-followups" }, [h("span", { class: "fu-lab" }, ["Follow up"]), chips]));
      }
    }
    card.appendChild(body);
    return card;
  }

  function userMsg(text) {
    return h("div", { class: "msg msg-user" }, [h("div", { class: "msg-body" }, [h("p", {}, [text])])]);
  }

  // "Connected: DB.SCHEMA · Role" governance chip (mirrors the reference Cortex
  // Analyst app), driven by the app's Snowflake config.
  // Slim single-line connection bar (reference parity): connection facts inline
  // on the left, compact icon controls (view picker + new chat) on the right.
  function analystConnBar() {
    var cfg = state.config || {};
    var facts = h("div", { class: "cbar-facts" }, [
      h("span", { class: "cc-dot live" }),
      h("span", { class: "cc-lab" }, ["Connected"]),
      h("span", { class: "cc-val" }, [(cfg.database || "SNOWFLAKE_REVENUE_CC") + "." + (cfg.schema || "CORE")]),
      h("span", { class: "cc-sep" }, ["\u00b7"]),
      h("span", { class: "cc-lab" }, ["Role"]),
      h("span", { class: "cc-val" }, [cfg.role || "REVENUE_CC_READER"]),
      h("span", { class: "cc-sep" }, ["\u00b7"]),
      viewPicker()
    ]);
    var newBtn = h("button", { class: "cbar-icon", title: "New chat" }, ["\u21bb"]);
    newBtn.addEventListener("click", newChat);
    return h("div", { class: "conn-bar" }, [facts, h("div", { class: "cbar-tools" }, [newBtn])]);
  }

  // Semantic-model picker, folded into the connection bar as a labeled
  // "Semantic model: <view> \u25be" dropdown so it's self-explanatory (not a bare
  // gear). Populated live from listSemanticViews. Cortex Analyst queries one
  // model per call: the first selected view is ACTIVE; extra selections are kept
  // as quick-switch context.
  function viewPicker() {
    var a = state.analyst;
    var sel = a.selectedViews || [];
    var active = sel[0] || (state.config && state.config.view) || "REVENUE_CC_ANALYST";
    var extra = sel.length > 1 ? sel.length - 1 : 0;
    var caret = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>";
    var trigger = h("button", {
      class: "cc-picker" + (a.pickerOpen ? " open" : ""),
      title: "Change the governed semantic model Cortex Analyst queries",
      "aria-haspopup": "listbox", "aria-expanded": a.pickerOpen ? "true" : "false"
    }, [
      h("span", { class: "cc-lab" }, ["Semantic model"]),
      h("span", { class: "cc-val" }, [active]),
      extra ? h("span", { class: "cc-more" }, ["+" + extra]) : null,
      h("span", { class: "cc-caret", html: caret })
    ]);
    trigger.addEventListener("click", function (e) { e.stopPropagation(); a.pickerOpen = !a.pickerOpen; if (a.pickerOpen && !a.viewsLoaded) loadViews().then(function () { renderView(); }); renderView(); });
    var wrap = h("div", { class: "view-picker" }, [trigger]);
    if (a.pickerOpen) {
      var menu = h("div", { class: "vp-menu" });
      menu.addEventListener("click", function (e) { e.stopPropagation(); });
      menu.appendChild(h("div", { class: "vp-menu-head" }, [
        h("span", {}, ["Governed semantic models"]),
        (a.viewsLoading ? h("span", { class: "vp-loading" }, [h("span", { class: "spinner sm" }), "discovering\u2026"]) : h("span", { class: "vp-count" }, [String((a.views || []).length) + " live"]))
      ]));
      (a.views || []).forEach(function (v) {
        var on = sel.indexOf(v.name) > -1;
        var isPrimary = sel[0] === v.name;
        var link = h("a", { class: "vp-open", href: snowsightObjHref("semantic-view", v.name), target: "_blank", rel: "noopener", title: "Open in Snowsight" }, [h("span", { class: "src-arrow" }, ["\u2197"])]);
        link.addEventListener("click", function (e) { e.stopPropagation(); });
        var row = h("button", { class: "vp-opt" + (on ? " on" : ""), role: "option", "aria-selected": on ? "true" : "false" }, [
          h("span", { class: "vp-check" }, [on ? "\u2713" : ""]),
          h("span", { class: "vp-opt-body" }, [
            h("span", { class: "vp-opt-name" }, [v.name, isPrimary ? h("span", { class: "vp-primary" }, ["ACTIVE"]) : null]),
            v.comment ? h("span", { class: "vp-opt-desc" }, [String(v.comment).slice(0, 96)]) : null
          ]),
          link
        ]);
        row.addEventListener("click", function (e) {
          e.stopPropagation();
          var i = sel.indexOf(v.name);
          if (i > -1) { if (sel.length > 1) sel.splice(i, 1); }
          else sel.push(v.name);
          renderView();
        });
        menu.appendChild(row);
      });
      menu.appendChild(h("div", { class: "vp-menu-foot" }, ["Cortex Analyst queries the ", h("b", {}, ["ACTIVE"]), " model. Click to set it active; select more to keep them one click away."]));
      wrap.appendChild(menu);
    }
    return wrap;
  }

  // Relative time for the "recent questions" list (mirrors the reference app).
  function timeAgo(iso) {
    if (!iso) return "";
    var d = new Date(iso); if (isNaN(d.getTime())) return "";
    var mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + " min ago";
    var hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + " hour" + (hrs > 1 ? "s" : "") + " ago";
    var days = Math.floor(hrs / 24); if (days < 7) return days + " day" + (days > 1 ? "s" : "") + " ago";
    return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  }

  // The verified queries the semantic model ships with (the ones Cortex trusts).
  function analystVerified() {
    var vq = (state.semantic.model && (state.semantic.model.verifiedQueries || state.semantic.model.verified_queries)) || [];
    if (vq.length) return vq;
    return ANALYST_SUGGESTED.map(function (q) { return { question: q }; });
  }

  // Short "tables · metrics" hint parsed from the verified SQL, for card context.
  function vqHint(q) {
    var sql = q.sql || ""; if (!sql) return "Semantic view";
    var tbls = {};
    (sql.match(/\b([a-z_]+)\.[a-z_]+/g) || []).forEach(function (m) { tbls[m.split(".")[0]] = 1; });
    var names = Object.keys(tbls).filter(function (n) { return n !== "date"; }).slice(0, 3);
    return names.length ? names.join(" \u00b7 ") : "Semantic view";
  }

  // Reference-parity landing: centered "Ask a question" hero + verified query
  // gallery + recent questions. Shown until the first turn starts a transcript.
  function analystWelcome() {
    var view = state.analyst.selectedViews[0] || "REVENUE_CC_ANALYST";
    var input = h("input", { class: "aw-input", type: "text", placeholder: "e.g. Why did renewal risk increase for West Enterprise accounts this month?", value: state.analyst.input || "" });
    input.addEventListener("input", function () { state.analyst.input = input.value; });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") runAnalyst(input.value); });
    var send = h("button", { class: "aw-send", title: "Ask", "aria-label": "Ask" }, [
      h("span", { class: "aw-send-ico", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><line x1='5' y1='12' x2='19' y2='12'/><polyline points='12 5 19 12 12 19'/></svg>" })
    ]);
    send.addEventListener("click", function () { runAnalyst(input.value); });

    var hero = h("div", { class: "aw-hero" }, [
      h("h1", { class: "aw-title" }, ["Ask a question"]),
      h("p", { class: "aw-sub" }, ["Natural language over ", h("code", {}, [view]), " \u2014 every answer returns governed SQL and live rows."]),
      h("div", { class: "aw-inputwrap" }, [input, send])
    ]);

    var vq = analystVerified();
    var grid = h("div", { class: "aw-vq-grid" });
    vq.slice(0, 6).forEach(function (q) {
      var card = h("button", { class: "aw-vq" }, [
        h("span", { class: "aw-vq-badge" }, [h("span", { class: "aw-vq-check" }, ["\u2713"]), "Verified query"]),
        h("span", { class: "aw-vq-q" }, [q.question]),
        h("span", { class: "aw-vq-meta" }, [q.sql ? vqHint(q) : "Suggested"])
      ]);
      card.addEventListener("click", function () { runAnalyst(q.question); });
      grid.appendChild(card);
    });
    var verifiedSec = h("div", { class: "aw-section" }, [
      h("div", { class: "aw-sec-head" }, [h("span", { class: "aw-sec-title" }, ["Verified questions"]), h("span", { class: "aw-sec-count" }, [vq.length + " curated"])]),
      grid
    ]);

    var recent = state.analyst.recent || [];
    var recentSec;
    if (recent.length) {
      var list = h("div", { class: "aw-recent-list" });
      recent.slice(0, 5).forEach(function (r) {
        var rerun = h("button", { class: "aw-rec-run", title: "Ask again" }, ["\u21bb"]);
        rerun.addEventListener("click", function (ev) { ev.stopPropagation(); runAnalyst(r.query_text); });
        var row = h("button", { class: "aw-recent" }, [
          h("div", { class: "aw-rec-main" }, [
            h("span", { class: "aw-rec-q" }, [r.query_text || "(query)"]),
            h("span", { class: "aw-rec-meta" }, [timeAgo(r.created_at) + (r.result_row_count != null ? "  \u00b7  " + r.result_row_count + " rows" : "")])
          ]),
          rerun
        ]);
        row.addEventListener("click", function () { runAnalyst(r.query_text); });
        list.appendChild(row);
      });
      recentSec = h("div", { class: "aw-section" }, [
        h("div", { class: "aw-sec-head" }, [h("span", { class: "aw-sec-title" }, ["My recent questions"]), h("span", { class: "aw-sec-count" }, [recent.length + " saved"])]),
        list
      ]);
    } else {
      recentSec = h("div", { class: "aw-section" }, [
        h("div", { class: "aw-sec-head" }, [h("span", { class: "aw-sec-title" }, ["My recent questions"])]),
        h("p", { class: "aw-recent-empty" }, ["Answered questions are saved to the ", h("code", {}, ["recent_queries"]), " AppDB collection and appear here."])
      ]);
    }

    return h("div", { class: "analyst-welcome" }, [hero, verifiedSec, recentSec]);
  }

  function renderAnalyst() {
    if (!state.analyst.recentLoaded) loadRecent().then(function () { if (state.surface === "analyst") renderView(); });
    if (!state.analyst.viewsLoaded && !state.analyst.viewsLoading) loadViews().then(function () { if (state.surface === "analyst") renderView(); });
    if (!state.semantic.loaded && !state.semantic.loading) loadSemantic();
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);

    var hasMsgs = state.analyst.messages.length > 0;
    var chatActive = hasMsgs || state.analyst.loading;

    // Single slim connection bar (reference parity): facts inline + icon controls.
    var header = [analystConnBar()];

    // Landing state: centered hero + verified gallery + recent (reference parity).
    if (!chatActive) {
      var landing = h("div", { class: "chat-main landing" }, header.concat([analystWelcome()]));
      frag.appendChild(h("section", { class: "chat-layout solo" }, [landing]));
      return frag;
    }

    // Transcript
    var scroll = h("div", { class: "chat-scroll" });
    state.analyst.messages.forEach(function (turn) {
      scroll.appendChild(userMsg(turn.question));
      scroll.appendChild(analystAnswer(turn));
    });
    if (state.analyst.loading) {
      if (state.analyst.pending) scroll.appendChild(userMsg(state.analyst.pending));
      scroll.appendChild(h("div", { class: "msg msg-analyst" }, [
        h("div", { class: "msg-avatar" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" })]),
        h("div", { class: "msg-body" }, [analystProcessing()])
      ]));
    }
    if (state.analyst.error) {
      scroll.appendChild(h("div", { class: "conn-banner" }, [h("div", {}, [h("span", { class: "cb-title" }, ["Analyst error \u2014 "]), state.analyst.error])]));
    }

    // Composer
    var input = h("input", { class: "chat-input", type: "text", placeholder: hasMsgs ? "Ask a follow-up\u2026" : "Ask why \u2014 in plain language \u2014 over the governed semantic view\u2026", value: state.analyst.input || "" });
    input.addEventListener("input", function () { state.analyst.input = input.value; });
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") runAnalyst(input.value); });
    var send = h("button", { class: "pill-btn primary" }, ["Send"]);
    send.addEventListener("click", function () { runAnalyst(input.value); });
    var composer = h("div", { class: "chat-composer" }, [input, send]);

    var main = h("div", { class: "chat-main" }, header.concat([scroll, composer]));

    // Rail: examples + recent queries + governed round-trip
    var rail = h("aside", { class: "chat-rail" });
    var exWrap = h("div", { class: "rail-card" }, [h("h3", {}, ["Try asking"])]);
    ANALYST_SUGGESTED.forEach(function (s) { var c = h("button", { class: "rail-ex" }, [s]); c.addEventListener("click", function () { runAnalyst(s); }); exWrap.appendChild(c); });
    rail.appendChild(exWrap);

    var recentWrap = h("div", { class: "rail-card" }, [h("h3", {}, ["Recent questions"])]);
    if ((state.analyst.recent || []).length) {
      state.analyst.recent.slice(0, 8).forEach(function (r) {
        var c = h("button", { class: "rail-recent" }, [
          h("span", { class: "rr-q" }, [r.query_text || "(query)"]),
          h("span", { class: "rr-meta" }, [(r.result_row_count != null ? r.result_row_count + " rows" : "") ])
        ]);
        c.addEventListener("click", function () { runAnalyst(r.query_text); });
        recentWrap.appendChild(c);
      });
    } else {
      recentWrap.appendChild(h("p", { class: "rail-empty" }, ["Answered questions are saved to the ", h("code", {}, ["recent_queries"]), " AppDB collection."]));
    }
    rail.appendChild(recentWrap);

    rail.appendChild(h("div", { class: "rail-card" }, [
      h("h3", {}, ["Governed round-trip"]),
      h("ul", { class: "gov-steps" }, [
        h("li", {}, ["NL turn \u2192 Cortex Analyst ", h("code", {}, ["/message"]), " (with history)"]),
        h("li", {}, ["Analyst returns SQL over the semantic view"]),
        h("li", {}, ["SQL runs as ", h("code", {}, ["REVENUE_CC_READER"])]),
        h("li", {}, ["Rows charted in Domo \u2014 nothing runs client-side"])
      ])
    ]));

    frag.appendChild(h("section", { class: "chat-layout" }, [main, rail]));
    return frag;
  }

  /* --------------------------- Semantic Model ---------------------------- */
  /* A live view of the governed semantic layer that powers the whole app:
   * an entity graph (tables -> dims/facts/metrics + relationships), the
   * verified-query gallery Cortex trusts, and a Model DDL builder that can
   * evolve the layer (ALTER SEMANTIC VIEW, best-effort). Introspection is live
   * via describeSemanticView; falls back to a captured seed offline. */
  function loadSemantic() {
    if (state.semantic.loaded || state.semantic.loading) return;
    state.semantic.loading = true;
    var refresh = function () { if (state.surface === "semantic" || state.surface === "readiness") renderView(); };
    var done = function (payload, live) {
      state.semantic.model = payload.model || null;
      state.semantic.view = payload.view || null;
      state.semantic.sql = payload.sql || null;
      state.semantic.live = !!live;
      state.semantic.loading = false; state.semantic.loaded = true;
      refresh();
    };
    var seed = function () {
      fetch("./public/mock/semantic-model.json").then(function (r) { return r.json(); }).then(function (s) { done(s, false); })
        .catch(function (err) { state.semantic.loading = false; state.semantic.loaded = true; state.semantic.error = String(err && err.message ? err.message : err); renderView(); });
    };
    if (isLive()) {
      domo.post(CE + "describeSemanticView", { view: state.config.database + "." + state.config.schema + "." + state.config.view })
        .then(function (resp) { var d = unwrap(resp); if (d && d.status === "SUCCEEDED" && d.model) done(d, true); else seed(); })
        .catch(function (err) { console.warn("[app] live describe failed, using seed:", err); seed(); });
      return;
    }
    seed();
  }

  function semTablesById(model) { var m = {}; (model.tables || []).forEach(function (t) { m[t.name] = t; }); return m; }

  function semaSelect(id) { return h("select", { id: id }, []); }

  function renderSemanticERD(model) {
    var wrap = h("div", { class: "erd-wrap" });
    var container = h("div", { class: "erd-container" });
    var tables = model.tables || [];
    var COLW = 300, ROWH = 300, PERROW = 3;
    tables.forEach(function (t, i) {
      var col = i % PERROW, row = Math.floor(i / PERROW);
      var cols = [];
      (t.primaryKey || []).forEach(function (pk) { cols.push({ name: pk, kind: "pk" }); });
      t.dimensions.forEach(function (d) { if ((t.primaryKey || []).indexOf(d.name) === -1) cols.push({ name: d.name, kind: "dim" }); });
      t.facts.forEach(function (f) { cols.push({ name: f.name, kind: "fact" }); });
      var shown = cols.slice(0, 6);
      var extra = cols.length - shown.length;
      var card = h("div", { class: "erd-card" + (state.semantic.selected === t.name ? " selected" : ""), id: "erd-" + t.name });
      card.style.left = (col * COLW) + "px"; card.style.top = (row * ROWH) + "px";
      card.appendChild(h("div", { class: "erd-card-head" }, [h("span", { class: "erd-tname" }, [t.name]), h("span", { class: "erd-base" }, [t.base])]));
      var colWrap = h("div", { class: "erd-cols" });
      shown.forEach(function (c) { colWrap.appendChild(h("div", { class: "erd-col" }, [h("span", { class: "erd-cdot " + c.kind }), h("span", {}, [c.name])])); });
      if (extra > 0) colWrap.appendChild(h("div", { class: "erd-col more" }, ["+ " + extra + " more"]));
      colWrap.appendChild(h("div", { class: "erd-col metricrow" }, [h("span", { class: "erd-cdot metric" }), h("span", {}, [t.metrics.length + " metrics"])]));
      card.appendChild(colWrap);
      card.addEventListener("click", function () { state.semantic.selected = (state.semantic.selected === t.name ? null : t.name); renderView(); });
      container.appendChild(card);
    });
    var svgNS = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("class", "erd-svg"); svg.id = "erd-svg";
    container.appendChild(svg);
    wrap.appendChild(container);
    requestAnimationFrame(function () { drawSemanticRels(model); });
    return wrap;
  }

  function drawSemanticRels(model) {
    var svg = document.getElementById("erd-svg"); if (!svg) return;
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var container = svg.parentElement; var cRect = container.getBoundingClientRect();
    (model.relationships || []).forEach(function (rel, idx) {
      var from = document.getElementById("erd-" + rel.from), to = document.getElementById("erd-" + rel.to);
      if (!from || !to) return;
      var fr = from.getBoundingClientRect(), tr = to.getBoundingClientRect();
      var fromRight = fr.left <= tr.left;
      var sx = (fromRight ? fr.right : fr.left) - cRect.left, sy = fr.top - cRect.top + fr.height / 2;
      var ex = (fromRight ? tr.left : tr.right) - cRect.left, ey = tr.top - cRect.top + tr.height / 2;
      var dx = Math.max(40, Math.abs(ex - sx) * 0.5);
      var svgNS = "http://www.w3.org/2000/svg";
      var path = document.createElementNS(svgNS, "path");
      var c1x = sx + (fromRight ? dx : -dx), c2x = ex + (fromRight ? -dx : dx);
      path.setAttribute("d", "M " + sx + " " + sy + " C " + c1x + " " + sy + ", " + c2x + " " + ey + ", " + ex + " " + ey);
      path.setAttribute("class", "erd-rel");
      svg.appendChild(path);
      [[sx, sy], [ex, ey]].forEach(function (p) { var c = document.createElementNS(svgNS, "circle"); c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", 4); c.setAttribute("class", "erd-endpoint"); svg.appendChild(c); });
    });
  }

  function semanticDetail(model) {
    var t = (model.tables || []).filter(function (x) { return x.name === state.semantic.selected; })[0];
    if (!t) {
      return h("div", { class: "sem-detail placeholder" }, [
        h("div", { class: "sem-ph-icon" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" })]),
        h("p", {}, ["Select a table to inspect its dimensions, metrics, and relationships."]),
        model.customInstruction ? h("div", { class: "sem-ai-box" }, [h("h4", {}, ["AI custom instructions"]), h("p", {}, [model.customInstruction])]) : null
      ]);
    }
    var rels = (model.relationships || []).filter(function (r) { return r.from === t.name || r.to === t.name; });
    var d = h("div", { class: "sem-detail" });
    d.appendChild(h("div", { class: "sem-dt-head" }, [h("h3", {}, [t.name]), h("span", { class: "erd-base" }, [t.database + "." + t.schema + "." + t.base])]));
    if (t.comment) d.appendChild(h("p", { class: "sem-dt-comment" }, [t.comment]));
    if ((t.primaryKey || []).length) d.appendChild(h("div", { class: "sem-pk" }, ["PK: " + t.primaryKey.join(" + ")]));
    var domoHits = domoModelsForBase(t.base);
    if (domoHits.length) {
      var ds = h("div", { class: "sem-section" }, [h("h4", { class: "domo-h" }, ["In Domo (Cloud Amplifier) ", h("span", { class: "cnt" }, [String(domoHits.length)])])]);
      domoHits.forEach(function (hit) {
        ds.appendChild(h("a", { class: "sem-domo-link", href: domoModelHref(hit.model), target: "_blank", rel: "noopener" }, [
          h("span", { class: "sdl-role " + hit.role }, [hit.role === "hub" ? "HUB" : "FACT"]),
          h("b", {}, [hit.model.name]),
          h("span", { class: "sdl-open" }, ["\u2197"])
        ]));
      });
      d.appendChild(ds);
    }
    if (rels.length) {
      var rl = h("div", { class: "sem-section" }, [h("h4", { class: "rel-h" }, ["Relationships ", h("span", { class: "cnt" }, [String(rels.length)])])]);
      rels.forEach(function (r) {
        var out = r.from === t.name; var other = out ? r.to : r.from;
        rl.appendChild(h("div", { class: "sem-rel" }, [h("span", { class: "rel-dir" }, [out ? "\u2192" : "\u2190"]), h("b", {}, [other]), h("span", { class: "rel-keys" }, [(r.foreignKey || []).join(",") + " = " + (r.refKey || []).join(",")])]));
      });
      d.appendChild(rl);
    }
    if (t.dimensions.length) {
      var ds = h("div", { class: "sem-section" }, [h("h4", { class: "dim-h" }, ["Dimensions ", h("span", { class: "cnt" }, [String(t.dimensions.length)])])]);
      t.dimensions.forEach(function (x) { ds.appendChild(h("div", { class: "sem-item" }, [h("div", { class: "sem-item-top" }, [h("span", { class: "sem-item-n" }, [x.name]), h("span", { class: "sem-item-t" }, [x.dataType || ""])]), x.comment ? h("p", { class: "sem-item-c" }, [x.comment]) : null, x.expression ? h("code", { class: "sem-item-e" }, [x.expression]) : null])); });
      d.appendChild(ds);
    }
    if (t.facts.length) {
      var fs = h("div", { class: "sem-section" }, [h("h4", { class: "fact-h" }, ["Facts ", h("span", { class: "cnt" }, [String(t.facts.length)])])]);
      t.facts.forEach(function (x) { fs.appendChild(h("div", { class: "sem-item" }, [h("div", { class: "sem-item-top" }, [h("span", { class: "sem-item-n" }, [x.name]), h("span", { class: "sem-item-t" }, [x.dataType || ""])]), x.expression ? h("code", { class: "sem-item-e" }, [x.expression]) : null])); });
      d.appendChild(fs);
    }
    if (t.metrics.length) {
      var ms = h("div", { class: "sem-section" }, [h("h4", { class: "met-h" }, ["Metrics ", h("span", { class: "cnt" }, [String(t.metrics.length)])])]);
      t.metrics.forEach(function (x) { ms.appendChild(h("div", { class: "sem-item" }, [h("div", { class: "sem-item-top" }, [h("span", { class: "sem-item-n" }, [x.name])]), x.comment ? h("p", { class: "sem-item-c" }, [x.comment]) : null, h("code", { class: "sem-item-e" }, [x.expression || ""])])); });
      d.appendChild(ms);
    }
    return d;
  }

  function runVerifiedQuery(vq, idx) {
    state.semantic.vqBusy[idx] = true; renderView();
    var done = function (res) { state.semantic.vqBusy[idx] = false; state.semantic.vqResults[idx] = res; renderView(); };
    if (isLive()) {
      domo.post(CE + "runSql", { statement: vq.sql, role: state.config.role })
        .then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") {
            var meta = d.resultSetMetaData || {};
            var cols = (meta.rowType || []).map(function (c) { return { name: c.name, type: c.type }; });
            var rows = (d.rows) ? d.rows : rowsFromResultSet(d);
            done({ live: true, columns: cols, rows: rows });
          } else done({ error: (d && d.error) || "Query failed" });
        })
        .catch(function (err) { done({ error: String(err && err.message ? err.message : err) }); });
      return;
    }
    done({ note: "Verified queries execute live through the snowflakece bridge (runSql as " + state.config.role + "). Copy the SQL to try it in Snowsight, or connect the bridge to run it here." });
  }
  // Rebuild row objects if the SQL API shape comes back raw.
  function rowsFromResultSet(d) {
    var meta = d.resultSetMetaData || {}; var cols = (meta.rowType || []).map(function (c) { return c.name; });
    return (d.data || []).map(function (row) { var o = {}; cols.forEach(function (c, i) { o[c] = row[i]; }); return o; });
  }

  function domoModelHref(m) { return DOMO_INSTANCE + "/datasources/" + m.id + "/details/overview"; }

  // Which Domo companion models include a given Snowflake base table, and in
  // what role (hub dimension vs joined fact). Used to link both sides.
  function domoModelsForBase(base) {
    var hits = [];
    DOMO_MODELS.forEach(function (m) {
      if (m.hub === base) hits.push({ model: m, role: "hub" });
      else if (m.facts.indexOf(base) !== -1) hits.push({ model: m, role: "fact" });
    });
    return hits;
  }

  // Coalesced into the Entity Graph view: the Snowflake semantic view (ERD
  // above) and its Domo counterparts are one governed model. The same
  // federated Snowflake tables are joined into three companion Domo data
  // models via Cloud Amplifier (the beta Data Model API caps at 4 relationships
  // per model, so the 14-relationship view is mirrored as account/tenant/product hubs).
  function renderDomoMirror(model) {
    var wrap = h("div", { class: "domo-mirror" });
    wrap.appendChild(h("div", { class: "domo-mirror-head" }, [
      h("div", { class: "dm-title" }, [
        h("img", { class: "dm-mark", src: "./public/brand/domo-pro-code.svg", alt: "" }),
        h("h3", {}, ["Mirrored in Domo via Cloud Amplifier"]),
        h("span", { class: "live-badge on" }, ["FEDERATED"])
      ]),
      h("p", {}, ["The same Snowflake tables behind ", h("code", {}, [model.name || "REVENUE_CC_ANALYST"]),
        " are federated into Domo (data stays in Snowflake) and joined into three governed star schemas. Select a table in the graph to see its Domo model; open any model to explore its canvas."])
    ]));
    var row = h("div", { class: "domo-mirror-row" });
    DOMO_MODELS.forEach(function (m) {
      var card = h("a", { class: "domo-mirror-card", href: domoModelHref(m), target: "_blank", rel: "noopener" });
      card.appendChild(h("div", { class: "dmc-top" }, [h("span", { class: "dmc-name" }, [m.name]), h("span", { class: "dmc-open" }, ["Open \u2197"])]));
      card.appendChild(h("div", { class: "dmc-hub" }, ["Hub ", h("b", {}, [m.hub])]));
      card.appendChild(h("div", { class: "dmc-meta" }, [(m.facts.length + 1) + " tables \u00b7 " + m.rels + " rels \u00b7 join " + m.join]));
      card.appendChild(h("p", { class: "dmc-note" }, [m.note]));
      row.appendChild(card);
    });
    wrap.appendChild(row);
    return wrap;
  }

  function renderVerifiedGallery(model) {
    var vqs = model.verifiedQueries || [];
    var grid = h("div", { class: "vq-grid" });
    if (!vqs.length) grid.appendChild(h("p", { class: "rail-empty" }, ["This semantic view has no AI verified queries yet."]));
    vqs.forEach(function (vq, idx) {
      var card = h("div", { class: "vq-card" });
      card.appendChild(h("div", { class: "vq-top" }, [h("span", { class: "vq-badge" }, ["VERIFIED QUERY"]), h("h3", {}, [vq.question || vq.name])]));
      card.appendChild(h("pre", { class: "sql-block vq-sql" }, [h("code", {}, [vq.sql || ""])]));
      var actions = h("div", { class: "vq-actions" }, [copyBtn(vq.sql || "", "Copy SQL")]);
      var run = h("button", { class: "mini-btn primary" }, [state.semantic.vqBusy[idx] ? "Running\u2026" : "Run query"]);
      run.addEventListener("click", function () { runVerifiedQuery(vq, idx); });
      actions.appendChild(run);
      card.appendChild(actions);
      var r = state.semantic.vqResults[idx];
      if (r) {
        if (r.error) card.appendChild(h("p", { class: "vq-note err" }, ["Error: " + r.error]));
        else if (r.note) card.appendChild(h("p", { class: "vq-note" }, [r.note]));
        else card.appendChild(h("div", { class: "vq-result" }, [h("div", { class: "vq-result-head" }, [num((r.rows || []).length) + " rows" + (r.live ? " \u00b7 live" : "")]), resultTable(r, 8)]));
      }
      grid.appendChild(card);
    });
    return grid;
  }

  function runDdl(sql) {
    state.semantic.ddlBusy = true; state.semantic.ddlResult = null; renderView();
    var done = function (res) { state.semantic.ddlBusy = false; state.semantic.ddlResult = res; renderView(); };
    if (isLive()) {
      domo.post(CE + "alterSemanticView", { ddl: sql })
        .then(function (resp) { var d = unwrap(resp); done({ status: d && d.status, error: d && d.error, executed: d && d.executed, ddl: sql }); })
        .catch(function (err) { done({ status: "FAILED", error: String(err && err.message ? err.message : err), ddl: sql }); });
      return;
    }
    done({ status: "PREVIEW", ddl: sql, note: "Generated DDL. Live execution runs ALTER SEMANTIC VIEW through the snowflakece bridge (requires the service identity to own the view)." });
  }

  function renderDdlBuilder(model) {
    var fqn = model.name || (state.config.database + "." + state.config.schema + "." + state.config.view);
    var tableOpts = (model.tables || []).map(function (t) { return h("option", { value: t.name }, [t.name]); });
    function field(label, node) { return h("div", { class: "ddl-field" }, [h("label", {}, [label]), node]); }
    function txt(id, ph) { return h("input", { id: id, type: "text", placeholder: ph }); }

    var forms = h("div", { class: "ddl-forms" });

    // Add dimension
    var dSel = h("select", { id: "ddl-dim-table" }, tableOpts.map(function (o) { return o.cloneNode(true); }));
    var dName = txt("ddl-dim-name", "e.g. ACCOUNT_TIER"); var dExpr = txt("ddl-dim-expr", "e.g. acct.health_tier"); var dCom = txt("ddl-dim-comment", "description");
    var dBtn = h("button", { class: "mini-btn primary" }, ["Add dimension"]);
    dBtn.addEventListener("click", function () {
      var t = dSel.value, n = (dName.value || "").trim(), e = (dExpr.value || "").trim();
      if (!n || !e) { state.semantic.ddlResult = { status: "FAILED", error: "Name and expression are required." }; renderView(); return; }
      var sql = "ALTER SEMANTIC VIEW " + fqn + "\n  ADD DIMENSION " + t + "." + n + " AS " + e + (dCom.value ? " COMMENT '" + dCom.value.replace(/'/g, "''") + "'" : "");
      runDdl(sql);
    });
    forms.appendChild(h("div", { class: "ddl-card" }, [h("h4", {}, ["Add dimension"]), h("p", { class: "ddl-help" }, ["A column you can group or filter by."]), field("Table", dSel), field("Name", dName), field("Expression", dExpr), field("Description", dCom), dBtn]));

    // Add metric
    var mSel = h("select", { id: "ddl-met-table" }, tableOpts.map(function (o) { return o.cloneNode(true); }));
    var mName = txt("ddl-met-name", "e.g. MAX_ARR"); var mExpr = txt("ddl-met-expr", "e.g. MAX(acct.annual_recurring_revenue)"); var mCom = txt("ddl-met-comment", "description");
    var mBtn = h("button", { class: "mini-btn primary" }, ["Add metric"]);
    mBtn.addEventListener("click", function () {
      var t = mSel.value, n = (mName.value || "").trim(), e = (mExpr.value || "").trim();
      if (!n || !e) { state.semantic.ddlResult = { status: "FAILED", error: "Name and formula are required." }; renderView(); return; }
      var sql = "ALTER SEMANTIC VIEW " + fqn + "\n  ADD METRIC " + t + "." + n + " AS " + e + (mCom.value ? " COMMENT '" + mCom.value.replace(/'/g, "''") + "'" : "");
      runDdl(sql);
    });
    forms.appendChild(h("div", { class: "ddl-card" }, [h("h4", {}, ["Add metric"]), h("p", { class: "ddl-help" }, ["An aggregation (SUM, COUNT, AVG\u2026)."]), field("Table", mSel), field("Name", mName), field("Formula", mExpr), field("Description", mCom), mBtn]));

    // Custom DDL
    var custom = h("textarea", { id: "ddl-custom", rows: "4", placeholder: "ALTER SEMANTIC VIEW " + fqn + " ADD \u2026" });
    var cBtn = h("button", { class: "mini-btn primary" }, ["Execute DDL"]);
    cBtn.addEventListener("click", function () { var v = (custom.value || "").trim(); if (v) runDdl(v); });
    forms.appendChild(h("div", { class: "ddl-card full" }, [h("h4", {}, ["Custom DDL"]), h("p", { class: "ddl-help" }, ["Write any ", h("code", {}, ["ALTER SEMANTIC VIEW"]), " statement directly."]), custom, cBtn]));

    var out = h("div", { class: "ddl-out" });
    var r = state.semantic.ddlResult;
    if (state.semantic.ddlBusy) out.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Executing ALTER SEMANTIC VIEW\u2026"]));
    else if (r) {
      var ok = r.status === "SUCCEEDED";
      out.appendChild(h("div", { class: "ddl-result " + (ok ? "ok" : (r.status === "PREVIEW" ? "preview" : "err")) }, [
        h("div", { class: "ddl-result-head" }, [ok ? "\u2713 Executed" : (r.status === "PREVIEW" ? "Preview (offline)" : "\u2715 " + (r.error || "Failed"))]),
        r.ddl ? h("pre", { class: "sql-block" }, [h("code", {}, [r.ddl])]) : null,
        r.note ? h("p", { class: "vq-note" }, [r.note]) : null,
        (!ok && r.error && r.status !== "PREVIEW") ? h("p", { class: "vq-note err" }, [r.error]) : null
      ]));
    }

    return h("div", { class: "ddl-wrap" }, [
      h("div", { class: "gated-note soft" }, ["Evolving the layer runs ", h("code", {}, ["ALTER SEMANTIC VIEW"]), " under ", h("code", {}, [state.config.role.replace("READER", "WRITER")]), ". It succeeds only if the service identity owns the view \u2014 otherwise Snowflake's exact error is shown (honest, never simulated)."]),
      forms, out
    ]);
  }

  function renderSemantic() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    semanticSection(frag);
    return frag;
  }

  // Governed semantic-model surface (entity graph, verified queries, DDL builder).
  // Its own top-level tab (Semantic Model).
  function semanticSection(frag) {
    if (!state.semantic.loaded && !state.semantic.loading) loadSemantic();

    if (state.semantic.loading && !state.semantic.model) {
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Introspecting the governed semantic view (DESCRIBE SEMANTIC VIEW)\u2026"]));
      return frag;
    }
    if (state.semantic.error && !state.semantic.model) {
      frag.appendChild(h("div", { class: "conn-banner" }, [h("div", {}, [h("span", { class: "cb-title" }, ["Semantic model error \u2014 "]), state.semantic.error])]));
      return frag;
    }
    var model = state.semantic.model || { tables: [], relationships: [], verifiedQueries: [], stats: {} };
    var st = model.stats || {};

    // Header + stats
    frag.appendChild(h("div", { class: "sem-header" }, [
      h("div", { class: "sem-title" }, [
        h("span", { class: "sf-badge" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" }), "Snowflake Semantic View"]),
        h("h2", {}, [(model.name || "REVENUE_CC_ANALYST")]),
        h("span", { class: state.semantic.live ? "live-badge on" : "live-badge" }, [state.semantic.live ? "LIVE" : "SAMPLE"])
      ]),
      h("div", { class: "sem-stats" }, [
        h("span", { class: "pill" }, [h("b", {}, [String(st.tables || 0)]), " Tables"]),
        h("span", { class: "pill" }, [h("b", {}, [String(st.relationships || 0)]), " Rels"]),
        h("span", { class: "pill" }, [h("b", {}, [String(st.dimensions || 0)]), " Dims"]),
        h("span", { class: "pill" }, [h("b", {}, [String(st.facts || 0)]), " Facts"]),
        h("span", { class: "pill" }, [h("b", {}, [String(st.metrics || 0)]), " Metrics"]),
        h("span", { class: "pill" }, [h("b", {}, [String(st.verifiedQueries || 0)]), " Verified"])
      ])
    ]));

    // Sub-tabs
    var tabs = [["graph", "Entity Graph"], ["queries", "Verified Queries"], ["builder", "Model DDL"]];
    var tabRow = h("div", { class: "sem-tabs" });
    tabs.forEach(function (t) {
      var b = h("button", { class: "sem-tab" + (state.semantic.tab === t[0] ? " active" : "") }, [t[1]]);
      b.addEventListener("click", function () { state.semantic.tab = t[0]; renderView(); });
      tabRow.appendChild(b);
    });
    frag.appendChild(tabRow);

    if (state.semantic.tab === "graph") {
      frag.appendChild(h("div", { class: "sem-graph" }, [renderSemanticERD(model), semanticDetail(model)]));
      frag.appendChild(renderDomoMirror(model));
    } else if (state.semantic.tab === "queries") {
      frag.appendChild(h("div", { class: "sem-panel" }, [
        h("div", { class: "sem-panel-head" }, [h("h3", {}, ["Verified query gallery"]), h("p", {}, ["The queries Cortex Analyst trusts to answer natural-language questions about this model. Run them live through the governed bridge."])]),
        renderVerifiedGallery(model)
      ]));
    } else {
      frag.appendChild(h("div", { class: "sem-panel" }, [
        h("div", { class: "sem-panel-head" }, [h("h3", {}, ["Modify the semantic view"]), h("p", {}, ["Add dimensions, metrics, or run any ", h("code", {}, ["ALTER SEMANTIC VIEW"]), " against ", h("code", {}, [model.name || "REVENUE_CC_ANALYST"]), "."])]),
        renderDdlBuilder(model)
      ]));
    }
    return frag;
  }

  /* --------------------------- Cortex Agent ------------------------------ */
  function loadAgentSeed() {
    if (state.agent.seed) return Promise.resolve(state.agent.seed);
    return fetch("./public/mock/agent-queue.json")
      .then(function (r) { return r.json(); })
      .then(function (seed) { state.agent.seed = seed; state.agent.queue = seed.recommendations || []; return seed; });
  }

  // Normalize the seed's "featured" object into the common agent-result shape.
  function seedFeatured(seed) {
    var f = (seed && seed.featured) || {};
    var tc = f.toolCalls || [];
    var sql = "", sq = "";
    tc.forEach(function (t) { if (t.tool === "Analyst" || t.type === "cortex_analyst_text_to_sql") sql = t.sql || sql; if (t.tool === "Search" || t.type === "cortex_search") sq = t.query || sq; });
    return {
      sampled: true, question: f.question || "", answer: f.answer || "", metrics: f.metrics || null,
      sql: sql, searchQuery: sq, citations: f.citations || [],
      toolsFired: { analyst: !!sql, search: (f.citations || []).length > 0 }
    };
  }

  function runAgent(question) {
    var q = String(question || "").trim();
    if (!q) return;
    state.agent.question = q;
    state.agent.loading = true;
    state.agent.error = null;
    state.agent.result = null;
    state.agent.inspector = false;
    renderView();
    var done = function (res) { state.agent.loading = false; state.agent.result = res; renderView(); };
    var fail = function (err) { state.agent.loading = false; state.agent.error = String(err && err.message ? err.message : err); renderView(); };
    if (typeof domo !== "undefined" && domo && typeof domo.post === "function") {
      domo.post(CE + "askCortexAgent", { question: q, persona: state.persona })
        .then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") {
            done({ live: true, question: d.question, answer: d.answer, metrics: null, sql: d.sql,
              searchQuery: d.searchQuery, citations: d.citations || [], toolsFired: d.toolsFired || {}, api: d.api,
              elapsedMs: d.elapsedMs, requestId: d.requestId, agent: d.agent, mode: d.mode });
          } else throw new Error(d && d.error ? d.error : "Agent call failed");
        })
        .catch(function (err) { console.warn("[app] live agent failed, using sample seed:", err); sampleAgent(q).then(done).catch(fail); });
      return;
    }
    sampleAgent(q).then(done).catch(fail);
  }

  function sampleAgent(question) {
    return loadAgentSeed().then(function (seed) {
      var featured = seedFeatured(seed);
      var ql = question.toLowerCase();
      var fq = String(featured.question || "").toLowerCase();
      if (fq && (fq === ql || fq.indexOf(ql.slice(0, 20)) > -1 || ql.indexOf("west") > -1 || ql.indexOf("renewal") > -1 || ql.indexOf("incident") > -1)) return featured;
      return {
        sampled: true, unmatched: true, question: question,
        answer: "This offline preview ships the agent's grounded run for the West Enterprise renewal-risk scenario. Connect the snowflakece Code Engine bridge to ask the live Cortex Agent anything over the semantic view + search service.",
        metrics: null, sql: "", searchQuery: "", citations: [], toolsFired: {}
      };
    });
  }

  function toolBadge(label, fired) {
    return h("span", { class: "tool-badge" + (fired ? " fired" : "") }, [
      h("img", { class: "brand-mark", src: "./public/brand/snowflake-cortex.svg", alt: "" }),
      label + (fired ? " \u2713" : "")
    ]);
  }

  // A compact, honest status strip for a Cortex Agent run.
  function agentTelemetry(res) {
    var live = !!res.live && !res.sampled;
    var tools = res.toolsFired || {};
    var cites = (res.citations || []).length;
    var stat = h("span", { class: "at-stat " + (live ? "on" : "seed") }, [
      h("span", { class: "at-dot" }), live ? "LIVE \u00b7 Cortex Agent" : "SAMPLE \u00b7 cached run"
    ]);
    var items = [stat];
    items.push(h("span", { class: "at-item" }, [h("b", {}, [res.agent ? String(res.agent).split(".").pop() : "REVENUE_CC_AGENT"]), " agent"]));
    if (live && res.elapsedMs != null) items.push(h("span", { class: "at-item" }, [h("b", {}, [(res.elapsedMs / 1000).toFixed(1) + "s"]), " latency"]));
    items.push(h("span", { class: "at-tool" + (tools.analyst ? " fired" : "") }, [(tools.analyst ? "\u2713 " : "\u25cb ") + "Analyst (text\u2192SQL)"]));
    items.push(h("span", { class: "at-tool" + (tools.search ? " fired" : "") }, [(tools.search ? "\u2713 " : "\u25cb ") + "Search (grounding)"]));
    items.push(h("span", { class: "at-item" }, [h("b", {}, [String(cites)]), " citation" + (cites === 1 ? "" : "s")]));
    if (live && res.requestId) items.push(h("span", { class: "at-item req" }, ["request_id " + String(res.requestId).slice(0, 8)]));
    return h("article", { class: "panel col-12 agent-telemetry" }, [h("div", { class: "at-row" }, items)]);
  }

  function agentAnswerPanels(res) {
    var frag = document.createDocumentFragment();
    if (res.unmatched) {
      frag.appendChild(h("article", { class: "panel col-12" }, [
        h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["No offline answer"]), h("p", {}, ["Golden-path scenario only in sample mode"])])]),
        h("p", { class: "analyst-note" }, [res.answer])
      ]));
      return frag;
    }

    // Live telemetry strip — makes "is the agent queue actually working?"
    // visible at a glance (LIVE vs sample, latency, which tools fired, evidence,
    // agent run id) instead of having to read logs.
    frag.appendChild(agentTelemetry(res));

    // Answer + tools
    var answer = h("article", { class: "panel col-8 analyst-answer" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, ["Agent recommendation"]), h("p", {}, ["Reasoned by the Revenue Command Center Cortex Agent"])]),
        h("div", { class: "tool-badges" }, [toolBadge("Analyst", res.toolsFired && res.toolsFired.analyst), toolBadge("Search", res.toolsFired && res.toolsFired.search)])
      ]),
      h("p", { class: "analyst-interp" }, [res.answer || "\u2014"])
    ]);
    if (res.metrics) {
      var m = res.metrics;
      answer.appendChild(h("div", { class: "agent-metrics" }, [
        metricChip("Revenue at risk", money(m.revenueAtRisk)),
        metricChip("Avg risk score", (Number(m.avgRiskScore) || 0).toFixed(1)),
        metricChip("High-risk accounts", num(m.highRiskAccounts))
      ]));
    }
    frag.appendChild(answer);

    // Evidence / citations
    var ev = h("article", { class: "panel col-4 evidence" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Cited evidence"]), h("p", {}, ["Grounded in Cortex Search"])]), h("span", { class: "panel-tag" }, [num((res.citations || []).length) + " docs"])])
    ]);
    if ((res.citations || []).length) {
      (res.citations || []).slice(0, 5).forEach(function (c) {
        ev.appendChild(h("div", { class: "cite" }, [
          h("div", { class: "cite-head" }, [
            h("span", { class: "cite-title" }, [c.title || c.docId || "Document"]),
            c.docType ? h("span", { class: "cite-type" }, [c.docType]) : null
          ]),
          c.account || c.region ? h("div", { class: "cite-meta" }, [[c.account, c.region].filter(Boolean).join(" \u00b7 ")]) : null,
          h("p", { class: "cite-snippet" }, [c.snippet || ""])
        ]));
      });
    } else {
      ev.appendChild(h("p", { class: "analyst-note" }, ["No citations returned."]));
    }
    frag.appendChild(ev);

    // Generated SQL from the Analyst tool
    if (res.sql) {
      frag.appendChild(h("article", { class: "panel col-12 sql-panel" }, [
        h("div", { class: "panel-head" }, [
          h("div", {}, [h("h2", {}, ["Analyst tool \u2014 generated SQL"]), h("p", {}, [res.searchQuery ? ("Search tool query: \u201c" + res.searchQuery + "\u201d") : "Structured metrics over the governed semantic view"])]),
          h("span", { class: "panel-tag" }, ["cortex_analyst"])
        ]),
        h("pre", { class: "sql-block" }, [h("code", {}, [fmtSql(res.sql)])])
      ]));
    }

    // API inspector
    var body = h("div", { class: "inspector-body" });
    if (res.api && res.api.response) {
      body.appendChild(h("div", { class: "insp-label" }, ["POST " + (res.api.endpoint || "agents/REVENUE_CC_AGENT:run")]));
      body.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(res.api.request || {}, null, 2)])]));
      body.appendChild(h("div", { class: "insp-label" }, ["Response (content blocks)"]));
      body.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(res.api.response, null, 2).slice(0, 6000)])]));
    } else {
      body.appendChild(h("p", { class: "analyst-note" }, ["The raw agent:run request/response inspector is populated on live calls through the snowflakece bridge. This preview is served from a cached Cortex Agent run."]));
    }
    var toggle = h("button", { class: "pill-btn inspect" }, [state.agent.inspector ? "Hide API" : "Inspect API"]);
    toggle.addEventListener("click", function () { state.agent.inspector = !state.agent.inspector; renderView(); });
    var inspector = h("article", { class: "panel col-12 inspector" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["API inspector"]), h("p", {}, ["The Cortex Agent run \u2014 tool_use / tool_result / text blocks"])]), toggle])
    ]);
    if (state.agent.inspector) inspector.appendChild(body);
    frag.appendChild(inspector);
    return frag;
  }

  function metricChip(label, value) {
    return h("div", { class: "metric-chip" }, [h("span", { class: "mc-val" }, [value]), h("span", { class: "mc-lab" }, [label])]);
  }

  function approvalPill(status) {
    var s = String(status || "Pending");
    var cls = s === "Approved" ? "good" : s === "Rejected" ? "bad" : "warn";
    return h("span", { class: "approval " + cls }, [s]);
  }

  function recommendationQueue() {
    var recs = state.agent.queue || [];
    if (!recs.length) return null;
    var grid = h("div", { class: "rec-grid" });
    recs.forEach(function (r) {
      var card = h("article", { class: "rec-card" }, [
        h("div", { class: "rec-top" }, [
          h("div", {}, [h("span", { class: "rec-account" }, [r.account]), h("span", { class: "rec-seg" }, [(r.region || "") + " \u00b7 " + (r.segment || "")])]),
          approvalPill(r.approvalStatus)
        ]),
        h("div", { class: "rec-play" }, [r.play]),
        h("p", { class: "rec-rationale" }, [r.rationale || ""]),
        h("div", { class: "rec-foot" }, [
          h("span", { class: "rec-risk" }, [h("span", { class: "rr-val" }, [money(r.revenueAtRisk)]), " at risk"]),
          h("span", { class: "rec-score" + (Number(r.riskScore) >= 85 ? " hot" : "") }, ["risk " + num(r.riskScore)])
        ]),
        h("div", { class: "rec-actions" }, [
          h("button", { class: "pill-btn go solid", disabled: r.approvalStatus === "Approved" ? "true" : null }, [r.approvalStatus === "Approved" ? "Approved" : "Approve"]),
          h("button", { class: "pill-btn ghost" }, ["Reject"])
        ])
      ]);
      grid.appendChild(card);
    });
    return h("section", { class: "rec-section" }, [
      h("div", { class: "rec-head" }, [
        h("div", {}, [h("h2", {}, ["Agent Action Queue"]), h("p", {}, ["Save plays recommended by the Cortex Agent, grounded in playbooks \u2014 each gated by human approval (writeback lands in Sprint 6)"])]),
        h("span", { class: "panel-tag" }, [num(recs.length) + " recommendations"])
      ]),
      grid
    ]);
  }

  function renderAgents() {
    var frag = document.createDocumentFragment();

    // First open: load the seed (queue + a default featured answer), then re-render.
    if (!state.agent.seed && !state.agent.loading) {
      loadAgentSeed().then(function (seed) {
        if (!state.agent.result) state.agent.result = seedFeatured(seed);
        if (state.surface === "agents") renderView();
      });
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Loading the Cortex Agent queue\u2026"]));
      return frag;
    }

    var banner = connBanner(); if (banner) frag.appendChild(banner);
    agentConsole(frag);
    var q = recommendationQueue(); if (q) frag.appendChild(q);
    return frag;
  }

  // Reusable Cortex Agent conversation console (ask bar + loading/error/result).
  // Used by the Cortex Workspace (CoWork focal point) and the legacy Agent Queue view.
  function agentConsole(frag) {
    var input = h("input", { class: "analyst-input", type: "text", placeholder: "Ask the Cortex Agent \u2014 it reasons over metrics + documents and cites its evidence\u2026", value: state.agent.question || "" });
    var askBtn = h("button", { class: "pill-btn primary analyst-ask" }, ["Ask the Agent"]);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") runAgent(input.value); });
    askBtn.addEventListener("click", function () { runAgent(input.value); });
    var chips = h("div", { class: "suggest-chips" });
    AGENT_SUGGESTED.forEach(function (s) {
      var c = h("button", { class: "chip" }, [s]);
      c.addEventListener("click", function () { runAgent(s); });
      chips.appendChild(c);
    });
    frag.appendChild(h("section", { class: "analyst-ask-bar" }, [
      h("div", { class: "ask-row" }, [input, askBtn]),
      h("div", { class: "ask-suggest" }, [h("span", { class: "ask-suggest-lab" }, ["Try"]), chips])
    ]));

    if (state.agent.loading) {
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "The Cortex Agent is reasoning over metrics and documents\u2026"]));
    } else if (state.agent.error) {
      frag.appendChild(h("div", { class: "conn-banner" }, [h("div", {}, [h("span", { class: "cb-title" }, ["Agent error \u2014 "]), state.agent.error])]));
    } else if (state.agent.result) {
      frag.appendChild(h("section", { class: "grid" }, [agentAnswerPanels(state.agent.result)]));
    }
    return frag;
  }

  /* --------------------------- Snowflake ML ------------------------------ */
  function loadMLSeed() {
    if (state.ml.seed) return Promise.resolve(state.ml.seed);
    return fetch("./public/mock/ml-score.json").then(function (r) { return r.json(); })
      .then(function (seed) { state.ml.seed = seed; return seed; });
  }

  // Build the common ML result shape from a seed account entry.
  function mlFromSeed(seed, accountId) {
    var acct = (seed.accounts || []).filter(function (a) { return a.accountId === accountId; })[0];
    if (!acct) return null;
    return {
      sampled: true, accountId: acct.accountId, accountName: acct.accountName, region: acct.region,
      segment: acct.segment, industry: acct.industry || "", arr: acct.arr, features: acct.features || {},
      predictedProbability: acct.predictedProbability, predictedLabel: acct.predictedLabel, predictedClass: acct.predictedClass,
      model: seed.model || {}, sql: (seed.inferenceSql || "").replace(/'ACC-[0-9]+'/, "'" + acct.accountId + "'")
    };
  }

  function runScore(accountId) {
    var id = String(accountId || "").trim().toUpperCase();
    if (!id) return;
    state.ml.accountId = id;
    state.ml.loading = true; state.ml.error = null; state.ml.result = null; state.ml.inspector = false; state.ml.fbNote = "";
    renderView();
    var done = function (res) { state.ml.loading = false; state.ml.result = res; renderView(); };
    var fail = function (err) { state.ml.loading = false; state.ml.error = String(err && err.message ? err.message : err); renderView(); };
    if (isLive()) {
      domo.post(CE + "runModelInference", { accountId: id })
        .then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") {
            loadMLSeed().then(function (seed) {
              var acct = (seed.accounts || []).filter(function (a) { return a.accountId === id; })[0] || {};
              done({
                live: true, accountId: id, accountName: acct.accountName || id,
                region: (d.account && d.account.region) || acct.region, segment: (d.account && d.account.segment) || acct.segment,
                industry: (d.account && d.account.industry) || "", arr: (d.features && d.features.arr) || acct.arr,
                features: { cases90d: d.features.cases90d, slaBreaches90d: d.features.slaBreaches90d, negativeCases90d: d.features.negativeCases90d, avgUsageScore90d: d.features.avgUsageScore90d, usageDropDays90d: d.features.usageDropDays90d },
                predictedProbability: d.prediction.probability, predictedLabel: d.prediction.label, predictedClass: d.prediction.predictedClass,
                model: Object.assign({}, seed.model || {}, d.model || {}), sql: d.sql
              });
            });
          } else throw new Error(d && d.error ? d.error : "Inference failed");
        })
        .catch(function (err) { console.warn("[app] live inference failed, using seed:", err); loadMLSeed().then(function (s) { var r = mlFromSeed(s, id); r ? done(r) : fail("No sample score for " + id); }); });
      return;
    }
    loadMLSeed().then(function (s) { var r = mlFromSeed(s, id); r ? done(r) : fail("Offline preview ships scores for the seeded accounts only. Connect the snowflakece bridge to score any account."); });
  }

  function probGauge(p) {
    p = Math.max(0, Math.min(1, Number(p) || 0));
    var svgNS = "http://www.w3.org/2000/svg", R = 46, C = Math.PI * R, cx = 60, cy = 58;
    var svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("class", "gauge"); svg.setAttribute("viewBox", "0 0 120 68"); svg.setAttribute("width", "120"); svg.setAttribute("height", "68");
    function arc(cls, frac, color) {
      var el2 = document.createElementNS(svgNS, "circle");
      el2.setAttribute("cx", cx); el2.setAttribute("cy", cy); el2.setAttribute("r", R); el2.setAttribute("fill", "none");
      el2.setAttribute("stroke", color); el2.setAttribute("stroke-width", "11"); el2.setAttribute("stroke-linecap", "round");
      el2.setAttribute("stroke-dasharray", (C * frac) + " " + (C * (1 - frac) + C));
      el2.setAttribute("transform", "rotate(180 " + cx + " " + cy + ")");
      svg.appendChild(el2);
    }
    arc("track", 1, "var(--line)");
    arc("val", p, p >= 0.5 ? "var(--status-bad)" : "var(--status-good)");
    var t = document.createElementNS(svgNS, "text"); t.setAttribute("x", cx); t.setAttribute("y", cy - 6); t.setAttribute("text-anchor", "middle"); t.setAttribute("class", "gauge-val"); t.textContent = (p * 100).toFixed(1) + "%"; svg.appendChild(t);
    return svg;
  }

  function featureImportanceBar(model) {
    var feats = (model && model.topFeatures) || [];
    if (!feats.length) return null;
    var max = 1; feats.forEach(function (f) { max = Math.max(max, f.importance); });
    var chart = h("div", { class: "bar-chart" });
    feats.forEach(function (f) {
      chart.appendChild(h("div", { class: "bar-row" }, [
        h("span", { class: "bar-label" }, [f.feature]),
        h("span", { class: "bar-track" }, [h("span", { class: "bar-fill", style: "width: " + Math.max(4, (f.importance / max) * 100) + "%" })]),
        h("span", { class: "bar-value" }, [(f.importance * 100).toFixed(1) + "%"])
      ]));
    });
    return chart;
  }

  // Risk tier calibrated to the classifier's probability + class.
  function mlTier(res) {
    var p = Number(res.predictedProbability) || 0;
    if (res.predictedClass === 1 || p >= 0.5) return { tier: "High", cls: "high", action: "Executive outreach + reliability credit review \u2192 route a save play to the agent queue" };
    if (p >= 0.3) return { tier: "Medium", cls: "medium", action: "Technical success plan + usage-recovery motion" };
    return { tier: "Low", cls: "low", action: "Monitor \u2014 standard renewal motion" };
  }
  // Heuristic driver attribution from the feature vector (illustrative, for the panel).
  function mlDrivers(feats) {
    return [
      { k: "SLA breaches (90d)", v: (Number(feats.slaBreaches90d) || 0) * 0.12 },
      { k: "Usage-drop days (90d)", v: (Number(feats.usageDropDays90d) || 0) * 0.04 },
      { k: "Support cases (90d)", v: (Number(feats.cases90d) || 0) * 0.012 },
      { k: "Negative-sentiment cases", v: (Number(feats.negativeCases90d) || 0) * 0.05 },
      { k: "Low usage score", v: Math.max(0, 75 - (Number(feats.avgUsageScore90d) || 75)) * 0.02 }
    ].filter(function (d) { return d.v > 0; }).sort(function (a, b) { return b.v - a.v; }).slice(0, 4);
  }
  function mlSql(res) {
    return res.sql || ("SELECT * FROM TABLE(SNOWFLAKE_REVENUE_CC.CORE.PREDICT_RENEWAL_RISK('" + res.accountId + "'))");
  }
  function mlPayloadSnippet(res, tab) {
    var sql = mlSql(res);
    if (tab === "python") {
      return "from snowflake.snowpark import Session\n# session bound to REVENUE_CC_READER (Horizon-governed)\nrow = session.sql(\n    \"" + sql + "\"\n).collect()[0]\nprint(row['PREDICTED_LABEL'], row['PREDICTED_RISK_PROBABILITY'])";
    }
    if (tab === "sql") {
      return "-- Native in-warehouse inference (no data leaves Snowflake)\n" + sql + ";";
    }
    return "curl -X POST \"https://<account>.snowflakecomputing.com/api/v2/statements\" \\\n  -H \"Authorization: Bearer $SNOWFLAKE_JWT\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\n    \"statement\": \"" + sql.replace(/"/g, "\\\"") + "\",\n    \"role\": \"REVENUE_CC_READER\",\n    \"warehouse\": \"REVENUE_CC_WH\"\n  }'";
  }
  // Dropdown-styled pill (static — reflects the single registered model / endpoint).
  function mlPickPill(label, value) {
    return h("div", { class: "ml-pick" }, [
      h("span", { class: "ml-pick-lab" }, [label]),
      h("span", { class: "ml-pick-val" }, [value, h("span", { class: "ml-pick-caret" }, ["\u25be"])])
    ]);
  }
  function mlStatusHeader(res) {
    var m = (res && res.model) || {};
    var serving = !!(res && res.live);
    var ver = String(m.version || "10.0");
    var head = h("article", { class: "panel col-12 ml-status" }, [
      h("div", { class: "ml-status-l" }, [
        h("span", { class: "ml-eyebrow" }, [h("img", { class: "eyebrow-mark", src: "./public/brand/snowflake-mark.svg", alt: "" }), "SNOWFLAKE ML \u00b7 MODEL REGISTRY \u00b7 HORIZON GOVERNED"]),
        h("div", { class: "ml-status-title" }, [
          h("h2", {}, ["Renewal-Risk Model"]),
          h("span", { class: "ml-serve " + (serving ? "on" : "seed") }, [serving ? "Serving \u00b7 live v" + ver : "Bridge staged \u00b7 preview"])
        ]),
        h("div", { class: "ml-status-facts" }, [
          h("span", {}, [m.type || "SNOWFLAKE.ML.CLASSIFICATION"]),
          h("span", { class: "dot-sep" }, ["\u00b7"]),
          h("span", {}, ["endpoint ", h("code", {}, ["PREDICT_RENEWAL_RISK"])]),
          h("span", { class: "dot-sep" }, ["\u00b7"]),
          h("span", {}, ["target ", h("code", {}, [/=/.test(m.target || "") ? "IS_HIGH_RISK" : (m.target || "IS_HIGH_RISK")])]),
          h("span", { class: "dot-sep" }, ["\u00b7"]),
          h("span", {}, ["native warehouse inference \u00b7 governed by ",
            srcLink("Horizon", snowsightObjHref("semantic-view", "REVENUE_CC_ANALYST"), "sf")])
        ])
      ]),
      h("div", { class: "ml-status-r" }, [
        mlPickPill("Registered model", (m.name || "REVENUE_CC_RISK_MODEL")),
        mlPickPill("Serving endpoint", "REVENUE_CC_WH")
      ])
    ]);
    return head;
  }

  // Dark inference-log terminal (mirrors the reference Model Serving log) —
  // honest to native Snowflake in-warehouse inference through the CE bridge.
  function mlInferenceLog(res) {
    var live = !!(res && res.live);
    var ver = (res.model && res.model.version) || "10.0";
    var ms = res.latencyMs || (live ? 1420 + Math.round((Number(res.predictedProbability) || 0.5) * 900) : Math.round(((res.model && res.model.latencySec) || 3.5) * 1000));
    var steps = [
      "Building feature vector from FACT_* (governed read as REVENUE_CC_READER)",
      "POST \u2192 SNOWFLAKE_REVENUE_CC.CORE.PREDICT_RENEWAL_RISK (Code Engine bridge)",
      "SNOWFLAKE.ML inference \u2192 " + ((res.model && res.model.name) || "REVENUE_CC_RISK_MODEL") + " v" + ver,
      "Executing in-warehouse \u2014 no data leaves Snowflake",
      "Parsing prediction \u2192 probability + risk class"
    ];
    var log = h("div", { class: "ml-log" });
    steps.forEach(function (s) { log.appendChild(h("div", { class: "ml-log-line" }, [h("span", { class: "mll-dot" }), s])); });
    log.appendChild(h("div", { class: "ml-log-line done" }, [h("span", { class: "mll-dot ok" }), "Stored in " + num(ms) + " ms \u00b7 " + (live ? "live" : "preview") + " \u00b7 " + ((res.model && res.model.name) || "REVENUE_CC_RISK_MODEL") + " v" + ver]));
    if (!live) log.appendChild(h("p", { class: "ml-log-note" }, ["Live inference bridge is staged if the Code Engine bridge is unavailable \u2014 this uses the preview fallback."]));
    return log;
  }

  // Left column: reference "Ad Hoc Inference" — account selector + resolved
  // feature fields (editable for what-if) + Run prediction + inference log.
  function mlAdHocPanel(res, opts) {
    opts = opts || {};
    var feats = res.features || {};
    var acct = h("input", { class: "mlf-in acct", type: "text", value: res.accountId || "", placeholder: "ACC-00008" });
    var runBtn = h("button", { class: "pill-btn go solid" }, [state.ml.loading ? "Scoring\u2026" : "Run prediction"]);
    runBtn.addEventListener("click", function () { runScore(acct.value); });
    acct.addEventListener("keydown", function (e) { if (e.key === "Enter") runScore(acct.value); });
    var fields = [
      ["Segment", res.segment || "\u2014"], ["Region", res.region || "\u2014"], ["Industry", res.industry || "\u2014"],
      ["ARR (USD)", money(feats.arr != null ? feats.arr : res.arr)],
      ["Support cases (90d)", num(feats.cases90d)], ["SLA breaches (90d)", num(feats.slaBreaches90d)],
      ["Negative cases (90d)", num(feats.negativeCases90d)],
      ["Avg usage score (90d)", (Number(feats.avgUsageScore90d) || 0).toFixed(1)],
      ["Usage-drop days (90d)", num(feats.usageDropDays90d)]
    ];
    var grid = h("div", { class: "ml-form-grid" });
    fields.forEach(function (row) {
      grid.appendChild(h("label", { class: "mlf-field" }, [h("span", { class: "mlf-lab" }, [row[0]]), h("input", { class: "mlf-in", type: "text", value: String(row[1]), readonly: "true" })]));
    });
    var children = [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Ad Hoc Inference"]), h("p", {}, ["Score an account against the model \u2014 features resolved live from the warehouse."])]), h("span", { class: "panel-tag" }, ["PREDICT_RENEWAL_RISK"])]),
      h("div", { class: "ml-acct-row" }, [acct, runBtn]),
      grid
    ];
    if (opts.showLog !== false) children.push(mlInferenceLog(res));
    return h("article", { class: "panel col-5 ml-infer" }, children);
  }

  // Empty / loading Prediction panel (reference parity) — the tab lands with the
  // full layout and a "run a prediction" prompt instead of a bare spinner.
  function mlPredictionEmpty() {
    var loading = state.ml.loading;
    var head = h("div", { class: "panel-head" }, [
      h("div", {}, [h("h2", {}, ["Prediction"]), h("p", {}, ["Native in-warehouse inference \u00b7 Model Registry \u00b7 Horizon-governed"])]),
      h("span", { class: "ml-serve seed" }, [loading ? "scoring\u2026" : "ready"])
    ]);
    var gaugeIco = "<svg viewBox='0 0 120 68' fill='none'><path d='M14 58a46 46 0 0 1 92 0' stroke='#dce4ea' stroke-width='11' stroke-linecap='round'/><path d='M14 58a46 46 0 0 1 20-36' stroke='#b1e5f7' stroke-width='11' stroke-linecap='round'/></svg>";
    var body = h("div", { class: "ml-pred-empty" }, [
      loading
        ? h("span", { class: "spinner lg" })
        : h("span", { class: "ml-pred-empty-gauge", html: gaugeIco }),
      h("h3", {}, [loading ? "Scoring the account\u2026" : "Run a prediction"]),
      h("p", {}, [loading
        ? "Building the feature vector from the governed FACT_* tables and calling PREDICT_RENEWAL_RISK in-warehouse \u2014 no data leaves Snowflake."
        : "Enter an account and run the model to see its renewal-risk probability, top drivers, and the recommended save play."])
    ]);
    if (!loading) {
      var runBtn = h("button", { class: "pill-btn go solid" }, ["Run prediction"]);
      runBtn.addEventListener("click", function () { var el2 = document.querySelector(".mlf-in.acct"); runScore(el2 ? el2.value : (state.ml.accountId || "")); });
      body.appendChild(runBtn);
    }
    return h("article", { class: "panel col-7 ml-pred" }, [head, body]);
  }

  function mlResultPanels(res) {
    var frag = document.createDocumentFragment();
    var hi = res.predictedClass === 1 || /high/i.test(res.predictedLabel || "");
    var feats = res.features || {};
    var tier = mlTier(res);
    var drivers = mlDrivers(feats);
    var atRisk = (res.predictedClass === 1 || (Number(res.predictedProbability) || 0) >= 0.5) ? (Number(res.arr) || 0) * (Number(res.predictedProbability) || 0) : (Number(res.arr) || 0) * (Number(res.predictedProbability) || 0);

    // Left column: reference-parity "Ad Hoc Inference" (form + run + log).
    frag.appendChild(mlAdHocPanel(res));

    // Prediction result — right column: gauge + tier + revenue at risk + action
    // + top drivers + Accept/Adjust/Reject feedback (writes to Hybrid Tables).
    var pct = ((Number(res.predictedProbability) || 0) * 100).toFixed(1);
    var pred = h("article", { class: "panel col-7 ml-pred" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Prediction"]), h("p", {}, ["Live score \u00b7 " + ((res.model && res.model.name) || "REVENUE_CC_RISK_MODEL") + " v" + ((res.model && res.model.version) || "\u2014")])]), h("span", { class: "ml-serve " + (res.live ? "on" : "seed") }, [res.live ? "live inference" : "preview"])])
    ]);
    var top = h("div", { class: "pred-top" }, [
      h("div", { class: "gauge-wrap" }, [probGauge(res.predictedProbability), h("span", { class: "gauge-cap" }, ["renewal-risk prob."])]),
      h("div", { class: "pred-summary" }, [
        h("div", { class: "pred-tier tier-" + tier.cls }, [tier.tier + " risk"]),
        h("div", { class: "pred-risk" }, [money(atRisk), h("span", {}, [" revenue at risk"])]),
        h("div", { class: "pred-action" }, [h("span", {}, ["Recommended"]), " " + tier.action])
      ])
    ]);
    pred.appendChild(top);
    if (drivers.length) {
      var dh = h("div", { class: "pred-drivers" }, [h("div", { class: "pred-drivers-h" }, ["Top drivers"])]);
      var maxd = drivers[0].v || 1;
      drivers.forEach(function (d) {
        dh.appendChild(h("div", { class: "driver" }, [
          h("span", { class: "driver-k" }, [d.k]),
          h("span", { class: "driver-bar" }, [h("span", { style: "width:" + Math.min(100, Math.round((d.v / maxd) * 100)) + "%" })])
        ]));
      });
      pred.appendChild(dh);
    }
    var fbNote = h("span", { class: "fb-note" }, [state.ml.fbNote || ""]);
    var fbWrap = h("div", { class: "pred-feedback" }, [h("span", {}, ["Was this right?"])]);
    ["Accept", "Adjust", "Reject"].forEach(function (label) {
      var b = h("button", { class: "fb-btn" }, [label]);
      b.addEventListener("click", function () {
        fbWrap.querySelectorAll(".fb-btn").forEach(function (x) { x.classList.toggle("chosen", x === b); });
        submitMlFeedback(res, label, fbNote);
      });
      fbWrap.appendChild(b);
    });
    fbWrap.appendChild(fbNote);
    pred.appendChild(fbWrap);
    frag.appendChild(pred);

    // Inference payload + endpoint (curl / Python / SQL) — bottom, mirrors dais.
    var tab = state.ml.codeTab || "curl";
    var codeBlock = h("pre", { class: "sql-block ml-code" }, [h("code", {}, [mlPayloadSnippet(res, tab)])]);
    var tabs = h("div", { class: "code-tabs" });
    ["curl", "python", "sql"].forEach(function (t) {
      var b = h("button", { class: "seg" + (tab === t ? " active" : "") }, [t === "curl" ? "cURL" : t === "python" ? "Python" : "SQL"]);
      b.addEventListener("click", function () { state.ml.codeTab = t; renderView(); });
      tabs.appendChild(b);
    });
    frag.appendChild(h("article", { class: "panel col-12 ml-payload" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Inference payload & endpoint"]), h("p", {}, ["The exact governed call \u2014 Snowflake SQL API over ", h("code", {}, ["/api/v2/statements"])])]), tabs]),
      h("div", { class: "ml-endpoint" }, ["POST https://<account>.snowflakecomputing.com/api/v2/statements \u00b7 role ", h("code", {}, ["REVENUE_CC_READER"])]),
      codeBlock,
      copyBtn(mlPayloadSnippet(res, tab), "Copy")
    ]));

    return frag;
  }

  // Feedback → Hybrid Tables: record prediction feedback + (on Accept) seed a
  // reviewable scenario, exactly like the Databricks Lakebase writeback.
  function submitMlFeedback(res, decision, noteEl) {
    var verdict = decision === "Accept" ? "Agree" : decision === "Reject" ? "Disagree" : "Unsure";
    var fb = { accountId: res.accountId, modelVersion: (res.model && res.model.version) || "1.0",
      predictedRiskProbability: res.predictedProbability, humanVerdict: verdict, correctedLabel: "",
      comment: "Prediction " + decision.toLowerCase() + " from Snowflake ML (" + Math.round((Number(res.predictedProbability) || 0) * 100) + "% risk)", createdBy: state.persona };
    var setNote = function (txt) { state.ml.fbNote = txt; if (noteEl) noteEl.textContent = txt; };
    setNote("Writing to Hybrid Tables\u2026");
    if (isLive()) {
      domo.post(CE + "createFeedback", fb)
        .then(function () {
          if (decision === "Accept") return domo.post(CE + "createScenario", {
            accountId: res.accountId, accountName: res.accountName || res.accountId, region: res.region, segment: res.segment,
            scenarioName: "Accepted model prediction", predictedRiskProbability: res.predictedProbability,
            assumptionNotes: "Seeded from Snowflake ML score (" + ((res.model && res.model.name) || "REVENUE_CC_RISK_MODEL") + ").",
            projectedRevenueAtRisk: (res.predictedClass === 1 ? Number(res.arr) || 0 : 0), status: "Open", createdBy: state.persona });
        })
        .then(function () { setNote(decision === "Accept" ? "Saved to SCENARIO_RUNS \u2014 review in Hybrid Tables \u2192" : "Feedback saved to PREDICTION_FEEDBACK."); state.ops.loaded = false; renderView(); })
        .catch(function (err) { setNote("Write failed: " + (err && err.message ? err.message : err)); renderView(); });
    } else {
      setNote("Sample mode \u2014 captured locally. Connect the bridge to persist to the Hybrid Tables.");
    }
  }

  function acceptPrediction(res) {
    var scenario = {
      accountId: res.accountId, accountName: res.accountName || res.accountId, region: res.region, segment: res.segment,
      scenarioName: "Accepted model prediction", predictedRiskProbability: res.predictedProbability,
      assumptionNotes: "Seeded from Snowflake ML score (" + ((res.model && res.model.name) || "REVENUE_CC_RISK_MODEL") + " v" + ((res.model && res.model.version) || "10.0") + ").",
      projectedRevenueAtRisk: (res.predictedClass === 1 ? Number(res.arr) || 0 : 0), status: "Open", createdBy: state.persona
    };
    if (isLive()) {
      domo.post(CE + "createScenario", scenario).then(function () { state.ops.loaded = false; state.surface = "ops"; renderTabs(); loadOps(); });
    } else {
      state.ops.scenarios.unshift(Object.assign({ scenarioId: "local-" + Date.now(), createdTs: new Date().toISOString() }, scenario));
      state.ops.note = "Sample mode \u2014 scenario added locally. Connect the snowflakece bridge to persist it to the SCENARIO_RUNS hybrid table.";
      state.surface = "ops"; renderTabs(); renderView();
    }
  }

  function renderML() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);

    var seed = state.ml.seed;
    if (!seed && !state.ml.loading) { loadMLSeed().then(function () { if (state.surface === "ml") renderView(); }); }

    // Header (always visible) — model registry facts + model/endpoint pickers.
    frag.appendChild(h("section", { class: "grid" }, [mlStatusHeader(state.ml.result || { model: (seed && seed.model) || {} })]));

    if (state.ml.result) {
      // Full scored layout (Ad Hoc + Prediction + payload).
      frag.appendChild(h("section", { class: "grid" }, [mlResultPanels(state.ml.result)]));
    } else if (seed && (seed.accounts || []).length) {
      // Reference parity: land on the full layout with a pre-filled Ad Hoc form
      // and a "run a prediction" Prediction prompt (not a bare spinner).
      var base = mlBaseFromSeed(seed);
      frag.appendChild(h("section", { class: "grid" }, [mlAdHocPanel(base, { showLog: false }), mlPredictionEmpty()]));
    } else {
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Loading the Model Registry\u2026"]));
    }
    if (state.ml.error) {
      frag.appendChild(h("div", { class: "conn-banner" }, [h("div", {}, [h("span", { class: "cb-title" }, ["Score error \u2014 "]), state.ml.error])]));
    }
    return frag;
  }

  // A result-shaped object (features + context, no prediction) for the default
  // Ad Hoc form, seeded from the first sample account.
  function mlBaseFromSeed(seed) {
    var acct = (seed.accounts || [])[0] || {};
    return {
      base: true, accountId: state.ml.accountId || acct.accountId || "", accountName: acct.accountName || "",
      region: acct.region, segment: acct.segment, industry: acct.industry || "",
      arr: acct.arr, features: acct.features || {}, model: seed.model || {}
    };
  }

  /* --------------------------- Snowflake Ops ----------------------------- */
  function loadOps() {
    state.ops.loading = true; renderView();
    var done = function (sc, fb, live) { state.ops.loading = false; state.ops.loaded = true; state.ops.scenarios = sc; state.ops.feedback = fb; state.ops.live = live; renderView(); };
    if (isLive()) {
      domo.post(CE + "getOpsState", {})
        .then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") { done(d.scenarios || [], d.feedback || [], true); }
          else throw new Error(d && d.error ? d.error : "Ops read failed");
        })
        .catch(function (err) { console.warn("[app] live ops failed, using seed:", err); sampleOps().then(function (s) { done(s.scenarios, s.feedback, false); }); });
      return;
    }
    sampleOps().then(function (s) { done(s.scenarios, s.feedback, false); });
  }

  function sampleOps() {
    return fetch("./public/mock/ops-state.json").then(function (r) { return r.json(); })
      .then(function (s) { return { scenarios: s.scenarios || [], feedback: s.feedback || [] }; });
  }

  function opsMutate(fn, payload, optimistic) {
    if (isLive()) {
      domo.post(CE + fn, payload).then(function () { state.ops.loaded = false; loadOps(); })
        .catch(function (err) { state.ops.note = "Write failed: " + (err && err.message ? err.message : err); renderView(); });
    } else {
      optimistic();
      state.ops.note = "Sample mode \u2014 change is local only. Connect the snowflakece bridge to persist to the hybrid table.";
      renderView();
    }
  }

  var SCEN_STATUS = ["Open", "Mitigating", "Under Review", "Accepted", "Closed"];
  function scenStatusCls(s) {
    s = String(s || "").toLowerCase();
    if (/accept|closed|complete|done|resolved/.test(s)) return "good";
    if (/mitigat|review|running|progress/.test(s)) return "warn";
    if (/archiv|void|reject|downside/.test(s)) return "bad";
    return "info";
  }
  function scenStatusPill(s) { return h("span", { class: "scen-pill " + scenStatusCls(s) }, [h("span", { class: "scen-dot" }), s || "Open"]); }
  function scrollToSelected() { requestAnimationFrame(function () { var el2 = document.querySelector(".ops-selected"); if (el2) el2.scrollIntoView({ behavior: "smooth", block: "nearest" }); }); }

  // One scenario run row in the Hybrid Table (SCENARIO_RUNS) table.
  function scenarioRow(sc) {
    var selected = state.ops.selected === sc;
    var editBtn = h("button", { class: "ico-btn", title: "View / edit run", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M11 4H4v16h16v-7'/><path d='M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z'/></svg>" });
    editBtn.addEventListener("click", function (e) { e.stopPropagation(); state.ops.selected = sc; renderView(); scrollToSelected(); });
    var delBtn = h("button", { class: "ico-btn danger", title: "Delete run", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'><path d='M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14'/></svg>" });
    delBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      opsMutate("deleteScenario", { scenarioId: sc.scenarioId }, function () { state.ops.scenarios = state.ops.scenarios.filter(function (x) { return x !== sc; }); if (state.ops.selected === sc) state.ops.selected = null; });
    });
    var tr = h("tr", { class: "scen-row" + (selected ? " selected" : "") }, [
      h("td", {}, [h("div", { class: "scen-cell" }, [
        h("span", { class: "scen-name" }, [sc.scenarioName || "Scenario"]),
        h("span", { class: "scen-sub" }, [(sc.accountName || sc.accountId || "") + (sc.region ? " \u00b7 " + sc.region : "") + (sc.segment ? " \u00b7 " + sc.segment : "")])
      ])]),
      h("td", {}, [scenStatusPill(sc.status)]),
      h("td", {}, [h("span", { class: "scen-by" }, [sc.createdBy || "\u2014"])]),
      h("td", { class: "num" }, [h("span", { class: "scen-risk" }, [money(sc.projectedRevenueAtRisk)])]),
      h("td", {}, [h("div", { class: "scen-acts" }, [editBtn, delBtn])])
    ]);
    tr.addEventListener("click", function () { state.ops.selected = sc; renderView(); scrollToSelected(); });
    return tr;
  }

  function feedbackRow(f) {
    var vCls = /agree/i.test(f.humanVerdict) && !/dis/i.test(f.humanVerdict) ? "good" : /disagree/i.test(f.humanVerdict) ? "bad" : "warn";
    return h("tr", {}, [
      h("td", {}, [h("code", { class: "scen-acct" }, [f.accountId])]),
      h("td", {}, [h("span", { class: "verdict " + vCls }, [f.humanVerdict || "\u2014"])]),
      h("td", { class: "num" }, [((Number(f.predictedRiskProbability) || 0) * 100).toFixed(0) + "%"]),
      h("td", {}, [f.correctedLabel || "\u2014"]),
      h("td", {}, [f.modelVersion ? (/^v/i.test(f.modelVersion) ? f.modelVersion : "v" + f.modelVersion) : "\u2014"]),
      h("td", {}, [f.comment || "\u2014"]),
      h("td", {}, [f.createdBy || "\u2014"])
    ]);
  }

  // Inline "Add row" editor (toggled) — mirrors the Lakebase add-row form.
  function opsAddForm() {
    var wrap = h("div", { class: "ops-addform" });
    var cancel = h("button", { class: "linklike" }, ["Cancel"]);
    cancel.addEventListener("click", function () { state.ops.adding = false; renderView(); });
    if (state.ops.tab === "feedback") {
      var facc = h("input", { class: "ops-in", type: "text", placeholder: "ACC-00008" });
      var verdict = h("select", { class: "ops-in" }, [h("option", {}, ["Agree"]), h("option", {}, ["Disagree"]), h("option", {}, ["Unsure"])]);
      var corrected = h("input", { class: "ops-in", type: "text", placeholder: "Corrected label (optional)" });
      var fby = h("input", { class: "ops-in", type: "text", value: state.persona });
      var comment = h("textarea", { class: "ops-in ops-ta", rows: "2", placeholder: "Comment / rationale" });
      var addF = h("button", { class: "pill-btn go solid" }, ["Add to Snowflake"]);
      addF.addEventListener("click", function () {
        var id = String(facc.value || "").trim().toUpperCase(); if (!id) { facc.focus(); return; }
        var seedAcct = (state.ml.seed && (state.ml.seed.accounts || []).filter(function (a) { return a.accountId === id; })[0]) || {};
        var payload = { accountId: id, modelVersion: (state.ml.seed && state.ml.seed.model && state.ml.seed.model.version) || "10.0",
          predictedRiskProbability: seedAcct.predictedProbability || null, humanVerdict: verdict.value, correctedLabel: corrected.value || "", comment: comment.value || "", createdBy: fby.value || state.persona };
        opsMutate("createFeedback", payload, function () { state.ops.feedback.unshift(Object.assign({ feedbackId: "local-" + Date.now(), createdTs: new Date().toISOString() }, payload)); });
        state.ops.adding = false;
      });
      wrap.appendChild(h("div", { class: "ops-addform-head" }, [h("span", {}, ["Add prediction feedback"]), cancel]));
      wrap.appendChild(h("div", { class: "ops-grid" }, [
        opsField("Account id", facc), opsField("Verdict", verdict), opsField("Corrected label", corrected), opsField("Created by", fby)
      ]));
      wrap.appendChild(opsField("Comment", comment, true));
      wrap.appendChild(addF);
      return wrap;
    }
    var acc = h("input", { class: "ops-in", type: "text", placeholder: "ACC-00008" });
    var name = h("input", { class: "ops-in", type: "text", placeholder: "e.g. West save play \u2014 aggressive" });
    var status = h("select", { class: "ops-in" }, SCEN_STATUS.map(function (s) { return h("option", {}, [s]); }));
    var by = h("input", { class: "ops-in", type: "text", value: state.persona });
    var risk = h("input", { class: "ops-in", type: "text", placeholder: "$ e.g. 420000" });
    var notes = h("textarea", { class: "ops-in ops-ta", rows: "3", placeholder: "Assumptions \u2014 free text or JSON, e.g. { \"segment\": \"West\", \"intervention\": \"exec outreach + reliability credit\" }" });
    var add = h("button", { class: "pill-btn go solid" }, ["Add to Snowflake"]);
    add.addEventListener("click", function () {
      var id = String(acc.value || "").trim().toUpperCase(); if (!id) { acc.focus(); return; }
      var seedAcct = (state.ml.seed && (state.ml.seed.accounts || []).filter(function (a) { return a.accountId === id; })[0]) || {};
      var payload = { accountId: id, accountName: seedAcct.accountName || id, region: seedAcct.region || "", segment: seedAcct.segment || "",
        scenarioName: name.value || "What-if scenario", predictedRiskProbability: seedAcct.predictedProbability || null,
        assumptionNotes: notes.value || "", projectedRevenueAtRisk: Number(String(risk.value).replace(/[^0-9.]/g, "")) || 0, status: status.value || "Open", createdBy: by.value || state.persona };
      opsMutate("createScenario", payload, function () { state.ops.scenarios.unshift(Object.assign({ scenarioId: "local-" + Date.now(), createdTs: new Date().toISOString() }, payload)); });
      state.ops.adding = false;
    });
    wrap.appendChild(h("div", { class: "ops-addform-head" }, [h("span", {}, ["Add scenario row"]), cancel]));
    wrap.appendChild(h("div", { class: "ops-grid" }, [
      opsField("Account id", acc), opsField("Scenario name", name), opsField("Status", status), opsField("Created by", by), opsField("Projected rev at risk", risk)
    ]));
    wrap.appendChild(opsField("Assumptions", notes, true));
    wrap.appendChild(add);
    return wrap;
  }
  function opsField(label, control, full) {
    return h("label", { class: "ops-fld" + (full ? " full" : "") }, [h("span", { class: "ops-fld-lab" }, [label]), control]);
  }

  // "Operational State" header — Hybrid Table connection facts (reference parity).
  function opsStateHeader() {
    var cfg = state.config || {};
    var cards = [
      ["Engine", "Hybrid Tables \u00b7 OLTP"],
      ["Database", cfg.database || "SNOWFLAKE_REVENUE_CC"],
      ["Schema", cfg.schema || "CORE"],
      ["Tables", "SCENARIO_RUNS \u00b7 PREDICTION_FEEDBACK"],
      ["Access", "REVENUE_CC_READER \u2192 REVENUE_CC_WRITER"]
    ];
    var row = h("div", { class: "ops-state-cards" });
    cards.forEach(function (c) { row.appendChild(h("div", { class: "osc" }, [h("span", { class: "osc-k" }, [c[0]]), h("span", { class: "osc-v" }, [c[1]])])); });
    return h("article", { class: "panel col-12 ops-state" }, [
      h("div", { class: "ops-state-l" }, [
        h("span", { class: "ops-eyebrow" }, [h("img", { class: "eyebrow-mark", src: "./public/brand/snowflake-mark.svg", alt: "" }), "SNOWFLAKE HYBRID TABLES \u00b7 OPERATIONAL STATE"]),
        h("div", { class: "ops-state-title" }, [
          h("h2", {}, ["Operational State"]),
          h("span", { class: "ml-serve " + (state.ops.live ? "on" : "seed") }, [state.ops.live ? "live \u00b7 in-warehouse OLTP" : "sample"])
        ]),
        h("p", { class: "ops-state-lead" }, ["Millisecond OLTP state inside Snowflake \u2014 what-if scenario runs and human feedback on the model, governed by the same Horizon roles as the analytics."]),
        row
      ])
    ]);
  }

  // Section toolbar: active-table facts + Open in Snowsight / Refresh / Add row.
  function opsToolbar() {
    var cfg = state.config || {};
    var isFb = state.ops.tab === "feedback";
    var table = isFb ? "PREDICTION_FEEDBACK" : "SCENARIO_RUNS";
    var rows = isFb ? state.ops.feedback.length : state.ops.scenarios.length;
    var fqn = (cfg.database || "SNOWFLAKE_REVENUE_CC") + "." + (cfg.schema || "CORE") + "." + table;
    var refresh = h("button", { class: "pill-btn ghost xs" }, ["\u21bb Refresh"]);
    refresh.addEventListener("click", function () { state.ops.loaded = false; state.ops.selected = null; state.ops.adding = false; loadOps(); });
    var addBtn = h("button", { class: "pill-btn go solid xs" }, [state.ops.adding ? "\u00d7 Close" : "+ Add row"]);
    addBtn.addEventListener("click", function () { state.ops.adding = !state.ops.adding; renderView(); });
    return h("div", { class: "ops-toolbar" }, [
      h("div", { class: "ops-tb-l" }, [
        h("h3", {}, [isFb ? "Prediction Feedback" : "Scenario Runs", h("span", { class: "ops-tb-count" }, ["(" + num(rows) + ")"])]),
        h("span", { class: "ops-tb-fqn" }, [num(rows) + " rows \u00b7 ", h("code", {}, [fqn])])
      ]),
      h("div", { class: "ops-tb-r" }, [
        srcLink("Open in Snowsight", snowsightObjHref("table", table), "sf"),
        refresh, addBtn
      ])
    ]);
  }

  // Selected scenario detail (ASSUMPTIONS + RESULTS + governed status control).
  function opsSelectedDetail() {
    var sc = state.ops.selected; if (!sc) return null;
    var assumptions = { accountId: sc.accountId, accountName: sc.accountName, region: sc.region, segment: sc.segment, scenarioName: sc.scenarioName, createdBy: sc.createdBy, assumptionNotes: sc.assumptionNotes || "" };
    var results = { status: sc.status, predictedRiskProbability: Number(sc.predictedRiskProbability) || 0, projectedRevenueAtRisk: Number(sc.projectedRevenueAtRisk) || 0 };

    var statusSel = h("select", { class: "ops-in sm" }, SCEN_STATUS.map(function (s) { var o = h("option", {}, [s]); if (s === sc.status) o.selected = true; return o; }));
    statusSel.addEventListener("change", function () {
      var next = statusSel.value;
      opsMutate("updateScenarioStatus", { scenarioId: sc.scenarioId, status: next }, function () { sc.status = next; });
    });
    var closeBtn = h("button", { class: "mini-btn ghost" }, ["Close"]);
    closeBtn.addEventListener("click", function () { state.ops.selected = null; renderView(); });

    return h("article", { class: "panel col-12 ops-selected" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, ["Selected run \u00b7 " + (sc.scenarioName || "Scenario")]), h("p", {}, [(sc.accountName || sc.accountId || "") + " \u00b7 ", h("code", {}, [String(sc.scenarioId || "")])])]),
        h("div", { class: "ops-sel-tools" }, [
          h("label", { class: "ops-sel-status" }, [h("span", {}, ["Status"]), statusSel]),
          srcLink("Open source table", snowsightObjHref("table", "SCENARIO_RUNS"), "sf"),
          closeBtn
        ])
      ]),
      h("div", { class: "ops-sel-grid" }, [
        h("div", {}, [h("div", { class: "insp-label" }, ["Assumptions"]), h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(assumptions, null, 2)])])]),
        h("div", {}, [h("div", { class: "insp-label" }, ["Results (writeback)"]), h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(results, null, 2)])])])
      ])
    ]);
  }

  function renderOps() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);

    if (!state.ops.loaded && !state.ops.loading) { loadOps(); }
    if (state.ops.loading) { frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Reading the Hybrid Tables (operational state)\u2026"])); return frag; }

    frag.appendChild(h("section", { class: "grid" }, [opsStateHeader()]));
    if (state.ops.note) frag.appendChild(h("div", { class: "ops-note" }, [state.ops.note]));

    // Sub-tabs (table selector)
    var subtabs = h("div", { class: "ops-subtabs" });
    [["scenarios", "Scenario Runs", state.ops.scenarios.length], ["feedback", "Prediction Feedback", state.ops.feedback.length]].forEach(function (t) {
      var b = h("button", { class: "ops-subtab" + (state.ops.tab === t[0] ? " active" : "") }, [t[1] + " (" + t[2] + ")"]);
      b.addEventListener("click", function () { state.ops.tab = t[0]; state.ops.adding = false; state.ops.selected = null; renderView(); });
      subtabs.appendChild(b);
    });
    frag.appendChild(subtabs);

    // The table lives inside one white bounding box (reference parity).
    var panelKids = [opsToolbar()];
    if (state.ops.adding) panelKids.push(opsAddForm());

    if (state.ops.tab === "scenarios") {
      if (!state.ops.scenarios.length) {
        panelKids.push(h("div", { class: "ops-empty" }, ["No scenario runs yet. Accept a prediction on the Snowflake ML tab, or use ", h("b", {}, ["+ Add row"]), " to write one to the hybrid table."]));
      } else {
        var table = h("table", { class: "result-table ops-scen-table" });
        var thead = h("thead"), htr = h("tr");
        ["Scenario", "Status", "Created by", "Rev at risk", ""].forEach(function (c, i) { htr.appendChild(h("th", { class: i === 3 ? "num" : "" }, [c])); });
        thead.appendChild(htr); table.appendChild(thead);
        var tb = h("tbody"); state.ops.scenarios.forEach(function (sc) { tb.appendChild(scenarioRow(sc)); }); table.appendChild(tb);
        panelKids.push(h("div", { class: "table-wrap" }, [table]));
      }
    } else {
      if (!state.ops.feedback.length) {
        panelKids.push(h("div", { class: "ops-empty" }, ["No prediction feedback yet. Capture a verdict on the Snowflake ML tab, or use ", h("b", {}, ["+ Add row"]), "."]));
      } else {
        var ftable = h("table", { class: "result-table ops-table" });
        var fthead = h("thead"), fhtr = h("tr");
        ["Account", "Verdict", "P(risk)", "Corrected", "Model", "Comment", "By"].forEach(function (c) { fhtr.appendChild(h("th", {}, [c])); });
        fthead.appendChild(fhtr); ftable.appendChild(fthead);
        var ftb = h("tbody"); state.ops.feedback.forEach(function (f) { ftb.appendChild(feedbackRow(f)); }); ftable.appendChild(ftb);
        panelKids.push(h("div", { class: "table-wrap" }, [ftable]));
      }
    }
    frag.appendChild(h("article", { class: "panel col-12 ops-panel" }, panelKids));

    if (state.ops.tab === "scenarios") { var det = opsSelectedDetail(); if (det) frag.appendChild(h("section", { class: "grid" }, [det])); }

    frag.appendChild(h("p", { class: "ops-prov" }, [
      (state.ops.live ? "Live " : "Sample "), "\u00b7 ",
      h("code", {}, ["SCENARIO_RUNS"]), " + ", h("code", {}, ["PREDICTION_FEEDBACK"]),
      " hybrid tables \u00b7 reads as ", h("code", {}, ["REVENUE_CC_READER"]), ", writes as ", h("code", {}, ["REVENUE_CC_WRITER"]), "."
    ]));
    return frag;
  }

  /* ---------------------- Approvals / action loop ------------------------ */
  function mergeById(a) {
    var m = state.approvals.byId;
    (a || []).forEach(function (x) {
      if (!x.actionId) return;
      m[x.actionId] = Object.assign(m[x.actionId] || {}, {
        actionId: x.actionId, accountId: x.accountId, accountName: x.accountName, region: x.region,
        recommendation: x.recommendation,
        expectedRevenueProtected: x.expectedRevenueProtected != null ? x.expectedRevenueProtected : (m[x.actionId] && m[x.actionId].expectedRevenueProtected)
      });
    });
  }

  function recomputeLocalProtected() {
    var base = (state.approvals.seed && state.approvals.seed.protected && state.approvals.seed.protected.baseline) || 0;
    var wb = state.approvals.writeback;
    var wbSum = wb.filter(function (r) { return r.executionStatus === "Executed"; }).reduce(function (a, r) { return a + (Number(r.actualRevenueProtected) || 0); }, 0);
    state.approvals.protected = {
      baseline: base, writeback: wbSum, total: base + wbSum,
      approvedCount: wb.filter(function (r) { return r.approvalStatus === "Approved"; }).length,
      executedCount: wb.filter(function (r) { return r.executionStatus === "Executed"; }).length
    };
  }

  function loadApprovals() {
    state.approvals.loading = true; renderView();
    fetch("./public/mock/approvals.json").then(function (r) { return r.json(); }).then(function (seed) {
      state.approvals.seed = seed;
      state.approvals.history = seed.history || [];
      mergeById(seed.pending);
      if (isLive()) {
        domo.post(CE + "getApprovalQueue", { persona: state.persona }).then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") {
            state.approvals.live = true;
            state.approvals.pending = d.pending || [];
            state.approvals.writeback = d.writeback || [];
            state.approvals.protected = d.protected || seed.protected;
            mergeById(d.pending);
          } else { throw new Error(d && d.error ? d.error : "queue read failed"); }
          state.approvals.loading = false; state.approvals.loaded = true; renderView();
        }).catch(function (err) {
          console.warn("[app] live approvals failed, using seed:", err);
          state.approvals.live = false; state.approvals.pending = seed.pending || [];
          recomputeLocalProtected(); state.approvals.loading = false; state.approvals.loaded = true; renderView();
        });
      } else {
        state.approvals.live = false; state.approvals.pending = seed.pending || [];
        recomputeLocalProtected(); state.approvals.loading = false; state.approvals.loaded = true; renderView();
      }
    });
  }

  var APPROVAL_QUEUE_ID = "6383ccfa-54aa-4c23-b855-9f3fe619cad4";
  // Canonical link out to the source Domo Task Center queue (matches the URL a
  // reviewer would open natively).
  function queueHref() { return DOMO_INSTANCE + "/queues/tasks?queueId=" + APPROVAL_QUEUE_ID; }
  function queueConsoleHref(status) {
    if (!status) return queueHref();
    return DOMO_INSTANCE + "/queues/tasks?status=" + encodeURIComponent(String(status).toUpperCase()) + "&queueId=" + APPROVAL_QUEUE_ID;
  }
  function fmtTaskDate(iso) {
    if (!iso) return "\u2014";
    var d = new Date(iso); if (isNaN(d.getTime())) return "\u2014";
    return d.toLocaleString("en-US", { month: "numeric", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
  }

  // Native Domo Task Center queue — the Action Center is powered ONLY by the
  // live queue (via the snowflakece bridge). No synthetic rows: offline preview
  // shows an honest empty state with a link out to the source queue.
  function loadApprovalTasks() {
    state.approvals.tasksLoading = true;
    if (!isLive()) { state.approvals.tasks = []; state.approvals.tasksLive = false; state.approvals.tasksLoaded = true; state.approvals.tasksLoading = false; renderView(); return; }
    domo.post(CE + "listApprovalTasks", { limit: 50 }).then(function (resp) {
      var d = unwrap(resp);
      if (d && d.status === "SUCCEEDED") { state.approvals.tasksLive = true; state.approvals.tasks = d.tasks || []; state.approvals.tasksError = null; }
      else { state.approvals.tasksLive = false; state.approvals.tasks = []; state.approvals.tasksError = (d && d.error) ? d.error : ("Unexpected response (status: " + (d && d.status ? d.status : "none") + ")"); }
      state.approvals.tasksLoaded = true; state.approvals.tasksLoading = false; renderView();
    }).catch(function (err) {
      state.approvals.tasksLive = false; state.approvals.tasks = []; state.approvals.tasksError = (err && err.message) ? err.message : String(err); state.approvals.tasksLoaded = true; state.approvals.tasksLoading = false; renderView();
    });
  }

  // Approve / Reject a native queue task -> completes the Domo task, resumes the
  // workflow, and writes status back to Snowflake.
  function completeTask(taskId, decision, version) {
    if (!isLive()) { state.approvals.note = "Sample mode \u2014 connect in Domo to complete native queue tasks."; renderView(); return; }
    state.approvals.busyTask = taskId + ":" + decision; renderView();
    domo.post(CE + "completeApprovalTask", { taskId: taskId, decision: decision, version: version || "1" }).then(function (resp) {
      var d = unwrap(resp);
      state.approvals.busyTask = null;
      if (!d || d.status !== "SUCCEEDED") { state.approvals.note = "Task " + decision.toLowerCase() + " failed: " + ((d && d.error) || "unknown"); renderView(); return; }
      state.approvals.note = "Task " + decision.toLowerCase() + " \u2014 workflow resumed; status writing back to Snowflake under REVENUE_CC_WRITER.";
      loadApprovalTasks(); loadApprovals();
    }).catch(function (err) { state.approvals.busyTask = null; state.approvals.note = "Complete failed: " + (err && err.message ? err.message : err); renderView(); });
  }

  function taskRow(t) {
    var open = String(t.status || "").toUpperCase() === "OPEN";
    var link = h("a", { class: "task-link", href: queueConsoleHref(t.status), target: "_blank", rel: "noopener" }, [t.title || "Approve renewal-risk retention"]);
    var idSpan = h("span", { class: "task-id" }, [String(t.id || "").slice(0, 13)]);
    var busyA = state.approvals.busyTask === t.id + ":Approved";
    var busyR = state.approvals.busyTask === t.id + ":Rejected";
    var action;
    if (open) {
      var ap = h("button", { class: "pill-btn go solid xs", disabled: busyA ? "true" : null }, [busyA ? "\u2026" : "Approve"]);
      ap.addEventListener("click", function () { completeTask(t.id, "Approved", t.version); });
      var rj = h("button", { class: "pill-btn ghost xs", disabled: busyR ? "true" : null }, [busyR ? "\u2026" : "Reject"]);
      rj.addEventListener("click", function () { completeTask(t.id, "Rejected", t.version); });
      action = h("div", { class: "task-actions" }, [ap, rj]);
    } else {
      action = h("span", { class: "task-done" }, ["\u2713 " + (t.status ? String(t.status).toLowerCase() : "completed")]);
    }
    return h("tr", {}, [
      h("td", {}, [h("div", { class: "task-cell" }, [link, idSpan])]),
      h("td", {}, [h("span", { class: "status-pill " + (open ? "warn" : "ok") }, [h("span", { class: "sp-dot" }), t.status || "\u2014"])]),
      h("td", {}, [fmtTaskDate(t.createdOn)]),
      h("td", {}, [fmtTaskDate(t.completedOn)]),
      h("td", {}, [action])
    ]);
  }

  var QUEUE_ICON = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M9 11l3 3L22 4'/><path d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'/></svg>";

  function actionCenter() {
    var tasks = state.approvals.tasks || [];
    var live = state.approvals.tasksLive;
    var loading = state.approvals.tasksLoading && !state.approvals.tasksLoaded;

    var homeLink = h("a", { class: "ac-back", href: "#" }, [h("span", { class: "ac-back-arrow" }, ["\u2190"]), "Forecast Home"]);
    homeLink.addEventListener("click", function (e) { e.preventDefault(); goto("home"); });

    var head = h("div", { class: "panel-head ac-head" }, [
      h("div", {}, [
        h("h2", {}, ["Approvals \u00b7 Action Center"]),
        h("p", {}, ["Human-in-the-loop approvals for the governed Renewal-Risk Retention workflow. Approve or reject here \u2014 the decision completes the native Domo ",
          h("a", { class: "inline-link", href: queueHref(), target: "_blank", rel: "noopener" }, ["Task Center"]),
          " task, resumes the workflow, and writes status back to Snowflake under ", h("code", {}, ["REVENUE_CC_WRITER"]), "."])
      ]),
      h("div", { class: "ac-head-r" }, [
        homeLink,
        h("a", { class: "queue-tag", href: queueHref(), target: "_blank", rel: "noopener" }, ["RENEWAL RISK APPROVALS QUEUE", h("span", { class: "src-arrow" }, ["\u2197"])])
      ])
    ]);

    var body;
    if (loading) {
      body = h("div", { class: "analyst-loading in-panel" }, [h("span", { class: "spinner" }), "Loading the live approval queue\u2026"]);
    } else if (!live) {
      body = h("div", { class: "ac-empty" }, [
        h("div", { class: "ac-empty-ico", html: QUEUE_ICON }),
        h("h3", {}, ["Live queue not connected"]),
        h("p", {}, ["The Action Center is powered entirely by the live Domo Task Center queue through the ", h("code", {}, ["snowflakece"]), " bridge \u2014 there are no sample rows here. Connect in Domo, or open the source queue directly."]),
        state.approvals.tasksError ? h("p", { class: "ac-err" }, ["listApprovalTasks: ", h("code", {}, [String(state.approvals.tasksError)])]) : null,
        srcLink("Open the approvals queue in Domo", queueHref(), "domo")
      ]);
    } else if (!tasks.length) {
      body = h("div", { class: "ac-empty" }, [
        h("div", { class: "ac-empty-ico ok", html: QUEUE_ICON }),
        h("h3", {}, ["Queue is clear"]),
        h("p", {}, ["No approval tasks right now. Cortex Agent save plays land here as human tasks once the governed workflow routes them from the Agent Action Queue on Forecast Home."]),
        srcLink("Open the approvals queue in Domo", queueHref(), "domo")
      ]);
    } else {
      var table = h("table", { class: "result-table task-table" });
      var thead = h("thead"), htr = h("tr");
      ["Task", "Status", "Created", "Completed", "Action"].forEach(function (c) { htr.appendChild(h("th", {}, [c])); });
      thead.appendChild(htr); table.appendChild(thead);
      var tb = h("tbody"); tasks.forEach(function (t) { tb.appendChild(taskRow(t)); }); table.appendChild(tb);
      body = h("div", { class: "table-wrap" }, [table]);
    }

    return h("article", { class: "panel col-12 action-center" }, [head, body]);
  }

  function renderApprovals() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    if (!state.approvals.tasksLoaded && !state.approvals.tasksLoading) { loadApprovalTasks(); }
    if (state.approvals.note) frag.appendChild(h("div", { class: "ops-note" }, [state.approvals.note]));
    frag.appendChild(h("section", { class: "grid" }, [actionCenter()]));
    return frag;
  }

  /* ------------- Govern everywhere: Horizon AI Readiness (Sprint 7) ------------- */
  var REGION_ORDER = ["West", "East", "Central", "South"];

  function loadGovernance() {
    state.governance.loading = true; renderView();
    fetch("./public/mock/governance.json").then(function (r) { return r.json(); }).then(function (seed) {
      state.governance.seed = seed;
      state.governance.parity = seed.parity;
      state.governance.masking = seed.masking;
      if (isLive()) {
        domo.post(CE + "getGovernance", {}).then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") {
            state.governance.live = true;
            if (d.parity && d.parity.roles && d.parity.roles.length) state.governance.parity = d.parity;
            if (d.masking && d.masking.sample && d.masking.sample.length) state.governance.masking = d.masking;
          } else { throw new Error(d && d.error ? d.error : "governance read failed"); }
          state.governance.loading = false; state.governance.loaded = true; renderView();
        }).catch(function (err) {
          console.warn("[app] live governance failed, using seed:", err);
          state.governance.live = false; state.governance.loading = false; state.governance.loaded = true; renderView();
        });
      } else {
        state.governance.live = false; state.governance.loading = false; state.governance.loaded = true; renderView();
      }
    }).catch(function (err) {
      state.governance.loading = false; state.governance.loaded = true; state.governance.error = String(err && err.message ? err.message : err); renderView();
    });
  }

  function govIdentityBanner() {
    var si = (state.governance.seed && state.governance.seed.serviceIdentity) || {};
    return h("div", { class: "gov-identity" }, [
      h("div", { class: "gi-badges" }, [
        h("span", { class: "priv-chip read" }, ["service \u00b7 " + (si.user || "SVC_REVENUE_CC")]),
        h("span", { class: "priv-arrow" }, ["\u2192"]),
        h("span", { class: "priv-chip write" }, ["base role \u00b7 " + (si.baseRole || "REVENUE_CC_READER")])
      ]),
      h("p", { class: "gi-note" }, [si.note || "Governance is enforced at the query engine by role under a named service identity."])
    ]);
  }

  function govParityColumn(roleObj, maxTotal) {
    var restricted = roleObj.role !== "REVENUE_CC_READER";
    var rows = (roleObj.rows || []).slice().sort(function (a, b) {
      return REGION_ORDER.indexOf(a.region) - REGION_ORDER.indexOf(b.region);
    });
    var bars = h("div", { class: "gpc-bars" });
    rows.forEach(function (rw) {
      var pct = maxTotal ? Math.max(4, Math.round((rw.accounts / maxTotal) * 100)) : 4;
      bars.appendChild(h("div", { class: "gpc-bar-row" }, [
        h("span", { class: "gpc-region" }, [rw.region]),
        h("span", { class: "gpc-track" }, [h("span", { class: "gpc-fill" + (restricted ? " scoped" : "") , style: "width:" + pct + "%" }, [])]),
        h("span", { class: "gpc-count" }, [num(rw.accounts)])
      ]));
    });
    return h("article", { class: "gpc" + (restricted ? " scoped" : " full") }, [
      h("div", { class: "gpc-head" }, [
        h("span", { class: "gpc-role" }, [roleObj.role]),
        h("span", { class: "gpc-scope" + (restricted ? " scoped" : "") }, [roleObj.scope])
      ]),
      h("div", { class: "gpc-total" }, [num(roleObj.total), h("span", { class: "gpc-total-lab" }, ["accounts visible"])]),
      bars
    ]);
  }

  function govParityPanel() {
    var p = state.governance.parity || { roles: [] };
    var maxTotal = (p.roles || []).reduce(function (m, r) { return Math.max(m, r.total || 0); }, 0);
    var cols = h("div", { class: "gpc-grid" });
    (p.roles || []).forEach(function (r) { cols.appendChild(govParityColumn(r, maxTotal)); });
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [
        h("h2", {}, ["Two-persona parity test"]),
        h("p", {}, ["The same governed question returns different rows per role \u2014 enforced by Snowflake, not the app"])
      ]), h("span", { class: "panel-tag" }, [state.governance.live ? "Live \u00b7 query engine" : "Sample"])]),
      h("code", { class: "gov-query" }, [p.query || ""]),
      cols
    ]);
  }

  function govMaskingPanel() {
    var m = state.governance.masking || { sample: [] };
    var table = h("table", { class: "result-table" });
    var thead = h("thead"), htr = h("tr");
    ["Account", (m.baseRole || "REVENUE_CC_READER"), (m.maskedRole || "REVENUE_CC_READER_WEST")].forEach(function (c, i) {
      htr.appendChild(h("th", i === 0 ? {} : { class: "num" }, [c]));
    });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = h("tbody");
    (m.sample || []).forEach(function (r) {
      tb.appendChild(h("tr", {}, [
        h("td", {}, [r.accountId]),
        h("td", { class: "num" }, [r.real != null ? money(r.real) : "\u2014"]),
        h("td", { class: "num" }, [r.masked == null ? h("span", { class: "masked-cell" }, ["\u25cf\u25cf\u25cf masked"]) : money(r.masked)])
      ]));
    });
    table.appendChild(tb);
    return h("article", { class: "panel col-6" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [
        h("h2", {}, ["Column masking"]),
        h("p", {}, [(m.column || "ANNUAL_RECURRING_REVENUE") + " \u2014 real for base role, redacted for scoped roles"])
      ])]),
      h("div", { class: "table-wrap" }, [table])
    ]);
  }

  function govPolicyPanel() {
    var seed = state.governance.seed || {};
    var policies = seed.policies || [];
    var sem = seed.semantic || {};
    var list = h("div", { class: "policy-list" });
    policies.forEach(function (pol) {
      list.appendChild(h("div", { class: "policy-item" }, [
        h("div", { class: "pi-top" }, [
          h("span", { class: "pi-name" }, [pol.name]),
          h("span", { class: "pi-kind" }, [pol.kind]),
          h("span", { class: "pi-status " + (String(pol.status).toUpperCase() === "ACTIVE" ? "on" : "") }, [pol.status])
        ]),
        h("code", { class: "pi-target" }, [pol.target]),
        h("p", { class: "pi-desc" }, [pol.description || ""])
      ]));
    });
    var invRows = [
      ["Semantic view", sem.semanticView],
      ["Gold views", (sem.goldViews || []).length + " governed"],
      ["Search service", sem.searchService],
      ["ML model", sem.model],
      ["Agent", sem.agent]
    ];
    var inv = h("div", { class: "gov-inv" });
    invRows.forEach(function (r) { if (r[1]) inv.appendChild(h("div", { class: "gov-inv-row" }, [h("span", { class: "gi-lab" }, [r[0]]), h("code", {}, [String(r[1])])])); });
    return h("article", { class: "panel col-6" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [
        h("h2", {}, ["Active policies + governed objects"]),
        h("p", {}, ["Horizon row-access + masking policies attached at the source"])
      ])]),
      list, inv
    ]);
  }

  function govGuardCard(key, title, g) {
    var status = (g && g.status) || "\u2014";
    var cls = status === "Enabled" ? "on" : status === "Available" ? "avail" : "todo";
    return h("article", { class: "guard-card" }, [
      h("div", { class: "guard-top" }, [h("span", { class: "guard-title" }, [title]), h("span", { class: "guard-status " + cls }, [status])]),
      h("p", { class: "guard-detail" }, [(g && g.detail) || ""])
    ]);
  }

  function govGuardPanel() {
    var g = (state.governance.seed && state.governance.seed.guardrails) || {};
    var grid = h("div", { class: "guard-grid" }, [
      govGuardCard("cortexGuard", "Cortex AI Guardrails", g.cortexGuard),
      govGuardCard("observability", "AI Observability", g.observability),
      govGuardCard("evaluations", "Agent Evaluations", g.evaluations)
    ]);
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [
        h("h2", {}, ["Cortex AI governance controls"]),
        h("p", {}, ["Guardrails, observability, and evaluations \u2014 status reflects the live account, honestly labeled"])
      ])]),
      grid
    ]);
  }

  function govReadinessPanel() {
    var rows = (state.governance.seed && state.governance.seed.readinessParity) || [];
    var table = h("table", { class: "result-table" });
    var thead = h("thead"), htr = h("tr");
    ["Capability", "Snowflake Horizon", "Domo AI Readiness"].forEach(function (c) { htr.appendChild(h("th", {}, [c])); });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = h("tbody");
    rows.forEach(function (r) {
      tb.appendChild(h("tr", {}, [
        h("td", {}, [h("strong", {}, [r.capability])]),
        h("td", {}, [r.snowflake]),
        h("td", {}, [r.domo])
      ]));
    });
    table.appendChild(tb);
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [
        h("h2", {}, ["Governance parity \u2014 Horizon \u2194 Domo AI Readiness"]),
        h("p", {}, ["One entitlement story spanning both planes; parity is the floor, not the ceiling"])
      ])]),
      h("div", { class: "table-wrap" }, [table])
    ]);
  }

  /* ---- AI Readiness control plane (Horizon <-> Domo, column-level) ---- */
  // Flatten a semantic table into a single column list tagged by kind.
  function rlColumns(t) {
    var out = [];
    (t.dimensions || []).forEach(function (c) { out.push({ name: c.name, kind: "Dimension", dataType: c.dataType, comment: c.comment, synonyms: c.synonyms || [] }); });
    (t.facts || []).forEach(function (c) { out.push({ name: c.name, kind: "Fact", dataType: c.dataType, comment: c.comment, synonyms: c.synonyms || [] }); });
    (t.metrics || []).forEach(function (c) { out.push({ name: c.name, kind: "Metric", dataType: c.dataType, comment: c.comment, synonyms: c.synonyms || [] }); });
    return out;
  }
  function rlKey(tbl, col) { return tbl + "." + col; }
  // Domo AI-readiness status: synonyms present (or a manual sync) means the
  // column is staged into the Domo semantic layer; otherwise it's pending.
  function rlDomo(tbl, c) {
    return state.governance.synced[rlKey(tbl, c.name)] === true ? "Synced" : "Staged";
  }
  // Horizon is the source of truth: columns are "prepared" there (comments /
  // synonyms / tags), but NOTHING is synced into Domo AI Readiness until a
  // human runs Sync. So the initial Domo-synced state is empty — the Sync /
  // Wipe workflow is what demonstrates the mirror (matches the reference app,
  // which lands at ~0% synced).
  function preseedReadiness(model) { /* intentionally no-op: 0 columns synced into Domo */ }
  function rlScore(t) {
    var cols = rlColumns(t);
    var documented = cols.filter(function (c) { return c.comment && String(c.comment).trim(); }).length;
    var synced = cols.filter(function (c) { return rlDomo(t.name, c) === "Synced"; }).length;
    return { cols: cols, total: cols.length, documented: documented, synced: synced,
      docPct: cols.length ? Math.round((documented / cols.length) * 100) : 0,
      domoPct: cols.length ? Math.round((synced / cols.length) * 100) : 0 };
  }
  function rlBar(pct, cls) { return h("span", { class: "rl-track" }, [h("span", { class: "rl-fill" + (cls ? " " + cls : ""), style: "width:" + pct + "%" }, [])]); }

  // Context-length donut (reference parity): ring filled by prepared %, char
  // count in the center.
  function rlDonut(chars, pct) {
    var svgNS = "http://www.w3.org/2000/svg";
    var R = 29, C = 2 * Math.PI * R, cx = 38, cy = 38;
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "rl-donut"); svg.setAttribute("viewBox", "0 0 76 76");
    var track = document.createElementNS(svgNS, "circle");
    track.setAttribute("cx", cx); track.setAttribute("cy", cy); track.setAttribute("r", R);
    track.setAttribute("fill", "none"); track.setAttribute("stroke", "var(--n-100)"); track.setAttribute("stroke-width", "7");
    svg.appendChild(track);
    var arc = document.createElementNS(svgNS, "circle");
    arc.setAttribute("cx", cx); arc.setAttribute("cy", cy); arc.setAttribute("r", R);
    arc.setAttribute("fill", "none"); arc.setAttribute("stroke", "var(--sf-blue)"); arc.setAttribute("stroke-width", "7");
    arc.setAttribute("stroke-linecap", "round");
    arc.setAttribute("stroke-dasharray", (C * pct / 100).toFixed(1) + " " + (C * (1 - pct / 100)).toFixed(1));
    arc.setAttribute("transform", "rotate(-90 " + cx + " " + cy + ")");
    svg.appendChild(arc);
    var v = document.createElementNS(svgNS, "text");
    v.setAttribute("class", "rl-donut-v"); v.setAttribute("x", cx); v.setAttribute("y", cy - 1); v.setAttribute("text-anchor", "middle");
    v.textContent = (chars >= 1000 ? (chars / 1000).toFixed(1) + "k" : String(chars));
    svg.appendChild(v);
    var k = document.createElementNS(svgNS, "text");
    k.setAttribute("class", "rl-donut-k"); k.setAttribute("x", cx); k.setAttribute("y", cy + 12); k.setAttribute("text-anchor", "middle");
    k.textContent = "chars"; svg.appendChild(k);
    return svg;
  }

  function readinessRail(model) {
    var tables = (model.tables || []).slice();
    var rail = h("div", { class: "rl-rail" });
    tables.forEach(function (t) {
      var sc = rlScore(t);
      var active = state.governance.rlSelected === t.name;
      var card = h("button", { class: "rl-ds" + (active ? " active" : "") }, [
        h("div", { class: "rl-ds-top" }, [h("span", { class: "rl-ds-name" }, [t.name]), h("span", { class: "rl-ds-base" }, [t.base])]),
        h("div", { class: "rl-ds-metric" }, [h("span", { class: "rl-ds-lab" }, ["Horizon"]), rlBar(sc.docPct), h("span", { class: "rl-ds-pct" }, [sc.docPct + "%"])]),
        h("div", { class: "rl-ds-metric" }, [h("span", { class: "rl-ds-lab" }, ["Domo AI"]), rlBar(sc.domoPct, "domo"), h("span", { class: "rl-ds-pct" }, [sc.domoPct + "%"])])
      ]);
      card.addEventListener("click", function () { state.governance.rlSelected = t.name; renderView(); });
      rail.appendChild(card);
    });
    return rail;
  }

  // Map a semantic table's base view -> the federated Domo dataset id (lineage).
  function rlDatasetId(t) {
    var base = String(t.base || t.name || "").split(".").pop();
    var m = LINEAGE_VIEWS.filter(function (v) { return v.view === base; })[0];
    return m ? m.dataSetId : null;
  }
  // Total source-context characters (Horizon comments) — drives the gauge.
  function rlContextChars(t) {
    return rlColumns(t).reduce(function (a, c) { return a + (c.comment ? String(c.comment).length : 0); }, 0);
  }
  function rlContextTier(chars, cols) {
    var avg = cols ? chars / cols : 0;
    if (avg >= 80) return { lab: "rich", cls: "rich" };
    if (avg >= 40) return { lab: "adequate", cls: "adequate" };
    return { lab: "sparse", cls: "sparse" };
  }
  function syncAllPrepared(t) {
    rlColumns(t).forEach(function (c) { if (c.comment && String(c.comment).trim()) state.governance.synced[rlKey(t.name, c.name)] = true; });
    renderView();
  }
  function wipeAllFromDomo(t) {
    rlColumns(t).forEach(function (c) { state.governance.synced[rlKey(t.name, c.name)] = false; });
    state.governance.wiped = state.governance.wiped || {};
    state.governance.wiped[t.name] = true; // suppress synonym-implied "synced"
    renderView();
  }

  function readinessDetail(model) {
    var sel = state.governance.rlSelected || (model.tables && model.tables[0] && model.tables[0].name);
    var t = (model.tables || []).filter(function (x) { return x.name === sel; })[0];
    if (!t) return h("div", { class: "rl-detail" }, [h("p", { class: "analyst-note" }, ["Select a dataset."])]);
    var sc = rlScore(t);
    var baseName = String(t.base || t.name || "").split(".").pop();
    var dsId = rlDatasetId(t);
    var chars = rlContextChars(t);

    var links = h("div", { class: "rl-detail-links" }, [
      srcLink("Snowflake view", snowsightObjHref("semantic-view", "REVENUE_CC_ANALYST"), "sf"),
      dsId ? srcLink("Domo dataset", domoDatasetHref(dsId), "domo") : null,
      dsId ? srcLink("Domo AI Readiness", domoAiReadinessHref(dsId), "domo") : null
    ]);

    // Context-length gauge + dual sync meters (reference parity).
    var meters = h("div", { class: "rl-meters" }, [
      h("div", { class: "rl-ctx" }, [
        h("span", { class: "rl-ctx-lab" }, ["Context length"]),
        rlDonut(chars, sc.docPct),
        h("div", { class: "rl-ctx-k" }, ["names \u00b7 context \u00b7 synonyms"])
      ]),
      h("div", { class: "rl-meter" }, [h("div", { class: "rl-gauge-top" }, [h("span", {}, ["Snowflake Horizon prepared"]), h("strong", {}, [sc.docPct + "%"])]), rlBar(sc.docPct), h("span", { class: "rl-meter-sub" }, [num(sc.documented) + " / " + num(sc.total) + " columns"])]),
      h("div", { class: "rl-meter" }, [h("div", { class: "rl-gauge-top" }, [h("span", {}, ["Domo AI Readiness synced"]), h("strong", {}, [sc.domoPct + "%"])]), rlBar(sc.domoPct, "domo"), h("span", { class: "rl-meter-sub" }, [num(sc.synced) + " / " + num(sc.total) + " synced into Domo"])])
    ]);

    // Dataset controls.
    var syncAll = h("button", { class: "mini-btn primary" }, ["Sync all prepared"]);
    syncAll.addEventListener("click", function () { syncAllPrepared(t); });
    var wipeAll = h("button", { class: "mini-btn ghost" }, ["Wipe all from Domo"]);
    wipeAll.addEventListener("click", function () { wipeAllFromDomo(t); });
    var controls = h("div", { class: "rl-controls" }, [h("span", { class: "rl-controls-lab" }, ["Dataset controls"]), syncAll, wipeAll]);

    var table = h("table", { class: "result-table rl-table" });
    var thead = h("thead"), htr = h("tr");
    ["Column", "Snowflake Horizon", "Domo AI Readiness", "Source context", "Sync / Wipe / Inspect"].forEach(function (c) { htr.appendChild(h("th", {}, [c])); });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = h("tbody");
    sc.cols.forEach(function (c) {
      var domo = rlDomo(t.name, c);
      var prepared = c.comment && String(c.comment).trim();
      var syncBtn = h("button", { class: "rl-a sync" + (domo === "Synced" ? " is-done" : ""), disabled: (domo === "Synced" || !prepared) ? "true" : null }, [domo === "Synced" ? "Synced" : "Sync"]);
      if (domo !== "Synced" && prepared) syncBtn.addEventListener("click", function () { state.governance.synced[rlKey(t.name, c.name)] = true; renderView(); });
      var wipeBtn = h("button", { class: "rl-a wipe", disabled: domo !== "Synced" ? "true" : null }, ["Wipe"]);
      if (domo === "Synced") wipeBtn.addEventListener("click", function () { state.governance.synced[rlKey(t.name, c.name)] = false; (state.governance.wiped = state.governance.wiped || {})[t.name + "." + c.name] = true; renderView(); });
      var inspectBtn = h("button", { class: "rl-a inspect" }, ["Inspect"]);
      inspectBtn.addEventListener("click", function () { window.open(snowsightObjHref("semantic-view", "REVENUE_CC_ANALYST"), "_blank"); });

      var ctx = h("div", { class: "rl-ctx-cell" }, [
        h("span", { class: "rl-ctx-txt" }, [c.comment || "\u2014"]),
        (c.synonyms && c.synonyms.length) ? h("span", { class: "rl-syn" }, [num(c.synonyms.length) + " synonym" + (c.synonyms.length > 1 ? "s" : "")]) : null
      ]);

      tb.appendChild(h("tr", {}, [
        h("td", {}, [h("code", { class: "rl-col" }, [c.name]), h("span", { class: "rl-kind" }, [String(c.dataType || "").replace(/\(16777216\)/, "") + " \u00b7 " + c.kind])]),
        h("td", {}, [h("span", { class: "rl-chip " + (prepared ? "prep" : "noprep") }, [h("span", { class: "rl-dot" }), prepared ? "Prepared" : "Not prepared"])]),
        h("td", {}, [h("span", { class: "rl-chip " + (domo === "Synced" ? "synced" : "notsynced") }, [h("span", { class: "rl-dot" }), domo === "Synced" ? "Synced" : "Not synced"])]),
        h("td", { class: "rl-comment" }, [ctx]),
        h("td", { class: "rl-act" }, [h("div", { class: "rl-acts" }, [syncBtn, wipeBtn, inspectBtn])])
      ]));
    });
    table.appendChild(tb);
    return h("div", { class: "rl-detail" }, [
      h("div", { class: "rl-detail-head" }, [
        h("div", {}, [h("span", { class: "rl-sel-lab" }, ["Selected dataset"]), h("h3", {}, [t.name]), h("code", { class: "rl-base" }, [t.base])]),
        links
      ]),
      meters,
      controls,
      h("div", { class: "table-wrap" }, [table])
    ]);
  }

  function readinessControlPlane() {
    var model = state.semantic.model;
    if (!model || !model.tables || !model.tables.length) {
      if (!state.semantic.loaded && !state.semantic.loading) loadSemantic();
      return h("article", { class: "panel col-12" }, [h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Profiling the semantic model for AI readiness\u2026"])]);
    }
    if (!state.governance.preseeded) { preseedReadiness(model); state.governance.preseeded = true; }
    var totalCols = 0, docCols = 0, syncedCols = 0;
    (model.tables || []).forEach(function (t) { var s = rlScore(t); totalCols += s.total; docCols += s.documented; syncedCols += s.synced; });
    var overallDoc = totalCols ? Math.round((docCols / totalCols) * 100) : 0;
    var overallDomo = totalCols ? Math.round((syncedCols / totalCols) * 100) : 0;
    return h("article", { class: "panel col-12 rl-plane" }, [
      h("div", { class: "panel-head rl-plane-head" }, [h("div", {}, [
        h("span", { class: "rl-eyebrow" }, [h("img", { class: "eyebrow-mark", src: "./public/brand/snowflake-mark.svg", alt: "" }), "SNOWFLAKE HORIZON \u00b7 SOURCE OF TRUTH"]),
        h("h2", {}, ["AI Readiness Control Plane"]),
        h("p", {}, ["Horizon is the governed source of truth. Sync prepared column metadata into ",
          srcLink("Domo AI Readiness", domoAiReadinessHref(LINEAGE_VIEWS[0].dataSetId), "domo"),
          " \u2014 Domo mirrors the source. Editing source context is a separate, governed action."])
      ]),
      h("div", { class: "rl-plane-meters" }, [
        h("div", { class: "rl-pm" }, [h("div", { class: "rl-pm-top" }, [h("span", {}, ["Snowflake Horizon prepared"]), h("strong", {}, [overallDoc + "%"])]), rlBar(overallDoc), h("span", { class: "rl-pm-sub" }, [num(docCols) + " / " + num(totalCols) + " columns"])]),
        h("div", { class: "rl-pm" }, [h("div", { class: "rl-pm-top" }, [h("span", {}, ["Domo AI Readiness synced"]), h("strong", {}, [overallDomo + "%"])]), rlBar(overallDomo, "domo"), h("span", { class: "rl-pm-sub" }, [num(syncedCols) + " / " + num(totalCols) + " columns synced into Domo"])])
      ])]),
      h("div", { class: "rl-summary-strip" }, [
        h("span", {}, [h("strong", {}, [num((model.tables || []).length)]), " governed datasets"]),
        h("span", { class: "dot-sep" }, ["\u00b7"]),
        h("span", {}, [h("strong", {}, [num(totalCols)]), " columns profiled"]),
        h("span", { class: "dot-sep" }, ["\u00b7"]),
        h("span", {}, [state.semantic.live ? "Live \u00b7 semantic model " : "Sample \u00b7 semantic model "]),
        srcLink("REVENUE_CC_ANALYST", snowsightObjHref("semantic-view", "REVENUE_CC_ANALYST"), "sf")
      ]),
      h("div", { class: "rl-body" }, [
        h("div", { class: "rl-rail-wrap" }, [h("div", { class: "rl-rail-lab" }, ["Governed datasets"]), readinessRail(model)]),
        readinessDetail(model)
      ])
    ]);
  }

  function renderReadiness() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    if (!state.governance.loaded && !state.governance.loading) { loadGovernance(); }
    if (state.governance.loading && !state.governance.loaded) {
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Running the two-persona parity test at the query engine\u2026"]));
      return frag;
    }
    if (state.governance.error) {
      frag.appendChild(h("div", { class: "conn-banner" }, [h("div", {}, [h("span", { class: "cb-title" }, ["Governance error \u2014 "]), state.governance.error])]));
      return frag;
    }
    // Hero: the AI Readiness Control Plane (reference parity) — no preamble box.
    frag.appendChild(h("section", { class: "grid" }, [readinessControlPlane()]));

    // Everything else (parity test, masking, policies, guardrails, semantic
    // model) is governance depth — folded behind a toggle so the control plane
    // leads, matching the reference app.
    var open = !!state.governance.showDetail;
    var toggle = h("button", { class: "gov-detail-toggle" }, [
      h("span", { class: "gdt-ico" }, [open ? "\u2212" : "+"]),
      open ? "Hide governance detail" : "Show governance detail",
      h("span", { class: "gdt-sub" }, ["parity test \u00b7 masking \u00b7 policies \u00b7 guardrails"])
    ]);
    toggle.addEventListener("click", function () { state.governance.showDetail = !state.governance.showDetail; renderView(); });
    frag.appendChild(toggle);

    if (open) {
      frag.appendChild(govIdentityBanner());
      frag.appendChild(h("section", { class: "grid" }, [govParityPanel()]));
      frag.appendChild(h("section", { class: "grid" }, [govMaskingPanel(), govPolicyPanel()]));
      frag.appendChild(h("section", { class: "grid" }, [govGuardPanel()]));
      frag.appendChild(h("section", { class: "grid" }, [govReadinessPanel()]));
    }
    return frag;
  }

  // Full-width labeled section divider used to fold multiple surfaces into one tab.
  function sectionDivider(title, sub, mark, link) {
    return h("div", { class: "sec-divider" }, [
      h("div", { class: "sec-divider-l" }, [
        mark ? h("img", { class: "sec-mark", src: "./public/brand/" + mark, alt: "" }) : null,
        h("div", {}, [h("h2", {}, [title]), sub ? h("p", {}, [sub]) : null])
      ]),
      link || null
    ]);
  }

  /* ------------- MCP fabric + CoWork (Sprint 8) / How It Works + CoCo (Sprint 9) ------------- */

  // Generic status chip: maps a status string to a visual weight.
  function statChip(status) {
    var s = String(status || "").toLowerCase();
    var cls = "todo";
    if (/live|enabled|ga\b/.test(s)) cls = "on";
    else if (/available/.test(s)) cls = "avail";
    else if (/beta|target|gated|follow/.test(s)) cls = "beta";
    return h("span", { class: "stat-chip " + cls }, [status || "\u2014"]);
  }

  function gatedBanner(text) {
    return h("div", { class: "gated-banner" }, [
      h("span", { class: "gb-tag" }, ["Gated"]),
      h("span", {}, [text])
    ]);
  }

  function loadCoWork() {
    state.cowork.loading = true; renderView();
    Promise.all([
      fetch("./public/mock/mcp.json").then(function (r) { return r.json(); }).catch(function () { return null; }),
      fetch("./public/mock/cowork.json").then(function (r) { return r.json(); }).catch(function () { return null; })
    ]).then(function (res) {
      state.cowork.mcp = res[0]; state.cowork.cowork = res[1];
      state.cowork.loading = false; state.cowork.loaded = true; renderView();
    });
  }

  function coworkLaunchpad() {
    var c = state.cowork.cowork || {};
    var body = h("div", { class: "cw-launch-body" }, [
      h("div", {}, [
        h("span", { class: "cw-eyebrow" }, [h("img", { class: "eyebrow-mark", src: "./public/brand/snowflake-cortex.svg", alt: "" }), "Snowflake Intelligence \u00b7 CoWork agent \u2014 embedded"]),
        h("h2", {}, [c.experience || "Snowflake Intelligence / CoWork"]),
        h("p", { class: "cw-lead" }, ["The ", h("code", {}, [c.agent || "REVENUE_CC_AGENT"]), " conversation, embedded in Domo through the ", h("strong", {}, ["snowflakece"]), " Code Engine bridge (key-pair JWT \u2192 Cortex Agents REST API). Same governed agent, same Horizon policies \u2014 delivered in the flow of work, with a one-click launch into the native Snowflake Intelligence surface."])
      ]),
      h("div", { class: "cw-launch-side" }, [statChip(c.status || "Available"), srcLink("Open in CoWork", coworkHomeHref(), "sf")])
    ]);
    var meta = h("div", { class: "cw-meta" }, [
      c.scoping ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Governance"]), h("span", {}, [c.scoping])]) : null,
      c.sso ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Identity / SSO"]), h("span", {}, [c.sso])]) : null,
      h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Embed pattern"]), h("span", {}, ["Snowflake Intelligence is not cross-domain iframe-embeddable; the supported path is a middleware proxy to ", h("code", {}, ["/api/v2/\u2026/agents/{agent}:run"]), " \u2014 here fulfilled by Code Engine."])])
    ]);
    return h("article", { class: "panel col-12 cw-launch" }, [body, meta]);
  }

  function coworkDeepResearch() {
    var dr = (state.cowork.cowork && state.cowork.cowork.deepResearch) || null;
    if (!dr) return null;
    var arts = h("div", { class: "dr-arts" });
    (dr.artifacts || []).forEach(function (a) {
      arts.appendChild(h("div", { class: "dr-art" }, [
        h("div", { class: "dr-art-top" }, [h("span", { class: "dr-title" }, [a.title]), h("span", { class: "src-chip" }, [a.source || "source"])]),
        h("p", { class: "dr-cite" }, [a.citation || ""])
      ]));
    });
    var skills = (state.cowork.cowork && state.cowork.cowork.skills) || [];
    var skillChips = h("div", { class: "cw-skills" });
    skills.forEach(function (sk) { skillChips.appendChild(h("span", { class: "skill-chip", title: sk.description || "" }, [sk.name])); });
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Deep Research \u00b7 cited"]), h("p", {}, [dr.question || ""])])]),
      arts,
      skills.length ? h("div", { class: "cw-skills-wrap" }, [h("span", { class: "gi-lab" }, ["Skills"]), skillChips]) : null
    ]);
  }

  function mcpToolRow(t) {
    return h("tr", {}, [
      h("td", {}, [h("code", {}, [t.name])]),
      h("td", {}, [h("span", { class: "mcp-type" }, [t.type])]),
      h("td", {}, [h("code", { class: "mcp-target" }, [t.target || "\u2014"])]),
      h("td", {}, [t.description || ""])
    ]);
  }

  function mcpManagedPanel() {
    var m = (state.cowork.mcp && state.cowork.mcp.managed) || {};
    var tools = m.tools || [];
    var table = h("table", { class: "result-table" });
    var thead = h("thead"), htr = h("tr");
    ["Tool", "Type", "Target", "Description"].forEach(function (c) { htr.appendChild(h("th", {}, [c])); });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = h("tbody"); tools.forEach(function (t) { tb.appendChild(mcpToolRow(t)); }); table.appendChild(tb);

    var sc = m.sampleCall || {};
    var executed = !!sc.executed;
    var callBlock = h("div", { class: "mcp-call" }, [
      h("div", { class: "mcp-call-head" }, [
        h("span", { class: "gi-lab" }, ["External MCP client call"]),
        h("span", { class: "call-badge " + (executed ? "on" : "beta") }, [executed ? "executed live" : "contract captured"])
      ]),
      sc.client ? h("p", { class: "mcp-client" }, ["Client: ", h("code", {}, [sc.client])]) : null,
      h("pre", { class: "mcp-json" }, [JSON.stringify({ request: sc.request || {}, response: sc.response || {} }, null, 2)])
    ]);

    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Snowflake-managed MCP \u2014 outward"]), h("p", {}, ["One managed server exposes the governed tools to any MCP client"])]), statChip(m.status || "Available")]),
      h("div", { class: "mcp-meta" }, [
        m.server ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Server"]), h("code", {}, [m.server])]) : null,
        m.endpoint ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Endpoint"]), h("code", {}, [m.endpoint])]) : null,
        m.auth ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Auth"]), h("span", {}, [m.auth])]) : null
      ]),
      h("div", { class: "table-wrap" }, [table]),
      callBlock
    ]);
  }

  function mcpDomoPanel() {
    var d = (state.cowork.mcp && state.cowork.mcp.domoEssentials) || {};
    var tools = h("div", { class: "dm-tools" });
    (d.tools || []).forEach(function (t) {
      tools.appendChild(h("div", { class: "dm-tool" }, [h("span", { class: "dm-name" }, [t.name]), h("span", { class: "dm-desc" }, [t.description || ""])]));
    });
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Domo Essentials MCP \u2014 outward"]), h("p", {}, ["Domo data + workflow tools exposed to Snowflake / external clients"])]), statChip(d.status || "Beta follow-on (gated)")]),
      gatedBanner(d.note || "Requires Domo Essentials MCP beta access in the target instance (gate G1). Built or enabled there \u2014 not simulated here."),
      tools
    ]);
  }

  function renderCoWork() {
    var frag = document.createDocumentFragment();
    if (!state.cowork.loaded && !state.cowork.loading) { loadCoWork(); }
    if (!state.agent.seed && !state.agent.loading) {
      loadAgentSeed().then(function () { if (state.surface === "cowork") renderView(); });
    }
    if (isLive() && !state.cw.serverLoaded && !state.cw.serverLoading) { cwLoadServerThreads(true); }
    cwLoadUser();
    frag.appendChild(cwConsole());
    frag.appendChild(cwWiring());
    return frag;
  }

  /* ============================ Cortex Workspace ============================
   * A faithful reproduction of the native Snowflake Intelligence / CoWork chat:
   * left thread rail, agent header, streamed answer with a status line, tool
   * chips, result cards, and numbered citations. Behavior is driven by the real
   * agent output through the snowflakece bridge (askCortexAgent); the status
   * line + typewriter reproduce CoWork's streaming feel over the consolidated
   * response. Clearly a Domo surface, with an "Open in CoWork" affordance for
   * the native experience. */
  function coworkHomeHref() { return "https://ai.snowflake.com/domoinc/domopartner/#/ai"; }

  function cwActiveThread() {
    var st = state.cw;
    if (!st.activeId || !st.threads.some(function (t) { return t.id === st.activeId; })) {
      if (!st.threads.length) cwNewThread(true);
      else st.activeId = st.threads[0].id;
    }
    return st.threads.filter(function (t) { return t.id === st.activeId; })[0];
  }
  function cwNewThread(silent) {
    var t = { id: "t" + (cwSeq++), title: "New chat", messages: [], serverThreadId: null, parentMessageId: 0 };
    state.cw.threads.unshift(t);
    state.cw.activeId = t.id;
    if (!silent) { state.cw.draft = ""; state.cw.replay = null; renderView(); }
    return t;
  }
  function cwScrollBottom() {
    var s = el("cwStream"); if (s) s.scrollTop = s.scrollHeight;
  }

  // Normalize toolsFired (object of booleans, or array of tool names) into a map.
  function cwTools(res) {
    var out = { analyst: false, search: false, score: false, propose: false, chart: false };
    var tf = res && res.toolsFired;
    if (Array.isArray(tf)) {
      tf.forEach(function (n) {
        var k = String(n || "").toLowerCase();
        if (k.indexOf("analyst") > -1 || k.indexOf("text_to_sql") > -1) out.analyst = true;
        else if (k.indexOf("search") > -1) out.search = true;
        else if (k.indexOf("score") > -1) out.score = true;
        else if (k.indexOf("propose") > -1) out.propose = true;
        else if (k.indexOf("chart") > -1) out.chart = true;
      });
    } else if (tf && typeof tf === "object") {
      out.analyst = !!tf.analyst; out.search = !!tf.search;
      out.score = !!(tf.score || tf.scoreRenewalRisk);
      out.propose = !!(tf.propose || tf.proposeRetentionAction);
      out.chart = !!(tf.chart || tf.dataToChart);
    }
    if (res && res.sql) out.analyst = true;
    if (res && (res.citations || []).length) out.search = true;
    return out;
  }
  var CW_TOOL_META = {
    analyst: { name: "Analyst", type: "cortex_analyst_text_to_sql", label: "Analyst \u00b7 text\u2192SQL" },
    search: { name: "Search", type: "cortex_search", label: "Search \u00b7 grounding" },
    score: { name: "Score_Renewal_Risk", type: "generic", label: "Score_Renewal_Risk" },
    propose: { name: "Propose_Retention_Action", type: "generic", label: "Propose_Retention_Action" },
    chart: { name: "data_to_chart", type: "data_to_chart", label: "data_to_chart" }
  };
  function cwStatusSteps(res) {
    var t = cwTools(res);
    var steps = ["Reviewed conversation context"];
    if (t.analyst) steps.push("Queried the governed semantic view \u2014 Analyst");
    if (t.search) steps.push("Searched incidents & playbooks \u2014 Search");
    if (t.score) steps.push("Scored renewal risk \u2014 Score_Renewal_Risk");
    if (t.propose) steps.push("Staged a governed proposal \u2014 Propose_Retention_Action");
    if (t.chart) steps.push("Built a chart \u2014 data_to_chart");
    if (res && res.metrics) steps.push("Assembled the result set");
    steps.push("Composed the answer");
    return steps;
  }

  // Live agent call, threaded so the conversation persists as a Cortex thread
  // (origin_application='revenue_cc') that shows up in the recent-chats rail.
  function cwFetchAgent(question, thread) {
    if (!isLive()) return sampleAgent(question);
    var ensureThread = (thread && thread.serverThreadId)
      ? Promise.resolve(thread.serverThreadId)
      : domo.post(CE + "createCortexThread", { title: question.slice(0, 80) })
          .then(function (r) { var d = unwrap(r); return (d && d.status === "SUCCEEDED") ? d.threadId : 0; })
          .catch(function () { return 0; });
    return ensureThread.then(function (tid) {
      if (thread && tid) thread.serverThreadId = tid;
      return domo.post(CE + "askCortexAgent", { question: question, persona: state.persona, threadId: tid || 0, parentMessageId: (thread && thread.parentMessageId) || 0 })
        .then(function (resp) {
          var d = unwrap(resp);
          if (d && d.status === "SUCCEEDED") {
            if (thread) { if (d.threadId) thread.serverThreadId = d.threadId; if (d.messageId) thread.parentMessageId = d.messageId; }
            cwLoadServerThreads(true);
            return { live: true, question: d.question || question, answer: d.answer, metrics: d.metrics || null,
              sql: d.sql, searchQuery: d.searchQuery, citations: d.citations || [], toolsFired: d.toolsFired || {},
              api: d.api, elapsedMs: d.elapsedMs, requestId: d.requestId, agent: d.agent, mode: d.mode };
          }
          throw new Error(d && d.error ? d.error : "Agent call failed");
        });
    }).catch(function (err) { console.warn("[cw] live agent failed, using sample seed:", err); return sampleAgent(question); });
  }

  // List the app's persisted Cortex threads for the recent-chats rail.
  function cwLoadServerThreads(silent) {
    if (!isLive()) { state.cw.serverLoaded = true; return; }
    if (state.cw.serverLoading) return;
    state.cw.serverLoading = true;
    domo.post(CE + "listCortexThreads", {}).then(function (r) {
      var d = unwrap(r);
      state.cw.serverThreads = (d && d.status === "SUCCEEDED" && d.threads) ? d.threads : [];
      state.cw.serverLoaded = true; state.cw.serverLoading = false;
      if (state.surface === "cowork") renderView();
    }).catch(function () { state.cw.serverLoading = false; state.cw.serverLoaded = true; });
  }
  // Replay a persisted thread (read-only) from getCortexThread.
  function cwOpenServerThread(threadId, title) {
    state.cw.replay = { threadId: threadId, title: title || "", loading: true, messages: [] };
    renderView();
    domo.post(CE + "getCortexThread", { threadId: threadId }).then(function (r) {
      var d = unwrap(r);
      if (d && d.status === "SUCCEEDED") state.cw.replay = { threadId: threadId, title: d.title || title || "", loading: false, messages: d.messages || [] };
      else state.cw.replay = { threadId: threadId, title: title || "", loading: false, error: (d && d.error) || "Could not load thread", messages: [] };
      renderView();
    }).catch(function (err) { state.cw.replay = { threadId: threadId, title: title || "", loading: false, error: String((err && err.message) || err), messages: [] }; renderView(); });
  }
  function cwCloseReplay() { state.cw.replay = null; renderView(); }
  function cwRelTime(ms) {
    var n = Number(ms) || 0; if (!n) return "";
    var mins = Math.floor((Date.now() - n) / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return mins + "m ago";
    var hrs = Math.floor(mins / 60); if (hrs < 24) return hrs + "h ago";
    var days = Math.floor(hrs / 24); if (days < 7) return days + "d ago";
    return new Date(n).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function cwAsk(q) {
    q = String(q || "").trim();
    if (!q || state.cw.sending) return;
    if (state.cw.replay) state.cw.replay = null;
    var t = cwActiveThread();
    if (!t.messages.length) t.title = q.length > 46 ? q.slice(0, 46) + "\u2026" : q;
    t.messages.push({ id: "u" + (cwSeq++), role: "user", text: q });
    var amsg = { id: "a" + (cwSeq++), role: "assistant", status: "thinking", text: "", typed: "", steps: [], stepShown: 0, res: null, thinking: !!state.cw.thinking };
    t.messages.push(amsg);
    state.cw.sending = true; state.cw.draft = "";
    renderView(); cwScrollBottom();
    cwFetchAgent(q, t).then(function (res) {
      amsg.res = res; amsg.text = res.answer || "\u2014"; amsg.steps = cwStatusSteps(res); amsg.status = "answering";
      renderView();
      requestAnimationFrame(function () { cwAnimate(amsg); });
    }).catch(function (err) {
      amsg.status = "error"; amsg.text = "Agent error \u2014 " + (err && err.message ? err.message : err);
      state.cw.sending = false; renderView(); cwScrollBottom();
    });
  }

  // Reveal status steps in sequence, then typewriter the answer, then re-render
  // the completed message (tool chips, result cards, citations) in one pass.
  function cwAnimate(amsg) {
    var host = el("cwmsg-" + amsg.id);
    if (!host) { amsg.status = "done"; amsg.typed = amsg.text; state.cw.sending = false; renderView(); return; }
    var stepEls = host.querySelectorAll(".cw-step");
    var i = 0;
    function revealStep() {
      if (i < amsg.steps.length) {
        amsg.stepShown = i + 1;
        if (stepEls[i]) stepEls[i].classList.add("show");
        cwScrollBottom(); i++;
        setTimeout(revealStep, 240);
      } else { showAnswer(); }
    }
    function showAnswer() {
      // Render the answer as formatted markdown with a staggered block fade
      // (mirrors CoWork's progressive, richly-formatted answer reveal).
      var ansEl = host.querySelector(".cw-answer");
      if (ansEl) { ansEl.innerHTML = ""; ansEl.appendChild(cwMarkdown(amsg.text, true)); }
      cwScrollBottom();
      var blocks = ansEl ? ansEl.querySelectorAll(".cw-blk").length : 1;
      var dur = Math.min(1100, 320 + blocks * 140);
      setTimeout(function () { amsg.status = "done"; amsg.typed = amsg.text; state.cw.sending = false; renderView(); cwScrollBottom(); cwFocusComposer(); }, dur);
    }
    revealStep();
  }

  /* Minimal, safe markdown -> DOM for agent answers (bold, italics, inline code,
   * bullet/numbered lists, headings, paragraphs) so replies read like the native
   * CoWork formatting. Built via DOM nodes (no innerHTML) to avoid injection. */
  function cwInline(str) {
    var out = [];
    var re = /(\*\*([^*]+)\*\*|__([^_]+)__|`([^`]+)`|\*([^*]+)\*|(?:_)([^_]+)_)/g;
    var last = 0, m;
    while ((m = re.exec(str))) {
      if (m.index > last) out.push(document.createTextNode(str.slice(last, m.index)));
      if (m[2] != null) out.push(h("strong", {}, [m[2]]));
      else if (m[3] != null) out.push(h("strong", {}, [m[3]]));
      else if (m[4] != null) out.push(h("code", {}, [m[4]]));
      else if (m[5] != null) out.push(h("em", {}, [m[5]]));
      else if (m[6] != null) out.push(h("em", {}, [m[6]]));
      last = m.index + m[0].length;
    }
    if (last < str.length) out.push(document.createTextNode(str.slice(last)));
    return out;
  }
  function cwMarkdown(text, animate) {
    var wrap = h("div", { class: "cw-md" });
    var blocks = String(text == null ? "" : text).trim().split(/\n{2,}/);
    var idx = 0;
    blocks.forEach(function (blk) {
      if (!blk.trim()) return;
      var lines = blk.split("\n");
      var isUl = lines.length > 0 && lines.every(function (l) { return /^\s*[-*]\s+/.test(l); });
      var isOl = lines.length > 0 && lines.every(function (l) { return /^\s*\d+[.)]\s+/.test(l); });
      var node;
      if (isUl || isOl) {
        node = h(isUl ? "ul" : "ol", { class: "cw-md-list" });
        lines.forEach(function (l) { node.appendChild(h("li", {}, cwInline(l.replace(/^\s*(?:[-*]|\d+[.)])\s+/, "")))); });
      } else if (/^#{1,4}\s+/.test(lines[0]) && lines.length === 1) {
        var lvl = lines[0].match(/^#+/)[0].length;
        node = h("h" + Math.min(4, lvl + 2), { class: "cw-md-h" }, cwInline(lines[0].replace(/^#+\s+/, "")));
      } else {
        node = h("p", { class: "cw-md-p" });
        lines.forEach(function (l, li) { if (li) node.appendChild(h("br")); cwInline(l).forEach(function (n) { node.appendChild(n); }); });
      }
      if (animate) { node.classList.add("cw-blk"); node.style.animationDelay = Math.min(idx * 90, 720) + "ms"; idx++; }
      wrap.appendChild(node);
    });
    if (!wrap.childNodes.length) wrap.appendChild(h("p", { class: "cw-md-p" }, [String(text || "\u2014")]));
    return wrap;
  }
  function cwFocusComposer() {
    if (state.surface !== "cowork") return;
    var ta = el("cwInput"); if (ta) { try { ta.focus(); } catch (e) {} }
  }

  /* ------------------------------- console ------------------------------- */
  function cwConsole() {
    var shell = h("div", { class: "cw-shell" + (state.mode === "sample" ? " sample" : "") });
    shell.appendChild(cwThreadRail());
    shell.appendChild(cwMain());
    return shell;
  }

  function cwThreadRail() {
    var st = state.cw;
    var rail = h("div", { class: "cw-threads" });
    var newBtn = h("button", { class: "cw-new" }, [
      h("span", { class: "cw-new-ico", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'><path d='M12 5v14M5 12h14'/></svg>" }),
      h("span", {}, ["New chat"])
    ]);
    newBtn.addEventListener("click", function () { cwNewThread(); });
    rail.appendChild(h("div", { class: "cw-threads-head" }, [
      h("span", { class: "cw-threads-lab" }, ["Threads"]), newBtn
    ]));
    var list = h("div", { class: "cw-thread-list" });
    if (!st.threads.length) cwNewThread(true);
    var bubble = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><path d='M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z'/></svg>";

    // Current session threads (in-memory; also persisted server-side once asked).
    st.threads.forEach(function (t) {
      var active = !st.replay && t.id === st.activeId;
      var last = t.messages.length ? (t.messages.length + " message" + (t.messages.length === 1 ? "" : "s")) : "Empty";
      var item = h("button", { class: "cw-thread" + (active ? " active" : "") }, [
        h("span", { class: "cw-thread-ico", html: bubble }),
        h("span", { class: "cw-thread-meta" }, [h("span", { class: "cw-thread-title" }, [t.title || "New chat"]), h("span", { class: "cw-thread-sub" }, [last])])
      ]);
      item.addEventListener("click", function () { st.replay = null; st.activeId = t.id; renderView(); });
      list.appendChild(item);
    });

    // Recent chats persisted in Snowflake (Cortex Threads API), replayable.
    var recent = st.serverThreads || [];
    if (recent.length) {
      list.appendChild(h("div", { class: "cw-thread-group" }, ["Recent \u00b7 Snowflake"]));
      recent.slice(0, 20).forEach(function (rt) {
        var active = st.replay && String(st.replay.threadId) === String(rt.threadId);
        var item = h("button", { class: "cw-thread" + (active ? " active" : "") }, [
          h("span", { class: "cw-thread-ico", html: bubble }),
          h("span", { class: "cw-thread-meta" }, [
            h("span", { class: "cw-thread-title" }, [rt.title || "Untitled chat"]),
            h("span", { class: "cw-thread-sub" }, [cwRelTime(rt.updatedOn)])
          ])
        ]);
        item.addEventListener("click", function () { cwOpenServerThread(rt.threadId, rt.title); });
        list.appendChild(item);
      });
    } else if (isLive() && st.serverLoaded) {
      list.appendChild(h("div", { class: "cw-thread-empty" }, ["Chats you start here are saved to Snowflake and appear as recent threads."]));
    }
    rail.appendChild(list);
    rail.appendChild(h("div", { class: "cw-threads-foot" }, [
      h("span", { class: "cw-env-dot" }), "Governed by Horizon \u00b7 ", h("code", {}, ["REVENUE_CC_READER"])
    ]));
    return rail;
  }

  function cwGreeting() {
    var hh = new Date().getHours();
    return hh < 12 ? "Good morning" : hh < 18 ? "Good afternoon" : "Good evening";
  }
  // First name only, from a full/display name in any common shape.
  function cwFirstName(raw) {
    var n = String(raw == null ? "" : raw).trim();
    if (!n) return "";
    if (n.indexOf(",") > -1) { // "Hilton, Cassidy"
      var after = n.split(",")[1];
      n = (after && after.trim()) ? after.trim() : n.split(",")[0].trim();
    }
    return n.split(/[\s+._-]+/)[0]; // handles "Cassidy Hilton" / "Cassidy+Hilton" / "cassidy.hilton"
  }
  // Auto-populate the greeting name from the Domo App Framework User API
  // (GET /domo/users/v1/me). Cached; re-renders when resolved.
  function cwLoadUser() {
    var st = state.cw;
    if (st.userLoaded || st.userLoading) return;
    st.userLoading = true;
    var done = function (raw) {
      st.userName = cwFirstName(raw); st.userLoaded = true; st.userLoading = false;
      if (state.surface === "cowork") renderView();
    };
    try {
      if (typeof domo !== "undefined" && typeof domo.get === "function") {
        domo.get("/domo/users/v1/me").then(function (u) {
          u = Array.isArray(u) ? (u[0] || {}) : (u || {});
          done(u.displayName || u.name || u.fullName || u.firstName || "");
        }).catch(function () {
          try { done((domo.env && (domo.env.userName || domo.env.fullName)) || ""); }
          catch (e) { done(""); }
        });
        return;
      }
    } catch (e) {}
    done("");
  }
  var CW_BUBBLE_ICO = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'><path d='M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z'/></svg>";

  function cwMain() {
    var main = h("div", { class: "cw-main" });

    // Slim header: attribution + open-in-CoWork (the agent name lives in the
    // composer pill, matching native CoWork).
    main.appendChild(h("div", { class: "cw-head" }, [
      h("div", { class: "cw-head-l" }, [
        state.mode === "live" ? h("span", { class: "cw-live" }, [h("span", { class: "cw-live-dot" }), "Live agent"]) : h("span", { class: "cw-seed" }, [h("span", { class: "cw-live-dot seed" }), "Sample run"]),
        h("span", { class: "cw-head-native" }, ["Snowflake Intelligence \u00b7 CoWork"])
      ]),
      srcLink("Open in CoWork", coworkHomeHref(), "sf")
    ]));

    if (state.cw.replay) { main.appendChild(cwReplay()); return main; }

    var t = cwActiveThread();
    if (!t.messages.length) {
      // Home / empty state: greeting \u2192 composer \u2192 suggested questions (CoWork parity).
      main.appendChild(cwHome());
    } else {
      var stream = h("div", { class: "cw-stream", id: "cwStream" });
      t.messages.forEach(function (m) { stream.appendChild(cwRenderMessage(m)); });
      main.appendChild(stream);
      main.appendChild(cwComposer());
    }
    return main;
  }

  // Read-only replay of a persisted Cortex thread (recent-chats rail).
  function cwReplay() {
    var rp = state.cw.replay || {};
    var wrap = h("div", { class: "cw-replay" });
    var back = h("button", { class: "cw-replay-back" }, [h("span", {}, ["\u2190"]), " Back to chat"]);
    back.addEventListener("click", function () { cwCloseReplay(); });
    wrap.appendChild(h("div", { class: "cw-replay-head" }, [
      h("div", {}, [back, h("div", { class: "cw-replay-title" }, [rp.title || "Untitled chat"])]),
      h("span", { class: "cw-replay-tag" }, ["Saved thread \u00b7 Snowflake"])
    ]));
    var stream = h("div", { class: "cw-stream" });
    if (rp.loading) {
      stream.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Loading the saved conversation from Snowflake\u2026"]));
    } else if (rp.error) {
      stream.appendChild(h("div", { class: "cw-error" }, [rp.error]));
    } else if (!(rp.messages || []).length) {
      stream.appendChild(h("p", { class: "cw-hero-note" }, ["No messages in this thread."]));
    } else {
      rp.messages.forEach(function (m) {
        if (m.role === "user") { stream.appendChild(h("div", { class: "cw-msg user" }, [h("div", { class: "cw-bubble" }, [m.text || ""])])); return; }
        var body = h("div", { class: "cw-msg-body" }, [h("div", { class: "cw-answer" }, [cwMarkdown(m.text || "\u2014")])]);
        if (m.sql) {
          var pre = h("pre", { class: "cw-sql-block" }, [h("code", {}, [fmtSql(m.sql)])]); pre.style.display = "none";
          var tog = h("button", { class: "cw-sql-toggle" }, [h("span", { class: "cw-sql-caret" }, ["\u25b8"]), "View generated SQL"]);
          tog.addEventListener("click", function () { var open = pre.style.display === "none"; pre.style.display = open ? "block" : "none"; tog.querySelector(".cw-sql-caret").textContent = open ? "\u25be" : "\u25b8"; });
          body.appendChild(h("div", { class: "cw-sql" }, [tog, pre]));
        }
        stream.appendChild(h("div", { class: "cw-msg assistant" }, [h("span", { class: "cw-msg-avatar" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" })]), body]));
      });
    }
    wrap.appendChild(stream);
    var reopen = h("button", { class: "cw-replay-continue" }, ["Start a new chat \u2192"]);
    reopen.addEventListener("click", function () { cwCloseReplay(); cwNewThread(); });
    wrap.appendChild(h("div", { class: "cw-replay-foot" }, [
      h("span", {}, ["Read-only replay via ", h("code", {}, ["GET /api/v2/cortex/threads/{id}"])]),
      reopen
    ]));
    return wrap;
  }

  function cwHome() {
    var name = state.cw.userName || "";
    var home = h("div", { class: "cw-home" });
    home.appendChild(h("div", { class: "cw-greet" }, [
      h("div", { class: "cw-greet-1" }, [cwGreeting() + (name ? ", " + name : "")]),
      h("div", { class: "cw-greet-2" }, ["What insights can I help with?"])
    ]));
    home.appendChild(cwComposer());
    var chips = h("div", { class: "cw-starters" });
    CW_STARTERS.forEach(function (s) {
      var row = h("button", { class: "cw-starter" }, [
        h("span", { class: "cw-starter-ico", html: CW_BUBBLE_ICO }),
        h("span", {}, [s])
      ]);
      row.addEventListener("click", function () { cwAsk(s); });
      chips.appendChild(row);
    });
    home.appendChild(chips);
    return home;
  }

  function cwRenderMessage(m) {
    if (m.role === "user") {
      return h("div", { class: "cw-msg user", id: "cwmsg-" + m.id }, [h("div", { class: "cw-bubble" }, [m.text])]);
    }
    var wrap = h("div", { class: "cw-msg assistant", id: "cwmsg-" + m.id });
    wrap.appendChild(h("span", { class: "cw-msg-avatar" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" })]));
    var body = h("div", { class: "cw-msg-body" });

    if (m.status === "thinking") {
      body.appendChild(h("div", { class: "cw-thinking" }, [
        h("span", { class: "cw-dots" }, [h("span", {}), h("span", {}), h("span", {})]),
        m.thinking ? "Extended thinking \u2014 reasoning over the governed model\u2026" : "Reasoning over the governed model\u2026"
      ]));
      wrap.appendChild(body);
      return wrap;
    }
    if (m.status === "error") {
      body.appendChild(h("div", { class: "cw-error" }, [m.text]));
      wrap.appendChild(body);
      return wrap;
    }

    var res = m.res || {};
    var tools = cwTools(res);
    var done = m.status === "done";

    // Status line — steps (revealed sequentially during "answering").
    var status = h("div", { class: "cw-status" });
    m.steps.forEach(function (s, idx) {
      var shown = done || idx < m.stepShown;
      status.appendChild(h("div", { class: "cw-step" + (shown ? " show" : "") }, [
        h("span", { class: "cw-step-check", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6L9 17l-5-5'/></svg>" }),
        h("span", {}, [s])
      ]));
    });
    body.appendChild(status);

    // Tool chips.
    if (done) {
      var firedKeys = Object.keys(CW_TOOL_META).filter(function (k) { return tools[k]; });
      if (firedKeys.length) {
        var chipRow = h("div", { class: "cw-toolchips" });
        firedKeys.forEach(function (k) {
          var meta = CW_TOOL_META[k];
          chipRow.appendChild(h("span", { class: "cw-toolchip" + (k === "propose" ? " gov" : "") }, [
            h("span", { class: "cw-toolchip-dot" }), meta.label
          ]));
        });
        body.appendChild(chipRow);
      }
    }

    // Answer — formatted markdown when done; filled by cwAnimate while answering.
    body.appendChild(h("div", { class: "cw-answer" }, done ? [cwMarkdown(m.text)] : []));

    if (done) {
      // Governed proposal beat.
      if (tools.propose) {
        var pcard = h("div", { class: "cw-propose" }, [
          h("div", { class: "cw-propose-l" }, [
            h("span", { class: "cw-propose-tag" }, ["Proposed \u2014 awaiting approval"]),
            h("p", {}, ["The agent staged a save play as ", h("code", {}, ["Proposed"]), "/", h("code", {}, ["Pending"]), ". It cannot approve, execute, or move protected revenue \u2014 that stays on the governed ", h("code", {}, ["REVENUE_CC_WRITER"]), " approval path."])
          ]),
          (function () { var b = h("button", { class: "pill-btn go solid xs" }, ["Review in Approvals \u2197"]); b.addEventListener("click", function () { goto("approvals"); }); return b; })()
        ]);
        body.appendChild(pcard);
      }
      // Result card (metrics).
      if (res.metrics) {
        var m2 = res.metrics;
        body.appendChild(h("div", { class: "cw-result" }, [
          h("div", { class: "cw-result-head" }, [h("span", { class: "cw-result-ico", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7'><path d='M3 3v18h18'/><path d='M7 15l3-4 3 2 4-6'/></svg>" }), "Result \u00b7 governed semantic view"]),
          h("div", { class: "cw-metrics" }, [
            cwMetric("Revenue at risk", money(m2.revenueAtRisk)),
            cwMetric("Avg risk score", (Number(m2.avgRiskScore) || 0).toFixed(1)),
            cwMetric("High-risk accounts", num(m2.highRiskAccounts))
          ])
        ]));
      }
      // Citations.
      var cites = res.citations || [];
      if (cites.length) {
        var cl = h("div", { class: "cw-cites" }, [h("div", { class: "cw-cites-head" }, ["Sources \u00b7 Cortex Search"])]);
        cites.slice(0, 5).forEach(function (c, idx) {
          cl.appendChild(h("div", { class: "cw-cite" }, [
            h("span", { class: "cw-cite-n" }, [String(idx + 1)]),
            h("div", {}, [
              h("div", { class: "cw-cite-title" }, [c.title || c.docId || "Document"]),
              (c.account || c.region) ? h("div", { class: "cw-cite-meta" }, [[c.account, c.region].filter(Boolean).join(" \u00b7 ")]) : null,
              c.snippet ? h("p", { class: "cw-cite-snippet" }, [c.snippet]) : null
            ])
          ]));
        });
        body.appendChild(cl);
      }
      // Generated SQL (collapsible).
      if (res.sql) {
        var open = false;
        var pre = h("pre", { class: "cw-sql-block" }, [h("code", {}, [fmtSql(res.sql)])]);
        pre.style.display = "none";
        var tog = h("button", { class: "cw-sql-toggle" }, [
          h("span", { class: "cw-sql-caret" }, ["\u25b8"]), "View generated SQL \u00b7 ", h("code", {}, ["cortex_analyst"])
        ]);
        tog.addEventListener("click", function () {
          open = !open; pre.style.display = open ? "block" : "none";
          tog.querySelector(".cw-sql-caret").textContent = open ? "\u25be" : "\u25b8";
        });
        body.appendChild(h("div", { class: "cw-sql" }, [tog, pre]));
      }
      // Footer telemetry.
      var foot = h("div", { class: "cw-msg-foot" });
      if (res.live && res.elapsedMs != null) foot.appendChild(h("span", {}, [(res.elapsedMs / 1000).toFixed(1) + "s"]));
      foot.appendChild(h("span", {}, [res.live ? "Live \u00b7 " + ((res.agent ? String(res.agent).split(".").pop() : "REVENUE_CC_AGENT")) : "Sample \u00b7 cached run"]));
      if (res.live && res.requestId) foot.appendChild(h("span", { class: "req" }, ["request_id " + String(res.requestId).slice(0, 8)]));
      body.appendChild(foot);
    }

    wrap.appendChild(body);
    return wrap;
  }
  function cwMetric(label, value) {
    return h("div", { class: "cw-metric" }, [h("span", { class: "cw-metric-val" }, [value]), h("span", { class: "cw-metric-lab" }, [label])]);
  }

  function cwComposer() {
    var st = state.cw;
    var ta = h("textarea", { class: "cw-input", id: "cwInput", rows: "1", placeholder: "Ask a question to get started\u2026" });
    ta.value = st.draft || "";
    if (st.sending) ta.setAttribute("disabled", "true");
    ta.addEventListener("input", function () {
      st.draft = ta.value;
      ta.style.height = "auto"; ta.style.height = Math.min(160, ta.scrollHeight) + "px";
      var btn = document.querySelector(".cw-send"); if (btn) btn.classList.toggle("ready", !!ta.value.trim());
    });
    ta.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); cwAsk(ta.value); }
    });

    var plus = h("button", { class: "cw-plus", title: "Attachments & context (native CoWork)" }, [
      h("span", { html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round'><path d='M12 5v14M5 12h14'/></svg>" })
    ]);
    var agentPill = h("span", { class: "cw-agent-pill" }, [
      h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" }), "Revenue Command Center Agent"
    ]);
    var think = h("button", { class: "cw-think" + (st.thinking ? " on" : ""), title: "Extended thinking \u2014 stream the agent's reasoning" }, [
      h("span", { class: "cw-think-ico", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M22 10L12 5 2 10l10 5 10-5z'/><path d='M6 12v5c0 1 2.7 2.5 6 2.5s6-1.5 6-2.5v-5'/></svg>" }),
      "Extended thinking"
    ]);
    think.addEventListener("click", function () { st.thinking = !st.thinking; renderView(); cwFocusComposer(); });
    var ready = !!(st.draft && st.draft.trim());
    var send = h("button", { class: "cw-send" + (ready ? " ready" : ""), title: st.sending ? "Working\u2026" : "Send", disabled: st.sending ? "true" : null }, [
      st.sending
        ? h("span", { class: "spinner sm" })
        : h("span", { class: "cw-send-arrow", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M12 19V5M6 11l6-6 6 6'/></svg>" })
    ]);
    send.addEventListener("click", function () { cwAsk(ta.value); });

    return h("div", { class: "cw-composer-wrap" }, [
      h("div", { class: "cw-composer" }, [
        h("div", { class: "cw-composer-top" }, [ta]),
        h("div", { class: "cw-composer-bar" }, [
          h("div", { class: "cw-composer-l" }, [plus, agentPill]),
          h("div", { class: "cw-composer-r" }, [think, send])
        ])
      ])
    ]);
  }

  /* --------------------- under-the-hood (honest wiring) ------------------- */
  function cwWiring() {
    var st = state.cw;
    var head = h("button", { class: "cw-wire-toggle" + (st.showWiring ? " open" : "") }, [
      h("span", { class: "cw-wire-caret" }, [st.showWiring ? "\u25be" : "\u25b8"]),
      h("span", {}, ["Under the hood \u2014 embed contract, managed MCP & Deep Research"]),
      h("span", { class: "cw-wire-hint" }, [st.showWiring ? "hide" : "show"])
    ]);
    head.addEventListener("click", function () { st.showWiring = !st.showWiring; renderView(); });
    var wrap = h("section", { class: "cw-wire" }, [head]);
    if (!st.showWiring) return wrap;
    if (state.cowork.loading && !state.cowork.loaded) {
      wrap.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Loading MCP tool inventory\u2026"]));
      return wrap;
    }
    var body = h("div", { class: "cw-wire-body" });
    body.appendChild(h("section", { class: "grid" }, [coworkLaunchpad()]));
    var dr = coworkDeepResearch(); if (dr) body.appendChild(h("section", { class: "grid" }, [dr]));
    body.appendChild(h("section", { class: "grid" }, [mcpManagedPanel()]));
    body.appendChild(h("section", { class: "grid" }, [mcpDomoPanel()]));
    wrap.appendChild(body);
    return wrap;
  }

  // Domo-registered agent embed for the Chat v2 surface.
  var DOMO_CHAT_EMBED = "https://snowflake-demo.domo.com/embed/agents/private/A1Y49";

  function renderChat() {
    var frag = document.createDocumentFragment();
    frag.appendChild(h("div", { class: "embed-head" }, [
      h("div", { class: "embed-head-l" }, [
        h("h2", {}, [h("img", { class: "head-mark", src: "./public/brand/domo-ai-agent.svg", alt: "" }), "Domo Chat v2 \u2014 Native Domo agent"]),
        h("p", {}, ["Domo's conversational delivery layer, embedded in the app. It answers over governed Domo + Snowflake context and reaches Snowflake through the same managed MCP server (Agent \u00b7 Analyst \u00b7 Search) \u2014 inheriting ", h("code", {}, ["REVENUE_CC_ANALYST"]), " semantics and Horizon policies."])
      ]),
      srcLink("Open in Domo", DOMO_CHAT_EMBED, "domo")
    ]));
    frag.appendChild(h("div", { class: "agent-embed-wrap" }, [
      h("iframe", { class: "agent-embed", src: DOMO_CHAT_EMBED, frameborder: "0", marginheight: "0", marginwidth: "0", allow: "clipboard-write; clipboard-read", title: "Domo Chat v2" })
    ]));
    return frag;
  }

  // Narrative spine + technical architecture for the How It Works surface.
  var SPINE = [
    { plane: "Predict", surface: "Forecast Home + Snowflake ML", tech: "SNOWFLAKE.ML classification \u2192 PREDICT_RENEWAL_RISK", mark: "snowflake-mark.svg" },
    { plane: "Explain", surface: "Cortex Analyst + Cortex Workspace", tech: "REVENUE_CC_ANALYST semantic view + REVENUE_CC_SEARCH", mark: "snowflake-cortex.svg" },
    { plane: "Act", surface: "Cortex Workspace + Approvals", tech: "REVENUE_CC_AGENT \u2192 AGENT_ACTION_WRITEBACK (WRITER)", mark: "domo-approvals.svg" },
    { plane: "Remember", surface: "Hybrid Tables", tech: "Hybrid Tables: SCENARIO_RUNS, PREDICTION_FEEDBACK", mark: "domo-data.svg" },
    { plane: "Govern", surface: "Horizon AI Readiness", tech: "RAP_REGION + MASK_ARR + Cortex guardrails/observability", mark: "domo-pdp.svg" }
  ];

  var ARCH = [
    { layer: "Data plane (Snowflake Horizon)", status: "GA", items: ["Governed gold views + DIM/FACT model", "REVENUE_CC_ANALYST semantic view", "Row-access + masking policies"] },
    { layer: "AI plane (Cortex)", status: "GA", items: ["Cortex Analyst (text-to-SQL)", "Cortex Search (incident notes)", "One Cortex Agent (Analyst+Search+SQL)", "Snowflake ML native inference"] },
    { layer: "State (Hybrid Tables)", status: "GA", items: ["Scenario runs + prediction feedback", "Agent action writeback (idempotent MERGE)"] },
    { layer: "Interop", status: "Mixed", items: ["Domo Code Engine snowflakece bridge (SQL API, key-pair JWT)", "Snowflake-managed MCP outward (private preview \u2014 target-instance)", "Domo Essentials MCP outward (beta \u2014 gated)"] },
    { layer: "Delivery (Domo)", status: "Mixed", items: ["Pro-code App Studio app (this shell)", "Workflow + Task Center approval overlay", "Domo Chat v2 (target-instance \u2014 gated)"] }
  ];

  function loadHow() {
    state.how.loading = true; renderView();
    fetch("./public/mock/cocobuild.json").then(function (r) { return r.json(); }).catch(function () { return null; }).then(function (seed) {
      state.how.coco = seed; state.how.loading = false; state.how.loaded = true; renderView();
    });
  }

  function howSpinePanel() {
    var rail = h("div", { class: "spine-rail" });
    SPINE.forEach(function (s, i) {
      rail.appendChild(h("div", { class: "spine-node" }, [
        h("img", { class: "spine-mark", src: "./public/brand/" + s.mark, alt: "" }),
        h("span", { class: "spine-plane" }, [s.plane]),
        h("span", { class: "spine-surface" }, [s.surface]),
        h("code", { class: "spine-tech" }, [s.tech])
      ]));
      if (i < SPINE.length - 1) rail.appendChild(h("span", { class: "spine-arrow" }, ["\u2192"]));
    });
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Solution architecture \u2014 one governed loop"]), h("p", {}, ["Predict \u2192 Explain \u2192 Act \u2192 Remember \u2192 Govern, mapped to surfaces + Snowflake objects"])])]),
      rail
    ]);
  }

  function howArchPanel() {
    var grid = h("div", { class: "arch-grid" });
    ARCH.forEach(function (a) {
      var ul = h("ul", { class: "arch-items" });
      a.items.forEach(function (it) { ul.appendChild(h("li", {}, [it])); });
      grid.appendChild(h("div", { class: "arch-card" }, [
        h("div", { class: "arch-top" }, [h("span", { class: "arch-layer" }, [a.layer]), statChip(a.status)]),
        ul
      ]));
    });
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Technical architecture"]), h("p", {}, ["Every Snowflake object authored via the Cortex CLI \u00b7 maturity labeled honestly"])])]),
      grid
    ]);
  }

  function howCocoPanel() {
    var c = state.how.coco;
    var head = h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Built with CoCo \u2014 the Cortex CLI"]), h("p", {}, ["Beyond parity: the builder experience that authored this solution, shown live"])]), c ? statChip(c.status || "Live") : null]);
    var inner = [head];
    if (!c) {
      inner.push(h("p", { class: "analyst-note" }, ["Every artifact under ", h("code", {}, ["snowflake/"]), " was generated and validated through ", h("code", {}, ["cortex --mode code"]), " against the live account \u2014 semantic view, search service, agent, ML model, Hybrid Tables, and governance policies."]));
    } else {
      inner.push(h("div", { class: "coco-task" }, [h("span", { class: "gi-lab" }, ["Live builder task"]), h("span", {}, [c.task || ""])]));
      if (c.plan && c.plan.length) {
        var ol = h("ol", { class: "coco-plan" });
        c.plan.forEach(function (p) { ol.appendChild(h("li", {}, [p])); });
        inner.push(ol);
      }
      if (c.sql) inner.push(h("pre", { class: "mcp-json" }, [c.sql]));
      if (c.result) inner.push(h("p", { class: "coco-result" }, [h("strong", {}, ["Result: "]), c.result]));
      if (c.reversible) inner.push(h("p", { class: "coco-rev" }, [h("span", { class: "src-chip" }, ["reversible"]), " ", c.reversible]));
    }
    return h("article", { class: "panel col-12" }, inner);
  }

  function renderHow() {
    var frag = document.createDocumentFragment();
    if (!state.how.loaded && !state.how.loading) { loadHow(); }
    frag.appendChild(h("section", { class: "grid" }, [howSpinePanel()]));
    frag.appendChild(h("section", { class: "grid" }, [howArchPanel()]));
    frag.appendChild(h("section", { class: "grid" }, [howCocoPanel()]));
    return frag;
  }

  /* ------------------------------- render -------------------------------- */
  function setMode() {
    var pill = el("modePill"), railLab = el("railEnvLab");
    if (state.mode === "live") { pill.className = "mode-pill sf-live"; pill.textContent = "Live \u00b7 Snowflake"; el("envLabel").textContent = state.dataSource === "amplifier" ? "Live \u00b7 Cloud Amplifier federation (data stays in Snowflake)" : "Live Snowflake read \u00b7 Horizon-governed"; if (railLab) railLab.textContent = "Live \u00b7 Horizon-governed"; }
    else if (state.mode === "sample") { pill.className = "mode-pill sample"; pill.textContent = "Sample data"; el("envLabel").textContent = "Sample seed \u00b7 connect Code Engine for live"; if (railLab) railLab.textContent = "Sample \u00b7 Horizon-governed"; }
    else { pill.className = "mode-pill"; pill.textContent = "Loading"; if (railLab) railLab.textContent = "Loading\u2026"; }
  }

  // Inline line-icons per surface (24x24, currentColor stroke).
  var ICO = "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.7' stroke-linecap='round' stroke-linejoin='round'>";
  var SURFACE_ICONS = {
    home: ICO + "<path d='M3 3v18h18'/><path d='M6 15l4-5 3 3 5-7'/></svg>",
    analyst: "<svg viewBox='0 0 103 101' fill='none'><path d='M13.5825 67.9035L46.8644 16.5088L89.1237 43.9267L74.0306 86.0748L13.5825 67.9035Z' stroke='currentColor' stroke-width='5.2' stroke-miterlimit='10'/><path d='M46.8639 30.0911C54.3657 30.0911 60.447 24.0097 60.447 16.5079C60.447 9.00619 54.3657 2.9248 46.8639 2.9248C39.3622 2.9248 33.2808 9.00619 33.2808 16.5079C33.2808 24.0097 39.3622 30.0911 46.8639 30.0911Z' fill='currentColor'/><path d='M89.1239 57.511C96.6259 57.511 102.707 51.4296 102.707 43.9279C102.707 36.4261 96.6259 30.3447 89.1239 30.3447C81.6224 30.3447 75.5408 36.4261 75.5408 43.9279C75.5408 51.4296 81.6224 57.511 89.1239 57.511Z' fill='currentColor'/><path d='M74.0306 99.6584C81.5327 99.6584 87.6138 93.5773 87.6138 86.0753C87.6138 78.5739 81.5327 72.4922 74.0306 72.4922C66.5292 72.4922 60.4475 78.5739 60.4475 86.0753C60.4475 93.5773 66.5292 99.6584 74.0306 99.6584Z' fill='currentColor'/><path d='M13.5831 81.4864C21.0849 81.4864 27.1663 75.4053 27.1663 67.9033C27.1663 60.4018 21.0849 54.3203 13.5831 54.3203C6.08139 54.3203 0 60.4018 0 67.9033C0 75.4053 6.08139 81.4864 13.5831 81.4864Z' fill='currentColor'/></svg>",
    ml: ICO + "<rect x='6' y='6' width='12' height='12' rx='2'/><rect x='10' y='10' width='4' height='4'/><path d='M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3'/></svg>",
    approvals: ICO + "<path d='M22 11.1V12a10 10 0 1 1-5.9-9.1'/><path d='M22 4L12 14.02l-3-3'/></svg>",
    ops: ICO + "<ellipse cx='12' cy='5' rx='8' ry='3'/><path d='M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5'/><path d='M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6'/></svg>",
    readiness: ICO + "<path d='M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6z'/><path d='M9 12l2 2 4-4'/></svg>",
    semantic: ICO + "<circle cx='5' cy='6' r='2.4'/><circle cx='19' cy='6' r='2.4'/><circle cx='12' cy='18' r='2.4'/><path d='M7 7.4l4 8.4M17 7.4l-4 8.4M7.4 6h9.2'/></svg>",
    cowork: ICO + "<rect x='4' y='8' width='16' height='11' rx='2.5'/><path d='M12 8V4.5M9.5 4.5h5'/><circle cx='9' cy='13.5' r='1'/><circle cx='15' cy='13.5' r='1'/><path d='M9.5 16.5h5'/></svg>",
    chat: ICO + "<path d='M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3 21l1.9-5.7A8.5 8.5 0 1 1 21 11.5z'/><path d='M8 11.5h.01M12 11.5h.01M16 11.5h.01'/></svg>",
    how: ICO + "<path d='M12 2L2 7l10 5 10-5-10-5z'/><path d='M2 12l10 5 10-5'/><path d='M2 17l10 5 10-5'/></svg>",
    _default: ICO + "<circle cx='12' cy='12' r='9'/></svg>"
  };
  var SURFACE_DESC = {
    home: "Forecast & KPIs", analyst: "Ask in natural language", ml: "Score renewal risk",
    approvals: "Human-in-the-loop queue", ops: "Scenarios & model feedback", readiness: "Horizon \u2194 Domo AI",
    semantic: "Governed vocabulary", cowork: "CoWork agent chat", chat: "Domo Chat v2 agent", how: "Architecture & lineage"
  };
  // Surfaces rendered in the meta group (rail footer separator above).
  var META_SURFACES = { how: true };

  function renderTabs() {
    var nav = el("viewTabs"); nav.innerHTML = "";
    SURFACES.forEach(function (s) {
      var active = s.id === state.surface;
      var label = h("span", { class: "rail-label" }, [s.label]);
      if (s.gated) label.appendChild(h("span", { class: "rail-badge" }, ["Beta"]));
      var item = h("button", {
        class: "rail-item" + (active ? " active" : "") + (META_SURFACES[s.id] ? " meta" : ""),
        role: "tab", "aria-selected": active ? "true" : "false", title: s.label
      }, [
        h("span", { class: "rail-ind" }),
        h("span", { class: "rail-ico", html: SURFACE_ICONS[s.id] || SURFACE_ICONS._default }),
        h("span", { class: "rail-meta" }, [label, h("span", { class: "rail-desc" }, [SURFACE_DESC[s.id] || ""])])
      ]);
      item.addEventListener("click", function () { state.surface = s.id; renderTabs(); renderView(); window.scrollTo({ top: 0, behavior: "smooth" }); });
      nav.appendChild(item);
    });
  }

  // Collapsing left rail: hover-to-expand + pin-to-lock (persisted).
  function initRail() {
    var root = el("appRoot"), pin = el("railPin");
    if (!root || !pin) return;
    var pinned = false;
    try { pinned = localStorage.getItem("railPinned") === "true"; } catch (e) {}
    function apply() {
      root.classList.toggle("rail-pinned", pinned);
      pin.setAttribute("aria-pressed", String(pinned));
      pin.setAttribute("title", pinned ? "Unpin navigation" : "Pin navigation open");
    }
    apply();
    pin.addEventListener("click", function () {
      pinned = !pinned;
      try { localStorage.setItem("railPinned", String(pinned)); } catch (e) {}
      apply();
    });
  }

  function renderView() {
    var root = el("view"); root.innerHTML = "";
    if (state.surface === "home") root.appendChild(renderHome(state.data));
    else if (state.surface === "analyst") root.appendChild(renderAnalyst());
    else if (state.surface === "semantic") root.appendChild(renderSemantic());
    else if (state.surface === "agents") root.appendChild(renderAgents());
    else if (state.surface === "ml") root.appendChild(renderML());
    else if (state.surface === "ops") root.appendChild(renderOps());
    else if (state.surface === "approvals") root.appendChild(renderApprovals());
    else if (state.surface === "readiness") root.appendChild(renderReadiness());
    else if (state.surface === "chat") root.appendChild(renderChat());
    else if (state.surface === "cowork") root.appendChild(renderCoWork());
    else if (state.surface === "how") root.appendChild(renderHow());
    else root.appendChild(renderSoon(SURFACES.filter(function (s) { return s.id === state.surface; })[0]));
  }

  function renderSoon(s) {
    var wrap = h("div", { class: "soon" });
    wrap.appendChild(h("img", { class: "soon-mark", src: "./public/brand/" + (s.mark || "snowflake-mark.svg"), alt: "" }));
    wrap.appendChild(h("span", { class: "soon-sprint" }, ["Arrives in Sprint " + s.sprint]));
    wrap.appendChild(h("h2", {}, [s.label]));
    var ul = h("ul");
    (s.items || []).forEach(function (it) { ul.appendChild(h("li", {}, [it])); });
    wrap.appendChild(ul);
    return wrap;
  }

  function connBanner() {
    if (state.mode === "live") return null;
    var b = h("div", { class: "conn-banner" });
    b.appendChild(h("div", {}, [
      h("span", { class: "cb-title" }, ["Sample data \u2014 "]),
      document.createTextNode("live figures load through the "),
      h("code", {}, ["snowflakece"]),
      document.createTextNode(" Code Engine bridge once the Snowflake credential + Cloud Amplifier connection are configured (see SNOWFLAKE-CONNECT.md).")
    ]));
    return b;
  }

  // Small area sparkline for KPI cards. series: array of numbers.
  function sparkline(series, color) {
    var svgNS = "http://www.w3.org/2000/svg";
    var W = 240, H = 40, pad = 3;
    var pts = (series || []).filter(function (v) { return typeof v === "number" && isFinite(v); });
    var svg = document.createElementNS(svgNS, "svg");
    svg.setAttribute("class", "kpi-spark"); svg.setAttribute("viewBox", "0 0 " + W + " " + H);
    svg.setAttribute("preserveAspectRatio", "none");
    if (pts.length < 2) return svg;
    var mn = Math.min.apply(null, pts), mx = Math.max.apply(null, pts), rng = (mx - mn) || 1;
    var X = function (i) { return pad + (W - pad * 2) * (i / (pts.length - 1)); };
    var Y = function (v) { return (H - pad) - (H - pad * 2) * ((v - mn) / rng); };
    var d = "M" + X(0).toFixed(1) + "," + Y(pts[0]).toFixed(1);
    for (var i = 1; i < pts.length; i++) d += " L" + X(i).toFixed(1) + "," + Y(pts[i]).toFixed(1);
    var gid = "spk" + Math.random().toString(36).slice(2, 8);
    var defs = document.createElementNS(svgNS, "defs");
    defs.innerHTML = "<linearGradient id='" + gid + "' x1='0' y1='0' x2='0' y2='1'><stop offset='0%' stop-color='" + color + "' stop-opacity='0.28'/><stop offset='100%' stop-color='" + color + "' stop-opacity='0'/></linearGradient>";
    svg.appendChild(defs);
    var area = document.createElementNS(svgNS, "path");
    area.setAttribute("d", d + " L" + X(pts.length - 1).toFixed(1) + "," + H + " L" + X(0).toFixed(1) + "," + H + " Z");
    area.setAttribute("fill", "url(#" + gid + ")"); area.setAttribute("stroke", "none"); svg.appendChild(area);
    var line = document.createElementNS(svgNS, "path");
    line.setAttribute("d", d); line.setAttribute("fill", "none"); line.setAttribute("stroke", color);
    line.setAttribute("stroke-width", "1.8"); line.setAttribute("stroke-linecap", "round"); line.setAttribute("stroke-linejoin", "round");
    svg.appendChild(line);
    var last = document.createElementNS(svgNS, "circle");
    last.setAttribute("cx", X(pts.length - 1).toFixed(1)); last.setAttribute("cy", Y(pts[pts.length - 1]).toFixed(1));
    last.setAttribute("r", "2.4"); last.setAttribute("fill", color); svg.appendChild(last);
    return svg;
  }

  // Deterministic representative series ending at `value` (for KPIs without a
  // native time series). dir > 0 rising, < 0 falling.
  function trendSeries(value, dir, n) {
    n = n || 12; value = Number(value) || 0;
    var out = [], start = value * (dir >= 0 ? 0.72 : 1.28);
    for (var i = 0; i < n; i++) {
      var t = i / (n - 1);
      var base = start + (value - start) * t;
      var wobble = Math.sin(i * 1.7) * value * 0.03;
      out.push(Math.max(0, base + wobble));
    }
    out[n - 1] = value;
    return out;
  }

  function kpiCard(k, opts) {
    opts = opts || {};
    var meta;
    if (k.deltaPct != null) {
      var up = k.deltaPct >= 0;
      meta = h("div", { class: "kpi-meta" }, [
        h("span", { class: "kpi-delta " + (up ? "up" : "down") }, [(up ? "\u25b2 " : "\u25bc ") + Math.abs(k.deltaPct).toFixed(1) + "%"]),
        opts.metaText || " vs. prior month"
      ]);
    } else if (k.breaches != null) {
      meta = h("div", { class: "kpi-meta" }, [
        opts.chip ? h("span", { class: "kpi-delta warn" }, [opts.chip]) : null,
        num(k.breaches) + " of " + num(k.cases) + " cases (90d)"
      ]);
    } else {
      meta = h("div", { class: "kpi-meta" }, [
        opts.chip ? h("span", { class: "kpi-delta " + (opts.chipCls || "warn") }, [opts.chip]) : null,
        k.context || ""
      ]);
    }
    var val = k.unit === "%" ? (Number(k.value).toFixed(1) + "%") : money(k.value);
    var kids = [h("span", { class: "kpi-label" }, [k.label]), h("span", { class: "kpi-value" }, [val]), meta];
    if (opts.spark) kids.push(sparkline(opts.spark, opts.sparkColor || "var(--domo-blue)"));
    return h("article", { class: "kpi" + (opts.cls ? " " + opts.cls : "") }, kids);
  }

  var MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monthLabel(period) {
    if (!period) return "";
    var parts = String(period).split("-");
    var m = parseInt(parts[1], 10) - 1;
    return (MONTHS_ABBR[m] || parts[1]) + " \u2019" + String(parts[0]).slice(2);
  }
  function fmtMoneyAxis(v) {
    var a = Math.abs(v);
    if (a >= 1e9) return "$" + (v / 1e9).toFixed(1) + "B";
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(0) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
    return "$" + Math.round(v);
  }
  function fmtMoneyTip(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return "$" + (v / 1e6).toFixed(1) + "M";
    if (a >= 1e3) return "$" + (v / 1e3).toFixed(0) + "K";
    return "$" + Math.round(v);
  }

  // Smooth (Catmull-Rom -> cubic bezier) path builder for elegant curves.
  function smoothCurveCmds(pts) {
    var d = "", t = 0.16;
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1.x + (p2.x - p0.x) * t, c1y = p1.y + (p2.y - p0.y) * t;
      var c2x = p2.x - (p3.x - p1.x) * t, c2y = p2.y - (p3.y - p1.y) * t;
      d += " C" + c1x.toFixed(1) + "," + c1y.toFixed(1) + " " + c2x.toFixed(1) + "," + c2y.toFixed(1) + " " + p2.x.toFixed(1) + "," + p2.y.toFixed(1);
    }
    return d;
  }
  function smoothPath(pts) {
    if (!pts.length) return "";
    return "M" + pts[0].x.toFixed(1) + "," + pts[0].y.toFixed(1) + smoothCurveCmds(pts);
  }

  function fcMiniStat(label, value, sub, subCls) {
    return h("div", { class: "fc-stat" }, [
      h("span", { class: "fc-stat-lab" }, [label]),
      h("span", { class: "fc-stat-val" }, [value]),
      sub ? h("span", { class: "fc-stat-sub" + (subCls ? " " + subCls : "") }, [sub]) : null
    ]);
  }

  function forecastChart(data) {
    var rf = data && data.revenueForecast;
    if (!rf || !rf.history || !rf.history.length) {
      var av = (data && data.actualVsForecast) || [];
      rf = { history: av.map(function (p) { return { period: p.period, actual: p.actual }; }), forecast: [], predictionInterval: 0.95 };
    }
    var fullHist = rf.history || [], fc = rf.forecast || [];
    // Range filter: show the last N months of actuals (forecast always shown).
    var range = (state.home && state.home.range) || 24;
    var hist = fullHist.length > range ? fullHist.slice(fullHist.length - range) : fullHist;
    var showBand = !(state.home && state.home.showBand === false);
    var svgNS = "http://www.w3.org/2000/svg";
    function E(name, attrs) { var e = document.createElementNS(svgNS, name); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

    var W = 1200, H = 384, x0 = 66, x1 = 1184, y0 = 26, y1 = 312;
    var labels = hist.map(function (p) { return p.period; }).concat(fc.map(function (p) { return p.period; }));
    var N = labels.length || 1;
    var cut = hist.length; // first forecast index; last actual at cut-1

    var vals = [];
    hist.forEach(function (p) { vals.push(p.actual); });
    fc.forEach(function (p) { vals.push(p.forecast, p.lower, p.upper); });
    var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
    var step = 10e6;
    var floor = Math.floor((mn - (mx - mn) * 0.12) / step) * step; if (floor < 0) floor = 0;
    var ceil = Math.ceil((mx + (mx - mn) * 0.08) / step) * step;
    if (ceil <= floor) ceil = floor + step;
    function X(i) { return x0 + (x1 - x0) * (N === 1 ? 0.5 : i / (N - 1)); }
    function Y(v) { return y1 - (y1 - y0) * ((v - floor) / (ceil - floor || 1)); }

    var lastAct = hist.length ? hist[hist.length - 1].actual : ((fc[0] && fc[0].forecast) || 0);
    var actPts = hist.map(function (p, i) { return { x: X(i), y: Y(p.actual) }; });
    var anchor = { x: X(cut - 1), y: Y(lastAct) };
    var fcPts = [anchor].concat(fc.map(function (p, i) { return { x: X(cut + i), y: Y(p.forecast) }; }));
    var upPts = [anchor].concat(fc.map(function (p, i) { return { x: X(cut + i), y: Y(p.upper) }; }));
    var loPts = [anchor].concat(fc.map(function (p, i) { return { x: X(cut + i), y: Y(p.lower) }; }));

    var svg = E("svg", { viewBox: "0 0 " + W + " " + H, class: "fchart", preserveAspectRatio: "none", style: "display:block;width:100%;height:auto" });

    var defs = E("defs");
    defs.innerHTML =
      "<linearGradient id='fcActFill' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0%' stop-color='#4a90c2' stop-opacity='0.24'/>" +
      "<stop offset='72%' stop-color='#99ccee' stop-opacity='0'/>" +
      "<stop offset='100%' stop-color='#99ccee' stop-opacity='0'/></linearGradient>" +
      "<linearGradient id='fcBand' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0%' stop-color='#29b5e8' stop-opacity='0.30'/>" +
      "<stop offset='100%' stop-color='#29b5e8' stop-opacity='0.05'/></linearGradient>";
    svg.appendChild(defs);

    // horizontal gridlines + y labels
    var ticks = 5;
    for (var g = 0; g <= ticks; g++) {
      var gv = floor + (ceil - floor) * (g / ticks), gy = Y(gv);
      svg.appendChild(E("line", { class: "fc-grid", x1: x0, y1: gy.toFixed(1), x2: x1, y2: gy.toFixed(1) }));
      var yl = E("text", { class: "fc-ylab", x: x0 - 12, y: (gy + 3.5).toFixed(1) }); yl.textContent = fmtMoneyAxis(gv); svg.appendChild(yl);
    }

    // forecast region shading (subtle) behind the band
    svg.appendChild(E("rect", { class: "fc-future", x: X(cut - 1).toFixed(1), y: y0, width: (x1 - X(cut - 1)).toFixed(1), height: (y1 - y0).toFixed(1) }));

    // actual area fill
    var areaD = smoothPath(actPts) + " L" + X(cut - 1).toFixed(1) + "," + y1 + " L" + X(0).toFixed(1) + "," + y1 + " Z";
    svg.appendChild(E("path", { class: "fc-area", d: areaD, fill: "url(#fcActFill)" }));

    // confidence band (opening cone from the last actual)
    if (showBand && fc.length) {
      var loRev = loPts.slice().reverse();
      var bandD = smoothPath(upPts) + " L" + loRev[0].x.toFixed(1) + "," + loRev[0].y.toFixed(1) + smoothCurveCmds(loRev) + " Z";
      svg.appendChild(E("path", { class: "fc-bandfill", d: bandD, fill: "url(#fcBand)" }));
    }

    // Today marker (boundary between actual + forecast)
    svg.appendChild(E("line", { class: "fc-cut", x1: X(cut - 1).toFixed(1), y1: y0 - 2, x2: X(cut - 1).toFixed(1), y2: y1 }));
    var cutLab = E("text", { class: "fc-cutlab", x: X(cut - 1).toFixed(1), y: y0 - 8, "text-anchor": "middle" }); cutLab.textContent = "Today"; svg.appendChild(cutLab);

    // lines
    if (fc.length) svg.appendChild(E("path", { class: "fc-line fc-forecast", d: smoothPath(fcPts) }));
    svg.appendChild(E("path", { class: "fc-line fc-actual", d: smoothPath(actPts) }));

    // dots
    actPts.forEach(function (p, i) {
      svg.appendChild(E("circle", { class: "fc-dot" + (i === cut - 1 ? " last" : ""), cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: i === cut - 1 ? 4.2 : 2.1 }));
    });
    fc.forEach(function (p, i) {
      svg.appendChild(E("circle", { class: "fc-dot fc", cx: X(cut + i).toFixed(1), cy: Y(p.forecast).toFixed(1), r: 2.6 }));
    });

    // x labels
    var xEvery = N > 22 ? 3 : (N > 14 ? 2 : 1);
    for (var i = 0; i < N; i++) {
      var isCut = i === cut - 1;
      var isReg = i % xEvery === 0 || i === N - 1;
      if (!isCut && !isReg) continue;
      if (!isCut && Math.abs(i - (cut - 1)) < 1) continue;
      var xl = E("text", { class: "fc-xlab" + (isCut ? " cut" : ""), x: X(i).toFixed(1), y: y1 + 22 });
      xl.textContent = monthLabel(labels[i]); svg.appendChild(xl);
    }

    // hover focus + crosshair
    var focus = E("g", { class: "fc-focusg", opacity: "0" });
    var cross = E("line", { class: "fc-cross", x1: 0, y1: y0, x2: 0, y2: y1 }); focus.appendChild(cross);
    var fdot = E("circle", { class: "fc-focusdot", r: "5" }); focus.appendChild(fdot);
    svg.appendChild(focus);
    var overlay = E("rect", { x: x0, y: y0, width: (x1 - x0), height: (y1 - y0), fill: "transparent", style: "cursor:crosshair" });
    svg.appendChild(overlay);

    var box = h("div", { class: "chart fchart-box" });
    box.appendChild(svg);
    var tip = h("div", { class: "fc-tip" }); box.appendChild(tip);

    function pointFor(i) {
      if (i <= cut - 1) return { x: X(i), y: Y(hist[i].actual), kind: "actual", period: labels[i], row: hist[i] };
      var fi = i - cut; var fp = fc[fi];
      return { x: X(cut + fi), y: Y(fp.forecast), kind: "forecast", period: labels[i], row: fp };
    }
    function onMove(e) {
      var rect = svg.getBoundingClientRect(); if (!rect.width) return;
      var sx = W / rect.width;
      var vx = (e.clientX - rect.left) * sx;
      var i = Math.round((vx - x0) / ((x1 - x0) / (N - 1)));
      if (i < 0) i = 0; if (i > N - 1) i = N - 1;
      var pt = pointFor(i);
      focus.setAttribute("opacity", "1");
      cross.setAttribute("x1", pt.x.toFixed(1)); cross.setAttribute("x2", pt.x.toFixed(1));
      fdot.setAttribute("cx", pt.x.toFixed(1)); fdot.setAttribute("cy", pt.y.toFixed(1));
      fdot.setAttribute("class", "fc-focusdot " + pt.kind);
      var html = "<div class='fc-tip-h'>" + monthLabel(pt.period) + "</div>";
      if (pt.kind === "actual") {
        html += "<div class='fc-tip-r'><span class='sw act'></span>Actual<b>" + fmtMoneyTip(pt.row.actual) + "</b></div>";
      } else {
        html += "<div class='fc-tip-r'><span class='sw fc'></span>Forecast<b>" + fmtMoneyTip(pt.row.forecast) + "</b></div>";
        html += "<div class='fc-tip-r muted'><span class='sw band'></span>95% interval<b>" + fmtMoneyTip(pt.row.lower) + "\u2013" + fmtMoneyTip(pt.row.upper) + "</b></div>";
      }
      tip.innerHTML = html;
      var px = (pt.x / W) * rect.width;
      tip.style.opacity = "1";
      tip.style.left = Math.max(6, Math.min(rect.width - 150, px - 66)) + "px";
      tip.style.top = Math.max(2, (pt.y / H) * rect.height - 64) + "px";
    }
    svg.addEventListener("mousemove", onMove);
    svg.addEventListener("mouseleave", function () { focus.setAttribute("opacity", "0"); tip.style.opacity = "0"; });

    var legend = h("div", { class: "chart-legend" }, [
      h("span", { class: "lg-item" }, [h("span", { class: "lg-line" }), " Actual net revenue"]),
      h("span", { class: "lg-item" }, [h("span", { class: "lg-line dashed", style: "border-color: var(--sf-blue)" }), " Snowflake ML forecast"]),
      showBand ? h("span", { class: "lg-item" }, [h("span", { class: "lg-band" }), " 95% confidence band"]) : null,
      h("span", { class: "lg-item" }, [h("span", { class: "lg-today" }), " Today"])
    ]);

    // Range + confidence band controls (top-right of the panel head).
    var ranges = [[12, "12M"], [18, "18M"], [24, "24M"]];
    var rangeGroup = h("div", { class: "fc-toggle" });
    ranges.forEach(function (r) {
      var b = h("button", { class: "fc-toggle-btn" + (range === r[0] ? " active" : "") }, [r[1]]);
      b.addEventListener("click", function () { state.home.range = r[0]; renderView(); });
      rangeGroup.appendChild(b);
    });
    var bandBtn = h("button", { class: "fc-band-btn" + (showBand ? " active" : "") }, [(showBand ? "\u2713 " : "+ ") + "Confidence band"]);
    bandBtn.addEventListener("click", function () { state.home.showBand = !showBand; renderView(); });

    // In-panel mini-stats.
    var lastFc = fc.length ? fc[fc.length - 1].forecast : lastAct;
    var fcDelta = lastAct ? ((lastFc - lastAct) / lastAct) * 100 : 0;
    var kp = data.kpis || {};
    var stats = h("div", { class: "fc-stats" }, [
      fcMiniStat("Current run-rate", fmtMoneyTip(lastAct), monthLabel(hist.length ? hist[hist.length - 1].period : "")),
      fcMiniStat("Forecast (end)", fmtMoneyTip(lastFc), (fcDelta >= 0 ? "\u25b2 " : "\u25bc ") + Math.abs(fcDelta).toFixed(1) + "%", fcDelta >= 0 ? "up" : "down"),
      fcMiniStat("Revenue at risk", kp.revenueAtRisk ? fmtMoneyTip(kp.revenueAtRisk.value) : "\u2014", "current month"),
      fcMiniStat("Protected", kp.protectedRevenue ? fmtMoneyTip(kp.protectedRevenue.value) : "\u2014", "agent actions")
    ]);

    var panel = h("article", { class: "panel col-12 fc-panel" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [
          h("span", { class: "fc-eyebrow" }, ["Snowflake-modeled \u00b7 renewal-risk adjusted"]),
          h("h2", {}, ["Net Revenue \u2014 Actual vs. Forecast"]),
          h("p", {}, [(fullHist.length) + " mo actual + " + fc.length + " mo Snowflake ML forecast \u00b7 all tenants and regions"])
        ]),
        h("div", { class: "panel-head-actions" }, [
          rangeGroup, bandBtn,
          srcLink("GOLD_REVENUE_FORECAST", snowsightObjHref("view", "GOLD_REVENUE_FORECAST"), "sf")
        ])
      ]),
      stats, box, legend
    ]);
    return panel;
  }

  function goto(surface) { state.surface = surface; renderTabs(); renderView(); window.scrollTo({ top: 0, behavior: "smooth" }); }

  function insightRail(data) {
    var inc = data.incident || {};
    var reg = regionAgg(data)[0] || { region: "West", avgRisk: 83, revenueAtRisk: 0 };
    var items = [
      { cls: "warn", title: "Forecast headwind isolated to " + reg.region,
        body: (inc.rootCause || "Reliability incident") + " \u2014 " + reg.region + " avg risk " + (reg.avgRisk).toFixed(0) + ", " + money(reg.revenueAtRisk) + " at risk in the exposed cohort.",
        link: ["Ask Cortex why", function () { goto("analyst"); }] },
      { cls: "info", title: "Model recovery is conditional on actions",
        body: "The forecast recovery assumes approved retention plays land. " + money(data.kpis.protectedRevenue.value) + " already protected; pending plays carry the remaining upside.",
        link: ["Score an account", function () { goto("ml"); }] },
      { cls: "good", title: "Operational state is captured",
        body: "Scenario runs and prediction feedback persist in Snowflake Hybrid Tables \u2014 the loop remembers across sessions.",
        link: ["Open Hybrid Tables", function () { goto("ops"); }] }
    ];
    var rail = h("div", { class: "insight-rail" });
    items.forEach(function (it) {
      var a = h("button", { class: "insight-link" }, [it.link[0], h("span", { class: "il-arrow" }, ["\u2192"])]);
      a.addEventListener("click", it.link[1]);
      rail.appendChild(h("div", { class: "insight " + it.cls }, [h("span", { class: "insight-dot" }),
        h("div", { class: "insight-body" }, [h("h3", {}, [it.title]), h("p", {}, [it.body]), a])]));
    });
    return h("article", { class: "panel col-5" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, ["Insight Rail"]), h("p", {}, ["What the forecast can\u2019t tell you \u2014 act on it now"])]),
        h("span", { class: "panel-tag agent" }, [h("img", { class: "tag-mark", src: "./public/brand/snowflake-cortex.svg", alt: "" }), "Agent-grounded"])
      ]), rail
    ]);
  }

  // Aggregate region×segment rows to region-level (avg risk + summed at-risk).
  function regionAgg(data) {
    var by = {};
    (data.regionalRisk || []).forEach(function (r) {
      var g = by[r.region] || (by[r.region] = { region: r.region, rar: 0, wRisk: 0, w: 0, accts: 0 });
      g.rar += r.revenueAtRisk || 0;
      g.wRisk += (r.avgRisk || 0) * (r.highRiskAccounts || 1);
      g.w += (r.highRiskAccounts || 1);
      g.accts += (r.highRiskAccounts || 0);
    });
    return Object.keys(by).map(function (k) {
      var g = by[k];
      return { region: g.region, avgRisk: g.w ? g.wRisk / g.w : 0, revenueAtRisk: g.rar, highRiskAccounts: g.accts };
    }).sort(function (a, b) { return b.revenueAtRisk - a.revenueAtRisk; });
  }

  function regionalPanel(data) {
    var rows = regionAgg(data);
    var max = 1; rows.forEach(function (r) { max = Math.max(max, r.revenueAtRisk); });
    var chart = h("div", { class: "bar-chart region-bars" });
    rows.forEach(function (r, idx) {
      var hot = idx === 0 && r.avgRisk >= 60;
      var value = h("span", { class: "bar-value" }, [money(r.revenueAtRisk)]);
      value.appendChild(h("span", { class: "bar-flag" + (hot ? " hot" : "") }, ["risk " + r.avgRisk.toFixed(0)]));
      var label = h("span", { class: "bar-label" }, [r.region]);
      if (hot) label.appendChild(h("span", { class: "hotspot" }, ["HOTSPOT"]));
      chart.appendChild(h("div", { class: "bar-row" }, [
        label,
        h("span", { class: "bar-track" }, [h("span", { class: "bar-fill" + (hot ? " hot" : ""), style: "width: " + Math.max(3, (r.revenueAtRisk / max) * 100) + "%" })]),
        value
      ]));
    });
    return h("article", { class: "panel col-7" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, ["Regional Renewal Risk"]), h("p", {}, ["Revenue at risk by region \u2014 the West forecast bears the scar"])]),
        srcLink("GOLD_CUSTOMER_RENEWAL_RISK", snowsightObjHref("view", "GOLD_CUSTOMER_RENEWAL_RISK"), "sf")
      ]),
      chart
    ]);
  }

  function queuePanel(data) {
    var q = data.actionQueue || {};
    var segs = [
      { label: "Executed", val: q.executed || 0, color: "var(--status-good)" },
      { label: "Approved", val: q.approved || 0, color: "var(--domo-blue-deep)" },
      { label: "Pending", val: q.pending || 0, color: "var(--status-warn)" },
      { label: "Rejected", val: q.rejected || 0, color: "var(--status-bad)" },
      { label: "Not required", val: q.notRequired || 0, color: "var(--n-300)" }
    ];
    var total = segs.reduce(function (a, s) { return a + s.val; }, 0) || 1;
    var svgNS = "http://www.w3.org/2000/svg", R = 52, C = 2 * Math.PI * R, cx = 66, cy = 66, off = 0;
    var svg = document.createElementNS(svgNS, "svg"); svg.setAttribute("class", "donut"); svg.setAttribute("viewBox", "0 0 132 132"); svg.setAttribute("width", "132"); svg.setAttribute("height", "132");
    var track = document.createElementNS(svgNS, "circle"); track.setAttribute("cx", cx); track.setAttribute("cy", cy); track.setAttribute("r", R); track.setAttribute("fill", "none"); track.setAttribute("stroke", "var(--line)"); track.setAttribute("stroke-width", "14"); svg.appendChild(track);
    segs.forEach(function (s) {
      if (!s.val) return;
      var frac = s.val / total, arc = document.createElementNS(svgNS, "circle");
      arc.setAttribute("cx", cx); arc.setAttribute("cy", cy); arc.setAttribute("r", R); arc.setAttribute("fill", "none");
      arc.setAttribute("stroke", s.color); arc.setAttribute("stroke-width", "14");
      arc.setAttribute("stroke-dasharray", (C * frac) + " " + (C * (1 - frac)));
      arc.setAttribute("stroke-dashoffset", -off); arc.setAttribute("transform", "rotate(-90 " + cx + " " + cy + ")");
      svg.appendChild(arc); off += C * frac;
    });
    var ctxt = document.createElementNS(svgNS, "text"); ctxt.setAttribute("class", "donut-center"); ctxt.setAttribute("x", cx); ctxt.setAttribute("y", cy - 2); ctxt.setAttribute("text-anchor", "middle"); ctxt.setAttribute("font-size", "20"); ctxt.textContent = (total >= 1000 ? (total / 1000).toFixed(1) + "K" : total); svg.appendChild(ctxt);
    var csub = document.createElementNS(svgNS, "text"); csub.setAttribute("class", "donut-sub"); csub.setAttribute("x", cx); csub.setAttribute("y", cy + 14); csub.setAttribute("text-anchor", "middle"); csub.textContent = "actions"; svg.appendChild(csub);

    var legend = h("div", { class: "legend-list" });
    segs.forEach(function (s) { legend.appendChild(h("div", { class: "lg-row" }, [h("span", { class: "lg-sw", style: "background:" + s.color }), s.label, h("span", { class: "lg-num" }, [num(s.val)])])); });

    var mini = h("div", { class: "mini-list" });
    (q.topActions || []).slice(0, 5).forEach(function (a) {
      mini.appendChild(h("div", { class: "mini-row" }, [h("span", { class: "mr-name" }, [a.action]), h("span", { class: "mr-count" }, ["\u00d7 " + num(a.count)]), h("span", { class: "mr-val" }, [money(a.revenueAtRisk)])]));
    });

    return h("article", { class: "panel col-6" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Agent Action Queue"]), h("p", {}, ["Recommendations and approval status"])]),
        h("span", { class: "panel-tag" }, ["fact_agent_actions"])]),
      h("div", { class: "queue-wrap" }, [svg, legend]),
      mini
    ]);
  }

  // Full-width Agent Action Queue table (reference parity). Rows come from the
  // native approval queue (pending) + executed history.
  function agentActionQueueTable() {
    var pending = (state.approvals.pending || []).slice(0, 4);
    var executed = (state.approvals.history || []).slice(0, 2);
    var table = h("table", { class: "result-table aaq-table" });
    var thead = h("thead"), htr = h("tr");
    ["Account", "Recommended action", "Approval", "Execution", "Protected"].forEach(function (c, i) {
      htr.appendChild(h("th", { class: i === 4 ? "num" : "" }, [c]));
    });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = h("tbody");

    pending.forEach(function (a) {
      var approve = h("button", { class: "mini-btn go solid" }, ["Approve & execute"]);
      approve.addEventListener("click", function () { goto("approvals"); });
      var inspect = h("button", { class: "linklike" }, ["Inspect agent \u2192"]);
      inspect.addEventListener("click", function () { goto("cowork"); });
      tb.appendChild(h("tr", {}, [
        h("td", {}, [h("a", { class: "aaq-acct", href: snowsightObjHref("view", "GOLD_AGENT_ACTION_QUEUE"), target: "_blank", rel: "noopener" }, [a.accountId || a.accountName]),
          h("span", { class: "aaq-sub" }, [a.region || ""])]),
        h("td", {}, [a.recommendation || a.play || "\u2014"]),
        h("td", {}, [approvalPill("Pending")]),
        h("td", {}, [h("div", { class: "aaq-exec" }, [h("span", { class: "exec-badge warn" }, ["Waiting"]), h("div", { class: "aaq-actions" }, [approve, inspect])])]),
        h("td", { class: "num" }, [money(a.expectedRevenueProtected || a.revenueAtRisk || 0)])
      ]));
    });
    executed.forEach(function (r) {
      var inspect = h("button", { class: "linklike" }, ["Inspect agent \u2192"]);
      inspect.addEventListener("click", function () { goto("cowork"); });
      tb.appendChild(h("tr", {}, [
        h("td", {}, [h("a", { class: "aaq-acct", href: snowsightObjHref("view", "GOLD_AGENT_ACTION_QUEUE"), target: "_blank", rel: "noopener" }, [r.accountId || r.accountName]),
          h("span", { class: "aaq-sub" }, [r.region || ""])]),
        h("td", {}, [r.recommendation || "\u2014"]),
        h("td", {}, [approvalPill("Approved")]),
        h("td", {}, [h("div", { class: "aaq-exec" }, [h("span", { class: "exec-badge good" }, ["Executed"]), inspect])]),
        h("td", { class: "num" }, [money(r.actualRevenueProtected || 0)])
      ]));
    });
    if (!pending.length && !executed.length) {
      tb.appendChild(h("tr", {}, [h("td", { colspan: "5" }, [h("span", { class: "analyst-note" }, ["Loading the governed action queue\u2026"])])]));
    }
    table.appendChild(tb);

    return h("article", { class: "panel col-12 aaq-panel" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, ["Agent Action Queue"]), h("p", {}, ["Approve & execute starts a governed Domo Workflow (human approval + writeback to Snowflake)"])]),
        h("div", { class: "panel-head-actions" }, [
          (function () { var b = h("button", { class: "linklike strong" }, ["Approvals \u2192"]); b.addEventListener("click", function () { goto("approvals"); }); return b; })(),
          srcLink("GOLD_AGENT_ACTION_QUEUE", snowsightObjHref("view", "GOLD_AGENT_ACTION_QUEUE"), "sf")
        ])
      ]),
      h("div", { class: "table-wrap" }, [table]),
      h("p", { class: "aaq-foot" }, ["Cortex Agent called from Domo: ", h("a", { class: "src-link sf", href: snowsightAgentHref(), target: "_blank", rel: "noopener" }, ["REVENUE_CC_AGENT", h("span", { class: "src-arrow" }, ["\u2197"])]), " \u00b7 human approval routed through the native Domo Task Center queue."])
    ]);
  }

  // Governed Data Lineage (reference parity): 5 gold views federated into Domo
  // via Cloud Amplifier, each linking to BOTH the Snowflake view and the Domo dataset.
  function sourcesPanel() {
    var db = (state.config && state.config.database) || "SNOWFLAKE_REVENUE_CC";
    var schema = (state.config && state.config.schema) || "CORE";
    var grid = h("div", { class: "lineage-grid" });
    LINEAGE_VIEWS.forEach(function (v) {
      grid.appendChild(h("div", { class: "lineage-card" }, [
        h("div", { class: "lin-title" }, [h("img", { class: "brand-mark", src: "./public/brand/snowflake-mark.svg", alt: "" }), v.title]),
        h("div", { class: "lin-fqn" }, [db + "." + schema + "." + v.view]),
        h("div", { class: "lin-note" }, [v.note]),
        h("div", { class: "lin-links" }, [
          srcLink("Open Snowflake view", snowsightObjHref("view", v.view, db, schema), "sf"),
          srcLink("Open Domo dataset", domoDatasetHref(v.dataSetId), "domo")
        ])
      ]));
    });
    return h("article", { class: "panel col-12 lineage-panel" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [
          h("h2", {}, [h("img", { class: "head-mark", src: "./public/brand/domo-cloud-amplifier.svg", alt: "" }), "Governed Data Lineage"]),
          h("p", {}, ["Five Snowflake gold views, live-federated into Domo via the Snowflake Cloud Amplifier integration \u2014 no copies."])
        ]),
        h("span", { class: "panel-tag" }, ["Cloud Amplifier \u00b7 Horizon-governed"])
      ]),
      grid
    ]);
  }

  function renderHome(data) {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    // Pull the account-level action queue for the home table (deferred so the
    // synchronous loader can't re-enter this render pass).
    if (!state.approvals.loaded && !state.approvals.loading) setTimeout(loadApprovals, 0);

    var k = data.kpis;
    var histActuals = ((data.revenueForecast && data.revenueForecast.history) || []).map(function (p) { return p.actual; }).slice(-12);
    frag.appendChild(h("section", { class: "kpi-row" }, [
      kpiCard(k.netRevenue, { spark: histActuals, sparkColor: "var(--domo-blue)" }),
      kpiCard(k.revenueAtRisk, { cls: "is-warn", chip: "exposed", chipCls: "warn", spark: trendSeries(k.revenueAtRisk.value, 1), sparkColor: "var(--domo-orange)" }),
      kpiCard(k.protectedRevenue, { cls: "is-good", chip: "recovered", chipCls: "up", spark: trendSeries(k.protectedRevenue.value, 1), sparkColor: "var(--accent-sage)" }),
      kpiCard(k.slaBreachRate, { cls: "is-alt", chip: "trending", spark: trendSeries((k.slaBreachRate && k.slaBreachRate.breaches) || k.slaBreachRate.value, 1), sparkColor: "var(--accent-violet)" })
    ]));
    // Full-width forecast.
    frag.appendChild(h("section", { class: "grid" }, [forecastChart(data)]));
    // Two-column: Regional Renewal Risk + Insight Rail.
    frag.appendChild(h("section", { class: "grid" }, [regionalPanel(data), insightRail(data)]));
    // Full-width Agent Action Queue.
    frag.appendChild(h("section", { class: "grid" }, [agentActionQueueTable()]));
    // Full-width Governed Data Lineage.
    frag.appendChild(h("section", { class: "grid" }, [sourcesPanel()]));
    return frag;
  }

  /* ------------------------------ controls ------------------------------- */
  function buildPersonaSelect() {
    var menu = el("personaMenu"), sel = el("personaSelect"), trigger = sel.querySelector(".select-trigger"), valueEl = sel.querySelector(".select-value");
    PERSONAS.forEach(function (p) {
      var opt = h("div", { class: "select-option", role: "option", "aria-selected": p === state.persona ? "true" : "false" }, [p, h("span", { class: "check" })]);
      opt.addEventListener("click", function () {
        menu.querySelectorAll(".select-option").forEach(function (o) { o.setAttribute("aria-selected", "false"); });
        opt.setAttribute("aria-selected", "true"); valueEl.textContent = p; sel.classList.remove("open"); trigger.setAttribute("aria-expanded", "false");
        state.persona = p; refresh();
      });
      menu.appendChild(opt);
    });
    trigger.addEventListener("click", function () { var open = sel.classList.toggle("open"); trigger.setAttribute("aria-expanded", String(open)); });
    document.addEventListener("click", function (e) { if (!sel.contains(e.target)) { sel.classList.remove("open"); trigger.setAttribute("aria-expanded", "false"); } });
  }

  function refresh() {
    setMode();
    // Region-scoped surfaces reload lazily on next view after a persona change.
    state.approvals.loaded = false;
    loadData(state.persona).then(function (data) {
      state.data = data; setMode();
      el("sourceLabel").textContent = data.source || "SNOWFLAKE_REVENUE_CC.CORE";
      renderView();
    });
  }

  function init() {
    ceInstrument();
    ensureDiagWidget();
    buildPersonaSelect();
    initRail();
    renderTabs();
    refresh();
    // Close the semantic-view picker on any outside click.
    document.addEventListener("click", function () {
      if (state.analyst.pickerOpen) { state.analyst.pickerOpen = false; if (state.surface === "analyst") renderView(); }
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
