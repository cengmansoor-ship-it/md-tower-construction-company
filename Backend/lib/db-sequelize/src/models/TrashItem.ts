import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class TrashItem extends Model<InferAttributes<TrashItem>, InferCreationAttributes<TrashItem>> {
  declare id: CreationOptional<number>;
  declare entityType: string;
  declare entityId: string;
  declare displayName: string;
  declare sourcePath: CreationOptional<string | null>;
  declare snapshot: CreationOptional<string | null>;
  declare deleteReason: string;
  declare deletedByUserId: CreationOptional<number | null>;
  declare deletedAt: CreationOptional<Date>;
  declare purgeAfter: Date;
  declare purgedAt: CreationOptional<Date | null>;
  declare purgedByUserId: CreationOptional<number | null>;
  declare purgeReason: CreationOptional<string | null>;
  declare restoredAt: CreationOptional<Date | null>;
  declare restoredByUserId: CreationOptional<number | null>;
  declare restoreReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

TrashItem.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    entityType: { type: DataTypes.STRING(64), allowNull: false },
    entityId: { type: DataTypes.STRING(64), allowNull: false },
    displayName: { type: DataTypes.STRING(256), allowNull: false },
    sourcePath: { type: DataTypes.STRING(256), allowNull: true },
    snapshot: { type: DataTypes.TEXT("long"), allowNull: true },
    deleteReason: { type: DataTypes.TEXT, allowNull: false },
    deletedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    deletedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    purgeAfter: { type: DataTypes.DATE, allowNull: false },
    purgedAt: { type: DataTypes.DATE, allowNull: true },
    purgedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    purgeReason: { type: DataTypes.TEXT, allowNull: true },
    restoredAt: { type: DataTypes.DATE, allowNull: true },
    restoredByUserId: { type: DataTypes.INTEGER, allowNull: true },
    restoreReason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "TrashItem",
    tableName: "trash_items",
    timestamps: true,
    indexes: [
      { fields: ["entityType", "entityId"] },
      { fields: ["purgedAt", "purgeAfter"] },
    ],
  },
);
