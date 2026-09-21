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

### 3. The live feed — only for a WhatsApp Business number

With `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` set, `/api/whatsapp`
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

Only if GRLP has a dedicated WhatsApp Business number.

1. Create a Meta app with the WhatsApp product, and register the business
   number on it.
2. Put the app secret and a verify token you invent into `.env`:
   ```sh
   WHATSAPP_APP_SECRET="from the Meta app settings"
   WHATSAPP_VERIFY_TOKEN="any long random string you choose"
   WHATSAPP_PHONE_NUMBER_ID="the id Meta shows for the number"
   ```
3. Point the webhook at `https://your-host/api/whatsapp` and subscribe to
   `messages`. Meta will call it once with the verify token; a wrong token is
   refused.

Until those are set the endpoint returns 404 rather than an error that tells the
internet something about a system it cannot use.
