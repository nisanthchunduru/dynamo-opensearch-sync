# dynamo-opensearch-sync

An AWS CDK construct that syncs Dynamo items (and optionally, their associations) to OpenSearch

## Features

- Syncs INSERT, MODIFY, and REMOVE events from DynamoDB to OpenSearch
- Enqueues Dynamo stream events to an SQS queue for maximum parallelism
- Automatic retries with a dead letter SQS queue
- Can optionally add association properties to documents

## Usage

Create a config file

```typescript
// dynamo-opensearch-sync-config.js
exports.entityConfigs = [
  {
    entityType: 'user',
    indexName: 'users',
  },
  {
    entityType: 'launch',
    indexName: 'launches',
    hasMany: [
      {
        property: 'releases',
        foreignKey: 'launchId',
        targetEntityType: 'release',
      },
    ],
  },
  {
    entityType: 'release',
    indexName: 'releases',
    belongsTo: [
      {
        property: 'launch',
        foreignKey: 'launchId',
        targetEntityType: 'launch',
      },
    ],
  },
];
```

Import and instantiate the `DynamoOpenSearchSync` construct in your CDK stack

```typescript
import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import { DynamoOpenSearchSync } from './dynamo-opensearch-sync';
import * as path from 'path';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'MyApp');

const table = new dynamodb.Table(stack, 'DynamoTable', {
  partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
});

const domain = new opensearch.Domain(stack, 'OpenSearchDomain', {
  version: opensearch.EngineVersion.OPENSEARCH_2_11,
});

new DynamoOpenSearchSync(stack, 'DynamoOpenSearchSync', {
  table,
  domain,
  configFilePath: path.join(__dirname, 'dynamo-opensearch-sync-config.js'),
});
```

and deploy

```
npx cdk deploy --all --require-approval never
```