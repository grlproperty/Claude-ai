import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const BASE = 'http://localhost:4310';
const OUT = process.argv[2];
const PAGES = [
  ['/', 'Command Centre'],
  ['/work', 'Prepared for you'],
  ['/decisions', 'Decisions'],
  ['/messages', 'Messages'],
  ['/documents?process=SALES', 'Sales process'],
  ['/documents?process=RENTALS', 'Rentals process'],
  ['/staff', 'Staff'],
  ['/settings', 'Settings'],
];

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });

await page.goto(`${BASE}/sign-in`);
await page.fill('input[name=email]', 'mandy@grproperty.co.za');
await page.fill('input[name=password]', 'command-centre-dev-2026');
await page.click('button[type=submit]');
await page.waitForURL(`${BASE}/`);

// The application's compiled stylesheet, taken once and shared by every page.
const css = await page.evaluate(async () => {
  const links = [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.href);
  const parts = await Promise.all(links.map((href) => fetch(href).then((r) => r.text())));
  return parts.join('\n');
});

const captured = [];
for (const [path, label] of PAGES) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' });
  const body = await page.evaluate(() => {
    // Drop the app's own nav: the snapshot supplies its own switcher.
    const header = document.querySelector('header');
    if (header) header.remove();
    // Neutralise links so a click inside the snapshot cannot go nowhere.
    document.querySelectorAll('a[href], form').forEach((el) => {
      if (el.tagName === 'A') el.setAttribute('href', '#');
      if (el.tagName === 'FORM') el.removeAttribute('action');
    });
    return document.body.innerHTML;
  });
  captured.push({ path, label, body });
  console.log(`captured ${label} (${Math.round(body.length / 1024)} kB)`);
}

await writeFile(OUT, JSON.stringify({ css, captured }, null, 0));
console.log(`css ${Math.round(css.length / 1024)} kB → ${OUT}`);
await browser.close();
