import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoOpenSearchSync } from './dynamo-opensearch-sync';
import { DynamoOpenSearchSyncTestDynamo } from './dynamo-opensearch-sync-test-dynamo';
import { DynamoOpenSearchSyncTestOpenSearch } from './dynamo-opensearch-sync-test-opensearch';

export interface DynamoOpenSearchSyncTestProps extends cdk.StackProps {
  dynamoStack: DynamoOpenSearchSyncTestDynamo;
  openSearchStack: DynamoOpenSearchSyncTestOpenSearch;
  suffix?: string;
}

export class DynamoOpenSearchSyncTest extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DynamoOpenSearchSyncTestProps) {
    super(scope, id, props);

    new DynamoOpenSearchSync(this, 'Sync', {
      table: props.dynamoStack.table,
      domain: props.openSearchStack.domain,
      indexName: 'test-index',
      maxConcurrency: 100,
    });
  }
}
