'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { runAction, type ActionResult } from '@/lib/action-result.ts';
import { readAsUser, withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission, requireUser } from '@/lib/session.ts';
import { formBool, formList, formText, parseOrThrow } from '@/lib/validate.ts';
import type { Ctx } from '@/lib/actor.ts';
import type { DocumentCategory } from '@/lib/domain.ts';
import {
  marketingChannelInputSchema,
  marketingInputSchema,
  propertyAssignInputSchema,
  propertyInputSchema,
  propertyPersonInputSchema,
  rentalHistoryInputSchema,
  saleHistoryInputSchema,
} from '@/lib/properties/types.ts';
import {
  addRentalHistory,
  addSaleHistory,
  archiveProperty,
  assignPropertyAgent,
  createProperty,
  linkPersonToProperty,
  restoreProperty,
  saveMarketing,
  saveMarketingChannel,
  unlinkPersonFromProperty,
  updateProperty,
} from '@/lib/properties/mutations.ts';
import {
  findPropertyDuplicates,
  type PropertyDuplicateMatch,
} from '@/lib/properties/duplicates.ts';
import {
  mergeProperties,
  type SelectablePropertyField,
} from '@/lib/properties/merge.ts';
import { dismissDuplicatePair } from '@/lib/people/merge.ts';
import {
  archiveDocument,
  archivePhoto,
  setCoverPhoto,
  updatePhoto,
  uploadDocument,
  uploadPropertyPhotos,
} from '@/lib/files.ts';

async function context(): Promise<Ctx> {
  const user = await requireUser();
  return {
    actor: { id: user.id, email: user.email, permissions: user.permissions },
    meta: await requestMeta(),
  };
}

function readPropertyForm(formData: FormData) {
  return parseOrThrow(propertyInputSchema, {
    erfNumber: formText(formData, 'erfNumber'),
    portionNumber: formText(formData, 'portionNumber'),
    township: formText(formData, 'township'),
    propertyName: formText(formData, 'propertyName'),
    streetAddress: formText(formData, 'streetAddress'),
    suburb: formText(formData, 'suburb'),
    city: formText(formData, 'city'),
    province: formText(formData, 'province'),
    postalCode: formText(formData, 'postalCode'),
    propertyType: formText(formData, 'propertyType') || 'house',
    bedrooms: formText(formData, 'bedrooms'),
    bathrooms: formText(formData, 'bathrooms'),
    garages: formText(formData, 'garages'),
    parking: formText(formData, 'parking'),
    landSizeSqm: formText(formData, 'landSizeSqm'),
    buildingSizeSqm: formText(formData, 'buildingSizeSqm'),
    originalAskingPrice: formText(formData, 'originalAskingPrice'),
    currentAskingPrice: formText(formData, 'currentAskingPrice'),
    estimatedValue: formText(formData, 'estimatedValue'),
    monthlyRental: formText(formData, 'monthlyRental'),
    businessArea: formText(formData, 'businessArea') || 'sales',
    propertyStatus: formText(formData, 'propertyStatus') || 'active',
    salesStatus: formText(formData, 'salesStatus') || 'prospect',
    rentalStatus: formText(formData, 'rentalStatus') || 'rental_prospect',
    mandateStatus: formText(formData, 'mandateStatus') || 'no_mandate',
    mandateType: formText(formData, 'mandateType'),
    saleOutcome: formText(formData, 'saleOutcome') || 'not_applicable',
    mandateStart: formText(formData, 'mandateStart'),
    mandateExpiry: formText(formData, 'mandateExpiry'),
    primaryAgentId: formText(formData, 'primaryAgentId'),
    secondaryAgentId: formText(formData, 'secondaryAgentId'),
    officeId: formText(formData, 'officeId'),
    teamId: formText(formData, 'teamId'),
    notes: formText(formData, 'notes'),
    statusChangeReason: formText(formData, 'statusChangeReason'),
    tagIds: formList(formData, 'tagIds'),
  });
}

/** Duplicate check before a property is created (spec 33, 88). */
export async function checkPropertyDuplicatesAction(
  formData: FormData,
): Promise<ActionResult<PropertyDuplicateMatch[]>> {
  return runAction('properties.duplicate-check', async () => {
    const user = await requirePermission('PROPERTIES_CREATE', 'property records');
    const matches = await readAsUser(user.id, (db) =>
      findPropertyDuplicates(db, {
        erfNumber: formText(formData, 'erfNumber') || null,
        portionNumber: formText(formData, 'portionNumber') || null,
        streetAddress: formText(formData, 'streetAddress') || null,
        propertyName: formText(formData, 'propertyName') || null,
        suburb: formText(formData, 'suburb') || null,
        city: formText(formData, 'city') || null,
      }),
    );
    return {
      ok: true as const,
      data: matches,
      message:
        matches.length === 0
          ? 'No possible duplicates found.'
          : `${matches.length} possible ${matches.length === 1 ? 'match' : 'matches'} found. Please check before creating a new record.`,
    };
  });
}

export async function createPropertyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string | null = null;

  const result = await runAction<undefined>('properties.create', async () => {
    const user = await requirePermission('PROPERTIES_CREATE', 'property records');
    const ctx = await context();
    const input = readPropertyForm(formData);

    if (formText(formData, 'duplicateCheck') !== 'acknowledged') {
      return {
        ok: false as const,
        message: 'Please run the duplicate check before creating a new property.',
      };
    }

    const created = await withUser(user.id, (db) => createProperty(db, ctx, input));
    createdId = created.id;
    return { ok: true as const, message: `${created.propertyRef} created.` };
  });

  if (result.ok && createdId) {
    revalidatePath('/properties');
    redirect(`/properties/${createdId}?saved=created`);
  }
  return result;
}

export async function updatePropertyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');

  const result = await runAction<undefined>('properties.update', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    const input = readPropertyForm(formData);
    const expectedVersion = Number(formText(formData, 'rowVersion'));
    await withUser(user.id, (db) =>
      updateProperty(db, ctx, propertyId, input, expectedVersion),
    );
    return { ok: true as const, message: 'Property updated.' };
  });

  if (result.ok) {
    revalidatePath(`/properties/${propertyId}`);
    redirect(`/properties/${propertyId}?saved=updated`);
  }
  return result;
}

export async function archivePropertyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.archive', async () => {
    const user = await requirePermission('PROPERTIES_DELETE', 'archiving properties');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archiveProperty(db, ctx, propertyId, formText(formData, 'reason') || null),
    );
    return { ok: true as const, message: 'Property archived.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function restorePropertyAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.restore', async () => {
    const user = await requirePermission('PROPERTIES_DELETE', 'restoring properties');
    const ctx = await context();
    await withUser(user.id, (db) => restoreProperty(db, ctx, propertyId));
    return { ok: true as const, message: 'Property restored.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function assignPropertyAgentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.assign-agent', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    const input = parseOrThrow(propertyAssignInputSchema, {
      primaryAgentId: formText(formData, 'primaryAgentId'),
      secondaryAgentId: formText(formData, 'secondaryAgentId'),
      reason: formText(formData, 'reason'),
    });
    await withUser(user.id, (db) => assignPropertyAgent(db, ctx, propertyId, input));
    return { ok: true as const, message: 'Agent assignment updated.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function linkPersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.link-person', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    const input = parseOrThrow(propertyPersonInputSchema, {
      personId: formText(formData, 'personId'),
      role: formText(formData, 'role'),
      ownershipPercent: formText(formData, 'ownershipPercent'),
      isPrimaryContact: formBool(formData, 'isPrimaryContact'),
      startDate: formText(formData, 'startDate'),
      endDate: formText(formData, 'endDate'),
      notes: formText(formData, 'notes'),
    });
    await withUser(user.id, (db) => linkPersonToProperty(db, ctx, propertyId, input));
    return { ok: true as const, message: 'Person linked to this property.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function unlinkPersonAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.unlink-person', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    await withUser(user.id, (db) =>
      unlinkPersonFromProperty(db, ctx, propertyId, formText(formData, 'linkId')),
    );
    return { ok: true as const, message: 'Link removed.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function saveMarketingAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.save-marketing', async () => {
    const user = await requireUser();
    if (!user.permissions.has('PROPERTIES_EDIT') && !user.permissions.has('MARKETING_ADMIN')) {
      return { ok: false as const, message: 'You do not have permission to edit marketing.' };
    }
    const ctx = await context();
    const input = parseOrThrow(marketingInputSchema, {
      headline: formText(formData, 'headline'),
      shortDescription: formText(formData, 'shortDescription'),
      fullDescription: formText(formData, 'fullDescription'),
      keySellingPoints: formText(formData, 'keySellingPoints'),
      features: formText(formData, 'features'),
      directions: formText(formData, 'directions'),
      onShowInfo: formText(formData, 'onShowInfo'),
      marketingNotes: formText(formData, 'marketingNotes'),
      marketingStatus: formText(formData, 'marketingStatus') || 'not_prepared',
    });
    await withUser(user.id, (db) => saveMarketing(db, ctx, propertyId, input));
    return { ok: true as const, message: 'Marketing saved.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function saveMarketingChannelAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.save-channel', async () => {
    const user = await requireUser();
    if (!user.permissions.has('PROPERTIES_EDIT') && !user.permissions.has('MARKETING_ADMIN')) {
      return { ok: false as const, message: 'You do not have permission to edit marketing.' };
    }
    const ctx = await context();
    const input = parseOrThrow(marketingChannelInputSchema, {
      channel: formText(formData, 'channel'),
      isPublished: formBool(formData, 'isPublished'),
      publishedAt: formText(formData, 'publishedAt'),
      removedAt: formText(formData, 'removedAt'),
      sourceUrl: formText(formData, 'sourceUrl'),
      notes: formText(formData, 'notes'),
    });
    await withUser(user.id, (db) => saveMarketingChannel(db, ctx, propertyId, input));
    // Deliberately worded as a record of what somebody did, not as an action
    // the CRM performed on a portal (spec 37, 115).
    return { ok: true as const, message: 'Recorded. The CRM does not update portals itself.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function addSaleHistoryAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.add-sale-history', async () => {
    const user = await requirePermission('SALES_EDIT', 'sales records');
    const ctx = await context();
    const input = parseOrThrow(saleHistoryInputSchema, {
      saleDate: formText(formData, 'saleDate'),
      registeredAt: formText(formData, 'registeredAt'),
      salePrice: formText(formData, 'salePrice'),
      buyerId: formText(formData, 'buyerId'),
      sellerId: formText(formData, 'sellerId'),
      agentId: formText(formData, 'agentId'),
      saleOutcome: formText(formData, 'saleOutcome'),
      notes: formText(formData, 'notes'),
    });
    await withUser(user.id, (db) => addSaleHistory(db, ctx, propertyId, input));
    return { ok: true as const, message: 'Past sale recorded.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function addRentalHistoryAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.add-rental-history', async () => {
    const user = await requirePermission('RENTALS_EDIT', 'rental records');
    const ctx = await context();
    const input = parseOrThrow(rentalHistoryInputSchema, {
      leaseStart: formText(formData, 'leaseStart'),
      leaseEnd: formText(formData, 'leaseEnd'),
      monthlyRental: formText(formData, 'monthlyRental'),
      tenantId: formText(formData, 'tenantId'),
      landlordId: formText(formData, 'landlordId'),
      agentId: formText(formData, 'agentId'),
      notes: formText(formData, 'notes'),
    });
    await withUser(user.id, (db) => addRentalHistory(db, ctx, propertyId, input));
    return { ok: true as const, message: 'Past rental recorded.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

// --- photographs ------------------------------------------------------------

export async function uploadPhotosAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.upload-photos', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    const files = formData.getAll('photos').filter((value): value is File => value instanceof File);
    const stored = await withUser(user.id, (db) =>
      uploadPropertyPhotos(db, ctx, propertyId, files, {
        isMarketing: formBool(formData, 'isMarketing'),
      }),
    );
    return {
      ok: true as const,
      message: `${stored} ${stored === 1 ? 'photograph' : 'photographs'} uploaded.`,
    };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function setCoverPhotoAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.set-cover', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    await withUser(user.id, (db) =>
      setCoverPhoto(db, ctx, propertyId, formText(formData, 'photoId')),
    );
    return { ok: true as const, message: 'Cover image set.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function updatePhotoAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.update-photo', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    const order = formText(formData, 'sortOrder');
    await withUser(user.id, (db) =>
      updatePhoto(db, ctx, propertyId, formText(formData, 'photoId'), {
        caption: formText(formData, 'caption') || null,
        isMarketing: formBool(formData, 'isMarketing'),
        sortOrder: order ? Number(order) : null,
      }),
    );
    return { ok: true as const, message: 'Photograph updated.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function archivePhotoAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.archive-photo', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archivePhoto(db, ctx, propertyId, formText(formData, 'photoId')),
    );
    return { ok: true as const, message: 'Photograph archived.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

// --- documents --------------------------------------------------------------

export async function uploadPropertyDocumentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.upload-document', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return { ok: false as const, message: 'Please choose a file to upload.' };
    }
    await withUser(user.id, (db) =>
      uploadDocument(db, ctx, {
        propertyId,
        file,
        category: (formText(formData, 'category') || 'property') as DocumentCategory,
        documentType: formText(formData, 'documentType') || null,
        expiresAt: formText(formData, 'expiresAt') || null,
        notes: formText(formData, 'notes') || null,
      }),
    );
    return { ok: true as const, message: 'Document uploaded.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

export async function archivePropertyDocumentAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const propertyId = formText(formData, 'propertyId');
  const result = await runAction<undefined>('properties.archive-document', async () => {
    const user = await requirePermission('PROPERTIES_EDIT', 'property records');
    const ctx = await context();
    await withUser(user.id, (db) =>
      archiveDocument(db, ctx, formText(formData, 'documentId')),
    );
    return { ok: true as const, message: 'Document archived.' };
  });
  if (result.ok) revalidatePath(`/properties/${propertyId}`);
  return result;
}

// --- merging ----------------------------------------------------------------

export async function mergePropertiesAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const masterId = formText(formData, 'masterId');
  let done = false;

  const result = await runAction<undefined>('properties.merge', async () => {
    const user = await requirePermission('MERGE_RECORDS', 'merging records');
    const ctx = await context();

    const choices: Partial<Record<SelectablePropertyField, 'master' | 'merged'>> = {};
    for (const [key, value] of formData.entries()) {
      const match = /^choice\[([a-z_]+)\]$/.exec(key);
      if (match && (value === 'master' || value === 'merged')) {
        choices[match[1] as SelectablePropertyField] = value;
      }
    }

    const merged = await withUser(user.id, (db) =>
      mergeProperties(db, ctx, {
        masterId,
        mergedId: formText(formData, 'mergedId'),
        choices,
        reason: formText(formData, 'reason') || null,
      }),
    );
    done = true;
    return {
      ok: true as const,
      message: `${merged.mergedReference} was merged into ${merged.masterReference}.`,
    };
  });

  if (result.ok && done) {
    revalidatePath('/properties');
    redirect(`/properties/${masterId}?saved=merged`);
  }
  return result;
}

export async function dismissPropertyDuplicateAction(
  _previous: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const result = await runAction<undefined>('properties.dismiss-duplicate', async () => {
    const user = await requirePermission('MERGE_RECORDS', 'the duplicates review');
    const ctx = await context();
    const decision = formText(formData, 'decision');
    await withUser(user.id, (db) =>
      dismissDuplicatePair(db, ctx, {
        entityType: 'property',
        firstId: formText(formData, 'firstId'),
        secondId: formText(formData, 'secondId'),
        decision: decision === 'review_later' ? 'review_later' : 'not_duplicate',
        reason: formText(formData, 'reason') || null,
      }),
    );
    return {
      ok: true as const,
      message:
        decision === 'review_later' ? 'Marked to review later.' : 'Marked as not a duplicate.',
    };
  });
  if (result.ok) revalidatePath('/properties/duplicates');
  return result;
}
