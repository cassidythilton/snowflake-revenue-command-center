const puppeteer = require("puppeteer");

const CHROME = "/Users/cassidy.hilton/.cache/puppeteer/chrome/mac_arm-146.0.7680.31/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing";

(async () => {
  const browser = await puppeteer.launch({ headless: "new", executablePath: CHROME, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 1100, deviceScaleFactor: 2 });
  const errs = [];
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));

  // Delay the analyst mock response so the "Processing Query" card is visible mid-flight
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    if (/analyst-answers\.json/.test(req.url())) {
      setTimeout(() => req.continue(), 2600);
    } else {
      req.continue();
    }
  });

  await page.goto("http://localhost:8781/index.html", { waitUntil: "networkidle0" });
  await new Promise((r) => setTimeout(r, 800));

  // Navigate to the Cortex Analyst surface
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll(".view-tab, [data-surface], .tab, button, a")]
      .find((n) => /cortex analyst|analyst/i.test(n.textContent || ""));
    if (tab) tab.click();
  });
  await new Promise((r) => setTimeout(r, 600));

  // Type a golden-path question into the landing input and submit with Enter
  const Q = "Which regions have the highest revenue at risk this month?";
  await page.click(".aw-input, .chat-input, input[type=text]");
  await page.type(".aw-input, .chat-input, input[type=text]", Q, { delay: 2 });
  await page.keyboard.press("Enter");
  // Capture the processing card mid-flight (mock is delayed 2.6s; steps advance every 850ms)
  await new Promise((r) => setTimeout(r, 1400));
  await page.screenshot({ path: "tools/analyst-processing.png", fullPage: false });

  // Wait for the answer to render
  await new Promise((r) => setTimeout(r, 2500));
  await page.screenshot({ path: "tools/analyst-table.png", fullPage: false });

  // Click through Chart + Details tabs on the newest answer
  const clickTab = async (label) => {
    await page.evaluate((lbl) => {
      const tabs = [...document.querySelectorAll(".qr-tab")].filter((b) => new RegExp("^" + lbl + "$", "i").test((b.textContent || "").trim()));
      const t = tabs[tabs.length - 1];
      if (t) t.click();
    }, label);
    await new Promise((r) => setTimeout(r, 500));
  };
  await clickTab("Chart");
  await page.screenshot({ path: "tools/analyst-chart.png", fullPage: false });
  await clickTab("Details");
  await page.screenshot({ path: "tools/analyst-details.png", fullPage: false });

  const probe = await page.evaluate(() => ({
    qrPanels: document.querySelectorAll(".qr-panel").length,
    qrTabs: document.querySelectorAll(".qr-tab").length,
    procCard: !!document.querySelector(".proc-card"),
    tableRows: document.querySelectorAll(".result-table tbody tr").length,
  }));
  console.log("probe:", JSON.stringify(probe));
  console.log("consoleErrors:", errs.length ? errs.slice(0, 10) : "none");
  await browser.close();
})();
