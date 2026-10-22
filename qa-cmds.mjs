import { chromium } from "@playwright/test";
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
await page.goto("http://localhost:5199/e2e/harness.html?case=popup").catch(() => {});
await browser.close();
