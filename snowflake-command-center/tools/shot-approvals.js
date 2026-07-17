const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Approvals") > -1);
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 900));

  const probe = await page.evaluate(() => ({
    hasPanel: !!document.querySelector(".action-center"),
    isPanel: !!document.querySelector("article.panel.action-center"),
    hasEmpty: !!document.querySelector(".ac-empty"),
    emptyHeading: (document.querySelector(".ac-empty h3") || {}).textContent || "",
    hasQueueTag: !!document.querySelector(".queue-tag"),
    queueHref: (document.querySelector(".queue-tag") || {}).href || "",
    hasBack: !!document.querySelector(".ac-back"),
    statStripGone: !document.querySelector(".aps-strip"),
    sendPlayGone: !document.querySelector(".start-approval"),
  }));
  await page.screenshot({ path: "tools/approvals-default.png" });

  // Also confirm Forecast Home Agent Action Queue still renders
  await page.evaluate(() => { const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Forecast Home") > -1); if (el) el.click(); });
  await new Promise((r) => setTimeout(r, 1400));
  const home = await page.evaluate(() => ({ aaq: !!document.querySelector(".aaq-panel"), aaqRows: document.querySelectorAll(".aaq-table tbody tr").length }));

  console.log("approvals:", JSON.stringify(probe, null, 2));
  console.log("home:", JSON.stringify(home, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
