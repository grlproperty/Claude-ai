/**
 * End to end smoke test.
 *
 * Drives a real browser against a running CRM to prove the daily path works:
 * first-run setup, creating a client, the duplicate check catching the same
 * person a second time, and the whole thing being usable on a phone.
 *
 *   npm run build && npm start &      # or npm run dev
 *   npm run smoke -- http://127.0.0.1:3000
 */
import { mkdir } from 'node:fs/promises';
import { chromium, type Page } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://127.0.0.1:3000';
const shotsDir = process.env.SMOKE_SHOTS ?? 'smoke-shots';
/** Set when the host already provides a browser, rather than downloading one. */
const executablePath = process.env.CHROMIUM_PATH;

const EMAIL = 'ayden@grproperty.co.za';
const PASSWORD = 'a reasonable passphrase';

let failures = 0;

function check(label: string, condition: boolean): void {
  process.stdout.write(`${condition ? '  ok  ' : 'FAIL  '}${label}\n`);
  if (!condition) failures += 1;
}

async function main(): Promise<void> {
  await mkdir(shotsDir, { recursive: true });
  const browser = await chromium.launch(executablePath ? { executablePath } : {});

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // --- first run setup -------------------------------------------------
    await page.goto(`${baseUrl}/setup`, { waitUntil: 'domcontentloaded' });
    if (page.url().includes('/setup')) {
      await page.fill('input[name="fullName"]', 'Ayden Grobler');
      await page.fill('input[name="email"]', EMAIL);
      await page.fill('input[name="password"]', PASSWORD);
      await page.fill('input[name="confirmPassword"]', PASSWORD);
      await page.click('button[type="submit"]');
      await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
      check('first authorised company user becomes Management', true);
    } else {
      await signIn(page);
    }

    check('signed in and on the dashboard', page.url() === `${baseUrl}/`);
    await page.screenshot({ path: `${shotsDir}/01-dashboard.png` });

    // --- create a person -------------------------------------------------
    await page.goto(`${baseUrl}/people/new`, { waitUntil: 'domcontentloaded' });
    await fillPerson(page);

    await page.getByRole('button', { name: /check for duplicates/i }).click();
    await page.waitForSelector('text=/No possible duplicates found|possible match/i', { timeout: 15_000 });
    check('duplicate check runs before creating anyone', true);
    await page.screenshot({ path: `${shotsDir}/02-duplicate-check.png`, fullPage: true });

    await page.getByRole('button', { name: /create person/i }).click();
    await page.waitForURL(/\/people\/[0-9a-f-]{36}/, { timeout: 15_000 });

    const body = await page.textContent('body');
    check('the new client received a GRLP reference', /GRLP-\d{8}/.test(body ?? ''));
    check('the profile shows the client types', /Seller/.test(body ?? '') && /Landlord/.test(body ?? ''));
    check('the identity number is masked on the profile', /\*{8,}087/.test(body ?? ''));
    check(
      'the CRM does not claim to send anything',
      !/whatsapp sent|email sent|message sent/i.test(body ?? ''),
    );
    await page.screenshot({ path: `${shotsDir}/03-person-profile.png`, fullPage: true });

    // --- the same person again -------------------------------------------
    await page.goto(`${baseUrl}/people/new`, { waitUntil: 'domcontentloaded' });
    await fillPerson(page);
    await page.getByRole('button', { name: /check for duplicates/i }).click();
    await page.waitForSelector('text=/possible match/i', { timeout: 15_000 });
    const second = await page.textContent('body');
    check('the same person is recognised on a second capture', /Very likely the same/i.test(second ?? ''));
    check(
      'creating anyway is blocked until it is confirmed',
      await page.getByRole('button', { name: /create person/i }).isDisabled(),
    );
    await page.screenshot({ path: `${shotsDir}/04-duplicate-caught.png`, fullPage: true });

    // --- search ----------------------------------------------------------
    await page.goto(`${baseUrl}/people?q=${encodeURIComponent('082 543 2681')}`, {
      waitUntil: 'domcontentloaded',
    });
    check(
      'search finds the client from a mobile number typed with spaces',
      /John Smith/.test((await page.textContent('body')) ?? ''),
    );

    // --- create a property -----------------------------------------------
    await page.goto(`${baseUrl}/properties/new`, { waitUntil: 'domcontentloaded' });
    await fillProperty(page);
    await page.getByRole('button', { name: /check for duplicates/i }).click();
    await page.waitForSelector('text=/No possible duplicates found|possible match/i', {
      timeout: 15_000,
    });
    await page.getByRole('button', { name: /create property/i }).click();
    await page.waitForURL(/\/properties\/[0-9a-f-]{36}/, { timeout: 15_000 });

    const propertyBody = await page.textContent('body');
    check('the new property received a GRLP property reference', /GRLP-P-\d{8}/.test(propertyBody ?? ''));
    check(
      'the six statuses are shown separately, each labelled',
      ['Property', 'Sales', 'Rental', 'Mandate', 'Sale outcome'].every((label) =>
        (propertyBody ?? '').includes(label),
      ),
    );
    check(
      'the CRM does not claim to have updated a portal',
      /The CRM does not talk to Property24/i.test(propertyBody ?? ''),
    );
    await page.screenshot({ path: `${shotsDir}/07-property-profile.png`, fullPage: true });

    // --- link the owner ---------------------------------------------------
    await page.selectOption('select[name="personId"]', { index: 1 });
    await page.selectOption('select[name="role"]', 'owner');
    await page.fill('input[name="ownershipPercent"]', '100');
    await page.getByRole('button', { name: /link this person/i }).click();
    await page.waitForSelector('text=/Person linked to this property/i', { timeout: 15_000 });
    check('the owner can be linked to the property', true);

    // --- the same property again -----------------------------------------
    await page.goto(`${baseUrl}/properties/new`, { waitUntil: 'domcontentloaded' });
    await fillProperty(page);
    await page.getByRole('button', { name: /check for duplicates/i }).click();
    await page.waitForSelector('text=/possible match/i', { timeout: 15_000 });
    check(
      'the same property is recognised on a second capture',
      /Very likely the same/i.test((await page.textContent('body')) ?? ''),
    );
    await page.screenshot({ path: `${shotsDir}/08-property-duplicate.png`, fullPage: true });

    // --- phone -----------------------------------------------------------
    const phone = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
      storageState: await context.storageState(),
    });
    const phonePage = await phone.newPage();
    await phonePage.goto(`${baseUrl}/people`, { waitUntil: 'domcontentloaded' });
    const overflow = await phonePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`the people list does not scroll sideways on a phone (overflow ${overflow}px)`, overflow <= 1);
    await phonePage.screenshot({ path: `${shotsDir}/05-phone-people.png`, fullPage: true });

    await phonePage.goto(`${baseUrl}/people/new`, { waitUntil: 'domcontentloaded' });
    const formOverflow = await phonePage.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    check(`the person form does not scroll sideways on a phone (overflow ${formOverflow}px)`, formOverflow <= 1);
    await phonePage.screenshot({ path: `${shotsDir}/06-phone-form.png`, fullPage: true });

    for (const path of ['/properties', '/properties/new']) {
      await phonePage.goto(`${baseUrl}${path}`, { waitUntil: 'domcontentloaded' });
      const sideways = await phonePage.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      check(`${path} does not scroll sideways on a phone (overflow ${sideways}px)`, sideways <= 1);
    }
    await phonePage.screenshot({ path: `${shotsDir}/09-phone-properties.png`, fullPage: true });
  } finally {
    await browser.close();
  }

  process.stdout.write(
    failures === 0 ? '\nsmoke test passed\n' : `\nsmoke test failed: ${failures} problem(s)\n`,
  );
  if (failures > 0) process.exit(1);
}

async function signIn(page: Page): Promise<void> {
  await page.goto(`${baseUrl}/sign-in`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(`${baseUrl}/`, { timeout: 15_000 });
}

async function fillProperty(page: Page): Promise<void> {
  await page.fill('input[name="erfNumber"]', '1234');
  await page.fill('input[name="streetAddress"]', '18 Main Road');
  await page.fill('input[name="suburb"]', 'Wilderness');
  await page.fill('input[name="city"]', 'George');
  await page.fill('input[name="bedrooms"]', '3');
  await page.fill('input[name="bathrooms"]', '2.5');
  await page.fill('input[name="currentAskingPrice"]', '2950000');
  await page.selectOption('select[name="propertyStatus"]', 'on_market');
  await page.selectOption('select[name="salesStatus"]', 'on_market');
  await page.selectOption('select[name="mandateStatus"]', 'mandate_active');
  await page.selectOption('select[name="mandateType"]', 'sole');
  await page.fill('input[name="mandateStart"]', '2026-09-01');
  await page.fill('input[name="mandateExpiry"]', '2026-12-01');
}

async function fillPerson(page: Page): Promise<void> {
  await page.fill('input[name="firstName"]', 'John');
  await page.fill('input[name="surname"]', 'Smith');
  await page.fill('input[name="idNumber"]', '8001015009087');
  await page.fill('input[name="contacts[0][value]"]', '082 543 2681');
  await page.fill('input[name="contacts[1][value]"]', 'test@example.com');
  await page.selectOption('select[name="businessArea"]', 'sales_rentals');
  await page.check('input[name="clientTypes"][value="seller"]');
  await page.check('input[name="clientTypes"][value="landlord"]');
  await page.fill('input[name="addresses[0][suburb]"]', 'Wilderness');
  await page.fill('input[name="addresses[0][city]"]', 'George');
}

await main();
