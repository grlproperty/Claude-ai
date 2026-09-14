import { NextResponse } from 'next/server';
import { assertSameOrigin } from '@/lib/csrf.ts';
import { getCurrentUser, setAgentFilter } from '@/lib/session.ts';
import { toUserFacingError } from '@/lib/errors.ts';

/**
 * Sets management's global agent view (spec 10).
 *
 * Only a user with company-wide access can hold a filter at all. For anyone
 * else the setting would be meaningless: row level security already confines
 * them to their own records.
 */
export async function POST(request: Request): Promise<NextResponse> {
  try {
    await assertSameOrigin();
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false }, { status: 401 });
    if (!user.permissions.has('DATA_VIEW_ALL')) {
      return NextResponse.json({ ok: false }, { status: 403 });
    }

    const body: unknown = await request.json();
    const agentId =
      typeof body === 'object' && body !== null && 'agentId' in body
        ? String((body as { agentId: unknown }).agentId)
        : 'all';

    await setAgentFilter(agentId === 'all' ? null : agentId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const safe = toUserFacingError(error);
    console.error(`[agent-filter] ${safe.code}: ${safe.logDetail}`);
    return NextResponse.json({ ok: false, message: safe.message }, { status: safe.status });
  }
}
