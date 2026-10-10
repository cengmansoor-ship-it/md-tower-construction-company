import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class ExchangeTransaction extends Model<InferAttributes<ExchangeTransaction>, InferCreationAttributes<ExchangeTransaction>> {
  declare id: CreationOptional<number>;
  declare exchangeNumber: string;
  declare partyId: number;
  declare exchangeDate: string;
  declare currencyGiven: string;
  declare amountGiven: string;
  declare currencyReceived: string;
  declare amountReceived: string;
  declare rate: string;
  declare fee: CreationOptional<string>;
  declare reference: CreationOptional<string | null>;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ExchangeTransaction.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    exchangeNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    partyId: { type: DataTypes.INTEGER, allowNull: false },
    exchangeDate: { type: DataTypes.DATEONLY, allowNull: false },
    currencyGiven: { type: DataTypes.STRING(8), allowNull: false },
    amountGiven: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyReceived: { type: DataTypes.STRING(8), allowNull: false },
    amountReceived: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    rate: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    fee: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: "0.0000" },
    reference: { type: DataTypes.STRING(128), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "ExchangeTransaction", tableName: "exchange_transactions", timestamps: true },
);
