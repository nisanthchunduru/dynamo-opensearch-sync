import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface DynamoOpenSearchSyncTestDynamoProps extends cdk.StackProps {
  suffix?: string;
}

export class DynamoOpenSearchSyncTestDynamo extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props?: DynamoOpenSearchSyncTestDynamoProps) {
    super(scope, id, props);

    const suffix = props?.suffix || '';

    this.table = new dynamodb.Table(this, 'TestTable', {
      tableName: `dynamo-opensearch-sync-test${suffix}`,
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
  }
}
