# Feral Femme — implementation roadmap

Generated from `registry/source.mjs` by `npm run build`. Do not edit by hand.

**129 agent roles** in 12 departments: **26 live** (coded and tested), **82 ready** (instruction profile written; works as soon as Claude is connected for this business), **21 planned** (needs a connected application first).

Scores are 1–5. Priority = 2 × (business value + time saved + revenue potential) − 2 × complexity. They are the architect's estimates, to be corrected by management; nothing here is a measured result. Cost band is indicative monthly Claude usage for that role at expected volume: Low under about R150, Medium R150–R600, High above R600 (assumptions in `../../docs/cost-and-resource-plan.md`).

## Wave 1 — first working system (built)

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Product Quality Checker (FF-A081) | D08 | live | 5 | 4 | 3 | 1 | 22 | Low |
| AI Publisher (FF-A001) | D01 | live | 5 | 5 | 3 | 3 | 20 | Medium |
| Public Records Researcher (FF-A011) | D02 | live | 5 | 5 | 2 | 2 | 20 | Low |
| Source Verification (FF-A025) | D03 | live | 5 | 5 | 1 | 1 | 20 | Low |
| Field Note Writer (FF-A034) | D04 | live | 5 | 5 | 2 | 2 | 20 | Low |
| Editorial Fact Checker (FF-A043) | D04 | live | 5 | 5 | 1 | 1 | 20 | Low |
| Final Publication Reviewer (FF-A044) | D04 | live | 5 | 4 | 2 | 1 | 20 | Low |
| Website Publishing Assistant (FF-A055) | D06 | live | 5 | 5 | 2 | 2 | 20 | Low |
| Newsletter Coordinator (FF-A058) | D06 | live | 4 | 4 | 3 | 1 | 20 | Low |
| Product Development Researcher (FF-A073) | D08 | live | 4 | 3 | 4 | 1 | 20 | Low |
| Digital Product Manager (FF-A074) | D08 | live | 4 | 4 | 4 | 2 | 20 | Low |
| Product Marketing Assistant (FF-A083) | D08 | live | 4 | 3 | 4 | 1 | 20 | Low |
| Managing Editor (FF-A003) | D01 | live | 5 | 4 | 2 | 2 | 18 | Low |
| Editorial Standards Checker (FF-A005) | D01 | live | 5 | 3 | 2 | 1 | 18 | Low |
| Research Director (FF-A009) | D02 | live | 5 | 4 | 2 | 2 | 18 | Low |
| Evidence Classification (FF-A027) | D03 | live | 5 | 4 | 1 | 1 | 18 | Low |
| Research Integrity Auditor (FF-A033) | D03 | live | 5 | 4 | 1 | 1 | 18 | Low |
| Editorial Voice Checker (FF-A040) | D04 | live | 5 | 4 | 1 | 1 | 18 | Low |
| Social Media Caption Writer (FF-A061) | D06 | live | 4 | 4 | 2 | 1 | 18 | Low |
| Tool Data Verification Assistant (FF-A092) | D09 | live | 5 | 4 | 1 | 1 | 18 | Low |
| Investigation Discovery (FF-A010) | D02 | live | 4 | 3 | 2 | 1 | 16 | Low |
| Visual Essay Director (FF-A045) | D05 | live | 4 | 4 | 2 | 2 | 16 | Low |
| Product Sales Analyst (FF-A109) | D11 | live | 3 | 2 | 4 | 1 | 16 | Low |
| Archive Management Assistant (FF-A063) | D06 | live | 4 | 3 | 1 | 1 | 14 | Low |
| Research Archive Manager (FF-A110) | D11 | live | 4 | 3 | 1 | 1 | 14 | Low |

## Wave 2 — core operations

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Publishing Coordinator (FF-A006) | D01 | llm-ready | 4 | 4 | 2 | 1 | 18 | Low |
| Citation Checker (FF-A026) | D03 | llm-ready | 5 | 4 | 1 | 1 | 18 | Low |
| Editorial Planning Manager (FF-A004) | D01 | llm-ready | 4 | 3 | 2 | 1 | 16 | Low |
| Corporate Accountability Researcher (FF-A015) | D02 | llm-ready | 5 | 4 | 2 | 3 | 16 | Medium |
| Animal Welfare Researcher (FF-A016) | D02 | llm-ready | 5 | 4 | 1 | 2 | 16 | Low |
| Women's Rights Researcher (FF-A017) | D02 | llm-ready | 5 | 4 | 1 | 2 | 16 | Low |
| Statistical Verification (FF-A030) | D03 | llm-ready | 5 | 4 | 1 | 2 | 16 | Low |
| Visual Attribution Checker (FF-A051) | D05 | llm-ready | 5 | 3 | 1 | 1 | 16 | Low |
| Brand Design Manager (FF-A052) | D05 | live | 4 | 3 | 2 | 1 | 16 | Low |
| Creative Approval Desk (FF-A120) | D12 | llm-ready | 4 | 4 | 1 | 1 | 16 | Low |
| Regulatory Research Assistant (FF-A013) | D02 | llm-ready | 5 | 4 | 1 | 3 | 14 | Medium |
| Environmental Researcher (FF-A018) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Claim Verification (FF-A028) | D03 | llm-ready | 5 | 4 | 1 | 3 | 14 | Medium |
| CMS Content Manager (FF-A056) | D06 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Publishing Schedule Manager (FF-A057) | D06 | llm-ready | 3 | 4 | 1 | 1 | 14 | Low |
| Interactive Tool Manager (FF-A085) | D09 | llm-ready | 4 | 3 | 2 | 2 | 14 | Low |
| Business Operations Manager (FF-A101) | D11 | llm-ready | 4 | 3 | 2 | 2 | 14 | Low |
| AI Workforce Performance Manager (FF-A112) | D11 | llm-ready | 4 | 2 | 1 | 1 | 12 | Low |

## Wave 3 — marketing department

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Marketing Operations Lead (FF-A113) | D12 | llm-ready | 4 | 4 | 3 | 2 | 18 | Low |
| Investigative Article Writer (FF-A035) | D04 | llm-ready | 4 | 5 | 2 | 3 | 16 | Medium |
| Content Repurposing Assistant (FF-A062) | D06 | llm-ready | 4 | 4 | 2 | 2 | 16 | Low |
| On-Page SEO Assistant (FF-A067) | D07 | llm-ready | 3 | 3 | 3 | 1 | 16 | Low |
| Claims Compliance Pack Manager (FF-A075) | D08 | llm-ready | 3 | 3 | 4 | 2 | 16 | Low |
| Brand Audit Pack Manager (FF-A076) | D08 | llm-ready | 3 | 3 | 4 | 2 | 16 | Low |
| Conscious Wardrobe Product Manager (FF-A077) | D08 | llm-ready | 3 | 3 | 4 | 2 | 16 | Low |
| Research Briefing Coordinator (FF-A095) | D10 | llm-ready | 3 | 3 | 3 | 1 | 16 | Low |
| Reader Enquiry Assistant (FF-A097) | D10 | llm-ready | 3 | 4 | 2 | 1 | 16 | Low |
| Reader Feedback Analyst (FF-A099) | D10 | llm-ready | 4 | 3 | 2 | 1 | 16 | Low |
| Editorial Director (FF-A002) | D01 | llm-ready | 4 | 3 | 2 | 2 | 14 | Low |
| Fashion Industry Researcher (FF-A019) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Beauty Industry Researcher (FF-A020) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Food and Agriculture Researcher (FF-A021) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Technology Industry Researcher (FF-A022) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Consumer Rights Researcher (FF-A023) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Media and Advertising Researcher (FF-A024) | D02 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Editorial Rewriter (FF-A036) | D04 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Headline Specialist (FF-A037) | D04 | llm-ready | 3 | 3 | 2 | 1 | 14 | Low |
| Introduction and Hook Writer (FF-A038) | D04 | llm-ready | 3 | 3 | 2 | 1 | 14 | Low |
| Copy Editor (FF-A041) | D04 | llm-ready | 3 | 4 | 1 | 1 | 14 | Low |
| Grammar and Proofreading Assistant (FF-A042) | D04 | llm-ready | 3 | 4 | 1 | 1 | 14 | Low |
| Image Prompt Designer (FF-A047) | D05 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Social Media Creative Assistant (FF-A054) | D05 | llm-ready | 3 | 4 | 2 | 2 | 14 | Low |
| SEO Director (FF-A064) | D07 | llm-ready | 3 | 3 | 3 | 2 | 14 | Low |
| Keyword Researcher (FF-A065) | D07 | llm-ready | 3 | 3 | 3 | 2 | 14 | Low |
| Internal Linking Assistant (FF-A069) | D07 | llm-ready | 3 | 3 | 2 | 1 | 14 | Low |
| Certification Decoder Researcher (FF-A086) | D09 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Greenwashing Decoder Researcher (FF-A087) | D09 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Material Decoder Researcher (FF-A088) | D09 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Record Checker Researcher (FF-A089) | D09 | llm-ready | 5 | 4 | 1 | 3 | 14 | Medium |
| Trend Spotter (FF-A114) | D12 | llm-ready | 4 | 4 | 2 | 3 | 14 | Medium |
| Content Strategist (FF-A116) | D12 | llm-ready | 4 | 3 | 2 | 2 | 14 | Low |
| Academic Research Assistant (FF-A012) | D02 | llm-ready | 4 | 4 | 1 | 3 | 12 | Medium |
| Parliamentary Research Assistant (FF-A014) | D02 | llm-ready | 4 | 4 | 1 | 3 | 12 | Medium |
| Date and Timeline Verification (FF-A029) | D03 | llm-ready | 4 | 3 | 1 | 2 | 12 | Low |
| Contradictory Evidence Researcher (FF-A031) | D03 | llm-ready | 5 | 3 | 1 | 3 | 12 | Medium |
| Legal and Regulatory Source Checker (FF-A032) | D03 | llm-ready | 5 | 3 | 1 | 3 | 12 | Medium |
| Visual Archive Manager (FF-A049) | D05 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| Caption Writer (FF-A050) | D05 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| RSS Feed Monitor (FF-A059) | D06 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| Technical SEO Monitor (FF-A068) | D07 | llm-ready | 3 | 3 | 2 | 2 | 12 | Low |
| Financial Reporting Assistant (FF-A102) | D11 | llm-ready | 3 | 3 | 2 | 2 | 12 | Low |
| Expense Tracker (FF-A103) | D11 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| Workflow Automation Manager (FF-A111) | D11 | llm-ready | 4 | 3 | 1 | 2 | 12 | Low |
| Tool Quality Assurance Assistant (FF-A093) | D09 | llm-ready | 3 | 3 | 1 | 2 | 10 | Low |

## Wave 4 — needs a connected application

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Donation Management Assistant (FF-A098) | D10 | planned | 3 | 3 | 4 | 2 | 16 | Low |
| Email Writer (FF-A117) | D12 | llm-ready | 3 | 3 | 3 | 1 | 16 | Low |
| Long-Form Editor (FF-A039) | D04 | llm-ready | 4 | 4 | 1 | 2 | 14 | Low |
| Image Generation Assistant (FF-A048) | D05 | planned | 4 | 4 | 2 | 3 | 14 | Medium |
| Pricing and Revenue Analyst (FF-A082) | D08 | llm-ready | 3 | 2 | 4 | 2 | 14 | Low |
| Subscriber Management Assistant (FF-A094) | D10 | planned | 3 | 3 | 3 | 2 | 14 | Low |
| Email Sequence Builder (FF-A124) | D12 | llm-ready | 3 | 3 | 3 | 2 | 14 | Low |
| Lead Magnet Creator (FF-A125) | D12 | llm-ready | 3 | 3 | 3 | 2 | 14 | Low |
| Business Performance Analyst (FF-A007) | D01 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Infographic Designer (FF-A053) | D05 | llm-ready | 3 | 4 | 2 | 3 | 12 | Medium |
| Social Media Publisher (FF-A060) | D06 | planned | 3 | 4 | 2 | 3 | 12 | Medium |
| Website Content Optimisation Assistant (FF-A072) | D07 | llm-ready | 3 | 3 | 2 | 2 | 12 | Low |
| Sales Conversion Analyst (FF-A084) | D08 | planned | 3 | 2 | 4 | 3 | 12 | Medium |
| Where to Act Directory Manager (FF-A090) | D09 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| Reading List Researcher (FF-A091) | D09 | llm-ready | 3 | 3 | 1 | 1 | 12 | Low |
| Newsletter Performance Analyst (FF-A096) | D10 | planned | 3 | 2 | 3 | 2 | 12 | Low |
| Community Engagement Assistant (FF-A100) | D10 | llm-ready | 3 | 3 | 2 | 2 | 12 | Low |
| Revenue Dashboard Manager (FF-A104) | D11 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Donation Reporting Assistant (FF-A105) | D11 | planned | 3 | 2 | 3 | 2 | 12 | Low |
| Subscription Analytics Assistant (FF-A106) | D11 | planned | 3 | 2 | 3 | 2 | 12 | Low |
| Visual Concept Researcher (FF-A046) | D05 | llm-ready | 3 | 3 | 1 | 2 | 10 | Low |
| Search Intent Analyst (FF-A066) | D07 | llm-ready | 3 | 2 | 2 | 2 | 10 | Low |
| Schema and Metadata Assistant (FF-A070) | D07 | llm-ready | 2 | 3 | 2 | 2 | 10 | Low |
| Search Performance Analyst (FF-A071) | D07 | planned | 3 | 2 | 3 | 3 | 10 | Medium |
| Website Traffic Analyst (FF-A107) | D11 | planned | 3 | 2 | 2 | 2 | 10 | Low |
| Content Performance Analyst (FF-A108) | D11 | planned | 3 | 2 | 2 | 2 | 10 | Low |
| Audience Researcher (FF-A115) | D12 | llm-ready | 3 | 2 | 2 | 2 | 10 | Low |
| Comment Manager (FF-A121) | D12 | planned | 3 | 4 | 1 | 3 | 10 | Medium |
| Direct Message Assistant (FF-A122) | D12 | planned | 3 | 4 | 1 | 3 | 10 | Medium |
| Reader Funnel Analyst (FF-A129) | D12 | planned | 3 | 2 | 3 | 3 | 10 | Medium |
| Post Analyst (FF-A128) | D12 | planned | 3 | 2 | 2 | 3 | 8 | Medium |
| Rank Tracker (FF-A123) | D12 | planned | 2 | 2 | 2 | 3 | 6 | Medium |

## Wave 5 — expansion

| Agent | Department | Status | Value | Time | Revenue | Complexity | Priority | Cost |
|---|---|---|---|---|---|---|---|---|
| Strategic Growth Manager (FF-A008) | D01 | llm-ready | 3 | 2 | 3 | 2 | 12 | Low |
| Conscious Home Kit Manager (FF-A078) | D08 | planned | 2 | 2 | 3 | 2 | 10 | Low |
| Re-Wilding Journal Manager (FF-A079) | D08 | planned | 2 | 2 | 3 | 2 | 10 | Low |
| Greenwashing Field Guide Manager (FF-A080) | D08 | planned | 2 | 2 | 3 | 2 | 10 | Low |
| Video Maker (FF-A118) | D12 | planned | 3 | 3 | 2 | 3 | 10 | Medium |
| Voiceover Assistant (FF-A119) | D12 | llm-ready | 2 | 3 | 1 | 2 | 8 | Low |
| Subscriber Segmentation (FF-A126) | D12 | planned | 2 | 2 | 2 | 2 | 8 | Low |
| Win-Back Campaign Assistant (FF-A127) | D12 | llm-ready | 2 | 2 | 2 | 2 | 8 | Low |
