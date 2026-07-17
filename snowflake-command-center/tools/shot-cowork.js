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

  // Pin the rail open so labels show, then go to Cortex Workspace.
  await page.click("#railPin");
  await new Promise((r) => setTimeout(r, 400));
  await page.evaluate(() => {
    const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Cortex Workspace") > -1);
    if (el) el.click();
  });
  await new Promise((r) => setTimeout(r, 700));

  const probe = await page.evaluate(() => ({
    hasShell: !!document.querySelector(".cw-shell"),
    threads: document.querySelectorAll(".cw-thread").length,
    starters: document.querySelectorAll(".cw-starter").length,
    heroTitle: (document.querySelector(".cw-hero h2") || {}).textContent || "",
    composer: !!document.querySelector("#cwInput"),
  }));

  // Empty hero state
  await page.screenshot({ path: "tools/cw-hero.png" });

  // Ask a question via the first suggested starter, wait for the animated answer.
  await page.evaluate(() => { const s = document.querySelector(".cw-starter"); if (s) s.click(); });
  await new Promise((r) => setTimeout(r, 6500));
  await page.screenshot({ path: "tools/cw-answer.png" });

  const answered = await page.evaluate(() => ({
    userMsgs: document.querySelectorAll(".cw-msg.user").length,
    assistantMsgs: document.querySelectorAll(".cw-msg.assistant").length,
    toolchips: document.querySelectorAll(".cw-toolchip").length,
    cites: document.querySelectorAll(".cw-cite").length,
    answerLen: ((document.querySelector(".cw-answer") || {}).textContent || "").length,
    steps: document.querySelectorAll(".cw-step.show").length,
    hasSql: !!document.querySelector(".cw-sql-toggle"),
    hasResult: !!document.querySelector(".cw-result"),
  }));

  // Open the under-the-hood wiring
  await page.evaluate(() => { const t = document.querySelector(".cw-wire-toggle"); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "tools/cw-full.png", fullPage: true });

  // Extended-thinking toggle on, new chat
  await page.evaluate(() => { const t = document.querySelector(".cw-think"); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 250));
  await page.screenshot({ path: "tools/cw-composer.png" });

  console.log("probe:", JSON.stringify(probe, null, 2));
  console.log("answered:", JSON.stringify(answered, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
