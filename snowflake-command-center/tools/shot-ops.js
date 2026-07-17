const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1050, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => { const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Hybrid Tables") > -1); if (el) el.click(); });
  await new Promise((r) => setTimeout(r, 1200));

  const probe = await page.evaluate(() => ({
    railLabel: (document.querySelector(".rail-item.active .rail-label") || {}).textContent || "",
    header: !!document.querySelector(".ops-state"),
    eyebrow: (document.querySelector(".ops-eyebrow") || {}).textContent || "",
    toolbar: !!document.querySelector(".ops-toolbar"),
    scenRows: document.querySelectorAll(".ops-scen-table tbody tr").length,
    openInSnowsight: !!document.querySelector(".ops-toolbar .src-link"),
    cardGridGone: !document.querySelector(".scen-card"),
  }));
  await page.screenshot({ path: "tools/ops-scenarios.png", fullPage: true });

  // Open add-row form
  await page.evaluate(() => { const b = [...document.querySelectorAll(".ops-toolbar .pill-btn")].find(x => /add row/i.test(x.textContent)); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 500));
  const addForm = await page.evaluate(() => ({ form: !!document.querySelector(".ops-addform"), fields: document.querySelectorAll(".ops-addform .ops-fld").length }));
  await page.screenshot({ path: "tools/ops-addrow.png" });

  // Close add, select a scenario row -> detail
  await page.evaluate(() => { const b = [...document.querySelectorAll(".ops-toolbar .pill-btn")].find(x => /close/i.test(x.textContent)); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 300));
  await page.evaluate(() => { const r = document.querySelector(".scen-row"); if (r) r.click(); });
  await new Promise((r) => setTimeout(r, 500));
  const detail = await page.evaluate(() => ({ detail: !!document.querySelector(".ops-selected"), statusSel: !!document.querySelector(".ops-sel-status select") }));
  await page.screenshot({ path: "tools/ops-detail.png", fullPage: true });

  // Feedback tab
  await page.evaluate(() => { const b = [...document.querySelectorAll(".ops-subtab")].find(x => /feedback/i.test(x.textContent)); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 500));
  const fb = await page.evaluate(() => ({ rows: document.querySelectorAll(".ops-table tbody tr").length, fqn: (document.querySelector(".ops-tb-fqn code") || {}).textContent || "" }));
  await page.screenshot({ path: "tools/ops-feedback.png" });

  console.log("scenarios:", JSON.stringify(probe, null, 2));
  console.log("addForm:", JSON.stringify(addForm, null, 2));
  console.log("detail:", JSON.stringify(detail, null, 2));
  console.log("feedback:", JSON.stringify(fb, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
