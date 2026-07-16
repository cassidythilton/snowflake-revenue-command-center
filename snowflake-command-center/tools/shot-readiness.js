const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  // Click the Horizon AI Readiness tab
  const clicked = await page.evaluate(() => {
    const tabs = Array.from(document.querySelectorAll(".view-tab"));
    const t = tabs.find((b) => /Horizon AI Readiness/i.test(b.textContent));
    if (!t) return false;
    t.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  });
  await new Promise((r) => setTimeout(r, 900));

  const probe = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      hasParity: !!q(".gpc-grid"),
      parityCols: document.querySelectorAll(".gpc").length,
      hasMasking: !!q(".masked-cell"),
      guards: document.querySelectorAll(".guard-card").length,
      policies: document.querySelectorAll(".policy-item").length,
      readinessRows: document.querySelectorAll(".panel .result-table tbody tr").length,
      query: (q(".gov-query") || {}).textContent || ""
    };
  });

  await page.screenshot({ path: "tools/readiness-full.png", fullPage: true });
  const el = await page.$(".panel");
  if (el) await el.screenshot({ path: "tools/readiness-parity.png" });

  console.log("clicked:", clicked);
  console.log("probe:", JSON.stringify(probe, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
