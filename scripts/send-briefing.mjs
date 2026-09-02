/**
 * Sends each newly published field note to subscribers as its own campaign.
 *
 * MailerLite's API exposes no RSS-driven campaign — no campaign type and no
 * automation trigger watches a feed — so the feed cannot send itself and this
 * does it instead. Run after a deploy:
 * anything published since the last run goes out, and publishing the note is
 * therefore the act of sending it.
 *
 *   MAILERLITE_API_KEY=... npm run briefing            # dry run, changes nothing
 *   MAILERLITE_API_KEY=... npm run briefing -- --send  # create and send
 *
 * What has already gone out is not tracked in this repository. MailerLite is
 * the record: a campaign is named after the note's slug, and a note whose
 * campaign already exists is skipped. There is no state file to drift, and
 * re-running is safe.
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Overridable so the send path can be exercised against a stub without
// creating campaigns on the live account.
const API = process.env.MAILERLITE_API_BASE || 'https://connect.mailerlite.com/api';

const args = process.argv.slice(2);
const SEND = args.includes('--send');
const LIMIT = Number((args[args.indexOf('--limit') + 1] ?? 0) || 0);

const KEY = process.env.MAILERLITE_API_KEY;
if (!KEY) {
  console.error(
    'No MAILERLITE_API_KEY set.\n' +
      '\n' +
      'Create one at https://dashboard.mailerlite.com/integrations/api\n' +
      'and add it to the repository as the MAILERLITE_API_KEY secret.\n'
  );
  process.exit(1);
}

/** Campaigns are named after the note, which is how a re-run knows to skip. */
const campaignName = (note) => `Field note — ${note.slug}`;

async function api(path, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${KEY}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });

  const body = await res.text();
  let data = null;
  try {
    data = JSON.parse(body);
  } catch {
    data = null;
  }

  if (res.status === 403 && /allowed IPs/i.test(body)) {
    throw new Error(
      'MailerLite refused this address: the API key is restricted to an IP allowlist,\n' +
        '  and a CI runner never has a fixed address. Issue a second key with no IP\n' +
        '  restriction for automation, and keep the restricted one for everything else.'
    );
  }
  if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${body.slice(0, 300)}`);
  return data;
}

/**
 * Unauthenticated mail is not a style problem. Without SPF and DKIM the
 * receiving side has nothing to check the sender against, so the note lands in
 * spam or is refused outright — and a domain that sends unauthenticated mail
 * accumulates a reputation that outlasts the fix. Warned rather than enforced:
 * the account owner may be mid-setup, and refusing to send is not this script's
 * call to make.
 */
async function preflight(site) {
  const account = (await api('/account'))?.data ?? {};
  if (account.domain_auth === false) {
    console.warn(
      `\n  ! ${site.url.replace(/^https?:\/\//, '')} is not authenticated for sending in MailerLite.\n` +
        '    SPF and DKIM are unset, so this mail will be filtered or refused.\n' +
        '    Fix at https://dashboard.mailerlite.com/account/domains before relying on it.\n'
    );
  }
  const cap = account.plan?.max_subscribers;
  if (cap) console.log(`Account: ${account.plan?.name ?? 'unknown'} plan, up to ${cap} subscribers`);
}

/** Every campaign name on the account, across all statuses. */
async function existingNames() {
  const names = new Set();
  for (const status of ['draft', 'ready', 'sent']) {
    let cursor = '';
    for (;;) {
      const qs = `?limit=100&filter[status]=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const page = await api(`/campaigns${qs}`);
      for (const c of page?.data ?? []) names.add(c.name);
      cursor = page?.meta?.next_cursor ?? '';
      if (!cursor) break;
    }
  }
  return names;
}

/** The email body: the note itself, then the line back to the site. */
function emailHtml(note, site) {
  return `${note.html}
<hr>
<p><a href="${note.url}">Read this note on ${site.name}</a> — every claim links to the original source.</p>`;
}

async function main() {
  const site = JSON.parse(await readFile(join(ROOT, 'content/site.json'), 'utf8'));
  const n = site.newsletter;

  let index;
  try {
    index = JSON.parse(await readFile(join(ROOT, 'dist/briefing.json'), 'utf8'));
  } catch {
    console.error('dist/briefing.json is missing. Run `npm run build` first.');
    process.exit(1);
  }

  if (!n.group) {
    console.error('newsletter.group is not set in content/site.json — nothing to send to.');
    process.exit(1);
  }

  // The launch set all shares one publication date and is not news to anyone.
  // Only notes published strictly after the cutover are ever sent, so no
  // configuration mistake downstream can mail the back catalogue.
  const start = n.automationStart ?? '';
  const fresh = index.notes.filter((note) => note.date && start && note.date > start);
  const held = index.notes.length - fresh.length;

  console.log(`${index.notes.length} notes · ${held} predate the cutover (${start}) and are never sent`);

  await preflight(site);

  const already = await existingNames();
  let queue = fresh.filter((note) => !already.has(campaignName(note)));
  console.log(`${fresh.length} eligible · ${fresh.length - queue.length} already sent · ${queue.length} to send`);

  if (LIMIT) queue = queue.slice(0, LIMIT);

  if (!queue.length) {
    console.log('\nNothing to do.');
    return;
  }

  for (const note of queue) {
    if (!SEND) {
      console.log(`  would send: ${note.date}  ${note.title}`);
      continue;
    }

    const created = await api('/campaigns', {
      method: 'POST',
      body: JSON.stringify({
        name: campaignName(note),
        type: 'regular',
        groups: [String(n.group)],
        emails: [
          {
            subject: note.title,
            from_name: n.fromName ?? site.name,
            from: n.fromEmail ?? site.email,
            content: emailHtml(note, site),
          },
        ],
      }),
    });

    const id = created?.data?.id ?? created?.id;
    await api(`/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({ delivery: 'instant' }) });
    console.log(`  sent: ${note.title}`);
  }

  if (!SEND) console.log('\nDry run — nothing was created. Pass --send to actually send.');
}

main().catch((err) => {
  console.error(`\n${err.message}`);
  process.exit(1);
});
