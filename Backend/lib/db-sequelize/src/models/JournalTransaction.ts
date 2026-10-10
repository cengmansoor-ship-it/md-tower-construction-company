import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from "sequelize";
import { sequelize } from "../connection";
import type { JournalLine } from "./JournalLine";

export class JournalTransaction extends Model<InferAttributes<JournalTransaction>, InferCreationAttributes<JournalTransaction>> {
  declare id: CreationOptional<number>;
  declare idempotencyKey: string;
  declare transactionDate: string;
  declare memo: CreationOptional<string | null>;
  declare isManual: CreationOptional<boolean>;
  declare createdByUserId: CreationOptional<number | null>;
  declare voidedAt: CreationOptional<Date | null>;
  declare voidedByUserId: CreationOptional<number | null>;
  declare voidReason: CreationOptional<string | null>;
  declare reversalOfId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare lines?: NonAttribute<JournalLine[]>;
}

JournalTransaction.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idempotencyKey: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    transactionDate: { type: DataTypes.DATEONLY, allowNull: false },
    memo: { type: DataTypes.TEXT, allowNull: true },
    isManual: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidReason: { type: DataTypes.TEXT, allowNull: true },
    reversalOfId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: "JournalTransaction", tableName: "journal_transactions", updatedAt: false },
);
