import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';

export interface DynamoOpenSearchSyncProps {
  table: dynamodb.ITable;
  domain: opensearch.IDomain;
  indexName: string;
  maxConcurrency?: number;
}

export class DynamoOpenSearchSync extends Construct {
  public readonly syncFunction: lambda.Function;
  public readonly queue: sqs.Queue;

  constructor(scope: Construct, id: string, props: DynamoOpenSearchSyncProps) {
    super(scope, id);

    const dynamoStreamEventsDlq = new sqs.Queue(this, 'DynamoStreamEventsDLQ', {
      queueName: 'dynamo-stream-events-dlq',
      retentionPeriod: cdk.Duration.days(14),
    });

    const dynamoStreamEventsQueue = new sqs.Queue(this, 'DynamoStreamEventsQueue', {
      queueName: 'dynamo-stream-events-queue',
      visibilityTimeout: cdk.Duration.minutes(6),
      deadLetterQueue: {
        queue: dynamoStreamEventsDlq,
        maxReceiveCount: 3,
      },
    });

    this.queue = dynamoStreamEventsQueue;

    const enqueueDynamoStreamEvents = new lambdaNodejs.NodejsFunction(this, 'EnqueueDynamoStreamEvents', {
      functionName: 'enqueue-dynamo-stream-events',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambda-handlers/enqueueDynamoStreamEvents.ts'),
      handler: 'handler',
      environment: {
        QUEUE_URL: dynamoStreamEventsQueue.queueUrl,
      },
      timeout: cdk.Duration.minutes(1),
      bundling: {
        forceDockerBundling: false,
      },
    });

    enqueueDynamoStreamEvents.addEventSource(
      new lambdaEventSources.DynamoEventSource(props.table, {
        startingPosition: lambda.StartingPosition.LATEST,
        batchSize: 1000,
        retryAttempts: 3,
      })
    );

    dynamoStreamEventsQueue.grantSendMessages(enqueueDynamoStreamEvents);

    this.syncFunction = new lambdaNodejs.NodejsFunction(this, 'SyncFunction', {
      functionName: 'dynamo-opensearch-sync',
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, 'lambda-handlers/sync.ts'),
      handler: 'handler',
      environment: {
        DOMAIN_ENDPOINT: props.domain.domainEndpoint,
        INDEX_NAME: props.indexName,
      },
      timeout: cdk.Duration.minutes(5),
      bundling: {
        forceDockerBundling: false,
      },
    });

    this.syncFunction.addEventSource(
      new lambdaEventSources.SqsEventSource(dynamoStreamEventsQueue, {
        batchSize: 10,
        maxConcurrency: props.maxConcurrency || 100,
      })
    );

    this.syncFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['es:ESHttpPut', 'es:ESHttpDelete', 'es:ESHttpPost'],
        resources: [`${props.domain.domainArn}/*`],
      })
    );
  }
}
