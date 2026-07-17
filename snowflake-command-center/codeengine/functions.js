/*
 * Snowflake Revenue Command Center — Code Engine package (Domo package name: snowflakece)
 * ---------------------------------------------------------------------------------------
 * Server-side bridge between the Domo App Studio pro-code app and Snowflake.
 * The app manifest (proxyId: "snowflakece") routes
 *   domo.post('/domo/codeengine/v2/packages/<fn>')
 * to the functions exported below. The Snowflake credential lives ONLY here
 * (Code Engine, server-side) and is never exposed to the browser.
 *
 * Exposed functions (must match manifest.json packageMapping aliases):
 *   - ping()                        -> connectivity + identity probe
 *   - runSql(statement, role)       -> raw SQL API read (governed, read role by default)
 *   - getForecastHome(persona)      -> Forecast Home payload (KPIs, forecast, regional risk, action queue)
 *   - askAnalyst(question, persona) -> Cortex Analyst NL->SQL + governed SQL execution (rows to chart)
 *   - askCortexAgent(question, persona) -> Cortex Agent (Analyst + Search) grounded answer + citations
 *   - runModelInference(accountId)  -> live single-account renewal-risk score (native ML inference)
 *   - getOpsState()                 -> Hybrid Table read (scenario_runs + prediction_feedback)
 *   - createScenario / updateScenarioStatus / deleteScenario / createFeedback -> Hybrid Table CRUD (WRITER)
 *   - getApprovalQueue(persona)     -> pending action queue (READER) + writeback rows + protected-revenue rollup
 *   - writeActionStatus(...)        -> approve/reject/execute writeback (WRITER) into AGENT_ACTION_WRITEBACK
 *   - getGovernance()               -> live two-persona parity + masking evidence (Horizon policies at the query engine)
 *   - askAnalyst(question, persona, conversationHistory) -> multi-turn conversational Cortex Analyst (returns updated history)
 *   - describeSemanticView(view)    -> DESCRIBE SEMANTIC VIEW parsed into a graph (tables/dims/facts/metrics/relationships/verified queries)
 *   - alterSemanticView(ddl)        -> guarded, best-effort ALTER SEMANTIC VIEW (evolve the semantic layer)
 *   - getSnowflakeIntegrations()    -> list Cloud Amplifier (BYOS) Snowflake integrations for this instance
 *   - registerCloudAmplifierTable(...) -> register a Snowflake table/view as a Cloud Amplifier–backed Domo dataset
 *
 * AUTH: mirrors the reference "Snowflake Cortex Analyst" Code Engine package.
 * The Snowflake key-pair lives in a Domo-managed account (Cloud Amplifier) and
 * is fetched at call time by id via sdk.getAccount(ACCOUNT_ID). No secret is
 * ever pasted into this file, committed to git, or exposed to the browser.
 * Written in conservative ES5 style for the Code Engine editor.
 */

var axios = require("axios");
var crypto = require("crypto");
var sdk = require("sdk"); // Domo-managed account access (Cloud Amplifier key-pair credential)
var codeengine = require("codeengine"); // session-identity Domo API calls (BYOS registration)

/* --------------------------------- Config --------------------------------- */
/* ACCOUNT_ID 148 = the domopartner.us-east-1 Snowflake key-pair account
 * (Snowflake user DOMO_CE_USER). This is the same credential the reference
 * package uses; DOMO_CE_USER has been granted REVENUE_CC_READER/WRITER and the
 * region-scoped reader roles so the SQL API can assume them per request. */
var ACCOUNT_ID = 148;
var ACCOUNT = "domopartner.us-east-1"; // host segment -> https://<ACCOUNT>.snowflakecomputing.com
/* Least-privilege roles created in snowflake/00_setup + 70_governance. */
var ROLE_READER = "REVENUE_CC_READER";
var ROLE_WRITER = "REVENUE_CC_WRITER";
var WAREHOUSE = "REVENUE_CC_WH";
var DATABASE = "SNOWFLAKE_REVENUE_CC";
var SCHEMA = "CORE";
var SEMANTIC_VIEW = "REVENUE_CC_ANALYST";

/* --------------------------------- Host ----------------------------------- */
function accountHost() {
  return "https://" + ACCOUNT + ".snowflakecomputing.com";
}

/* ------------------------------ Key-pair JWT ------------------------------ */
function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/* Derive the Snowflake public-key fingerprint ("SHA256:<b64>") from a PKCS#8 PEM. */
function fingerprintFromPem(pem) {
  var pub = crypto.createPublicKey(crypto.createPrivateKey({ key: pem, format: "pem" }));
  var der = pub.export({ type: "spki", format: "der" });
  return "SHA256:" + crypto.createHash("sha256").update(der).digest("base64");
}

/* Fetch the Domo-managed key-pair account and hand-build a Snowflake KEYPAIR_JWT.
 * Returns a Promise<string> so every caller awaits fresh credentials. */
function getSnowflakeJwt(acctId) {
  return Promise.resolve(sdk.getAccount(acctId)).then(function (acct) {
    var props = (acct && acct.properties) ? acct.properties : {};
    var pem = props.privateKey;
    var locator = props.account;   // e.g. "domopartner.us-east-1"
    var userRaw = props.username;  // e.g. "DOMO_CE_USER"
    if (!pem || !locator || !userRaw) throw new Error("Missing Snowflake key-pair account properties (privateKey/account/username)");
    if (String(pem).indexOf("ENCRYPTED") > -1) throw new Error("Encrypted private keys are not supported; store an unencrypted PKCS#8 key in the Domo account.");
    var accountIdentifier = String(locator).split(".")[0].toUpperCase(); // DOMOPARTNER
    var username = String(userRaw).toUpperCase();
    var qualified = accountIdentifier + "." + username;
    var fp = fingerprintFromPem(pem);
    var now = Math.floor(Date.now() / 1000);
    var header = { alg: "RS256", typ: "JWT" };
    var payload = { iss: qualified + "." + fp, sub: qualified, iat: now - 5, exp: now + 3540 };
    var signingInput = base64url(JSON.stringify(header)) + "." + base64url(JSON.stringify(payload));
    var signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    return signingInput + "." + base64url(signer.sign(crypto.createPrivateKey({ key: pem, format: "pem" })));
  });
}

/* Resolves to the Snowflake REST auth headers (KEYPAIR_JWT). Async so the JWT
 * is minted fresh (<= 1h lifetime) on every request. */
function authHeaders() {
  return getSnowflakeJwt(ACCOUNT_ID).then(function (jwt) {
    return {
      Authorization: "Bearer " + jwt,
      "X-Snowflake-Authorization-Token-Type": "KEYPAIR_JWT",
      "Content-Type": "application/json",
      Accept: "application/json"
    };
  });
}

/* ------------------------------- SQL API ---------------------------------- */
function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

/* Submit one SQL statement. Returns the SQL API ResultSet object
 * ({ resultSetMetaData, data, ... }). Handles the 202 async handle by polling. */
function runSql(statement, role) {
  var url = accountHost() + "/api/v2/statements";
  var body = {
    statement: String(statement || ""),
    timeout: 60,
    database: DATABASE,
    schema: SCHEMA,
    warehouse: WAREHOUSE,
    role: role || ROLE_READER
  };
  console.log("[snowflakece.runSql] start", JSON.stringify({ preview: body.statement.slice(0, 160), role: body.role }));
  return authHeaders()
    .then(function (headers) {
      return axios.post(url, body, { headers: headers, timeout: 70000, validateStatus: function () { return true; } });
    })
    .then(function (resp) {
      if (resp.status === 200) return resp.data;
      if (resp.status === 202) {
        var handle = resp.data && resp.data.statementHandle ? resp.data.statementHandle : null;
        if (!handle) return Promise.reject("SQL API 202 without statementHandle");
        return pollStatement(handle, 0);
      }
      return Promise.reject(resp.data || ("SQL API HTTP " + resp.status));
    });
}

function pollStatement(handle, attempt) {
  var url = accountHost() + "/api/v2/statements/" + encodeURIComponent(handle);
  return sleep(1500)
    .then(function () { return authHeaders(); })
    .then(function (headers) {
      return axios.get(url, { headers: headers, timeout: 60000, validateStatus: function () { return true; } });
    })
    .then(function (resp) {
      if (resp.status === 200) return resp.data;
      if (resp.status === 202 && attempt < 30) return pollStatement(handle, attempt + 1);
      return Promise.reject(resp.data || ("SQL API poll HTTP " + resp.status));
    });
}

/* Map an SQL API ResultSet into an array of plain objects keyed by column name. */
function rowsToObjects(resultSet) {
  var meta = resultSet && resultSet.resultSetMetaData ? resultSet.resultSetMetaData : {};
  var cols = meta.rowType || [];
  var data = resultSet && resultSet.data ? resultSet.data : [];
  return data.map(function (row) {
    var obj = {};
    for (var i = 0; i < cols.length; i++) {
      obj[cols[i].name] = row[i];
    }
    return obj;
  });
}

function num(v) {
  if (v === null || v === undefined || v === "") return 0;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function sqlLiteral(value) {
  if (value === null || value === undefined) return "NULL";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

/* ------------------------------- ping ------------------------------------- */
function ping() {
  return runSql("SELECT CURRENT_VERSION() AS version, CURRENT_ACCOUNT() AS account, CURRENT_ROLE() AS role, CURRENT_WAREHOUSE() AS warehouse")
    .then(function (rs) {
      var rows = rowsToObjects(rs);
      return { status: "SUCCEEDED", identity: rows[0] || {}, governedBy: "Snowflake Horizon (role-scoped) via Domo Code Engine" };
    })
    .catch(function (err) {
      return { status: "FAILED", error: detail(err) };
    });
}

/* --------------------------- Forecast Home -------------------------------- */
/* Region scope for a persona (browser-side scoping is fine for Sprint 2; true
 * per-viewer enforcement lands with Horizon policies in Sprint 7). */
function personaRegion(persona) {
  var p = String(persona || "").toLowerCase();
  if (p.indexOf("west") > -1) return "West";
  if (p.indexOf("east") > -1) return "East";
  if (p.indexOf("central") > -1) return "Central";
  if (p.indexOf("south") > -1) return "South";
  return null; // executive / admin -> all regions
}

function getForecastHome(persona) {
  var region = personaRegion(persona);
  var regionFilterRisk = region ? " AND region = " + sqlLiteral(region) : "";
  var regionFilterRev = region ? " AND region = " + sqlLiteral(region) : "";

  var qNetRevenue =
    "SELECT " +
    "  SUM(CASE WHEN fiscal_period = TO_VARCHAR(CURRENT_DATE,'YYYY-MM') THEN net_revenue END) AS cur, " +
    "  SUM(CASE WHEN fiscal_period = TO_VARCHAR(DATEADD(month,-1,CURRENT_DATE),'YYYY-MM') THEN net_revenue END) AS prior " +
    "FROM fact_revenue_daily WHERE 1=1" + regionFilterRev;

  var qRisk =
    "SELECT SUM(revenue_at_risk) AS v FROM fact_renewal_risk " +
    "WHERE risk_month = DATE_TRUNC('MONTH', CURRENT_DATE)" + regionFilterRisk;

  var qProtected =
    "SELECT SUM(actual_revenue_protected) AS v FROM fact_agent_actions " +
    "WHERE execution_status = 'Executed'" + regionFilterRisk;

  var qSla =
    "SELECT COUNT_IF(sla_breached_flag) AS breaches, COUNT(*) AS cases FROM fact_support_cases " +
    "WHERE date >= DATEADD(day,-90,CURRENT_DATE)" + regionFilterRisk;

  var qForecast =
    "SELECT fiscal_period AS period, SUM(net_revenue) AS actual, SUM(daily_arr) AS forecast " +
    "FROM fact_revenue_daily WHERE 1=1" + regionFilterRev +
    " GROUP BY fiscal_period ORDER BY fiscal_period DESC LIMIT 14";

  // Materialized Snowflake ML.FORECAST (company-wide) for the hero chart:
  // 24 mo actual + 6 mo forecast with 95% prediction interval.
  var qRevForecast =
    "SELECT TO_VARCHAR(period_month,'YYYY-MM') AS period, kind, actual, forecast, " +
    "  lower_bound AS lower, upper_bound AS upper " +
    "FROM gold_revenue_forecast ORDER BY period_month";

  var qRegional =
    "SELECT region, segment, ROUND(AVG(renewal_risk_score),1) AS avgrisk, " +
    "  COUNT_IF(risk_tier='High') AS highrisk, SUM(revenue_at_risk) AS rar " +
    "FROM fact_renewal_risk WHERE risk_month = DATE_TRUNC('MONTH', CURRENT_DATE)" + regionFilterRisk +
    " GROUP BY region, segment ORDER BY rar DESC LIMIT 12";

  var qQueue =
    "SELECT " +
    "  COUNT_IF(approval_status='Pending') AS pending, " +
    "  COUNT_IF(approval_status='Approved') AS approved, " +
    "  COUNT_IF(execution_status='Executed') AS executed, " +
    "  COUNT_IF(approval_status='Rejected') AS rejected, " +
    "  COUNT_IF(approval_status='Not Required') AS notrequired " +
    "FROM fact_agent_actions WHERE 1=1" + regionFilterRisk;

  var qTopActions =
    "SELECT recommendation AS action, COUNT(*) AS cnt, SUM(expected_revenue_protected) AS rar " +
    "FROM fact_agent_actions WHERE 1=1" + regionFilterRisk +
    " GROUP BY recommendation ORDER BY cnt DESC LIMIT 5";

  var out = {
    status: "SUCCEEDED",
    mode: "LIVE",
    persona: persona || "Executive Sponsor",
    regionScope: region || "All regions",
    source: DATABASE + "." + SCHEMA + " (live SQL API read, role " + ROLE_READER + ")",
    generatedAt: new Date().toISOString(),
    kpis: {},
    actualVsForecast: [],
    revenueForecast: null,
    regionalRisk: [],
    actionQueue: {},
    incident: null
  };

  return runSql(qNetRevenue)
    .then(function (rs) {
      var r = rowsToObjects(rs)[0] || {};
      var cur = num(r.CUR), prior = num(r.PRIOR);
      out.kpis.netRevenue = {
        label: "Net Revenue (MTD)", value: cur, priorValue: prior,
        deltaPct: prior ? Math.round(((cur - prior) / prior) * 1000) / 10 : 0, unit: "USD"
      };
      return runSql(qRisk);
    })
    .then(function (rs) {
      out.kpis.revenueAtRisk = { label: "Revenue at Risk", value: num(rowsToObjects(rs)[0] && rowsToObjects(rs)[0].V), unit: "USD", context: "current month" };
      return runSql(qProtected);
    })
    .then(function (rs) {
      out.kpis.protectedRevenue = { label: "Protected Revenue", value: num(rowsToObjects(rs)[0] && rowsToObjects(rs)[0].V), unit: "USD", context: "executed agent actions" };
      return runSql(qSla);
    })
    .then(function (rs) {
      var r = rowsToObjects(rs)[0] || {};
      var breaches = num(r.BREACHES), cases = num(r.CASES);
      out.kpis.slaBreachRate = { label: "SLA Breach Rate (90d)", value: cases ? Math.round((breaches / cases) * 1000) / 10 : 0, unit: "%", breaches: breaches, cases: cases };
      return runSql(qForecast);
    })
    .then(function (rs) {
      out.actualVsForecast = rowsToObjects(rs)
        .map(function (r) { return { period: r.PERIOD, actual: num(r.ACTUAL), forecast: num(r.FORECAST) }; })
        .reverse();
      // Resilient: a missing/ungranted forecast table must not break the home payload.
      return runSql(qRevForecast)
        .then(function (frs) {
          var rows = rowsToObjects(frs);
          if (rows.length) {
            var history = [], forecast = [];
            rows.forEach(function (r) {
              if (String(r.KIND) === "forecast") {
                forecast.push({ period: r.PERIOD, forecast: num(r.FORECAST), lower: num(r.LOWER), upper: num(r.UPPER) });
              } else {
                history.push({ period: r.PERIOD, actual: num(r.ACTUAL) });
              }
            });
            out.revenueForecast = {
              source: DATABASE + "." + SCHEMA + ".GOLD_REVENUE_FORECAST (SNOWFLAKE.ML.FORECAST)",
              grain: "month", unit: "USD", predictionInterval: 0.95,
              history: history, forecast: forecast
            };
          }
        })
        .catch(function () { out.revenueForecast = null; })
        .then(function () { return runSql(qRegional); });
    })
    .then(function (rs) {
      out.regionalRisk = rowsToObjects(rs).map(function (r) {
        return { region: r.REGION, segment: r.SEGMENT, avgRisk: num(r.AVGRISK), highRiskAccounts: num(r.HIGHRISK), revenueAtRisk: num(r.RAR) };
      });
      return runSql(qQueue);
    })
    .then(function (rs) {
      var r = rowsToObjects(rs)[0] || {};
      out.actionQueue = { pending: num(r.PENDING), approved: num(r.APPROVED), executed: num(r.EXECUTED), rejected: num(r.REJECTED), notRequired: num(r.NOTREQUIRED), topActions: [] };
      return runSql(qTopActions);
    })
    .then(function (rs) {
      out.actionQueue.topActions = rowsToObjects(rs).map(function (r) {
        return { action: r.ACTION, count: num(r.CNT), revenueAtRisk: num(r.RAR) };
      });
      return { response: out };
    })
    .catch(function (err) {
      return { response: { status: "FAILED", error: detail(err), mode: "LIVE" } };
    });
}

/* ------------------------- Cortex Analyst (Sprint 3) ---------------------- */
/* Transparent NL analytics surface. Round-trip:
 *   1) POST question -> /api/v2/cortex/analyst/message over REVENUE_CC_ANALYST
 *      (returns interpretation text, generated SQL, follow-up suggestions,
 *       confidence/verified-query metadata, request_id, warnings).
 *   2) Execute the generated SQL back through the governed SQL API (READER role)
 *      so the browser gets rows it can chart — nothing runs client-side.
 * The full API request/response is returned so the app can show an inspector. */
/* Resolve a caller-supplied semantic-view name to a fully-qualified name.
 * Accepts a bare name ("REVENUE_CC_ANALYST"), a DB.SCHEMA.VIEW FQN, or empty
 * (defaults to the primary governed view). Guards against injection by only
 * allowing identifier characters. */
function resolveSemanticView(view) {
  var v = String(view || "").trim();
  if (!v || !/^[A-Za-z0-9_.$]+$/.test(v)) return DATABASE + "." + SCHEMA + "." + SEMANTIC_VIEW;
  if (v.indexOf(".") > -1) return v;
  return DATABASE + "." + SCHEMA + "." + v;
}

function analystMessage(question, history, view) {
  var url = accountHost() + "/api/v2/cortex/analyst/message";
  var messages = [];
  if (Array.isArray(history) && history.length) messages = messages.concat(history);
  messages.push({ role: "user", content: [{ type: "text", text: String(question || "") }] });
  var body = {
    messages: messages,
    semantic_view: resolveSemanticView(view)
  };
  console.log("[snowflakece.askAnalyst] message", JSON.stringify({ q: String(question || "").slice(0, 160), turns: messages.length }));
  return authHeaders()
    .then(function (headers) {
      return axios.post(url, body, { headers: headers, timeout: 70000, validateStatus: function () { return true; } });
    })
    .then(function (resp) {
      if (resp.status === 200) return { request: body, data: resp.data };
      return Promise.reject(resp.data || ("Analyst API HTTP " + resp.status));
    });
}

/* Pull the typed content blocks out of an Analyst message response. */
function parseAnalystContent(data) {
  var msg = data && data.message ? data.message : {};
  var blocks = msg.content || [];
  var out = { interpretation: "", sql: "", suggestions: [], confidence: null };
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    if (b.type === "text") out.interpretation = out.interpretation ? out.interpretation + "\n\n" + b.text : b.text;
    else if (b.type === "sql") {
      out.sql = b.statement || "";
      if (b.confidence) out.confidence = b.confidence;
    } else if (b.type === "suggestions") {
      out.suggestions = (b.suggestions || []).slice(0, 6);
    }
  }
  return out;
}

/* Strip the trailing "-- Generated by Cortex Analyst ..." comment / semicolon so
 * the statement is a single clean SELECT for the SQL API. */
function cleanGeneratedSql(sql) {
  var s = String(sql || "");
  s = s.replace(/\r/g, "");
  s = s.replace(/--[^\n]*$/gm, "");   // drop line comments (request_id footer)
  s = s.replace(/;\s*$/, "");           // drop trailing semicolon
  return s.trim();
}

/* Multi-turn conversational Cortex Analyst. `conversationHistory` is the array
 * of prior Analyst messages (user + analyst turns) exactly as returned by a
 * previous call; pass it back to keep context. The updated history (with this
 * turn + the analyst reply) is returned so the app can chain the next turn. */
function askAnalyst(question, persona, conversationHistory, view) {
  var region = personaRegion(persona);
  var q = String(question || "").trim();
  if (region) q = q + " (scope results to the " + region + " region)";
  if (!q) {
    return Promise.resolve({ response: { status: "FAILED", error: "Empty question." } });
  }
  var history = Array.isArray(conversationHistory) ? conversationHistory : [];
  var semanticView = resolveSemanticView(view);

  var out = {
    status: "SUCCEEDED",
    mode: "LIVE",
    persona: persona || "Executive Sponsor",
    regionScope: region || "All regions",
    semanticView: semanticView,
    question: q,
    interpretation: "",
    sql: "",
    suggestions: [],
    confidence: null,
    requestId: null,
    warnings: [],
    columns: [],
    rows: [],
    rowCount: 0,
    turn: (history.length ? Math.floor(history.length / 2) : 0) + 1,
    conversationHistory: history,
    generatedAt: new Date().toISOString(),
    api: { endpoint: accountHost() + "/api/v2/cortex/analyst/message", request: null, response: null }
  };
  var t0 = Date.now();

  return analystMessage(q, history, view)
    .then(function (res) {
      out.elapsedMs = Date.now() - t0;
      out.api.request = res.request;
      out.api.response = res.data;
      out.requestId = res.data && res.data.request_id ? res.data.request_id : null;
      out.warnings = (res.data && res.data.warnings ? res.data.warnings : []).map(function (w) { return w && w.message ? w.message : String(w); });
      var parsed = parseAnalystContent(res.data);
      out.interpretation = parsed.interpretation;
      out.sql = parsed.sql;
      out.suggestions = parsed.suggestions;
      out.confidence = parsed.confidence;
      // Advance the conversation: prior history + this user turn + the analyst reply.
      var replyMsg = (res.data && res.data.message) ? res.data.message : { role: "analyst", content: [] };
      out.conversationHistory = history.concat([
        { role: "user", content: [{ type: "text", text: q }] },
        replyMsg
      ]);
      if (!parsed.sql) return { response: out };
      return runSql(cleanGeneratedSql(parsed.sql), ROLE_READER).then(function (rs) {
        var meta = rs && rs.resultSetMetaData ? rs.resultSetMetaData : {};
        out.columns = (meta.rowType || []).map(function (c) { return { name: c.name, type: c.type }; });
        out.rows = rowsToObjects(rs);
        out.rowCount = out.rows.length;
        return { response: out };
      });
    })
    .catch(function (err) {
      out.status = "FAILED";
      out.error = detail(err);
      return { response: out };
    });
}

/* ------------------------- Cortex Agent (Sprint 4) ------------------------ */
/* One shared Cortex Agent (Analyst + Search) is the Snowflake reasoning core.
 * We call the non-streaming Agents REST run endpoint and flatten the content
 * blocks (thinking / tool_use / tool_result / text) into a shape the app can
 * render: final answer, the Analyst-generated SQL, and the Cortex Search
 * citations (grounded, cited evidence beyond structured metrics). Runs under
 * the service identity's default role (set to REVENUE_CC_READER). */
var AGENT_NAME = "REVENUE_CC_AGENT";

function agentRunUrl() {
  return accountHost() + "/api/v2/databases/" + DATABASE + "/schemas/" + SCHEMA +
    "/agents/" + AGENT_NAME + ":run";
}

/* Walk a tool_result.content[] array and return the first embedded JSON object. */
function toolResultJson(tr) {
  var content = tr && tr.content ? tr.content : [];
  for (var i = 0; i < content.length; i++) {
    if (content[i] && content[i].type === "json" && content[i].json) return content[i].json;
  }
  return null;
}

function parseAgentResponse(data) {
  var out = { answer: "", thinking: "", sql: "", analystRows: [], searchQuery: "", citations: [], suggested: [], toolsFired: { analyst: false, search: false } };
  var blocks = (data && data.content) ? data.content : [];
  var seen = {};
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i] || {};
    if (b.type === "text" && b.text) {
      out.answer = out.answer ? out.answer + "\n\n" + b.text : b.text;
    } else if (b.type === "thinking" && b.thinking && b.thinking.text) {
      out.thinking = out.thinking ? out.thinking + "\n" + b.thinking.text : b.thinking.text;
    } else if (b.type === "tool_use" && b.tool_use) {
      var inp = b.tool_use.input || {};
      if (b.tool_use.type === "cortex_search" && inp.query && !out.searchQuery) out.searchQuery = inp.query;
    } else if (b.type === "tool_result" && b.tool_result) {
      var tr = b.tool_result;
      var j = toolResultJson(tr);
      if (tr.type === "system_execute_sql" || tr.type === "cortex_analyst_text_to_sql") {
        out.toolsFired.analyst = true;
        if (j && j.sql && !out.sql) out.sql = j.sql;
      } else if (tr.type === "cortex_search") {
        out.toolsFired.search = true;
        var results = (j && j.search_results) ? j.search_results : [];
        for (var r = 0; r < results.length; r++) {
          var sr = results[r] || {};
          var id = sr.doc_id || sr.id;
          if (id && !seen[id]) {
            seen[id] = true;
            out.citations.push({
              docId: sr.doc_id || "",
              title: sr.doc_title || sr.title || "",
              snippet: String(sr.text || "").slice(0, 320)
            });
          }
        }
      }
    } else if (b.type === "suggested_queries") {
      var sq = b.suggested_queries || b.suggestions || [];
      out.suggested = (Array.isArray(sq) ? sq : []).map(function (x) { return x && x.text ? x.text : (x && x.question ? x.question : String(x)); }).slice(0, 6);
    }
  }
  return out;
}

function askCortexAgent(question, persona) {
  var region = personaRegion(persona);
  var q = String(question || "").trim();
  if (region) q = q + " (focus on the " + region + " region)";
  if (!q) return Promise.resolve({ response: { status: "FAILED", error: "Empty question." } });

  var body = {
    stream: false,
    messages: [{ role: "user", content: [{ type: "text", text: q }] }]
  };
  var out = {
    status: "SUCCEEDED",
    mode: "LIVE",
    agent: DATABASE + "." + SCHEMA + "." + AGENT_NAME,
    persona: persona || "Executive Sponsor",
    regionScope: region || "All regions",
    question: q,
    generatedAt: new Date().toISOString(),
    api: { endpoint: agentRunUrl(), request: body, response: null }
  };
  console.log("[snowflakece.askCortexAgent] run", JSON.stringify({ q: q.slice(0, 160) }));
  var t0 = Date.now();
  return authHeaders()
    .then(function (headers) {
      headers.Accept = "application/json";
      return axios.post(agentRunUrl(), body, { headers: headers, timeout: 180000, validateStatus: function () { return true; } });
    })
    .then(function (resp) {
      out.elapsedMs = Date.now() - t0;
      if (resp.status !== 200) return Promise.reject(resp.data || ("Agent API HTTP " + resp.status));
      out.api.response = resp.data;
      out.requestId = (resp.data && (resp.data.request_id || resp.data.id)) || (resp.headers && resp.headers["x-snowflake-request-id"]) || null;
      var parsed = parseAgentResponse(resp.data);
      out.answer = parsed.answer;
      out.thinking = parsed.thinking;
      out.sql = parsed.sql;
      out.searchQuery = parsed.searchQuery;
      out.citations = parsed.citations;
      out.suggested = parsed.suggested;
      out.toolsFired = parsed.toolsFired;
      return { response: out };
    })
    .catch(function (err) {
      out.status = "FAILED";
      out.error = detail(err);
      return { response: out };
    });
}

/* --------------------- Snowflake ML + Hybrid state (Sprint 5) ------------- */
/* Live single-account renewal-risk score from the native ML model, plus CRUD
 * over the Hybrid Tables (operational memory). Reads run as READER; scenario /
 * feedback writes run as WRITER (least privilege). */
var RISK_FN = DATABASE + "." + SCHEMA + ".PREDICT_RENEWAL_RISK";

function numLit(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  var n = Number(v);
  return isNaN(n) ? "NULL" : String(n);
}

function runModelInference(accountId) {
  var id = String(accountId || "").trim();
  if (!id) return Promise.resolve({ response: { status: "FAILED", error: "Missing accountId." } });
  var sql = "SELECT * FROM TABLE(" + RISK_FN + "(" + sqlLiteral(id) + "))";
  return runSql(sql, ROLE_READER)
    .then(function (rs) {
      var r = rowsToObjects(rs)[0] || {};
      return { response: {
        status: "SUCCEEDED", mode: "LIVE", accountId: id, sql: sql,
        model: { name: "REVENUE_CC_RISK_MODEL", version: r.MODEL_VERSION || "", type: "SNOWFLAKE.ML.CLASSIFICATION (native warehouse inference)" },
        prediction: { predictedClass: num(r.PREDICTED_CLASS), probability: num(r.PREDICTED_RISK_PROBABILITY), label: r.PREDICTED_LABEL || "" },
        features: { arr: num(r.ANNUAL_RECURRING_REVENUE), cases90d: num(r.CASES_90D), slaBreaches90d: num(r.SLA_BREACHES_90D), negativeCases90d: num(r.NEGATIVE_CASES_90D), avgUsageScore90d: num(r.AVG_USAGE_SCORE_90D), usageDropDays90d: num(r.USAGE_DROP_DAYS_90D) },
        account: { region: r.REGION, segment: r.SEGMENT, industry: r.INDUSTRY },
        generatedAt: new Date().toISOString()
      } };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err), accountId: id, sql: sql } }; });
}

/* Ops tab load: scenarios + prediction feedback in one governed read. */
function getOpsState() {
  var out = { status: "SUCCEEDED", mode: "LIVE", scenarios: [], feedback: [], generatedAt: new Date().toISOString() };
  return runSql("SELECT * FROM " + DATABASE + "." + SCHEMA + ".SCENARIO_RUNS ORDER BY CREATED_TS DESC", ROLE_READER)
    .then(function (rs) {
      out.scenarios = rowsToObjects(rs).map(function (r) {
        return { scenarioId: r.SCENARIO_ID, createdTs: r.CREATED_TS, createdBy: r.CREATED_BY, accountId: r.ACCOUNT_ID, accountName: r.ACCOUNT_NAME, region: r.REGION, segment: r.SEGMENT, scenarioName: r.SCENARIO_NAME, predictedRiskProbability: num(r.PREDICTED_RISK_PROBABILITY), assumptionNotes: r.ASSUMPTION_NOTES, projectedRevenueAtRisk: num(r.PROJECTED_REVENUE_AT_RISK), status: r.STATUS };
      });
      return runSql("SELECT * FROM " + DATABASE + "." + SCHEMA + ".PREDICTION_FEEDBACK ORDER BY CREATED_TS DESC", ROLE_READER);
    })
    .then(function (rs) {
      out.feedback = rowsToObjects(rs).map(function (r) {
        return { feedbackId: r.FEEDBACK_ID, createdTs: r.CREATED_TS, createdBy: r.CREATED_BY, accountId: r.ACCOUNT_ID, modelVersion: r.MODEL_VERSION, predictedRiskProbability: num(r.PREDICTED_RISK_PROBABILITY), humanVerdict: r.HUMAN_VERDICT, correctedLabel: r.CORRECTED_LABEL, comment: r.COMMENT };
      });
      return { response: out };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

/* Create a scenario (e.g. from "accept prediction"). Runs as WRITER.
 * Scalar positional params to match the Code Engine packageMapping contract. */
function createScenario(accountId, accountName, region, segment, scenarioName, predictedRiskProbability, assumptionNotes, projectedRevenueAtRisk, status, createdBy) {
  var cols = "CREATED_BY, ACCOUNT_ID, ACCOUNT_NAME, REGION, SEGMENT, SCENARIO_NAME, PREDICTED_RISK_PROBABILITY, ASSUMPTION_NOTES, PROJECTED_REVENUE_AT_RISK, STATUS";
  var vals = [
    sqlLiteral(createdBy || "Domo App"), sqlLiteral(accountId || ""), sqlLiteral(accountName || ""),
    sqlLiteral(region || ""), sqlLiteral(segment || ""), sqlLiteral(scenarioName || "Accepted prediction"),
    numLit(predictedRiskProbability), sqlLiteral(assumptionNotes || ""), numLit(projectedRevenueAtRisk),
    sqlLiteral(status || "Open")
  ].join(", ");
  var sql = "INSERT INTO " + DATABASE + "." + SCHEMA + ".SCENARIO_RUNS (" + cols + ") VALUES (" + vals + ")";
  return runSql(sql, ROLE_WRITER)
    .then(function () { return { response: { status: "SUCCEEDED", mode: "LIVE", action: "createScenario" } }; })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

function updateScenarioStatus(scenarioId, status) {
  var sql = "UPDATE " + DATABASE + "." + SCHEMA + ".SCENARIO_RUNS SET STATUS = " + sqlLiteral(status || "Open") +
    " WHERE SCENARIO_ID = " + sqlLiteral(scenarioId || "");
  return runSql(sql, ROLE_WRITER)
    .then(function () { return { response: { status: "SUCCEEDED", mode: "LIVE", action: "updateScenarioStatus" } }; })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

function deleteScenario(scenarioId) {
  var sql = "DELETE FROM " + DATABASE + "." + SCHEMA + ".SCENARIO_RUNS WHERE SCENARIO_ID = " + sqlLiteral(scenarioId || "");
  return runSql(sql, ROLE_WRITER)
    .then(function () { return { response: { status: "SUCCEEDED", mode: "LIVE", action: "deleteScenario" } }; })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

function createFeedback(accountId, modelVersion, predictedRiskProbability, humanVerdict, correctedLabel, comment, createdBy) {
  var cols = "CREATED_BY, ACCOUNT_ID, MODEL_VERSION, PREDICTED_RISK_PROBABILITY, HUMAN_VERDICT, CORRECTED_LABEL, COMMENT";
  var vals = [
    sqlLiteral(createdBy || "Domo App"), sqlLiteral(accountId || ""), sqlLiteral(modelVersion || ""),
    numLit(predictedRiskProbability), sqlLiteral(humanVerdict || "Unsure"), sqlLiteral(correctedLabel || ""),
    sqlLiteral(comment || "")
  ].join(", ");
  var sql = "INSERT INTO " + DATABASE + "." + SCHEMA + ".PREDICTION_FEEDBACK (" + cols + ") VALUES (" + vals + ")";
  return runSql(sql, ROLE_WRITER)
    .then(function () { return { response: { status: "SUCCEEDED", mode: "LIVE", action: "createFeedback" } }; })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

/* --------------------- Agent-to-agent action loop (Sprint 6) -------------- */
/* Approval queue read (READER) + separately-privileged writeback (WRITER) into
 * the AGENT_ACTION_WRITEBACK hybrid table, plus the governed protected-revenue
 * rollup. This is the enforced privilege split: reads never write, writes run
 * under REVENUE_CC_WRITER. */
var WRITEBACK = DATABASE + "." + SCHEMA + ".AGENT_ACTION_WRITEBACK";

function getApprovalQueue(persona) {
  var region = personaRegion(persona);
  var where = "q.APPROVAL_STATUS = 'Pending'" + (region ? " AND q.REGION = " + sqlLiteral(region) : "");
  var qPending =
    "SELECT q.ACTION_ID, q.ACCOUNT_ID, a.ACCOUNT_NAME, q.REGION, q.SEGMENT, q.SOURCE_AGENT, " +
    "q.SOURCE_QUESTION, q.RECOMMENDATION, q.EXPECTED_REVENUE_PROTECTED, r.RENEWAL_RISK_SCORE " +
    "FROM " + DATABASE + "." + SCHEMA + ".GOLD_AGENT_ACTION_QUEUE q " +
    "JOIN " + DATABASE + "." + SCHEMA + ".DIM_ACCOUNT a ON q.ACCOUNT_ID = a.ACCOUNT_ID " +
    "LEFT JOIN " + DATABASE + "." + SCHEMA + ".GOLD_CUSTOMER_RENEWAL_RISK r ON q.ACCOUNT_ID = r.ACCOUNT_ID " +
    "WHERE " + where + " ORDER BY q.EXPECTED_REVENUE_PROTECTED DESC LIMIT 15";
  var qWb = "SELECT ACTION_ID, ACCOUNT_ID, ACCOUNT_NAME, REGION, RECOMMENDATION, APPROVAL_STATUS, APPROVED_BY, " +
    "EXECUTION_STATUS, ACTUAL_REVENUE_PROTECTED, COMPLETED_TS FROM " + WRITEBACK + " ORDER BY CREATED_TS DESC";
  var qRollup = "SELECT * FROM " + DATABASE + "." + SCHEMA + ".GOLD_PROTECTED_REVENUE_ROLLUP";
  var out = { status: "SUCCEEDED", mode: "LIVE", persona: persona || "Executive Sponsor", regionScope: region || "All regions", pending: [], writeback: [], protected: null, generatedAt: new Date().toISOString() };
  return runSql(qPending, ROLE_READER)
    .then(function (rs) {
      out.pending = rowsToObjects(rs).map(function (r) {
        return { actionId: r.ACTION_ID, accountId: r.ACCOUNT_ID, accountName: r.ACCOUNT_NAME, region: r.REGION, segment: r.SEGMENT,
          sourceAgent: r.SOURCE_AGENT, sourceQuestion: r.SOURCE_QUESTION, recommendation: r.RECOMMENDATION,
          expectedRevenueProtected: num(r.EXPECTED_REVENUE_PROTECTED), riskScore: r.RENEWAL_RISK_SCORE != null ? num(r.RENEWAL_RISK_SCORE) : null };
      });
      return runSql(qWb, ROLE_READER);
    })
    .then(function (rs) {
      out.writeback = rowsToObjects(rs).map(function (r) {
        return { actionId: r.ACTION_ID, accountId: r.ACCOUNT_ID, accountName: r.ACCOUNT_NAME, region: r.REGION, recommendation: r.RECOMMENDATION,
          approvalStatus: r.APPROVAL_STATUS, approvedBy: r.APPROVED_BY, executionStatus: r.EXECUTION_STATUS,
          actualRevenueProtected: num(r.ACTUAL_REVENUE_PROTECTED), completedTs: r.COMPLETED_TS };
      });
      return runSql(qRollup, ROLE_READER);
    })
    .then(function (rs) {
      var r = rowsToObjects(rs)[0] || {};
      out.protected = { baseline: num(r.BASELINE_PROTECTED), writeback: num(r.WRITEBACK_PROTECTED), total: num(r.TOTAL_PROTECTED),
        approvedCount: num(r.WRITEBACK_APPROVED_COUNT), executedCount: num(r.WRITEBACK_EXECUTED_COUNT) };
      return { response: out };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

/* Idempotent-per-ACTION_ID upsert into the writeback hybrid table (WRITER role).
 * approvalStatus: 'Approved' | 'Rejected'; executionStatus: 'Pending' | 'Executed' | 'Voided'. */
function writeActionStatus(actionId, accountId, accountName, region, recommendation, approvalStatus, approvedBy, executionStatus, actualRevenueProtected) {
  var id = String(actionId || "").trim();
  if (!id) return Promise.resolve({ response: { status: "FAILED", error: "Missing actionId." } });
  var completed = executionStatus === "Executed" ? "CURRENT_TIMESTAMP()::TIMESTAMP_NTZ" : "NULL::TIMESTAMP_NTZ";
  var src =
    "SELECT " + sqlLiteral(id) + " AS ACTION_ID, " + sqlLiteral(accountId || "") + " AS ACCOUNT_ID, " +
    sqlLiteral(accountName || "") + " AS ACCOUNT_NAME, " + sqlLiteral(region || "") + " AS REGION, " +
    sqlLiteral(recommendation || "") + " AS RECOMMENDATION, " + sqlLiteral(approvalStatus || "Approved") + " AS APPROVAL_STATUS, " +
    sqlLiteral(approvedBy || "Domo App") + " AS APPROVED_BY, " + sqlLiteral(executionStatus || "Pending") + " AS EXECUTION_STATUS, " +
    numLit(actualRevenueProtected) + "::DOUBLE AS ACTUAL_REVENUE_PROTECTED, " + completed + " AS COMPLETED_TS";
  var sql =
    "MERGE INTO " + WRITEBACK + " tgt USING (" + src + ") src ON tgt.ACTION_ID = src.ACTION_ID " +
    "WHEN MATCHED THEN UPDATE SET tgt.APPROVAL_STATUS = src.APPROVAL_STATUS, tgt.APPROVED_BY = src.APPROVED_BY, " +
    "tgt.EXECUTION_STATUS = src.EXECUTION_STATUS, tgt.ACTUAL_REVENUE_PROTECTED = src.ACTUAL_REVENUE_PROTECTED, tgt.COMPLETED_TS = src.COMPLETED_TS " +
    "WHEN NOT MATCHED THEN INSERT (ACTION_ID, ACCOUNT_ID, ACCOUNT_NAME, REGION, RECOMMENDATION, APPROVAL_STATUS, APPROVED_BY, EXECUTION_STATUS, ACTUAL_REVENUE_PROTECTED, COMPLETED_TS) " +
    "VALUES (src.ACTION_ID, src.ACCOUNT_ID, src.ACCOUNT_NAME, src.REGION, src.RECOMMENDATION, src.APPROVAL_STATUS, src.APPROVED_BY, src.EXECUTION_STATUS, src.ACTUAL_REVENUE_PROTECTED, src.COMPLETED_TS)";
  return runSql(sql, ROLE_WRITER)
    .then(function () { return { response: { status: "SUCCEEDED", mode: "LIVE", action: "writeActionStatus", actionId: id, approvalStatus: approvalStatus, executionStatus: executionStatus } }; })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err), actionId: id } }; });
}

/* --------------------- Govern everywhere (Sprint 7) ----------------------- */
/* Live governance evidence: the two-persona parity test (same query, different
 * governed rows) + column masking, both enforced by Horizon policies at the
 * query engine. Static inventory/guardrail/readiness content comes from the
 * seed; this returns the dynamic proof. Honest disclosure: role-based under a
 * named service identity (per-end-user identity / C8 is a target-instance step). */
var GOV_PARITY_Q = "SELECT region, COUNT(*) AS accounts, ROUND(SUM(revenue_at_risk)) AS rev_at_risk FROM " +
  DATABASE + "." + SCHEMA + ".GOLD_CUSTOMER_RENEWAL_RISK GROUP BY region ORDER BY region";
var GOV_PARITY_ROLES = [
  { role: ROLE_READER, scope: "All regions" },
  { role: "REVENUE_CC_READER_WEST", scope: "West only" },
  { role: "REVENUE_CC_READER_EAST", scope: "East only" }
];
// Known West accounts so the same rows are visible to both base + West roles (masking demo).
var GOV_MASK_Q = "SELECT ACCOUNT_ID, ANNUAL_RECURRING_REVENUE FROM " + DATABASE + "." + SCHEMA +
  ".DIM_ACCOUNT WHERE ACCOUNT_ID IN ('ACC-00007','ACC-00008','ACC-00009') ORDER BY ACCOUNT_ID";

function getGovernance() {
  var out = { status: "SUCCEEDED", mode: "LIVE", parity: { query: GOV_PARITY_Q, roles: [] },
    masking: { column: "ANNUAL_RECURRING_REVENUE", baseRole: ROLE_READER, maskedRole: "REVENUE_CC_READER_WEST", sample: [] },
    generatedAt: new Date().toISOString() };
  var chain = Promise.resolve();
  GOV_PARITY_ROLES.forEach(function (pr) {
    chain = chain.then(function () {
      return runSql(GOV_PARITY_Q, pr.role).then(function (rs) {
        var rows = rowsToObjects(rs).map(function (r) { return { region: r.REGION, accounts: num(r.ACCOUNTS), revAtRisk: num(r.REV_AT_RISK) }; });
        out.parity.roles.push({ role: pr.role, scope: pr.scope, total: rows.reduce(function (a, x) { return a + x.accounts; }, 0), rows: rows });
      });
    });
  });
  var maskBase = {};
  chain = chain.then(function () {
    return runSql(GOV_MASK_Q, ROLE_READER).then(function (rs) {
      rowsToObjects(rs).forEach(function (r) { maskBase[r.ACCOUNT_ID] = num(r.ANNUAL_RECURRING_REVENUE); });
    });
  });
  chain = chain.then(function () {
    return runSql(GOV_MASK_Q, "REVENUE_CC_READER_WEST").then(function (rs) {
      out.masking.sample = rowsToObjects(rs).map(function (r) {
        var m = r.ANNUAL_RECURRING_REVENUE;
        return { accountId: r.ACCOUNT_ID, real: maskBase[r.ACCOUNT_ID] != null ? maskBase[r.ACCOUNT_ID] : null, masked: (m === null || m === undefined) ? null : num(m) };
      });
    });
  });
  return chain.then(function () { return { response: out }; })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

/* --------------------- Semantic layer (Semantic Model surface) ------------ */
/* Introspect and evolve the governed semantic view that powers the whole app.
 * describeSemanticView runs DESCRIBE SEMANTIC VIEW and parses the flat
 * (object_kind, object_name, parent_entity, property, property_value) result
 * into a graph the app can render (tables -> dimensions/facts/metrics,
 * relationships, verified queries, custom instruction). alterSemanticView runs
 * a guarded ALTER SEMANTIC VIEW (best-effort; requires ownership of the view). */

function jsonArr(v) {
  try { var a = JSON.parse(v); return Array.isArray(a) ? a : (a == null ? [] : [a]); }
  catch (e) { return v ? [String(v)] : []; }
}

/* Lower-case the SQL-API column keys so DESCRIBE parsing is case-insensitive. */
function lowerRow(r) {
  var o = {};
  Object.keys(r || {}).forEach(function (k) { o[String(k).toLowerCase()] = r[k]; });
  return o;
}

function parseSemanticModel(resultSet, fqn) {
  var raw = rowsToObjects(resultSet).map(lowerRow);
  var tables = {}, rels = {}, verified = {}, custom = "";
  function tbl(name) {
    if (!tables[name]) tables[name] = { name: name, base: "", database: "", schema: "", comment: "", synonyms: [], primaryKey: [], dimensions: [], facts: [], metrics: [] };
    return tables[name];
  }
  raw.forEach(function (r) {
    var kind = String(r.object_kind || "").toUpperCase();
    var obj = r.object_name, parent = r.parent_entity, prop = String(r.property || "").toUpperCase(), val = r.property_value;
    if (kind === "TABLE") {
      var t = tbl(obj);
      if (prop === "BASE_TABLE_DATABASE_NAME") t.database = val;
      else if (prop === "BASE_TABLE_SCHEMA_NAME") t.schema = val;
      else if (prop === "BASE_TABLE_NAME") t.base = val;
      else if (prop === "COMMENT") t.comment = val;
      else if (prop === "SYNONYMS") t.synonyms = jsonArr(val);
      else if (prop === "PRIMARY_KEY") t.primaryKey = jsonArr(val);
    } else if (kind === "DIMENSION" || kind === "FACT" || kind === "METRIC") {
      var tt = tbl(parent || (val && prop === "TABLE" ? val : "UNKNOWN"));
      var bucket = kind === "METRIC" ? tt.metrics : (kind === "FACT" ? tt.facts : tt.dimensions);
      var item = null;
      for (var i = 0; i < bucket.length; i++) { if (bucket[i].name === obj) { item = bucket[i]; break; } }
      if (!item) { item = { name: obj, expression: "", dataType: "", comment: "", synonyms: [] }; bucket.push(item); }
      if (prop === "EXPRESSION") item.expression = val;
      else if (prop === "DATA_TYPE") item.dataType = val;
      else if (prop === "COMMENT") item.comment = val;
      else if (prop === "SYNONYMS") item.synonyms = jsonArr(val);
    } else if (kind === "RELATIONSHIP") {
      if (!rels[obj]) rels[obj] = { name: obj, from: parent, to: "", foreignKey: [], refKey: [] };
      if (prop === "TABLE") rels[obj].from = val;
      else if (prop === "REF_TABLE") rels[obj].to = val;
      else if (prop === "FOREIGN_KEY") rels[obj].foreignKey = jsonArr(val);
      else if (prop === "REF_KEY") rels[obj].refKey = jsonArr(val);
    } else if (kind === "AI_VERIFIED_QUERY") {
      if (!verified[obj]) verified[obj] = { name: obj, question: "", sql: "" };
      if (prop === "QUESTION") verified[obj].question = val;
      else if (prop === "SQL") verified[obj].sql = val;
    } else if (kind === "CUSTOM_INSTRUCTION") {
      if (prop === "COMMENT" || prop === "SQL" || val) custom = custom || val;
    }
  });
  var tableList = Object.keys(tables).map(function (k) { return tables[k]; });
  var relList = Object.keys(rels).map(function (k) { return rels[k]; });
  var vqList = Object.keys(verified).map(function (k) { return verified[k]; }).filter(function (v) { return v.question || v.sql; });
  var dims = 0, facts = 0, metrics = 0;
  tableList.forEach(function (t) { dims += t.dimensions.length; facts += t.facts.length; metrics += t.metrics.length; });
  return {
    name: fqn,
    customInstruction: custom,
    stats: { tables: tableList.length, relationships: relList.length, dimensions: dims, facts: facts, metrics: metrics, verifiedQueries: vqList.length },
    tables: tableList,
    relationships: relList,
    verifiedQueries: vqList
  };
}

/* Auto-discover the governed semantic views in the schema so the app can offer
 * a live picker instead of a hardcoded view. Runs SHOW SEMANTIC VIEWS as READER
 * and returns [{ name, database, schema, fqn, comment }]. Falls back cleanly if
 * the account has none. */
function listSemanticViews() {
  var sql = "SHOW SEMANTIC VIEWS IN SCHEMA " + DATABASE + "." + SCHEMA;
  return runSql(sql, ROLE_READER)
    .then(function (rs) {
      var rows = rowsToObjects(rs);
      var views = rows.map(function (r) {
        var name = r.name || r.NAME || "";
        var db = r.database_name || r.DATABASE_NAME || DATABASE;
        var sc = r.schema_name || r.SCHEMA_NAME || SCHEMA;
        return { name: name, database: db, schema: sc, fqn: db + "." + sc + "." + name, comment: r.comment || r.COMMENT || "" };
      }).filter(function (v) { return !!v.name; });
      if (!views.length) {
        views = [{ name: SEMANTIC_VIEW, database: DATABASE, schema: SCHEMA, fqn: DATABASE + "." + SCHEMA + "." + SEMANTIC_VIEW, comment: "" }];
      }
      return { response: { status: "SUCCEEDED", mode: "LIVE", primary: DATABASE + "." + SCHEMA + "." + SEMANTIC_VIEW, views: views, sql: sql, generatedAt: new Date().toISOString() } };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err), sql: sql,
      views: [{ name: SEMANTIC_VIEW, database: DATABASE, schema: SCHEMA, fqn: DATABASE + "." + SCHEMA + "." + SEMANTIC_VIEW, comment: "" }] } }; });
}

function describeSemanticView(view) {
  var fqn = (view && String(view).indexOf(".") > -1) ? String(view) : (DATABASE + "." + SCHEMA + "." + SEMANTIC_VIEW);
  var sql = "DESCRIBE SEMANTIC VIEW " + fqn;
  return runSql(sql, ROLE_READER)
    .then(function (rs) {
      var model = parseSemanticModel(rs, fqn);
      return { response: { status: "SUCCEEDED", mode: "LIVE", view: fqn, sql: sql, model: model, generatedAt: new Date().toISOString() } };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err), view: fqn, sql: sql } }; });
}

/* Best-effort ALTER SEMANTIC VIEW. Guarded to ALTER SEMANTIC VIEW statements
 * only. Runs under WRITER; if the service identity does not own the view the
 * engine rejects it and we surface the exact error (honest, not simulated). */
function alterSemanticView(ddl) {
  var stmt = String(ddl || "").trim().replace(/;\s*$/, "");
  if (!stmt) return Promise.resolve({ response: { status: "FAILED", error: "Empty DDL.", ddl: stmt } });
  if (!/^alter\s+semantic\s+view/i.test(stmt)) {
    return Promise.resolve({ response: { status: "FAILED", error: "Only ALTER SEMANTIC VIEW statements are allowed here.", ddl: stmt } });
  }
  return runSql(stmt, ROLE_WRITER)
    .then(function () { return { response: { status: "SUCCEEDED", mode: "LIVE", executed: true, ddl: stmt } }; })
    .catch(function (err) { return { response: { status: "FAILED", executed: false, error: detail(err), ddl: stmt } }; });
}

/* --------------------- Domo Cloud Amplifier (BYOS) ------------------------ */
/* Register SNOWFLAKE_REVENUE_CC views/tables as Cloud Amplifier–backed Domo
 * datasets (no data copy — Domo queries Snowflake in place). These calls use
 * the Code Engine session identity via codeengine.sendRequest; no Snowflake
 * key-pair JWT is needed. Endpoints mirror the reference package. */

/* List the Snowflake Cloud Amplifier integrations configured for this instance,
 * so the app / operator can resolve integrationId without hardcoding a UUID. */
function getSnowflakeIntegrations() {
  return Promise.resolve(codeengine.sendRequest("get", "/api/query/v1/byos/accounts?filter=deviceEngine%3ASNOWFLAKE"))
    .then(function (integrations) {
      return { response: { status: "SUCCEEDED", integrations: Array.isArray(integrations) ? integrations : [] } };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

/* Register one external table/view as a Cloud Amplifier dataset.
 *   POST /api/data/v1/byos/register/{integrationId}
 *   body: [{ dataProviderKey, databaseName, schemaName, tableName }] */
function registerCloudAmplifierTable(integrationId, database, schema, table, dataProviderKey) {
  var checks = [["integrationId", integrationId], ["database", database], ["schema", schema], ["table", table]];
  for (var i = 0; i < checks.length; i++) {
    if (!checks[i][1] || typeof checks[i][1] !== "string") {
      return Promise.resolve({ response: { status: "FAILED", error: checks[i][0] + " is required and must be a string" } });
    }
  }
  var body = [{
    dataProviderKey: dataProviderKey || "snowflake",
    databaseName: database,
    schemaName: schema,
    tableName: table
  }];
  var path = "/api/data/v1/byos/register/" + encodeURIComponent(integrationId);
  return Promise.resolve(codeengine.sendRequest("post", path, body))
    .then(function (resp) {
      var summary = resp && resp.summary;
      var result = (resp && Array.isArray(resp.results)) ? resp.results[0] : null;
      if (summary && summary.failed > 0) {
        return { response: { status: "FAILED", error: (result && result.errorMessage) || "BYOS registration reported failures", summary: summary } };
      }
      return { response: {
        status: "SUCCEEDED",
        datasourceId: result && result.datasource,
        displayName: result && result.displayName,
        datasetStatus: result && result.status,
        summary: summary
      } };
    })
    .catch(function (err) { return { response: { status: "FAILED", error: detail(err) } }; });
}

/* -------------------------------- utils ----------------------------------- */
function detail(err) {
  try {
    if (err && err.response && err.response.data) {
      var d = err.response.data;
      return typeof d === "string" ? d : JSON.stringify(d);
    }
  } catch (ignore) {}
  if (err && err.message) return err.message;
  try { return String(err); } catch (e) { return "Unknown error"; }
}

module.exports = {
  ping: ping,
  runSql: runSql,
  getForecastHome: getForecastHome,
  askAnalyst: askAnalyst,
  askCortexAgent: askCortexAgent,
  runModelInference: runModelInference,
  getOpsState: getOpsState,
  createScenario: createScenario,
  updateScenarioStatus: updateScenarioStatus,
  deleteScenario: deleteScenario,
  createFeedback: createFeedback,
  getApprovalQueue: getApprovalQueue,
  writeActionStatus: writeActionStatus,
  getGovernance: getGovernance,
  listSemanticViews: listSemanticViews,
  describeSemanticView: describeSemanticView,
  alterSemanticView: alterSemanticView,
  getSnowflakeIntegrations: getSnowflakeIntegrations,
  registerCloudAmplifierTable: registerCloudAmplifierTable
};
