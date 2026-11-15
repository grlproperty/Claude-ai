# Garden Route Lifestyle Property — implementation roadmap

Generated from `registry/source.mjs` by `npm run build`. Do not edit by hand.

**157 agent roles** in 13 departments: **33 live** (coded and tested), **104 ready** (instruction profile written; works as soon as Claude is connected for this business), **20 planned** (needs a connected application first).

Scores are 1–5. Priority = 2 × (business value + time saved + revenue potential) − 2 × complexity. They are the architect's estimates, to be corrected by management; nothing here is a measured result. Cost band is indicative monthly Claude usage for that role at expected volume: Low under about R150, Medium R150–R600, High above R600 (assumptions in `../../docs/cost-and-resource-plan.md`).

## Wave 1 — first working system (built)

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Buyer Lead Capture (GRLP-A024) | D03 | live | 5 | 5 | 5 | 1 | 28 | Low |
| Buyer Qualification (GRLP-A025) | D03 | live | 5 | 4 | 5 | 1 | 26 | Low |
| Property Matching (GRLP-A027) | D03 | live | 5 | 5 | 5 | 2 | 26 | Low |
| Lost Lead Recovery (GRLP-A035) | D03 | live | 5 | 4 | 5 | 1 | 26 | Low |
| Property Listing Copywriter (GRLP-A039) | D04 | live | 5 | 5 | 4 | 1 | 26 | Low |
| Facebook Content Creator (GRLP-A042) | D04 | live | 5 | 5 | 4 | 1 | 26 | Low |
| Instagram Content Creator (GRLP-A043) | D04 | live | 5 | 5 | 4 | 1 | 26 | Low |
| Customer Enquiry Manager (GRLP-A067) | D06 | live | 5 | 5 | 4 | 1 | 26 | Low |
| Website Enquiry Assistant (GRLP-A068) | D06 | live | 5 | 5 | 4 | 1 | 26 | Low |
| Listing Qualification (GRLP-A013) | D02 | live | 5 | 4 | 4 | 1 | 24 | Low |
| Mandate Tracking (GRLP-A017) | D02 | live | 5 | 3 | 5 | 1 | 24 | Low |
| Marketing Director (GRLP-A037) | D04 | live | 5 | 4 | 5 | 2 | 24 | Low |
| Lease Renewal Tracker (GRLP-A081) | D07 | live | 5 | 4 | 4 | 1 | 24 | Low |
| Maintenance Request Coordinator (GRLP-A084) | D07 | live | 5 | 5 | 3 | 1 | 24 | Low |
| Task Management Assistant (GRLP-A097) | D08 | live | 5 | 5 | 3 | 1 | 24 | Low |
| Mandate Document Checker (GRLP-A114) | D10 | live | 5 | 4 | 4 | 1 | 24 | Low |
| AI Managing Director (GRLP-A001) | D01 | live | 5 | 5 | 4 | 3 | 22 | Medium |
| KPI Manager (GRLP-A004) | D01 | live | 5 | 4 | 4 | 2 | 22 | Low |
| Buyer Requirements Analysis (GRLP-A026) | D03 | live | 4 | 4 | 4 | 1 | 22 | Low |
| Viewing Scheduling (GRLP-A029) | D03 | live | 4 | 5 | 4 | 2 | 22 | Low |
| Content Calendar Manager (GRLP-A054) | D04 | live | 4 | 5 | 3 | 1 | 22 | Low |
| Property Advert Designer (GRLP-A058) | D05 | live | 4 | 5 | 4 | 2 | 22 | Low |
| Brand Consistency Checker (GRLP-A059) | D05 | live | 5 | 4 | 3 | 1 | 22 | Low |
| Buyer Conversion Analysis (GRLP-A034) | D03 | live | 4 | 3 | 4 | 1 | 20 | Low |
| SEO Specialist (GRLP-A040) | D04 | live | 4 | 4 | 3 | 1 | 20 | Low |
| Data Entry Assistant (GRLP-A092) | D08 | live | 4 | 5 | 2 | 1 | 20 | Low |
| Duplicate Contact Detection (GRLP-A094) | D08 | live | 4 | 4 | 3 | 1 | 20 | Low |
| Company Knowledge Manager (GRLP-A118) | D11 | live | 5 | 4 | 2 | 1 | 20 | Low |
| Executive Reporting Agent (GRLP-A008) | D01 | live | 4 | 4 | 2 | 1 | 18 | Low |
| Campaign Performance Analyst (GRLP-A055) | D04 | live | 4 | 3 | 4 | 2 | 18 | Low |
| Internal Search Assistant (GRLP-A124) | D11 | live | 4 | 4 | 2 | 1 | 18 | Low |
| Tenant Communication Assistant (GRLP-A087) | D07 | live | 3 | 4 | 2 | 1 | 16 | Low |

## Wave 2 — core operations

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Viewing Follow-Up (GRLP-A030) | D03 | llm-ready | 5 | 4 | 5 | 1 | 26 | Low |
| Seller Follow-Up (GRLP-A012) | D02 | llm-ready | 5 | 4 | 5 | 2 | 24 | Low |
| Sales Pipeline Management (GRLP-A033) | D03 | llm-ready | 5 | 4 | 5 | 2 | 24 | Low |
| New Listing Campaign Creator (GRLP-A047) | D04 | llm-ready | 5 | 4 | 5 | 2 | 24 | Low |
| Seller Lead Generation (GRLP-A009) | D02 | llm-ready | 5 | 3 | 5 | 2 | 22 | Low |
| Seller Outreach (GRLP-A011) | D02 | llm-ready | 4 | 4 | 5 | 2 | 22 | Low |
| Valuation Preparation (GRLP-A014) | D02 | llm-ready | 4 | 4 | 5 | 2 | 22 | Low |
| Rental Enquiry Assistant (GRLP-A072) | D06 | llm-ready | 4 | 5 | 3 | 1 | 22 | Low |
| Client Follow-Up Assistant (GRLP-A075) | D06 | llm-ready | 4 | 4 | 4 | 1 | 22 | Low |
| Tenant Enquiry Manager (GRLP-A077) | D07 | llm-ready | 4 | 5 | 3 | 1 | 22 | Low |
| FICA Document Checklist Assistant (GRLP-A112) | D10 | llm-ready | 5 | 4 | 3 | 1 | 22 | Low |
| Exclusive Mandate Acquisition (GRLP-A021) | D02 | llm-ready | 5 | 3 | 5 | 3 | 20 | Medium |
| Complaint Triage Assistant (GRLP-A074) | D06 | llm-ready | 5 | 3 | 3 | 1 | 20 | Low |
| Rental Lead Manager (GRLP-A076) | D07 | llm-ready | 4 | 4 | 4 | 2 | 20 | Low |
| Tenant Document Checklist Assistant (GRLP-A079) | D07 | llm-ready | 4 | 4 | 3 | 1 | 20 | Low |
| Maintenance Follow-Up Assistant (GRLP-A085) | D07 | llm-ready | 4 | 4 | 3 | 1 | 20 | Low |
| Inspection Scheduling Assistant (GRLP-A088) | D07 | llm-ready | 4 | 4 | 3 | 1 | 20 | Low |
| Risk Identification Assistant (GRLP-A116) | D10 | llm-ready | 5 | 3 | 4 | 2 | 20 | Low |
| Creative Approval Desk (GRLP-A143) | D13 | llm-ready | 5 | 4 | 2 | 1 | 20 | Low |
| Lead Scorer (GRLP-A146) | D13 | llm-ready | 4 | 3 | 4 | 1 | 20 | Low |
| CRM Data Quality Manager (GRLP-A093) | D08 | llm-ready | 4 | 3 | 3 | 1 | 18 | Low |
| POPIA Compliance Assistant (GRLP-A111) | D10 | llm-ready | 5 | 3 | 3 | 2 | 18 | Low |
| Performance Analyst (GRLP-A003) | D01 | llm-ready | 4 | 3 | 3 | 2 | 16 | Low |
| Administrative Manager (GRLP-A090) | D08 | llm-ready | 4 | 4 | 2 | 2 | 16 | Low |
| Financial Controller Assistant (GRLP-A103) | D09 | live | 4 | 3 | 3 | 2 | 16 | Low |

## Wave 3 — marketing department

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Listing Presentation (GRLP-A016) | D02 | llm-ready | 4 | 4 | 5 | 2 | 22 | Low |
| Seller Relationship Management (GRLP-A022) | D02 | llm-ready | 4 | 4 | 4 | 2 | 20 | Low |
| Property Alert Management (GRLP-A028) | D03 | llm-ready | 4 | 4 | 4 | 2 | 20 | Low |
| Sold Campaign Creator (GRLP-A048) | D04 | llm-ready | 4 | 3 | 4 | 1 | 20 | Low |
| On Show Campaign Creator (GRLP-A049) | D04 | llm-ready | 4 | 3 | 4 | 1 | 20 | Low |
| Exclusive Mandate Campaign Creator (GRLP-A050) | D04 | llm-ready | 4 | 3 | 4 | 1 | 20 | Low |
| Social Media Graphic Designer (GRLP-A057) | D05 | llm-ready | 4 | 5 | 3 | 2 | 20 | Low |
| Marketing Operations Lead (GRLP-A138) | D13 | llm-ready | 4 | 4 | 4 | 2 | 20 | Low |
| Email Writer (GRLP-A141) | D13 | llm-ready | 4 | 4 | 3 | 1 | 20 | Low |
| Buyer Relationship Management (GRLP-A031) | D03 | llm-ready | 4 | 3 | 4 | 2 | 18 | Low |
| Marketing Strategist (GRLP-A038) | D04 | llm-ready | 4 | 3 | 4 | 2 | 18 | Low |
| Lifestyle Content Writer (GRLP-A051) | D04 | llm-ready | 4 | 4 | 2 | 1 | 18 | Low |
| Video Script Writer (GRLP-A062) | D05 | llm-ready | 3 | 4 | 3 | 1 | 18 | Low |
| Seller FAQ Assistant (GRLP-A071) | D06 | llm-ready | 3 | 4 | 3 | 1 | 18 | Low |
| Rental Application Coordinator (GRLP-A078) | D07 | llm-ready | 4 | 4 | 3 | 2 | 18 | Low |
| Landlord Reporting Assistant (GRLP-A086) | D07 | llm-ready | 4 | 4 | 3 | 2 | 18 | Low |
| Commission Forecasting Assistant (GRLP-A106) | D09 | llm-ready | 4 | 3 | 4 | 2 | 18 | Low |
| Compliance Calendar Manager (GRLP-A117) | D10 | llm-ready | 4 | 3 | 3 | 1 | 18 | Low |
| Local Area Research (GRLP-A127) | D12 | llm-ready | 4 | 4 | 3 | 2 | 18 | Low |
| Neighbourhood Farming (GRLP-A020) | D02 | llm-ready | 3 | 3 | 4 | 2 | 16 | Low |
| Social Media Strategist (GRLP-A041) | D04 | llm-ready | 4 | 3 | 3 | 2 | 16 | Low |
| LinkedIn Content Creator (GRLP-A044) | D04 | llm-ready | 3 | 3 | 3 | 1 | 16 | Low |
| Property of the Week Creator (GRLP-A045) | D04 | llm-ready | 3 | 3 | 3 | 1 | 16 | Low |
| Featured Listing Creator (GRLP-A046) | D04 | llm-ready | 3 | 3 | 3 | 1 | 16 | Low |
| Community Content Writer (GRLP-A052) | D04 | llm-ready | 4 | 4 | 2 | 2 | 16 | Low |
| Graphic Design Director (GRLP-A056) | D05 | llm-ready | 4 | 3 | 3 | 2 | 16 | Low |
| Reel Creator (GRLP-A064) | D05 | llm-ready | 3 | 4 | 3 | 2 | 16 | Low |
| Buyer FAQ Assistant (GRLP-A070) | D06 | llm-ready | 3 | 4 | 2 | 1 | 16 | Low |
| Revenue Reporting Assistant (GRLP-A108) | D09 | llm-ready | 4 | 3 | 3 | 2 | 16 | Low |
| Property Practitioner Compliance Assistant (GRLP-A113) | D10 | llm-ready | 4 | 3 | 3 | 2 | 16 | Low |
| Sales Coaching Assistant (GRLP-A122) | D11 | llm-ready | 4 | 2 | 4 | 2 | 16 | Low |
| Market Trend Analysis (GRLP-A126) | D12 | llm-ready | 4 | 3 | 4 | 3 | 16 | Medium |
| Agent Productivity Coach (GRLP-A135) | D12 | llm-ready | 4 | 2 | 4 | 2 | 16 | Low |
| Lead Form Manager (GRLP-A151) | D13 | llm-ready | 4 | 2 | 4 | 2 | 16 | Low |
| Lead Funnel Analyst (GRLP-A157) | D13 | llm-ready | 4 | 2 | 4 | 2 | 16 | Low |
| Meeting Preparation Agent (GRLP-A007) | D01 | llm-ready | 3 | 4 | 1 | 1 | 14 | Low |
| Meeting Minutes Assistant (GRLP-A096) | D08 | llm-ready | 3 | 4 | 1 | 1 | 14 | Low |
| Staff Training Assistant (GRLP-A119) | D11 | llm-ready | 3 | 3 | 2 | 1 | 14 | Low |
| Standard Operating Procedure Manager (GRLP-A120) | D11 | llm-ready | 4 | 3 | 2 | 2 | 14 | Low |
| Innovation and Automation Researcher (GRLP-A137) | D12 | llm-ready | 4 | 3 | 2 | 2 | 14 | Low |
| Office Reporting Assistant (GRLP-A101) | D08 | llm-ready | 2 | 3 | 1 | 1 | 10 | Low |

## Wave 4 — needs a connected application

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Offer Preparation Support (GRLP-A032) | D03 | llm-ready | 4 | 4 | 5 | 3 | 20 | Medium |
| WhatsApp Response Assistant (GRLP-A069) | D06 | planned | 4 | 5 | 4 | 3 | 20 | Medium |
| Rental Payment Monitor (GRLP-A082) | D07 | planned | 5 | 4 | 4 | 3 | 20 | Medium |
| Arrears Alert Assistant (GRLP-A083) | D07 | planned | 5 | 3 | 4 | 2 | 20 | Low |
| Call Booker (GRLP-A147) | D13 | planned | 4 | 4 | 5 | 3 | 20 | Medium |
| Comparable Market Analysis (GRLP-A015) | D02 | planned | 4 | 4 | 5 | 4 | 18 | High |
| Commission Tracking Assistant (GRLP-A098) | D08 | llm-ready | 4 | 3 | 4 | 2 | 18 | Low |
| Outstanding Payment Monitor (GRLP-A109) | D09 | llm-ready | 4 | 3 | 4 | 2 | 18 | Low |
| Direct Message Assistant (GRLP-A145) | D13 | planned | 4 | 4 | 4 | 3 | 18 | Medium |
| Email Sequence Builder (GRLP-A152) | D13 | llm-ready | 4 | 3 | 4 | 2 | 18 | Low |
| Lease Administration Assistant (GRLP-A080) | D07 | llm-ready | 4 | 4 | 3 | 3 | 16 | Medium |
| Document Management (GRLP-A091) | D08 | planned | 4 | 5 | 2 | 3 | 16 | Medium |
| Lead Magnet Creator (GRLP-A153) | D13 | llm-ready | 3 | 3 | 4 | 2 | 16 | Low |
| Win-Back Campaign Assistant (GRLP-A155) | D13 | llm-ready | 3 | 3 | 4 | 2 | 16 | Low |
| Image Selection Assistant (GRLP-A061) | D05 | planned | 3 | 4 | 3 | 3 | 14 | Medium |
| Property Tour Content Creator (GRLP-A065) | D05 | llm-ready | 3 | 3 | 3 | 2 | 14 | Low |
| Campaign Design Assistant (GRLP-A066) | D05 | llm-ready | 3 | 4 | 2 | 2 | 14 | Low |
| Invoice Processing Assistant (GRLP-A099) | D08 | llm-ready | 3 | 4 | 2 | 2 | 14 | Low |
| Expense Categorisation Assistant (GRLP-A100) | D08 | llm-ready | 3 | 4 | 2 | 2 | 14 | Low |
| Cash Flow Analyst (GRLP-A104) | D09 | llm-ready | 4 | 3 | 3 | 3 | 14 | Medium |
| Referral Programme Manager (GRLP-A129) | D12 | llm-ready | 3 | 2 | 4 | 2 | 14 | Low |
| Brand Reputation Monitor (GRLP-A132) | D12 | planned | 4 | 3 | 3 | 3 | 14 | Medium |
| Customer Retention Analyst (GRLP-A134) | D12 | llm-ready | 3 | 2 | 4 | 2 | 14 | Low |
| Comment Manager (GRLP-A144) | D13 | planned | 3 | 4 | 3 | 3 | 14 | Medium |
| Prospect Research (GRLP-A010) | D02 | planned | 3 | 3 | 4 | 4 | 12 | High |
| Listing Pipeline Forecasting (GRLP-A023) | D02 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Client Satisfaction Monitor (GRLP-A073) | D06 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Rental Performance Analyst (GRLP-A089) | D07 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Calendar Coordinator (GRLP-A095) | D08 | planned | 3 | 4 | 2 | 3 | 12 | Medium |
| Budget Monitoring Assistant (GRLP-A105) | D09 | llm-ready | 3 | 3 | 2 | 2 | 12 | Low |
| New Employee Onboarding Assistant (GRLP-A121) | D11 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| Audience Researcher (GRLP-A140) | D13 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Page Updater (GRLP-A150) | D13 | planned | 3 | 3 | 3 | 3 | 12 | Medium |
| Subscriber Segmentation (GRLP-A154) | D13 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Business Intelligence Agent (GRLP-A005) | D01 | llm-ready | 3 | 2 | 3 | 3 | 10 | Medium |
| Expired Listing Research (GRLP-A018) | D02 | planned | 3 | 2 | 4 | 4 | 10 | High |
| Hashtag Researcher (GRLP-A053) | D04 | llm-ready | 2 | 2 | 2 | 1 | 10 | Low |
| Expense Analysis Assistant (GRLP-A107) | D09 | llm-ready | 3 | 2 | 2 | 2 | 10 | Low |
| Marketing Training Assistant (GRLP-A123) | D11 | llm-ready | 2 | 2 | 2 | 1 | 10 | Low |
| Competitor Research (GRLP-A125) | D12 | llm-ready | 3 | 2 | 3 | 3 | 10 | Medium |
| Trend Spotter (GRLP-A139) | D13 | llm-ready | 3 | 3 | 2 | 3 | 10 | Medium |
| Rank Tracker (GRLP-A149) | D13 | planned | 3 | 2 | 3 | 3 | 10 | Medium |

## Wave 5 — expansion

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| International Buyer Assistance (GRLP-A036) | D03 | llm-ready | 3 | 2 | 4 | 3 | 12 | Medium |
| Growth Strategy Assistant (GRLP-A133) | D12 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Business Strategy Agent (GRLP-A002) | D01 | llm-ready | 3 | 2 | 3 | 3 | 10 | Medium |
| FSBO Prospecting (GRLP-A019) | D02 | planned | 3 | 2 | 4 | 4 | 10 | High |
| Financial Performance Analyst (GRLP-A110) | D09 | llm-ready | 3 | 2 | 2 | 2 | 10 | Low |
| Record Retention Assistant (GRLP-A115) | D10 | llm-ready | 3 | 2 | 2 | 2 | 10 | Low |
| Call Tracker (GRLP-A156) | D13 | planned | 3 | 2 | 3 | 3 | 10 | Medium |
| Photo Enhancement Assistant (GRLP-A060) | D05 | planned | 2 | 3 | 2 | 3 | 8 | Medium |
| Staff Administration Assistant (GRLP-A102) | D08 | llm-ready | 2 | 3 | 1 | 2 | 8 | Low |
| Partnership Opportunities (GRLP-A128) | D12 | llm-ready | 2 | 1 | 3 | 2 | 8 | Low |
| Voiceover Assistant (GRLP-A142) | D13 | llm-ready | 2 | 3 | 1 | 2 | 8 | Low |
| Business Planning Agent (GRLP-A006) | D01 | llm-ready | 2 | 2 | 2 | 3 | 6 | Medium |
| Video Editing Assistant (GRLP-A063) | D05 | planned | 2 | 3 | 2 | 4 | 6 | High |
| Business Development Research (GRLP-A130) | D12 | llm-ready | 2 | 1 | 3 | 3 | 6 | Medium |
| International Buyer Research (GRLP-A131) | D12 | llm-ready | 2 | 1 | 3 | 3 | 6 | Medium |
| Recruitment Research Assistant (GRLP-A136) | D12 | llm-ready | 2 | 1 | 2 | 2 | 6 | Low |
| Payment Link Assistant (GRLP-A148) | D13 | planned | 1 | 1 | 1 | 3 | 0 | Medium |
