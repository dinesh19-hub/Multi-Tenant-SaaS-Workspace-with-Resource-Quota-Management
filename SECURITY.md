# Security Policy

The security of **Multi-Tenant SaaS Workspace with Resource Quota Management** (`SaaSWorkspace`) is a top priority. We take all security vulnerabilities seriously and appreciate your efforts to responsibly disclose any issues.

---

## Supported Versions

Only the latest version on the `main` branch is actively supported with security fixes:

| Version | Supported | Notes |
|:---|:---|:---|
| 1.0.x (`main`) | :white_check_mark: | Active production branch |
| < 1.0.0 | :x: | Historical development phases |

---

## Reporting a Vulnerability

**Please do NOT report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability, please report it privately:

1. **GitHub Private Vulnerability Reporting (Preferred)**:
   Navigate to the **Security** tab of the GitHub repository, select **Advisories**, and click **Report a vulnerability**. This creates a private draft advisory between you and the maintainers.

2. **Alternative Disclosure**:
   If private vulnerability reporting is unavailable, contact the repository maintainer directly via GitHub profile messaging or private communication channels before public disclosure.

### What to Include in Your Report
To help us triage and resolve the issue quickly, please provide:
- A clear description of the vulnerability and its potential impact.
- Step-by-step instructions or a minimal proof of concept (PoC) to reproduce the behavior.
- Relevant HTTP request/response samples or code snippets.
- An assessment of whether tenant isolation, quota enforcement, or authentication was bypassed.
- Any suggested remediations or mitigations.

### What NOT to Include
- **Never post real AWS access keys, secret keys, session tokens, or private user passwords.**
- **Never publish reports containing real customer data or active production Cognito confirmation codes.**

---

## Security Architecture Principles

This project implements defense-in-depth security across multiple cloud boundaries:
- **Tenant Isolation**: Strictly enforced at the DynamoDB partition level (`ORG#<orgId>`).
- **Identity & Authorization**: Amazon Cognito Secure Remote Password (SRP) authentication and native API Gateway JWT authorizer.
- **Backend Token Validation**: `authMiddleware` validates `token_use === 'id'`, verified email status, and tenant membership before any business logic executes.
- **Atomic Quota Enforcement**: DynamoDB `TransactWriteItems` condition expressions prevent quota races.
- **Least Privilege IAM**: The Lambda execution role possesses tightly scoped permissions restricted solely to the application table and CloudWatch log group.
