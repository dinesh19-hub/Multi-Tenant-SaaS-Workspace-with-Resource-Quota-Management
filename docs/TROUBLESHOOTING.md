# SaaSWorkspace — Troubleshooting Guide

This guide covers common issues, root causes, and verified solutions for local development and cloud operations.

---

## 1. Authentication & Amazon Cognito

### Issue: Account Status `UNCONFIRMED` / Cannot Log In
- **Symptom:** The user registers, but subsequent sign-in attempts fail with `UserNotConfirmedException`.
- **Root Cause:** Cognito User Pools require email verification before issuing authentication tokens.
- **Solution:** Submit the 6-digit confirmation code dispatched to the user's email via the verification form or execute:
  ```bash
  aws cognito-idp confirm-sign-up --client-id <CLIENT_ID> --username <EMAIL> --confirmation-code <CODE> --region ap-southeast-2
  ```

### Issue: `401 Unauthorized` or `Invalid token use` on API Calls
- **Symptom:** Authenticated API requests fail with HTTP 401 or backend logs display `Invalid token_use`.
- **Root Cause:** Amazon Cognito issues both an **ID Token** and an **Access Token**. The backend `authMiddleware` strictly requires the **ID Token** because it contains verified email and profile identity claims.
- **Solution:** Ensure API requests pass `idToken` in the `Authorization: Bearer <idToken>` header, not `accessToken`.

---

## 2. API Gateway & CORS

### Issue: CORS Error in Browser Console (`No 'Access-Control-Allow-Origin' header`)
- **Symptom:** Browser blocks API calls from `https://main.d2h2pxsqugbcgb.amplifyapp.com` with a CORS error.
- **Root Cause:** CloudFormation parameter `AllowedCorsOrigin` does not match the frontend hosting origin.
- **Solution:** Verify `template.yaml` includes both the Amplify origin and local dev origin:
  ```yaml
  AllowedCorsOrigin: https://main.d2h2pxsqugbcgb.amplifyapp.com
  AllowedLocalCorsOrigin: http://localhost:5173
  ```
  And re-run `node scripts/sam-runner.cjs deploy --parameter-overrides AllowedCorsOrigin=https://main.d2h2pxsqugbcgb.amplifyapp.com`.

---

## 3. Resource Quota Enforcement

### Issue: `403 Forbidden` with `QuotaExceededError` on Project Creation
- **Symptom:** User clicks "Create Project", but the request fails with HTTP 403.
- **Root Cause:** The organization has reached its tier limit (e.g., Free Tier maximum of 10 projects).
- **Solution:** This is expected behavior. Upgrade the organization tier to Standard (50 projects) or Premium (200 projects) via Workspace Settings, or delete unused projects to free quota capacity.

### Issue: `TransactionCanceledException: ConditionalCheckFailed`
- **Symptom:** High concurrency causes project or member creation to fail.
- **Root Cause:** DynamoDB `TransactWriteItems` conditional check failed because another concurrent request modified the counter or the ceiling was reached.
- **Solution:** Handlers automatically catch this exception and return a clean HTTP 403 quota error rather than an unhandled 500 server crash.

---

## 4. Frontend Single-Page App (Amplify Hosting)

### Issue: 404 Not Found on Page Refresh / Deep Link
- **Symptom:** Refreshing `https://main.d2h2pxsqugbcgb.amplifyapp.com/projects` yields a 404 page.
- **Root Cause:** Amplify Hosting default routing tries to find a static file at `/projects` instead of rewriting to `/index.html`.
- **Solution:** Ensure Amplify Rewrites & Redirects contains the SPA rewrite rule:
  ```json
  [
    {
      "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>",
      "target": "/index.html",
      "status": "200"
    }
  ]
  ```

---

## 5. Local SAM CLI & Build

### Issue: SAM CLI Executable Not Found
- **Symptom:** `npm run validate:sam` fails with `'sam' is not recognized`.
- **Root Cause:** AWS SAM CLI is either not installed or not in system PATH.
- **Solution:** `scripts/sam-runner.cjs` automatically checks standard Windows installation paths (`C:\Program Files\Amazon\AWSSAMCLI\bin`). On Linux/macOS, ensure `sam` is accessible via PATH.
