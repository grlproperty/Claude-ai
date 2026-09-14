import { NextResponse } from 'next/server';
import { readAsUser, withUser } from '@/lib/db.ts';
import { readFileForDownload } from '@/lib/files.ts';
import { requestMeta, requireUser } from '@/lib/session.ts';
import { toUserFacingError } from '@/lib/errors.ts';
import { safeFileName } from '@/lib/storage.ts';

/**
 * The only way a stored file leaves the CRM.
 *
 * There is no static path to the storage directory. Every request is
 * authenticated, the row is found under row level security -- so a reader
 * without access gets 404 rather than the file -- and opening a FICA,
 * identity or commission document writes a sensitive access record.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ kind: string; id: string }> },
): Promise<NextResponse> {
  try {
    const { kind, id } = await params;
    if (kind !== 'photo' && kind !== 'document') {
      return NextResponse.json({ message: 'Not found' }, { status: 404 });
    }

    const user = await requireUser();
    const ctx = {
      actor: { id: user.id, email: user.email, permissions: user.permissions },
      meta: await requestMeta(),
    };

    // A photograph is only read; a document may have to be logged, which is
    // a write, so it needs a read-write transaction.
    const file =
      kind === 'photo'
        ? await readAsUser(user.id, (db) => readFileForDownload(db, ctx, kind, id))
        : await withUser(user.id, (db) => readFileForDownload(db, ctx, kind, id));

    const disposition = file.inline ? 'inline' : 'attachment';
    const name = safeFileName(file.fileName);

    return new NextResponse(new Uint8Array(file.bytes) as unknown as BodyInit, {
      status: 200,
      headers: {
        'content-type': file.contentType,
        'content-length': String(file.bytes.byteLength),
        'content-disposition': `${disposition}; filename="${name}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        // Private: never cached by a shared proxy, and not indexable.
        'cache-control': 'private, max-age=60, no-store',
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex, nofollow',
        // A stored file must never be able to run script in our origin.
        'content-security-policy': "default-src 'none'; sandbox; style-src 'unsafe-inline'",
      },
    });
  } catch (error) {
    const safe = toUserFacingError(error);
    if (safe.status >= 500) console.error(`[files] ${safe.code}: ${safe.logDetail}`);
    return NextResponse.json({ message: safe.message }, { status: safe.status });
  }
}
