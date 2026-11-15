# Garden Route Lifestyle Property — integration register

Nothing here is assumed to work. **Status** is one of: *Built* (in this system, tested), *Connector seen* (a Claude connector for it was visible in the owner's Claude account on 15 November 2026 — not yet authorised or tested for GRLP), *To verify* (needs the supplier or an account login to confirm), *Not started*.

No live outbound connection is switched on. Approved work goes to the outbox until a connection has been tested and approved.

| Application | Purpose | Connection method | Permissions needed | Data accessed | Actions allowed | Security | Status |
|---|---|---|---|---|---|---|---|
| Claude API | Reasoning and writing | Official SDK, GRLP's own API key in its own Anthropic workspace | API key | Prompts built from GRLP knowledge and records only | Generate drafts | Key in `GRLP_ANTHROPIC_API_KEY`; usage logged per agent | Built; live calls untested (no key supplied) |
| Email (info@grproperty.co.za, xneelo) | Read enquiries; send approved replies | IMAP and SMTP | Mailbox password or app password | Enquiry emails | Read; send only after amber approval | TLS; credentials in environment | Built on the Executive OS branch against a test transport; live untested |
| WhatsApp Business | Enquiries; opted-in alerts | Meta WhatsApp Business Platform (Cloud API) | Meta Business verification, a registered number, approved message templates | Messages from clients | Read; send approved, templated messages to opted-in contacts | Opt-in records; opt-out honoured | Ingestion built on the Executive OS branch; sending To verify (template approval, costs per conversation) |
| Website (Site Creator) | Enquiry forms, listings | Email notifications from forms; any API To verify with Site Creator | — | Form submissions | Read | — | To verify |
| PropCntrl (CRM) | Listings and contacts source of truth | API or export To verify with PropCntrl | API credentials | Listings, contacts | Read first; write only after testing | Least privilege | To verify |
| Property24 / Private Property | Portal listings and leads | Syndication from the CRM; portal lead emails | — | Listing status, leads | Read | — | To verify — no agency-level public API confirmed |
| Facebook and Instagram | Publish approved posts; read insights | Meta Graph API, or a scheduling tool | Page and Instagram business permissions | Page insights | Publish only after amber approval | Page token in environment | Connector seen (Windsor.ai covers Meta and Instagram); Not started |
| TikTok, LinkedIn | Publish approved posts | Platform APIs or a scheduling tool | Business account permissions | Post analytics | Publish after approval | — | Not started |
| Canva | Finished artwork from approved layouts | Claude connector | Canva login | Brand kit, designs | Create designs for review | — | Connector seen; needs authorising |
| Dropbox | Property files; approved templates | Claude connector or Dropbox API | Scoped app folder | Templates, file presence | Read; file approved documents | Scoped token | Connector seen; importer built on the Executive OS branch |
| Google Calendar | Viewings and valuations | Claude connector | Calendar scope | Events | Create events after confirmation | — | Connector seen; which calendar GRLP uses is To verify |
| TPN | Rent payments, tenant checks | To verify with TPN | — | Payment status (read-only) | Read | Read-only | To verify |
| Accounting software | Finance dashboards | Depends on the package (QuickBooks connector seen; Xero connector failed to connect) | Read-only | Income, expenses | Read | Read-only | To verify which package GRLP uses |
| Payment providers | — | — | — | — | None. The system never initiates a payment | — | Out of scope by design |

## Order of connection
1. Claude API key (unlocks 104 agents).
2. Email in (enquiries reach the workflow without retyping).
3. Listing data from PropCntrl (real stock for matching).
4. Facebook and Instagram publishing (after a month of approved posts through the outbox).
5. WhatsApp, calendar, TPN, accounting.
