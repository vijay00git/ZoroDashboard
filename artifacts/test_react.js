const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  page.on('console', msg => {
    console.log(`[CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.error(`[PAGE ERROR] ${err.toString()}`);
  });

  console.log('Navigating to React app on port 5173...');
  try {
    await page.goto('http://localhost:5173/', { waitUntil: 'networkidle0', timeout: 5000 });
  } catch (e) {
    console.log('Navigation completed or timed out.');
  }

  await browser.close();
})();
