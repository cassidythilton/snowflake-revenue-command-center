const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));
  await page.evaluate(() => { const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf("Snowflake CoWork") > -1); if (el) el.click(); });
  await new Promise((r) => setTimeout(r, 800));

  const probe = await page.evaluate(() => ({
    label: (document.querySelector(".rail-item.active .rail-label") || {}).textContent || "",
    home: !!document.querySelector(".cw-home"),
    greet: (document.querySelector(".cw-greet h1") || {}).textContent || "",
    greetSub: (document.querySelector(".cw-greet-sub") || {}).textContent || "",
    starters: document.querySelectorAll(".cw-starter").length,
    hasPlus: !!document.querySelector(".cw-plus"),
    agentPill: (document.querySelector(".cw-agent-pill") || {}).textContent || "",
    placeholder: (document.querySelector("#cwInput") || {}).placeholder || "",
  }));
  await page.screenshot({ path: "tools/cw2-home.png" });

  // Type to show send activate, then ask a starter to see transcript layout
  await page.evaluate(() => { const s = document.querySelector(".cw-starter"); if (s) s.click(); });
  await new Promise((r) => setTimeout(r, 6500));
  await page.screenshot({ path: "tools/cw2-answer.png" });
  const answered = await page.evaluate(() => ({ stream: !!document.querySelector(".cw-stream"), bottomComposer: !!document.querySelector(".cw-main > .cw-composer-wrap"), userMsgs: document.querySelectorAll(".cw-msg.user").length }));

  console.log("home:", JSON.stringify(probe, null, 2));
  console.log("answered:", JSON.stringify(answered, null, 2));
  console.log("pageErrors:", errs.length ? errs : "none");
  await browser.close();
})();
