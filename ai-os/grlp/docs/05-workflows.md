# Garden Route Lifestyle Property — workflows

Each workflow is a JSON file in `workflows/`. Every step names its responsible agent. A step with a gate stops until a named person decides. Every step is logged; a failed step fails the run, raises a priority-1 task and can be retried; a step that lacks information blocks the run and says what is missing.

## New buyer enquiry
| | |
|---|---|
| Trigger | An enquiry arrives (website, portal, email, WhatsApp, phone, walk-in) |
| Input | Name, and a phone number or email; optionally message, budget, areas, bedrooms, finance, timeframe, listing reference, marketing consent |
| Output | Scored buyer record, matched listings, owner task, approved reply, follow-up task, proposed viewing |
| Approval | Amber — the first reply to the buyer |
| Error handling | No usable contact detail → blocked with the reason. Duplicate check and tracking continue on error |

| # | Step | Agent |
|---|---|---|
| 1 | Enquiry received and buyer details captured | Buyer Lead Capture (A024) |
| 2 | Duplicate contact check | Duplicate Contact Detection (A094) |
| 3 | Requirements analysed | Buyer Requirements Analysis (A026) |
| 4 | Lead scored | Buyer Qualification (A025) |
| 5 | Suitable listings identified | Property Matching (A027) |
| 6 | Responsible agent notified | Customer Enquiry Manager (A067) |
| 7 | First reply drafted — **approval** | Website Enquiry Assistant (A068) |
| 8 | Follow-up task created | Task Management Assistant (A097) |
| 9 | Viewing proposed; scheduled when the agent confirms | Viewing Scheduling (A029) |
| 10 | CRM record updated | Data Entry Assistant (A092) |
| 11 | Lead conversion tracked | Buyer Conversion Analysis (A034) |

Lead score: budget stated 25 · cash or pre-approved 25 (bond needed 10) · buying within 3 months 20 (6 months 10) · areas given 10 · phone and email 10 (one 5) · specific listing 10. Hot from 70, warm from 40. Hot leads are to be contacted within the hour.

## New property listing
| | |
|---|---|
| Trigger | A signed mandate is captured |
| Output | Checked listing, description, SEO fields, Facebook, Instagram and WhatsApp content, a 1080 × 1080 layout, a schedule |
| Approval | Amber — the whole campaign, by Mandy or Kandy |
| Stops when | Listing facts are missing · mandate, mandatory disclosure or seller FICA is not recorded · the brand check fails |

| # | Step | Agent |
|---|---|---|
| 1 | New property entered into the system | Data Entry Assistant (A092) |
| 2 | Listing information checked; missing information identified | Listing Qualification (A013) |
| 3 | Mandate and compliance documents checked | Mandate Document Checker (A114) |
| 4 | Property description generated | Property Listing Copywriter (A039) |
| 5 | SEO information prepared | SEO Specialist (A040) |
| 6 | Social media content created | Facebook Content Creator (A042) |
| 7 | Marketing graphic layout prepared | Property Advert Designer (A058) |
| 8 | Brand consistency checked | Brand Consistency Checker (A059) |
| 9 | Agent approval requested — **approval** | Marketing Director (A037) |
| 10 | Approved content scheduled (Monday launch, Wednesday push) | Content Calendar Manager (A054) |
| 11 | Campaign performance monitoring set up | Campaign Performance Analyst (A055) |

Without Claude connected, the description is assembled from the listing facts and the lifestyle line is left for the agent to write; the approval packet says so.

## Maintenance request
Log and classify urgency (urgent: today; high: one working day; routine: three) → draft the acknowledgement — **approval**. The contractor and the spend are a person's decision.

## Daily sweep
Buyers who have gone quiet (hot 2 days, warm 5, cold 14) · leases ending within 90 days · mandates expiring within 30 days · scorecards recalculated. Raises each task once.

## Adding a workflow
Copy a JSON file, name the steps, point each at an agent and a handler in `handlers/index.mjs`, add a gate where anything leaves the business, and add a test. The system refuses to start if a step names an unknown agent, handler or action.
