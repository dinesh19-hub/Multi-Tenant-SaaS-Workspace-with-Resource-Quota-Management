import { DynamoDbItem } from '../types/database';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  BatchWriteCommand,
  TransactWriteCommand,
  TransactWriteCommandInput,
} from '@aws-sdk/lib-dynamodb';

export interface KeyRecord {
  PK: string;
  SK: string;
}

export interface TransactAction {
  Put?: {
    TableName?: string;
    Item: DynamoDbItem;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
  Update?: {
    TableName?: string;
    Key: KeyRecord;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
  Delete?: {
    TableName?: string;
    Key: KeyRecord;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
  ConditionCheck?: {
    TableName?: string;
    Key: KeyRecord;
    ConditionExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  };
}

export class TransactionCanceledException extends Error {
  public cancellationReasons?: string[];
  constructor(message: string, cancellationReasons?: string[]) {
    super(message);
    this.name = 'TransactionCanceledException';
    this.cancellationReasons = cancellationReasons;
  }
}

export class ConditionalCheckFailedException extends Error {
  constructor(message: string = 'The conditional request failed') {
    super(message);
    this.name = 'ConditionalCheckFailedException';
  }
}

/**
 * DynamoRepository: Dual-mode single-table database access repository.
 * - When running in AWS Lambda (or when USE_REAL_DYNAMODB='true'), routes calls to AWS DynamoDB DocumentClient.
 * - When running in local tests or offline development, routes calls to an in-memory transactional store.
 */
export class DynamoRepository {
  private tableName: string;
  private static inMemoryStore = new Map<string, DynamoDbItem>();
  private static ddbClient: DynamoDBClient | null = null;
  private static docClient: DynamoDBDocumentClient | null = null;

  constructor(tableName?: string) {
    this.tableName = tableName || process.env.TABLE_NAME || 'MultiTenantSaaS';
  }

  public getTableName(): string {
    return this.tableName;
  }

  public isLiveAws(): boolean {
    return Boolean(
      process.env.AWS_EXECUTION_ENV ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.USE_REAL_DYNAMODB === 'true'
    );
  }

  public getDocClient(): DynamoDBDocumentClient {
    if (!DynamoRepository.docClient) {
      const region = process.env.AWS_REGION || 'ap-south-1';
      DynamoRepository.ddbClient = new DynamoDBClient({ region });
      DynamoRepository.docClient = DynamoDBDocumentClient.from(DynamoRepository.ddbClient, {
        marshallOptions: {
          removeUndefinedValues: true,
          convertClassInstanceToMap: true,
        },
      });
    }
    return DynamoRepository.docClient;
  }

  public static clearMemory(): void {
    DynamoRepository.inMemoryStore.clear();
  }

  public static seedMemory(items: DynamoDbItem[]): void {
    items.forEach((item) => {
      const key = `${item.PK}#${item.SK}`;
      DynamoRepository.inMemoryStore.set(key, JSON.parse(JSON.stringify(item)));
    });
  }

  private makeKey(pk: string, sk: string): string {
    return `${pk}#${sk}`;
  }

  /**
   * Helper evaluating DynamoDB ConditionExpressions against a target item in memory
   */
  private evaluateCondition(
    item: DynamoDbItem | undefined,
    condition?: string,
    names?: Record<string, string>,
    values?: Record<string, unknown>
  ): boolean {
    if (!condition) return true;

    // Substitute ExpressionAttributeNames and ExpressionAttributeValues
    let expr = condition;
    if (names) {
      Object.keys(names).forEach((nameKey) => {
        expr = expr.split(nameKey).join(names[nameKey]);
      });
    }

    // attribute_not_exists(PK) or attribute_not_exists(attribute)
    const notExistsMatch = expr.match(/attribute_not_exists\(([^)]+)\)/);
    if (notExistsMatch) {
      const attr = notExistsMatch[1].trim();
      if (item && item[attr] !== undefined) {
        return false;
      }
      expr = expr.replace(notExistsMatch[0], 'true');
    }

    // attribute_exists(PK)
    const existsMatch = expr.match(/attribute_exists\(([^)]+)\)/);
    if (existsMatch) {
      const attr = existsMatch[1].trim();
      if (!item || item[attr] === undefined) {
        return false;
      }
      expr = expr.replace(existsMatch[0], 'true');
    }

    // Clean up remaining boolean expression
    const valMap: Record<string, unknown> = values || {};
    Object.keys(valMap).forEach((valKey) => {
      const val = valMap[valKey];
      const serialized = typeof val === 'string' ? `'${val}'` : JSON.stringify(val);
      expr = expr.split(valKey).join(serialized);
    });

    if (item) {
      Object.keys(item).forEach((prop) => {
        const val = item[prop];
        const serialized = typeof val === 'string' ? `'${val}'` : JSON.stringify(val);
        // Replace isolated tokens
        const regex = new RegExp(`\\b${prop}\\b`, 'g');
        expr = expr.replace(regex, serialized);
      });
    }

    // Convert DynamoDB operators to JavaScript operators
    expr = expr.replace(/<>/g, '!==');
    expr = expr.replace(/(?<![<>=!])=(?!=)/g, '===');
    expr = expr.replace(/\bAND\b/g, '&&').replace(/\bOR\b/g, '||').replace(/\bNOT\b/g, '!');

    try {
      // Evaluate safe boolean logic
      const fn = new Function(`return Boolean(${expr});`);
      return fn();
    } catch {
      // If expression evaluation fails, condition is not satisfied
      return false;
    }
  }

  /**
   * Helper applying an UpdateExpression to an in-memory item
   */
  private applyUpdate(
    target: DynamoDbItem,
    expression: string,
    names?: Record<string, string>,
    values?: Record<string, unknown>
  ): DynamoDbItem {
    const updated = { ...target };
    let expr = expression;

    if (names) {
      Object.keys(names).forEach((k) => {
        expr = expr.split(k).join(names[k]);
      });
    }

    // Parse SET clauses
    const setMatch = expr.match(/SET\s+([^,]+(?:,[^,]+)*)/i);
    if (setMatch) {
      const assignments = setMatch[1].split(',');
      assignments.forEach((assignment) => {
        const [field, rawVal] = assignment.split('=').map((s) => s.trim());
        if (field && rawVal) {
          if (rawVal.startsWith(':') && values && values[rawVal] !== undefined) {
            updated[field] = values[rawVal];
          } else {
            updated[field] = rawVal.replace(/^'|'$/g, '');
          }
        }
      });
    }

    // Parse ADD clauses
    const addMatch = expr.match(/ADD\s+([^,]+(?:,[^,]+)*)/i);
    if (addMatch) {
      const adds = addMatch[1].split(',');
      adds.forEach((clause) => {
        const parts = clause.trim().split(/\s+/);
        if (parts.length === 2) {
          const field = parts[0].trim();
          const valRef = parts[1].trim();
          const inc = values && values[valRef] !== undefined ? (values[valRef] as number) : 1;
          const current = (updated[field] as number) || 0;
          updated[field] = current + inc;
        }
      });
    }

    // Parse REMOVE clauses
    const removeMatch = expr.match(/REMOVE\s+([^,]+(?:,[^,]+)*)/i);
    if (removeMatch) {
      const removes = removeMatch[1].split(',');
      removes.forEach((field) => {
        delete updated[field.trim()];
      });
    }

    return updated;
  }

  public async getItem<T = DynamoDbItem>(params: {
    TableName?: string;
    Key: KeyRecord;
    ConsistentRead?: boolean;
  }): Promise<{ Item?: T }> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      const res = await client.send(
        new GetCommand({
          TableName: params.TableName || this.tableName,
          Key: params.Key,
          ConsistentRead: params.ConsistentRead,
        })
      );
      return { Item: res.Item as T };
    }

    const key = this.makeKey(params.Key.PK, params.Key.SK);
    const item = DynamoRepository.inMemoryStore.get(key);
    if (!item) return {};
    return { Item: JSON.parse(JSON.stringify(item)) as T };
  }

  public async putItem(params: {
    TableName?: string;
    Item: DynamoDbItem;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  }): Promise<void> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      try {
        await client.send(
          new PutCommand({
            TableName: params.TableName || this.tableName,
            Item: params.Item,
            ConditionExpression: params.ConditionExpression,
            ExpressionAttributeNames: params.ExpressionAttributeNames,
            ExpressionAttributeValues: params.ExpressionAttributeValues,
          })
        );
        return;
      } catch (err: unknown) {
        if (err && (err as { name?: string }).name === 'ConditionalCheckFailedException') {
          throw new ConditionalCheckFailedException((err as Error).message);
        }
        throw err;
      }
    }

    const key = this.makeKey(params.Item.PK as string, params.Item.SK as string);
    const existing = DynamoRepository.inMemoryStore.get(key);

    if (
      !this.evaluateCondition(
        existing,
        params.ConditionExpression,
        params.ExpressionAttributeNames,
        params.ExpressionAttributeValues
      )
    ) {
      throw new ConditionalCheckFailedException('ConditionExpression failed on putItem');
    }

    DynamoRepository.inMemoryStore.set(key, JSON.parse(JSON.stringify(params.Item)));
  }

  public async updateItem(params: {
    TableName?: string;
    Key: KeyRecord;
    UpdateExpression: string;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  }): Promise<{ Attributes?: DynamoDbItem }> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      try {
        const res = await client.send(
          new UpdateCommand({
            TableName: params.TableName || this.tableName,
            Key: params.Key,
            UpdateExpression: params.UpdateExpression,
            ConditionExpression: params.ConditionExpression,
            ExpressionAttributeNames: params.ExpressionAttributeNames,
            ExpressionAttributeValues: params.ExpressionAttributeValues,
            ReturnValues: 'ALL_NEW',
          })
        );
        return { Attributes: res.Attributes as DynamoDbItem };
      } catch (err: unknown) {
        if (err && (err as { name?: string }).name === 'ConditionalCheckFailedException') {
          throw new ConditionalCheckFailedException((err as Error).message);
        }
        throw err;
      }
    }

    const key = this.makeKey(params.Key.PK, params.Key.SK);
    const existing = DynamoRepository.inMemoryStore.get(key);

    if (
      !this.evaluateCondition(
        existing,
        params.ConditionExpression,
        params.ExpressionAttributeNames,
        params.ExpressionAttributeValues
      )
    ) {
      throw new ConditionalCheckFailedException('ConditionExpression failed on updateItem');
    }

    const base = existing || { PK: params.Key.PK, SK: params.Key.SK };
    const updated = this.applyUpdate(
      base,
      params.UpdateExpression,
      params.ExpressionAttributeNames,
      params.ExpressionAttributeValues
    );
    DynamoRepository.inMemoryStore.set(key, updated);
    return { Attributes: updated };
  }

  public async deleteItem(params: {
    TableName?: string;
    Key: KeyRecord;
    ConditionExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  }): Promise<void> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      try {
        await client.send(
          new DeleteCommand({
            TableName: params.TableName || this.tableName,
            Key: params.Key,
            ConditionExpression: params.ConditionExpression,
            ExpressionAttributeNames: params.ExpressionAttributeNames,
            ExpressionAttributeValues: params.ExpressionAttributeValues,
          })
        );
        return;
      } catch (err: unknown) {
        if (err && (err as { name?: string }).name === 'ConditionalCheckFailedException') {
          throw new ConditionalCheckFailedException((err as Error).message);
        }
        throw err;
      }
    }

    const key = this.makeKey(params.Key.PK, params.Key.SK);
    const existing = DynamoRepository.inMemoryStore.get(key);

    if (
      !this.evaluateCondition(
        existing,
        params.ConditionExpression,
        params.ExpressionAttributeNames,
        params.ExpressionAttributeValues
      )
    ) {
      throw new ConditionalCheckFailedException('ConditionExpression failed on deleteItem');
    }

    DynamoRepository.inMemoryStore.delete(key);
  }

  public async query<T = DynamoDbItem>(params: {
    TableName?: string;
    IndexName?: string;
    KeyConditionExpression: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
    ScanIndexForward?: boolean;
    ConsistentRead?: boolean;
  }): Promise<{ Items: T[] }> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      const res = await client.send(
        new QueryCommand({
          TableName: params.TableName || this.tableName,
          IndexName: params.IndexName,
          KeyConditionExpression: params.KeyConditionExpression,
          ExpressionAttributeNames: params.ExpressionAttributeNames,
          ExpressionAttributeValues: params.ExpressionAttributeValues,
          ScanIndexForward: params.ScanIndexForward,
          ConsistentRead: params.ConsistentRead,
        })
      );
      return { Items: (res.Items || []) as T[] };
    }

    const values = params.ExpressionAttributeValues || {};
    const names = params.ExpressionAttributeNames || {};

    let pkName = 'PK';
    let skName = 'SK';
    if (params.IndexName === 'GSI1') {
      pkName = 'GSI1PK';
      skName = 'GSI1SK';
    }

    // Extract target PK value from KeyConditionExpression
    let targetPk: unknown = undefined;
    Object.keys(values).forEach((vKey) => {
      if (params.KeyConditionExpression.includes(vKey)) {
        if (targetPk === undefined) {
          targetPk = values[vKey];
        }
      }
    });

    const results: T[] = [];
    DynamoRepository.inMemoryStore.forEach((item) => {
      if (item[pkName] === targetPk) {
        results.push(JSON.parse(JSON.stringify(item)) as T);
      }
    });

    // Optional sort
    if (params.ScanIndexForward === false) {
      results.reverse();
    }

    return { Items: results };
  }

  public async batchWrite(params: {
    RequestItems: Record<
      string,
      Array<{
        PutRequest?: { Item: DynamoDbItem };
        DeleteRequest?: { Key: KeyRecord };
      }>
    >;
  }): Promise<{ UnprocessedItems?: Record<string, unknown> }> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      const res = await client.send(
        new BatchWriteCommand({
          RequestItems: params.RequestItems,
        })
      );
      return { UnprocessedItems: (res.UnprocessedItems || {}) as Record<string, unknown> };
    }

    const tableKeys = Object.keys(params.RequestItems);
    for (const table of tableKeys) {
      const requests = params.RequestItems[table];
      for (const req of requests) {
        if (req.PutRequest) {
          const item = req.PutRequest.Item;
          const key = this.makeKey(item.PK as string, item.SK as string);
          DynamoRepository.inMemoryStore.set(key, JSON.parse(JSON.stringify(item)));
        } else if (req.DeleteRequest) {
          const key = this.makeKey(req.DeleteRequest.Key.PK, req.DeleteRequest.Key.SK);
          DynamoRepository.inMemoryStore.delete(key);
        }
      }
    }
    return { UnprocessedItems: {} };
  }

  /**
   * Executes atomic DynamoDB TransactWriteItems
   * - In live AWS: delegates directly to DynamoDB TransactWriteCommand.
   * - In local memory: verifies conditions and dry-runs before atomic commit.
   */
  public async transactWrite(params: { TransactItems: TransactAction[] }): Promise<void> {
    if (this.isLiveAws()) {
      const client = this.getDocClient();
      const transactItems: TransactWriteCommandInput['TransactItems'] = params.TransactItems.map((action) => {
        if (action.Put) {
          return {
            Put: {
              TableName: action.Put.TableName || this.tableName,
              Item: action.Put.Item,
              ConditionExpression: action.Put.ConditionExpression,
              ExpressionAttributeNames: action.Put.ExpressionAttributeNames,
              ExpressionAttributeValues: action.Put.ExpressionAttributeValues,
            },
          };
        }
        if (action.Update) {
          return {
            Update: {
              TableName: action.Update.TableName || this.tableName,
              Key: action.Update.Key,
              UpdateExpression: action.Update.UpdateExpression,
              ConditionExpression: action.Update.ConditionExpression,
              ExpressionAttributeNames: action.Update.ExpressionAttributeNames,
              ExpressionAttributeValues: action.Update.ExpressionAttributeValues,
            },
          };
        }
        if (action.Delete) {
          return {
            Delete: {
              TableName: action.Delete.TableName || this.tableName,
              Key: action.Delete.Key,
              ConditionExpression: action.Delete.ConditionExpression,
              ExpressionAttributeNames: action.Delete.ExpressionAttributeNames,
              ExpressionAttributeValues: action.Delete.ExpressionAttributeValues,
            },
          };
        }
        if (action.ConditionCheck) {
          return {
            ConditionCheck: {
              TableName: action.ConditionCheck.TableName || this.tableName,
              Key: action.ConditionCheck.Key,
              ConditionExpression: action.ConditionCheck.ConditionExpression,
              ExpressionAttributeNames: action.ConditionCheck.ExpressionAttributeNames,
              ExpressionAttributeValues: action.ConditionCheck.ExpressionAttributeValues,
            },
          };
        }
        throw new Error('Invalid TransactAction: must specify Put, Update, Delete, or ConditionCheck');
      });

      try {
        await client.send(
          new TransactWriteCommand({
            TransactItems: transactItems,
          })
        );
        return;
      } catch (err: unknown) {
        if (err && (err as { name?: string }).name === 'TransactionCanceledException') {
          const reasons = (err as { CancellationReasons?: Array<{ Code?: string }> }).CancellationReasons?.map(
            (r) => r.Code || 'ConditionalCheckFailed'
          );
          throw new TransactionCanceledException((err as Error).message, reasons);
        }
        throw err;
      }
    }

    const touchedKeys = new Set<string>();

    // 1. Verify single-action-per-item rule
    for (const action of params.TransactItems) {
      let key = '';
      if (action.Put) key = this.makeKey(action.Put.Item.PK as string, action.Put.Item.SK as string);
      if (action.Update) key = this.makeKey(action.Update.Key.PK, action.Update.Key.SK);
      if (action.Delete) key = this.makeKey(action.Delete.Key.PK, action.Delete.Key.SK);
      if (action.ConditionCheck) key = this.makeKey(action.ConditionCheck.Key.PK, action.ConditionCheck.Key.SK);

      if (touchedKeys.has(key)) {
        throw new Error(
          `Transaction contains multiple actions for the same item: ${key}. DynamoDB prohibits multiple operations against the same item in TransactWriteItems.`
        );
      }
      touchedKeys.add(key);
    }

    // 2. Dry-run verify all conditions
    const staging = new Map<string, DynamoDbItem | null>();

    for (const action of params.TransactItems) {
      if (action.Put) {
        const itemKey = this.makeKey(action.Put.Item.PK as string, action.Put.Item.SK as string);
        const existing = DynamoRepository.inMemoryStore.get(itemKey);
        if (
          !this.evaluateCondition(
            existing,
            action.Put.ConditionExpression,
            action.Put.ExpressionAttributeNames,
            action.Put.ExpressionAttributeValues
          )
        ) {
          throw new TransactionCanceledException('ConditionalCheckFailed on Put action', ['ConditionalCheckFailed']);
        }
        staging.set(itemKey, JSON.parse(JSON.stringify(action.Put.Item)));
      } else if (action.Update) {
        const itemKey = this.makeKey(action.Update.Key.PK, action.Update.Key.SK);
        const existing = DynamoRepository.inMemoryStore.get(itemKey);
        if (
          !this.evaluateCondition(
            existing,
            action.Update.ConditionExpression,
            action.Update.ExpressionAttributeNames,
            action.Update.ExpressionAttributeValues
          )
        ) {
          throw new TransactionCanceledException('ConditionalCheckFailed on Update action', ['ConditionalCheckFailed']);
        }
        const base = existing ? { ...existing } : { PK: action.Update.Key.PK, SK: action.Update.Key.SK };
        const updated = this.applyUpdate(
          base,
          action.Update.UpdateExpression,
          action.Update.ExpressionAttributeNames,
          action.Update.ExpressionAttributeValues
        );
        staging.set(itemKey, updated);
      } else if (action.Delete) {
        const itemKey = this.makeKey(action.Delete.Key.PK, action.Delete.Key.SK);
        const existing = DynamoRepository.inMemoryStore.get(itemKey);
        if (
          !this.evaluateCondition(
            existing,
            action.Delete.ConditionExpression,
            action.Delete.ExpressionAttributeNames,
            action.Delete.ExpressionAttributeValues
          )
        ) {
          throw new TransactionCanceledException('ConditionalCheckFailed on Delete action', ['ConditionalCheckFailed']);
        }
        staging.set(itemKey, null);
      } else if (action.ConditionCheck) {
        const itemKey = this.makeKey(action.ConditionCheck.Key.PK, action.ConditionCheck.Key.SK);
        const existing = DynamoRepository.inMemoryStore.get(itemKey);
        if (
          !this.evaluateCondition(
            existing,
            action.ConditionCheck.ConditionExpression,
            action.ConditionCheck.ExpressionAttributeNames,
            action.ConditionCheck.ExpressionAttributeValues
          )
        ) {
          throw new TransactionCanceledException('ConditionalCheckFailed on ConditionCheck action', ['ConditionalCheckFailed']);
        }
      }
    }

    // 3. Atomically commit all staged items
    staging.forEach((item, key) => {
      if (item === null) {
        DynamoRepository.inMemoryStore.delete(key);
      } else {
        DynamoRepository.inMemoryStore.set(key, item);
      }
    });
  }
}
