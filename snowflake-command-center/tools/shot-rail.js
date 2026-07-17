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

  const probe = await page.evaluate(() => {
    const rail = document.querySelector("#navRail");
    return {
      railItems: document.querySelectorAll(".rail-item").length,
      collapsedWidth: rail ? Math.round(rail.getBoundingClientRect().width) : null,
      scrollPadLeft: getComputedStyle(document.querySelector("#appScroll")).paddingLeft,
      activeLabel: (document.querySelector(".rail-item.active .rail-label") || {}).textContent || "",
    };
  });

  // collapsed
  await page.screenshot({ path: "tools/rail-collapsed.png" });

  // hover-expand overlay
  await page.mouse.move(30, 400);
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "tools/rail-hover.png" });

  // move away, then pin
  await page.mouse.move(900, 500);
  await new Promise((r) => setTimeout(r, 400));
  await page.click("#railPin");
  await new Promise((r) => setTimeout(r, 500));
  await page.screenshot({ path: "tools/rail-pinned.png" });

  console.log("probe:", JSON.stringify(probe, null, 2));
  console.log("consoleErrors:", errs.length ? errs : "none");
  await browser.close();
})();
