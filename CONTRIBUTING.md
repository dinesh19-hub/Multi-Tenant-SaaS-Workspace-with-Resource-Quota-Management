# Contributing to SaaSWorkspace

Thank you for your interest in contributing to **Multi-Tenant SaaS Workspace with Resource Quota Management** (`SaaSWorkspace`). We welcome contributions, bug fixes, documentation improvements, and architectural suggestions.

Please review the guidelines below to ensure a smooth contribution process.

---

## 1. Code of Conduct

This project adheres to the Contributor Covenant Code of Conduct. By participating, you are expected to uphold this code. Please read [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) for details.

---

## 2. Project Architecture & Repository Structure

The project is structured as an npm workspaces monorepo:

```text
.
├── backend/            # AWS Lambda serverless backend (Node.js 22.x, TypeScript, esbuild)
│   ├── src/            # Handlers, services (DynamoDB repository, QuotaService), middleware
│   └── tests/          # Vitest unit and integration test suites
├── frontend/           # React 18 Single Page Application (TypeScript, Vite, Tabler UI)
│   ├── src/            # Components, pages, context providers, services
│   └── tests/          # Vitest component and workflow test suites
├── docs/               # Technical architecture documentation, guides, and screenshots
│   ├── ARCHITECTURE.md # Comprehensive system architecture and DynamoDB schema
│   ├── TESTING.md      # Testing matrix, mock vs live test execution guide
│   ├── DEPLOYMENT.md   # AWS SAM and AWS Amplify Hosting deployment guide
│   └── screenshots/    # Production application screenshots
├── scripts/            # Helper scripts (cross-platform SAM runner, E2E tests, zip utility)
├── template.yaml       # AWS SAM infrastructure-as-code template
└── package.json        # Root monorepo scripts and workspace definitions
```

---

## 3. Development Setup & Prerequisites

### Prerequisites
- **Node.js**: v22.x LTS (compatible with the Lambda execution runtime)
- **npm**: v10+
- **AWS SAM CLI**: v1.100+ (optional for local template validation and packaging)
- **Git**: v2.30+

### Setup Steps
1. Fork and clone the repository:
   ```bash
   git clone https://github.com/<your-username>/Multi-Tenant-SaaS-Workspace-with-Resource-Quota-Management.git
   cd Multi-Tenant-SaaS-Workspace-with-Resource-Quota-Management
   ```
2. Install dependencies using the root lockfile:
   ```bash
   npm ci
   ```
3. Copy environment configuration:
   ```bash
   cp .env.example frontend/.env
   ```
4. Start the frontend development server:
   ```bash
   npm run dev:frontend
   ```
   *Note: Set `VITE_USE_MOCK_AUTH=true` in `frontend/.env` if you want to develop offline without connecting to live AWS infrastructure.*

---

## 4. Quality Checks & Verification

Before submitting changes, all checks must pass locally:

| Command | Purpose |
|:---|:---|
| `npm run typecheck` | Validates TypeScript types across both `frontend` and `backend` |
| `npm run lint` | Runs code quality checks across all workspaces |
| `npm test` | Runs all 75 Vitest tests (14 frontend + 61 backend) |
| `npm run build` | Builds both production bundles (`frontend/dist` and `backend/dist`) |
| `npm run validate:sam` | Validates SAM template syntax, schema, and CloudFormation policies |

Run the full local suite in one pass:
```bash
npm run typecheck && npm run lint && npm test && npm run build && npm run validate:sam
```

---

## 5. Branch & Commit Conventions

### Branch Naming
- `feature/<short-description>`: New capabilities or enhancements
- `fix/<short-description>`: Bug fixes and error handling corrections
- `docs/<short-description>`: Documentation additions and clarifications
- `refactor/<short-description>`: Code restructuring without functional changes

### Commit Messages
We follow Conventional Commits format:
```text
<type>(<scope>): <subject>

[optional body]
```
Examples:
- `feat(backend): add optimistic locking check on project quota counter`
- `fix(frontend): resolve modal form state reset on tab switch`
- `docs(readme): add DynamoDB single-table access pattern diagram`

---

## 6. Pull Request Guidelines

1. **Self-Review**: Ensure all unit tests pass and new features include corresponding test cases.
2. **Security Check**: Never commit AWS credentials, secret keys, or environment files (`.env`).
3. **Tenant Boundaries**: Ensure all DynamoDB queries strictly respect partition isolation (`ORG#<orgId>`).
4. **Description**: Use the provided pull request template to describe your changes, testing evidence, and architectural considerations.
