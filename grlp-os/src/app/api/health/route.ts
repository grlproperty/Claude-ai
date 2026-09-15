import { NextResponse } from 'next/server';
import { prisma } from '../../../server/db';
import { checkEnv } from '../../../lib/env';

export const dynamic = 'force-dynamic';

/**
 * Health check, for whatever is watching the container.
 *
 * It reports unhealthy when the database is unreachable or a required setting is
 * missing, because a container that answers "fine" while nobody can sign in is
 * the worst of both worlds. Missing integrations are reported but do not make it
 * unhealthy — the system is designed to run without them.
 */
export async function GET() {
  const env = checkEnv();
  let database = false;
  let databaseError: string | undefined;

  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch (e) {
    databaseError = (e as Error).message.split('\n')[0];
  }

  const healthy = env.ok && database;

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'unhealthy',
      database,
      databaseError,
      configuration: env.ok ? 'ok' : 'incomplete',
      issues: env.issues.map((i) => i.message),
      connected: env.connected,
      degraded: env.degraded,
      checkedAt: new Date().toISOString(),
    },
    { status: healthy ? 200 : 503 },
  );
}
