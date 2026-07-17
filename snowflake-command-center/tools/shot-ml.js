const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Snowflake ML") > -1);
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 900));

  const dflt = await page.evaluate(() => ({
    adhoc: !!document.querySelector(".ml-infer"),
    predEmpty: !!document.querySelector(".ml-pred-empty"),
    emptyHeading: (document.querySelector(".ml-pred-empty h3") || {}).textContent || "",
    formFields: document.querySelectorAll(".ml-form-grid .mlf-field").length,
    acctVal: (document.querySelector(".mlf-in.acct") || {}).value || "",
    bareSpinner: !!document.querySelector("main > .analyst-loading"),
  }));
  await page.screenshot({ path: "tools/ml-default.png", fullPage: true });

  // Run a prediction
  await page.evaluate(() => { const b = [...document.querySelectorAll(".ml-pred-empty .pill-btn")][0]; if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 2500));
  const scored = await page.evaluate(() => ({
    hasPred: !!document.querySelector(".pred-top"),
    hasPayload: !!document.querySelector(".ml-payload"),
    hasLog: !!document.querySelector(".ml-log"),
  }));
  await page.screenshot({ path: "tools/ml-scored.png", fullPage: true });

  console.log("default:", JSON.stringify(dflt, null, 2));
  console.log("scored:", JSON.stringify(scored, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
