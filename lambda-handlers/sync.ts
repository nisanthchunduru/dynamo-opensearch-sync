import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { DynamoDBRecord, SQSEvent } from "aws-lambda";
import { aws4Interceptor } from "aws4-axios";
import axios from "axios";

const DOMAIN_ENDPOINT = process.env.DOMAIN_ENDPOINT || "";
const REGION = process.env.AWS_REGION || "";
const ENTITY_CONFIGS = require("./entity-config").entityConfigs;

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

    let id: string | undefined;
    let entityType: string | undefined;

    if (record.eventName === "REMOVE" && record.dynamodb.OldImage) {
      const oldItem = unmarshall(
        record.dynamodb.OldImage as Record<string, AttributeValue>
      );
      id = oldItem.id;
      entityType = oldItem.entityType;
    } else if (record.dynamodb.NewImage) {
      const newItem = unmarshall(
        record.dynamodb.NewImage as Record<string, AttributeValue>
      );
      id = newItem.id;
      entityType = newItem.entityType;
    }

    if (!id || !entityType) {
      continue;
    }

    const entityConfig = ENTITY_CONFIGS.find(
      (c: any) => c.entityType === entityType
    );
    if (!entityConfig) {
      continue;
    }

    const indexName = entityConfig.indexName;
    const sequenceNumber = record.dynamodb.SequenceNumber;

    if (record.eventName === "REMOVE") {
      await client.post(`${domainUrl}/${indexName}/_update/${id}`, {
        script: {
          source:
            "if (ctx._source._lastSyncedDynamoStreamRecord == null || params.seq.compareTo(ctx._source._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) { ctx.op = 'delete' } else { ctx.op = 'none' }",
          params: { seq: sequenceNumber },
        },
      });

      // Update related entities
      if (entityConfig.hasMany) {
        for (const rel of entityConfig.hasMany) {
          const targetConfig = ENTITY_CONFIGS.find(
            (c: any) => c.entityType === rel.targetEntityType
          );
          if (targetConfig) {
            await updateRelatedEntities(
              targetConfig.indexName,
              rel.foreignKey,
              id,
              rel.property,
              sequenceNumber
            );
          }
        }
      }

      // Remove from parent entities (if this entity is a child)
      if (record.dynamodb.OldImage) {
        const oldItem = unmarshall(
          record.dynamodb.OldImage as Record<string, AttributeValue>
        );
        for (const parentConfig of ENTITY_CONFIGS) {
          if (parentConfig.hasMany) {
            for (const rel of parentConfig.hasMany) {
              if (rel.targetEntityType === entityType && oldItem[rel.foreignKey]) {
                await removeFromParentEntity(
                  parentConfig.indexName,
                  oldItem[rel.foreignKey] as string,
                  rel.property,
                  id,
                  sequenceNumber
                );
              }
            }
          }
        }
      }
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

      await client.post(`${domainUrl}/${indexName}/_update/${id}`, {
        script: {
          source: `
            if (ctx._source._lastSyncedDynamoStreamRecord == null || params.item._lastSyncedDynamoStreamRecord.sequenceNumber.compareTo(ctx._source._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) {
              def relationships = [:];
              for (relProp in params.relationshipProperties) {
                if (ctx._source.containsKey(relProp)) {
                  relationships[relProp] = ctx._source[relProp];
                }
              }
              ctx._source = params.item;
              for (entry in relationships.entrySet()) {
                ctx._source[entry.getKey()] = entry.getValue();
              }
            }
          `,
          params: { 
            item,
            relationshipProperties: entityConfig.hasMany?.map((r: any) => r.property) || []
          },
        },
        upsert: item,
      });

      // Update related entities (children of this entity)
      if (entityConfig.relationships) {
        for (const rel of entityConfig.relationships) {
          const targetConfig = ENTITY_CONFIGS.find(
            (c: any) => c.entityType === rel.targetEntityType
          );
          if (targetConfig) {
            await updateRelatedEntities(
              targetConfig.indexName,
              rel.foreignKey,
              id,
              rel.property,
              sequenceNumber
            );
          }
        }
      }

      // Update parent entities (if this entity is a child)
      for (const parentConfig of ENTITY_CONFIGS) {
        if (parentConfig.hasMany) {
          for (const rel of parentConfig.hasMany) {
            if (rel.targetEntityType === entityType && item[rel.foreignKey]) {
              await updateParentEntity(
                parentConfig.indexName,
                item[rel.foreignKey] as string,
                rel.property,
                item
              );
            }
          }
        }
      }

      // Update belongs-to relationships
      if (entityConfig.belongsTo) {
        for (const rel of entityConfig.belongsTo) {
          if (item[rel.foreignKey]) {
            await updateBelongsToRelationship(
              indexName,
              id,
              rel.property,
              rel.foreignKey,
              item[rel.foreignKey] as string,
              ENTITY_CONFIGS.find((c: any) => c.entityType === rel.targetEntityType)?.indexName || '',
              sequenceNumber
            );
          }
        }
      }

      // Update children's belongsTo when this entity is a parent
      for (const childConfig of ENTITY_CONFIGS) {
        if (childConfig.belongsTo) {
          for (const rel of childConfig.belongsTo) {
            if (rel.targetEntityType === entityType) {
              await updateChildrenBelongsTo(
                childConfig.indexName,
                rel.foreignKey,
                id,
                rel.property,
                item,
                sequenceNumber
              );
            }
          }
        }
      }
    }
  }
};

async function updateParentEntity(
  parentIndex: string,
  parentId: string,
  relationshipProperty: string,
  childItem: OpenSearchDocument
): Promise<void> {
  await client.post(`${domainUrl}/${parentIndex}/_update/${parentId}`, {
    script: {
      source: `
        if (ctx._source.${relationshipProperty} == null) {
          ctx._source.${relationshipProperty} = [];
        }
        boolean found = false;
        for (int i = 0; i < ctx._source.${relationshipProperty}.size(); i++) {
          if (ctx._source.${relationshipProperty}[i].id == params.childItem.id) {
            found = true;
            if (ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord == null || params.childItem._lastSyncedDynamoStreamRecord.sequenceNumber.compareTo(ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) {
              ctx._source.${relationshipProperty}[i] = params.childItem;
            }
            break;
          }
        }
        if (!found) {
          ctx._source.${relationshipProperty}.add(params.childItem);
        }
      `,
      params: {
        childItem,
      },
    },
  });
}

async function updateChildrenBelongsTo(
  childIndex: string,
  foreignKey: string,
  parentId: string,
  relationshipProperty: string,
  parentDoc: OpenSearchDocument,
  sequenceNumber: string
): Promise<void> {
  const parentConfig = ENTITY_CONFIGS.find((c: any) => 
    c.hasMany?.some((r: any) => r.foreignKey === foreignKey)
  );
  const filteredParentDoc = { ...parentDoc };
  
  // Remove hasMany and belongsTo properties
  if (parentConfig?.hasMany) {
    for (const rel of parentConfig.hasMany) {
      delete filteredParentDoc[rel.property];
    }
  }
  if (parentConfig?.belongsTo) {
    for (const rel of parentConfig.belongsTo) {
      delete filteredParentDoc[rel.property];
    }
  }

  const searchResponse = await client.post(
    `${domainUrl}/${childIndex}/_search`,
    {
      query: {
        term: { [foreignKey]: parentId },
      },
      _source: ["id"],
      size: 1000,
    }
  );

  const childDocs = searchResponse.data.hits.hits.map((hit: any) => hit._source.id);

  for (const childId of childDocs) {
    await client.post(`${domainUrl}/${childIndex}/_update/${childId}`, {
      script: {
        source: `
          if (ctx._source.${relationshipProperty} == null || ctx._source.${relationshipProperty}._lastSyncedDynamoStreamRecord == null || params.seq.compareTo(ctx._source.${relationshipProperty}._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) {
            ctx._source.${relationshipProperty} = params.parentDoc;
          }
        `,
        params: {
          parentDoc: filteredParentDoc,
          seq: sequenceNumber,
        },
      },
    });
  }
}

async function updateBelongsToRelationship(
  childIndex: string,
  childId: string,
  relationshipProperty: string,
  foreignKey: string,
  parentId: string,
  parentIndex: string,
  sequenceNumber: string
): Promise<void> {
  const parentResponse = await client.get(
    `${domainUrl}/${parentIndex}/_doc/${parentId}`
  );

  if (parentResponse.data.found) {
    const parentDoc = parentResponse.data._source;
    const parentConfig = ENTITY_CONFIGS.find((c: any) => c.indexName === parentIndex);
    const filteredParentDoc = { ...parentDoc };
    
    // Remove hasMany and belongsTo properties
    if (parentConfig?.hasMany) {
      for (const rel of parentConfig.hasMany) {
        delete filteredParentDoc[rel.property];
      }
    }
    if (parentConfig?.belongsTo) {
      for (const rel of parentConfig.belongsTo) {
        delete filteredParentDoc[rel.property];
      }
    }

    await client.post(`${domainUrl}/${childIndex}/_update/${childId}`, {
      script: {
        source: `
          if (ctx._source.${relationshipProperty} == null || ctx._source.${relationshipProperty}._lastSyncedDynamoStreamRecord == null || params.seq.compareTo(ctx._source.${relationshipProperty}._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) {
            ctx._source.${relationshipProperty} = params.parentDoc;
          }
        `,
        params: {
          parentDoc: filteredParentDoc,
          seq: sequenceNumber,
        },
      },
    });
  }
}

async function removeFromParentEntity(
  parentIndex: string,
  parentId: string,
  relationshipProperty: string,
  childId: string,
  sequenceNumber: string
): Promise<void> {
  await client.post(`${domainUrl}/${parentIndex}/_update/${parentId}`, {
    script: {
      source: `
        if (ctx._source.${relationshipProperty} != null) {
          for (int i = 0; i < ctx._source.${relationshipProperty}.size(); i++) {
            if (ctx._source.${relationshipProperty}[i].id == params.childId) {
              if (ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord == null || params.seq.compareTo(ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) {
                ctx._source.${relationshipProperty}.remove(i);
              }
              break;
            }
          }
        }
      `,
      params: {
        childId,
        seq: sequenceNumber,
      },
    },
  });
}

async function updateRelatedEntities(
  targetIndex: string,
  foreignKey: string,
  parentId: string,
  relationshipProperty: string,
  sequenceNumber: string
): Promise<void> {
  const searchResponse = await client.post(
    `${domainUrl}/${targetIndex}/_search`,
    {
      query: {
        term: { [foreignKey]: parentId },
      },
      _source: ["id", "_lastSyncedDynamoStreamRecord"],
      size: 1000,
    }
  );

  const relatedDocs = searchResponse.data.hits.hits.map((hit: any) => ({
    id: hit._source.id,
    lastSyncedDynamoStreamRecord: hit._source._lastSyncedDynamoStreamRecord,
  }));

  for (const relatedDoc of relatedDocs) {
    const parentIndex = ENTITY_CONFIGS.find((c: any) =>
      c.hasMany?.some((r: any) => r.property === relationshipProperty)
    )?.indexName;

    if (parentIndex && relatedDoc.lastSyncedDynamoStreamRecord) {
      await client.post(`${domainUrl}/${parentIndex}/_update/${parentId}`, {
        script: {
          source: `
            if (ctx._source.${relationshipProperty} == null) {
              ctx._source.${relationshipProperty} = [];
            }
            boolean found = false;
            for (int i = 0; i < ctx._source.${relationshipProperty}.size(); i++) {
              if (ctx._source.${relationshipProperty}[i].id == params.relatedId) {
                found = true;
                if (ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord == null || params.lastSyncedDynamoStreamRecord.sequenceNumber.compareTo(ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord.sequenceNumber) >= 0) {
                  ctx._source.${relationshipProperty}[i]._lastSyncedDynamoStreamRecord = params.lastSyncedDynamoStreamRecord;
                }
                break;
              }
            }
            if (!found) {
              ctx._source.${relationshipProperty}.add(['id': params.relatedId, '_lastSyncedDynamoStreamRecord': params.lastSyncedDynamoStreamRecord]);
            }
          `,
          params: { 
            relatedId: relatedDoc.id, 
            lastSyncedDynamoStreamRecord: relatedDoc.lastSyncedDynamoStreamRecord 
          },
        },
      });
    }
  }
}
