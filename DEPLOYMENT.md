# Multi-Tenant SaaS Workspace — Deployment Guide

**Project Title:** Multi-Tenant SaaS Workspace with Resource Quota Management Using Amazon Cognito, React, AWS Amplify Hosting, and AWS Serverless  
**Target AWS Region:** `ap-southeast-2` (Asia Pacific — Sydney)  
**Architecture:** 100% AWS Cloud Hosted (Frontend on AWS Amplify Hosting, Backend on AWS Serverless)  
**CloudFormation Stack:** `saas-workspace-stack`  
**Current Status:** Fully Deployed & Verified Live (Backend in `ap-southeast-2`, Frontend on AWS Amplify Hosting)  
**Live Frontend Application:** [https://main.d2h2pxsqugbcgb.amplifyapp.com](https://main.d2h2pxsqugbcgb.amplifyapp.com/)  
**Live API Endpoint:** `https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com/api/v1`  

---

## Table of Contents
1. [Architecture Overview & Hosting Decision](#1-architecture-overview--hosting-decision)
2. [Live CloudFormation Backend Outputs (Deployed)](#2-live-cloudformation-backend-outputs-deployed)
3. [Phase 16: Live Backend Integration Verification](#3-phase-16-live-backend-integration-verification)
4. [Phase 17: AWS Amplify Frontend Hosting Specification](#4-phase-17-aws-amplify-frontend-hosting-specification)
5. [SPA Routing & Rewrites Configuration](#5-spa-routing--rewrites-configuration)
6. [Backend CORS Alignment Protocol](#6-backend-cors-alignment-protocol)
7. [Expected Charges & Free Tier Eligibility](#7-expected-charges--free-tier-eligibility)
8. [Complete Teardown & Cost Containment](#8-complete-teardown--cost-containment)

---

## 1. Architecture Overview & Hosting Decision

In accordance with architectural updates, the frontend will be hosted entirely within AWS using **AWS Amplify Hosting** rather than third-party hosting (Vercel). This provides:
- **Unified AWS Infrastructure:** Both frontend web assets and backend serverless APIs reside within the same AWS ecosystem and security perimeter.
- **Global Edge Acceleration:** Managed global CDN edge distribution for static assets.
- **Automated Monorepo Builds:** Continuous integration and deployment directly from the repository.
- **Native Single-Page App (SPA) Handling:** Managed URL rewrites to `/index.html` preventing 404 errors on deep-link routes.

---

## 2. Live CloudFormation Backend Outputs (Deployed)

The backend serverless infrastructure has been provisioned in region `ap-southeast-2`:

| Output Parameter | AWS Resource | Actual Live Value |
|---|---|---|
| **`HttpApiUrl`** | API Gateway HTTP API v2 | `https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com` |
| **`UserPoolId`** | Amazon Cognito User Pool | `ap-southeast-2_EFWnRtGuA` |
| **`UserPoolClientId`** | Cognito App Client (Public Web) | `4b7blb7ojmv1drb91715i2676` |
| **`TableName`** | DynamoDB Single-Table | `saas-workspace-stack-table` |

---

## 3. Phase 16: Live Backend Integration Verification

Prior to provisioning any frontend hosting resources, the live AWS backend must pass end-to-end integration tests:
1. **Cognito User Onboarding:** Programmatically register a test user in Cognito User Pool `ap-southeast-2_EFWnRtGuA`, confirm the account, and authenticate via SRP flow to obtain JWT ID and Access tokens.
2. **Authenticated API Calls:** Dispatch signed HTTP requests with `Authorization: Bearer <token>` to `https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com/api/v1/users/profile`.
3. **Tenant & Quota Execution:** Create a test organization, enforce Free Tier limits (10 projects, 5 members), and verify live DynamoDB persistence in `saas-workspace-stack-table`.
4. **Audit Trail Verification:** Query audit logs to verify events are correctly logged to DynamoDB and CloudWatch.

---

## 4. Phase 17: AWS Amplify Frontend Hosting Specification

### Monorepo Build Configuration (`amplify.yml`)
The root `amplify.yml` defines the monorepo build pipeline:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm ci
    build:
      commands:
        - npm run build:frontend
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - frontend/node_modules/**/*
```

### Frontend Environment Variables
All frontend variables are public client identifiers (zero secrets or private keys):
```dotenv
VITE_AWS_REGION=ap-southeast-2
VITE_COGNITO_USER_POOL_ID=ap-southeast-2_EFWnRtGuA
VITE_COGNITO_CLIENT_ID=4b7blb7ojmv1drb91715i2676
VITE_API_BASE_URL=https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com/api/v1
VITE_USE_MOCK_AUTH=false
```

---

## 5. SPA Routing & Rewrites Configuration

In AWS Amplify Hosting, React Router client-side routes (e.g. `/login`, `/dashboard`, `/projects`, `/settings`, `/members`) require an explicit redirect rule so refreshing deep URLs does not return a 404:

```json
[
  {
    "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>",
    "target": "/index.html",
    "status": "200",
    "condition": null
  }
]
```

---

## 6. Backend CORS Alignment Protocol

Once the Amplify App is created and its default domain is issued (`https://<branch>.<appid>.amplifyapp.com`):
1. Review the generated Amplify HTTPS URL.
2. Update `saas-workspace-stack` via SAM deploy:
   ```bash
   node scripts/sam-runner.cjs deploy \
     --stack-name saas-workspace-stack \
     --region ap-southeast-2 \
     --resolve-s3 \
     --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
     --parameter-overrides AllowedCorsOrigin=https://<branch>.<appid>.amplifyapp.com
   ```
3. This change is strictly executed **only after** identifying the live Amplify domain and user approval.

---

## 7. Expected Charges & Free Tier Eligibility

### AWS Amplify Hosting Free Tier (12 Months)
- **Build minutes:** 1,000 build minutes per month included.
- **Hosted storage:** 15 GB per month included (our `dist/` is ~1.5 MB).
- **Data transfer out:** 15 GB per month included.
- **Standard Post-Free Tier Pricing:** $0.01/build minute, $0.023/GB storage/month, $0.15/GB served.
- **Assessment Workload:** Expected cost is **$0.00 USD** within Free Tier / educational credits.

---

## 8. Complete Teardown & Cost Containment

To cleanly delete all provisioned AWS cloud resources (backend and frontend):

```powershell
# 1. Delete backend CloudFormation stack
node scripts/sam-runner.cjs delete --stack-name saas-workspace-stack --region ap-southeast-2 --no-prompts

# 2. Delete Amplify Hosting App (when provisioned)
aws amplify delete-app --app-id <your-app-id> --region ap-southeast-2
```
