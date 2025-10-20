# dynamo-opensearch-sync

An AWS CDK construct that syncs Dynamo items (and optionally, their associations) to OpenSearch

## Features

- Syncs INSERT, MODIFY, and REMOVE events from DynamoDB to OpenSearch
- Enqueues Dynamo stream events to an SQS queue for maximum parallelism
- Automatic retries with a dead letter SQS queue
- Can optionally add associations to documents

## Usage

### 1. Create a configuration file

```typescript
// my-app-config.ts
export interface HasManyRelationship {
  property: string;
  foreignKey: string;
  targetEntityType: string;
}

export interface BelongsToRelationship {
  property: string;
  foreignKey: string;
  targetEntityType: string;
}

export interface EntityConfig {
  entityType: string;
  indexName: string;
  hasMany?: HasManyRelationship[];
  belongsTo?: BelongsToRelationship[];
}

export const entityConfigs: EntityConfig[] = [
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

### 2. Use the construct in your CDK stack

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
  configFilePath: path.join(__dirname, 'my-app-config.js'),
});
```

### 3. DynamoDB item structure

Each item must have:
- `id`: Document ID in OpenSearch
- `entityType`: Entity type matching config

Example items:

```json
{
  "pk": "launch1",
  "id": "launch1",
  "entityType": "launch",
  "name": "Q1 Launch"
}
```

```json
{
  "pk": "release1",
  "id": "release1",
  "entityType": "release",
  "launchId": "launch1",
  "version": "1.0.0"
}
```

### 4. OpenSearch document structure

The sync will automatically:
- Add `_lastSyncedDynamoStreamRecord` to track sync state
- Add `releases` array to launch documents (hasMany)
- Add `launch` object to release documents (belongsTo)
- Filter out relationship properties to prevent circular references

Example launch document:
```json
{
  "id": "launch1",
  "entityType": "launch",
  "name": "Q1 Launch",
  "releases": [
    {
      "id": "release1",
      "entityType": "release",
      "launchId": "launch1",
      "version": "1.0.0",
      "_lastSyncedDynamoStreamRecord": {...}
    }
  ],
  "_lastSyncedDynamoStreamRecord": {...}
}
```

Example release document:
```json
{
  "id": "release1",
  "entityType": "release",
  "launchId": "launch1",
  "version": "1.0.0",
  "launch": {
    "id": "launch1",
    "entityType": "launch",
    "name": "Q1 Launch",
    "_lastSyncedDynamoStreamRecord": {...}
  },
  "_lastSyncedDynamoStreamRecord": {...}
}
```
