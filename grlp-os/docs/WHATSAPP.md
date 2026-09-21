# WhatsApp

Mandy's WhatsApp is where a great deal of GRLP's business actually happens, and
none of it is anywhere else. This is how it gets into the system, what happens
to it once it is there, and — the part worth being plain about — what
"connecting WhatsApp" can and cannot mean.

**Nothing in this system ever sends a WhatsApp message.** That is not a setting.
There is no function anywhere in the WhatsApp code that sends, replies, reacts
or marks as read, and a test sweeps every file that touches WhatsApp to keep it
that way. Where a conversation needs an answer, the system says so, names the
person, and stops.

---

## Getting conversations in

There are three ways, and they are not equivalent. Use the first; the second is
the same thing with fewer steps; the third is only for a business number.

### 1. Drop the file on the Messages screen — works today, on her real chats

On the phone: open the chat → tap the name at the top → **Export Chat** →
**Without Media**. Send it to yourself however is convenient.

On the Messages screen: drop the file into the upload box. Both the `.txt` and
the `.zip` WhatsApp produces are understood, several at once is fine, and
re-uploading a chat you already have adds only what is new.

This reaches **her real WhatsApp, with its full history**, and changes nothing
about how she uses the app.

### 2. Mail it to the connected mailbox — the same thing, in two taps

If the GRLP mailbox is connected (`MAIL_*` in `.env`), Export Chat → **Mail**
is the whole procedure. The next mail run finds the attachment, reads it, and
imports it exactly as an upload would. `npm run mail:ingest` reports what came
in that way.

This is the closest thing to a live connection that a personal WhatsApp account
allows.

### 3. The live feed — only for a number on the WhatsApp Business *Platform*

With the `WHATSAPP_*` settings in place, `/api/whatsapp`
accepts Meta's webhook deliveries and messages arrive as they are sent. Every
delivery must carry a valid signature; unsigned or wrongly signed bodies are
discarded, and a repeated delivery — Meta retries until it gets a 200 — cannot
double a conversation.

**Read the limits before choosing this.** The Business Cloud API only ever sees
a dedicated business number registered with Meta. It cannot see a personal
account, it cannot see anything said before it was connected, and **a number
moved onto the Business API can no longer be used in the ordinary WhatsApp
app**. Moving Mandy's own number onto it would take WhatsApp off her phone.

The sensible shape, if GRLP wants a live feed, is a new office number for
business conversations, with her personal number continuing to come in by
export.

### What is deliberately not built

There are unofficial libraries that drive WhatsApp Web and can read a personal
account live. They are against WhatsApp's terms and get numbers banned. Losing
the agency's WhatsApp number is a worse outcome than exporting a chat, so that
route is not in here.

---

## What happens to a conversation

All of the reading below is rules, not a language model. It runs whether or not
`ANTHROPIC_API_KEY` is set, and it produces the same answer twice.

| | |
|---|---|
| **Who is waiting** | A question from the other side that nobody on the GRLP side answered afterwards, and for how long. |
| **What was promised** | "I'll send…", "we will…", with the date where one was given — and it stays with whoever said it. Mandy's undertaking becomes Mandy's task, not the nearest agent's. |
| **What it is about** | The same triage rules the email inbox uses, so a burst geyser is a rental matter whichever way it arrives. |
| **Who it is with** | Matched to a client on the books. |
| **What to search on** | Erf numbers, street addresses and rand amounts, pulled out as it reads. |
| **What must be done** | Tasks, with an owner chosen by the routing engine — never defaulted to Mandy. |

### Matching a conversation to a client

This is the join that makes WhatsApp a client record rather than a pile of
chats, and it is where being wrong is expensive: a conversation filed against
the wrong client puts one person's offer in another person's history, and
nobody notices until it matters.

So a link is only made automatically where there is a real reason for it:

* **The number matches.** South African numbers are compared properly —
  `082 456 7890`, `+27 82 456 7890` and the bare `27824567890` WhatsApp uses
  are one person.
* **The full name matches exactly**, and only one client does.

A surname with a first initial — "T Ndlovu" — is *offered* on the conversation
screen and never applied on its own. A first name alone is not a match at all.
Where nobody matches, the screen offers to create the client record from the
conversation, and the messages become their history.

---

## Filing

The rules are sometimes wrong, and a record nobody can correct stops being
trusted. On a conversation's own screen everything is changeable: what it is
about, how much it matters, which client and property it concerns, whose
conversation it is, and whether it is done with. Every change is reversible and
every change is written to the audit log.

**Marking a conversation Personal takes it out of everyone else's view.** Mandy's
WhatsApp carries her family as well as her clients, and the point of reading it
is to sort the business out of it, never to put the rest in front of staff. Only
the CEO — or the conversation's own owner — can see or set that.

---

## Setting up the live feed

Before anything else, there is a decision to make, because it is not reversible
in an afternoon.

### Which WhatsApp is the number on?

"WhatsApp Business" is two different products, and there is now a third
arrangement that combines them.

| | **Business App** | **Cloud API** | **Coexistence** |
|---|---|---|---|
| Replying | In the app, by a person | Only through a connected tool | In the app, by a person |
| Live feed to this system | No | Yes | Yes |
| History before connecting | By export | Not available | 1:1 chats sync |
| Group chats | Yes | No | In the app only — not synced |
| Voice and video calls | Yes | No | Yes |

**A number can normally only be on one of the first two.** Registering a number
on the Cloud API takes it out of the app: nobody can open a chat on it and type
a reply the ordinary way.

That matters here more than usual, because **this system deliberately cannot
send**. A number moved to the plain Cloud API with only this connected would
receive messages, read them, categorise and file them — and nobody would be
able to answer. Answering would need a separate inbox tool.

### Coexistence — both at once, which is what GRLP wants

Coexistence registers the number on the Cloud API **while it stays working in
the WhatsApp Business app**. Mandy keeps replying on her phone exactly as she
does now; this system receives both sides live.

That last part is the whole reason it matters. On the plain Cloud API this
system would only ever see the client's half of a conversation, so every chat
would look unanswered for ever and it would raise reply tasks for work already
done. Under Coexistence, replies typed on the phone come back as
`smb_message_echoes`, and "waiting on a reply" stays true.

What still works in the app afterwards: one-to-one messages, **voice and video
calls**, contacts, labels, quick replies, greeting and away messages, the
catalog, the business profile, and Channels. Message history for 1:1 chats
syncs both ways.

What it costs:

* **Group chats are not synced.** They keep working in the app, but the
  "New Listings and Changes" group will not reach this system. Group content
  still has to arrive by export.
* **Disappearing, view-once and live-location messages are turned off** for 1:1
  chats on that number.
* **Broadcast lists become read-only** — existing ones stay, new ones cannot be
  made.
* **Linked companion devices are unlinked** during onboarding and must be
  linked again afterwards (WhatsApp for Windows and WearOS are exempt).
* **The phone has to be used.** If the primary device goes unused for about
  fourteen days the connection drops.

### What Coexistence needs from a provider

This is the part GRLP cannot do alone. Meta's documentation is explicit:
onboarding a WhatsApp Business app user to the Cloud API requires the party
doing the onboarding to be a **Solution Partner or Tech Provider**, through
Embedded Signup. It is not available from the plain Meta developer console.

So the order of work is:

1. **Choose a provider that supports Coexistence** on a number you own, and
   that will point the webhook at a URL you nominate. Ask them plainly:
   *"Do you support Coexistence onboarding, and will you deliver `messages` and
   `smb_message_echoes` to our own webhook URL?"* If the answer to either half
   is no, they are the wrong provider for this.
2. They run Embedded Signup against +27 … and the WhatsApp Business Account.
3. They give you the **Phone Number ID** and the **App Secret** for the app the
   webhook belongs to — or they configure the webhook themselves, pointed at
   this system.
4. Fill in `.env`, run `npm run whatsapp:setup`, then `npm run whatsapp:status`.

**Subscribe to both `messages` and `smb_message_echoes`.** Subscribing to
`messages` alone is the mistake that makes the whole thing look broken: client
messages arrive, replies never do, and every conversation sits in "waiting on a
reply" for ever.

### The three values, and what they are not

Meta shows several long numbers and it is easy to confuse them. What this
system needs:

| Setting | Where it comes from | What it is **not** |
|---|---|---|
| `WHATSAPP_APP_SECRET` | Meta app → Settings → Basic → App secret | Not the App ID |
| `WHATSAPP_PHONE_NUMBER_ID` | WhatsApp → API Setup, directly under the number | **Not the telephone number** |
| `WHATSAPP_BUSINESS_NUMBER` | The number in dialling form, e.g. `+27 74 000 0000` | Not an id |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | WhatsApp → API Setup | Recorded only; never called |
| `WHATSAPP_VERIFY_TOKEN` | You invent it: `openssl rand -hex 24` | Not issued by Meta |

The one worth repeating: **the phone number id is not the phone number.** It is
a long number of Meta's own, and pasting the telephone number there produces a
webhook that verifies, delivers, and then silently matches nothing. The
Settings screen and `npm run whatsapp:status` both check for exactly that.

**No access token is needed.** Receiving messages requires only the app secret,
to prove a delivery really came from Meta. This system holds no credential that
could send a message even if someone added code to try.

### Steps

1. Put the values in `.env`. They belong there and **not in the repository** —
   this repository is public.
2. Run `npm run whatsapp:setup`. It prints the exact callback URL and verify
   token to paste into Meta, and lists anything still missing.
3. In the Meta app, under **WhatsApp → Configuration → Webhook**:
   * **Callback URL** — `https://your-host/api/whatsapp`
   * **Verify token** — the one from step 2
   * **Subscribe to** — `messages`, and `smb_message_echoes` if the number
     also runs the WhatsApp Business app
   Meta calls the URL once with the verify token before it will save the
   subscription. A wrong token is refused, and the endpoint returns 404 until
   the credentials are set, so nothing is advertised before it works.
4. Send a message to the business number, then run `npm run whatsapp:status`.

### "Connected" means Meta actually delivered something

Credentials being present is not the same as the subscription being live — the
commonest failure is a webhook that was never saved, which looks identical from
inside. So the system records the moment Meta last delivered anything, and
`whatsapp:status` reports that rather than guessing from configuration:

```
  Meta last delivered   2026/09/21, 14:02
  Last delivery: 1 message(s), 1 new.
```

Until a real delivery arrives it says so plainly.

### What the live feed sees

Only what happens after it is connected, on that one number, and only 1:1
chats. It cannot see a personal account and it cannot see group chats. Under
Coexistence the app's own 1:1 history syncs; anything older than the connection
on a plain Cloud API number, and anything said in a group, comes from exports.

### Deletions and edits

A message deleted in the app is deleted here: the conversation keeps the fact
that something was sent and withdrawn, but not its wording. An edited message
is replaced by the wording that now stands. A record that still shows what
somebody withdrew is worse than one that never had it — it is wrong, and it
looks authoritative.
