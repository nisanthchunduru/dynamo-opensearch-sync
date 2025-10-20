export type HasManyRelationship = {
  property: string;
  foreignKey: string;
  targetEntityType: string;
};

export type BelongsToRelationship = {
  property: string;
  foreignKey: string;
  targetEntityType: string;
};

export type EntityConfig = {
  entityType: string;
  indexName: string;
  hasMany?: HasManyRelationship[];
  belongsTo?: BelongsToRelationship[];
};
