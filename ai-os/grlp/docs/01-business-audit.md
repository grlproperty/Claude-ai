# Garden Route Lifestyle Property — business audit

Audited 15 November 2026. Every statement is marked **Verified** (read on the public website or in the 2026 Brand Kit), **Internal** (from GRLP's own SOPs as transcribed in earlier work on the `claude/grlp-ai-executive-os` branch — to be reconfirmed), or **Assumption**.

## Business model
| | | |
|---|---|---|
| Estate agency: property sales, long-term rentals, property management | Owner's brief; website shows sales and rentals | Verified (property management is not named on the public site) |
| Revenue from sales commission and rental/management fees | Standard for the sector | Assumption — rates not supplied and deliberately not guessed |
| Family-run, personal and professional positioning; tagline "Find Your Way Home" | Brand Kit | Verified |
| Company registration 2020/697392/07 | Website privacy policy | Verified |

## Services
Property sales (buyer and seller side), listing and marketing, long-term rentals, property management, valuations by registered practitioners. On the website: property search, Property Finder, email alerts, list-your-property, bond calculator, news.

## Customers
Sellers and landlords (supply); buyers and tenants (demand), including buyers relocating to the Garden Route and international buyers. Areas: George, Wilderness, Hoekwil, Sedgefield, Knysna, Groot Brakrivier, Hartenbos.

## Scale (Verified, website)
- 3 offices: Hoekwil/Wilderness, George, Sedgefield.
- 12 people on the team page: principal, general manager, practitioners and candidates, one rentals agent, two administrators.
- 90 properties for sale at the time of reading; first-page prices R 855 000 to R 24 950 000. Mandate types shown in listings: exclusive, sole, joint, dual.

## Existing systems
| System | Role | Basis |
|---|---|---|
| Site Creator | Website, enquiry forms, email alerts, login | Verified (footer credit) |
| Property24 (agency 35010) | Portal syndication | Verified (links, image hosts) |
| PropCntrl | CRM and listing source of truth | Internal |
| Private Property | Portal syndication | Internal |
| TPN | Tenant checks, rent invoicing | Internal |
| Dropbox | Property and transaction files | Internal |
| WhatsApp (+27 74 149 1634) | Client and internal communication | Verified number; internal use from SOP |
| Email info@grproperty.co.za on xneelo | IMAP/SMTP mailbox | Verified address; hosting Internal |
| Facebook, Instagram | Social media | Verified |
| Accounting software | Unknown | Not identified — needs confirming |

## Operational requirements
1. Every enquiry gets an owner and a fast first response.
2. Buyers are matched to stock and never allowed to go quiet unnoticed.
3. Sellers are prospected, followed up and converted to mandates against the activity targets (80 contacts → 8 valuations → 4 exclusive mandates → 2 sales per agent per month).
4. Every new mandate is checked, described, designed and marketed on brand, daily, across Facebook, Instagram, TikTok, LinkedIn and opted-in WhatsApp.
5. Rentals: leases, renewals, inspections, maintenance and payments tracked; nothing decided by software.
6. Compliance: POPIA, FICA, the Property Practitioners Act and PPRA requirements, the Rental Housing Act.
7. Management sees performance daily without assembling it by hand.

## Findings worth acting on
| # | Finding | Why it matters |
|---|---|---|
| 1 | The privacy policy's Information Officer field is blank, and the policy does not name POPIA. | POPIA expects an Information Officer to be identified. For the principal to review. |
| 2 | No PPRA or Fidelity Fund Certificate details were found on the pages read. | Commonly displayed; worth checking against PPRA display requirements. |
| 3 | Two different Facebook page addresses are linked (PropertyWilderness and PropertyWildernessHoekwil). | Splits audience and confuses the brand. |
| 4 | The site has no About or Services page; property management is not mentioned. | The service the business sells is invisible to landlords searching for it. |
| 5 | The Brand Kit strategy calls for a post every day on five platforms. | About 20 pieces a week — the single largest manual load, and the clearest case for automation. |
| 6 | The website email is on a different domain (grproperty.co.za) from the website. | Minor, but worth a consistent explanation in client-facing material. |

## Opportunities for automation, ranked
1. **Buyer enquiry handling** — capture, de-duplicate, score, match, notify, draft the reply, raise the follow-up. Built.
2. **New listing to market** — completeness and compliance check, description, SEO, captions, design layout, brand check, approval, schedule. Built.
3. **Nothing falls through the cracks** — quiet buyers, expiring mandates, lease renewals. Built.
4. **Sales performance engine** — scorecards against configurable targets. Built.
5. **Maintenance intake** — log, classify, assign, acknowledge. Built.
6. **Daily content across platforms** — needs Claude connected for writing, and a social connection for posting.
7. **Seller prospecting and follow-up** — needs Claude connected and a lawful data source.
8. **Rent and arrears monitoring, finance dashboards** — need read-only data from TPN and the accounting system.
