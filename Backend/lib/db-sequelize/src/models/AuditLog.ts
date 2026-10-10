import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class AuditLog extends Model<InferAttributes<AuditLog>, InferCreationAttributes<AuditLog>> {
  declare id: CreationOptional<number>;
  declare userId: CreationOptional<number | null>;
  declare action: string;
  declare entityType: string;
  declare entityId: CreationOptional<string | null>;
  declare details: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

AuditLog.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: true },
    action: { type: DataTypes.STRING(64), allowNull: false },
    entityType: { type: DataTypes.STRING(64), allowNull: false },
    entityId: { type: DataTypes.STRING(64), allowNull: true },
    details: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: "AuditLog", tableName: "audit_logs", updatedAt: false },
);
