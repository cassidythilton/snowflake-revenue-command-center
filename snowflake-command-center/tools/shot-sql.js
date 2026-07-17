const puppeteer = require("puppeteer");
(async () => {
  const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const p = await b.newPage();
  await p.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  const errs = [];
  p.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await p.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  const chk = await p.evaluate(() => {
    const has = !!(window.sqlFormatter && window.sqlFormatter.format);
    let sample = "";
    if (has) sample = window.sqlFormatter.format("WITH __risk AS (SELECT risk_month, account_id, region, segment, renewal_risk_score, risk_tier FROM fact_renewal_risk WHERE region='West') SELECT account_id, renewal_risk_score FROM __risk ORDER BY renewal_risk_score DESC LIMIT 10", { language: "snowflake", keywordCase: "upper", tabWidth: 2 });
    return { has, sample };
  });
  // Cortex Analyst -> run a verified query -> open Details -> screenshot SQL
  await p.evaluate(() => { const el = [...document.querySelectorAll(".rail-item")].find(b => (b.title || "").indexOf("Cortex Analyst") > -1); if (el) el.click(); });
  await new Promise((r) => setTimeout(r, 800));
  await p.evaluate(() => { const c = document.querySelector(".aw-vq"); if (c) c.click(); });
  await new Promise((r) => setTimeout(r, 2500));
  await p.evaluate(() => { const t = [...document.querySelectorAll(".qr-tab")].find(x => /details/i.test(x.textContent)); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 500));
  const sqlText = await p.evaluate(() => { const el = document.querySelector(".sql-block code"); return el ? el.textContent.slice(0, 400) : "(none)"; });
  await p.screenshot({ path: "tools/sql-analyst.png" });
  console.log("sqlFormatter loaded:", chk.has);
  console.log("----- sample -----\n" + chk.sample);
  console.log("----- rendered analyst SQL -----\n" + sqlText);
  console.log("pageErrors:", errs.length ? errs : "none");
  await b.close();
})();
