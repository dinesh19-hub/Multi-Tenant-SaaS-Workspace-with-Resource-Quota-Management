# Implementation Plan — Multi-Tenant SaaS Workspace with Resource Quota Management

**Project:** Design and Implementation of a Multi-Tenant SaaS Workspace with Resource Quota Management Using Amazon Cognito, React, Vercel, and AWS Serverless  
**Author:** Dinesh Konda  
**Date:** 2026-10-12  
**Version:** 1.4 (Technical Corrections — Explicit IAM Role, Deletion Recovery Resiliency, BatchWriteItem Backoff, Authoritative Quota Constants, GSI Details, Dedicated Live Concurrency Tests, Cost/Free-Tier Clarifications)  
**Status:** Awaiting Approval

---

## Revision History

| Version | Date | Changes |
|---|---|---|
| **1.0** | 2026-10-12 | Initial baseline implementation plan. |
| **1.1** | 2026-10-12 | Technical corrections: DynamoDB transaction redesign (eliminating multi-action collisions on the same item), `email_verified` claim enforcement in Lambda middleware, GSI sparse index reconciliation, 21-route authorization matrix, 7-step staged org deletion, and cost/performance target decoupling. |
| **1.2** | 2026-10-12 | Architecture change: Replaced Firebase Authentication with Amazon Cognito User Pools and AWS Amplify JavaScript Auth v6. Reconfigured API Gateway HTTP API native JWT authorizer for Cognito User Pool issuer and App Client audience. Unified cloud infrastructure under AWS SAM. Added Cognito pricing, 50-email/day limit, and token claim structures. |
| **1.3** | 2026-10-12 | Technical corrections: Added `dynamodb:TransactWriteItems`, scoped CloudWatch Logs streams, resolved `/v1` stage URL prefix duplication ($default stage), added token-use validation middleware (`token_use !== 'id'`), added `adminCount` last-admin protection, atomic org creation transaction, and esbuild packaging. |
| **1.4** | 2026-10-12 | **Comprehensive Technical Corrections:**<br>1. **Explicit Least-Privilege IAM Execution Role:** Replaced SAM implicit execution role with an explicit `AWS::IAM::Role` (`ApiHandlerExecutionRole`), removing all wildcard CloudWatch Logs permissions (`AWSLambdaBasicExecutionRole` eliminated). Scoped table permissions to table/index ARNs and log permissions strictly to the function's log group stream ARNs.<br>2. **Resumable Organization Deletion Recovery:** Stored `authorizedAdminIds` (StringSet of all active Admin UIDs) on `ORG#<orgId> / METADATA` when deletion starts. If membership items are purged during cleanup, `tenantMiddleware` checks `authorizedAdminIds` to allow **any authorized Admin** from that organization to safely resume/retry cleanup, even if the original initiating Admin is unavailable.<br>3. **Robust Deletion Handling:** Specified exponential backoff with jitter for `BatchWriteItem` `UnprocessedItems` (up to 5 retries); mandated strongly consistent base-table reads (`ConsistentRead: true`) for authoritative deletion; added a final verification check before metadata deletion to guarantee zero orphaned records.<br>4. **Authoritative Quota Values & GSI Details:** Restored explicit Free (5 members / 10 projects), Standard (25 members / 50 projects), and Premium (100 members / 200 projects) constants; documented exact GSI key schemas, sparse projection, query patterns, and asynchronous consistency limitations.<br>5. **Dedicated Live AWS Testing:** Added dedicated live AWS test cases for project quota contention (TC-26), concurrent Admin demotions (TC-27), deletion recovery (TC-28), and allowed/blocked CORS preflights (TC-29/TC-30). Relabeled all test metrics as targets.<br>6. **Cost, Free-Tier, and Vercel Terms Accuracy:** Distinguished AWS Free Accounts (new accounts with 12-month trials) from AWS Paid Accounts; clarified Cognito legacy 50k MAU (pre-Nov 21, 2024) vs current 10k MAU eligibility; explicitly stated Vercel Hobby is used for a non-commercial academic demonstration; mandated pre-deployment billing verification. |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Existing System vs Proposed Project](#2-existing-system-vs-proposed-project)
3. [Requirements Specification](#3-requirements-specification)
4. [System Architecture](#4-system-architecture)
5. [Amazon Cognito Authentication and API Gateway Integration](#5-amazon-cognito-authentication-and-api-gateway-integration)
6. [AWS Service Justification](#6-aws-service-justification)
7. [DynamoDB Data Model, Access Patterns, and Quotas](#7-dynamodb-data-model-access-patterns-and-quotas)
8. [Security Architecture and Explicit Least-Privilege IAM](#8-security-architecture-and-explicit-least-privilege-iam)
9. [Public GitHub Repository Security](#9-public-github-repository-security)
10. [Repository Structure and Coding Standards](#10-repository-structure-and-coding-standards)
11. [Phased Implementation Plan](#11-phased-implementation-plan)
12. [Testing Strategy](#12-testing-strategy)
13. [AWS Infrastructure as Code, Build, and Packaging](#13-aws-infrastructure-as-code-build-and-packaging)
14. [Vercel Frontend Deployment](#14-vercel-frontend-deployment)
15. [Performance and Scalability Targets](#15-performance-and-scalability-targets)
16. [Cost Analysis and Billing Safeguards](#16-cost-analysis-and-billing-safeguards)
17. [AWS Credit Protection and Cleanup](#17-aws-credit-protection-and-cleanup)
18. [FT-III Assessment Mapping](#18-ft-iii-assessment-mapping)
19. [Deliverables Checklist](#19-deliverables-checklist)
20. [Open Decisions and Assumptions](#20-open-decisions-and-assumptions)
21. [Appendix A — Architecture Change: Firebase Removal Inventory](#appendix-a--architecture-change-firebase-removal-inventory)
22. [Appendix B — Technical Corrections and Revision Summary](#appendix-b--technical-corrections-and-revision-summary)

---

## 1. Executive Summary

### Problem Statement

Modern organizations require collaborative software workspaces, but provisioning dedicated infrastructure per tenant is prohibitively expensive and operationally unmanageable. Multi-tenancy — where a single application securely serves multiple organizations — is the foundation of scalable cloud SaaS. Implementing it effectively requires robust architectural solutions for authentication, fine-grained authorization, strict tenant data isolation, resource quota enforcement, and cloud cost control.

### Proposed Solution

This project delivers a **fully functional, cloud-deployed Multi-Tenant SaaS Workspace** built on a cohesive cloud architecture:

- **Multi-Tenant Architecture:** Multiple organizations share a unified application and database instance with logical data isolation enforced via partition-key scoping and server-side authorization.
- **Native AWS Identity Integration:** User identity, verification, and authentication lifecycles are managed natively via **Amazon Cognito User Pools**, eliminating third-party authentication dependencies.
- **Modern Single-Page Application:** Responsive React + TypeScript + Bootstrap 5 frontend deployed seamlessly on **Vercel Hobby** (non-commercial academic demonstration).
- **Serverless API & Compute:** Secure **Amazon API Gateway HTTP API** ($default stage) with a native JWT authorizer directly validating Cognito tokens, routing requests to **AWS Lambda** (Node.js 22.x, ARM64, TypeScript).
- **Scalable Single-Table Database:** High-performance **Amazon DynamoDB** single-table design with sparse global secondary indexes, base-table invite pointers for strongly consistent cleanup, and atomic quota enforcement via conditional transactions (`TransactWriteItems`).
- **Role-Based Access Control (RBAC):** Organization-scoped Admin and Member roles, enforced strictly in trusted backend Lambda middleware, featuring atomic last-admin protection via `adminCount`.
- **Resource Quota Management:** Real-time enforcement of member and project quotas across predefined tiers (Free: 5/10, Standard: 25/50, Premium: 100/200).
- **Resumable Workspace Deletion:** Multi-step soft-delete workflow with exponential backoff on `BatchWriteItem` unprocessed items, strongly consistent base-table reads, and recovery authorization for all active admins.
- **Complete Infrastructure as Code (IaC):** Unified **AWS SAM** template provisioning the entire AWS backend — Cognito User Pool, App Client, API Gateway, explicit least-privilege IAM role, Lambda, and DynamoDB.

### Target Users

- **Organization Administrators:** Create workspaces, generate invite codes, manage members, create and oversee projects, and track resource utilization.
- **Organization Members:** Accept invitations, access authorized workspaces, manage their own projects, and collaborate within assigned boundaries.
- **Academic Evaluators:** Assess cloud architecture patterns, serverless engineering, security posture, and cloud cost management for the FT-III evaluation.

### Final Deliverables

A production-ready SaaS application accessible via a Vercel HTTPS URL, backed by a fully secured AWS serverless API in `ap-south-1`, using Amazon Cognito User Pools, comprehensive test evidence, and academic assessment documentation.

---

## 2. Existing System vs Proposed Project

### Comparison with Commercial Multi-Tenant SaaS

| Aspect | Commercial SaaS (e.g., Slack, Notion, Asana) | This Project (v1.4 Architecture) |
|---|---|---|
| **Scale** | Millions of tenants, global multi-region presence | Academic demonstration with controlled scale (ap-south-1) |
| **Authentication** | Enterprise SSO, SAML, Okta, OAuth2, SMS/App MFA | Amazon Cognito User Pools (email/password, verification codes, SRP auth) |
| **Billing** | Stripe integration, usage metering, automated invoicing | Predefined quota tiers enforced atomically; no financial payment processing |
| **Data Isolation** | Database-per-tenant, schema-per-tenant, or tenant tagging | Logical partition-key isolation (`ORG#<orgId>`) in shared DynamoDB single table |
| **Compute & API** | Kubernetes (EKS), container clusters, microservices | Serverless AWS Lambda (Node.js 22.x) and API Gateway HTTP API ($default stage) |
| **Infrastructure** | Complex Terraform/Pulumi pipelines across accounts | Unified AWS SAM CloudFormation template with explicit least-privilege IAM role |
| **Observability** | Datadog, New Relic, OpenTelemetry, PagerDuty | Essential Amazon CloudWatch logging with 7-day retention and strictly scoped stream permissions |
| **Team Size** | Distributed engineering organizations | Individual academic project |

---

## 3. Requirements Specification

### 3.1 Functional Requirements

| ID | Requirement | Priority | Acceptance Criteria |
|---|---|---|---|
| **FR-01** | User registration with email & password | Must Have | User signs up via custom React form; Cognito User Pool creates unconfirmed account; sends 6-digit confirmation code via email. |
| **FR-02** | Email verification | Must Have | User inputs 6-digit code via custom UI (`confirmSignUp`); account is marked `CONFIRMED`; backend enforces `email_verified` claim on all workspace routes. |
| **FR-03** | User login with email & password | Must Have | Valid credentials authenticate via Secure Remote Password (SRP) flow; returns Cognito ID, Access, and Refresh tokens; invalid credentials display clear error. |
| **FR-04** | Password reset | Must Have | User requests reset (`resetPassword`); receives code via email; confirms with new password (`confirmResetPassword`). |
| **FR-05** | User logout | Must Have | Active Cognito session terminated via `signOut`; all stored tokens cleared from client storage; user redirected to login view. |
| **FR-06** | Create organization (Atomic) | Must Have | Authenticated, email-verified user creates an org; executed via `TransactWriteItems` atomically initializing metadata, creator Admin membership (`adminCount: 1`, `memberCount: 1`), and initial audit log. |
| **FR-07** | View organization details | Must Have | Members can view org name, description, quota tier, and current member/project counters. |
| **FR-08** | Update organization details | Must Have | Only an Admin can update org name and description. |
| **FR-09** | Delete organization (Resumable) | Must Have | Admin can trigger deletion; marks status `DELETING`, captures `authorizedAdminIds`; staged cleanup with exponential backoff removes all child items; strongly consistent verification runs before metadata is removed; any authorized Admin can resume if interrupted. |
| **FR-10** | Generate invite code | Must Have | Admin generates time-limited, usage-limited invite code; writes `INVITE#<code>` and base-table pointer `ORG#<id> / INVITE#<code>`. |
| **FR-11** | Join organization via invite code | Must Have | Authenticated, verified user joins org as `MEMBER`; membership and invite usage counters update atomically. |
| **FR-12** | List organization members | Must Have | Admins and Members can view all members and their assigned roles within the organization. |
| **FR-13** | Remove organization member | Must Have | Admin can remove a Member; if removing an Admin, `adminCount` must be > 1 enforced via conditional transaction. |
| **FR-14** | Change member role | Should Have | Admin can promote Member to Admin or demote Admin to Member; demotion atomically verifies `adminCount > 1`. |
| **FR-15** | Create project | Must Have | Member or Admin creates project within org; operation subject to atomic quota limit. |
| **FR-16** | List projects | Must Have | Members view all projects belonging to their organization. |
| **FR-17** | View project details | Must Have | Members view project name, description, status, timestamps, and creator. |
| **FR-18** | Update project | Must Have | Admin or the specific Member who created the project can update project details. |
| **FR-19** | Delete project | Must Have | Admin can delete any project; project counter decrements atomically. |
| **FR-20** | Enforce member quota | Must Have | Joining an org fails atomically with HTTP 409 if `memberCount >= maxMembers`. |
| **FR-21** | Enforce project quota | Must Have | Creating a project fails atomically with HTTP 409 if `projectCount >= maxProjects`. |
| **FR-22** | View quota usage | Must Have | Workspace dashboard displays visual utilization metrics comparing current usage to tier limits. |
| **FR-23** | Basic audit log | Should Have | Key workspace events (project created/deleted, member joined/removed) logged with actor ID, email, action, and timestamp. |
| **FR-24** | Usage analytics dashboard | Must Have | Summary cards and charts show quota utilization and recent workspace activity. |

### 3.2 Non-Functional Requirements

| ID | Requirement | Priority | Target |
|---|---|---|---|
| **NFR-01** | API response time (warm) | Should Have | Target: < 200ms p95 for standard CRUD operations |
| **NFR-02** | API response time (cold start) | Should Have | Target: < 1000ms p95 including Lambda runtime & SDK initialization |
| **NFR-03** | Frontend responsiveness | Must Have | Fully functional across mobile, tablet, and desktop viewports (≥ 360px) |
| **NFR-04** | Data consistency | Must Have | Quota enforcement uses strong consistency via DynamoDB transactions with conditional expressions |
| **NFR-05** | Error handling | Must Have | Structured JSON error responses (`{ error: string, code: string }`) with accurate HTTP status codes (400, 401, 403, 404, 409, 500) |
| **NFR-06** | Accessibility | Should Have | Semantic HTML5, ARIA labels, accessible form controls, and keyboard navigation |
| **NFR-07** | Browser support | Must Have | Latest stable versions of Chrome, Firefox, Edge, and Safari |
| **NFR-08** | Deployment reproducibility | Must Have | 100% declarative IaC via AWS SAM with esbuild compilation; zero manual cloud resource provisioning |
| **NFR-09** | Code quality | Must Have | Strict TypeScript, ESLint zero-warning policy, Prettier formatting |
| **NFR-10** | Cloud credit preservation | Must Have | Stay strictly within AWS Free Tier limits; zero billing surprises |

---

## 4. System Architecture

### 4.1 Architecture Diagram

```
                                  ┌──────────────────────────────────┐
                                  │          VERCEL (Hobby)          │
                                  │  ┌────────────────────────────┐  │
                                  │  │  React + TypeScript + BS5  │  │
                                  │  │  Single Page Application   │  │
                                  │  └────────────────────────────┘  │
                                  │  Auto-deploy from GitHub main    │
                                  └─────────┬──────────────┬─────────┘
                                            │              │
                AWS Amplify Auth v6 (SRP)   │              │  HTTPS + Bearer ID Token
                Sign-up, Confirm, Login,    │              │  Authorization: Bearer <idToken>
                Token Refresh               ▼              ▼
        ┌───────────────────────────────┐      ┌─────────────────────────────────────────┐
        │   AMAZON COGNITO USER POOLS   │      │       AWS API GATEWAY (HTTP API)        │
        │   Region: ap-south-1          │      │       Region: ap-south-1                │
        │                               │      │       Stage: $default (Auto-Deploy)     │
        │ • Custom UI (Amplify Auth v6) │      │                                         │
        │ • Username: Email             │      │ ┌─────────────────────────────────────┐ │
        │ • Verification: 6-digit code  │      │ │ Native JWT Authorizer               │ │
        │ • Public App Client (No Secret│      │ │ • Issuer: cognito-idp.ap-south-1... │ │
        │ • Flows: USER_SRP_AUTH        │      │ │ • Audience: <CognitoAppClientId>    │ │
        │ • Built-in Email (50/day free)│      │ │ • Validates: sig, iss, aud, exp     │ │
        │ • 10,000 / 50,000 MAU free    │      │ │ • Injects claims into Lambda event  │ │
        └───────────────────────────────┘      │ └─────────────────────────────────────┘ │
                                               │                                         │
                                               │ Base URL: https://<id>.execute-api...   │
                                               │ Routes: /api/v1/*                       │
                                               └────────────────────┬────────────────────┘
                                                                    │
                                               ┌────────────────────▼────────────────────┐
                                               │        AWS LAMBDA (Node.js 22.x)        │
                                               │        Region: ap-south-1               │
                                               │        Role: Explicit Least-Privilege   │
                                               │                                         │
                                               │ ┌─────────────────────────────────────┐ │
                                               │ │ Layer 2a: Token Type & Claims Check │ │
                                               │ │ • claims.token_use === "id" (Block  │ │
                                               │ │   access tokens with HTTP 401)      │ │
                                               │ │ • Verify iss, aud, sub, email       │ │
                                               │ │ • claims.email_verified === "true"  │ │
                                               │ │ • Allow /api/v1/users/profile       │ │
                                               │ │ • Block unverified (HTTP 403)       │ │
                                               │ └─────────────────────────────────────┘ │
                                               │ ┌─────────────────────────────────────┐ │
                                               │ │ Layer 2b: Tenant Authorization Check│ │
                                               │ │ • Extract uid from claims.sub       │ │
                                               │ │ • Check membership: ORG#<id>/MEMBER │ │
                                               │ │ • Special Case: If status=DELETING, │ │
                                               │ │   allow any in authorizedAdminIds   │ │
                                               │ │ • Verify role: ADMIN vs MEMBER      │ │
                                               │ └─────────────────────────────────────┘ │
                                               │ ┌─────────────────────────────────────┐ │
                                               │ │ Layer 3: Business Logic & Quotas    │ │
                                               │ │ • Input validation (Zod schemas)    │ │
                                               │ │ • Atomic quota checks (Free: 5/10)  │ │
                                               │ │ • TransactWriteItems execution      │ │
                                               │ │ • Resumable deletion with backoff   │ │
                                               │ └─────────────────────────────────────┘ │
                                               └────────────────────┬────────────────────┘
                                                                    │
                                               ┌────────────────────▼────────────────────┐
                                               │             AMAZON DYNAMODB             │
                                               │             Region: ap-south-1          │
                                               │                                         │
                                               │ Table: SaaSWorkspace (Provisioned 5/5)  │
                                               │ Base Table Entities:                    │
                                               │ • USER#<uid>      | PROFILE             │
                                               │ • ORG#<orgId>     | METADATA            │
                                               │ • ORG#<orgId>     | MEMBER#<uid>        │
                                               │ • ORG#<orgId>     | PROJECT#<projectId> │
                                               │ • ORG#<orgId>     | INVITE#<code>       │
                                               │ • INVITE#<code>   | METADATA            │
                                               │ • ORG#<orgId>     | AUDIT#<ts>#<id>     │
                                               │                                         │
                                               │ Sparse Indexes (Eventually Consistent): │
                                               │ • GSI1: User → Organizations (5/5)      │
                                               │ • GSI2: Organization → Invites (5/5)    │
                                               │                                         │
                                               │ Strongly Consistent Reads on Base Table │
                                               │ for Quotas & Deletion Teardown          │
                                               └─────────────────────────────────────────┘
```

### 4.2 Consistent URL Routing Scheme

- **API Gateway HTTP API Stage:** `$default` (with auto-deploy enabled). No path stage segment is appended to the API root:
  `https://${HttpApi}.execute-api.${AWS::Region}.amazonaws.com`
- **Application Endpoints:** All routes defined in Lambda include `/api/v1/...`.
- **Frontend Configuration:**
  `VITE_API_BASE_URL=https://<api-id>.execute-api.ap-south-1.amazonaws.com/api/v1`
  Clients call endpoints without duplicating version segments: `apiClient.get('/orgs')` requests `/api/v1/orgs`.

---

## 5. Amazon Cognito Authentication and API Gateway Integration

### 5.1 HTTP API JWT Authorizer: `aud` vs. `client_id` Behavior

1. **OIDC Claim Standard:** ID tokens define the intended recipient in the `aud` claim (App Client ID). Cognito Access Tokens omit the `aud` claim and provide `client_id: "<AppClientId>"` and `token_use: "access"`.
2. **Authorizer Fallback Mechanism:**
   - When an audience is configured on an API Gateway HTTP API JWT authorizer, API Gateway inspects the token's `aud` claim.
   - **Crucial Gateway Rule:** If `aud` is absent, API Gateway falls back to validating the `client_id` claim against the configured audience list.
   - **Consequence:** An access token issued for the same App Client **will pass API Gateway authorizer validation**.
   - Therefore, **API Gateway alone cannot distinguish an ID token from an Access token**.

### 5.2 Mandatory Backend Token Validation Middleware

To prevent unprivileged access via access tokens (which lack `email` and `email_verified` claims), Lambda middleware must explicitly validate the token claims:

```typescript
// backend/src/middleware/authMiddleware.ts
import { ForbiddenError, UnauthorizedError } from '../utils/errors';

export interface CognitoJwtClaims {
  sub: string;
  email: string;
  email_verified: string; // Serialized as string "true" | "false"
  'cognito:username': string;
  iss: string;
  aud: string;
  exp: string;
  token_use: 'id' | 'access';
}

export function validateCognitoToken(
  claims: CognitoJwtClaims,
  expectedIssuer: string,
  expectedAudience: string
): void {
  // 1. Mandatory Token-Use Check: Reject access tokens
  if (claims.token_use !== 'id') {
    throw new UnauthorizedError(
      'Invalid token type. API requires a Cognito ID token.'
    );
  }

  // 2. Issuer and Audience Verification
  if (claims.iss !== expectedIssuer) {
    throw new UnauthorizedError('Token issuer mismatch.');
  }
  if (claims.aud !== expectedAudience) {
    throw new UnauthorizedError('Token audience mismatch.');
  }

  // 3. Subject and Email Claim Verification
  if (!claims.sub || typeof claims.sub !== 'string') {
    throw new UnauthorizedError('Token missing valid subject claim.');
  }
  if (!claims.email || typeof claims.email !== 'string') {
    throw new UnauthorizedError('Token missing valid email claim.');
  }
}

export function enforceEmailVerification(
  path: string,
  claims: CognitoJwtClaims
): void {
  if (path === '/api/v1/users/profile') {
    return; // Profile retrieval/creation permitted
  }

  if (claims.email_verified !== 'true') {
    throw new ForbiddenError(
      'Email address is not verified. Please verify your email before accessing workspace resources.'
    );
  }
}
```

---

## 6. AWS Service Justification

| Service | Function | Why Selected | Why Alternatives Were Rejected |
|---|---|---|---|
| **Amazon Cognito User Pools** | User directory, authentication, verification, password reset | Native AWS identity service; RS256 JWT tokens; seamless API Gateway integration; 10k–50k MAU free tier; eliminates third-party cloud dependencies | Firebase: adds external Google Cloud dependency; Auth0: external billing & latency; Custom Auth in DB: massive security risk, high maintenance |
| **API Gateway HTTP API** | API routing, native JWT validation, CORS enforcement | Native support for Cognito JWT validation; $1.00/million requests (cheaper than REST API); single-digit ms overhead | REST API: higher cost ($3.50/M), unnecessary feature overhead; ALB: continuous hourly charges ($16+/month) |
| **AWS Lambda (Node.js 22.x)** | Serverless compute, business logic, authorization | Zero idle cost; automatic scaling; same TypeScript language as frontend; generous 1M requests/mo Always Free tier | EC2 / ECS: constant hourly instance charges; complex OS and container management for academic scope |
| **Amazon DynamoDB** | Single-table database, quota storage, audit logs | Predictable single-digit millisecond latency; atomic conditional transactions; 25 RCU/WCU Always Free tier | Amazon RDS / Aurora: minimum $15+/month instance cost; requires VPC and NAT Gateway; complex schema migrations |
| **Amazon CloudWatch Logs** | Runtime logging and debugging | Native Lambda integration; 5 GB/month Always Free tier; 7-day retention prevents storage accumulation | Third-party logging (Datadog): adds external billing and agent overhead |
| **AWS IAM** | Explicit least-privilege resource permissions | Explicit IAM role; zero wildcard log stream permissions; strict ARN scoping | Implicit SAM execution roles attach AWSLambdaBasicExecutionRole with wildcard logs:*:*:* |
| **AWS SAM (CloudFormation)** | Declarative Infrastructure as Code | Natively defines serverless resources in a single declarative YAML template with built-in esbuild compilation | Terraform: requires external state management (S3/DynamoDB); CDK: adds build step complexity |

---

## 7. DynamoDB Data Model, Access Patterns, and Quotas

### 7.1 Table Configuration

- **Table Name:** `SaaSWorkspace`
- **Billing Mode:** `PROVISIONED` — 5 RCU / 5 WCU
- **Region:** `ap-south-1`
- **Encryption:** AWS-owned keys

### 7.2 Entity Definitions

| Entity | Partition Key (PK) | Sort Key (SK) | Key Attributes |
|---|---|---|---|
| **User Profile** | `USER#<uid>` | `PROFILE` | `email`, `displayName`, `createdAt`, `updatedAt` |
| **Organization Metadata** | `ORG#<orgId>` | `METADATA` | `name`, `description`, `quotaTier`, `memberCount`, `adminCount`, `projectCount`, `createdBy`, `status`, `deletingInitiatedBy`, `deletingInitiatedAt`, `authorizedAdminIds` (StringSet), `deletionStage`, `createdAt`, `updatedAt` |
| **Membership** | `ORG#<orgId>` | `MEMBER#<uid>` | `userId`, `email`, `displayName`, `role` (`ADMIN`\|`MEMBER`), `joinedAt`, `GSI1PK`, `GSI1SK` |
| **Project** | `ORG#<orgId>` | `PROJECT#<projectId>` | `name`, `description`, `status`, `createdBy`, `createdAt`, `updatedAt` |
| **Org Invite Pointer (Base Table)** | `ORG#<orgId>` | `INVITE#<code>` | `code`, `createdAt` |
| **Invite Code Metadata** | `INVITE#<code>` | `METADATA` | `orgId`, `orgName`, `createdBy`, `maxUses`, `currentUses`, `expiresAt`, `createdAt`, `GSI2PK`, `GSI2SK` |
| **Audit Log Entry** | `ORG#<orgId>` | `AUDIT#<timestamp>#<eventId>` | `action`, `actorId`, `actorEmail`, `targetType`, `targetId`, `details`, `timestamp` |

### 7.3 Global Secondary Indexes and Consistency Limitations

#### GSI1: User-to-Organizations (`UserOrgs`)
- **Partition Key:** `GSI1PK` (String) = `USER#<uid>`
- **Sort Key:** `GSI1SK` (String) = `ORG#<orgId>`
- **Populating Entity:** Membership items only.
- **Projection:** `ALL` (`role`, `orgId`, `orgName`, `joinedAt`).
- **Query Pattern:** `GSI1PK = :userKey` (fetches all organization memberships for a user).
- **Consistency:** **Eventual consistency only**. DynamoDB GSIs are asynchronously replicated across partitions.

#### GSI2: Organization-to-Invites (`InvitesByOrg`)
- **Partition Key:** `GSI2PK` (String) = `ORG#<orgId>`
- **Sort Key:** `GSI2SK` (String) = `<expiresAt>` (ISO-8601 string)
- **Populating Entity:** Invite metadata items (`PK = INVITE#<code>, SK = METADATA`).
- **Projection:** `ALL`.
- **Query Pattern:** `GSI2PK = :orgKey AND GSI2SK > :now` (fetches active non-expired invites).
- **Consistency:** **Eventual consistency only**.

#### Critical Consistency Limitation & Architectural Safeguard:
Because GSIs cannot support strongly consistent reads (`ConsistentRead: true` is rejected on GSIs), **authoritative operations must never rely solely on GSIs**:
- Invites are dual-written: `INVITE#<code> / METADATA` (for global code validation) AND `ORG#<orgId> / INVITE#<code>` (base-table pointer).
- When an organization is deleted, the base table is queried with **`ConsistentRead: true`** to guarantee that every invitation is authoritatively discovered and deleted, avoiding orphaned records caused by asynchronous index replication delays.

### 7.4 Authoritative Quota Values and Constants

The authoritative resource quota tier definitions are defined as application constants:

```typescript
// backend/src/config/constants.ts
export interface QuotaLimit {
  maxMembers: number;
  maxProjects: number;
}

export const QUOTA_TIERS: Record<'FREE' | 'STANDARD' | 'PREMIUM', QuotaLimit> = {
  FREE: {
    maxMembers: 5,
    maxProjects: 10,
  },
  STANDARD: {
    maxMembers: 25,
    maxProjects: 50,
  },
  PREMIUM: {
    maxMembers: 100,
    maxProjects: 200,
  },
} as const;

export const DEFAULT_QUOTA_TIER = 'FREE' as const;
```

| Tier Name | Maximum Members | Maximum Projects | Assignment Policy |
|---|---|---|---|
| **Free** | **5** | **10** | Default tier automatically assigned to all newly created organizations. |
| **Standard** | **25** | **50** | Upgradable tier for growing teams. |
| **Premium** | **100** | **200** | Maximum tier for academic workload demonstration. |

### 7.5 Atomic Transactions (`TransactWriteItems`)

All quota, membership, and organizational operations use single conditional write operations per item, ensuring zero multiple-action conflicts on the same item.

#### Transaction 0: Atomic Organization Creation
1. **Action 1 — PutItem Organization Metadata:**
   - Key: `PK = ORG#<orgId>, SK = METADATA`
   - Attributes: `name`, `description`, `quotaTier: "FREE"`, `memberCount: 1`, `adminCount: 1`, `projectCount: 0`, `createdBy: uid`, `status: "ACTIVE"`, `createdAt`, `updatedAt`
   - ConditionExpression: `attribute_not_exists(PK)`
2. **Action 2 — PutItem Creator Admin Membership:**
   - Key: `PK = ORG#<orgId>, SK = MEMBER#<uid>`
   - Attributes: `userId: uid`, `email`, `role: "ADMIN"`, `joinedAt`, `GSI1PK: USER#<uid>`, `GSI1SK: ORG#<orgId>`
   - ConditionExpression: `attribute_not_exists(PK)`
3. **Action 3 — PutItem Audit Log:**
   - Key: `PK = ORG#<orgId>, SK = AUDIT#<timestamp>#<eventId>`
   - Attributes: `action: "ORG_CREATED"`, `actorId: uid`, `actorEmail: email`, `details: { name, quotaTier: "FREE" }`

#### Transaction 1: Project Creation with Quota Check
1. **Action 1 — Conditional UpdateItem on Organization Metadata:**
   - Key: `PK = ORG#<orgId>, SK = METADATA`
   - Update: `SET projectCount = projectCount + :one, updatedAt = :now`
   - ConditionExpression: `projectCount < :maxProjects AND #status <> :deleting`
2. **Action 2 — PutItem Project Record:**
   - Key: `PK = ORG#<orgId>, SK = PROJECT#<projectId>`
   - ConditionExpression: `attribute_not_exists(PK)`
3. **Action 3 — PutItem Audit Log:**
   - Key: `PK = ORG#<orgId>, SK = AUDIT#<timestamp>#<eventId>`

#### Transaction 2: Member Joining via Invite Code with Quota Check
1. **Action 1 — Conditional UpdateItem on Organization Metadata:**
   - Key: `PK = ORG#<orgId>, SK = METADATA`
   - Update: `SET memberCount = memberCount + :one, updatedAt = :now`
   - ConditionExpression: `memberCount < :maxMembers AND #status <> :deleting`
2. **Action 2 — PutItem Membership Record:**
   - Key: `PK = ORG#<orgId>, SK = MEMBER#<uid>`
   - Attributes: `role: "MEMBER"`, `GSI1PK: USER#<uid>`, `GSI1SK: ORG#<orgId>`
   - ConditionExpression: `attribute_not_exists(PK)`
3. **Action 3 — Conditional UpdateItem on Invite Code:**
   - Key: `PK = INVITE#<code>, SK = METADATA`
   - Update: `SET currentUses = currentUses + :one, updatedAt = :now`
   - ConditionExpression: `currentUses < :maxUses AND expiresAt > :now`
4. **Action 4 — PutItem Audit Log:**
   - Key: `PK = ORG#<orgId>, SK = AUDIT#<timestamp>#<eventId>`

#### Transaction 3: Project Deletion with Counter Decrement
1. **Action 1 — Conditional UpdateItem on Organization Metadata:**
   - Key: `PK = ORG#<orgId>, SK = METADATA`
   - Update: `SET projectCount = projectCount - :one, updatedAt = :now`
   - ConditionExpression: `projectCount > :zero`
2. **Action 2 — DeleteItem Project Record:**
   - Key: `PK = ORG#<orgId>, SK = PROJECT#<projectId>`
   - ConditionExpression: `attribute_exists(PK)`
3. **Action 3 — PutItem Audit Log:**
   - Key: `PK = ORG#<orgId>, SK = AUDIT#<timestamp>#<eventId>`

#### Transaction 4: Member Removal with Last-Admin Protection
- **Scenario A: Removing a Member (`role === "MEMBER"`):**
  1. UpdateItem `ORG#<orgId> / METADATA`: `SET memberCount = memberCount - :one` with Condition: `memberCount > :one AND #status <> :deleting`.
  2. DeleteItem `ORG#<orgId> / MEMBER#<uid>` with Condition: `attribute_exists(PK) AND #role = :member`.
  3. PutItem Audit Log.
- **Scenario B: Removing an Admin (`role === "ADMIN"`):**
  1. UpdateItem `ORG#<orgId> / METADATA`: `SET memberCount = memberCount - :one, adminCount = adminCount - :one` with Condition: `adminCount > :one AND memberCount > :one AND #status <> :deleting`.
  2. DeleteItem `ORG#<orgId> / MEMBER#<uid>` with Condition: `attribute_exists(PK) AND #role = :admin`.
  3. PutItem Audit Log.
  *Failure Handling:* If `adminCount <= 1`, Action 1 fails condition evaluation. The API returns HTTP 400 Bad Request (`"Cannot remove the last administrator"`).

#### Transaction 5: Member Role Change with Last-Admin Protection
- **Promoting Member to Admin:**
  1. UpdateItem `ORG#<orgId> / METADATA`: `SET adminCount = adminCount + :one` with Condition: `#status <> :deleting`.
  2. UpdateItem `ORG#<orgId> / MEMBER#<uid>`: `SET #role = :admin` with Condition: `#role = :member`.
  3. PutItem Audit Log.
- **Demoting Admin to Member:**
  1. UpdateItem `ORG#<orgId> / METADATA`: `SET adminCount = adminCount - :one` with Condition: `adminCount > :one AND #status <> :deleting`.
  2. UpdateItem `ORG#<orgId> / MEMBER#<uid>`: `SET #role = :member` with Condition: `#role = :admin`.
  3. PutItem Audit Log.
  *Failure Handling:* If `adminCount <= 1`, Action 1 fails condition evaluation. Concurrent demotions cannot race; the transaction guarantees at least one Admin remains.

---

### 7.6 Resumable and Fault-Tolerant Organization Deletion Workflow

DynamoDB does not cascade deletes. The deletion workflow must be **idempotent, resilient to throttling, resumable after partial failures/timeouts, strongly consistent, and protected against unauthorized access**:

```
Step 1: Atomic Soft-Delete Flagging & Admin Snapshot
────────────────────────────────────────────────────
  Pre-check: Caller verified as active ADMIN. Query base table (ConsistentRead: true)
             to collect all active Admin UIDs in the organization.
  UpdateItem: PK=ORG#<orgId>, SK=METADATA
    SET #status = :deleting,
        deletingInitiatedBy = :callerUid,
        deletingInitiatedAt = :now,
        authorizedAdminIds = :adminSet, # StringSet of all active Admin UIDs
        deletionStage = :stageInit
    ConditionExpression: #status <> :deleting
  (Once set, ALL resource creation transactions fail condition checks immediately).

Step 2: Strongly Consistent Invite Deletion (Base Table Pointers + GSI2 Safety)
───────────────────────────────────────────────────────────────────────────────
  Update deletionStage = "INVITES".
  Loop:
    Query: PK=ORG#<orgId>, SK begins_with "INVITE#", Limit=25 (ConsistentRead: true).
    For each invite pointer:
      DeleteItem PK=INVITE#<code>, SK=METADATA
      DeleteItem PK=ORG#<orgId>, SK=INVITE#<code>
    Repeat until zero items remain.
  Safety Check: Query GSI2 for GSI2PK=orgId; delete any lingering records.

Step 3: Paginated Project Deletion with Backoff
───────────────────────────────────────────────
  Update deletionStage = "PROJECTS".
  Loop:
    Query: PK=ORG#<orgId>, SK begins_with "PROJECT#", Limit=25 (ConsistentRead: true).
    Execute BatchWriteItem with Exponential Backoff (Section 7.6.1).
    Repeat until zero project items remain.

Step 4: Paginated Membership Deletion with Backoff
─────────────────────────────────────────────────
  Update deletionStage = "MEMBERS".
  Loop:
    Query: PK=ORG#<orgId>, SK begins_with "MEMBER#", Limit=25 (ConsistentRead: true).
    Execute BatchWriteItem with Exponential Backoff (Section 7.6.1).
    Repeat until zero member items remain. (GSI1 entries removed automatically).

Step 5: Paginated Audit Log Deletion with Backoff
─────────────────────────────────────────────────
  Update deletionStage = "AUDIT".
  Loop:
    Query: PK=ORG#<orgId>, SK begins_with "AUDIT#", Limit=25 (ConsistentRead: true).
    Execute BatchWriteItem with Exponential Backoff (Section 7.6.1).
    Repeat until zero audit items remain.

Step 6: Strongly Consistent Verification & Final Metadata Deletion
──────────────────────────────────────────────────────────────────
  Verification Query: Query base table PK=ORG#<orgId> with ConsistentRead: true.
  Safety Guard:
    If Count > 1 (child items still detected):
      Log warning with detected items; DO NOT delete METADATA; throw error to retry.
    If Count === 1 AND items[0].SK === "METADATA":
      DeleteItem: PK=ORG#<orgId>, SK=METADATA (Success!)
```

#### 7.6.1 `BatchWriteItem` Exponential Backoff Handling
When deleting items in batches (up to 25 items per request):
1. If DynamoDB returns `UnprocessedItems` due to write capacity throttling or provisioned limits:
2. The deletion worker enters an exponential backoff loop:
   - Max retry attempts: **5**.
   - Jittered delay formula: `delayMs = Math.min(1000, Math.pow(2, attempt) * 50 + Math.random() * 50)`.
3. If items remain unprocessed after 5 retry attempts:
   - Worker logs the error and exits cleanly with HTTP 500 / 202.
   - The current progress is preserved in `deletionStage`.

#### 7.6.2 Authorization & Resumption Guarantee
If Lambda times out during Step 3, 4, or 5:
- In Step 4, membership items are deleted. A subsequent retry would normally fail membership checks!
- **Universal Admin Resumption Rule:** In `tenantMiddleware`, if the caller has no membership record, but `ORG#<orgId> / METADATA` exists with `#status === "DELETING"`, the middleware checks if the caller's `uid` (from `claims.sub`) is present in `orgMetadata.authorizedAdminIds`.
- If **YES**: The caller is recognized as an authorized Admin of the organization and is permitted to invoke `DELETE /api/v1/orgs/{orgId}` to resume cleanup.
- If **NO**: Rejection with HTTP 403 Forbidden.
- This guarantees that **any verified Admin** from that organization can resume cleanup, even if the original initiating Admin is logged out or unavailable.

---

## 8. Security Architecture and Explicit Least-Privilege IAM

### 8.1 Explicit Least-Privilege Lambda Execution Role

To prevent wildcard logging permissions (`arn:aws:logs:*:*:*`) implicitly introduced by SAM's `AWSLambdaBasicExecutionRole`, an explicit `AWS::IAM::Role` is defined:

```yaml
  ApiHandlerExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "${AWS::StackName}-api-handler-role"
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: DynamoDBTableAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:DeleteItem
                  - dynamodb:Query
                  - dynamodb:BatchWriteItem
                  - dynamodb:TransactWriteItems
                Resource:
                  - !GetAtt SaaSWorkspaceTable.Arn
                  - !Sub "${SaaSWorkspaceTable.Arn}/index/*"
        - PolicyName: ScopedCloudWatchLogging
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource:
                  - !Sub "${ApiHandlerLogGroup.Arn}:*"
```

- `ApiHandlerFunction` references this role via `Role: !GetAtt ApiHandlerExecutionRole.Arn`.
- SAM's implicit `Policies` property is omitted on the function, ensuring no managed policies or wildcard log stream permissions are attached.

### 8.2 Route Authorization Matrix

| Route | Method | Unverified User | Verified Non-Member | Organization MEMBER | Organization ADMIN | Additional Authorization Rule |
|---|---|---|---|---|---|---|
| `/api/v1/users/profile` | GET | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | Caller's own profile only |
| `/api/v1/users/profile` | POST | ✅ 200 | ✅ 200 | ✅ 200 | ✅ 200 | Caller's own profile only |
| `/api/v1/orgs` | POST | ❌ 403 | ✅ 201 | ✅ 201 | ✅ 201 | Atomic creation; caller becomes ADMIN |
| `/api/v1/orgs` | GET | ❌ 403 | ✅ 200 | ✅ 200 | ✅ 200 | Returns only orgs where caller is member |
| `/api/v1/orgs/{orgId}` | GET | ❌ 403 | ❌ 403 | ✅ 200 | ✅ 200 | Must be member of org |
| `/api/v1/orgs/{orgId}` | PUT | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only |
| `/api/v1/orgs/{orgId}` | DELETE | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Active Admin, or any Admin in `authorizedAdminIds` if members purged |
| `/api/v1/orgs/{orgId}/invites` | POST | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 201 | Admin only; blocked if status=DELETING |
| `/api/v1/orgs/{orgId}/invites` | GET | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only |
| `/api/v1/orgs/{orgId}/invites/{code}` | DELETE | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only |
| `/api/v1/invites/join` | POST | ❌ 403 | ✅ 200 | ✅ 200 | ✅ 200 | Cannot join if already member; quota check |
| `/api/v1/orgs/{orgId}/members` | GET | ❌ 403 | ❌ 403 | ✅ 200 | ✅ 200 | Members and Admins |
| `/api/v1/orgs/{orgId}/members/{uid}` | PUT | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only; demotion requires adminCount > 1 |
| `/api/v1/orgs/{orgId}/members/{uid}` | DELETE | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only; admin removal requires adminCount > 1 |
| `/api/v1/orgs/{orgId}/projects` | POST | ❌ 403 | ❌ 403 | ✅ 201 | ✅ 201 | Subject to atomic quota |
| `/api/v1/orgs/{orgId}/projects` | GET | ❌ 403 | ❌ 403 | ✅ 200 | ✅ 200 | Members and Admins |
| `/api/v1/orgs/{orgId}/projects/{pId}` | GET | ❌ 403 | ❌ 403 | ✅ 200 | ✅ 200 | Members and Admins |
| `/api/v1/orgs/{orgId}/projects/{pId}` | PUT | ❌ 403 | ❌ 403 | ✅ Creator only | ✅ 200 | Member must be creator; Admin any project |
| `/api/v1/orgs/{orgId}/projects/{pId}` | DELETE | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only |
| `/api/v1/orgs/{orgId}/analytics` | GET | ❌ 403 | ❌ 403 | ✅ 200 | ✅ 200 | Members and Admins |
| `/api/v1/orgs/{orgId}/audit-log` | GET | ❌ 403 | ❌ 403 | ❌ 403 | ✅ 200 | Admin only |

---

## 9. Public GitHub Repository Security

### 9.1 `.gitignore` Rules

```
# Environment variables
.env
.env.local
.env.production
.env.*.local

# AWS SAM and credentials
.aws-sam/
samconfig.toml
aws-credentials*

# Node dependencies and build outputs
node_modules/
dist/
build/
.vercel/

# Editor and system files
.vscode/settings.json
.idea/
.DS_Store
Thumbs.db
*.log
```

### 9.2 `.env.example` Template (Committed to Git)

```bash
# ==============================================================================
# Multi-Tenant SaaS Workspace — Frontend Configuration Template
# NOTE: These values are public client identifiers. Do NOT place secrets here!
# ==============================================================================

# Amazon Cognito Configuration
VITE_COGNITO_USER_POOL_ID=ap-south-1_xxxxxxxxx
VITE_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
VITE_AWS_REGION=ap-south-1

# API Gateway Base URL (Root domain + /api/v1)
VITE_API_BASE_URL=https://xxxxxxxxxx.execute-api.ap-south-1.amazonaws.com/api/v1
```

---

## 10. Repository Structure and Coding Standards

```
multi-tenant-saas-workspace/
├── .github/workflows/
│   ├── test.yml
│   └── sam-validate.yml
├── backend/
│   ├── src/
│   │   ├── config/constants.ts      # Authoritative quota limits & tiers
│   │   ├── handlers/
│   │   │   ├── authProfileHandler.ts
│   │   │   ├── orgHandler.ts
│   │   │   ├── memberHandler.ts
│   │   │   ├── projectHandler.ts
│   │   │   ├── inviteHandler.ts
│   │   │   └── analyticsHandler.ts
│   │   ├── middleware/
│   │   │   ├── authMiddleware.ts    # Token-use & claims validator
│   │   │   ├── tenantMiddleware.ts  # Membership & recovery checks
│   │   │   └── errorHandler.ts
│   │   ├── services/
│   │   │   ├── quotaService.ts      # TransactWriteItems quota logic
│   │   │   └── orgDeleteService.ts  # Resumable deletion with backoff
│   │   ├── repositories/dynamoRepository.ts
│   │   ├── utils/errors.ts
│   │   └── index.ts                 # Main Lambda entrypoint
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/
│   ├── package.json
│   ├── tsconfig.json
│   └── vitest.config.ts
├── frontend/
│   ├── src/
│   │   ├── components/auth/
│   │   ├── components/org/
│   │   ├── components/project/
│   │   ├── components/analytics/
│   │   ├── context/AuthContext.tsx
│   │   ├── context/WorkspaceContext.tsx
│   │   ├── services/authService.ts
│   │   ├── services/apiService.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── index.html
├── template.yaml
├── .env.example
├── .gitignore
├── README.md
├── ARCHITECTURE.md
├── DEPLOYMENT.md
└── CLEANUP.md
```

---

## 11. Phased Implementation Plan

### Phase Dependency Diagram

```
Phase 0 (Discovery & Requirements) ✅ COMPLETE
    │
    ▼
Phase 1 (Architecture & System Design v1.4) ◀── THIS PLAN (Under Review)
    │
    ▼
Phase 2 (Repository Setup & Tooling)
    │
    ├──────────────────────────────────┐
    ▼                                  ▼
Phase 3 (Frontend Foundation)      Phase 4 (Cognito User Pools & Auth UI)
    │                                  │
    │    ┌─────────────────────────────┘
    │    ▼
    │  Phase 5 (Backend Foundation & Token Validation Middleware)
    │    │
    │    ▼
    │  Phase 6 (DynamoDB Single-Table & Quota Service)
    │    │
    │    ├─────────────────────────────┐
    │    ▼                             ▼
    │  Phase 7 (Org Ops & Deletion)    Phase 8 (Multi-Tenant RBAC & Last-Admin)
    │    │                             │
    │    └──────────────┬──────────────┘
    │                   ▼
    │                 Phase 9 (Project Management & Atomic Quotas)
    │                   │
    └───────────────────┤
                        ▼
                      Phase 10 (Frontend Dashboard & Analytics)
                        │
                        ▼
                      Phase 11 (Audit Logging & Admin Views)
                        │
                        ▼
                      Phase 12 (AWS SAM IaC & Explicit IAM Role) ◀── APPROVAL GATE
                        │
                        ▼
                      Phase 13 (Local Integration & Build Verification)
                        │
                        ▼
                      Phase 14 (AWS Backend Deployment) ◀── APPROVAL GATE
                        │
                        ▼
                      Phase 15 (Vercel Frontend Deployment) ◀── APPROVAL GATE
                        │
                        ▼
                      Phase 16 (Live Security & E2E Testing)
                        │
                        ▼
                      Phase 17 (Performance Benchmarking & Cost Audit)
                        │
                        ▼
                      Phase 18 (Academic Documentation & FT-III Case Study)
                        │
                        ▼
                      Phase 19 (Review, Presentation & Stack Cleanup) ◀── APPROVAL GATE
```

---

## 12. Testing Strategy

### 12.1 Planned Test Target Summary

> [!NOTE]
> All test metrics represent planned **target counts**. No test is claimed as passed until executed with documented results in `TEST_RESULTS.md`.

| Test Category | Target Count | Execution Environment | Scope |
|---|---|---|---|
| **Local Unit Tests** | Target: ~55 tests | Local Vitest | Quota logic, token claim validator, Zod schemas, error parsing |
| **Mocked Integration Tests** | Target: ~40 tests | Local Vitest + DynamoDB Mocks | Handlers, transaction condition failures, backoff loops |
| **Live JWT Security Tests** | Target: ~12 tests | Live AWS Stack (`ap-south-1`) | Token signature, expiration, issuer/aud matching, token-type rejection |
| **Live API Integration Tests** | Target: ~30 tests | Live AWS Stack (`ap-south-1`) | Live quota contention, concurrent admin demotion, CORS, deletion recovery |
| **End-to-End User Scenarios** | Target: ~12 scenarios | Deployed Vercel + AWS | Complete browser-driven user journeys |

### 12.2 Critical Test Cases (Mocked vs. Dedicated Live AWS Tests)

| ID | Test Scenario | Execution Environment | Preconditions | Action | Expected Outcome |
|---|---|---|---|---|---|
| **TC-01** | Register valid account | Live E2E | Unregistered email | Submit sign-up | User created in Cognito; 6-digit confirmation code delivered |
| **TC-02** | Confirm sign-up with code | Live E2E | Unconfirmed user | Submit 6-digit code | User marked confirmed; login allowed |
| **TC-03** | Login with valid credentials | Live E2E | Confirmed user | Submit login form | SRP auth succeeds; returns valid ID and Access tokens |
| **TC-04** | Login with invalid password | Live E2E | Confirmed user | Submit wrong password | Cognito returns `NotAuthorizedException`; UI shows error |
| **TC-05** | API call with no Authorization header | Live API | Live API Gateway | `GET /api/v1/orgs` | API Gateway returns HTTP 401 Unauthorized |
| **TC-06** | API call with expired ID token | Live API | Expired ID token | Send expired token | API Gateway returns HTTP 401 Unauthorized |
| **TC-07** | API call with tampered token | Live API | Modified payload | Send tampered token | API Gateway returns HTTP 401 Unauthorized |
| **TC-08** | API call presenting Access Token | Live API | Valid Access Token | Send Access Token | **Lambda middleware rejects with HTTP 401** (`token_use !== 'id'`) |
| **TC-09** | Unverified user calls `/users/profile` | Live API | `email_verified: "false"` | `GET /api/v1/users/profile` | Allowed — returns HTTP 200 (exempt route) |
| **TC-10** | Unverified user calls `/orgs` | Live API | `email_verified: "false"` | `GET /api/v1/orgs` | Blocked by Lambda middleware — returns HTTP 403 Forbidden |
| **TC-11** | Atomic Organization Creation | Mocked Integration | Authenticated user | `POST /api/v1/orgs` | `TransactWriteItems` writes metadata, admin membership, audit |
| **TC-12** | Organization Creation Rollback | Mocked Integration | Duplicate simulated | `POST /api/v1/orgs` | Transaction fails; zero items written to database |
| **TC-13** | Member creates project within quota | Mocked Integration | 3/10 projects | `POST /api/v1/orgs/{id}/projects` | HTTP 201 Created; `projectCount` increments to 4 |
| **TC-14** | Project creation exceeding quota | Mocked Integration | 10/10 projects | `POST /api/v1/orgs/{id}/projects` | HTTP 409 Conflict ("Project quota exceeded") |
| **TC-15** | Concurrent project creation (last slot) | Mocked Integration | 9/10 projects; 2 simultaneous | 2x simultaneous POST | Exactly 1 succeeds (HTTP 201); 1 fails (HTTP 409) |
| **TC-16** | Admin demotes another Admin | Mocked Integration | 2 Admins | `PUT /members/{id}` (role: MEMBER) | HTTP 200 OK; `adminCount` decrements to 1 |
| **TC-17** | Admin attempts to demote sole Admin | Mocked Integration | 1 Admin (`adminCount: 1`) | `PUT /members/{id}` (role: MEMBER) | HTTP 400 Bad Request ("Cannot demote last admin") |
| **TC-18** | Simultaneous demotion of 2 Admins | Mocked Integration | 2 Admins; 2 simultaneous demotions | 2x simultaneous PUT | Exactly 1 succeeds (`adminCount` -> 1); 1 fails (HTTP 400) |
| **TC-19** | Admin removes sole Admin | Mocked Integration | 1 Admin (`adminCount: 1`) | `DELETE /members/{id}` | HTTP 400 Bad Request ("Cannot remove last admin") |
| **TC-20** | Soft-delete lock prevents new resources | Mocked Integration | Org status is `DELETING` | `POST /projects` or `POST /invites` | HTTP 409 Conflict (condition failed) |
| **TC-21** | BatchWriteItem backoff retry on UnprocessedItems | Mocked Integration | Throttling simulated | Org deletion Step 3 | Worker retries with exponential backoff; recovers cleanly |
| **TC-22** | Resumable org deletion after timeout | Mocked Integration | Status `DELETING`, members removed | Caller re-invokes `DELETE /orgs/{id}` | Resumption authorized via `authorizedAdminIds`; cleanup completes |
| **TC-23** | IAM execution policy validation | Local Unit | SAM template | Inspect IAM statements | Verifies `dynamodb:TransactWriteItems` and scoped logs |
| **TC-24** | API Gateway URL construction | Local Unit | Output configuration | Verify base URL + routes | Verifies zero duplicate `/v1` segments |
| **TC-25** | Build and packaging validation | Local Unit | SAM build | Run `sam build` | Verifies `.aws-sam/build/ApiHandlerFunction/index.js` generated |
| **TC-26** | **Live Project Quota Contention** | **Live AWS Stack** | Live stack; 9/10 projects | 2 concurrent POST requests | Exactly 1 returns HTTP 201; 1 returns HTTP 409 |
| **TC-27** | **Live Concurrent Admin Demotions** | **Live AWS Stack** | Live stack; 2 Admins | 2 concurrent demote PUTs | Exactly 1 returns HTTP 200; 1 returns HTTP 400 |
| **TC-28** | **Live Deletion Recovery** | **Live AWS Stack** | Live stack; simulated partial deletion | Second Admin calls DELETE | Resumption authorized via `authorizedAdminIds`; metadata purged |
| **TC-29** | **Live Allowed CORS Preflight** | **Live AWS Stack** | Origin: Vercel URL | `OPTIONS /api/v1/orgs` | HTTP 200 with `Access-Control-Allow-Origin: <VercelUrl>` |
| **TC-30** | **Live Blocked CORS Preflight** | **Live AWS Stack** | Origin: `https://malicious.com` | `OPTIONS /api/v1/orgs` | CORS allow headers withheld; blocked |

---

## 13. AWS Infrastructure as Code, Build, and Packaging

### 13.1 Build and Packaging Specification

- **Source Code Directory:** `backend/src/`
- **Entrypoint:** `backend/src/index.ts`
- **Compilation Engine:** `esbuild` executed natively via AWS SAM CLI (`Metadata: BuildMethod: esbuild`).
- **Configuration:**
  - Target: `node22` / `es2022`
  - Platform: `node`
  - Architecture: `arm64`
  - Sourcemaps: enabled
  - Minification: enabled
- **Acceptance Test:** In Phase 13, `sam build` must execute cleanly and generate `.aws-sam/build/ApiHandlerFunction/index.js` with all handler exports present (verified by TC-25).

### 13.2 AWS SAM Infrastructure Template (`template.yaml`)

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Transform: AWS::Serverless-2016-10-31
Description: Multi-Tenant SaaS Workspace with Cognito Auth and Quota Management

Parameters:
  AllowedCorsOrigin:
    Type: String
    Default: 'http://localhost:5173'
    Description: Allowed origin for CORS headers (Vercel deployment URL)

Resources:
  # ============================================================================
  # 1. Amazon Cognito Identity Infrastructure
  # ============================================================================
  UserPool:
    Type: AWS::Cognito::UserPool
    Properties:
      UserPoolName: !Sub "${AWS::StackName}-user-pool"
      UsernameAttributes:
        - email
      AutoVerifiedAttributes:
        - email
      Policies:
        PasswordPolicy:
          MinimumLength: 8
          RequireLowercase: true
          RequireNumbers: true
          RequireSymbols: false
          RequireUppercase: true
          TemporaryPasswordValidityDays: 7
      AccountRecoverySetting:
        RecoveryMechanisms:
          - Name: verified_email
            Priority: 1
      EmailConfiguration:
        EmailSendingAccount: COGNITO_DEFAULT # 50 emails/day free allowance
      AdminCreateUserConfig:
        AllowAdminCreateUserOnly: false

  UserPoolClient:
    Type: AWS::Cognito::UserPoolClient
    Properties:
      ClientName: !Sub "${AWS::StackName}-web-client"
      UserPoolId: !Ref UserPool
      GenerateSecret: false # Browser client MUST NOT have a secret
      ExplicitAuthFlows:
        - ALLOW_USER_SRP_AUTH
        - ALLOW_REFRESH_TOKEN_AUTH
      PreventUserExistenceErrors: ENABLED
      AccessTokenValidity: 60
      IdTokenValidity: 60
      RefreshTokenValidity: 30
      TokenValidityUnits:
        AccessToken: minutes
        IdToken: minutes
        RefreshToken: days

  # ============================================================================
  # 2. Amazon API Gateway HTTP API ($default Stage - No Stage Prefix)
  # ============================================================================
  HttpApi:
    Type: AWS::Serverless::HttpApi
    Properties:
      StageName: "$default" # Root path without stage segment avoids /v1 duplicate
      CorsConfiguration:
        AllowOrigins:
          - !Ref AllowedCorsOrigin
          - 'http://localhost:5173'
        AllowMethods:
          - GET
          - POST
          - PUT
          - DELETE
          - OPTIONS
        AllowHeaders:
          - Content-Type
          - Authorization
        MaxAge: 300
      Auth:
        DefaultAuthorizer: CognitoJwtAuthorizer
        Authorizers:
          CognitoJwtAuthorizer:
            IdentitySource: "$request.header.Authorization"
            JwtConfiguration:
              issuer: !Sub "https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}"
              audience:
                - !Ref UserPoolClient

  # ============================================================================
  # 3. Explicit Least-Privilege IAM Execution Role & Scoped Log Group
  # ============================================================================
  ApiHandlerLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub "/aws/lambda/${AWS::StackName}-api-handler"
      RetentionInDays: 7

  ApiHandlerExecutionRole:
    Type: AWS::IAM::Role
    Properties:
      RoleName: !Sub "${AWS::StackName}-api-handler-role"
      AssumeRolePolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Principal:
              Service: lambda.amazonaws.com
            Action: sts:AssumeRole
      Policies:
        - PolicyName: DynamoDBTableAccess
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - dynamodb:GetItem
                  - dynamodb:PutItem
                  - dynamodb:UpdateItem
                  - dynamodb:DeleteItem
                  - dynamodb:Query
                  - dynamodb:BatchWriteItem
                  - dynamodb:TransactWriteItems
                Resource:
                  - !GetAtt SaaSWorkspaceTable.Arn
                  - !Sub "${SaaSWorkspaceTable.Arn}/index/*"
        - PolicyName: ScopedCloudWatchLogging
          PolicyDocument:
            Version: '2012-10-17'
            Statement:
              - Effect: Allow
                Action:
                  - logs:CreateLogStream
                  - logs:PutLogEvents
                Resource:
                  - !Sub "${ApiHandlerLogGroup.Arn}:*"

  # ============================================================================
  # 4. AWS Lambda API Compute Function
  # ============================================================================
  ApiHandlerFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub "${AWS::StackName}-api-handler"
      Role: !GetAtt ApiHandlerExecutionRole.Arn # Explicit least-privilege role
      CodeUri: backend/
      Handler: index.handler
      Runtime: nodejs22.x
      Architectures:
        - arm64
      MemorySize: 256
      Timeout: 15
      Environment:
        Variables:
          TABLE_NAME: !Ref SaaSWorkspaceTable
          ALLOWED_ORIGIN: !Ref AllowedCorsOrigin
          COGNITO_USER_POOL_ID: !Ref UserPool
          COGNITO_CLIENT_ID: !Ref UserPoolClient
          NODE_OPTIONS: "--enable-source-maps"
      Events:
        ApiEvent:
          Type: HttpApi
          Properties:
            ApiId: !Ref HttpApi
            Path: /{proxy+}
            Method: ANY
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: true
        Target: es2022
        Sourcemap: true
        EntryPoints:
          - src/index.ts

  # ============================================================================
  # 5. Amazon DynamoDB Single-Table Storage
  # ============================================================================
  SaaSWorkspaceTable:
    Type: AWS::DynamoDB::Table
    Properties:
      TableName: !Sub "${AWS::StackName}-table"
      BillingMode: PROVISIONED
      ProvisionedThroughput:
        ReadCapacityUnits: 5
        WriteCapacityUnits: 5
      AttributeDefinitions:
        - AttributeName: PK
          AttributeType: S
        - AttributeName: SK
          AttributeType: S
        - AttributeName: GSI1PK
          AttributeType: S
        - AttributeName: GSI1SK
          AttributeType: S
        - AttributeName: GSI2PK
          AttributeType: S
        - AttributeName: GSI2SK
          AttributeType: S
      KeySchema:
        - AttributeName: PK
          KeyType: HASH
        - AttributeName: SK
          KeyType: RANGE
      GlobalSecondaryIndexes:
        - IndexName: GSI1
          KeySchema:
            - AttributeName: GSI1PK
              KeyType: HASH
            - AttributeName: GSI1SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
          ProvisionedThroughput:
            ReadCapacityUnits: 5
            WriteCapacityUnits: 5
        - IndexName: GSI2
          KeySchema:
            - AttributeName: GSI2PK
              KeyType: HASH
            - AttributeName: GSI2SK
              KeyType: RANGE
          Projection:
            ProjectionType: ALL
          ProvisionedThroughput:
            ReadCapacityUnits: 5
            WriteCapacityUnits: 5

Outputs:
  UserPoolId:
    Description: Cognito User Pool ID
    Value: !Ref UserPool
    Export:
      Name: !Sub "${AWS::StackName}-UserPoolId"

  UserPoolClientId:
    Description: Cognito App Client ID (Public Browser Client)
    Value: !Ref UserPoolClient
    Export:
      Name: !Sub "${AWS::StackName}-UserPoolClientId"

  HttpApiUrl:
    Description: Base URL of the API Gateway HTTP API
    Value: !Sub "https://${HttpApi}.execute-api.${AWS::Region}.amazonaws.com"
    Export:
      Name: !Sub "${AWS::StackName}-HttpApiUrl"

  TableName:
    Description: DynamoDB Table Name
    Value: !Ref SaaSWorkspaceTable
```

---

## 14. Vercel Frontend Deployment

### 14.1 Deployment Configuration & Terms Compliance

The React Single Page Application is deployed on the **Vercel Hobby plan**:
- **Terms Compliance:** Vercel Hobby is permitted and used strictly because this project is a **non-commercial academic demonstration** compliant with Vercel's Terms of Service.
- Framework Preset: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

### 14.2 Environment Variables Configured in Vercel Dashboard

| Variable Name | Value Source | Example Value |
|---|---|---|
| `VITE_COGNITO_USER_POOL_ID` | SAM Stack Output `UserPoolId` | `ap-south-1_aB1c2D3eF` |
| `VITE_COGNITO_CLIENT_ID` | SAM Stack Output `UserPoolClientId` | `4abcdefg123456789hijklmnop` |
| `VITE_AWS_REGION` | Fixed deployment region | `ap-south-1` |
| `VITE_API_BASE_URL` | Stack Output `HttpApiUrl` + `/api/v1` | `https://xxxxxx.execute-api.ap-south-1.amazonaws.com/api/v1` |

---

## 15. Performance and Scalability Targets

> [!IMPORTANT]
> All figures below represent **engineering target ranges** based on standard AWS service characteristics in `ap-south-1`. They are **not yet measured**. Real latency percentiles (p50, p90, p99) will be collected during Phase 17 and documented in the final report.

| Component / Operation | Target Range | Notes |
|---|---|---|
| **Cognito SRP Authentication** | Target: 150–350ms | Client cryptographic calculation and token issuance |
| **API Gateway Overhead** | Target: 10–25ms | JWT signature check against cached JWKS and route matching |
| **Lambda Cold Start** | Target: 350–750ms | ARM64 architecture, minimal dependencies, esbuild bundling |
| **Lambda Warm Invocation** | Target: 15–45ms | Execution time of pure application handler logic |
| **DynamoDB Point Read (`GetItem`)** | Target: 2–5ms | Point read on Base Table |
| **DynamoDB Transaction (`TransactWriteItems`)** | Target: 20–45ms | Atomic condition validation and multiple item writes |
| **Total Warm API Latency (p95)** | Target: 90–220ms | Client (browser) -> API Gateway -> Lambda -> DynamoDB |
| **Total Cold API Latency (p95)** | Target: 600–1100ms | Includes Lambda runtime initialization and DocumentClient connect |

---

## 16. Cost Analysis and Billing Safeguards

### 16.1 AWS Account Plans and Free Tier Classification

1. **AWS Free vs. Paid Account Plans:**
   - **AWS Free Accounts (New Accounts ≤ 12 months):** Eligible for 12-Month Free Tier benefits, including 1,000,000 API Gateway HTTP API requests/month.
   - **AWS Paid Accounts (Accounts > 12 months):** 12-Month Free Tier expires. HTTP API requests are charged at $1.00 per million requests (~$0.003 for ~3,000 academic test requests). This cost is credit-eligible.
   - **Always Free Services:** DynamoDB (25 RCU/WCU, 25 GB) and AWS Lambda (1M requests, 400k GB-s) remain permanently free across both Free and Paid accounts.
   - **No Service Guaranteed Free Indefinitely:** Services are only free within defined capacity thresholds and trial windows.
2. **Amazon Cognito Pricing & Legacy Free Tier Eligibility:**
   - **Legacy Accounts / User Pools (Created BEFORE November 21, 2024):** Eligible for **50,000 Monthly Active Users (MAUs)** free tier.
   - **Current Accounts / User Pools (Created ON OR AFTER November 21, 2024):** Eligible for **10,000 MAUs** free tier.
   - Under both tiers, academic testing (~5 test users) incurs **$0.00**.
   - **Default Email Delivery:** Cognito's built-in email delivery (`COGNITO_DEFAULT`) is free for up to **50 emails/day**.
3. **Mandatory Billing Verification:**
   - Exact remaining credit balance, expiration date, and service category eligibility must be verified in the AWS Billing Console before Phase 14 deployment.

### 16.2 Estimated Monthly Cost Breakdown for Academic Workload

| Service | Monthly Usage | Free Tier Allocation | Estimated Cost (Within Trial) | Estimated Cost (Post-Trial) |
|---|---|---|---|---|
| **Amazon Cognito User Pools** | ~5 MAU, ~15 emails/day | 10k MAU + 50 emails/day | **$0.00** | **$0.00** |
| **AWS Lambda** | ~3,000 requests, 256MB | 1M req + 400k GB-s Always Free | **$0.00** | **$0.00** |
| **Amazon DynamoDB** | 15 RCU / 15 WCU | 25 RCU / 25 WCU Always Free | **$0.00** | **$0.00** |
| **API Gateway HTTP API** | ~3,000 requests | 1M requests (12-Month Trial) | **$0.00** | ~$0.003 (credit-eligible) |
| **CloudWatch Logs** | ~20 MB ingestion (7-day ret.)| 5 GB ingestion Always Free | **$0.00** | **$0.00** |
| **Vercel Hosting** | Static SPA | Hobby Plan (Non-Commercial Academic) | **$0.00** | **$0.00** |
| **TOTAL ESTIMATED COST** | | | **$0.00** | **~$0.003** |

### 16.3 AWS Budget Alert Limitation

> [!WARNING]
> An **AWS Budget alert is NOT a hard spending cap**. It sends an automated email notification when costs approach or exceed $5.00/month. It **does not stop AWS services**. The account owner must act manually upon receiving an alert.

---

## 17. AWS Credit Protection and Cleanup

### 17.1 Pre-Deployment Verification Checklist

Before initiating Phase 14 (`sam deploy`):
- [ ] Log in to AWS Console -> Billing -> Credits. Document exact remaining credit balance, expiration date, and service applicability.
- [ ] Open DynamoDB Console in `ap-south-1`. Confirm no pre-existing tables occupy RCU/WCU capacity.
- [ ] Verify that AWS account has IAM permissions to create roles and policies.
- [ ] Confirm AWS Budget is configured to alert at $5.00.

### 17.2 Complete Cloud Resource Teardown Checklist

| Step | Action | Command / Location | Verification |
|---|---|---|---|
| **1. AWS Stack Teardown** | Delete the entire serverless stack | `sam delete --stack-name saas-workspace --region ap-south-1` | CloudFormation stack status is `DELETE_COMPLETE`. |
| **2. Cognito Teardown** | Automatic via SAM | Deleted as part of CloudFormation stack | User Pool and App Client removed. |
| **3. DynamoDB Teardown** | Automatic via SAM | Deleted as part of CloudFormation stack | `SaaSWorkspace-table` removed. |
| **4. CloudWatch Logs** | Automatic via SAM | Deleted as part of CloudFormation stack | Log group removed. |
| **5. Vercel Project Teardown** | Delete frontend project | Vercel Project Settings -> Delete Project | Domain de-provisioned. |
| **6. Local Credentials** | Clear temporary CLI credentials | `aws configure list` | Verify no credentials remain active. |

---

## 18. FT-III Assessment Mapping

| FT-III Assessment Area | Syllabus Concept Demonstrated | Concrete Implementation Evidence in v1.4 |
|---|---|---|
| **Area 1: Problem Analysis & Cloud Architecture** | Multi-tenant SaaS architectural patterns | Section 4: System Architecture; Section 7: DynamoDB single-table logical partition isolation |
| | Cloud Service Models (SaaS, PaaS, IaaS) | Section 2: Comparison table; Section 6: Service justification (Serverless FaaS, PaaS Vercel, Managed DB) |
| | Native Cloud Identity Architecture | Section 5: Amazon Cognito User Pools, Secure Remote Password (SRP) flow, native JWT validation |
| | Architectural Security & Least Privilege | Section 8: Route Authorization Matrix, explicit IAM execution role without wildcard log stream permissions |
| | Cloud Economics & Capacity Planning | Section 16: Free tier analysis, MAU calculations, 15 RCU/WCU capacity allocation within 25 RCU/WCU limit |
| **Area 2: Technical Execution & Implementation** | Modern Web Frontend Engineering | React 18, TypeScript strict mode, Bootstrap 5, AWS Amplify Auth v6 integration, responsive layouts |
| | Serverless Compute & API Gateways | AWS Lambda (Node.js 22.x, ARM64), Amazon API Gateway HTTP API with native JWT authorizer ($default stage) |
| | High-Performance NoSQL Database Design | DynamoDB single table, composite primary keys (`PK`, `SK`), sparse global secondary indexes (`GSI1`, `GSI2`), base-table invite pointers |
| | Distributed Concurrency & Transactions | DynamoDB `TransactWriteItems` conditional updates preventing race conditions in quota management and admin demotions |
| | Infrastructure as Code (IaC) | Declarative `template.yaml` provisioning 100% of AWS infrastructure with explicit IAM role |
| **Area 3: Results, Testing & Cloud Evaluation** | Cryptographic & Security Verification | Section 12: TC-05 to TC-10 live tests validating JWT signatures, claims, expiry, and email verification |
| | Multi-Tenant Data Isolation Testing | TC-10 cross-tenant penetration test; TC-20 to TC-22 staged deletion proving zero orphaned data |
| | Concurrency & Atomic Quota Testing | TC-26 & TC-27 live AWS tests proving quota contention and admin protection under concurrency |
| | Cloud Latency & Performance Analysis | Section 15: Warm vs cold start latency target benchmarks |
| | Academic Case Study & Documentation | Comprehensive `README.md`, `ARCHITECTURE.md`, `DEPLOYMENT.md`, and `CLEANUP.md` |

---

## 19. Deliverables Checklist

- [x] Comprehensive Implementation Plan v1.4 (this document).
- [ ] Phase 2: Git repository initialized with strict `.gitignore` and `.env.example`.
- [ ] Phase 3 & 4: React frontend with Bootstrap 5 and AWS Amplify Auth v6 custom forms.
- [ ] Phase 5 & 6: TypeScript Lambda backend with DynamoDB DocumentClient and atomic `quotaService`.
- [ ] Phase 7, 8 & 9: Organization, membership, and project CRUD handlers with resumable org deletion.
- [ ] Phase 10 & 11: Analytics dashboard, quota progress bars, and audit log table.
- [ ] Phase 12: Declarative AWS SAM template (`template.yaml`) with explicit least-privilege IAM role.
- [ ] Phase 13: Local test targets and build verification tests executing cleanly.
- [ ] Phase 14: AWS backend deployed to `ap-south-1` via `sam deploy`.
- [ ] Phase 15: React frontend deployed to Vercel Hobby (academic non-commercial).
- [ ] Phase 16: Live security and end-to-end test execution report (`TEST_RESULTS.md`).
- [ ] Phase 17: Measured performance benchmarks and billing verification.
- [ ] Phase 18: Academic case study documentation for FT-III submission.
- [ ] Phase 19: Comprehensive cleanup guide (`CLEANUP.md`).

---

## 20. Open Decisions and Assumptions

### Confirmed Technical Decisions

1. **Amazon Cognito User Pools:** Confirmed as the sole authentication provider.
2. **No Cognito Identity Pools:** Confirmed. Frontend communicates exclusively via API Gateway.
3. **AWS Amplify Auth v6 Selected:** Confirmed for modular bundle size and client-side SRP security.
4. **Custom UI Selected:** Confirmed. Seamless React + Bootstrap 5 user experience without Hosted UI.
5. **Token Selection & Middleware Validation:** Confirmed. ID token sent by client; Lambda middleware rejects `token_use !== 'id'`.
6. **URL Consistency:** Confirmed. `$default` stage on HTTP API with `/api/v1/...` routes in Lambda and frontend.
7. **Explicit Least-Privilege IAM Role:** Confirmed. Custom `ApiHandlerExecutionRole` with scoped table/index ARNs and log stream ARNs; zero wildcard log stream permissions.
8. **Authoritative Quota Values:** Confirmed. Free: 5/10, Standard: 25/50, Premium: 100/200.
9. **Atomic Last-Admin Protection:** Confirmed. `adminCount` maintained on org metadata and validated in transactions.
10. **Resumable Org Deletion:** Confirmed. Staged workflow with `authorizedAdminIds` recovery check, base-table invite pointers, and exponential backoff on `BatchWriteItem`.
11. **Vercel Hobby Compliance:** Confirmed for non-commercial academic demonstration.

### Assumptions to Verify Prior to Cloud Deployment

1. **AWS Credit Balance & Expiry:** Confirm exact remaining balance, expiry date, and eligible service categories in AWS Console before Phase 14.
2. **Pre-Existing DynamoDB Tables:** Verify no other tables in `ap-south-1` consume RCU/WCU capacity.
3. **FT-III Submission Date:** Exact submission deadline will be recorded once provided by the academic institution.

---

## Appendix A — Architecture Change: Firebase Removal Inventory

| Category | Removed Firebase Item | Replaced By in v1.4 Architecture |
|---|---|---|
| **Identity Service** | Firebase Authentication (Google Cloud) | **Amazon Cognito User Pools (AWS Native)** |
| **Frontend SDK** | `firebase` npm package | **`aws-amplify/auth` v6 npm package** |
| **Backend / Admin SDK** | `firebase-admin` npm package | **Not needed** (API Gateway validates tokens; no server SDK required) |
| **CLI Tooling** | `firebase-tools` CLI | **AWS SAM CLI (`sam build`, `sam deploy`)** |
| **Project Management** | Google Cloud / Firebase Console Project | **AWS CloudFormation / SAM Stack in `ap-south-1`** |
| **Public Config Var** | `VITE_FIREBASE_API_KEY` | **Removed** |
| **Public Config Var** | `VITE_FIREBASE_AUTH_DOMAIN` | **`VITE_AWS_REGION=ap-south-1`** |
| **Public Config Var** | `VITE_FIREBASE_PROJECT_ID` | **`VITE_COGNITO_USER_POOL_ID`** |
| **Public Config Var** | `VITE_FIREBASE_STORAGE_BUCKET` | **Removed** |
| **Public Config Var** | `VITE_FIREBASE_MESSAGING_SENDER_ID` | **Removed** |
| **Public Config Var** | `VITE_FIREBASE_APP_ID` | **`VITE_COGNITO_CLIENT_ID`** |
| **Authorizer Issuer URL** | `https://securetoken.google.com/<projectId>` | **`https://cognito-idp.${AWS::Region}.amazonaws.com/${UserPool}`** |
| **Authorizer Audience** | `<projectId>` | **`!Ref UserPoolClient`** |
| **Deployment Pipeline**| Two-stage (Firebase Console + AWS SAM) | **Single-stage (100% AWS SAM `template.yaml`)** |

---

## Appendix B — Technical Corrections and Revision Summary

### Summary of v1.4 Mandatory Corrections

1. **Explicit IAM Role:** Replaced SAM implicit execution role with an explicit `AWS::IAM::Role` (`ApiHandlerExecutionRole`), removing all wildcard CloudWatch Logs permissions (`AWSLambdaBasicExecutionRole` eliminated). Scoped table permissions to table/index ARNs and log permissions strictly to the function's log group stream ARNs.
2. **Resumable Organization Deletion Recovery:** Stored `authorizedAdminIds` (StringSet of all active Admin UIDs) on `ORG#<orgId> / METADATA` when deletion starts. If membership items are purged during cleanup, `tenantMiddleware` checks `authorizedAdminIds` to allow **any authorized Admin** from that organization to safely resume/retry cleanup, even if the original initiating Admin is unavailable.
3. **Robust Deletion Handling:** Specified exponential backoff with jitter for `BatchWriteItem` `UnprocessedItems` (up to 5 retries); mandated strongly consistent base-table reads (`ConsistentRead: true`) for authoritative deletion; added a final verification check before metadata deletion to guarantee zero orphaned records.
4. **Authoritative Quota Values & GSI Details:** Restored explicit Free (5 members / 10 projects), Standard (25 members / 50 projects), and Premium (100 members / 200 projects) constants; documented exact GSI key schemas, sparse projection, query patterns, and asynchronous consistency limitations.
5. **Dedicated Live AWS Testing:** Added dedicated live AWS test cases for project quota contention (TC-26), concurrent Admin demotions (TC-27), deletion recovery (TC-28), and allowed/blocked CORS preflights (TC-29/TC-30). Relabeled all test metrics as targets.
6. **Cost, Free-Tier, and Vercel Terms Accuracy:** Distinguished AWS Free Accounts (new accounts with 12-month trials) from AWS Paid Accounts; clarified Cognito legacy 50k MAU (pre-Nov 21, 2024) vs current 10k MAU eligibility; explicitly stated Vercel Hobby is used for a non-commercial academic demonstration; mandated pre-deployment billing verification.

---

### Readiness for Review and Next Steps

The revised Multi-Tenant SaaS Workspace Implementation Plan (version 1.4) is technically corrected, fully specified, and **Awaiting Approval**.

**Next Step Requiring Your Explicit Approval:**
Upon your explicit approval of Implementation Plan v1.4, we will proceed to **Phase 2: Repository Setup & Tooling** (initializing the Git repository, setting up TypeScript/ESLint/Prettier, configuring esbuild, and creating base package manifests). No code, dependencies, or cloud resources will be created until you approve this plan.
