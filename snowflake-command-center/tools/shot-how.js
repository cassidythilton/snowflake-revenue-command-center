const puppeteer = require("puppeteer");
(async () => {
  const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 700));

  // Open the How It Works surface via its rail item (matched by title).
  await page.evaluate(() => {
    const b = Array.from(document.querySelectorAll(".rail-item")).find((x) => (x.getAttribute("title") || "") === "How it works");
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 900));

  async function sub(guide, file, wait) {
    await page.evaluate((g) => {
      const b = document.querySelector('.ha-subtab[data-guide="' + g + '"]');
      if (b) b.click();
    }, guide);
    await new Promise((r) => setTimeout(r, wait || 900));
    await page.screenshot({ path: "tools/" + file, fullPage: true });
    console.log("shot", file);
  }

  await sub("arch", "how-arch.png");
  await sub("tech", "how-tech.png", 1200);

  // Trace a flow (F4 Agent ⇄ Agent + writeback) to prove the interaction lights up.
  await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('#howTaFlows .ta-chip[data-flow]'));
    const f4 = chips.find((c) => c.getAttribute("data-flow") === "F4");
    if (f4) f4.click();
  });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "tools/how-tech-flow.png", fullPage: true });
  console.log("shot how-tech-flow.png");

  // Governance overlay + light theme.
  await page.evaluate(() => { const g = document.getElementById("howTaGov"); if (g) g.click(); const t = document.getElementById("howTaTheme"); if (t) t.click(); });
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: "tools/how-tech-light.png", fullPage: true });
  console.log("shot how-tech-light.png");

  await sub("guide", "how-guide.png");
  await sub("coco", "how-coco.png");

  console.log("consoleErrors:", errs.filter((e) => !/501|404|okta|Framing|violation|favicon/i.test(e)));
  await browser.close();
})();
