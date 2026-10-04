// og/og-image.html 을 1200×630 PNG(public/og-image.png)로 렌더링한다. 실행: npm run og
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const source = fileURLToPath(new URL('../og/og-image.html', import.meta.url));
const output = fileURLToPath(new URL('../public/og-image.png', import.meta.url));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.goto(`file://${source}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState('networkidle');
await page.screenshot({ path: output, clip: { x: 0, y: 0, width: 1200, height: 630 } });
await browser.close();
console.log(`wrote ${output}`);
