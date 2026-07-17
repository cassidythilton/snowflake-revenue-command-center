const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1100, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  const tabs = await page.evaluate(() =>
    Array.from(document.querySelectorAll(".tab, .nav-tab, nav button, [class*='tab']"))
      .map((b) => (b.textContent || "").trim())
      .filter(Boolean)
  );

  async function clickTab(label) {
    const ok = await page.evaluate((label) => {
      const btns = Array.from(document.querySelectorAll("button, .tab, .nav-tab, a"));
      const t = btns.find((b) => (b.textContent || "").trim().toLowerCase().includes(label.toLowerCase()));
      if (t) { t.click(); return true; }
      return false;
    }, label);
    await new Promise((r) => setTimeout(r, 900));
    return ok;
  }

  const shots = [
    ["Cortex Workspace", "tab-cowork.png"],
    ["Domo Chat v2", "tab-chatv2.png"],
    ["Horizon AI Readiness", "tab-readiness.png"],
  ];
  const results = {};
  for (const [label, file] of shots) {
    const ok = await clickTab(label);
    await page.screenshot({ path: "tools/" + file, fullPage: true });
    results[label] = ok;
  }

  const probe = await page.evaluate(() => ({
    coworkLaunch: !!document.querySelector(".cw-launch"),
    agentEmbed: !!document.querySelector(".agent-embed"),
    embedHead: !!document.querySelector(".embed-head"),
  }));

  console.log("NAV TABS:", JSON.stringify(tabs));
  console.log("clicked:", JSON.stringify(results));
  console.log("probe:", JSON.stringify(probe));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
