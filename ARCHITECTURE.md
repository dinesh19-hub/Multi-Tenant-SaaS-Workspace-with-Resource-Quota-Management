# Multi-Tenant SaaS Workspace — Architecture Design Document

> **Notice:** The comprehensive, fully detailed architecture document with complete Mermaid sequence diagrams, failure mode analysis, and threat models is maintained in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

**Project Title:** Multi-Tenant SaaS Workspace with Resource Quota Management (`SaaSWorkspace`)  
**Author:** Dinesh Konda  
**Target AWS Region:** `ap-southeast-2` (Asia Pacific — Sydney)  
**Live Deployed Frontend:** [https://main.d2h2pxsqugbcgb.amplifyapp.com](https://main.d2h2pxsqugbcgb.amplifyapp.com/)  
**Live API Endpoint:** `https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com/api/v1`  
**Architecture:** 100% AWS Serverless (AWS Amplify Hosting + API Gateway HTTP API v2 + AWS Lambda + Amazon DynamoDB Single-Table)  

---

## Architectural Summary

1. **Logical Tenant Data Isolation:** All tenant data items are isolated through partition key scoping (`PK=ORG#<orgId>`). DynamoDB's partition hashing guarantees that data cannot be queried across tenants without authorization.
2. **Server-Side Atomic Quota Enforcement:** Resource ceilings (Free: 10 projects / 5 members; Standard: 50 projects / 25 members; Premium: 200 projects / 100 members) are enforced using DynamoDB `TransactWriteItems` with condition expressions (`projectCount < maxProjects`).
3. **Identity & Authentication:** Amazon Cognito User Pools with Secure Remote Password (SRP) authentication via AWS Amplify Auth v6. Mandatory 6-digit confirmation code email verification.
4. **API Gateway & Claims Validation:** API Gateway HTTP API v2 ($default stage) validates JWT signatures; backend `authMiddleware` validates `token_use === 'id'` and `email_verified === 'true'`.
5. **Least Privilege IAM:** Custom IAM execution role (`ApiHandlerExecutionRole`) scoped strictly to the table ARN and log stream ARNs.

For in-depth documentation, key schema matrices, and diagrams, see **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.
