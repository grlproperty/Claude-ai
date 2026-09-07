import { chromium } from 'playwright';

const BASE = 'http://localhost:4310';
const OUT = process.argv[2];
// The image ships a Chromium build that may not match this Playwright version,
// so resolve the installed binary rather than letting Playwright download one.
import { existsSync, readdirSync } from 'node:fs';
function installedChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? '/opt/pw-browsers';
  if (!existsSync(root)) return undefined;
  const dir = readdirSync(root).filter((d) => d.startsWith('chromium-')).sort().pop();
  if (!dir) return undefined;
  const bin = `${root}/${dir}/chrome-linux/chrome`;
  return existsSync(bin) ? bin : undefined;
}
const browser = await chromium.launch({ executablePath: installedChromium() });
const page = await browser.newPage({ viewport: { width: 1360, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
console.log('redirected to:', new URL(page.url()).pathname);
await page.screenshot({ path: `${OUT}/01-sign-in.png` });

await page.fill('input[name=email]', 'mandy@gardenroutelifestyleproperty.co.za');
await page.fill('input[name=password]', 'command-centre-dev-2026');
await page.click('button[type=submit]');
// The server action replies 303 and the client navigates, so wait for the URL
// rather than for the network to settle.
await page.waitForURL(`${BASE}/`, { timeout: 15_000 });
await page.waitForLoadState('networkidle');
console.log('after sign-in:', new URL(page.url()).pathname);
console.log('h1:', (await page.textContent('h1'))?.trim());
await page.screenshot({ path: `${OUT}/02-command-centre.png`, fullPage: true });

for (const [path, name] of [['/work', '03-work'], ['/decisions', '04-decisions'], ['/staff', '05-staff'], ['/settings', '06-settings']]) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  const h1 = (await page.textContent('h1'))?.trim();
  console.log(`${path} -> ${h1}`);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
}

// Mobile (§45)
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.context().addCookies(await page.context().cookies());
await mobile.goto(`${BASE}/`, { waitUntil: 'networkidle' });
const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
console.log('mobile horizontal overflow (px):', overflow);
await mobile.screenshot({ path: `${OUT}/07-mobile.png`, fullPage: true });

console.log('page errors:', errors.length ? errors : 'none');
await browser.close();
