const puppeteer = require("puppeteer");

async function shot(page, label, file) {
  const clicked = await page.evaluate((lab) => {
    const tabs = Array.from(document.querySelectorAll(".view-tab"));
    const t = tabs.find((b) => new RegExp(lab, "i").test(b.textContent));
    if (!t) return false;
    t.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    return true;
  }, label);
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: file, fullPage: true });
  return clicked;
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/404/.test(m.text())) errs.push(m.text()); });

  await page.goto("http://localhost:8782/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  const c1 = await shot(page, "Domo Chat v2", "tools/s9-chat.png");
  const c2 = await shot(page, "CoWork", "tools/s8-cowork.png");
  const c3 = await shot(page, "How it works", "tools/s9-how.png");

  const probe = await page.evaluate(() => ({
    mcpTools: document.querySelectorAll(".mcp-json").length,
    spine: document.querySelectorAll(".spine-node").length,
    arch: document.querySelectorAll(".arch-card").length,
    gated: document.querySelectorAll(".gated-banner").length,
    stat: document.querySelectorAll(".stat-chip").length
  }));

  console.log("clicked:", { chat: c1, cowork: c2, how: c3 });
  console.log("probe:", JSON.stringify(probe));
  console.log("errors:", errs.length ? errs : "none");
  await browser.close();
})();
