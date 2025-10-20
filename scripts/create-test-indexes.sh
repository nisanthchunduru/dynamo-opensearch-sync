#!/bin/bash

# Script to create OpenSearch indexes from config
# Usage: ./scripts/create-test-indexes.sh

DOMAIN_ENDPOINT="https://search-dynamo-opensearch-sync-test-bafvr4mmsjomwmbhf7hg6gdhoq.us-west-2.es.amazonaws.com"
REGION="us-west-2"

create_index() {
  local INDEX_NAME=$1
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
          "entityType": {
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
}

create_index "people"
create_index "social-media-profiles"
create_index "launches"
create_index "releases"
create_index "tasks"

echo "All indexes created successfully!"
