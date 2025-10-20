import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBRecord, SQSEvent } from "aws-lambda";
import { aws4Interceptor } from "aws4-axios";
import axios from "axios";

const DOMAIN_ENDPOINT = process.env.DOMAIN_ENDPOINT || "";
const INDEX_NAME = process.env.INDEX_NAME || "";
const REGION = process.env.AWS_REGION || "";

// Ensure the domain endpoint has the https:// protocol
const domainUrl = DOMAIN_ENDPOINT.startsWith("http")
  ? DOMAIN_ENDPOINT
  : `https://${DOMAIN_ENDPOINT}`;

const client = axios.create();
client.interceptors.request.use(
  aws4Interceptor({ options: { region: REGION, service: "es" } })
);

interface OpenSearchDocument {
  _lastSyncedDynamoStreamRecord?: {
    sequenceNumber: string;
    eventId: string;
    eventName: string;
    eventSourceArn: string;
  };
  [key: string]: unknown;
}

export const handler = async (event: SQSEvent): Promise<void> => {
  for (const sqsRecord of event.Records) {
    const record: DynamoDBRecord = JSON.parse(sqsRecord.body);

    if (!record.dynamodb?.Keys || !record.dynamodb?.SequenceNumber) {
      continue;
    }

    // Check if the item has an 'id' field in the NewImage (for INSERT/MODIFY) or OldImage (for REMOVE)
    let id: string | undefined;
    if (record.eventName === "REMOVE" && record.dynamodb.OldImage) {
      const oldItem = unmarshall(
        record.dynamodb.OldImage as Record<string, AttributeValue>
      );
      id = oldItem.id;
    } else if (record.dynamodb.NewImage) {
      const newItem = unmarshall(
        record.dynamodb.NewImage as Record<string, AttributeValue>
      );
      id = newItem.id;
    }

    // Ignore events if the item doesn't have an 'id' field
    if (!id) {
      continue;
    }

    const sequenceNumber = record.dynamodb.SequenceNumber;

    if (record.eventName === "REMOVE") {
      await client.post(`${domainUrl}/${INDEX_NAME}/_update/${id}`, {
        script: {
          source:
            "if (ctx._source._lastSyncedDynamoStreamRecord == null || params.seq.compareTo(ctx._source._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) { ctx.op = 'delete' } else { ctx.op = 'none' }",
          params: { seq: sequenceNumber },
        },
      });
    } else {
      if (!record.dynamodb.NewImage) {
        continue;
      }

      const item: OpenSearchDocument = {
        ...unmarshall(
          record.dynamodb.NewImage as Record<string, AttributeValue>
        ),
        _lastSyncedDynamoStreamRecord: {
          sequenceNumber: sequenceNumber,
          eventId: record.eventID || "",
          eventName: record.eventName || "",
          eventSourceArn: record.eventSourceARN || "",
        },
      };

      await client.post(`${domainUrl}/${INDEX_NAME}/_update/${id}`, {
        script: {
          source:
            "if (ctx._source._lastSyncedDynamoStreamRecord == null || params.item._lastSyncedDynamoStreamRecord.sequenceNumber.compareTo(ctx._source._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) { ctx._source = params.item }",
          params: { item },
        },
        upsert: item,
      });
    }
  }
};
