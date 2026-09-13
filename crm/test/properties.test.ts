import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asOwner,
  asUser,
  createTestUser,
  ctxFor,
  readingAs,
  rejects,
  resetData,
  shutdown,
  type TestUser,
} from './helpers/harness.ts';
import {
  addRentalHistory,
  addSaleHistory,
  archiveProperty,
  assignPropertyAgent,
  createProperty,
  linkPersonToProperty,
  saveMarketing,
  saveMarketingChannel,
  updateProperty,
} from '../src/lib/properties/mutations.ts';
import {
  getProperty,
  getPropertyHistory,
  listMarketingChannels,
  listProperties,
} from '../src/lib/properties/queries.ts';
import {
  findPropertyDuplicates,
  listPropertyDuplicatePairs,
} from '../src/lib/properties/duplicates.ts';
import {
  getPropertyMergeComparison,
  mergeProperties,
} from '../src/lib/properties/merge.ts';
import { propertyInputSchema } from '../src/lib/properties/types.ts';
import { createPerson } from '../src/lib/people/mutations.ts';
import { personInputSchema } from '../src/lib/people/types.ts';
import { parseOrThrow } from '../src/lib/validate.ts';
import {
  listDocuments,
  listPropertyPhotos,
  readFileForDownload,
  uploadDocument,
  uploadPropertyPhotos,
} from '../src/lib/files.ts';
import { safeFileName, validateUpload } from '../src/lib/storage.ts';
import type { Ctx } from '../src/lib/actor.ts';

let management: TestUser;
let ayden: TestUser;
let johan: TestUser;
let accounts: TestUser;
let managementCtx: Ctx;
let aydenCtx: Ctx;
let johanCtx: Ctx;
let accountsCtx: Ctx;

beforeEach(async () => {
  await resetData();
  management = await createTestUser({ role: 'MANAGEMENT', fullName: 'Kandy Management' });
  ayden = await createTestUser({ role: 'AGENT', fullName: 'Ayden Agent' });
  johan = await createTestUser({ role: 'AGENT', fullName: 'Johan Agent' });
  accounts = await createTestUser({ role: 'ACCOUNTS', fullName: 'Acc Officer' });
  managementCtx = await ctxFor(management);
  aydenCtx = await ctxFor(ayden);
  johanCtx = await ctxFor(johan);
  accountsCtx = await ctxFor(accounts);
});
after(async () => {
  await shutdown();
});

function propertyInput(overrides: Record<string, unknown> = {}) {
  return parseOrThrow(propertyInputSchema, {
    erfNumber: '1234',
    streetAddress: '18 Main Road',
    suburb: 'Wilderness',
    city: 'George',
    province: 'Western Cape',
    propertyType: 'house',
    bedrooms: '3',
    bathrooms: '2.5',
    currentAskingPrice: '2950000',
    businessArea: 'sales',
    propertyStatus: 'on_market',
    salesStatus: 'on_market',
    mandateStatus: 'mandate_active',
    mandateType: 'sole',
    mandateStart: '2026-09-01',
    mandateExpiry: '2026-12-01',
    ...overrides,
  });
}

function personInput(overrides: Record<string, unknown> = {}) {
  return parseOrThrow(personInputSchema, {
    firstName: 'John',
    surname: 'Smith',
    businessArea: 'sales',
    clientTypes: ['seller'],
    contacts: [{ contactType: 'mobile', value: '082 543 2681', isPrimary: true }],
    ...overrides,
  });
}

/** A real PNG header, so the magic-byte check is genuinely exercised. */
function pngFile(name = 'photo.png'): File {
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...Array.from({ length: 64 }, (_, index) => index % 251),
  ]);
  return new File([bytes], name, { type: 'image/png' });
}

function pdfFile(name = 'mandate.pdf'): File {
  const bytes = new Uint8Array([
    0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37,
    ...Array.from({ length: 32 }, () => 0x20),
  ]);
  return new File([bytes], name, { type: 'application/pdf' });
}

// =====================================================================
describe('acceptance test — property (spec 125)', () => {
  it('creates 18 Main Road, Wilderness, Erf 1234 with GRLP-P-00000001', async () => {
    const created = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    assert.equal(created.propertyRef, 'GRLP-P-00000001');

    const property = await readingAs(ayden, (db) => getProperty(db, created.id));
    assert.ok(property);
    assert.equal(property.streetAddress, '18 Main Road');
    assert.equal(property.suburb, 'Wilderness');
    assert.equal(property.erfNumber, '1234');
    assert.equal(property.primaryAgentId, ayden.id);
    assert.equal(property.addressLine, '18 Main Road, Wilderness, George');
  });

  it('links John Smith to the property as its owner', async () => {
    const property = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    const john = await asUser(ayden, (db) => createPerson(db, aydenCtx, personInput()));

    await asUser(ayden, (db) =>
      linkPersonToProperty(db, aydenCtx, property.id, {
        personId: john.id,
        role: 'owner',
        ownershipPercent: '100',
        isPrimaryContact: true,
        startDate: null,
        endDate: null,
        notes: null,
      }),
    );

    const loaded = await readingAs(ayden, (db) => getProperty(db, property.id));
    assert.equal(loaded?.people.length, 1);
    assert.equal(loaded?.people[0]?.personName, 'John Smith');
    assert.equal(loaded?.people[0]?.role, 'owner');
    assert.equal(loaded?.ownerNames[0], 'John Smith');
    assert.equal(loaded?.people[0]?.isPrimaryContact, true);
  });

  it('detects the same property when it is captured again', async () => {
    await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));

    const matches = await readingAs(ayden, (db) =>
      findPropertyDuplicates(db, {
        erfNumber: '1234',
        streetAddress: '18 Main Road',
        suburb: 'Wilderness',
      }),
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.confidence, 'high');
    assert.ok(matches[0]?.reasons.some((reason) => /erf/i.test(reason)));
  });

  it('refuses ownership shares that add up to more than the property', async () => {
    const property = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const john = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    const mary = await asUser(management, (db) =>
      createPerson(db, managementCtx, personInput({ firstName: 'Mary', contacts: [] })),
    );

    await asUser(management, (db) =>
      linkPersonToProperty(db, managementCtx, property.id, {
        personId: john.id, role: 'owner', ownershipPercent: '60',
        isPrimaryContact: false, startDate: null, endDate: null, notes: null,
      }),
    );
    const error = await rejects(
      asUser(management, (db) =>
        linkPersonToProperty(db, managementCtx, property.id, {
          personId: mary.id, role: 'co_owner', ownershipPercent: '50',
          isPrimaryContact: false, startDate: null, endDate: null, notes: null,
        }),
      ),
    );
    assert.match(error.message, /cannot exceed 100|highlighted/i);
  });
});

// =====================================================================
describe('the six statuses stay separate (spec 141)', () => {
  it('records the opening position of each status when a property is created', async () => {
    const property = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const history = await readingAs(management, (db) => getPropertyHistory(db, property.id));
    const kinds = history.statuses.map((entry) => entry.statusKind).sort();
    assert.deepEqual(kinds, [
      'business_area',
      'mandate',
      'property',
      'rental',
      'sale_outcome',
      'sales',
    ]);
  });

  it('records each status change under its own kind, not as one status', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const before = await readingAs(management, (db) => getProperty(db, created.id));

    await asUser(management, (db) =>
      updateProperty(
        db,
        managementCtx,
        created.id,
        propertyInput({
          // Off market, mandate withdrawn, sold by a third party: three
          // different facts changing at once.
          propertyStatus: 'off_market',
          mandateStatus: 'mandate_withdrawn',
          saleOutcome: 'sold_by_third_party',
          statusChangeReason: 'Seller gave the mandate to another agency',
        }),
        before!.rowVersion,
      ),
    );

    const after = await readingAs(management, (db) => getProperty(db, created.id));
    assert.equal(after?.propertyStatus, 'off_market');
    assert.equal(after?.mandateStatus, 'mandate_withdrawn');
    assert.equal(after?.saleOutcome, 'sold_by_third_party');
    // The sales status was not touched by any of that.
    assert.equal(after?.salesStatus, 'on_market');

    const history = await readingAs(management, (db) => getPropertyHistory(db, created.id));
    const changes = history.statuses.filter((entry) => entry.oldValue !== null);
    const changedKinds = changes.map((entry) => entry.statusKind).sort();
    assert.deepEqual(changedKinds, ['mandate', 'property', 'sale_outcome']);
    assert.ok(
      changes.every((entry) => entry.reason === 'Seller gave the mandate to another agency'),
    );
  });

  it('keeps a price history entry for every asking price change', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const first = await readingAs(management, (db) => getProperty(db, created.id));
    await asUser(management, (db) =>
      updateProperty(
        db,
        managementCtx,
        created.id,
        propertyInput({ currentAskingPrice: '2750000', statusChangeReason: 'Price reduced' }),
        first!.rowVersion,
      ),
    );

    const history = await readingAs(management, (db) => getPropertyHistory(db, created.id));
    const asking = history.prices.filter((entry) => entry.priceKind === 'asking');
    assert.equal(asking.length, 2);
    assert.equal(asking[0]?.newPrice, '2750000.00');
    assert.equal(asking[0]?.oldPrice, '2950000.00');
    assert.equal(asking[0]?.reason, 'Price reduced');

    // The original asking price is not rewritten by a reduction.
    const property = await readingAs(management, (db) => getProperty(db, created.id));
    assert.equal(property?.originalAskingPrice, '2950000.00');
  });

  it('keeps a mandate history entry when the mandate terms change', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const first = await readingAs(management, (db) => getProperty(db, created.id));
    await asUser(management, (db) =>
      updateProperty(
        db,
        managementCtx,
        created.id,
        propertyInput({ mandateType: 'open', mandateExpiry: '2027-03-01' }),
        first!.rowVersion,
      ),
    );
    const history = await readingAs(management, (db) => getPropertyHistory(db, created.id));
    assert.equal(history.mandates.length, 2);
    assert.equal(history.mandates[0]?.mandateType, 'open');
  });

  it('refuses an active mandate with no start date', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        propertyInput({ mandateStatus: 'mandate_active', mandateStart: '' }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('refuses a mandate that expires before it starts', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        propertyInput({ mandateStart: '2026-12-01', mandateExpiry: '2026-09-01' }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });

  it('refuses a property with no address, erf or name', async () => {
    const error = await rejects(
      Promise.resolve().then(() =>
        propertyInput({ streetAddress: '', erfNumber: '', propertyName: '' }),
      ),
    );
    assert.match(error.message, /highlighted/i);
  });
});

// =====================================================================
describe('agent scoping (spec 126)', () => {
  it('hides one agent\'s property from another agent', async () => {
    const created = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    assert.ok(await readingAs(ayden, (db) => getProperty(db, created.id)));
    assert.equal(await readingAs(johan, (db) => getProperty(db, created.id)), null);
    assert.ok(await readingAs(management, (db) => getProperty(db, created.id)));
  });

  it('keeps an agent out of the property list as well', async () => {
    await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    assert.equal((await readingAs(ayden, (db) => listProperties(db, {}))).total, 1);
    assert.equal((await readingAs(johan, (db) => listProperties(db, {}))).total, 0);
    assert.equal((await readingAs(management, (db) => listProperties(db, {}))).total, 1);
  });

  it('hides the status history along with the property', async () => {
    const created = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    const history = await readingAs(johan, (db) => getPropertyHistory(db, created.id));
    assert.equal(history.statuses.length, 0);
    assert.equal(history.prices.length, 0);
  });

  it('moves access with the property when it is reassigned (spec 65)', async () => {
    const created = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    await asUser(management, (db) =>
      assignPropertyAgent(db, managementCtx, created.id, {
        primaryAgentId: johan.id,
        secondaryAgentId: null,
        reason: 'Ayden to Johan',
      }),
    );
    assert.equal(await readingAs(ayden, (db) => getProperty(db, created.id)), null);
    assert.ok(await readingAs(johan, (db) => getProperty(db, created.id)));

    const history = await readingAs(management, (db) => getPropertyHistory(db, created.id));
    assert.equal(history.assignments.length, 2);
    assert.ok(history.assignments.some((entry) => entry.unassignedAt !== null));
  });

  it('lets a sharing agent see the property as well', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ primaryAgentId: ayden.id, secondaryAgentId: johan.id })),
    );
    assert.ok(await readingAs(ayden, (db) => getProperty(db, created.id)));
    assert.ok(await readingAs(johan, (db) => getProperty(db, created.id)));
  });

  it('lets management narrow the view to one agent (spec 10, 127)', async () => {
    await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    await asUser(johan, (db) =>
      createProperty(db, johanCtx, propertyInput({ erfNumber: '9999', streetAddress: '2 Beach Road' })),
    );
    const all = await readingAs(management, (db) => listProperties(db, {}));
    const onlyJohan = await readingAs(management, (db) => listProperties(db, { agentId: johan.id }));
    assert.equal(all.total, 2);
    assert.equal(onlyJohan.total, 1);
    assert.equal(onlyJohan.rows[0]?.streetAddress, '2 Beach Road');
  });
});

// =====================================================================
describe('duplicate detection (spec 33)', () => {
  it('treats the same erf and portion in a suburb as very likely the same', async () => {
    await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ portionNumber: '3' })),
    );
    const matches = await readingAs(management, (db) =>
      findPropertyDuplicates(db, {
        erfNumber: '1234',
        portionNumber: '3',
        suburb: 'Wilderness',
        streetAddress: 'Something else entirely',
      }),
    );
    assert.equal(matches[0]?.confidence, 'high');
    assert.ok(matches[0]?.reasons.some((reason) => /erf and portion/i.test(reason)));
  });

  it('treats an identical street address as very likely the same', async () => {
    await asUser(management, (db) => createProperty(db, managementCtx, propertyInput()));
    const matches = await readingAs(management, (db) =>
      findPropertyDuplicates(db, { streetAddress: '18 Main Road', suburb: 'Wilderness' }),
    );
    assert.equal(matches[0]?.confidence, 'high');
    assert.ok(matches[0]?.reasons.includes('Same street address'));
  });

  it('offers a similar address as a possibility rather than a certainty', async () => {
    await asUser(management, (db) => createProperty(db, managementCtx, propertyInput()));
    const matches = await readingAs(management, (db) =>
      findPropertyDuplicates(db, { streetAddress: '18A Main Rd', suburb: 'Wilderness' }),
    );
    assert.equal(matches.length, 1);
    assert.equal(matches[0]?.confidence, 'possible');
  });

  it('does not flag a genuinely different property', async () => {
    await asUser(management, (db) => createProperty(db, managementCtx, propertyInput()));
    const matches = await readingAs(management, (db) =>
      findPropertyDuplicates(db, {
        erfNumber: '8888',
        streetAddress: '77 Kaaimans Pass',
        suburb: 'Sedgefield',
      }),
    );
    assert.equal(matches.length, 0);
  });

  it('does not offer an agent a duplicate they may not see', async () => {
    await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    const matches = await readingAs(johan, (db) =>
      findPropertyDuplicates(db, { erfNumber: '1234', suburb: 'Wilderness' }),
    );
    assert.equal(matches.length, 0);
  });

  it('lists duplicate pairs for the data quality screen', async () => {
    await asUser(management, (db) => createProperty(db, managementCtx, propertyInput()));
    await asUser(management, (db) => createProperty(db, managementCtx, propertyInput()));
    const pairs = await readingAs(management, (db) => listPropertyDuplicatePairs(db, {}));
    assert.equal(pairs.length, 1);
    assert.equal(pairs[0]?.confidence, 'high');
  });
});

// =====================================================================
describe('merging properties (spec 33)', () => {
  async function twoProperties(): Promise<{ masterId: string; mergedId: string }> {
    const master = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const merged = await asUser(management, (db) =>
      createProperty(
        db,
        managementCtx,
        propertyInput({ bedrooms: '4', currentAskingPrice: '3100000', propertyName: 'Seaview' }),
      ),
    );
    const john = await asUser(management, (db) => createPerson(db, managementCtx, personInput()));
    await asUser(management, (db) =>
      linkPersonToProperty(db, managementCtx, merged.id, {
        personId: john.id, role: 'owner', ownershipPercent: '100',
        isPrimaryContact: true, startDate: null, endDate: null, notes: null,
      }),
    );
    return { masterId: master.id, mergedId: merged.id };
  }

  it('compares the two records field by field before anything is decided', async () => {
    const { masterId, mergedId } = await twoProperties();
    const comparison = await readingAs(management, (db) =>
      getPropertyMergeComparison(db, masterId, mergedId),
    );
    const beds = comparison.fields.find((field) => field.field === 'bedrooms');
    assert.equal(beds?.differs, true);
    assert.equal(comparison.merged.counts.people, 1);
  });

  it('keeps one master record and moves the owners and history across', async () => {
    const { masterId, mergedId } = await twoProperties();
    const mergedRef = (await readingAs(management, (db) => getProperty(db, mergedId)))!.propertyRef;

    const result = await asUser(management, (db) =>
      mergeProperties(db, managementCtx, {
        masterId,
        mergedId,
        choices: { bedrooms: 'merged', property_name: 'merged' },
        reason: 'Same erf captured twice',
      }),
    );
    assert.equal(result.mergedReference, mergedRef);

    const master = await readingAs(management, (db) => getProperty(db, masterId));
    assert.equal(Number(master?.bedrooms), 4, 'the chosen value survived');
    assert.equal(master?.propertyName, 'Seaview');
    assert.equal(master?.people.length, 1, 'the owner moved across');

    const loser = await readingAs(management, (db) => getProperty(db, mergedId));
    assert.equal(loser?.mergedIntoId, masterId);
    assert.equal(loser?.isArchived, true);
    assert.equal(loser?.propertyRef, mergedRef, 'the reference stays with the record');

    const next = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ erfNumber: '5555' })),
    );
    assert.notEqual(next.propertyRef, mergedRef);
  });

  it('writes a merge record naming both references and the reason', async () => {
    const { masterId, mergedId } = await twoProperties();
    await asUser(management, (db) =>
      mergeProperties(db, managementCtx, {
        masterId,
        mergedId,
        choices: {},
        reason: 'Duplicate import',
      }),
    );
    const record = await readingAs(management, (db) =>
      db.one<{ reason: string; performed_by: string; moved_counts: Record<string, unknown> }>(
        "select * from merge_records where entity_type = 'property'",
      ),
    );
    assert.equal(record.reason, 'Duplicate import');
    assert.equal(record.performed_by, management.id);
    assert.ok(Object.keys(record.moved_counts).length > 0);
  });

  it('keeps the merged property out of lists and duplicate checks', async () => {
    const { masterId, mergedId } = await twoProperties();
    await asUser(management, (db) =>
      mergeProperties(db, managementCtx, { masterId, mergedId, choices: {}, reason: null }),
    );
    assert.equal((await readingAs(management, (db) => listProperties(db, {}))).total, 1);
    assert.equal((await readingAs(management, (db) => listPropertyDuplicatePairs(db, {}))).length, 0);
  });

  it('refuses a merge from someone without MERGE_RECORDS', async () => {
    const a = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    const b = await asUser(ayden, (db) =>
      createProperty(db, aydenCtx, propertyInput({ erfNumber: '4321' })),
    );
    const error = await rejects(
      asUser(ayden, (db) =>
        mergeProperties(db, aydenCtx, {
          masterId: a.id,
          mergedId: b.id,
          choices: {},
          reason: null,
        }),
      ),
    );
    assert.match(error.message, /permission/i);
  });

  it('refuses to merge a property into itself', async () => {
    const property = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const error = await rejects(
      asUser(management, (db) =>
        mergeProperties(db, managementCtx, {
          masterId: property.id,
          mergedId: property.id,
          choices: {},
          reason: null,
        }),
      ),
    );
    assert.match(error.message, /into itself/i);
  });
});

// =====================================================================
describe('marketing (spec 36, 37, 115)', () => {
  it('keeps marketing copy apart from internal notes', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ notes: 'Seller is difficult' })),
    );
    await asUser(management, (db) =>
      saveMarketing(db, managementCtx, created.id, {
        headline: 'Wilderness family home',
        shortDescription: 'Three bedrooms, walking distance to the beach.',
        fullDescription: null,
        keySellingPoints: null,
        features: null,
        directions: null,
        onShowInfo: 'Sunday 14:00 to 17:00',
        marketingNotes: null,
        marketingStatus: 'ready',
      }),
    );
    const property = await readingAs(management, (db) => getProperty(db, created.id));
    assert.equal(property?.marketing?.headline, 'Wilderness family home');
    assert.equal(property?.marketing?.marketingStatus, 'ready');
    // The internal note is not part of the advertisement.
    assert.equal(property?.notes, 'Seller is difficult');
    assert.ok(!JSON.stringify(property?.marketing).includes('Seller is difficult'));
  });

  it('records a portal as advertised without claiming to have published it', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    await asUser(management, (db) =>
      saveMarketingChannel(db, managementCtx, created.id, {
        channel: 'property24',
        isPublished: true,
        publishedAt: '2026-09-10',
        removedAt: null,
        sourceUrl: 'https://www.property24.com/listing/123',
        notes: null,
      }),
    );

    const channels = await readingAs(management, (db) => listMarketingChannels(db, created.id));
    assert.equal(channels.length, 1);
    assert.equal(channels[0]?.isPublished, true);

    // The audit trail says this was recorded by hand, not performed.
    const audit = await readingAs(management, (db) =>
      db.one<{ context: { note: string; recordedAsPublished: boolean } }>(
        `select context from audit_logs
          where action = 'property.marketing_channel_recorded' and entity_id = $1`,
        [created.id],
      ),
    );
    assert.match(audit.context.note, /does not contact portals/i);
  });

  it('refuses an advertisement link that is not a web address', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const error = await rejects(
      asUser(management, (db) =>
        saveMarketingChannel(db, managementCtx, created.id, {
          channel: 'property24',
          isPublished: true,
          publishedAt: null,
          removedAt: null,
          sourceUrl: 'javascript:alert(1)',
          notes: null,
        }),
      ),
    );
    assert.match(error.message, /web address/i);
  });
});

// =====================================================================
describe('past sales and rentals (spec 31, 49)', () => {
  it('keeps the sale date and the registration date apart', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    await asUser(management, (db) =>
      addSaleHistory(db, managementCtx, created.id, {
        saleDate: '2026-05-01',
        registeredAt: '2026-08-15',
        salePrice: '2800000',
        buyerId: null,
        sellerId: null,
        agentId: ayden.id,
        saleOutcome: 'sold_by_us',
        notes: null,
      }),
    );
    const row = await readingAs(management, (db) =>
      db.one<{ sale_date: Date; registered_at: Date }>(
        'select sale_date, registered_at from property_sale_history where property_id = $1',
        [created.id],
      ),
    );
    assert.equal(row.sale_date.toISOString().slice(0, 10), '2026-05-01');
    assert.equal(row.registered_at.toISOString().slice(0, 10), '2026-08-15');
  });

  it('refuses to let an agent without SALES_EDIT record a past sale', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ primaryAgentId: accounts.id })),
    );
    const error = await rejects(
      asUser(accounts, (db) =>
        addSaleHistory(db, accountsCtx, created.id, {
          saleDate: '2026-05-01', registeredAt: null, salePrice: '1',
          buyerId: null, sellerId: null, agentId: null, saleOutcome: null, notes: null,
        }),
      ),
    );
    assert.match(error.message, /row-level security|policy|permission/i);
  });

  it('records a past rental', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ businessArea: 'rentals' })),
    );
    await asUser(management, (db) =>
      addRentalHistory(db, managementCtx, created.id, {
        leaseStart: '2025-01-01',
        leaseEnd: '2025-12-31',
        monthlyRental: '14500',
        tenantId: null,
        landlordId: null,
        agentId: ayden.id,
        notes: null,
      }),
    );
    const count = await readingAs(management, (db) =>
      db.one<{ n: number }>(
        'select count(*)::int as n from property_rental_history where property_id = $1',
        [created.id],
      ),
    );
    assert.equal(count.n, 1);
  });
});

// =====================================================================
describe('photographs and documents (spec 34, 35, 67)', () => {
  it('stores a photograph and makes the first one the cover image', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const stored = await asUser(management, (db) =>
      uploadPropertyPhotos(db, managementCtx, created.id, [pngFile('front.png'), pngFile('back.png')]),
    );
    assert.equal(stored, 2);

    const photos = await readingAs(management, (db) => listPropertyPhotos(db, created.id));
    assert.equal(photos.length, 2);
    assert.equal(photos.filter((photo) => photo.isCover).length, 1);
    assert.equal(photos[0]?.isCover, true);
  });

  it('refuses a file that is not the type it claims to be', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const fake = new File([new Uint8Array([0x3c, 0x3f, 0x70, 0x68, 0x70])], 'shell.png', {
      type: 'image/png',
    });
    const error = await rejects(
      asUser(management, (db) =>
        uploadPropertyPhotos(db, managementCtx, created.id, [fake]),
      ),
    );
    assert.match(error.message, /highlighted|does not look like/i);
  });

  it('refuses a type the CRM does not accept', () => {
    const error = (() => {
      try {
        validateUpload('run.sh', 'application/x-sh', new Uint8Array([1, 2, 3]));
        return null;
      } catch (caught) {
        return caught as Error;
      }
    })();
    assert.ok(error);
  });

  it('strips any directory a client sends in a file name', () => {
    assert.equal(safeFileName('../../etc/passwd'), 'passwd');
    assert.equal(safeFileName('C:\\Users\\me\\deed.pdf'), 'deed.pdf');
    assert.equal(safeFileName(''), 'file');
  });

  it('serves a photograph to an authorised user', async () => {
    const created = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    await asUser(ayden, (db) =>
      uploadPropertyPhotos(db, aydenCtx, created.id, [pngFile()]),
    );
    const photos = await readingAs(ayden, (db) => listPropertyPhotos(db, created.id));
    const file = await asUser(ayden, (db) =>
      readFileForDownload(db, aydenCtx, 'photo', photos[0]!.id),
    );
    assert.equal(file.contentType, 'image/png');
    assert.ok(file.bytes.byteLength > 0);
  });

  it('refuses to serve a photograph on another agent\'s property', async () => {
    const created = await asUser(ayden, (db) => createProperty(db, aydenCtx, propertyInput()));
    await asUser(ayden, (db) => uploadPropertyPhotos(db, aydenCtx, created.id, [pngFile()]));
    const photos = await readingAs(ayden, (db) => listPropertyPhotos(db, created.id));

    const error = await rejects(
      asUser(johan, (db) => readFileForDownload(db, johanCtx, 'photo', photos[0]!.id)),
    );
    assert.match(error.message, /could not be found/i);
  });

  it('attaches a document to a property and serves it to an authorised user', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const documentId = await asUser(management, (db) =>
      uploadDocument(db, managementCtx, {
        propertyId: created.id,
        file: pdfFile(),
        category: 'mandate',
        documentType: 'Sole mandate',
        expiresAt: '2026-12-01',
        notes: null,
      }),
    );
    const documents = await readingAs(management, (db) => listDocuments(db, { propertyId: created.id }));
    assert.equal(documents.length, 1);
    assert.equal(documents[0]?.id, documentId);
    assert.equal(documents[0]?.category, 'mandate');

    const file = await asUser(management, (db) =>
      readFileForDownload(db, managementCtx, 'document', documentId),
    );
    assert.equal(file.contentType, 'application/pdf');
    assert.equal(file.inline, true);
  });

  it('hides a FICA document from anyone without FICA_VIEW', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput({ primaryAgentId: ayden.id })),
    );
    await asUser(management, (db) =>
      uploadDocument(db, managementCtx, {
        propertyId: created.id,
        file: pdfFile('fica.pdf'),
        category: 'fica',
        documentType: 'Proof of address',
        expiresAt: null,
        notes: null,
      }),
    );

    // Ayden holds the property but not FICA_VIEW.
    const aydenSees = await readingAs(ayden, (db) => listDocuments(db, { propertyId: created.id }));
    assert.equal(aydenSees.length, 0);

    // The accounts officer holds FICA_VIEW and company-wide access.
    const accountsSees = await readingAs(accounts, (db) =>
      listDocuments(db, { propertyId: created.id }),
    );
    assert.equal(accountsSees.length, 1);
  });

  it('records opening a FICA document as sensitive access, without the contents', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const documentId = await asUser(management, (db) =>
      uploadDocument(db, managementCtx, {
        propertyId: created.id,
        file: pdfFile('fica.pdf'),
        category: 'fica',
        documentType: null,
        expiresAt: null,
        notes: null,
      }),
    );
    await asUser(management, (db) =>
      readFileForDownload(db, managementCtx, 'document', documentId),
    );

    const log = await readingAs(management, (db) =>
      db.one<{ access_type: string; entity_label: string }>(
        "select access_type, entity_label from sensitive_access_logs where actor_id = $1",
        [management.id],
      ),
    );
    assert.equal(log.access_type, 'FICA document opened');
    assert.equal(log.entity_label, 'fica.pdf');
  });

  it('refuses a document that is not attached to anything', async () => {
    const error = await rejects(
      asUser(management, (db) =>
        uploadDocument(db, managementCtx, {
          file: pdfFile(),
          category: 'other',
          documentType: null,
          expiresAt: null,
          notes: null,
        }),
      ),
    );
    assert.match(error.message, /attached to a record|highlighted/i);
  });
});

// =====================================================================
describe('archiving (spec 38, 104)', () => {
  it('archives rather than deletes, and keeps the history readable', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    await asUser(management, (db) =>
      archiveProperty(db, managementCtx, created.id, 'Mandate expired and not renewed'),
    );

    assert.equal((await readingAs(management, (db) => listProperties(db, { archived: 'active' }))).total, 0);
    assert.equal(
      (await readingAs(management, (db) => listProperties(db, { archived: 'archived' }))).total,
      1,
    );

    const property = await readingAs(management, (db) => getProperty(db, created.id));
    assert.equal(property?.archiveReason, 'Mandate expired and not renewed');
    const history = await readingAs(management, (db) => getPropertyHistory(db, created.id));
    assert.ok(history.statuses.length > 0, 'the status history survived the archive');
  });

  it('does not allow a property to be deleted at all', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const error = await rejects(
      asUser(management, (db) => db.query('delete from properties where id = $1', [created.id])),
    );
    assert.match(error.message, /permission denied/i);
  });

  it('refuses to overwrite a change made by someone else (spec 105)', async () => {
    const created = await asUser(management, (db) =>
      createProperty(db, managementCtx, propertyInput()),
    );
    const loaded = await readingAs(management, (db) => getProperty(db, created.id));
    await asUser(management, (db) =>
      updateProperty(db, managementCtx, created.id, propertyInput({ bedrooms: '4' }), loaded!.rowVersion),
    );
    const error = await rejects(
      asUser(management, (db) =>
        updateProperty(db, managementCtx, created.id, propertyInput({ bedrooms: '5' }), loaded!.rowVersion),
      ),
    );
    assert.match(error.message, /updated by another user/i);
  });
});

// =====================================================================
describe('searching and filtering (spec 86)', () => {
  beforeEach(async () => {
    await asUser(management, (db) => createProperty(db, managementCtx, propertyInput()));
    await asUser(management, (db) =>
      createProperty(
        db,
        managementCtx,
        propertyInput({
          erfNumber: '7788',
          streetAddress: '9 Kaaimans Crescent',
          suburb: 'Sedgefield',
          propertyType: 'vacant_land',
          currentAskingPrice: '890000',
          businessArea: 'rentals',
          mandateStatus: 'no_mandate',
          mandateType: '',
          mandateStart: '',
          mandateExpiry: '',
        }),
      ),
    );
  });

  it('finds a property by its street address', async () => {
    const found = await readingAs(management, (db) => listProperties(db, { query: 'Kaaimans' }));
    assert.equal(found.total, 1);
  });

  it('finds a property by erf number', async () => {
    const found = await readingAs(management, (db) => listProperties(db, { query: '1234' }));
    assert.equal(found.total, 1);
    assert.equal(found.rows[0]?.streetAddress, '18 Main Road');
  });

  it('finds a property by its GRLP reference', async () => {
    const found = await readingAs(management, (db) =>
      listProperties(db, { query: 'GRLP-P-00000001' }),
    );
    assert.equal(found.total, 1);
  });

  it('filters by type, area, price and mandate', async () => {
    assert.equal(
      (await readingAs(management, (db) => listProperties(db, { propertyType: 'vacant_land' }))).total,
      1,
    );
    assert.equal(
      (await readingAs(management, (db) => listProperties(db, { area: 'wilder' }))).total,
      1,
    );
    assert.equal(
      (await readingAs(management, (db) => listProperties(db, { maxPrice: '1000000' }))).total,
      1,
    );
    assert.equal(
      (await readingAs(management, (db) => listProperties(db, { mandateStatus: 'mandate_active' })))
        .total,
      1,
    );
  });

  it('shows a Sales & Rentals property in both single-area views', async () => {
    await asUser(management, (db) =>
      createProperty(
        db,
        managementCtx,
        propertyInput({ erfNumber: '4242', businessArea: 'sales_rentals' }),
      ),
    );
    const sales = await readingAs(management, (db) =>
      listProperties(db, { businessArea: 'sales' }),
    );
    const rentals = await readingAs(management, (db) =>
      listProperties(db, { businessArea: 'rentals' }),
    );
    assert.equal(sales.total, 2);
    assert.equal(rentals.total, 2);
  });

  it('finds mandates that are about to expire', async () => {
    await asOwner((db) =>
      db.query(
        `update properties set mandate_expiry = current_date + 10
          where erf_number = '1234'`,
      ),
    );
    const soon = await readingAs(management, (db) =>
      listProperties(db, { mandateExpiring: 'soon' }),
    );
    assert.equal(soon.total, 1);
  });
});
