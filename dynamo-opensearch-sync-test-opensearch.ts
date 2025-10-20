import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as opensearch from "aws-cdk-lib/aws-opensearchservice";
import { Construct } from "constructs";

export interface DynamoOpenSearchSyncTestOpenSearchProps
  extends cdk.StackProps {
  suffix?: string;
}

export class DynamoOpenSearchSyncTestOpenSearch extends cdk.Stack {
  public readonly domain: opensearch.Domain;

  constructor(
    scope: Construct,
    id: string,
    props?: DynamoOpenSearchSyncTestOpenSearchProps
  ) {
    super(scope, id, props);

    const suffix = props?.suffix || "";

    this.domain = new opensearch.Domain(this, "TestDomain", {
      domainName: `dynamo-opensearch-sync-test${suffix}`,
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      capacity: {
        dataNodes: 1,
        dataNodeInstanceType: "t3.small.search",
      },
      ebs: {
        volumeSize: 10,
      },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      fineGrainedAccessControl: {
        masterUserArn: `arn:aws:iam::${this.account}:root`,
      },
      encryptionAtRest: {
        enabled: true,
      },
      nodeToNodeEncryption: true,
      enforceHttps: true,
      accessPolicies: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.AnyPrincipal()],
          actions: ["es:*"],
          resources: [
            `arn:aws:es:${this.region}:${this.account}:domain/dynamo-opensearch-sync-test${suffix}/*`,
          ],
        }),
      ],
    });

    new cdk.CfnOutput(this, "DomainEndpoint", {
      value: this.domain.domainEndpoint,
    });
  }
}
