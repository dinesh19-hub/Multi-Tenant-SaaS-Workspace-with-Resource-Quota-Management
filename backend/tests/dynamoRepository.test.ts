import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DynamoRepository } from '../src/services/dynamoRepository';

describe('Dual-Mode DynamoRepository Adapter (Phase 14B)', () => {
  let repo: DynamoRepository;

  beforeEach(() => {
    DynamoRepository.clearMemory();
    repo = new DynamoRepository('TestSaaSWorkspace');
  });

  afterEach(() => {
    delete process.env.AWS_EXECUTION_ENV;
    delete process.env.AWS_LAMBDA_FUNCTION_NAME;
    delete process.env.USE_REAL_DYNAMODB;
  });

  it('operates in in-memory mode when running outside of AWS Lambda', async () => {
    expect(repo.isLiveAws()).toBe(false);

    // Put item
    await repo.putItem({
      Item: {
        PK: 'ORG#test-1',
        SK: 'METADATA',
        name: 'In-Memory Test Org',
      },
    });

    // Get item
    const res = await repo.getItem({
      Key: { PK: 'ORG#test-1', SK: 'METADATA' },
    });
    expect(res.Item).toBeDefined();
    expect(res.Item?.name).toBe('In-Memory Test Org');

    // Query items
    const queryRes = await repo.query({
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': 'ORG#test-1' },
    });
    expect(queryRes.Items.length).toBe(1);

    // Delete item
    await repo.deleteItem({
      Key: { PK: 'ORG#test-1', SK: 'METADATA' },
    });
    const afterDel = await repo.getItem({
      Key: { PK: 'ORG#test-1', SK: 'METADATA' },
    });
    expect(afterDel.Item).toBeUndefined();
  });

  it('detects live AWS Lambda execution environment and instantiates DocumentClient lazily', () => {
    // 1. Without Lambda env
    expect(repo.isLiveAws()).toBe(false);

    // 2. With AWS_EXECUTION_ENV
    process.env.AWS_EXECUTION_ENV = 'AWS_Lambda_nodejs22.x';
    expect(repo.isLiveAws()).toBe(true);

    // 3. DocumentClient is instantiated with valid DocumentClient instance
    const docClient = repo.getDocClient();
    expect(docClient).toBeDefined();
    expect(docClient.send).toBeDefined();
    expect(typeof docClient.send).toBe('function');
  });
});
