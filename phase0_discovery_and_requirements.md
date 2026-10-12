# Phase 0 — Discovery, Environment Inspection & Requirements Gathering

**Project:** Multi-Tenant SaaS Workspace with Resource Quota Management  
**Date:** 2026-10-12  
**Status:** Awaiting your answers before finalizing the Implementation Plan

---

## 1. Project Understanding Summary

You are building a **genuine, cloud-deployed Multi-Tenant SaaS application** for your Cloud Computing FT-III academic project. The system will allow:

- **Multiple organizations** to share a single application instance while maintaining strict tenant isolation.
- **Authentication** via Firebase (email/password, optionally Google sign-in).
- **Role-Based Access Control** (at minimum: Admin and Member per organization).
- **Project management** within each organization (CRUD).
- **Configurable resource quotas** per organization (e.g., max members, max projects).
- **Usage analytics dashboards** showing quota consumption and activity.
- **Secure API backend** on AWS (API Gateway + Lambda + DynamoDB).
- **Frontend deployment** on Vercel, **backend** on AWS, **authentication** on Firebase — a deliberate multi-cloud architecture demonstrating cloud computing concepts.

The project must satisfy three FT-III assessment areas: Problem Analysis & Cloud Design, Implementation & Technical Execution, and Results & Technical Evaluation.

---

## 2. Environment Inspection Results

### ✅ Verified Tools & Prerequisites

| Tool / Runtime | Version | Status |
|---|---|---|
| **Operating System** | Windows 11 Home Single Language (NT 10.0.26200.0) | ✅ Ready |
| **Available Disk Space** | ~30.8 GB free on C: | ✅ Sufficient |
| **Node.js** | v22.14.0 | ✅ Ready |
| **npm** | 10.9.2 | ✅ Ready |
| **npx** | 10.9.2 | ✅ Ready |
| **Python** | 3.11.7 | ✅ Ready |
| **pip** | 23.2.1 | ✅ Ready |
| **Git** | 2.49.0.windows.1 | ✅ Ready |
| **Git user.name** | Dinesh Konda | ✅ Configured |
| **Git user.email** | dineshkonda919@gmail.com | ✅ Configured |
| **AWS CLI** | 2.33.7 | ✅ Installed |
| **Vercel CLI** | 63.1.2 (via npx) | ✅ Available |

### ⚠️ Items Requiring Attention

| Item | Status | Action Needed |
|---|---|---|
| **AWS CLI Credentials** | ❌ Not configured (no profile, access key, secret key, or region set) | You need to configure credentials — see questionnaire Section B |
| **AWS SAM CLI** | ❌ Not installed (`sam` command not found) | Needs installation if we proceed with SAM for IaC — or we evaluate alternatives |
| **Firebase CLI** | ❌ Not installed or not functional (exit code 1) | Needs installation: `npm install -g firebase-tools` |
| **Git Repository** | ❌ Workspace is not a Git repo yet (no `.git` directory) | Will initialize after plan approval |
| **Workspace** | ✅ Empty directory — clean starting point | No existing code to preserve |

### ℹ️ Unknown / Needs Confirmation

| Item | Status |
|---|---|
| AWS account existence & credit balance | Unknown — needs your confirmation |
| AWS IAM permissions available | Unknown |
| Firebase project existence | Unknown |
| Vercel account & GitHub connection | Unknown |
| GitHub repository (new vs existing) | Unknown |

---

## 3. Account & Access Readiness Checklist

### AWS

| # | Checkpoint | Status |
|---|---|---|
| 1 | AWS account exists | ❓ Unconfirmed |
| 2 | You can access the AWS Management Console | ❓ Unconfirmed |
| 3 | Account has active credits (~$100 mentioned) | ❓ Unconfirmed — need balance, expiration, eligible services |
| 4 | Account type (personal / AWS Academy / organizational) | ❓ Unconfirmed |
| 5 | AWS CLI credentials can be configured locally | ❓ Not yet configured |
| 6 | IAM permissions sufficient for Lambda, API Gateway, DynamoDB, CloudWatch, IAM | ❓ Unknown |
| 7 | Preferred AWS region selected | ❓ Unconfirmed |

### Firebase

| # | Checkpoint | Status |
|---|---|---|
| 1 | Google account available for Firebase | ❓ Likely yes (Gmail visible in Git config) — needs confirmation |
| 2 | Firebase project exists | ❓ Unconfirmed |
| 3 | Firebase Authentication enabled | ❓ Unconfirmed |
| 4 | Firebase billing plan (Spark free / Blaze pay-as-you-go) | ❓ Unconfirmed |

### Vercel

| # | Checkpoint | Status |
|---|---|---|
| 1 | Vercel account exists | ❓ Unconfirmed |
| 2 | Vercel connected to GitHub | ❓ Unconfirmed |
| 3 | Using Hobby (free) plan | ❓ Unconfirmed |
| 4 | Custom domain needed or Vercel subdomain acceptable | ❓ Unconfirmed |

### GitHub

| # | Checkpoint | Status |
|---|---|---|
| 1 | GitHub account exists | ❓ Likely yes (Git email configured) — needs confirmation |
| 2 | New or existing repository | ❓ Unconfirmed |
| 3 | Public or private repository | ❓ Unconfirmed |
| 4 | GitHub authentication working locally | ❓ Unconfirmed |

---

## 4. Requirements Questionnaire

Please answer each question below. Where I've included a **recommended answer** (marked with ⭐), that reflects what I believe is the most practical choice for an academic FT-III project — but the final decision is yours.

---

### A. Project & Feature Requirements

**A1.** Is this project for you individually, or does it have multiple team members?  
⭐ *Expected: Individual project*

**A2.** Should any registered user be able to create an organization, or only a platform-level administrator?  
⭐ *Recommended: Any registered user can create an organization (simpler, demonstrates multi-tenancy well)*

**A3.** Does the application need a **platform-level super administrator** (someone who can view/manage all organizations)?  
⭐ *Recommended: No — adds significant complexity without strong academic value for FT-III. Can be discussed as a future enhancement.*

**A4.** Can an organization administrator **invite members** to the organization? If yes, how?  
Options:
- (a) Admin generates an invite code/link that a registered user enters to join.
- (b) Admin sends an email invitation.
- (c) Admin directly adds a user by their email (user must already be registered).
- (d) Not required for MVP — users join via invite code only.

⭐ *Recommended: Option (c) or (a) — keeps scope manageable. Email invitations (b) require an email-sending service and add cost/complexity.*

**A5.** Is **email/password authentication** sufficient for the initial version?  
⭐ *Recommended: Yes — email/password only for MVP*

**A6.** Is **Google sign-in** required?  
⭐ *Recommended: No for MVP. Can be added later as an enhancement if time permits — Firebase makes it straightforward.*

**A7.** Beyond **Admin** and **Member**, are additional organization roles needed (e.g., Viewer, Editor, Billing Admin)?  
⭐ *Recommended: Two roles (Admin, Member) for MVP. Document the architecture as extensible to additional roles.*

**A8.** Can organization administrators independently **configure quotas** for their own organization, or are quotas set at the platform level?  
⭐ *Recommended: Platform-defined quota tiers (e.g., Free, Standard) assigned per organization. Admins can view but not arbitrarily change them. This demonstrates quota management without adding a full billing system.*

**A9.** Which **resource types** should quotas cover?  
Candidates:
- Maximum members per organization
- Maximum projects per organization
- Maximum storage per organization (only relevant if file uploads are included)
- API request rate limits

⭐ *Recommended for MVP: Max members + Max projects. Storage quotas only if file uploads are included.*

**A10.** Confirm that **Project CRUD** (Create, Read, Update, Delete) is required within each organization.  
⭐ *Expected: Yes*

**A11.** Are **file uploads** required in the initial version?  
⭐ *Recommended: No — file uploads require S3, presigned URLs, storage quota tracking, and virus scanning considerations. This significantly increases scope and cost. Better as a documented future enhancement.*

**A12.** Which of the following are required for the initial version?
- [ ] Email invitations (requires email-sending service)
- [ ] In-app notifications
- [ ] Audit logs (who did what, when)
- [ ] Exportable reports / PDF generation

⭐ *Recommended for MVP: Basic audit logging (stored in DynamoDB, viewable in dashboard). The others are optional enhancements.*

**A13.** Do you have any **design references**, preferred UI style, or branding requirements?  
⭐ *If not, I'll propose a clean, professional dark/light SaaS dashboard style using Bootstrap 5 with a modern color scheme.*

---

### B. AWS Account & Access

**B1.** Do you have an existing AWS account?

**B2.** What type of account is it?
- (a) Personal AWS account (your own credit card)
- (b) AWS Academy / AWS Educate (provided by your institution)
- (c) AWS Organization sub-account
- (d) Other — please describe

> [!IMPORTANT]
> The account type determines which services, regions, and IAM permissions are available. AWS Academy accounts, for example, often restrict IAM role creation and limit available regions.

**B3.** You mentioned approximately **$100 in AWS credits**. Can you confirm:
- The current credit balance (visible in AWS Billing Console → Credits)?
- The credit expiration date?
- Whether the credits are general-purpose or restricted to specific services?

**B4.** Can you log into the **AWS Management Console** via a web browser?

**B5.** What is your **preferred AWS region**? If none, I'll recommend `ap-south-1` (Mumbai) for lowest latency from your location, or `us-east-1` (N. Virginia) for broadest service availability and free-tier coverage.

**B6.** Regarding AWS CLI configuration: The CLI is installed but has **no credentials configured**. I will guide you through configuring it securely — I will **not** ask you to paste credentials here. Which of these applies?
- (a) I can create my own IAM user / access keys in the console.
- (b) My institution provides temporary credentials (e.g., AWS Academy Learner Lab).
- (c) I use AWS IAM Identity Center (SSO).
- (d) I'm not sure — please guide me.

**B7.** Are there any known restrictions on your account (e.g., cannot create IAM roles, cannot access certain services, region-locked)?

---

### C. Firebase

**C1.** Do you have a Google account available for Firebase? *(Your Git config shows a Gmail address — can you use this?)*

**C2.** Have you already created a **Firebase project** for this application?

**C3.** If a Firebase project exists, is **Firebase Authentication** already enabled?

**C4.** Which Firebase plan are you on?
- (a) **Spark** (free) — sufficient for Authentication with email/password
- (b) **Blaze** (pay-as-you-go) — required if we ever need Cloud Functions or higher auth quotas

⭐ *Recommended: Spark plan is sufficient for MVP. Firebase Auth email/password is free on Spark. We do NOT need Firebase Cloud Functions — all backend logic runs on AWS Lambda.*

**C5.** Do you need **email verification** on registration and **password reset** functionality?  
⭐ *Recommended: Yes for both — Firebase provides these out of the box with no additional cost.*

---

### D. Vercel

**D1.** Do you have a **Vercel account**?

**D2.** If yes, is it on the **Hobby (free)** plan?

**D3.** Is your Vercel account connected to your **GitHub** account?

**D4.** Can you use a **Vercel-provided subdomain** (e.g., `your-project.vercel.app`), or do you need a custom domain?  
⭐ *Recommended: Vercel subdomain is sufficient for an academic project.*

---

### E. GitHub

**E1.** Do you have a **GitHub account**? *(Likely yes based on your Git configuration)*

**E2.** Should I plan for a **new repository** or do you have an existing one for this project?

**E3.** Should the repository be **public** or **private**?  
⭐ *Recommended: Private — keeps your academic work and any configuration details non-public.*

**E4.** Is **Git authentication** working on this machine (can you `git push` to GitHub without issues)?

---

### F. Scope & Timeline

**F1.** What is your **submission deadline** for the FT-III project?

**F2.** Approximately how many hours per day/week can you dedicate to this project?

**F3.** Does your FT-III evaluation require a **live demo**, a **recorded video**, a **written report**, a **presentation**, or some combination?

**F4.** Are there specific **academic rubric criteria** or a marking scheme you can share? This helps me ensure the architecture and documentation directly address every graded item.

---

## 5. Preliminary Architecture Proposal

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER'S BROWSER                          │
│  React + TypeScript + Bootstrap + React Router + Chart.js      │
└─────────────┬───────────────────────────────────┬───────────────┘
              │ Firebase Auth SDK                 │ HTTPS API Calls
              │ (login, signup, token refresh)     │ (Bearer: Firebase ID Token)
              ▼                                   ▼
┌──────────────────────┐           ┌──────────────────────────────┐
│   Firebase Auth      │           │   Amazon API Gateway         │
│   (Google Cloud)     │           │   (HTTP API)                 │
│                      │           │                              │
│  • Email/Password    │           │  • JWT Authorizer or         │
│  • ID Token Issuance │           │    Lambda Authorizer          │
│  • Email Verification│           │  • CORS Configuration        │
│  • Password Reset    │           │  • Rate Limiting             │
└──────────────────────┘           └──────────────┬───────────────┘
                                                  │
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │   AWS Lambda Functions       │
                                   │                              │
                                   │  • Token Verification        │
                                   │  • Org Management            │
                                   │  • Membership & RBAC         │
                                   │  • Project CRUD              │
                                   │  • Quota Enforcement         │
                                   │  • Usage Analytics           │
                                   └──────────────┬───────────────┘
                                                  │
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │   Amazon DynamoDB            │
                                   │                              │
                                   │  • Users / Profiles          │
                                   │  • Organizations             │
                                   │  • Memberships               │
                                   │  • Projects                  │
                                   │  • Quotas                    │
                                   │  • Audit Log (optional)      │
                                   └──────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT                                  │
│  Frontend: Vercel (Hobby) ← GitHub auto-deploy                 │
│  Backend:  AWS (API GW + Lambda + DynamoDB) via SAM/CloudForm. │
│  Auth:     Firebase (Spark plan)                                │
│  Monitoring: CloudWatch (basic)                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Key Integration Risk: Firebase ID Token Validation at API Gateway

This is the most critical integration point to validate before finalizing the architecture.

**The challenge:** Firebase ID tokens are standard RS256 JWTs, but they use **Google's rotating public keys** served via a JWKS endpoint. Amazon API Gateway's built-in **JWT authorizer** (for HTTP APIs) supports JWKS — however, there are specific considerations:

| Aspect | Detail |
|---|---|
| **Issuer** | `https://securetoken.google.com/<firebase-project-id>` |
| **Audience** | Your Firebase project ID |
| **JWKS URI** | `https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com` |
| **API GW JWT Authorizer** | Supports `issuerUrl` and `audience` — should work with Firebase |
| **Risk** | Some edge cases with custom claims, token refresh timing, or JWKS caching have been reported. Need to verify in practice. |

**Proposed approach (to be validated):**

1. **Primary:** Use API Gateway's native JWT authorizer. This is zero-cost, low-latency, and requires no Lambda cold starts for auth.
2. **Fallback:** If the native authorizer proves insufficient (e.g., if we need to check organization membership or custom claims during authorization), implement a **Lambda authorizer** that uses the Firebase Admin SDK (Python) to verify tokens and check tenant context.
3. **Hybrid (recommended):** Use the native JWT authorizer for authentication (signature, issuer, audience, expiry) and perform **authorization checks** (org membership, role, quota) inside the business-logic Lambda functions. This gives us both performance and flexibility.

> [!WARNING]
> I will validate this integration during Phase 5–6 before committing to a final approach. If the native JWT authorizer has limitations with Firebase tokens, I will inform you and propose the alternative before proceeding.

---

## 6. Information Still Needed Before Finalizing the Plan

| # | Information Required | Why It's Needed |
|---|---|---|
| 1 | Answers to questionnaire sections A–F | To finalize scope, features, and architecture |
| 2 | AWS account type & credit details | To confirm service availability, region, and cost constraints |
| 3 | AWS CLI credential configuration status | To enable local development and deployment |
| 4 | Firebase project status | To plan authentication setup |
| 5 | Vercel & GitHub account status | To plan deployment pipeline |
| 6 | FT-III deadline & evaluation criteria | To prioritize features and documentation |
| 7 | Any academic rubric or marking scheme | To ensure the plan maps to graded criteria |

---

## 7. Actions I Will NOT Take Without Your Approval

I commit to the following safety gates:

| Action | Requires Your Approval |
|---|---|
| Writing any project code | ✅ Only after plan approval |
| Installing global npm packages or CLI tools | ✅ Yes |
| Initializing a Git repository | ✅ Yes (after plan approval) |
| Creating a Firebase project | ✅ Yes — I'll provide instructions, you execute |
| Creating any AWS resource (Lambda, DynamoDB, API Gateway, IAM roles) | ✅ Yes — with cost estimate |
| Deploying to Vercel | ✅ Yes |
| Running `aws configure` or modifying AWS credentials | ✅ Yes — I'll guide, you execute |
| Any operation that could incur charges | ✅ Yes — with cost breakdown first |
| Modifying billing settings or upgrading plans | ✅ Yes |
| Deleting or overwriting existing files/resources | ✅ Yes |
| Pushing code to GitHub | ✅ Yes |
| Committing `.env` files, credentials, or secrets to Git | ❌ **Never** — this is blocked unconditionally |

---

## Next Steps

1. **You answer** the questionnaire above (Sections A–F).
2. I finalize the **comprehensive Implementation Plan** (all 15 sections from the master prompt).
3. You **review and approve** the plan.
4. We begin **Phase 3** (environment setup) — the first phase that modifies your system.

> [!NOTE]
> No code will be written, no dependencies installed, no cloud resources created, and no costs incurred until you have reviewed and explicitly approved the relevant steps.
