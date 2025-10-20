#!/bin/bash

# Script to create the test-index in OpenSearch
# Usage: ./scripts/create-index.sh

DOMAIN_ENDPOINT="https://search-dynamo-opensearch-sync-test-bafvr4mmsjomwmbhf7hg6gdhoq.us-west-2.es.amazonaws.com"
INDEX_NAME="test-index"
REGION="us-west-2"

echo "Creating index: $INDEX_NAME"

awscurl --service es --region $REGION \
  -X PUT \
  "$DOMAIN_ENDPOINT/$INDEX_NAME" \
  -H "Content-Type: application/json" \
  -d '{
    "settings": {
      "number_of_shards": 1,
      "number_of_replicas": 0
    },
    "mappings": {
      "properties": {
        "id": {
          "type": "keyword"
        },
        "_lastSyncedDynamoStreamRecord": {
          "properties": {
            "sequenceNumber": {
              "type": "keyword"
            },
            "eventId": {
              "type": "keyword"
            },
            "eventName": {
              "type": "keyword"
            },
            "eventSourceArn": {
              "type": "keyword"
            }
          }
        }
      }
    }
  }'

echo ""
echo "Index created successfully!"
