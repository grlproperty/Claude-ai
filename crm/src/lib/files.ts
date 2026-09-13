import type { Ctx } from './actor.ts';
import type { Db } from './db.ts';
import { recordAudit, recordSensitiveAccess } from './audit.ts';
import { NotFoundError, ValidationError } from './errors.ts';
import { readUpload, storage, storeUpload } from './storage.ts';
import type { DocumentCategory } from './domain.ts';

/**
 * Photos and documents.
 *
 * Nothing here is ever served as a static asset. A file leaves the CRM only
 * through readFileForDownload(), which finds the row under row level
 * security — so an unauthorised reader gets "not found" rather than the file
 * — and writes a sensitive access record for the protected categories
 * (spec 15, 55, 67, 103, 111).
 */

/** Categories whose every opening is recorded, not merely permitted. */
const SENSITIVE_CATEGORIES: DocumentCategory[] = ['fica', 'identity', 'commission'];

export interface PhotoSummary {
  id: string;
  fileName: string;
  caption: string | null;
  contentType: string;
  byteSize: number;
  sortOrder: number;
  isCover: boolean;
  isMarketing: boolean;
  uploadedAt: string;
  uploadedByName: string | null;
}

export interface DocumentSummary {
  id: string;
  category: DocumentCategory;
  documentType: string | null;
  fileName: string;
  contentType: string;
  byteSize: number;
  expiresAt: string | null;
  notes: string | null;
  visibility: 'internal' | 'restricted';
  uploadedAt: string;
  uploadedByName: string | null;
}

// ---------------------------------------------------------------------------
// Property photographs (spec 34)
// ---------------------------------------------------------------------------

export async function uploadPropertyPhotos(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  files: File[],
  options: { isMarketing?: boolean } = {},
): Promise<number> {
  const usable = files.filter((file) => file.size > 0);
  if (usable.length === 0) {
    throw new ValidationError({ file: ['Please choose at least one photograph.'] });
  }

  const existing = await db.one<{ n: number; has_cover: boolean }>(
    `select count(*)::int as n,
            bool_or(is_cover) as has_cover
       from property_photos where property_id = $1 and not is_archived`,
    [propertyId],
  );

  let stored = 0;
  let order = existing.n;

  for (const file of usable) {
    const upload = await readUpload(file);
    const saved = await storeUpload(`properties/${propertyId}/photos`, upload, {
      imagesOnly: true,
    });
    order += 1;
    await db.query(
      `insert into property_photos
         (property_id, storage_key, file_name, content_type, byte_size,
          sort_order, is_cover, is_marketing, uploaded_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        propertyId,
        saved.storageKey,
        saved.fileName,
        saved.contentType,
        saved.byteSize,
        order,
        // The first photograph on a property becomes its cover image.
        !existing.has_cover && stored === 0,
        options.isMarketing ?? true,
        ctx.actor.id,
      ],
    );
    stored += 1;
  }

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.photos_uploaded',
    entityType: 'property',
    entityId: propertyId,
    context: { count: stored },
  });

  return stored;
}

export async function listPropertyPhotos(db: Db, propertyId: string): Promise<PhotoSummary[]> {
  const rows = await db.query<{
    id: string;
    file_name: string;
    caption: string | null;
    content_type: string;
    byte_size: number;
    sort_order: number;
    is_cover: boolean;
    is_marketing: boolean;
    uploaded_at: Date;
    uploaded_by_name: string | null;
  }>(
    `select p.id, p.file_name, p.caption, p.content_type, p.byte_size, p.sort_order,
            p.is_cover, p.is_marketing, p.uploaded_at,
            coalesce(u.display_name, u.full_name) as uploaded_by_name
       from property_photos p
       left join users u on u.id = p.uploaded_by
      where p.property_id = $1 and not p.is_archived
      order by p.is_cover desc, p.sort_order, p.uploaded_at`,
    [propertyId],
  );
  return rows.map((row) => ({
    id: row.id,
    fileName: row.file_name,
    caption: row.caption,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    isMarketing: row.is_marketing,
    uploadedAt: row.uploaded_at.toISOString(),
    uploadedByName: row.uploaded_by_name,
  }));
}

export async function setCoverPhoto(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  photoId: string,
): Promise<void> {
  const changed = await db.count(
    'update property_photos set is_cover = false where property_id = $1 and is_cover',
    [propertyId],
  );
  const applied = await db.count(
    'update property_photos set is_cover = true where id = $1 and property_id = $2',
    [photoId, propertyId],
  );
  if (applied === 0) throw new NotFoundError('That photograph');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.cover_photo_set',
    entityType: 'property',
    entityId: propertyId,
    context: { photoId, replacedPrevious: changed > 0 },
  });
}

export async function updatePhoto(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  photoId: string,
  input: { caption: string | null; isMarketing: boolean; sortOrder: number | null },
): Promise<void> {
  const applied = await db.count(
    `update property_photos
        set caption = $3, is_marketing = $4,
            sort_order = coalesce($5, sort_order)
      where id = $1 and property_id = $2`,
    [photoId, propertyId, input.caption, input.isMarketing, input.sortOrder],
  );
  if (applied === 0) throw new NotFoundError('That photograph');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.photo_updated',
    entityType: 'property',
    entityId: propertyId,
    context: { photoId },
  });
}

/** Archived, not destroyed: the file stays and stops being shown (spec 34, 104). */
export async function archivePhoto(
  db: Db,
  ctx: Ctx,
  propertyId: string,
  photoId: string,
): Promise<void> {
  const applied = await db.count(
    `update property_photos set is_archived = true, is_cover = false
      where id = $1 and property_id = $2`,
    [photoId, propertyId],
  );
  if (applied === 0) throw new NotFoundError('That photograph');
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'property.photo_archived',
    entityType: 'property',
    entityId: propertyId,
    context: { photoId },
  });
}

// ---------------------------------------------------------------------------
// Documents (spec 35, 67)
// ---------------------------------------------------------------------------

export interface DocumentLinks {
  personId?: string | null;
  propertyId?: string | null;
  companyId?: string | null;
  leadId?: string | null;
  valuationId?: string | null;
  offerId?: string | null;
  transactionId?: string | null;
  rentalApplicationId?: string | null;
  communicationId?: string | null;
  commissionId?: string | null;
  taskId?: string | null;
  appointmentId?: string | null;
}

export async function uploadDocument(
  db: Db,
  ctx: Ctx,
  input: DocumentLinks & {
    file: File;
    category: DocumentCategory;
    documentType: string | null;
    expiresAt: string | null;
    notes: string | null;
    visibility?: 'internal' | 'restricted';
  },
): Promise<string> {
  if (input.file.size === 0) {
    throw new ValidationError({ file: ['Please choose a file to upload.'] });
  }
  const anyLink = [
    input.personId, input.propertyId, input.companyId, input.leadId, input.valuationId,
    input.offerId, input.transactionId, input.rentalApplicationId, input.communicationId,
    input.commissionId, input.taskId, input.appointmentId,
  ].some(Boolean);
  if (!anyLink) {
    throw new ValidationError({
      file: ['A document has to be attached to a record. Nothing was saved.'],
    });
  }

  const upload = await readUpload(input.file);
  const folder = input.propertyId
    ? `properties/${input.propertyId}/documents`
    : input.personId
      ? `people/${input.personId}/documents`
      : `documents/${input.category}`;
  const saved = await storeUpload(folder, upload);

  const row = await db.one<{ id: string }>(
    `insert into documents
       (category, document_type, file_name, content_type, byte_size, storage_key,
        person_id, property_id, company_id, lead_id, valuation_id, offer_id,
        transaction_id, rental_application_id, communication_id, commission_id,
        task_id, appointment_id, expires_at, notes, visibility, uploaded_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
     returning id`,
    [
      input.category, input.documentType, saved.fileName, saved.contentType,
      saved.byteSize, saved.storageKey,
      input.personId ?? null, input.propertyId ?? null, input.companyId ?? null,
      input.leadId ?? null, input.valuationId ?? null, input.offerId ?? null,
      input.transactionId ?? null, input.rentalApplicationId ?? null,
      input.communicationId ?? null, input.commissionId ?? null,
      input.taskId ?? null, input.appointmentId ?? null,
      input.expiresAt, input.notes,
      input.visibility ?? (SENSITIVE_CATEGORIES.includes(input.category) ? 'restricted' : 'internal'),
      ctx.actor.id,
    ],
  );

  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'document.uploaded',
    entityType: input.propertyId ? 'property' : input.personId ? 'person' : 'document',
    entityId: input.propertyId ?? input.personId ?? row.id,
    entityLabel: saved.fileName,
    context: { category: input.category, documentId: row.id, byteSize: saved.byteSize },
  });

  return row.id;
}

export async function listDocuments(
  db: Db,
  links: DocumentLinks & { category?: DocumentCategory },
): Promise<DocumentSummary[]> {
  const where: string[] = ['not d.is_archived'];
  const params: unknown[] = [];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };

  const columns: [keyof DocumentLinks, string][] = [
    ['personId', 'person_id'],
    ['propertyId', 'property_id'],
    ['companyId', 'company_id'],
    ['leadId', 'lead_id'],
    ['valuationId', 'valuation_id'],
    ['offerId', 'offer_id'],
    ['transactionId', 'transaction_id'],
    ['rentalApplicationId', 'rental_application_id'],
    ['communicationId', 'communication_id'],
    ['commissionId', 'commission_id'],
    ['taskId', 'task_id'],
    ['appointmentId', 'appointment_id'],
  ];
  for (const [key, column] of columns) {
    const value = links[key];
    if (value) where.push(`d.${column} = ${add(value)}`);
  }
  if (links.category) where.push(`d.category = ${add(links.category)}`);

  const rows = await db.query<{
    id: string;
    category: DocumentCategory;
    document_type: string | null;
    file_name: string;
    content_type: string;
    byte_size: number;
    expires_at: Date | null;
    notes: string | null;
    visibility: 'internal' | 'restricted';
    uploaded_at: Date;
    uploaded_by_name: string | null;
  }>(
    `select d.id, d.category, d.document_type, d.file_name, d.content_type, d.byte_size,
            d.expires_at, d.notes, d.visibility, d.uploaded_at,
            coalesce(u.display_name, u.full_name) as uploaded_by_name
       from documents d
       left join users u on u.id = d.uploaded_by
      where ${where.join(' and ')}
      order by d.uploaded_at desc`,
    params,
  );

  return rows.map((row) => ({
    id: row.id,
    category: row.category,
    documentType: row.document_type,
    fileName: row.file_name,
    contentType: row.content_type,
    byteSize: Number(row.byte_size),
    expiresAt: row.expires_at?.toISOString().slice(0, 10) ?? null,
    notes: row.notes,
    visibility: row.visibility,
    uploadedAt: row.uploaded_at.toISOString(),
    uploadedByName: row.uploaded_by_name,
  }));
}

export async function archiveDocument(db: Db, ctx: Ctx, documentId: string): Promise<void> {
  const row = await db.maybeOne<{ file_name: string; category: string }>(
    'select file_name, category from documents where id = $1',
    [documentId],
  );
  if (!row) throw new NotFoundError('That document');
  await db.query('update documents set is_archived = true where id = $1', [documentId]);
  await recordAudit(db, ctx.actor, ctx.meta, {
    action: 'document.archived',
    entityType: 'document',
    entityId: documentId,
    entityLabel: row.file_name,
    context: { category: row.category },
  });
}

// ---------------------------------------------------------------------------
// Serving a file
// ---------------------------------------------------------------------------

export interface FileForDownload {
  bytes: Uint8Array;
  fileName: string;
  contentType: string;
  /** Images are shown inline; everything else is offered as a download. */
  inline: boolean;
}

/**
 * Reads one file for a user who is allowed it.
 *
 * The row lookup runs under row level security, so a reader without access
 * gets a plain "not found" and learns nothing about what exists. Opening a
 * FICA, identity or commission document is recorded as sensitive access
 * before the bytes are returned.
 */
export async function readFileForDownload(
  db: Db,
  ctx: Ctx,
  kind: 'photo' | 'document',
  id: string,
): Promise<FileForDownload> {
  if (kind === 'photo') {
    const row = await db.maybeOne<{
      storage_key: string;
      file_name: string;
      content_type: string;
    }>(
      `select storage_key, file_name, content_type
         from property_photos where id = $1 and not is_archived`,
      [id],
    );
    if (!row) throw new NotFoundError('That photograph');
    return {
      bytes: await storage().get(row.storage_key),
      fileName: row.file_name,
      contentType: row.content_type,
      inline: true,
    };
  }

  const row = await db.maybeOne<{
    storage_key: string;
    file_name: string;
    content_type: string;
    category: DocumentCategory;
    person_id: string | null;
    property_id: string | null;
  }>(
    `select storage_key, file_name, content_type, category, person_id, property_id
       from documents where id = $1 and not is_archived`,
    [id],
  );
  if (!row) throw new NotFoundError('That document');

  if (SENSITIVE_CATEGORIES.includes(row.category)) {
    await recordSensitiveAccess(db, ctx.actor, ctx.meta, {
      accessType:
        row.category === 'fica'
          ? 'FICA document opened'
          : row.category === 'commission'
            ? 'Commission document opened'
            : 'Identity document opened',
      entityType: row.property_id ? 'property' : row.person_id ? 'person' : 'document',
      entityId: row.property_id ?? row.person_id ?? id,
      // The file's name, not its contents, and never the value inside it.
      entityLabel: row.file_name,
    });
  }

  return {
    bytes: await storage().get(row.storage_key),
    fileName: row.file_name,
    contentType: row.content_type,
    // A PDF or a photo can be looked at in the browser; a spreadsheet is
    // offered as a download so it opens in the right application.
    inline: row.content_type.startsWith('image/') || row.content_type === 'application/pdf',
  };
}
