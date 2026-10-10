import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

/** Tracks the next number for each document type (invoice, receipt, contract, etc). */
export class DocumentSequence extends Model<InferAttributes<DocumentSequence>, InferCreationAttributes<DocumentSequence>> {
  declare id: CreationOptional<number>;
  declare documentType: string;
  declare prefix: CreationOptional<string>;
  declare nextNumber: CreationOptional<number>;
}

DocumentSequence.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    documentType: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    prefix: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "" },
    nextNumber: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  },
  { sequelize, modelName: "DocumentSequence", tableName: "document_sequences", timestamps: false },
);
