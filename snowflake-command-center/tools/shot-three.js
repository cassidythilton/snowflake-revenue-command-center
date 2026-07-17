const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 600));
  async function tab(label, file, extra) {
    await page.evaluate((label) => {
      const b = Array.from(document.querySelectorAll("button, .tab, a")).find((x) => (x.textContent || "").trim() === label);
      if (b) b.click();
    }, label);
    await new Promise((r) => setTimeout(r, extra || 1100));
    await page.screenshot({ path: "tools/" + file, fullPage: true });
  }
  await tab("Snowflake ML", "cur-ml.png");
  await tab("Approvals", "cur-approvals.png");
  await tab("Horizon AI Readiness", "cur-readiness.png");
  console.log("consoleErrors:", errs.filter((e) => !/501|404|okta|Framing|violation/i.test(e)));
  await browser.close();
})();
