const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));

  const tabs = ["Forecast Home", "Cortex Analyst", "Snowflake ML", "Approvals", "Hybrid Tables", "Semantic Model", "Cortex Workspace", "How it works"];
  const out = {};
  for (const label of tabs) {
    const clicked = await page.evaluate((lab) => {
      const el = [...document.querySelectorAll(".rail-item")].find((b) => (b.title || "").indexOf(lab) > -1);
      if (el) { el.click(); return true; } return false;
    }, label);
    await new Promise((r) => setTimeout(r, 700));
    const info = await page.evaluate(() => ({
      panels: document.querySelectorAll("#view .panel, #view .cw-shell, #view section").length,
      firstH2: (document.querySelector("#view h2") || {}).textContent || "",
    }));
    out[label] = { clicked, ...info };
  }
  // Cortex Analyst icon color (computed) vs Snowflake ML icon color
  const iconColors = await page.evaluate(() => {
    const items = [...document.querySelectorAll(".rail-item")];
    const find = (lab) => items.find((b) => (b.title || "").indexOf(lab) > -1);
    const col = (b) => b ? getComputedStyle(b.querySelector(".rail-ico")).color : null;
    return { analyst: col(find("Cortex Analyst")), ml: col(find("Snowflake ML")) };
  });

  console.log("tabs:", JSON.stringify(out, null, 2));
  console.log("iconColors:", JSON.stringify(iconColors));
  console.log("pageErrors:", errs.length ? errs : "none");
  await browser.close();
})();
