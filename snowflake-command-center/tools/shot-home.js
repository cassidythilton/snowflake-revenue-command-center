const puppeteer = require("puppeteer");

(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1100, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 900));

  const probe = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      hasChart: !!q(".fchart"),
      actualPath: !!q(".fc-actual"),
      forecastPath: !!q(".fc-forecast"),
      band: !!q(".fc-bandfill"),
      dots: document.querySelectorAll(".fc-dot").length,
      xlabs: document.querySelectorAll(".fc-xlab").length,
      cutLab: (q(".fc-cutlab") || {}).textContent || "",
    };
  });

  await page.screenshot({ path: "tools/home-full.png", fullPage: true });
  const panel = await page.$(".grid .panel.col-8");
  if (panel) await panel.screenshot({ path: "tools/home-forecast.png" });

  // hover near a forecast point to capture tooltip + crosshair
  const svgBox = await page.evaluate(() => {
    const s = document.querySelector(".fchart");
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  if (svgBox) {
    await page.mouse.move(svgBox.x + svgBox.w * 0.9, svgBox.y + svgBox.h * 0.4);
    await new Promise((r) => setTimeout(r, 350));
    if (panel) await panel.screenshot({ path: "tools/home-forecast-hover.png" });
  }

  console.log("probe:", JSON.stringify(probe, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
