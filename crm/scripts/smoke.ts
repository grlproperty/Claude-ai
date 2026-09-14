/**
 * End to end smoke test.
 *
 * Drives a real browser against a running CRM to prove the daily path works:
 * first-run setup, creating a client, the duplicate check catching the same
 * person a second time, taking that client through a lead and a sale,
 * recording what they said about being contacted, importing a spreadsheet,
 * writing down a conversation, and the whole thing being usable on a phone.
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
    const personId = idFromUrl(page.url());

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
    const propertyId = idFromUrl(page.url());

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

    // --- the pipeline: a lead, then a sale --------------------------------
    await page.goto(`${baseUrl}/leads/new?personId=${personId}&propertyId=${propertyId}`, {
      waitUntil: 'domcontentloaded',
    });
    check(
      'a lead opened from a profile arrives with that person already chosen',
      (await page.inputValue('select[name="personId"]')) === personId &&
        (await page.inputValue('select[name="propertyId"]')) === propertyId,
    );

    // A lost lead must say why. The database refuses one without a reason, and
    // the form must not let it get that far silently (spec 41).
    await page.selectOption('select[name="leadType"]', 'buyer');
    await page.selectOption('select[name="status"]', 'lost');
    await page.getByRole('button', { name: /create lead/i }).click();
    await page.waitForSelector('text=/why this lead was lost/i', { timeout: 15_000 });
    check('a lost lead cannot be saved without a reason', true);

    await page.selectOption('select[name="status"]', 'new');
    await page.fill('textarea[name="enquirySummary"]', 'Wants a three bedroom in Wilderness.');
    await page.getByRole('button', { name: /create lead/i }).click();
    await page.waitForURL(/\/leads\/[0-9a-f-]{36}/, { timeout: 15_000 });
    check('the lead was created and opened', true);
    await page.screenshot({ path: `${shotsDir}/10-lead.png`, fullPage: true });

    // A transaction: concluded is not registered (spec 49).
    await page.goto(`${baseUrl}/sales/transactions/new?propertyId=${propertyId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.selectOption('select[name="propertyId"]', propertyId);
    await page.selectOption('select[name="buyerId"]', { index: 1 });
    await page.fill('input[name="transactionValue"]', '2850000');
    await page.selectOption('select[name="status"]', 'sale_concluded');
    await page.fill('input[name="saleDate"]', '2026-09-10');
    await page.getByRole('button', { name: /create the transaction/i }).click();
    await page.waitForURL(/\/sales\/transactions\/[0-9a-f-]{36}/, { timeout: 15_000 });

    const deal = (await page.textContent('body')) ?? '';
    check('the transaction was created', /GRLP-T-\d{8}|Sale concluded/i.test(deal));
    check(
      'a concluded sale is not shown as registered (spec 49)',
      /awaiting registration|not registered|Register/i.test(deal) && !/Registered on/i.test(deal),
    );
    await page.screenshot({ path: `${shotsDir}/11-transaction.png`, fullPage: true });

    // --- the profiles now show what is in flight (spec 99, 100) -----------
    await page.goto(`${baseUrl}/people/${personId}`, { waitUntil: 'domcontentloaded' });
    const personNow = (await page.textContent('body')) ?? '';
    check(
      "the person's profile lists their lead",
      /Leads/.test(personNow) && /Wants a three bedroom|Buyer/i.test(personNow),
    );
    check(
      "the person's profile still does not claim to have sent anything",
      !/whatsapp sent|email sent|message sent/i.test(personNow),
    );
    await page.screenshot({ path: `${shotsDir}/12-person-pipeline.png`, fullPage: true });

    await page.goto(`${baseUrl}/properties/${propertyId}`, { waitUntil: 'domcontentloaded' });
    const propertyNow = (await page.textContent('body')) ?? '';
    check(
      "the property's profile lists its pipeline",
      ['Leads', 'Viewings', 'Valuations', 'Offers', 'Transactions'].every((section) =>
        propertyNow.includes(section),
      ),
    );
    await page.screenshot({ path: `${shotsDir}/13-property-pipeline.png`, fullPage: true });

    // --- compliance: may we contact them at all? --------------------------
    await page.goto(`${baseUrl}/people/${personId}/compliance`, {
      waitUntil: 'domcontentloaded',
    });
    const before = (await page.textContent('body')) ?? '';
    check(
      'with nothing recorded, no channel reads as clear to send',
      !/Clear to send/.test(before) && /Check before sending/.test(before),
    );

    // Record permission with nothing behind it: still amber, not green.
    await page.selectOption('select[name="channel"]', 'email');
    await page.selectOption('select[name="purpose"]', 'direct_marketing');
    await page.selectOption('select[name="status"]', 'granted');
    await page.getByRole('button', { name: /record this/i }).click();
    // Wait for the permission itself to appear, not for the success message:
    // the list re-renders after the action returns, and reading the page in
    // between sees the state before the save.
    await page.waitForSelector('text=/Nothing kept to back this up/i', { timeout: 15_000 });
    check(
      'a permission with no evidence is not treated as clear',
      !/Clear to send/.test((await page.locator('body').innerText()) ?? ''),
    );

    // Now the do-not-contact, which must override everything.
    await page.selectOption('select[name="source"]', 'client_request');
    await page.fill('input[name="reason"]', 'Asked at the office');
    await page.getByRole('button', { name: /stop contacting/i }).click();
    await page.waitForSelector('text=/Do not send|will not be contacted/i', { timeout: 15_000 });

    await page.goto(`${baseUrl}/people/${personId}/compliance`, {
      waitUntil: 'domcontentloaded',
    });
    const stopped = (await page.textContent('body')) ?? '';
    check(
      'a do-not-contact overrides a granted permission',
      /Do not send/.test(stopped) && !/Clear to send/.test(stopped),
    );
    await page.screenshot({ path: `${shotsDir}/14-compliance.png`, fullPage: true });

    // And the profile must not offer to call or email them.
    await page.goto(`${baseUrl}/people/${personId}`, { waitUntil: 'domcontentloaded' });
    const profile = await page.content();
    check(
      'the profile warns, and no longer offers a way to contact them',
      /Do not contact this person/i.test(profile) &&
        !/href="tel:/.test(profile) &&
        !/href="mailto:/.test(profile),
    );
    check(
      'logging what happened is still offered, so the request can be recorded',
      /Log contact/.test(profile),
    );

    // The preflight, across everyone.
    await page.goto(`${baseUrl}/compliance/preflight?channel=email`, {
      waitUntil: 'domcontentloaded',
    });
    const preflight = (await page.textContent('body')) ?? '';
    check('the preflight lists who may not be contacted', /Do not send/.test(preflight));
    check(
      'the preflight does not claim to send anything',
      /Nothing is sent from here/i.test(preflight),
    );
    await page.screenshot({ path: `${shotsDir}/15-preflight.png`, fullPage: true });

    // The NCC register must never be described as connected.
    await page.goto(`${baseUrl}/compliance`, { waitUntil: 'domcontentloaded' });
    const compliance = (await page.textContent('body')) ?? '';
    check(
      'the NCC register is shown as NOT CONNECTED',
      /NOT CONNECTED/.test(compliance) && /cannot check a number/i.test(compliance),
    );
    check(
      'the compliance dashboard does not claim any check happened',
      !/checked automatically|verified against the register/i.test(
        compliance.replace(/Nothing is checked automatically\./g, ''),
      ),
    );
    await page.screenshot({ path: `${shotsDir}/16-compliance-dashboard.png`, fullPage: true });

    // --- importing a spreadsheet -----------------------------------------
    await page.goto(`${baseUrl}/import`, { waitUntil: 'domcontentloaded' });
    check(
      'the import page says nothing is written until it has been checked',
      /checked before anything is written/i.test((await page.locator('body').innerText()) ?? ''),
    );

    await page.fill('input[name="name"]', 'Smoke test clients');
    await page.selectOption('select[name="entityType"]', 'person');
    await page.selectOption('select[name="how"]', 'paste');
    await page.fill(
      'textarea[name="pasted"]',
      [
        'First Name,Surname,Cell,Email,Client Type',
        // The same person already captured earlier in this run, by mobile.
        'John,Smith,082 543 2681,john@example.com,Buyer',
        'Refilwe,Motaung,083 777 1234,refilwe@example.com,Buyer;Tenant',
        // A row with nothing that could identify anyone.
        ',,,,Buyer',
      ].join('\n'),
    );
    await page.getByRole('button', { name: /read the file/i }).click();
    await page.waitForURL(/\/import\/[0-9a-f-]{36}/, { timeout: 20_000 });
    check('the file was read and kept as an import', true);

    const mapped = await page.locator('body').innerText();
    check(
      'the columns were matched automatically',
      /First Name/.test(mapped) && /Surname/.test(mapped),
    );

    await page.getByRole('button', { name: /save the column matching/i }).click();
    await page.waitForSelector('text=/Now check what it will do/i', {
      timeout: 20_000,
    });

    await page.getByRole('button', { name: /check what this will do/i }).click();
    await page.waitForSelector('text=/Nothing has been written yet/i', { timeout: 20_000 });
    const preview = await page.locator('body').innerText();
    check('the check runs without writing anything', /Nothing has been written yet/i.test(preview));
    check(
      'it offers to update the person already on file rather than duplicate them',
      /Update an existing record/i.test(preview) && /already on the system/i.test(preview),
    );
    check(
      'it refuses the row with nothing to identify it',
      /Cannot import/i.test(preview) && /nothing in it that could identify/i.test(preview),
    );
    await page.screenshot({ path: `${shotsDir}/17-import-preview.png`, fullPage: true });

    // Counting navigates to the people list, so the import page is reopened
    // before carrying on.
    const importUrl = page.url().split('?')[0]!;
    const beforeImport = await countPeople(page);
    await page.goto(importUrl, { waitUntil: 'domcontentloaded' });

    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /^Import \d+ record/i }).click();
    await page.waitForSelector('text=/record\\(s\\) created and/i', { timeout: 30_000 });
    const after = await page.locator('body').innerText();
    check(
      'the import ran and reported what it did',
      /record\(s\) created and \d+ updated/i.test(after) &&
        /as one operation/i.test(after),
    );
    check('and it records that it cannot be changed now', /This import has been run/i.test(after));
    await page.screenshot({ path: `${shotsDir}/18-import-done.png`, fullPage: true });

    const afterImport = await countPeople(page);
    check(
      `one new person was created, not two (${beforeImport} then ${afterImport})`,
      afterImport === beforeImport + 1,
    );

    // --- rolling it back --------------------------------------------------
    await page.goto(importUrl, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="rollbackReason"]', 'Smoke test tidy-up');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: /roll it back/i }).click();
    // Wait for the outcome, not for text the form itself already showed: the
    // warning above the button says "will be archived, not deleted" before
    // anything has happened.
    await page.waitForURL(/rolledback=/, { timeout: 20_000 });
    const rolled = await page.locator('body').innerText();
    check(
      'rolling back archives what it created rather than deleting it',
      /this import created were archived, not deleted/i.test(rolled),
    );
    check(
      'and says plainly that it left the updated records alone',
      /left as they are/i.test(rolled),
    );
    const afterRollback = await countPeople(page);
    check(
      `the created person is no longer in the active list (${afterRollback})`,
      afterRollback === beforeImport,
    );

    // --- logging what was said -------------------------------------------
    await page.goto(`${baseUrl}/communications`, { waitUntil: 'domcontentloaded' });
    const commsPage = await page.locator('body').innerText();
    check(
      'the communications page says plainly that the CRM does not send',
      /The CRM does not send messages/i.test(commsPage) &&
        /no such thing as a delivery or a read receipt/i.test(commsPage),
    );
    // The page's own disclaimer names those words in order to deny them, so
    // the meaningful check is that no badge on a logged conversation asserts
    // one — a badge is where a status would appear if there were one.
    const commsBadges = await page.locator('span.rounded-full').allInnerTexts();
    check(
      'no status badge asserts a delivery, a read or a bounce',
      !commsBadges.some((badge) => /delivered|read receipt|bounced|opened/i.test(badge)),
    );

    await page.goto(`${baseUrl}/communications/new?personId=${personId}`, {
      waitUntil: 'domcontentloaded',
    });
    const form = await page.locator('body').innerText();
    check(
      'the log form explains it is writing down what already happened',
      /This writes down what happened/i.test(form) &&
        /You made the call or sent the message yourself/i.test(form),
    );

    // The outcome list must not offer anything only a provider could know.
    const outcomeOptions = await page
      .locator('select[name="outcome"] option')
      .allInnerTexts();
    check(
      'no outcome asserts delivery',
      !outcomeOptions.some((option) => /delivered|read|bounced/i.test(option)),
    );

    await page.selectOption('select[name="channel"]', 'call');
    await page.selectOption('select[name="outcome"]', 'spoke_to_them');
    await page.fill('textarea[name="body"]', 'Rang about the Wilderness house. Wants a viewing.');

    // Ask for a follow-up, which must become a real task.
    await page.getByLabel(/Make a follow-up for this/i).check();
    await page.fill('input[name="followUpTitle"]', 'Confirm the Saturday viewing');
    await page.fill('input[name="followUpAt"]', '2026-09-19T09:00');

    await page.getByRole('button', { name: /^Record it$/i }).click();
    await page.waitForURL(/logged=/, { timeout: 20_000 });
    const afterLog = await page.locator('body').innerText();
    check(
      'the conversation was recorded and the follow-up made',
      /follow-up is on your task list/i.test(afterLog),
    );
    await page.screenshot({ path: `${shotsDir}/19-communications.png`, fullPage: true });

    // The task list opens on what is due today; the follow-up was set for
    // later, so it is looked for among the open ones.
    await page.goto(`${baseUrl}/tasks?view=open`, { waitUntil: 'domcontentloaded' });
    check(
      'the follow-up is a real task, not a date in a note',
      /Confirm the Saturday viewing/.test(await page.locator('body').innerText()),
    );

    // The person's profile now shows the conversation and their contact dates.
    await page.goto(`${baseUrl}/people/${personId}`, { waitUntil: 'domcontentloaded' });
    const profileNow = await page.locator('body').innerText();
    check(
      "the person's profile lists the conversation",
      /Conversations/.test(profileNow) && /Wilderness house/.test(profileNow),
    );
    check(
      'and their first and last contact came from the log',
      !/First contact\s*Not yet/i.test(profileNow) && !/Last contact\s*Never/i.test(profileNow),
    );
    check(
      'the profile still does not claim anything was sent',
      !/whatsapp sent|email sent|message sent|delivered/i.test(profileNow),
    );
    await page.screenshot({ path: `${shotsDir}/20-person-timeline.png`, fullPage: true });

    // --- wording ----------------------------------------------------------
    await page.goto(`${baseUrl}/communications/templates`, { waitUntil: 'domcontentloaded' });
    const templates = await page.locator('body').innerText();
    check(
      'the wording page says using a template is not sending',
      /Using a template is not sending/i.test(templates),
    );
    check(
      'and the shipped wording never claims the CRM sent something',
      !/we have sent|email sent|whatsapp sent|automatically sent/i.test(templates),
    );
    check(
      'a merge field is shown as a placeholder rather than pretending to be filled',
      /\{\{first_name\}\}/.test(templates),
    );
    await page.screenshot({ path: `${shotsDir}/21-templates.png`, fullPage: true });

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

    for (const path of [
      '/properties',
      '/properties/new',
      '/leads',
      '/tasks',
      '/calendar',
      '/sales',
      '/rentals',
      '/compliance',
      '/compliance/do-not-contact',
      '/compliance/preflight',
      '/compliance/ncc',
      '/import',
      '/communications',
      '/communications/new',
      '/communications/templates',
    ]) {
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

/** How many people are in the active list, read from the list page itself. */
async function countPeople(page: Page): Promise<number> {
  await page.goto(`${baseUrl}/people`, { waitUntil: 'domcontentloaded' });
  const text = await page.locator('body').innerText();
  const match = /(\d+)\s+(?:person|people)/i.exec(text);
  return match ? Number(match[1]) : 0;
}

function idFromUrl(url: string): string {
  return url.split('?')[0]?.split('/').pop() ?? '';
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
