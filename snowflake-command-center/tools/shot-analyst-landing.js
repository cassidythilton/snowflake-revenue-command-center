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
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll("button, .tab, a")).find((x) => (x.textContent || "").trim() === "Cortex Analyst");
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "tools/analyst-landing.png", fullPage: true });
  const probe = await page.evaluate(() => ({
    connBar: !!document.querySelector(".conn-bar"),
    gear: !!document.querySelector(".cbar-icon"),
    inputwrap: !!document.querySelector(".aw-inputwrap"),
    oldChip: !!document.querySelector(".conn-chip"),
    oldHead: !!document.querySelector(".chat-head"),
  }));
  console.log("probe:", JSON.stringify(probe));
  console.log("consoleErrors:", errs.filter((e) => !/501|404|okta|Framing|violation/i.test(e)));
  await browser.close();
})();
