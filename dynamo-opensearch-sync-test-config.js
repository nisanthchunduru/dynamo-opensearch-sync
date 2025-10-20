exports.entityConfigs = [
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
