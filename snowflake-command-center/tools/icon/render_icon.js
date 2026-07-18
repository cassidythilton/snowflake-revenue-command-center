// Render the app icon (baseline gradient container + real Snowflake mark)
// to a hi-res PNG with a transparent background using headless Chromium.
const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 256, height: 256, deviceScaleFactor: 4 });
  const file = 'file://' + path.join(__dirname, 'render_icon.html');
  await page.goto(file, { waitUntil: 'networkidle0' });
  const tile = await page.$('#tile');
  await tile.screenshot({
    path: path.join(__dirname, 'app-icon-4x.png'),
    omitBackground: true,
  });
  await browser.close();
  console.log('rendered app-icon-4x.png');
})();
