# Multi-Tenant SaaS Workspace — Testing & Quality Guide

This guide details the testing architecture, validation commands, and test suites for **Multi-Tenant SaaS Workspace with Resource Quota Management** (`SaaSWorkspace`).

---

## 1. Test Suite Summary & Real Test Totals

The repository contains **75 automated tests** across **20 test suites** with a 100% pass rate:

| Test Suite Category | Framework | Test Files | Total Tests | Execution Environment |
|:---|:---|:---:|:---:|:---|
| **Frontend UI & Components** | Vitest + React Testing Library | 3 | **14** | Local jsdom |
| **Backend Handlers & Domain Logic** | Vitest + TypeScript | 17 | **61** | Local Node.js |
| **Infrastructure Validation** | AWS SAM CLI + cfn-lint | 1 | — | Local & CI |
| **Live AWS End-to-End Verification** | Node.js E2E Test Runner | 1 | 11 phases | Real AWS Cloud (ap-southeast-2) |

---

## 2. Running Tests Locally

### Prerequisites
- Node.js v22.x LTS
- npm v10+

### Primary Test Commands

```bash
# Run all 75 automated tests across frontend and backend workspaces
npm test

# Run frontend tests only (14 tests)
npm run test:frontend

# Run backend tests only (61 tests)
npm run test:backend

# TypeScript typechecking across all workspaces (zero errors)
npm run typecheck

# Code quality and linting verification
npm run lint

# Production build verification (frontend Vite + backend esbuild)
npm run build

# AWS SAM infrastructure template validation (syntax & policies)
npm run validate:sam

# AWS SAM serverless bundle build
npm run build:sam
```

---

## 3. Test Suites & Coverage Breakdown

### 3.1 Frontend Test Suites (`frontend/src/tests/`)
- **`App.test.tsx` (4 tests):** Validates top-level navigation, sidebar rendering, responsive brand header, and view switching.
- **`auth.test.tsx` (7 tests):** Exercises login form controls, registration form inputs, error toast notifications, and authentication provider context switching.
- **`workspaceIntegration.test.tsx` (3 tests):** Validates project creation modal dialogs, member roster views, and quota progress meter rendering.

### 3.2 Backend Test Suites (`backend/tests/`)
- **API Security & Tenant Isolation (`apiSecurity.test.ts`, 6 tests):** Validates that users cannot read or modify resources belonging to partitions (`ORG#<orgId>`) they do not belong to.
- **Authentication Middleware (`authMiddleware.test.ts`, 9 tests):** Verifies that access tokens are rejected, unverified email claims are blocked with HTTP 403, and valid ID tokens extract user identity.
- **Resource Quota Enforcement (`quotaService.test.ts`, 9 tests):** Exercises quota limit checks, tier transitions, and DynamoDB condition failures when resource ceilings are reached.
- **Concurrency & Race Conditions (`concurrency.test.ts`, 2 tests):** Simulates parallel resource creation requests to verify that condition expressions block double-spending or quota overflow.
- **Member Quota Management (`memberQuota.test.ts`, 4 tests):** Validates member invitation quotas and role restrictions.
- **Cascading Deletion & Recovery (`deletionAndRecovery.test.ts`, 4 tests & `orgDeleteService.test.ts`, 3 tests):** Verifies the 7-step resumable deletion engine, ensuring no orphaned projects or members remain.
- **API Validation (`apiValidation.test.ts`, 5 tests):** Validates request payload schemas, email format checks, and error responses.
- **Domain Handlers:**
  - `orgHandler.test.ts` (1 test)
  - `projectHandler.test.ts` (2 tests)
  - `memberHandler.test.ts` (2 tests)
  - `analyticsHandler.test.ts` (1 test)
  - `userHandler.test.ts` (3 tests)
  - `dynamoRepository.test.ts` (2 tests)
  - `router.test.ts` (4 tests)
  - `iacTemplate.test.ts` (3 tests)
  - `index.test.ts` (1 test)

---

## 4. Local Mock Mode vs. Live AWS Testing

To facilitate rapid frontend development and peer evaluation without needing an active AWS subscription:

### 4.1 Local Mock Mode
Set the mock flag in `frontend/.env`:
```dotenv
VITE_USE_MOCK_AUTH=true
```
When enabled, the frontend bypasses Cognito network calls and uses an in-memory authentication state and mock workspace store.
- **Limitations:** Does not validate real DynamoDB conditional writes, actual JWT cryptographic signatures, or AWS network latency.

### 4.2 Live AWS Testing
Configure `frontend/.env` with real CloudFormation outputs:
```dotenv
VITE_AWS_REGION=ap-southeast-2
VITE_COGNITO_USER_POOL_ID=ap-southeast-2_EFWnRtGuA
VITE_COGNITO_CLIENT_ID=4b7blb7ojmv1drb91715i2676
VITE_API_BASE_URL=https://sdu2useqyb.execute-api.ap-southeast-2.amazonaws.com/api/v1
VITE_USE_MOCK_AUTH=false
```
All API calls are transmitted over HTTPS to API Gateway HTTP API v2 in Sydney, validated against Cognito JWKS, and stored in the live DynamoDB single table.

---

## 5. Live End-to-End Verification Pipeline

The repository includes an end-to-end integration test runner:
```bash
node scripts/test-e2e-amplify-flow.mjs
```

This script exercises the full 11-phase cloud lifecycle against real AWS services:
1. **Phase 1: Public Registration:** Registers a dedicated disposable test user in Cognito.
2. **Phase 2: Email Verification:** Confirms user registration via Cognito confirmation protocol.
3. **Phase 3: SRP Authentication:** Authenticates via Cognito SRP flow and acquires JWT ID and Access tokens.
4. **Phase 4: User Profile Verification:** Queries `/api/v1/users/profile` with Bearer ID Token.
5. **Phase 5: Workspace Creation:** Creates a new test organization under Free Tier quota limits.
6. **Phase 6: Project Creation:** Creates a project and verifies atomic increment of `projectCount`.
7. **Phase 7: Quota Boundary Check:** Tests boundary enforcement and error handling.
8. **Phase 8: Tenant Isolation Check:** Attempts cross-tenant access to another organization and verifies HTTP 403 Forbidden rejection.
9. **Phase 9: Quota Analytics:** Verifies real-time quota metrics response.
10. **Phase 10: Cascading Deletion:** Triggers organization deletion and verifies complete cleanup of all items in DynamoDB.
11. **Phase 11: Cleanup Verification:** Confirms test user and workspace data are cleanly purged.

---

## 6. Test Data Cleanup Rules

When executing live tests against AWS:
- All test organizations must use disposable UUIDs (`test-e2e-<timestamp>-<random>`).
- Live tests must always execute teardown routines in a `finally` block to remove created projects, members, and test users.
- Automated tests must never modify or delete production data.

---

## 7. Known Testing Gaps & Future Roadmap

- **Browser End-to-End Automation:** Currently, UI tests are executed via jsdom; full headless Playwright / Cypress browser testing in CI is planned as a future enhancement.
- **Performance & Load Testing:** Quota concurrency tests validate 2-5 concurrent transactions; high-concurrency benchmarks (1,000+ requests/sec) using k6 or Artillery are slated for future releases.
