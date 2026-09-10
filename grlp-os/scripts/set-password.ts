import { PrismaClient } from '@prisma/client';
import { hashPassword, revokeAllSessions } from '../src/server/auth';

/**
 * Sets a person's password.
 *
 *   npx tsx scripts/set-password.ts <email> <password>
 *
 * Every existing session for that person is revoked, so a password change also
 * signs out anyone already holding a session for the account.
 */
async function main() {
  const [email, password] = process.argv.slice(2);
  if (!email || !password) {
    console.error('Usage: npx tsx scripts/set-password.ts <email> <password>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      console.error(`No user with the email ${email}.`);
      process.exit(1);
    }
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(password) } });
    const revoked = await revokeAllSessions(user.id);
    console.log(`Password set for ${user.name}. ${revoked} existing session(s) revoked.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
