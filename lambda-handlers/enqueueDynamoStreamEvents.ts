import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";
import { DynamoDBStreamEvent } from "aws-lambda";

const sqs = new SQSClient();
const QUEUE_URL = process.env.QUEUE_URL!;

export const handler = async (event: DynamoDBStreamEvent): Promise<void> => {
  const messages = event.Records.map((record, index) => ({
    Id: index.toString(),
    MessageBody: JSON.stringify(record),
    // MessageAttributes: {
    //   eventName: {
    //     DataType: 'String',
    //     StringValue: record.eventName,
    //   },
    //   sequenceNumber: {
    //     DataType: 'String',
    //     StringValue: record.dynamodb!.SequenceNumber,
    //   },
    // },
  }));

  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10);
    await sqs.send(
      new SendMessageBatchCommand({
        QueueUrl: QUEUE_URL,
        Entries: batch,
      })
    );
  }
};
