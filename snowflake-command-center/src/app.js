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
    { id: "chat", label: "Domo Chat v2", sprint: 9, mark: "domo-ai-agent.svg", gated: true,
      items: ["Conversational delivery layer across governed Domo + Snowflake context", "MCP client \u2192 the Snowflake-managed MCP server (same Agent/Analyst/Search tools)", "Enabled in the target Domo instance \u2014 never simulated here"] },
    { id: "analyst", label: "Cortex Analyst", sprint: 3, mark: "snowflake-cortex.svg",
      items: ["Ask \u201cwhy\u201d in natural language over the governed semantic view", "Answer + generated SQL + result rows", "Domo-side chart reconstruction + API inspector"] },
    { id: "semantic", label: "Semantic Model", sprint: 3, mark: "snowflake-cortex.svg",
      items: ["Live entity graph of the governed semantic view", "Verified-query gallery (the queries Cortex trusts)", "Model DDL builder \u2014 evolve dimensions, metrics, relationships"] },
    { id: "agents", label: "Cortex Agent Queue", sprint: 4, mark: "snowflake-cortex.svg",
      items: ["One Cortex Agent (Analyst + Search + tools)", "Recommendations with human-approval gates", "Animated agent\u21c4agent Action Journey"] },
    { id: "approvals", label: "Approvals", sprint: 6, mark: "domo-approvals.svg",
      items: ["Workflow approval queue (open / completed / voided)", "In-app Approve / Reject resumes the workflow", "Status writes back to Snowflake"] },
    { id: "ml", label: "Snowflake ML", sprint: 5, mark: "snowflake-mark.svg",
      items: ["Score any account live from the Model Registry", "Request / response inspector (SQL · curl · Python)", "Accept a prediction \u2192 seeds a scenario"] },
    { id: "ops", label: "Snowflake Ops", sprint: 5, mark: "snowflake-mark.svg",
      items: ["Hybrid Tables workspace", "Browse / add / edit / delete scenario runs", "Prediction feedback CRUD (operational memory)"] },
    { id: "readiness", label: "Horizon AI Readiness", sprint: 7, mark: "domo-pdp.svg",
      items: ["Two-persona parity test \u2014 same question, different governed rows", "Row-access + column-masking policies enforced at the query engine", "Guardrails / observability status + Domo AI Readiness parity"] },
    { id: "cowork", label: "CoWork \u00b7 MCP", sprint: 8, mark: "snowflake-cortex.svg",
      items: ["Snowflake CoWork (Deep Research, Skills) scoped by Horizon", "Snowflake-managed MCP outward", "Domo Essentials MCP outward (beta follow-on)"] },
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

  // Domo instance + Cloud Amplifier data models. These mirror the Snowflake
  // semantic view REVENUE_CC_ANALYST on the Domo side: the same federated
  // Snowflake tables (registered via Cloud Amplifier) joined into governed
  // star schemas. The beta Data Model API caps at 4 primary relationships per
  // model, so the 14-relationship semantic view is represented as three
  // companion models (account / tenant / product hubs).
  var DOMO_INSTANCE = "https://snowflake-demo.domo.com";
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
    analyst: { input: "", loading: false, error: null, messages: [], conversationHistory: [], recent: [], recentLoaded: false, seq: 0 },
    semantic: { loading: false, loaded: false, error: null, live: false, model: null, view: null, sql: null, tab: "graph", selected: null, vqResults: {}, vqBusy: {}, ddlResult: null, ddlBusy: false },
    config: { warehouse: "REVENUE_CC_WH", database: "SNOWFLAKE_REVENUE_CC", schema: "CORE", role: "REVENUE_CC_READER", view: "REVENUE_CC_ANALYST" },
    agent: { question: "", loading: false, error: null, result: null, queue: [], seed: null, inspector: false },
    ml: { accountId: "", loading: false, error: null, result: null, inspector: false, seed: null },
    ops: { loading: false, loaded: false, error: null, scenarios: [], feedback: [], note: null, tab: "scenarios" },
    approvals: { loading: false, loaded: false, error: null, live: false, seed: null, pending: [], writeback: [], history: [], protected: null, byId: {}, active: null, note: null, busy: null },
    governance: { loading: false, loaded: false, error: null, live: false, seed: null, parity: null, masking: null },
    cowork: { loading: false, loaded: false, error: null, live: false, mcp: null, cowork: null },
    how: { loading: false, loaded: false, error: null, coco: null }
  };

  function isLive() { return typeof domo !== "undefined" && domo && typeof domo.post === "function"; }

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
    while (cur && typeof cur === "object" && "response" in cur && depth < 6) { cur = cur.response; depth += 1; }
    return cur;
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

  // Run a SQL statement against a federated (Cloud Amplifier) dataset alias and
  // return row objects keyed by column name. Domo SQL API returns {columns, rows}.
  function amplifierQuery(alias, sql) {
    return domo.post("/sql/v1/" + alias, sql, { contentType: "text/plain" })
      .then(function (res) {
        var cols = (res && res.columns) || [];
        var rows = (res && res.rows) || (Array.isArray(res) ? res : []);
        return rows.map(function (row) {
          if (Array.isArray(row)) { var o = {}; cols.forEach(function (c, i) { o[c] = row[i]; }); return o; }
          return row;
        });
      });
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
      "FROM table WHERE 1=1" + regClause + " GROUP BY `FISCAL_PERIOD` ORDER BY `FISCAL_PERIOD` DESC LIMIT 14";
    var qRar = "SELECT SUM(`REVENUE_AT_RISK`) AS v FROM table WHERE `RISK_MONTH` = '" + monthStart + "'" + regClause;
    var qProtected = "SELECT SUM(`ACTUAL_REVENUE_PROTECTED`) AS v FROM table WHERE `EXECUTION_STATUS` = 'Executed'" + regClause;
    var qSla = "SELECT SUM(CASE WHEN `SLA_BREACHED_FLAG` = 'true' THEN 1 ELSE 0 END) AS breaches, COUNT(*) AS cases " +
      "FROM table WHERE `DATE` >= '" + date90 + "'" + regClause;
    var qForecast = "SELECT `PERIOD_MONTH`, `KIND`, `ACTUAL`, `FORECAST`, `LOWER_BOUND`, `UPPER_BOUND` FROM table ORDER BY `PERIOD_MONTH`";
    var qRegional = "SELECT `REGION`, `SEGMENT`, ROUND(AVG(`RENEWAL_RISK_SCORE`),1) AS avgrisk, " +
      "SUM(CASE WHEN `RISK_TIER` = 'High' THEN 1 ELSE 0 END) AS highrisk, SUM(`REVENUE_AT_RISK`) AS rar " +
      "FROM table WHERE `RISK_MONTH` = '" + monthStart + "'" + regClause + " GROUP BY `REGION`, `SEGMENT` ORDER BY rar DESC LIMIT 12";
    var qQueue = "SELECT SUM(CASE WHEN `APPROVAL_STATUS`='Pending' THEN 1 ELSE 0 END) AS pending, " +
      "SUM(CASE WHEN `APPROVAL_STATUS`='Approved' THEN 1 ELSE 0 END) AS approved, " +
      "SUM(CASE WHEN `EXECUTION_STATUS`='Executed' THEN 1 ELSE 0 END) AS executed, " +
      "SUM(CASE WHEN `APPROVAL_STATUS`='Rejected' THEN 1 ELSE 0 END) AS rejected, " +
      "SUM(CASE WHEN `APPROVAL_STATUS`='Not Required' THEN 1 ELSE 0 END) AS notrequired " +
      "FROM table WHERE 1=1" + regClause;
    var qTop = "SELECT `RECOMMENDATION` AS action, COUNT(*) AS cnt, SUM(`EXPECTED_REVENUE_PROTECTED`) AS rar " +
      "FROM table WHERE 1=1" + regClause + " GROUP BY `RECOMMENDATION` ORDER BY cnt DESC LIMIT 5";

    return amplifierQuery(CA.rev, qAV).then(function (av) {
      if (!av.length) throw new Error("no federated revenue rows");
      var cur = num(av[0].actual), prior = av.length > 1 ? num(av[1].actual) : 0;
      out.kpis.netRevenue = { label: "Net Revenue (MTD)", value: cur, priorValue: prior,
        deltaPct: prior ? Math.round(((cur - prior) / prior) * 1000) / 10 : 0, unit: "USD" };
      out.actualVsForecast = av.slice().reverse().map(function (r) { return { period: r.period, actual: num(r.actual), forecast: num(r.forecast) }; });
      return amplifierQuery(CA.risk, qRar);
    }).then(function (rows) {
      out.kpis.revenueAtRisk = { label: "Revenue at Risk", value: num(rows[0] && rows[0].v), unit: "USD", context: "current month" };
      return amplifierQuery(CA.actions, qProtected);
    }).then(function (rows) {
      out.kpis.protectedRevenue = { label: "Protected Revenue", value: num(rows[0] && rows[0].v), unit: "USD", context: "executed agent actions" };
      return amplifierQuery(CA.support, qSla);
    }).then(function (rows) {
      var r = rows[0] || {}; var breaches = num(r.breaches), cases = num(r.cases);
      out.kpis.slaBreachRate = { label: "SLA Breach Rate (90d)", value: cases ? Math.round((breaches / cases) * 1000) / 10 : 0, unit: "%", breaches: breaches, cases: cases };
      return amplifierQuery(CA.forecast, qForecast).catch(function () { return []; });
    }).then(function (rows) {
      if (rows && rows.length) {
        var history = [], forecast = [];
        rows.forEach(function (r) {
          var period = String(r.PERIOD_MONTH || "").slice(0, 7);
          if (String(r.KIND) === "forecast") forecast.push({ period: period, forecast: num(r.FORECAST), lower: num(r.LOWER_BOUND), upper: num(r.UPPER_BOUND) });
          else history.push({ period: period, actual: num(r.ACTUAL) });
        });
        out.revenueForecast = { source: "SNOWFLAKE_REVENUE_CC.CORE.GOLD_REVENUE_FORECAST via Cloud Amplifier (SNOWFLAKE.ML.FORECAST)",
          grain: "month", unit: "USD", predictionInterval: 0.95, history: history, forecast: forecast };
      }
      return amplifierQuery(CA.risk, qRegional);
    }).then(function (rows) {
      out.regionalRisk = rows.map(function (r) { return { region: r.REGION, segment: r.SEGMENT, avgRisk: num(r.avgrisk), highRiskAccounts: num(r.highrisk), revenueAtRisk: num(r.rar) }; });
      return amplifierQuery(CA.actions, qQueue);
    }).then(function (rows) {
      var r = rows[0] || {};
      out.actionQueue = { pending: num(r.pending), approved: num(r.approved), executed: num(r.executed), rejected: num(r.rejected), notRequired: num(r.notrequired), topActions: [] };
      return amplifierQuery(CA.actions, qTop);
    }).then(function (rows) {
      out.actionQueue.topActions = rows.map(function (r) { return { action: r.action, count: num(r.cnt), revenueAtRisk: num(r.rar) }; });
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

  function newChat() {
    state.analyst.messages = [];
    state.analyst.conversationHistory = [];
    state.analyst.error = null;
    state.analyst.input = "";
    renderView();
  }

  function runAnalyst(question) {
    var q = String(question || "").trim();
    if (!q || state.analyst.loading) return;
    state.analyst.input = "";
    state.analyst.loading = true;
    state.analyst.error = null;
    state.analyst.pending = q;
    renderView(); scrollChat();
    var done = function (res) {
      state.analyst.loading = false; state.analyst.pending = null;
      if (Array.isArray(res.conversationHistory)) state.analyst.conversationHistory = res.conversationHistory;
      var turn = { id: state.analyst.seq++, question: q, res: res, chartType: "bar", inspector: false };
      state.analyst.messages.push(turn);
      saveRecent(turn);
      renderView(); scrollChat();
    };
    var fail = function (err) {
      state.analyst.loading = false; state.analyst.pending = null;
      state.analyst.error = String(err && err.message ? err.message : err);
      renderView();
    };
    if (isLive()) {
      domo.post(CE + "askAnalyst", { question: q, persona: state.persona, conversationHistory: state.analyst.conversationHistory })
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

      // SQL
      if (res.sql) {
        body.appendChild(h("div", { class: "msg-block" }, [
          h("div", { class: "msg-block-head" }, [h("span", {}, ["Generated SQL"]), copyBtn(res.sql, "Copy SQL")]),
          h("pre", { class: "sql-block" }, [h("code", {}, [res.sql])])
        ]));
      }

      // Result: chart + type switcher + CSV + table
      if ((res.rows || []).length) {
        var spec = chartSpec(res);
        var tools = h("div", { class: "msg-block-head" }, [h("span", {}, [num((res.rows || []).length) + " rows"])]);
        var right = h("div", { class: "chart-tools" });
        if (spec) {
          ["bar", "line", "pie"].forEach(function (t) {
            var b = h("button", { class: "seg" + (turn.chartType === t ? " active" : "") }, [t.charAt(0).toUpperCase() + t.slice(1)]);
            b.addEventListener("click", function () { turn.chartType = t; renderView(); });
            right.appendChild(b);
          });
        }
        var csv = h("button", { class: "mini-btn" }, ["CSV"]);
        csv.addEventListener("click", function () { downloadCsv("analyst-result-" + turn.id + ".csv", res.columns || [], res.rows || []); });
        right.appendChild(csv);
        tools.appendChild(right);
        var block = h("div", { class: "msg-block" }, [tools]);
        if (spec) { var ch = buildChart(turn); if (ch) block.appendChild(ch); }
        block.appendChild(resultTable(res, 50));
        body.appendChild(block);
      }

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

      // Footer meta + inspector toggle
      var meta = h("div", { class: "msg-meta" }, [
        h("span", {}, [res.semanticView || "REVENUE_CC_ANALYST"]),
        res.requestId ? h("span", { class: "req" }, ["request_id " + String(res.requestId).slice(0, 8)]) : null
      ]);
      var insp = h("button", { class: "mini-btn ghost" }, [turn.inspector ? "Hide API" : "Inspect API"]);
      insp.addEventListener("click", function () { turn.inspector = !turn.inspector; renderView(); });
      meta.appendChild(insp);
      body.appendChild(meta);
      if (turn.inspector) {
        var api = res.api || {};
        var ins = h("div", { class: "inspector-body" });
        ins.appendChild(h("div", { class: "insp-label" }, ["POST " + (api.endpoint || "/api/v2/cortex/analyst/message")]));
        ins.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(api.request || { note: "Populated on live calls through the snowflakece bridge." }, null, 2)])]));
        if (api.response) { ins.appendChild(h("div", { class: "insp-label" }, ["Response"])); ins.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [JSON.stringify(api.response, null, 2)])])); }
        body.appendChild(ins);
      }
    }
    card.appendChild(body);
    return card;
  }

  function userMsg(text) {
    return h("div", { class: "msg msg-user" }, [h("div", { class: "msg-body" }, [h("p", {}, [text])])]);
  }

  function renderAnalyst() {
    if (!state.analyst.recentLoaded) loadRecent().then(function () { if (state.surface === "analyst") renderView(); });
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);

    var hasMsgs = state.analyst.messages.length > 0;

    // Transcript
    var scroll = h("div", { class: "chat-scroll" });
    if (!hasMsgs && !state.analyst.loading) {
      scroll.appendChild(h("div", { class: "analyst-empty" }, [
        h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" }),
        h("h2", {}, ["Ask the governed brain a question"]),
        h("p", {}, ["A multi-turn Cortex Analyst chat over the ", h("code", {}, ["REVENUE_CC_ANALYST"]), " semantic view. Every answer returns the generated SQL and live rows \u2014 fully governed, never a client-side guess. Ask a follow-up and it keeps context."])
      ]));
    }
    state.analyst.messages.forEach(function (turn) {
      scroll.appendChild(userMsg(turn.question));
      scroll.appendChild(analystAnswer(turn));
    });
    if (state.analyst.loading) {
      if (state.analyst.pending) scroll.appendChild(userMsg(state.analyst.pending));
      scroll.appendChild(h("div", { class: "msg msg-analyst" }, [
        h("div", { class: "msg-avatar" }, [h("img", { src: "./public/brand/snowflake-cortex.svg", alt: "" })]),
        h("div", { class: "msg-body" }, [h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Interpreting your question and generating governed SQL\u2026"])])
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

    var main = h("div", { class: "chat-main" }, [
      h("div", { class: "chat-head" }, [
        h("div", {}, [h("h2", {}, ["Cortex Analyst"]), h("p", {}, [(state.analyst.conversationHistory.length ? Math.floor(state.analyst.conversationHistory.length / 2) + " turns in context \u00b7 " : "") + "Conversational NL \u2192 governed SQL"])]),
        (function () { var b = h("button", { class: "mini-btn ghost" }, ["\u21bb New chat"]); b.addEventListener("click", newChat); return b; })()
      ]),
      scroll, composer
    ]);

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
    state.semantic.loading = true; renderView();
    var done = function (payload, live) {
      state.semantic.model = payload.model || null;
      state.semantic.view = payload.view || null;
      state.semantic.sql = payload.sql || null;
      state.semantic.live = !!live;
      state.semantic.loading = false; state.semantic.loaded = true;
      if (state.surface === "semantic") renderView();
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
    if (!state.semantic.loaded && !state.semantic.loading) loadSemantic();
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);

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
              searchQuery: d.searchQuery, citations: d.citations || [], toolsFired: d.toolsFired || {}, api: d.api });
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

  function agentAnswerPanels(res) {
    var frag = document.createDocumentFragment();
    if (res.unmatched) {
      frag.appendChild(h("article", { class: "panel col-12" }, [
        h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["No offline answer"]), h("p", {}, ["Golden-path scenario only in sample mode"])])]),
        h("p", { class: "analyst-note" }, [res.answer])
      ]));
      return frag;
    }

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
        h("pre", { class: "sql-block" }, [h("code", {}, [res.sql])])
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
    var q = recommendationQueue(); if (q) frag.appendChild(q);
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
    state.ml.loading = true; state.ml.error = null; state.ml.result = null; state.ml.inspector = false;
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

  function mlResultPanels(res) {
    var frag = document.createDocumentFragment();
    var hi = res.predictedClass === 1 || /high/i.test(res.predictedLabel || "");
    var feats = res.features || {};

    // Verdict card
    var verdict = h("article", { class: "panel col-8 ml-verdict" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, [res.accountName || res.accountId]), h("p", {}, [(res.region || "\u2014") + " \u00b7 " + (res.segment || "\u2014") + " \u00b7 " + money(res.arr) + " ARR"])]),
        h("span", { class: "panel-tag" }, [res.accountId])
      ]),
      h("div", { class: "ml-verdict-row" }, [
        h("div", { class: "gauge-wrap" }, [probGauge(res.predictedProbability), h("span", { class: "gauge-cap" }, ["P(high risk)"])]),
        h("div", { class: "ml-verdict-body" }, [
          h("span", { class: "ml-label " + (hi ? "bad" : "good") }, [res.predictedLabel || (hi ? "High Risk" : "Low Risk")]),
          h("p", { class: "ml-verdict-note" }, [hi
            ? "The model flags this account as a renewal risk. Review the drivers and route a save play to the agent queue."
            : "The model does not flag this account. Feature signals are within healthy ranges."]),
          h("div", { class: "ml-model-chips" }, [
            metricChip("Model", (res.model && res.model.name) || "REVENUE_CC_RISK_MODEL"),
            metricChip("Version", "v" + ((res.model && res.model.version) || "\u2014")),
            metricChip("Latency", ((res.model && res.model.latencySec) || 3.5) + "s")
          ])
        ])
      ])
    ]);
    var accept = h("button", { class: "pill-btn go solid" }, ["Accept prediction \u2192 seed scenario"]);
    accept.addEventListener("click", function () { acceptPrediction(res); });
    verdict.appendChild(h("div", { class: "ml-verdict-actions" }, [accept]));
    frag.appendChild(verdict);

    // Feature values used
    var fvals = [
      ["Annual recurring revenue", money(feats.arr != null ? feats.arr : res.arr)],
      ["Support cases (90d)", num(feats.cases90d)],
      ["SLA breaches (90d)", num(feats.slaBreaches90d)],
      ["Negative-sentiment cases (90d)", num(feats.negativeCases90d)],
      ["Avg usage score (90d)", (Number(feats.avgUsageScore90d) || 0).toFixed(1)],
      ["Usage-drop days (90d)", num(feats.usageDropDays90d)]
    ];
    var fl = h("div", { class: "feature-list" });
    fvals.forEach(function (row) { fl.appendChild(h("div", { class: "feature-row" }, [h("span", { class: "fr-label" }, [row[0]]), h("span", { class: "fr-val" }, [row[1]])])); });
    frag.appendChild(h("article", { class: "panel col-4" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Feature vector"]), h("p", {}, ["Inputs sent to the model"])])]), fl
    ]));

    // Model card + importances
    var m = res.model || {};
    frag.appendChild(h("article", { class: "panel col-6" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Model card"]), h("p", {}, ["Snowflake-native, trained + served in-warehouse"])]), h("span", { class: "panel-tag" }, ["Snowflake ML"])]),
      h("div", { class: "modelcard" }, [
        h("div", { class: "mc-line" }, [h("span", {}, ["Type"]), h("span", {}, [m.type || "SNOWFLAKE.ML.CLASSIFICATION"])]),
        h("div", { class: "mc-line" }, [h("span", {}, ["Target"]), h("span", {}, [m.target || "IS_HIGH_RISK"])]),
        h("div", { class: "mc-line" }, [h("span", {}, ["Training rows"]), h("span", {}, [num(m.trainingRows || 96000)])]),
        h("div", { class: "mc-line" }, [h("span", {}, ["Inference"]), h("span", {}, ["native warehouse (SQL)"])])
      ])
    ]));
    var fib = featureImportanceBar(m);
    frag.appendChild(h("article", { class: "panel col-6" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Top feature importances"]), h("p", {}, ["Global model drivers"])])]),
      fib || h("p", { class: "analyst-note" }, ["Importances load from the model card."])
    ]));

    // Request / response inspector (SQL / curl / Python)
    var acctId = res.accountId;
    var sql = res.sql || ("SELECT * FROM TABLE(SNOWFLAKE_REVENUE_CC.CORE.PREDICT_RENEWAL_RISK('" + acctId + "'))");
    var curl = "curl -X POST \"https://<account>.snowflakecomputing.com/api/v2/statements\" \\\n  -H \"Authorization: Bearer <jwt>\" \\\n  -H \"Content-Type: application/json\" \\\n  -d '{\"statement\":\"" + sql.replace(/"/g, "\\\"") + "\",\"role\":\"REVENUE_CC_READER\",\"warehouse\":\"REVENUE_CC_WH\"}'";
    var py = "from snowflake.snowpark import Session\n# session bound to REVENUE_CC_READER\nrow = session.sql(\n    \"SELECT * FROM TABLE(SNOWFLAKE_REVENUE_CC.CORE.PREDICT_RENEWAL_RISK('" + acctId + "'))\"\n).collect()[0]\nprint(row['PREDICTED_LABEL'], row['PREDICTED_RISK_PROBABILITY'])";
    var body = h("div", { class: "inspector-body" });
    body.appendChild(h("div", { class: "insp-label" }, ["SQL (native inference)"]));
    body.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [sql])]));
    body.appendChild(h("div", { class: "insp-label" }, ["SQL API \u00b7 curl"]));
    body.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [curl])]));
    body.appendChild(h("div", { class: "insp-label" }, ["Snowpark \u00b7 Python"]));
    body.appendChild(h("pre", { class: "sql-block" }, [h("code", {}, [py])]));
    var toggle = h("button", { class: "pill-btn inspect" }, [state.ml.inspector ? "Hide request/response" : "Inspect request/response"]);
    toggle.addEventListener("click", function () { state.ml.inspector = !state.ml.inspector; renderView(); });
    var inspector = h("article", { class: "panel col-12 inspector" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Request / response"]), h("p", {}, ["The exact governed call \u2014 SQL, curl, and Snowpark"])]), toggle])
    ]);
    if (state.ml.inspector) inspector.appendChild(body);
    frag.appendChild(inspector);

    return frag;
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

    // Ask/pick bar
    var input = h("input", { class: "analyst-input", type: "text", placeholder: "Enter an account id (e.g. ACC-00008) to score live\u2026", value: state.ml.accountId || "" });
    var scoreBtn = h("button", { class: "pill-btn primary analyst-ask" }, ["Score account"]);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") runScore(input.value); });
    scoreBtn.addEventListener("click", function () { runScore(input.value); });
    var chips = h("div", { class: "suggest-chips" });
    var seed = state.ml.seed;
    var chipAccts = seed ? (seed.accounts || []).slice(0, 6) : [{ accountId: "ACC-00008" }, { accountId: "ACC-00016" }, { accountId: "ACC-00002" }];
    chipAccts.forEach(function (a) {
      var c = h("button", { class: "chip" }, [a.accountId + (a.accountName ? " \u00b7 " + a.accountName : "")]);
      c.addEventListener("click", function () { runScore(a.accountId); });
      chips.appendChild(c);
    });
    frag.appendChild(h("section", { class: "analyst-ask-bar" }, [
      h("div", { class: "ask-row" }, [input, scoreBtn]),
      h("div", { class: "ask-suggest" }, [h("span", { class: "ask-suggest-lab" }, ["Score"]), chips])
    ]));

    if (!seed && !state.ml.loading) { loadMLSeed().then(function () { if (state.surface === "ml") renderView(); }); }

    if (state.ml.loading) {
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Scoring the account with the native Snowflake ML model\u2026"]));
    } else if (state.ml.error) {
      frag.appendChild(h("div", { class: "conn-banner" }, [h("div", {}, [h("span", { class: "cb-title" }, ["Score error \u2014 "]), state.ml.error])]));
    } else if (state.ml.result) {
      frag.appendChild(h("section", { class: "grid" }, [mlResultPanels(state.ml.result)]));
    } else {
      frag.appendChild(h("div", { class: "analyst-empty" }, [
        h("img", { src: "./public/brand/snowflake-mark.svg", alt: "" }),
        h("h2", {}, ["Score an account against the governed model"]),
        h("p", {}, ["The ", h("code", {}, ["REVENUE_CC_RISK_MODEL"]), " renewal-risk classifier is trained and served natively in Snowflake. Pick an account to get a live probability, the exact feature vector, and the governed SQL call \u2014 no data leaves the warehouse."])
      ]));
    }
    return frag;
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

  var SCEN_STATUS = ["Open", "Mitigating", "Closed"];
  function cycleStatus(s) { var i = SCEN_STATUS.indexOf(s || "Open"); return SCEN_STATUS[(i + 1) % SCEN_STATUS.length]; }

  function scenarioCard(sc) {
    var next = cycleStatus(sc.status);
    var statusBtn = h("button", { class: "pill-btn ghost xs" }, ["Set " + next]);
    statusBtn.addEventListener("click", function () {
      opsMutate("updateScenarioStatus", { scenarioId: sc.scenarioId, status: next }, function () { sc.status = next; });
    });
    var delBtn = h("button", { class: "pill-btn ghost xs danger" }, ["Delete"]);
    delBtn.addEventListener("click", function () {
      opsMutate("deleteScenario", { scenarioId: sc.scenarioId }, function () { state.ops.scenarios = state.ops.scenarios.filter(function (x) { return x !== sc; }); });
    });
    var stCls = sc.status === "Closed" ? "good" : sc.status === "Mitigating" ? "warn" : "info";
    return h("article", { class: "scen-card" }, [
      h("div", { class: "scen-top" }, [
        h("div", {}, [h("span", { class: "scen-account" }, [sc.accountName || sc.accountId]), h("span", { class: "scen-meta" }, [(sc.region || "") + " \u00b7 " + (sc.segment || "") + " \u00b7 " + (sc.accountId || "")])]),
        h("span", { class: "scen-status " + stCls }, [sc.status || "Open"])
      ]),
      h("div", { class: "scen-name" }, [sc.scenarioName || "Scenario"]),
      sc.assumptionNotes ? h("p", { class: "scen-notes" }, [sc.assumptionNotes]) : null,
      h("div", { class: "scen-foot" }, [
        h("span", { class: "scen-chip" }, ["P(risk) " + ((Number(sc.predictedRiskProbability) || 0) * 100).toFixed(0) + "%"]),
        h("span", { class: "scen-chip" }, [money(sc.projectedRevenueAtRisk) + " at risk"]),
        sc.createdBy ? h("span", { class: "scen-by" }, ["by " + sc.createdBy]) : null
      ]),
      h("div", { class: "scen-actions" }, [statusBtn, delBtn])
    ]);
  }

  function feedbackRow(f) {
    var vCls = /agree/i.test(f.humanVerdict) && !/dis/i.test(f.humanVerdict) ? "good" : /disagree/i.test(f.humanVerdict) ? "bad" : "warn";
    return h("tr", {}, [
      h("td", {}, [f.accountId]),
      h("td", {}, [h("span", { class: "verdict " + vCls }, [f.humanVerdict || "\u2014"])]),
      h("td", { class: "num" }, [((Number(f.predictedRiskProbability) || 0) * 100).toFixed(0) + "%"]),
      h("td", {}, [f.modelVersion ? (/^v/i.test(f.modelVersion) ? f.modelVersion : "v" + f.modelVersion) : "\u2014"]),
      h("td", {}, [f.comment || "\u2014"]),
      h("td", {}, [f.createdBy || "\u2014"])
    ]);
  }

  function newScenarioForm() {
    var acc = h("input", { class: "ops-in", type: "text", placeholder: "Account id (ACC-00008)" });
    var name = h("input", { class: "ops-in", type: "text", placeholder: "Scenario name" });
    var risk = h("input", { class: "ops-in sm", type: "text", placeholder: "Rev at risk ($)" });
    var notes = h("input", { class: "ops-in wide", type: "text", placeholder: "Assumption notes" });
    var add = h("button", { class: "pill-btn go solid" }, ["Add scenario"]);
    add.addEventListener("click", function () {
      var id = String(acc.value || "").trim().toUpperCase(); if (!id) return;
      var seedAcct = (state.ml.seed && (state.ml.seed.accounts || []).filter(function (a) { return a.accountId === id; })[0]) || {};
      var payload = { accountId: id, accountName: seedAcct.accountName || id, region: seedAcct.region || "", segment: seedAcct.segment || "",
        scenarioName: name.value || "What-if scenario", predictedRiskProbability: seedAcct.predictedProbability || null,
        assumptionNotes: notes.value || "", projectedRevenueAtRisk: Number(String(risk.value).replace(/[^0-9.]/g, "")) || 0, status: "Open", createdBy: state.persona };
      opsMutate("createScenario", payload, function () { state.ops.scenarios.unshift(Object.assign({ scenarioId: "local-" + Date.now(), createdTs: new Date().toISOString() }, payload)); });
    });
    return h("div", { class: "ops-form" }, [acc, name, risk, notes, add]);
  }

  function newFeedbackForm() {
    var acc = h("input", { class: "ops-in", type: "text", placeholder: "Account id" });
    var verdict = h("select", { class: "ops-in sm" }, [h("option", {}, ["Agree"]), h("option", {}, ["Disagree"]), h("option", {}, ["Unsure"])]);
    var comment = h("input", { class: "ops-in wide", type: "text", placeholder: "Comment" });
    var add = h("button", { class: "pill-btn go solid" }, ["Add feedback"]);
    add.addEventListener("click", function () {
      var id = String(acc.value || "").trim().toUpperCase(); if (!id) return;
      var seedAcct = (state.ml.seed && (state.ml.seed.accounts || []).filter(function (a) { return a.accountId === id; })[0]) || {};
      var payload = { accountId: id, modelVersion: (state.ml.seed && state.ml.seed.model && state.ml.seed.model.version) || "10.0",
        predictedRiskProbability: seedAcct.predictedProbability || null, humanVerdict: verdict.value, correctedLabel: "", comment: comment.value || "", createdBy: state.persona };
      opsMutate("createFeedback", payload, function () { state.ops.feedback.unshift(Object.assign({ feedbackId: "local-" + Date.now(), createdTs: new Date().toISOString() }, payload)); });
    });
    return h("div", { class: "ops-form" }, [acc, verdict, comment, add]);
  }

  function renderOps() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);

    if (!state.ops.loaded && !state.ops.loading) { loadOps(); }
    if (state.ops.loading) { frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Reading the Hybrid Tables (operational state)\u2026"])); return frag; }

    if (state.ops.note) {
      frag.appendChild(h("div", { class: "ops-note" }, [state.ops.note]));
    }

    // Sub-tabs
    var subtabs = h("div", { class: "ops-subtabs" });
    [["scenarios", "Scenario runs", state.ops.scenarios.length], ["feedback", "Prediction feedback", state.ops.feedback.length]].forEach(function (t) {
      var b = h("button", { class: "ops-subtab" + (state.ops.tab === t[0] ? " active" : "") }, [t[1] + " (" + t[2] + ")"]);
      b.addEventListener("click", function () { state.ops.tab = t[0]; renderView(); });
      subtabs.appendChild(b);
    });
    frag.appendChild(h("div", { class: "ops-head" }, [
      h("div", {}, [h("h2", { class: "ops-title" }, ["Snowflake Ops \u00b7 Hybrid Tables"]),
        h("p", { class: "ops-sub" }, ["Millisecond OLTP state inside Snowflake \u2014 what-if scenarios and human feedback on the model, governed by the same roles."])]),
      subtabs
    ]));

    if (state.ops.tab === "scenarios") {
      frag.appendChild(newScenarioForm());
      var grid = h("div", { class: "scen-grid" });
      if (!state.ops.scenarios.length) grid.appendChild(h("p", { class: "analyst-note" }, ["No scenarios yet. Accept a prediction on the Snowflake ML tab or add one above."]));
      state.ops.scenarios.forEach(function (sc) { grid.appendChild(scenarioCard(sc)); });
      frag.appendChild(grid);
    } else {
      frag.appendChild(newFeedbackForm());
      var table = h("table", { class: "result-table ops-table" });
      var thead = h("thead"), htr = h("tr");
      ["Account", "Verdict", "P(risk)", "Model", "Comment", "By"].forEach(function (c) { htr.appendChild(h("th", {}, [c])); });
      thead.appendChild(htr); table.appendChild(thead);
      var tb = h("tbody");
      if (!state.ops.feedback.length) { var tr = h("tr"); tr.appendChild(h("td", { colspan: "6" }, ["No feedback yet."])); tb.appendChild(tr); }
      state.ops.feedback.forEach(function (f) { tb.appendChild(feedbackRow(f)); });
      table.appendChild(tb);
      frag.appendChild(h("div", { class: "table-wrap" }, [table]));
    }

    // Provenance footnote
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

  // kind: 'approve' | 'execute' | 'reject'
  function actOn(actionId, kind) {
    var info = state.approvals.byId[actionId] || {};
    var payload = { actionId: actionId, accountId: info.accountId, accountName: info.accountName, region: info.region, recommendation: info.recommendation, approvedBy: state.persona };
    if (kind === "approve") { payload.approvalStatus = "Approved"; payload.executionStatus = "Pending"; payload.actualRevenueProtected = null; }
    else if (kind === "execute") { payload.approvalStatus = "Approved"; payload.executionStatus = "Executed"; payload.actualRevenueProtected = Number(info.expectedRevenueProtected) || 0; }
    else { payload.approvalStatus = "Rejected"; payload.executionStatus = "Voided"; payload.actualRevenueProtected = null; }
    state.approvals.active = actionId; state.approvals.busy = actionId + ":" + kind;

    if (isLive()) {
      renderView();
      domo.post(CE + "writeActionStatus", payload).then(function (resp) {
        var d = unwrap(resp);
        state.approvals.busy = null;
        if (!d || d.status !== "SUCCEEDED") { state.approvals.note = "Writeback failed: " + ((d && d.error) || "unknown"); renderView(); return; }
        loadApprovals();
      }).catch(function (err) { state.approvals.busy = null; state.approvals.note = "Writeback failed: " + (err && err.message ? err.message : err); renderView(); });
      return;
    }
    // Sample mode: maintain a local writeback set
    var wb = state.approvals.writeback;
    var row = wb.filter(function (r) { return r.actionId === actionId; })[0];
    if (!row) { row = { actionId: actionId, accountId: info.accountId, accountName: info.accountName, region: info.region, recommendation: info.recommendation }; wb.push(row); }
    row.approvalStatus = payload.approvalStatus; row.executionStatus = payload.executionStatus; row.approvedBy = payload.approvedBy;
    row.actualRevenueProtected = payload.actualRevenueProtected; row.completedTs = kind === "execute" ? new Date().toISOString() : null;
    state.approvals.busy = null;
    state.approvals.note = "Sample mode \u2014 writeback is local only. Connect the snowflakece bridge to persist to the AGENT_ACTION_WRITEBACK hybrid table under REVENUE_CC_WRITER.";
    recomputeLocalProtected(); renderView();
  }

  function wbStatusFor(actionId) { return state.approvals.writeback.filter(function (r) { return r.actionId === actionId; })[0] || null; }

  function protectedHero() {
    var p = state.approvals.protected || { baseline: 0, writeback: 0, total: 0, approvedCount: 0, executedCount: 0 };
    var hero = h("section", { class: "protected-hero" }, [
      h("div", { class: "ph-main" }, [
        h("span", { class: "ph-label" }, ["Protected revenue"]),
        h("span", { class: "ph-total" }, [money(p.total)]),
        h("span", { class: "ph-sub" }, ["baseline " + money(p.baseline) + (p.writeback ? "  +  " + money(p.writeback) + " this session" : "")])
      ]),
      h("div", { class: "ph-stats" }, [
        metricChip("Approved", num(p.approvedCount)),
        metricChip("Executed", num(p.executedCount)),
        metricChip("Pending queue", num((state.approvals.pending || []).length))
      ]),
      h("div", { class: "ph-priv" }, [
        h("span", { class: "priv-chip read" }, ["reads \u00b7 REVENUE_CC_READER"]),
        h("span", { class: "priv-arrow" }, ["\u2192"]),
        h("span", { class: "priv-chip write" }, ["writes \u00b7 REVENUE_CC_WRITER"])
      ])
    ]);
    return hero;
  }

  function actionJourney() {
    var id = state.approvals.active;
    var wb = id ? wbStatusFor(id) : null;
    var info = id ? state.approvals.byId[id] : null;
    var approved = wb && (wb.approvalStatus === "Approved");
    var rejected = wb && (wb.approvalStatus === "Rejected");
    var executed = wb && (wb.executionStatus === "Executed");
    var nodes = [
      { plane: "Detect", label: "Risk flagged", sub: "Cortex Agent", state: "is-done", badge: true },
      { plane: "Explain", label: "Root cause + play", sub: "Analyst + Search", state: "is-done", badge: true },
      { plane: "Review", label: rejected ? "Rejected" : approved ? "Approved" : "Pending approval", sub: "Domo Task Center", state: rejected ? "alt is-bad" : approved ? "is-done" : "alt is-active", badge: approved },
      { plane: "Act", label: executed ? "Writeback executed" : rejected ? "Voided" : "Awaiting execution", sub: executed ? "REVENUE_CC_WRITER \u2192 Snowflake" : "Separately privileged writeback", state: executed ? "is-done" : rejected ? "is-bad" : "is-todo", badge: executed }
    ];
    var tl = h("div", { class: "timeline" });
    nodes.forEach(function (nd) {
      var dot = h("span", { class: "tl-dot", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M4 12l5 5 11-11'/></svg>" });
      if (nd.badge) dot.appendChild(h("span", { class: "tl-badge ok" }, ["\u2713"]));
      tl.appendChild(h("div", { class: "tl-node " + nd.state }, [dot, h("span", { class: "tl-plane" }, [nd.plane]), h("span", { class: "tl-label" }, [nd.label]), h("span", { class: "tl-sub" }, [nd.sub])]));
    });
    var srcChips = h("div", { class: "journey-src" }, [
      h("span", { class: "js-lab" }, ["Go to source"]),
      h("span", { class: "src-chip" }, ["Cortex Agent run"]),
      h("span", { class: "src-chip" }, ["Model trace"]),
      h("span", { class: "src-chip" }, [wb ? "Writeback row " + String(id) : "Writeback (pending)"])
    ]);
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Action Journey"]),
        h("p", {}, [info ? (info.accountName + " \u00b7 " + (info.recommendation || "")) : "Select an action to trace it from detection to governed writeback"])])]),
      tl, srcChips
    ]);
  }

  function pendingCard(a) {
    var wb = wbStatusFor(a.actionId);
    var busyApprove = state.approvals.busy === a.actionId + ":approve";
    var busyReject = state.approvals.busy === a.actionId + ":reject";
    var approveBtn = h("button", { class: "pill-btn go solid", disabled: busyApprove ? "true" : null }, [busyApprove ? "Approving\u2026" : "Approve"]);
    approveBtn.addEventListener("click", function () { actOn(a.actionId, "approve"); });
    var rejectBtn = h("button", { class: "pill-btn ghost", disabled: busyReject ? "true" : null }, ["Reject"]);
    rejectBtn.addEventListener("click", function () { actOn(a.actionId, "reject"); });
    var hot = Number(a.riskScore) >= 85;
    return h("article", { class: "rec-card" }, [
      h("div", { class: "rec-top" }, [
        h("div", {}, [h("span", { class: "rec-account" }, [a.accountName || a.accountId]), h("span", { class: "rec-seg" }, [(a.region || "") + " \u00b7 " + (a.segment || "") + " \u00b7 " + a.accountId])]),
        a.riskScore != null ? h("span", { class: "rec-score" + (hot ? " hot" : "") }, ["risk " + num(a.riskScore)]) : null
      ]),
      h("div", { class: "rec-play" }, [a.recommendation || "Save play"]),
      h("p", { class: "rec-rationale" }, [(a.sourceAgent ? a.sourceAgent + " \u00b7 " : "") + (a.sourceQuestion || "")]),
      h("div", { class: "rec-foot" }, [
        h("span", { class: "rec-risk" }, [h("span", { class: "rr-val" }, [money(a.expectedRevenueProtected)]), " protectable"])
      ]),
      h("div", { class: "rec-actions" }, [approveBtn, rejectBtn])
    ]);
  }

  function inFlightCard(r) {
    var info = state.approvals.byId[r.actionId] || {};
    var busy = state.approvals.busy === r.actionId + ":execute";
    var execBtn = h("button", { class: "pill-btn go solid", disabled: busy ? "true" : null }, [busy ? "Executing\u2026" : "Execute writeback"]);
    execBtn.addEventListener("click", function () { actOn(r.actionId, "execute"); });
    return h("article", { class: "rec-card approved" }, [
      h("div", { class: "rec-top" }, [
        h("div", {}, [h("span", { class: "rec-account" }, [r.accountName || info.accountName || r.actionId]), h("span", { class: "rec-seg" }, [(r.region || "") + " \u00b7 " + r.actionId])]),
        h("span", { class: "approval good" }, ["Approved"])
      ]),
      h("div", { class: "rec-play" }, [r.recommendation || info.recommendation || "Save play"]),
      h("p", { class: "rec-rationale" }, ["Approved by " + (r.approvedBy || state.persona) + " \u2014 awaiting the separately-privileged Snowflake writeback."]),
      h("div", { class: "rec-foot" }, [h("span", { class: "rec-risk" }, [h("span", { class: "rr-val" }, [money(info.expectedRevenueProtected)]), " to protect"])]),
      h("div", { class: "rec-actions" }, [execBtn])
    ]);
  }

  function completedRow(r) {
    return h("tr", {}, [
      h("td", {}, [r.accountName || r.accountId]),
      h("td", {}, [r.recommendation || "\u2014"]),
      h("td", {}, [h("span", { class: "approval good" }, [r.executionStatus || "Executed"])]),
      h("td", { class: "num" }, [money(r.actualRevenueProtected)]),
      h("td", {}, [r.approvedBy || "\u2014"])
    ]);
  }

  function renderApprovals() {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    if (!state.approvals.loaded && !state.approvals.loading) { loadApprovals(); }
    if (state.approvals.loading && !state.approvals.loaded) { frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Loading the approval queue + protected-revenue rollup\u2026"])); return frag; }

    if (state.approvals.note) frag.appendChild(h("div", { class: "ops-note" }, [state.approvals.note]));

    frag.appendChild(protectedHero());

    // Approved-awaiting-execution lane
    var inflight = (state.approvals.writeback || []).filter(function (r) { return r.approvalStatus === "Approved" && r.executionStatus !== "Executed"; });
    if (inflight.length) {
      var ig = h("div", { class: "rec-grid" });
      inflight.forEach(function (r) { ig.appendChild(inFlightCard(r)); });
      frag.appendChild(h("section", { class: "rec-section" }, [
        h("div", { class: "rec-head" }, [h("div", {}, [h("h2", {}, ["Approved \u2014 awaiting writeback"]), h("p", {}, ["Execution runs under ", h("code", {}, ["REVENUE_CC_WRITER"]), " \u2014 a distinct privilege from the read that built the queue"])]),
          h("span", { class: "panel-tag" }, [num(inflight.length) + " ready"])]),
        ig
      ]));
    }

    // Pending queue
    var doneIds = {}; (state.approvals.writeback || []).forEach(function (r) { doneIds[r.actionId] = true; });
    var pending = (state.approvals.pending || []).filter(function (a) { return !doneIds[a.actionId]; });
    var pg = h("div", { class: "rec-grid" });
    if (!pending.length) pg.appendChild(h("p", { class: "analyst-note" }, ["No pending actions in scope. Switch persona or approve/execute above."]));
    pending.forEach(function (a) { pg.appendChild(pendingCard(a)); });
    frag.appendChild(h("section", { class: "rec-section" }, [
      h("div", { class: "rec-head" }, [h("div", {}, [h("h2", {}, ["Pending approval"]), h("p", {}, ["Cortex Agent save plays awaiting a human decision \u00b7 read as ", h("code", {}, ["REVENUE_CC_READER"])])]),
        h("span", { class: "panel-tag" }, [num(pending.length) + " pending"])]),
      pg
    ]));

    // Action journey (reflects the active action's real state)
    frag.appendChild(h("section", { class: "grid" }, [actionJourney()]));

    // Completed lane
    var sessionExecuted = (state.approvals.writeback || []).filter(function (r) { return r.executionStatus === "Executed"; });
    var completed = sessionExecuted.concat(state.approvals.history || []);
    var table = h("table", { class: "result-table ops-table" });
    var thead = h("thead"), htr = h("tr");
    ["Account", "Play", "Status", "Revenue protected", "Approved by"].forEach(function (c) { htr.appendChild(h("th", {}, [c])); });
    thead.appendChild(htr); table.appendChild(thead);
    var tb = h("tbody");
    completed.forEach(function (r) { tb.appendChild(completedRow(r)); });
    table.appendChild(tb);
    frag.appendChild(h("section", { class: "rec-section" }, [
      h("div", { class: "rec-head" }, [h("div", {}, [h("h2", {}, ["Executed \u2014 protected revenue"]), h("p", {}, ["Writeback rows (this session) + prior executed actions \u00b7 drives the protected-revenue rollup"])]),
        h("span", { class: "panel-tag" }, [num(completed.length) + " actions"])]),
      h("div", { class: "table-wrap" }, [table])
    ]));

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
    frag.appendChild(govIdentityBanner());
    frag.appendChild(h("section", { class: "grid" }, [govParityPanel()]));
    frag.appendChild(h("section", { class: "grid" }, [govMaskingPanel(), govPolicyPanel()]));
    frag.appendChild(h("section", { class: "grid" }, [govGuardPanel()]));
    frag.appendChild(h("section", { class: "grid" }, [govReadinessPanel()]));
    return frag;
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
        h("span", { class: "cw-eyebrow" }, ["Native Snowflake business experience"]),
        h("h2", {}, [c.experience || "Snowflake Intelligence / CoWork"]),
        h("p", { class: "cw-lead" }, ["Opens the ", h("code", {}, [c.agent || "REVENUE_CC_AGENT"]), " \u2014 the ", h("strong", {}, ["same"]), " configured Cortex Agent behind the Agent Queue tab. No re-implementation, no unsupported embed."])
      ]),
      h("div", { class: "cw-launch-side" }, [statChip(c.status || "Available")])
    ]);
    var meta = h("div", { class: "cw-meta" }, [
      c.openPath ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Open path"]), h("code", {}, [c.openPath])]) : null,
      c.scoping ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Governance"]), h("span", {}, [c.scoping])]) : null,
      c.sso ? h("div", { class: "cw-meta-row" }, [h("span", { class: "gi-lab" }, ["Identity / SSO"]), h("span", {}, [c.sso])]) : null
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
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    if (!state.cowork.loaded && !state.cowork.loading) { loadCoWork(); }
    if (state.cowork.loading && !state.cowork.loaded) {
      frag.appendChild(h("div", { class: "analyst-loading" }, [h("span", { class: "spinner" }), "Loading the MCP tool inventory + CoWork agent link\u2026"]));
      return frag;
    }
    frag.appendChild(h("section", { class: "grid" }, [coworkLaunchpad()]));
    var dr = coworkDeepResearch(); if (dr) frag.appendChild(h("section", { class: "grid" }, [dr]));
    frag.appendChild(h("section", { class: "grid" }, [mcpManagedPanel()]));
    frag.appendChild(h("section", { class: "grid" }, [mcpDomoPanel()]));
    return frag;
  }

  function renderChat() {
    var frag = document.createDocumentFragment();
    frag.appendChild(gatedBanner("Domo Chat v2 is enabled in the target Domo instance (gate G1). This surface documents the wiring honestly \u2014 it does not simulate a conversation or claim direct Cortex routing."));
    // How Chat v2 fits: it is an MCP client to the Snowflake-managed MCP server.
    var flow = h("div", { class: "chat-flow" }, [
      h("div", { class: "cf-node" }, [h("span", { class: "cf-lab" }, ["Business user"]), h("span", { class: "cf-sub" }, ["asks in Domo"])]),
      h("span", { class: "cf-arrow" }, ["\u2192"]),
      h("div", { class: "cf-node domo" }, [h("span", { class: "cf-lab" }, ["Domo Chat v2"]), h("span", { class: "cf-sub" }, ["governed delivery context"])]),
      h("span", { class: "cf-arrow" }, ["\u2192"]),
      h("div", { class: "cf-node sf" }, [h("span", { class: "cf-lab" }, ["Managed MCP server"]), h("span", { class: "cf-sub" }, ["Agent \u00b7 Analyst \u00b7 Search"])]),
      h("span", { class: "cf-arrow" }, ["\u2192"]),
      h("div", { class: "cf-node sf" }, [h("span", { class: "cf-lab" }, ["Horizon"]), h("span", { class: "cf-sub" }, ["policies enforced"])])
    ]);
    var prompts = h("div", { class: "chat-prompts" });
    CHAT_PROMPTS.forEach(function (p) { prompts.appendChild(h("div", { class: "chat-prompt" }, [h("span", { class: "cp-q" }, ["\u201c" + p + "\u201d"])])); });
    frag.appendChild(h("section", { class: "grid" }, [
      h("article", { class: "panel col-12" }, [
        h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Where Chat v2 sits"]), h("p", {}, ["The third first-class conversation \u2014 a delivery-plane client of the same governed Snowflake tools"])]), statChip("Target-instance")]),
        flow,
        h("p", { class: "chat-note" }, ["Chat v2 reaches Snowflake through the ", h("strong", {}, ["same Snowflake-managed MCP server"]), " shown on the CoWork \u00b7 MCP tab \u2014 so answers inherit the ", h("code", {}, ["REVENUE_CC_ANALYST"]), " semantics and the ", h("code", {}, ["RAP_REGION"]), " / ", h("code", {}, ["MASK_ARR"]), " policies. Nothing here bypasses governance."])
      ])
    ]));
    frag.appendChild(h("section", { class: "grid" }, [
      h("article", { class: "panel col-12" }, [
        h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Golden-path questions Chat v2 handles"]), h("p", {}, ["Same questions the Analyst + Agent answer \u2014 delivered in the flow of work"])])]),
        prompts
      ])
    ]));
    return frag;
  }

  // Narrative spine + technical architecture for the How It Works surface.
  var SPINE = [
    { plane: "Predict", surface: "Forecast Home + Snowflake ML", tech: "SNOWFLAKE.ML classification \u2192 PREDICT_RENEWAL_RISK", mark: "snowflake-mark.svg" },
    { plane: "Explain", surface: "Cortex Analyst + Search", tech: "REVENUE_CC_ANALYST semantic view + REVENUE_CC_SEARCH", mark: "snowflake-cortex.svg" },
    { plane: "Act", surface: "Cortex Agent Queue + Approvals", tech: "REVENUE_CC_AGENT \u2192 AGENT_ACTION_WRITEBACK (WRITER)", mark: "domo-approvals.svg" },
    { plane: "Remember", surface: "Snowflake Ops", tech: "Hybrid Tables: SCENARIO_RUNS, PREDICTION_FEEDBACK", mark: "domo-data.svg" },
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
    var pill = el("modePill");
    if (state.mode === "live") { pill.className = "mode-pill sf-live"; pill.textContent = "Live \u00b7 Snowflake"; el("envLabel").textContent = state.dataSource === "amplifier" ? "Live \u00b7 Cloud Amplifier federation (data stays in Snowflake)" : "Live Snowflake read \u00b7 Horizon-governed"; }
    else if (state.mode === "sample") { pill.className = "mode-pill sample"; pill.textContent = "Sample data"; el("envLabel").textContent = "Sample seed \u00b7 connect Code Engine for live"; }
    else { pill.className = "mode-pill"; pill.textContent = "Loading"; }
  }

  function renderTabs() {
    var nav = el("viewTabs"); nav.innerHTML = "";
    SURFACES.forEach(function (s) {
      var tab = h("button", { class: "view-tab" + (s.id === state.surface ? " active" : ""), role: "tab", "aria-selected": s.id === state.surface ? "true" : "false" }, [s.label]);
      tab.addEventListener("click", function () { state.surface = s.id; renderTabs(); renderView(); });
      nav.appendChild(tab);
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

  function kpiCard(k, opts) {
    opts = opts || {};
    var meta;
    if (k.deltaPct != null) {
      var up = k.deltaPct >= 0;
      meta = h("div", { class: "kpi-meta" }, [
        h("span", { class: "kpi-delta " + (up ? "up" : "down") }, [(up ? "\u25b2 " : "\u25bc ") + Math.abs(k.deltaPct).toFixed(1) + "%"]),
        " vs. prior month"
      ]);
    } else if (k.breaches != null) {
      meta = h("div", { class: "kpi-meta" }, [num(k.breaches) + " of " + num(k.cases) + " cases (90d)"]);
    } else {
      meta = h("div", { class: "kpi-meta" }, [k.context || ""]);
    }
    var val = k.unit === "%" ? (Number(k.value).toFixed(1) + "%") : money(k.value);
    return h("article", { class: "kpi" + (opts.cls ? " " + opts.cls : "") }, [
      h("span", { class: "kpi-label" }, [k.label]),
      h("span", { class: "kpi-value" }, [val]),
      meta
    ]);
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

  function forecastChart(data) {
    var rf = data && data.revenueForecast;
    if (!rf || !rf.history || !rf.history.length) {
      var av = (data && data.actualVsForecast) || [];
      rf = { history: av.map(function (p) { return { period: p.period, actual: p.actual }; }), forecast: [], predictionInterval: 0.95 };
    }
    var hist = rf.history || [], fc = rf.forecast || [];
    var svgNS = "http://www.w3.org/2000/svg";
    function E(name, attrs) { var e = document.createElementNS(svgNS, name); if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]); return e; }

    var W = 800, H = 300, x0 = 58, x1 = 784, y0 = 22, y1 = 246;
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

    var svg = E("svg", { viewBox: "0 0 " + W + " " + H, class: "fchart", style: "display:block;width:100%;height:auto" });

    var defs = E("defs");
    defs.innerHTML =
      "<linearGradient id='fcActFill' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0%' stop-color='#4a90c2' stop-opacity='0.30'/>" +
      "<stop offset='72%' stop-color='#99ccee' stop-opacity='0'/>" +
      "<stop offset='100%' stop-color='#99ccee' stop-opacity='0'/></linearGradient>" +
      "<linearGradient id='fcBand' x1='0' y1='0' x2='0' y2='1'>" +
      "<stop offset='0%' stop-color='#29b5e8' stop-opacity='0.34'/>" +
      "<stop offset='100%' stop-color='#29b5e8' stop-opacity='0.06'/></linearGradient>" +
      "<linearGradient id='fcActLine' x1='0' y1='0' x2='1' y2='0'>" +
      "<stop offset='0%' stop-color='#1f5d86'/><stop offset='100%' stop-color='#1f5d86'/></linearGradient>";
    svg.appendChild(defs);

    // horizontal gridlines + y labels
    var ticks = 4;
    for (var g = 0; g <= ticks; g++) {
      var gv = floor + (ceil - floor) * (g / ticks), gy = Y(gv);
      svg.appendChild(E("line", { class: "fc-grid", x1: x0, y1: gy.toFixed(1), x2: x1, y2: gy.toFixed(1) }));
      var yl = E("text", { class: "fc-ylab", x: x0 - 10, y: (gy + 3.5).toFixed(1) }); yl.textContent = fmtMoneyAxis(gv); svg.appendChild(yl);
    }

    // forecast region shading (subtle) behind the band
    svg.appendChild(E("rect", { class: "fc-future", x: X(cut - 1).toFixed(1), y: y0, width: (x1 - X(cut - 1)).toFixed(1), height: (y1 - y0).toFixed(1) }));

    // actual area fill
    var areaD = smoothPath(actPts) + " L" + X(cut - 1).toFixed(1) + "," + y1 + " L" + X(0).toFixed(1) + "," + y1 + " Z";
    svg.appendChild(E("path", { class: "fc-area", d: areaD, fill: "url(#fcActFill)" }));

    // confidence band (opening cone from the last actual)
    var loRev = loPts.slice().reverse();
    var bandD = smoothPath(upPts) + " L" + loRev[0].x.toFixed(1) + "," + loRev[0].y.toFixed(1) + smoothCurveCmds(loRev) + " Z";
    svg.appendChild(E("path", { class: "fc-bandfill", d: bandD, fill: "url(#fcBand)" }));

    // cutover marker
    svg.appendChild(E("line", { class: "fc-cut", x1: X(cut - 1).toFixed(1), y1: y0 - 2, x2: X(cut - 1).toFixed(1), y2: y1 }));
    var cutLab = E("text", { class: "fc-cutlab", x: (X(cut - 1) + 6).toFixed(1), y: y0 + 8 }); cutLab.textContent = "Forecast \u2192"; svg.appendChild(cutLab);

    // lines
    svg.appendChild(E("path", { class: "fc-line fc-forecast", d: smoothPath(fcPts) }));
    svg.appendChild(E("path", { class: "fc-line fc-actual", d: smoothPath(actPts) }));

    // dots
    actPts.forEach(function (p, i) {
      svg.appendChild(E("circle", { class: "fc-dot" + (i === cut - 1 ? " last" : ""), cx: p.x.toFixed(1), cy: p.y.toFixed(1), r: i === cut - 1 ? 4.2 : 2.3 }));
    });
    fc.forEach(function (p, i) {
      svg.appendChild(E("circle", { class: "fc-dot fc", cx: X(cut + i).toFixed(1), cy: Y(p.forecast).toFixed(1), r: 2.8 }));
    });

    // x labels (skip regular ticks adjacent to the cutover to avoid crowding)
    for (var i = 0; i < N; i++) {
      var isCut = i === cut - 1;
      var isReg = i % 3 === 0 || i === N - 1;
      if (!isCut && !isReg) continue;
      if (!isCut && Math.abs(i - (cut - 1)) < 2) continue;
      var xl = E("text", { class: "fc-xlab" + (isCut ? " cut" : ""), x: X(i).toFixed(1), y: y1 + 20 });
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
      h("span", { class: "lg-item" }, [h("span", { class: "lg-band" }), " 95% prediction interval"])
    ]);
    var panel = h("article", { class: "panel col-8" }, [
      h("div", { class: "panel-head" }, [
        h("div", {}, [h("h2", {}, ["Revenue \u2014 Actual vs. ML Forecast"]),
          h("p", {}, ["Monthly net revenue \u00b7 24 mo actual + 6 mo Snowflake ML forecast (95% interval)"])]),
        h("span", { class: "panel-tag" }, ["ML.FORECAST"])
      ]),
      box, legend
    ]);
    return panel;
  }

  function insightRail(data) {
    var inc = data.incident || {};
    var west = (data.regionalRisk || []).filter(function (r) { return r.region === "West" && r.segment === "Enterprise"; })[0];
    var rail = h("div", { class: "insight-rail" }, [
      h("div", { class: "insight warn" }, [h("span", { class: "insight-dot" }),
        h("div", { class: "insight-body" }, [h("h3", {}, ["Reliability incident " + (inc.id || "INC-0001")]),
          h("p", {}, [(inc.rootCause || "West Enterprise reliability incident") + " \u2014 " + num(inc.affectedAccounts) + " accounts, " + num(inc.slaBreaches) + " SLA breaches."])])]),
      h("div", { class: "insight info" }, [h("span", { class: "insight-dot" }),
        h("div", { class: "insight-body" }, [h("h3", {}, ["Renewal risk elevated in the West"]),
          h("p", {}, [west ? ("West Enterprise avg risk " + west.avgRisk + " across " + num(west.highRiskAccounts) + " high-risk accounts, " + money(west.revenueAtRisk) + " at risk.") : "Renewal risk concentrated in West Enterprise."])])]),
      h("div", { class: "insight good" }, [h("span", { class: "insight-dot" }),
        h("div", { class: "insight-body" }, [h("h3", {}, ["Protected revenue climbing"]),
          h("p", {}, [money(data.kpis.protectedRevenue.value) + " protected via executed agent actions to date."])])])
    ]);
    return h("article", { class: "panel col-4" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Insights"]), h("p", {}, ["From the latest governed run"])])]), rail
    ]);
  }

  function regionalPanel(data) {
    var rows = (data.regionalRisk || []).slice(0, 8);
    var max = 1; rows.forEach(function (r) { max = Math.max(max, r.revenueAtRisk); });
    var chart = h("div", { class: "bar-chart" });
    rows.forEach(function (r) {
      var hot = r.avgRisk >= 70;
      var value = h("span", { class: "bar-value" }, [money(r.revenueAtRisk)]);
      if (hot) value.appendChild(h("span", { class: "bar-flag" }, ["risk " + r.avgRisk]));
      chart.appendChild(h("div", { class: "bar-row" }, [
        h("span", { class: "bar-label" }, [r.region + " \u00b7 " + (r.segment === "Enterprise" ? "Ent" : r.segment === "Mid-Market" ? "MM" : "SMB")]),
        h("span", { class: "bar-track" }, [h("span", { class: "bar-fill" + (hot ? " hot" : ""), style: "width: " + Math.max(3, (r.revenueAtRisk / max) * 100) + "%" })]),
        value
      ]));
    });
    return h("article", { class: "panel col-6" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Regional Renewal Risk"]), h("p", {}, ["Revenue at risk by region \u00d7 segment, current month"])]),
        h("span", { class: "panel-tag" }, ["fact_renewal_risk"])]),
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

  function sourcesPanel() {
    var grid = h("div", { class: "dataset-grid" }, [
      h("div", { class: "dataset-card" }, [
        h("div", { class: "alias" }, [h("img", { class: "brand-mark", src: "./public/brand/snowflake-cortex.svg", alt: "" }), " REVENUE_CC_ANALYST"]),
        h("div", { class: "object sf-object" }, ["semantic view \u00b7 governed metric layer"]),
        h("div", { class: "dataset-links" }, [h("button", {}, ["Metrics"]), h("button", {}, ["Synonyms"])])
      ]),
      h("div", { class: "dataset-card" }, [
        h("div", { class: "alias" }, [h("img", { class: "brand-mark", src: "./public/brand/domo-cloud-amplifier.svg", alt: "" }), " gold views \u00d7 5"]),
        h("div", { class: "object" }, ["SNOWFLAKE_REVENUE_CC.CORE"]),
        h("div", { class: "dataset-links" }, [h("button", {}, ["Lineage"]), h("button", {}, ["Schema"])])
      ])
    ]);
    return h("article", { class: "panel col-4" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Governed Sources"]), h("p", {}, ["Powered live by Snowflake"])]),
        h("span", { class: "pill-btn inspect" }, ["Horizon"])]),
      grid
    ]);
  }

  function journeyPanel() {
    var nodes = [
      { cls: "is-done", plane: "Detect", label: "Risk flagged", sub: "Cortex Agent", badge: true },
      { cls: "is-done", plane: "Explain", label: "Root cause found", sub: "Cortex Analyst", badge: true },
      { cls: "alt is-active", plane: "Review", label: "Pending approval", sub: "Domo Task Center" },
      { cls: "is-todo", plane: "Act", label: "Writeback to Snowflake", sub: "Protected revenue updates" }
    ];
    var tl = h("div", { class: "timeline" });
    nodes.forEach(function (nd) {
      var dot = h("span", { class: "tl-dot", html: "<svg viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'><path d='M4 12l5 5 11-11'/></svg>" });
      if (nd.badge) dot.appendChild(h("span", { class: "tl-badge ok" }, ["\u2713"]));
      tl.appendChild(h("div", { class: "tl-node " + nd.cls }, [dot, h("span", { class: "tl-plane" }, [nd.plane]), h("span", { class: "tl-label" }, [nd.label]), h("span", { class: "tl-sub" }, [nd.sub])]));
    });
    return h("article", { class: "panel col-12" }, [
      h("div", { class: "panel-head" }, [h("div", {}, [h("h2", {}, ["Action Journey"]), h("p", {}, ["How a flagged renewal risk moves from detection to governed action \u2014 agent \u21c4 agent"])])]),
      tl
    ]);
  }

  function renderHome(data) {
    var frag = document.createDocumentFragment();
    var banner = connBanner(); if (banner) frag.appendChild(banner);
    var k = data.kpis;
    frag.appendChild(h("section", { class: "kpi-row" }, [
      kpiCard(k.netRevenue),
      kpiCard(k.revenueAtRisk, { cls: "is-warn sf-intel" }),
      kpiCard(k.protectedRevenue, { cls: "is-good" }),
      kpiCard(k.slaBreachRate, { cls: "is-alt" })
    ]));
    frag.appendChild(h("section", { class: "grid" }, [
      forecastChart(data),
      insightRail(data),
      regionalPanel(data),
      queuePanel(data),
      sourcesPanel(),
      journeyPanel()
    ]));
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
    buildPersonaSelect();
    renderTabs();
    refresh();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
