# Changelog

All notable changes to the **Multi-Tenant SaaS Workspace with Resource Quota Management** project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] - Production Release

### Added
- **Single-Table DynamoDB Schema**: Optimized partition key (`PK`) and sort key (`SK`) design with Global Secondary Indexes (`GSI1` and `GSI2`) supporting tenants, users, projects, invitations, and audit logs.
- **Server-Side Atomic Quota Enforcement**: Implemented `QuotaService` leveraging DynamoDB `TransactWriteItems` with condition expressions (`projectCount < maxProjects`, `memberCount < maxMembers`) to prevent race conditions during concurrent requests.
- **Quota Tiers**: Configured Free (10 projects, 5 members), Standard (50 projects, 25 members), and Premium (200 projects, 100 members) tiers.
- **Amazon Cognito SRP Authentication**: Integrated public user registration, 6-digit email confirmation code verification, and Secure Remote Password (SRP) authentication via AWS Amplify Auth v6.
- **Multi-Tenant Workspace Management**: Organization creation, member invitations, role-based access control (`ADMIN` vs `MEMBER`), and 7-step resumable cascading organization deletion engine.
- **API Gateway HTTP API v2 Routing**: Direct `$default` stage routing with Cognito JWT Authorizer, CORS preflight handling, and backend claims validation middleware.
- **Tabler UI Frontend Redesign**: Modern, clean responsive dashboard built with Tabler UI CSS tokens, featuring resource utilization gauges, project management views, member management rosters, audit trail tables, and responsive mobile navigation.
- **AWS Cloud Deployment**: Full production deployment in AWS Asia Pacific (Sydney) `ap-southeast-2` using AWS SAM (backend) and AWS Amplify Hosting (frontend).
- **Automated Test Suites**: Comprehensive test coverage totaling 75 tests (14 frontend component tests, 61 backend handler and security tests).
- **End-to-End Live Verification**: Automated script (`scripts/test-e2e-amplify-flow.mjs`) exercising the full 11-phase live verification lifecycle against real AWS services.
- **Repository Documentation**: Comprehensive documentation suite including `ARCHITECTURE.md`, `DEPLOYMENT.md`, `TESTING.md`, screenshot gallery, and GitHub Actions CI workflow.
