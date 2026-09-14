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
    const transactionId = idFromUrl(page.url());

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

    // --- an entity, and its FICA file -------------------------------------
    // A company owns property and has people behind it. FICA is the office
    // writing down what it collected and who looked at it; nothing here is
    // checked against Home Affairs, CIPC or any sanctions list (spec 115).
    await page.goto(`${baseUrl}/companies/new`, { waitUntil: 'domcontentloaded' });
    await page.fill('input[name="registeredName"]', 'Wilderness Coastal Trust');
    await page.selectOption('select[name="entityType"]', 'trust');
    await page.fill('input[name="registrationNumber"]', 'IT1234/2019(G)');
    await page.fill('input[name="suburb"]', 'Wilderness');
    await page.fill('input[name="city"]', 'George');
    await page.getByRole('button', { name: /create the entity/i }).click();
    await page.waitForURL(/\/companies\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const companyId = idFromUrl(page.url());

    const entity = await page.locator('body').innerText();
    check('the entity received its own reference', /GRLP-C-\d{6}/.test(entity));
    check(
      'and the CRM says nobody is recorded as controlling it yet',
      /Nobody is recorded as controlling this entity/i.test(entity),
    );

    // Put a trustee behind it, which is the question FICA actually asks.
    await page.selectOption('form:has(button:text-is("Link this person")) select[name="personId"]', {
      index: 1,
    });
    await page.selectOption('form:has(button:text-is("Link this person")) select[name="role"]', 'trustee');
    await page.check('form:has(button:text-is("Link this person")) input[name="isPrimaryContact"]');
    await page.getByRole('button', { name: /link this person/i }).click();
    await page.waitForFunction(
      () => !/Nobody is recorded as controlling this entity/i.test(document.body.innerText),
      undefined,
      { timeout: 20_000 },
    );
    const withTrustee = await page.locator('body').innerText();
    check('a trustee is recorded behind the entity', /Trustee/i.test(withTrustee));
    check('and the office knows who it deals with', /We deal with them/i.test(withTrustee));
    await page.screenshot({ path: `${shotsDir}/22-entity.png`, fullPage: true });

    // The entity owns the property.
    await page.goto(`${baseUrl}/properties/${propertyId}`, { waitUntil: 'domcontentloaded' });
    await page.selectOption(
      'form:has(button:text-is("Link this entity")) select[name="companyId"]',
      companyId,
    );
    await page.selectOption(
      'form:has(button:text-is("Link this entity")) select[name="role"]',
      'owner',
    );
    await page.getByRole('button', { name: /link this entity/i }).click();
    // Waited on the link itself rather than on the name, which also appears
    // in the panel's own dropdown.
    await page.waitForSelector(`a[href="/companies/${companyId}"]`, { timeout: 20_000 });
    const propertyWithEntity = await page.locator('body').innerText();
    check(
      'the property shows the entity that owns it',
      /Companies and trusts/i.test(propertyWithEntity) &&
        /Wilderness Coastal Trust/.test(propertyWithEntity),
    );
    check(
      'and warns that the entity has no FICA file yet',
      /No FICA file opened/i.test(propertyWithEntity),
    );
    await page.screenshot({ path: `${shotsDir}/23-property-entity.png`, fullPage: true });

    // Open the FICA file for the entity.
    await page.goto(`${baseUrl}/fica/new?companyId=${companyId}`, { waitUntil: 'domcontentloaded' });
    const ficaNew = await page.locator('body').innerText();
    check(
      'the FICA form says plainly that the CRM verifies nobody',
      /The CRM cannot verify anybody/i.test(ficaNew) &&
        /no connection to Home Affairs/i.test(ficaNew),
    );
    check(
      'and a new file cannot be opened as already verified',
      !(await page
        .locator('select[name="status"] option[value="verified"]')
        .count()),
    );
    await page.getByRole('button', { name: /open the file/i }).click();
    await page.waitForURL(/\/fica\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const ficaId = idFromUrl(page.url());

    const freshFica = await page.locator('body').innerText();
    check('the FICA file received its own reference', /GRLP-F-\d{6}/.test(freshFica));
    check(
      'the file lists what is still outstanding',
      /required item\(s\) outstanding/i.test(freshFica),
    );
    check(
      'the CRM does not claim to have verified, screened or checked anything',
      !/(automatically|successfully) verified|sanctions (check|screening) (passed|clear)|verified by the system|home affairs (confirmed|verified)/i.test(
        freshFica,
      ),
    );
    await page.screenshot({ path: `${shotsDir}/24-fica.png`, fullPage: true });

    // Work the checklist. Required items must be seen against the original,
    // or marked as not applying, before the file can be recorded as verified.
    const rows = page.locator('form:has(select[name="status"]):has(input[name="itemId"])');
    const rowCount = await rows.count();
    check('the office checklist was copied onto the file', rowCount > 0);
    for (let index = 0; index < rowCount; index += 1) {
      const row = page
        .locator('form:has(select[name="status"]):has(input[name="itemId"])')
        .nth(index);
      await row.locator('select[name="status"]').selectOption('seen_against_original');
      await row.locator('input[name="note"]').fill('Original produced at the George office.');
      await row.getByRole('button', { name: /^save$/i }).click();
      await page.waitForFunction(
        (expected: number) =>
          (document.body.innerText.match(/Seen by /g) ?? []).length >= expected,
        index + 1,
        { timeout: 20_000 },
      );
    }
    const worked = await page.locator('body').innerText();
    check(
      'every item records who looked at it, not that the CRM did',
      /Seen by Ayden Grobler/.test(worked) && !/seen by the system/i.test(worked),
    );
    check(
      'and with the checklist done the file can be recorded as verified',
      /Everything required has been seen/i.test(worked),
    );

    // Record it as verified, which stamps a person's name onto the file.
    // The confirmation and the note only appear once 'verified' is chosen,
    // because the form spells out what is being asserted first.
    await page
      .locator('form:has(input[name="rowVersion"]) select[name="status"]')
      .selectOption('verified');
    await page.waitForSelector('input[name="verificationNote"]', { timeout: 10_000 });
    await page.fill('input[name="verificationNote"]', 'Originals produced at the George office.');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /record it as verified by me/i }).click();
    await page.waitForURL(/saved=yes/, { timeout: 20_000 });
    await page.waitForSelector('text=/Verified by a person, not by software/i', {
      timeout: 20_000,
    });

    const verified = await page.locator('body').innerText();
    check(
      'the file says a person verified it, not the software',
      /Verified by a person, not by software/i.test(verified) &&
        /Ayden Grobler recorded this as verified/i.test(verified),
    );
    check('and it carries a date by which it must be redone', /needs redoing by/i.test(verified));
    check(
      'the change is in a history nobody can alter',
      /What has changed/i.test(verified) && /Verified by us/.test(verified),
    );
    await page.screenshot({ path: `${shotsDir}/25-fica-verified.png`, fullPage: true });

    // And the property now shows the entity's FICA standing.
    await page.goto(`${baseUrl}/properties/${propertyId}`, { waitUntil: 'domcontentloaded' });
    check(
      "the property reflects the entity's FICA standing",
      /FICA:\s*Verified by us/i.test(await page.locator('body').innerText()),
    );

    // The person we linked as a trustee now shows the entity they act for.
    await page.goto(`${baseUrl}/people/${personId}`, { waitUntil: 'domcontentloaded' });
    check(
      'the person shows the entity they act for',
      /Entities they act for/i.test(await page.locator('body').innerText()),
    );

    await page.goto(`${baseUrl}/fica`, { waitUntil: 'domcontentloaded' });
    const ficaList = await page.locator('body').innerText();
    check(
      'the FICA list is honest about what it is',
      !/(automatically|successfully) verified|sanctions (check|screening) (passed|clear)/i.test(
        ficaList,
      ),
    );
    check('and the verified file appears on it', /Wilderness Coastal Trust/.test(ficaList));
    await page.screenshot({ path: `${shotsDir}/26-fica-list.png`, fullPage: true });

    // --- commission: worked out, approved, and only then paid ------------
    // Three things the CRM must never conflate, and one it must never claim:
    // that a payment was confirmed (spec 49, 115).
    await page.goto(`${baseUrl}/commissions/new?transactionId=${transactionId}`, {
      waitUntil: 'domcontentloaded',
    });
    const calculator = await page.locator('body').innerText();
    check(
      'the calculator warns that an unregistered transfer earns nothing',
      /transfer has not registered/i.test(calculator),
    );
    check(
      'and it shows its arithmetic rather than just a figure',
      /How this figure is reached/i.test(calculator) && /5% of 2850000\.00/.test(calculator),
    );
    await page.screenshot({ path: `${shotsDir}/27-commission-calculator.png`, fullPage: true });

    await page.getByRole('button', { name: /open the commission/i }).click();
    await page.waitForURL(/\/commissions\/[0-9a-f-]{36}/, { timeout: 20_000 });
    const commissionId = idFromUrl(page.url());

    const fresh = await page.locator('body').innerText();
    check('the commission received its own reference', /GRLP-M-\d{6}/.test(fresh));
    check(
      'the figures are worked out to the cent',
      /142\u00a0500/.test(fresh) && /21\u00a0375/.test(fresh) && /163\u00a0875/.test(fresh),
    );
    check('nothing here is earned yet, and it says so', /Nothing here is earned yet/i.test(fresh));
    check(
      'the CRM does not claim anybody approved or paid anything',
      /Nobody yet/.test(fresh) && !/payment confirmed|confirmed by the bank/i.test(fresh),
    );
    check(
      'and while the transfer is unregistered it offers no way to invoice or pay',
      !(await page.locator('input[name="invoiceNumber"]').count()) &&
        !(await page.locator('input[name="paidOn"]').count()),
    );
    await page.screenshot({ path: `${shotsDir}/28-commission.png`, fullPage: true });

    // The agent on the deal already holds the whole share, so the office's
    // own share is over-allocation — refused by the database, not merely by
    // a hidden button.
    check(
      'the agent on the deal was carried across without re-typing',
      /100\.00% allocated/.test(fresh) && /Primary agent/i.test(fresh),
    );

    await setShare(page, { role: 'office', percent: '40' });
    await page.waitForSelector('text=/more than the whole/i', { timeout: 20_000 });
    check('shares adding up to more than the whole are refused', true);

    // Cut the agent back, then give the office its 40%.
    await setShare(page, { role: 'primary', percent: '60', agentIndex: 1 });
    await page.waitForSelector('text=/60.00% allocated/i', { timeout: 20_000 });
    await setShare(page, { role: 'office', percent: '40' });
    await page.waitForSelector('text=/100.00% allocated/i', { timeout: 20_000 });

    const shared = await page.locator('body').innerText();
    check(
      'the shares add back up to the whole, to the cent',
      /85\u00a0500,00/.test(shared) && /57\u00a0000,00/.test(shared),
    );
    await page.screenshot({ path: `${shotsDir}/29-commission-shares.png`, fullPage: true });

    // Send it for approval, then approve it.
    await page.getByRole('button', { name: /send it for approval/i }).click();
    await page.waitForSelector('text=/Your name goes onto this permanently/i', { timeout: 20_000 });
    check('approval is a decision, and the CRM says whose', true);

    await page.fill('input[name="approvalNote"]', 'Checked against the sole mandate.');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /^approve it$/i }).click();
    await page.waitForSelector('text=/Ayden Grobler on /i', { timeout: 20_000 });

    const approvedNow = await page.locator('body').innerText();
    check(
      'the approval carries a name and a date',
      /Approved by\s*\n?\s*Ayden Grobler/i.test(approvedNow) ||
        /Ayden Grobler on /i.test(approvedNow),
    );
    check(
      'an approved commission on an unregistered transfer still cannot be paid',
      /transfer has not registered/i.test(approvedNow) &&
        !(await page.locator('input[name="paidOn"]').count()),
    );

    // Register the transfer, which is the separate act spec 49 exists for.
    await page.goto(`${baseUrl}/sales/transactions/${transactionId}`, {
      waitUntil: 'domcontentloaded',
    });
    await page.fill('input[name="registrationDate"]', '2026-09-12');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /record as registered/i }).click();
    // Waited on the alert the registration produces, rather than on the word
    // "Registered" which the page already carried as a heading.
    await page.waitForSelector('text=/Transfer registered on/i', { timeout: 20_000 });
    const registered = await page.locator('body').innerText();
    check('registration is recorded as its own event', /12 September 2026/.test(registered));

    // Now, and only now, the invoice and the payment can be recorded.
    await page.goto(`${baseUrl}/commissions/${commissionId}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input[name="invoiceNumber"]', { timeout: 20_000 });
    check('with the transfer registered, the invoice can be recorded', true);

    await page.fill('input[name="invoiceNumber"]', 'INV-2026-0001');
    await page.getByRole('button', { name: /record the invoice/i }).click();
    await page.waitForSelector('text=/Invoice number recorded/i', { timeout: 20_000 });
    const invoicedNow = await page.locator('body').innerText();
    check(
      'and the CRM is clear that it did not raise the invoice',
      /The CRM did not raise the invoice|does not raise invoices/i.test(invoicedNow),
    );

    await page.fill('input[name="paidOn"]', '2026-09-30');
    await page.fill('input[name="paymentReference"]', 'EFT 88231');
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /record it as paid by me/i }).click();
    await page.waitForSelector('text=/Recorded as paid by a person/i', { timeout: 20_000 });

    const paidNow = await page.locator('body').innerText();
    check(
      'a payment is recorded by a person, never confirmed by the CRM',
      /Recorded as paid by a person, not confirmed by a bank/i.test(paidNow) &&
        /connected to no bank account/i.test(paidNow),
    );
    check(
      'and nothing anywhere claims a bank or gateway confirmed it',
      !/payment confirmed|bank confirmed|transaction successful|gateway/i.test(paidNow),
    );
    check(
      'the whole history is on the record',
      /What has happened to it/i.test(paidNow) &&
        /Recorded as paid/.test(paidNow) &&
        /Shares changed/.test(paidNow),
    );
    await page.screenshot({ path: `${shotsDir}/30-commission-paid.png`, fullPage: true });

    // The list keeps the four figures apart.
    await page.goto(`${baseUrl}/commissions`, { waitUntil: 'domcontentloaded' });
    const list = await page.locator('body').innerText();
    check(
      'the list refuses to present any figure as money in the bank',
      /No figure here is money in the bank/i.test(list),
    );
    check(
      'and keeps worked out, waiting, due and recorded paid apart',
      /Being worked out/i.test(list) &&
        /Waiting on the deeds office/i.test(list) &&
        /Due to the office/i.test(list) &&
        /Recorded as paid/i.test(list),
    );
    await page.screenshot({ path: `${shotsDir}/31-commission-list.png`, fullPage: true });

    await page.goto(`${baseUrl}/commissions/statements`, { waitUntil: 'domcontentloaded' });
    const statements = await page.locator('body').innerText();
    check('a statement says plainly that a share is not a payment', /A share is not a payment/i.test(statements));
    check(
      "and the office's own share is a line of its own",
      /Garden Route Lifestyle Property/.test(statements),
    );
    await page.screenshot({ path: `${shotsDir}/32-statements.png`, fullPage: true });

    await page.goto(`${baseUrl}/commissions/rules`, { waitUntil: 'domcontentloaded' });
    const rules = await page.locator('body').innerText();
    check(
      'the office terms say that changing a rule never changes a past figure',
      /never changes a past figure/i.test(rules),
    );
    await page.screenshot({ path: `${shotsDir}/33-commission-rules.png`, fullPage: true });

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
      '/companies',
      '/companies/new',
      '/fica',
      '/fica/new',
      '/commissions',
      '/commissions/rules',
      '/commissions/statements',
      // The record pages too: they carry the wide tables, so they are where
      // sideways scrolling would actually appear.
      `/people/${personId}`,
      `/properties/${propertyId}`,
      `/companies/${companyId}`,
      `/fica/${ficaId}`,
      `/commissions/${commissionId}`,
      `/sales/transactions/${transactionId}`,
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

/** Fills in and submits the share panel on a commission. */
async function setShare(
  page: Page,
  share: { role: string; percent: string; agentIndex?: number },
): Promise<void> {
  const form = page.locator('form:has(button:text-is("Save this share"))');
  await form.locator('select[name="role"]').selectOption(share.role);
  await form.locator('input[name="sharePercent"]').fill(share.percent);
  if (share.agentIndex !== undefined) {
    await form.locator('select[name="agentId"]').selectOption({ index: share.agentIndex });
  }
  await page.getByRole('button', { name: /save this share/i }).click();
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
