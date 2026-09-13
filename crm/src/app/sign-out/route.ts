import { NextResponse } from 'next/server';
import { assertSameOrigin } from '@/lib/csrf.ts';
import { endSession } from '@/lib/session.ts';

export async function POST(request: Request): Promise<NextResponse> {
  await assertSameOrigin();
  await endSession();
  return NextResponse.redirect(new URL('/sign-in', request.url), { status: 303 });
}
