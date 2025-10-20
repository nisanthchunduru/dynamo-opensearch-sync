# dynamo-opensearch-sync

Sync Dynamo items to OpenSearch

## Features

- Syncs INSERT, MODIFY, and REMOVE events from DynamoDB to OpenSearch
- Uses an SQS queue for maximum parallel processing
- Automatic retries with a dead letter SQS queue

## Usage

```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import { DynamoOpenSearchSync } from './dynamo-opensearch-sync';

const app = new cdk.App();

const stack = new cdk.Stack(app, 'MyApp');

const table = new dynamodb.Table(stack, 'DynamoTable', {
  partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
});

const domain = new opensearch.Domain(stack, 'OpenSearchDomain', {
  version: opensearch.EngineVersion.OPENSEARCH_2_11,
});

new DynamoOpenSearchSync(stack, 'DynamoOpenSearchSync', {
  table,
  domain,
  indexName: 'test-index',
});
```
