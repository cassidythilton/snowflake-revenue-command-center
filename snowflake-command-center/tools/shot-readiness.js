const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1400, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  // Click the "Horizon AI Readiness" rail item.
  const clicked = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".rail-item"));
    const t = items.find((el) => /readiness/i.test(el.textContent) || /AI Readiness/i.test(el.textContent));
    if (t) { t.click(); return t.textContent.trim(); }
    return null;
  });
  await new Promise((r) => setTimeout(r, 1200));

  const probe = await page.evaluate(() => ({
    datasets: document.querySelectorAll(".rl-ds").length,
    rows: document.querySelectorAll(".rl-table tbody tr").length,
    chips: document.querySelectorAll(".rl-chip").length,
    title: (document.querySelector(".rl-plane-head h2") || {}).textContent || "",
    selName: (document.querySelector(".rl-detail-head h3") || {}).textContent || "",
  }));

  await page.screenshot({ path: "tools/readiness-full.png" });
  console.log("clicked:", clicked);
  console.log("probe:", JSON.stringify(probe));
  console.log("consoleErrors:", errs.length ? errs.slice(0, 5) : "none");
  await browser.close();
})();
