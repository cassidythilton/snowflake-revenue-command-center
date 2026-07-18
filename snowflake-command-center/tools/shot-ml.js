const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1400, deviceScaleFactor: 2 });
  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));
  await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll(".rail-item"));
    const t = items.find((el) => /Snowflake ML|ML Predictions|Score renewal/i.test(el.textContent));
    if (t) t.click();
  });
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: "tools/ml-default.png" });

  // Click Run prediction -> capture the scored result (seed fallback in preview).
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button")).find((x) => /Run prediction/i.test(x.textContent));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.screenshot({ path: "tools/ml-scoring.png" });
  await new Promise((r) => setTimeout(r, 1600));
  await page.screenshot({ path: "tools/ml-scored.png" });

  const probe = await page.evaluate(() => ({
    facts: document.querySelectorAll(".ml-fact").length,
    gauge: !!document.querySelector(".gauge.donut"),
    drivers: document.querySelectorAll(".driver").length,
  }));
  console.log("probe:", JSON.stringify(probe));
  await browser.close();
})();
