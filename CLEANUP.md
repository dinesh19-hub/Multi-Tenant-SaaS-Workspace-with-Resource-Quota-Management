# Multi-Tenant SaaS Workspace — Resource Teardown and Cleanup Guide

**Project Title:** Multi-Tenant SaaS Workspace with Resource Quota Management (`SaaSWorkspace`)  
**Target AWS Region:** `ap-southeast-2` (Asia Pacific — Sydney)  
**CloudFormation Stack:** `saas-workspace-stack`  
**Amplify App ID:** `d2h2pxsqugbcgb` (`saas-workspace-frontend`)  
**Purpose:** Provide step-by-step instructions to delete 100% of deployed cloud infrastructure, verifying that zero resources remain active and guaranteeing zero future billing charges.

---

## 1. Cloud Resources Subject to Teardown

Deploying this project via AWS SAM and AWS Amplify Hosting provisions the following resources:
- **AWS CloudFormation Stack:** `saas-workspace-stack`
- **Amazon Cognito User Pool:** `saas-workspace-stack-user-pool` and App Client `saas-workspace-stack-web-client`
- **Amazon API Gateway HTTP API:** `saas-workspace-stack-http-api` ($default stage)
- **AWS IAM Execution Role:** `saas-workspace-stack-api-handler-role`
- **AWS Lambda Function:** `saas-workspace-stack-api-handler`
- **Amazon DynamoDB Table:** `saas-workspace-stack-table` (including GSI1 and GSI2)
- **Amazon CloudWatch Log Group:** `/aws/lambda/saas-workspace-stack-api-handler`
- **AWS Amplify Hosting App:** `saas-workspace-frontend` (App ID `d2h2pxsqugbcgb`)

---

## 2. Step 1: Backend Teardown via SAM CLI

The entire AWS serverless backend is managed declaratively by CloudFormation. You can delete all backend resources with a single command:

```bash
node scripts/sam-runner.cjs delete --stack-name saas-workspace-stack --region ap-southeast-2 --no-prompts
```

Or via direct AWS SAM CLI:
```bash
sam delete --stack-name saas-workspace-stack --region ap-southeast-2
```

CloudFormation deletes all resources in reverse dependency order:
- Route and API Gateway bindings
- Lambda Compute Function and Execution Role
- CloudWatch Log Group
- DynamoDB Table and Secondary Indexes
- Cognito User Pool and App Client
- CloudFormation Stack

---

## 3. Step 2: Frontend Hosting Teardown via AWS CLI

To delete the AWS Amplify Hosting frontend application:

```bash
aws amplify delete-app --app-id d2h2pxsqugbcgb --region ap-southeast-2
```

This immediately releases the Amplify subdomain (`main.d2h2pxsqugbcgb.amplifyapp.com`), deletes hosted build artifacts, and stops any edge CDN distribution.

---

## 4. Step 3: Verification of Teardown

Verify via AWS CLI that all resources have been completely removed:

### 1. Check CloudFormation Stack Status
```bash
aws cloudformation describe-stacks --stack-name saas-workspace-stack --region ap-southeast-2
```
Expected response: `ValidationError: Stack with id saas-workspace-stack does not exist`.

### 2. Check DynamoDB Table
```bash
aws dynamodb describe-table --table-name saas-workspace-stack-table --region ap-southeast-2
```
Expected response: `ResourceNotFoundException`.

### 3. Check Cognito User Pool
```bash
aws cognito-idp list-user-pools --max-results 10 --region ap-southeast-2
```
Verify that `saas-workspace-stack-user-pool` no longer appears in the list.

### 4. Check Amplify App Status
```bash
aws amplify get-app --app-id d2h2pxsqugbcgb --region ap-southeast-2
```
Expected response: `NotFoundException`.

---

## 5. Cost Guardrails & Free Tier Confirmation

When all resources are deleted according to this guide:
- **Compute charges:** $0.00 (Lambda scale-to-zero terminated).
- **Storage charges:** $0.00 (DynamoDB table removed).
- **Amplify hosting:** $0.00 (App deleted).
- **API Gateway requests:** $0.00 (API deleted).
