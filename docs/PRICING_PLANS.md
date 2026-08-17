# Vocaply — Official Pricing & Plan Specifications
> **Document Type:** Production Pricing Specification  
> **Author:** Principal Technical Documentation Writer  
> **Target System:** Vocaply AI Meeting Intelligence Platform  
> **Status:** Active / Production Ready

---

## 1. Overview & Pricing Philosophy

Vocaply employs a **Flat Team-Based Pricing Model** combined with **Usage-Gated Tiers**. 

### Key Architectural & Commercial Principles:
1. **Zero Seat Anxiety:** Traditional per-seat pricing deters team adoption and viral growth. Vocaply charges a flat monthly rate per team tier, encouraging managers to onboard all engineers, designers, and product owners without incremental line-item friction.
2. **Usage-Based Infrastructure Alignment:** System cost overhead is primarily driven by processed meeting minutes (AI transcription, LLM pipeline processing, and vector indexing) rather than raw user accounts. Tier boundaries align directly with meeting volume limits.
3. **High ROI Ratio:** A team saving 2.5 hours per engineer every week achieves a 5x–20x ROI on even the highest flat monthly tier.

---

## 2. Plan Tier Matrix Overview

| Metric / Plan | **FREE** | **STARTER** | **GROWTH** *(Hero)* | **BUSINESS** | **ENTERPRISE** |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Monthly Cost** | **$0** | **$49 / mo** | **$99 / mo** | **$199 / mo** | **Custom ($500+)** |
| **Annual Cost** | **$0** | **$39 / mo** | **$79 / mo** | **$159 / mo** | Custom |
| **Team Members** | Up to 3 | Up to 10 | Up to 25 | Up to 60 | Unlimited |
| **Meetings Limit** | 5 / month | 40 / month | 120 / month | 300 / month | Unlimited |
| **History Retention** | 7 Days | 90 Days | 1 Year | Unlimited | Unlimited |
| **Workspaces** | 1 | 1 | 1 | Up to 5 | Unlimited |
| **Support Level** | Community | Email (48h) | Priority (24h) | Dedicated Channel | 24/7 SLA + Dedicated AM |

---

## 3. Detailed Plan Features & Specifications

### 3.1. Free Plan (`$0 / month`)
*Designed for small teams testing core AI meeting extraction workflows and individual trial validation.*

* **Included Features:**
  * **Bot Integrations:** Auto-joins Zoom, Google Meet, and Microsoft Teams.
  * **Core AI Pipeline:** Basic extraction of action items, decisions, and commitment tracking.
  * **Integrations:** Slack integration (single workspace channel).
  * **Calendar Sync:** Google Calendar auto-detection.
  * **Transcripts:** Basic searchable transcript viewer (7-day storage retention).
* **Limitations:**
  * Max 3 team members.
  * Max 5 recorded meetings per month.
  * 7-day data retention limit.
  * No Jira, Linear, or Notion task sync.
  * No analytics dashboards or digest exports.

---

### 3.2. Starter Plan (`$49 / month` or `$39 / month annual`)
*Optimized for early-stage startups and small engineering squads (3–10 members).*

* **Included Features:**
  * **Everything in Free**, plus:
  * **Capacity:** Up to 10 team members and 40 meetings/month (~2 meetings per working day).
  * **Retention:** 90 days searchable transcript and commitment history.
  * **Full Integration Suite:** Direct bi-directional sync with **Jira**, **Linear**, **Notion**, and **Slack**.
  * **Automated Reminders:** Slack DMs and Email notifications for approaching or missed commitments.
  * **AI Drafts:** Automated follow-up email and action-item digest generator post-meeting.
  * **Basic Analytics:** Member commitment completion rates and tracking dashboard.
  * **Support:** Priority Email Support (48-hour SLA).

---

### 3.3. Growth Plan (`$99 / month` or `$79 / month annual`) — ⭐ *Hero / Most Popular Plan*
*Engineered for fast-growing product and engineering teams (10–25 members).*

* **Included Features:**
  * **Everything in Starter**, plus:
  * **Capacity:** Up to 25 team members and 120 meetings/month (~6 meetings per working day).
  * **Retention:** 1-year historical transcript and analytics retention.
  * **Advanced Analytics & Health:** Interactive team health dashboard, velocity trends, and commitment confidence scores powered by Recharts.
  * **Manager Digest:** Automated weekly Sunday manager summary highlighting risks, blockers, and completed commitments across all meetings.
  * **Expanded Integrations:** GitHub and Asana integration support.
  * **Multi-Meeting Types:** Standups, sprint reviews, client syncs, and 1:1 classification models.
  * **Export Capabilities:** Full CSV data export for internal reporting.
  * **Support:** Priority Support (24-hour response via Email & Slack).

---

### 3.4. Business Plan (`$199 / month` or `$159 / month annual`)
*Built for scaling organizations and multi-team setups (25–60 members).*

* **Included Features:**
  * **Everything in Growth**, plus:
  * **Capacity:** Up to 60 team members and 300 meetings/month (~15 meetings per working day).
  * **Retention:** Unlimited historical storage and transcript searchability.
  * **Multi-Workspace Support:** Manage up to 5 distinct team workspaces under a single billing account.
  * **Developer Ecosystem:** Full REST API access & Webhook event subscriptions for custom internal tooling.
  * **Audit & Compliance:** Detailed audit logs (tracking access, edits, and export actions).
  * **Custom AI Rules:** Custom commitment category tagging and prompt fine-tuning parameters.
  * **Support:** Dedicated Slack support channel + quarterly business review (QBR) calls.

---

### 3.5. Enterprise Plan (`Custom starting at $500 / month` - *Annual Only*)
*Designed for security-conscious, enterprise-scale orgs (60+ members).*

* **Included Features:**
  * **Everything in Business**, plus:
  * **Capacity & Limits:** Unlimited team members, meetings, and workspaces.
  * **Security & SSO:** SAML 2.0, Okta, Azure AD, and Google Workspace Single Sign-On (SSO) + SCIM auto-provisioning.
  * **Data Privacy & Governance:** SOC 2 Type II compliance reports, custom GDPR Data Processing Agreements (DPA), HIPAA compliance options, and dedicated single-tenant database deployment options.
  * **Custom AI Pipelines:** Dedicated high-throughput processing pipeline with zero data retention for LLM training models.
  * **Support & Service Level:** 99.9% Uptime SLA, 4-hour emergency response SLA, and a dedicated Technical Account Manager (TAM).

---

## 4. Feature Comparison Matrix

| Feature | **FREE** | **STARTER** | **GROWTH** | **BUSINESS** | **ENTERPRISE** |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Max Team Members** | 3 | 10 | 25 | 60 | Unlimited |
| **Monthly Meetings** | 5 | 40 | 120 | 300 | Unlimited |
| **History Retention** | 7 Days | 90 Days | 1 Year | Unlimited | Unlimited |
| **Zoom / Meet / Teams Bot** | Yes | Yes | Yes | Yes | Yes |
| **Slack Integration** | Basic | Full | Full | Full | Full |
| **Jira / Linear / Notion** | No | Yes | Yes | Yes | Yes |
| **GitHub / Asana** | No | No | Yes | Yes | Yes |
| **REST API & Webhooks** | No | No | No | Yes | Yes |
| **Weekly Manager Digest** | No | No | Yes | Yes | Yes |
| **Team Health Dashboard** | No | No | Yes | Yes | Yes |
| **CSV Data Export** | No | No | Yes | Yes | Yes |
| **Multi-Workspace** | 1 | 1 | 1 | Up to 5 | Unlimited |
| **SAML / Okta SSO** | No | No | No | No | Yes |
| **SCIM Provisioning** | No | No | No | No | Yes |
| **Custom SLA & TAM** | No | No | No | No | Yes |

---

## 5. Add-On Options

For organizations requiring modular extensions beyond their tier boundaries:

* **Extra Meeting Credits Pack:** $15 per additional 20 meetings / month.
* **Additional Workspace:** $29 / month per additional workspace (Growth & Business plans).
* **Extended Transcript Storage:** $19 / month for perpetual archive expansion.

---

> *For complete financial forecasts, unit economics, infrastructure expenditure models, and competitor benchmarks, refer to internal documentation at [docs/pricing.md](file:///home/uzair/vocaply-system/docs/pricing.md).*
