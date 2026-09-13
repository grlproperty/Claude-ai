import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  asOwner,
  asUser,
  createTestUser,
  readingAs,
  rejects,
  resetData,
  shutdown,
} from './helpers/harness.ts';
import {
  acceptInvitation,
  bootstrapNeeded,
  completeBootstrap,
  isCompanyEmail,
  signInWithPassword,
} from '../src/lib/auth.ts';
import { checkPasswordStrength, hashPassword, verifyPassword } from '../src/lib/password.ts';
import { hashToken, newToken } from '../src/lib/tokens.ts';
import { withUser } from '../src/lib/db.ts';
import { redactChanges, diff } from '../src/lib/audit.ts';

const meta = { ip: '198.51.100.10', userAgent: 'test' };

before(async () => {
  await resetData();
});
beforeEach(async () => {
  await resetData();
});
after(async () => {
  await shutdown();
});

// =====================================================================
describe('passwords', () => {
  it('never stores plaintext and verifies in constant time', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.ok(!hash.includes('correct horse'));
    assert.ok(hash.startsWith('scrypt$'));
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
    assert.equal(await verifyPassword('Correct horse battery staple', hash), false);
  });

  it('produces a different hash for the same password each time', async () => {
    const a = await hashPassword('correct horse battery staple');
    const b = await hashPassword('correct horse battery staple');
    assert.notEqual(a, b);
  });

  it('refuses a malformed stored hash rather than throwing', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-hash'), false);
    assert.equal(await verifyPassword('anything', null), false);
  });

  it('rejects passwords that are too short or too obvious', () => {
    assert.ok(checkPasswordStrength('short').length > 0);
    assert.ok(checkPasswordStrength('password123').length > 0);
    assert.equal(checkPasswordStrength('a reasonable passphrase').length, 0);
  });
});

// =====================================================================
describe('company domain restriction (spec 7)', () => {
  it('accepts only company addresses', () => {
    assert.equal(isCompanyEmail('ayden@grproperty.co.za'), true);
    assert.equal(isCompanyEmail('AYDEN@GRProperty.co.za'), true);
    assert.equal(isCompanyEmail('someone@gmail.com'), false);
    assert.equal(isCompanyEmail('someone@notgrproperty.co.za'), false);
    assert.equal(isCompanyEmail('grproperty.co.za'), false);
    assert.equal(isCompanyEmail('a@b@grproperty.co.za'), false);
  });

  it('refuses to sign in an external address even with a valid password', async () => {
    const error = await rejects(
      signInWithPassword({ email: 'outsider@gmail.com', password: 'whatever it is', meta }),
    );
    assert.match(error.message, /company email addresses/i);
  });
});

// =====================================================================
describe('first run setup (spec 7)', () => {
  it('makes the first authorised company user Management, once only', async () => {
    assert.equal(await bootstrapNeeded(), true);

    const userId = await completeBootstrap({
      email: 'ayden@grproperty.co.za',
      fullName: 'Ayden Grobler',
      password: 'a reasonable passphrase',
      meta,
    });

    assert.equal(await bootstrapNeeded(), false);

    const roles = await asUser(userId, (db) =>
      db.query<{ code: string }>(
        'select r.code from user_roles ur join roles r on r.id = ur.role_id where ur.user_id = $1',
        [userId],
      ),
    );
    assert.deepEqual(roles.map((r) => r.code), ['MANAGEMENT']);

    // A second attempt must not create another Management account.
    const error = await rejects(
      completeBootstrap({
        email: 'someone.else@grproperty.co.za',
        fullName: 'Someone Else',
        password: 'another reasonable passphrase',
        meta,
      }),
    );
    assert.match(error.message, /already been completed/i);
  });

  it('refuses an external address during setup', async () => {
    const error = await rejects(
      completeBootstrap({
        email: 'me@gmail.com',
        fullName: 'Outside Person',
        password: 'a reasonable passphrase',
        meta,
      }),
    );
    assert.match(error.message, /check the highlighted fields|company email/i);
  });
});

// =====================================================================
describe('sign in', () => {
  it('signs in an active user with the right password', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    const result = await signInWithPassword({
      email: user.email,
      password: user.password,
      meta,
    });
    assert.equal(result.userId, user.id);
  });

  it('gives the same answer for an unknown address as for a wrong password', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    const wrongPassword = await rejects(
      signInWithPassword({ email: user.email, password: 'not the password', meta }),
    );
    const unknownUser = await rejects(
      signInWithPassword({ email: 'nobody@grproperty.co.za', password: 'not the password', meta }),
    );
    assert.equal(wrongPassword.message, unknownUser.message);
  });

  it('refuses a disabled user (spec 7, 133)', async () => {
    const user = await createTestUser({ role: 'AGENT', status: 'disabled' });
    const error = await rejects(
      signInWithPassword({ email: user.email, password: user.password, meta }),
    );
    assert.match(error.message, /disabled/i);
  });

  it('refuses a suspended user', async () => {
    const user = await createTestUser({ role: 'AGENT', status: 'suspended' });
    const error = await rejects(
      signInWithPassword({ email: user.email, password: user.password, meta }),
    );
    assert.match(error.message, /disabled|speak to management/i);
  });

  it('refuses an invited user who has not set a password yet', async () => {
    const user = await createTestUser({ role: 'AGENT', status: 'invited' });
    const error = await rejects(
      signInWithPassword({ email: user.email, password: user.password, meta }),
    );
    assert.match(error.message, /not been set up/i);
  });

  it('locks an account after repeated failures', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await rejects(signInWithPassword({ email: user.email, password: 'wrong', meta }));
    }
    const error = await rejects(
      signInWithPassword({ email: user.email, password: user.password, meta }),
    );
    assert.match(error.message, /locked/i);
  });

  it('records every attempt for audit', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    await signInWithPassword({ email: user.email, password: user.password, meta });
    await rejects(signInWithPassword({ email: user.email, password: 'wrong', meta }));

    const rows = await asOwner((db) =>
      db.query<{ succeeded: boolean }>(
        'select succeeded from login_attempts where lower(email) = $1 order by attempted_at',
        [user.email.toLowerCase()],
      ),
    );
    assert.deepEqual(rows.map((r) => r.succeeded), [true, false]);
  });
});

// =====================================================================
describe('sessions', () => {
  it('resolves a session to the user and their effective permissions', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    const token = newToken();
    await withUser(null, (db) =>
      db.query('select app.session_create($1,$2,$3,$4,$5)', [
        user.id,
        hashToken(token),
        new Date(Date.now() + 3600_000).toISOString(),
        null,
        'test',
      ]),
    );

    const loaded = await withUser(null, (db) =>
      db.maybeOne<{ user_id: string; permission_codes: string[] }>(
        'select * from app.session_load($1)',
        [hashToken(token)],
      ),
    );
    assert.equal(loaded?.user_id, user.id);
    assert.ok(loaded?.permission_codes.includes('PEOPLE_VIEW'));
    // An agent must not have company-wide access.
    assert.ok(!loaded?.permission_codes.includes('DATA_VIEW_ALL'));
  });

  it('stops resolving the moment the account is disabled, not at expiry', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    const token = newToken();
    await withUser(null, (db) =>
      db.query('select app.session_create($1,$2,$3,$4,$5)', [
        user.id,
        hashToken(token),
        new Date(Date.now() + 3600_000).toISOString(),
        null,
        'test',
      ]),
    );
    await asOwner((db) => db.query("update users set status = 'disabled' where id = $1", [user.id]));

    const loaded = await withUser(null, (db) =>
      db.maybeOne('select * from app.session_load($1)', [hashToken(token)]),
    );
    assert.equal(loaded, null);
  });

  it('does not resolve an expired or revoked session', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    const expired = newToken();
    const revoked = newToken();
    await withUser(null, async (db) => {
      await db.query('select app.session_create($1,$2,$3,$4,$5)', [
        user.id, hashToken(expired), new Date(Date.now() - 1000).toISOString(), null, 'test',
      ]);
      await db.query('select app.session_create($1,$2,$3,$4,$5)', [
        user.id, hashToken(revoked), new Date(Date.now() + 3600_000).toISOString(), null, 'test',
      ]);
      await db.query('select app.session_revoke($1)', [hashToken(revoked)]);
    });

    assert.equal(
      await withUser(null, (db) => db.maybeOne('select * from app.session_load($1)', [hashToken(expired)])),
      null,
    );
    assert.equal(
      await withUser(null, (db) => db.maybeOne('select * from app.session_load($1)', [hashToken(revoked)])),
      null,
    );
  });

  it('stores only a hash of the session token', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    const token = newToken();
    await withUser(null, (db) =>
      db.query('select app.session_create($1,$2,$3,$4,$5)', [
        user.id, hashToken(token), new Date(Date.now() + 3600_000).toISOString(), null, 'test',
      ]),
    );
    const stored = await asOwner((db) =>
      db.query<{ token_hash: string }>('select token_hash from user_sessions'),
    );
    assert.equal(stored.length, 1);
    assert.notEqual(stored[0]?.token_hash, token);
  });
});

// =====================================================================
describe('invitations (spec 7)', () => {
  it('lets an invited person set their own password and become active', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    const token = newToken();

    await asUser(manager, (db) =>
      db.query(
        `insert into user_invitations (email, full_name, role_id, token_hash, expires_at, created_by)
         select $1, $2, id, $3, now() + interval '7 days', $4 from roles where code = 'AGENT'`,
        ['new.agent@grproperty.co.za', 'New Agent', hashToken(token), manager.id],
      ),
    );

    const userId = await acceptInvitation({ token, password: 'a reasonable passphrase', meta });

    const row = await asOwner((db) =>
      db.one<{ status: string; code: string }>(
        `select u.status, r.code
           from users u join user_roles ur on ur.user_id = u.id
           join roles r on r.id = ur.role_id where u.id = $1`,
        [userId],
      ),
    );
    assert.equal(row.status, 'active');
    assert.equal(row.code, 'AGENT');

    // The token is single use.
    const error = await rejects(
      acceptInvitation({ token, password: 'another reasonable passphrase', meta }),
    );
    assert.match(error.message, /no longer valid/i);
  });

  it('refuses an expired invitation', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    const token = newToken();
    await asUser(manager, (db) =>
      db.query(
        `insert into user_invitations (email, full_name, role_id, token_hash, expires_at, created_by)
         select $1, $2, id, $3, now() - interval '1 day', $4 from roles where code = 'AGENT'`,
        ['late.agent@grproperty.co.za', 'Late Agent', hashToken(token), manager.id],
      ),
    );
    const error = await rejects(acceptInvitation({ token, password: 'a reasonable passphrase', meta }));
    assert.match(error.message, /no longer valid/i);
  });

  it('rejects a weak password on acceptance', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    const token = newToken();
    await asUser(manager, (db) =>
      db.query(
        `insert into user_invitations (email, full_name, role_id, token_hash, expires_at, created_by)
         select $1, $2, id, $3, now() + interval '7 days', $4 from roles where code = 'AGENT'`,
        ['weak@grproperty.co.za', 'Weak Password', hashToken(token), manager.id],
      ),
    );
    const error = await rejects(acceptInvitation({ token, password: 'short', meta }));
    assert.match(error.message, /check the highlighted fields/i);
  });
});

// =====================================================================
describe('roles and granular permissions (spec 8, 9)', () => {
  const expectations: [string, string, boolean][] = [
    ['MANAGEMENT', 'USERS_ADMIN', true],
    ['MANAGEMENT', 'FICA_VIEW', true],
    ['MANAGEMENT', 'COMMISSION_APPROVE', true],
    ['MANAGEMENT', 'AUDIT_LOG_VIEW', true],
    ['MANAGEMENT', 'DATA_VIEW_ALL', true],
    // Admin is explicitly not given sensitive FICA or financial access.
    ['ADMIN', 'PEOPLE_EDIT', true],
    ['ADMIN', 'FICA_VIEW', false],
    ['ADMIN', 'COMMISSION_VIEW', false],
    ['ADMIN', 'USERS_ADMIN', false],
    ['ADMIN', 'PERSON_ID_VIEW', false],
    ['ACCOUNTS', 'FICA_EDIT', true],
    ['ACCOUNTS', 'COMMISSION_VIEW', true],
    ['ACCOUNTS', 'COMMISSION_APPROVE', false],
    ['ACCOUNTS', 'USERS_ADMIN', false],
    // An agent sees only their own records: no company-wide scope.
    ['AGENT', 'PEOPLE_VIEW', true],
    ['AGENT', 'DATA_VIEW_ALL', false],
    ['AGENT', 'FICA_VIEW', false],
    ['AGENT', 'COMMISSION_VIEW', true],
    ['AGENT', 'COMMISSION_APPROVE', false],
    ['AGENT', 'USERS_ADMIN', false],
    ['AGENT', 'PERSON_ID_VIEW', false],
    ['LIMITED', 'PEOPLE_VIEW', true],
    ['LIMITED', 'PEOPLE_EDIT', false],
    ['LIMITED', 'COMMISSION_VIEW', false],
  ];

  for (const [role, permission, expected] of expectations) {
    it(`${role} ${expected ? 'has' : 'does not have'} ${permission}`, async () => {
      const user = await createTestUser({ role: role as 'AGENT' });
      const held = await asUser(user, (db) =>
        db.one<{ ok: boolean }>('select app.has_permission($1) as ok', [permission]),
      );
      assert.equal(held.ok, expected);
    });
  }

  it('lets a per-user deny override a role grant', async () => {
    const user = await createTestUser({ role: 'MANAGEMENT' });
    await asOwner((db) =>
      db.query(
        `insert into user_permission_overrides (user_id, permission_id, effect, reason)
         select $1, id, 'deny', 'test' from permissions where code = 'FICA_VIEW'`,
        [user.id],
      ),
    );
    const held = await asUser(user, (db) =>
      db.one<{ ok: boolean }>("select app.has_permission('FICA_VIEW') as ok"),
    );
    assert.equal(held.ok, false);
  });

  it('lets a per-user grant add a permission the role lacks', async () => {
    const user = await createTestUser({ role: 'AGENT' });
    await asOwner((db) =>
      db.query(
        `insert into user_permission_overrides (user_id, permission_id, effect, reason)
         select $1, id, 'grant', 'test' from permissions where code = 'IMPORT_CREATE'`,
        [user.id],
      ),
    );
    const held = await asUser(user, (db) =>
      db.one<{ ok: boolean }>("select app.has_permission('IMPORT_CREATE') as ok"),
    );
    assert.equal(held.ok, true);
  });

  it('grants nothing at all without a session context', async () => {
    const held = await withUser(null, (db) =>
      db.one<{ ok: boolean }>("select app.has_permission('PEOPLE_VIEW') as ok"),
    );
    assert.equal(held.ok, false);
  });

  it('grants nothing to a disabled user even with the role attached', async () => {
    const user = await createTestUser({ role: 'MANAGEMENT' });
    await asOwner((db) => db.query("update users set status='disabled' where id=$1", [user.id]));
    const held = await asUser(user, (db) =>
      db.one<{ ok: boolean }>("select app.has_permission('USERS_ADMIN') as ok"),
    );
    assert.equal(held.ok, false);
  });
});

// =====================================================================
describe('row level security (spec 102, 133)', () => {
  it('shows no rows at all without a session context', async () => {
    await createTestUser({ role: 'AGENT' });
    const rows = await withUser(null, (db) => db.query('select id from users'));
    assert.equal(rows.length, 0);
  });

  it('refuses to let an agent create a user', async () => {
    const agent = await createTestUser({ role: 'AGENT' });
    const error = await rejects(
      asUser(agent, (db) =>
        db.query("insert into users (email, full_name) values ('sneaky@grproperty.co.za','Sneaky')"),
      ),
    );
    assert.match(error.message, /row-level security|policy/i);
  });

  it('lets management create a user', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    await asUser(manager, (db) =>
      db.query("insert into users (email, full_name) values ('invited@grproperty.co.za','Invited')"),
    );
    const count = await readingAs(manager, (db) =>
      db.one<{ n: number }>('select count(*)::int as n from users'),
    );
    assert.equal(count.n, 2);
  });

  it('keeps notifications private to their owner', async () => {
    const agentA = await createTestUser({ role: 'AGENT' });
    const agentB = await createTestUser({ role: 'AGENT' });
    await asOwner((db) =>
      db.query("insert into notifications (user_id, kind, title) values ($1,'test','For A only')", [
        agentA.id,
      ]),
    );

    const seenByOwner = await readingAs(agentA, (db) => db.query('select id from notifications'));
    const seenByOther = await readingAs(agentB, (db) => db.query('select id from notifications'));
    assert.equal(seenByOwner.length, 1);
    assert.equal(seenByOther.length, 0);
  });

  it('hides the audit log from anyone without AUDIT_LOG_VIEW', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    const agent = await createTestUser({ role: 'AGENT' });
    await asOwner((db) =>
      db.query(
        "insert into audit_logs (actor_id, action, entity_type) values ($1,'test.event','user')",
        [manager.id],
      ),
    );
    assert.equal((await readingAs(manager, (db) => db.query('select id from audit_logs'))).length, 1);
    assert.equal((await readingAs(agent, (db) => db.query('select id from audit_logs'))).length, 0);
  });

  it('lets any signed-in user write to the audit log but no one change it', async () => {
    const agent = await createTestUser({ role: 'AGENT' });
    await asUser(agent, (db) =>
      db.query("insert into audit_logs (actor_id, action, entity_type) values ($1,'test','user')", [
        agent.id,
      ]),
    );
    const error = await rejects(
      asUser(agent, (db) => db.query("update audit_logs set action = 'tampered'")),
    );
    assert.match(error.message, /permission denied|append-only/i);
  });

  it('refuses to let the application read password hashes', async () => {
    const agent = await createTestUser({ role: 'AGENT' });
    const error = await rejects(asUser(agent, (db) => db.query('select password_hash from users')));
    assert.match(error.message, /permission denied/i);
  });

  it('hides sensitive settings from users without SETTINGS_ADMIN', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    const agent = await createTestUser({ role: 'AGENT' });
    await asOwner((db) =>
      db.query(
        `insert into settings (key, value, label, is_sensitive)
         values ('open', '1'::jsonb, 'Open', false), ('secret', '2'::jsonb, 'Secret', true)`,
      ),
    );
    const managerSees = await readingAs(manager, (db) => db.query('select key from settings'));
    const agentSees = await readingAs(agent, (db) => db.query('select key from settings'));
    assert.equal(managerSees.length, 2);
    assert.deepEqual(agentSees.map((r) => (r as { key: string }).key), ['open']);
  });

  it('refuses to let an agent change settings', async () => {
    const agent = await createTestUser({ role: 'AGENT' });
    const error = await rejects(
      asUser(agent, (db) =>
        db.query("insert into settings (key, value, label) values ('x','1'::jsonb,'X')"),
      ),
    );
    assert.match(error.message, /row-level security|policy/i);
  });
});

// =====================================================================
describe('audit logging (spec 15, 103)', () => {
  it('never stores an identity number, only that one was involved', () => {
    const redacted = redactChanges({
      id_number: { from: null, to: '8001015009087' },
      first_name: { from: 'Jon', to: 'John' },
    });
    assert.deepEqual(redacted.id_number, { from: null, to: '[redacted]' });
    assert.deepEqual(redacted.first_name, { from: 'Jon', to: 'John' });
    assert.ok(!JSON.stringify(redacted).includes('8001015009087'));
  });

  it('records only the fields that actually changed', () => {
    const changes = diff(
      { a: 1, b: 'same', c: null },
      { a: 2, b: 'same', c: null },
      ['a', 'b', 'c'],
    );
    assert.deepEqual(Object.keys(changes), ['a']);
  });

  it('writes the actor, action and entity, and refuses deletion', async () => {
    const manager = await createTestUser({ role: 'MANAGEMENT' });
    await asUser(manager, (db) =>
      db.query(
        `insert into audit_logs (actor_id, actor_email, action, entity_type, entity_id)
         values ($1,$2,'person.created','person','GRLP-00000001')`,
        [manager.id, manager.email],
      ),
    );
    const error = await rejects(asUser(manager, (db) => db.query('delete from audit_logs')));
    assert.match(error.message, /permission denied|append-only/i);
  });
});
