import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase 12 & 13: Infrastructure as Code & Packaging Validation (TC-23, TC-24, TC-25)', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const templatePath = path.join(rootDir, 'template.yaml');

  it('TC-23: IAM execution policy validation (least-privilege, TransactWriteItems, scoped logs)', () => {
    expect(fs.existsSync(templatePath)).toBe(true);
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // Verify explicit IAM Role definition exists
    expect(templateContent).toContain('ApiHandlerExecutionRole:');
    expect(templateContent).toContain('Type: AWS::IAM::Role');

    // Verify DynamoDB TransactWriteItems permission is present
    expect(templateContent).toContain('dynamodb:TransactWriteItems');
    expect(templateContent).toContain('dynamodb:BatchWriteItem');
    expect(templateContent).toContain('dynamodb:GetItem');
    expect(templateContent).toContain('dynamodb:PutItem');
    expect(templateContent).toContain('dynamodb:UpdateItem');
    expect(templateContent).toContain('dynamodb:DeleteItem');
    expect(templateContent).toContain('dynamodb:Query');

    // Verify table and index scoping
    expect(templateContent).toContain('!GetAtt SaaSWorkspaceTable.Arn');
    expect(templateContent).toContain('!Sub "${SaaSWorkspaceTable.Arn}/index/*"');

    // Verify Scoped CloudWatch Logging (strictly scoped to log-stream pattern, NO AWSLambdaBasicExecutionRole)
    expect(templateContent).toContain('PolicyName: ScopedCloudWatchLogging');
    expect(templateContent).toContain('logs:CreateLogStream');
    expect(templateContent).toContain('logs:PutLogEvents');
    expect(templateContent).toContain(':log-stream:*');
    expect(templateContent).not.toContain('arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole');

    // Verify Lambda Function attaches explicit role
    expect(templateContent).toContain('Role: !GetAtt ApiHandlerExecutionRole.Arn');
  });

  it('TC-24: API Gateway URL construction and route consistency (no duplicate /v1 prefix)', () => {
    const templateContent = fs.readFileSync(templatePath, 'utf-8');

    // Verify StageName is $default (no stage path segment)
    expect(templateContent).toContain('StageName: "$default"');

    // Verify HttpApiUrl output uses root domain without /v1
    expect(templateContent).toContain('Value: !Sub "https://${HttpApi}.execute-api.${AWS::Region}.amazonaws.com"');

    // Verify frontend example configuration specifies clean /api/v1 suffix
    const envExamplePath = path.join(rootDir, '.env.example');
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const envContent = fs.readFileSync(envExamplePath, 'utf-8');
    expect(envContent).toMatch(/VITE_API_BASE_URL=https:\/\/xxxxxxxxxx\.execute-api\.(ap-southeast-2|ap-south-1)\.amazonaws\.com\/api\/v1/);
  });

  it('TC-25: Backend packaging and bundle verification (dist/index.js entrypoint)', () => {
    const distPath = path.join(__dirname, '../dist/index.js');
    expect(fs.existsSync(distPath)).toBe(true);

    const stats = fs.statSync(distPath);
    expect(stats.size).toBeGreaterThan(10000); // Compiled bundle is non-empty (>10KB)

    const bundleContent = fs.readFileSync(distPath, 'utf-8');
    expect(bundleContent).toContain('handler');
  });
});
