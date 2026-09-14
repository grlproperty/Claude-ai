import { NextResponse } from 'next/server';
import { readAsUser, withUser } from '@/lib/db.ts';
import { requestMeta, requirePermission } from '@/lib/session.ts';
import { recordAudit } from '@/lib/audit.ts';
import { batchAsCsv, getBatch } from '@/lib/ncc.ts';
import { safeFilename } from '@/lib/csv.ts';
import { toUserFacingError } from '@/lib/errors.ts';

/**
 * The batch file that a person sends to whoever performs the register check.
 *
 * Exporting is the moment client contact details leave the CRM, so it is
 * permission-checked on the server, recorded in the audit log, and the
 * filename is built rather than taken from anything a user typed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  try {
    const user = await requirePermission('NCC_ADMIN', 'NCC batch exports');

    const data = await readAsUser(user.id, async (db) => {
      const batch = await getBatch(db, id);
      if (!batch) return null;
      return { batch, csv: await batchAsCsv(db, id) };
    });

    if (!data) {
      return NextResponse.json({ error: 'That batch could not be found.' }, { status: 404 });
    }

    const meta = await requestMeta();
    await withUser(user.id, (db) =>
      recordAudit(db, { id: user.id, email: user.email }, meta, {
        action: 'ncc.batch_exported',
        entityType: 'ncc_batch',
        entityId: id,
        context: { batchRef: data.batch.batchRef, numbers: data.batch.itemCount },
      }),
    );

    return new NextResponse(data.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${safeFilename(data.batch.batchRef, 'csv')}"`,
        // It contains client contact details, so nothing may keep a copy.
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    const { message, status } = toUserFacingError(error);
    return NextResponse.json({ error: message }, { status });
  }
}
