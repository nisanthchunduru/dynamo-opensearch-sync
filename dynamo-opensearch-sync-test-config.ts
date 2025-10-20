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
    entityType: 'person',
    indexName: 'people',
    hasMany: [
      {
        property: 'socialMediaProfiles',
        foreignKey: 'personId',
        targetEntityType: 'socialMediaProfile',
      },
    ],
  },
  {
    entityType: 'socialMediaProfile',
    indexName: 'social-media-profiles',
  },
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
  {
    entityType: 'task',
    indexName: 'tasks',
    belongsTo: [
      {
        property: 'launch',
        foreignKey: 'launchId',
        targetEntityType: 'launch',
      },
      {
        property: 'release',
        foreignKey: 'releaseId',
        targetEntityType: 'release',
      },
    ],
  },
];
