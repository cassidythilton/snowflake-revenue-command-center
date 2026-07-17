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
    const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Cortex Analyst") > -1);
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 700));

  // Closed state — crop the connection bar
  const bar = await page.$(".conn-bar");
  if (bar) await bar.screenshot({ path: "tools/an-connbar.png" });

  const probe = await page.evaluate(() => ({
    hasPicker: !!document.querySelector(".cc-picker"),
    pickerLabel: (document.querySelector(".cc-picker .cc-lab") || {}).textContent || "",
    pickerVal: (document.querySelector(".cc-picker .cc-val") || {}).textContent || "",
    gearGone: !document.querySelector(".cbar-tools .cbar-icon.open"),
  }));

  // Open the picker
  await page.evaluate(() => { const b = document.querySelector(".cc-picker"); if (b) b.click(); });
  await new Promise((r) => setTimeout(r, 700));
  await page.screenshot({ path: "tools/an-picker-open.png", clip: { x: 200, y: 100, width: 900, height: 520 } });

  const openProbe = await page.evaluate(() => ({
    menuOpen: !!document.querySelector(".vp-menu"),
    options: document.querySelectorAll(".vp-opt").length,
    hasOpenLinks: document.querySelectorAll(".vp-open").length,
  }));

  console.log("closed:", JSON.stringify(probe, null, 2));
  console.log("open:", JSON.stringify(openProbe, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
