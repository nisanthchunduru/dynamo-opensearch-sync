#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { DynamoOpenSearchSyncTest } from "./dynamo-opensearch-sync-test";
import { DynamoOpenSearchSyncTestDynamo } from "./dynamo-opensearch-sync-test-dynamo";
import { DynamoOpenSearchSyncTestOpenSearch } from "./dynamo-opensearch-sync-test-opensearch";

const app = new cdk.App();

// const region = process.env.CDK_DEFAULT_REGION;
const region = "us-west-2";

const dynamoStack = new DynamoOpenSearchSyncTestDynamo(
  app,
  "DynamoOpenSearchSyncTestDynamo2",
  {
    // suffix: "2",
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region,
    },
  }
);

const openSearchStack = new DynamoOpenSearchSyncTestOpenSearch(
  app,
  "DynamoOpenSearchSyncTestOpenSearch2",
  {
    // suffix: "2",
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region,
    },
  }
);

new DynamoOpenSearchSyncTest(app, "DynamoOpenSearchSyncTest2", {
  dynamoStack,
  openSearchStack,
  // suffix: "2",
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region,
  },
});

app.synth();
