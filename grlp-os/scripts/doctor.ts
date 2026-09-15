import { PrismaClient } from '@prisma/client';
import { checkEnv, describeEnv } from '../src/lib/env';

/**
 * Checks that this installation is set up correctly.
 *
 *   npm run doctor
 *
 * Run it after deploying, and whenever something is not behaving. It reports
 * what is wrong and what to do about it, rather than leaving someone to guess.
 */
async function main() {
  const report = checkEnv();
  console.log('\nGRLP Command Centre — installation check\n');
  console.log(describeEnv(report));

  if (!report.ok) process.exit(1);

  const prisma = new PrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('\nDatabase: reachable.');

    const [users, ceo, templates, approved, knowledge, contacts, properties] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { isCeo: true, active: true } }),
      prisma.template.count(),
      prisma.templateVersion.count({ where: { approvedAt: { not: null } } }),
      prisma.knowledgeDocument.count(),
      prisma.contact.count(),
      prisma.property.count(),
    ]);

    console.log(`  Staff:              ${users}${users === 0 ? '  — run npm run seed' : ''}`);
    console.log(`  Chief executive:    ${ceo}${ceo !== 1 ? '  — expected exactly one' : ''}`);
    console.log(`  Templates:          ${templates}, of which ${approved} approved${approved === 0 ? '  — no document can be generated yet' : ''}`);
    console.log(`  Knowledge documents:${String(knowledge).padStart(4)}${knowledge === 0 ? '  — run npm run import:knowledge' : ''}`);
    console.log(`  Clients:            ${contacts}`);
    console.log(`  Properties:         ${properties}${properties === 0 ? '  — import your records; the screens stay empty without them' : ''}`);

    const withPassword = await prisma.user.count({ where: { passwordHash: { not: null } } });
    if (withPassword === 0) {
      console.log('\n  Nobody can sign in yet. Set a password:');
      console.log('    npx tsx scripts/set-password.ts <email> <password>');
    }

    console.log('');
  } catch (e) {
    // Prisma's connection errors put the useful part on a later line, and
    // sometimes leave the first one blank — "NOT reachable —" with nothing after
    // it tells whoever is deploying nothing at all.
    const raw = e instanceof Error ? `${e.message}` : String(e);
    const detail = raw.split('\n').map((l) => l.trim()).filter(Boolean).slice(0, 3).join(' ') || 'no detail given';
    console.error(`\nDatabase: NOT reachable\n  ${detail}`);
    console.error('\nCheck that DATABASE_URL is right, that the database is running, and that it accepts');
    console.error('connections from here. In Docker the host is the service name — postgresql://user:pass@db:5432/grlp_os');
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
