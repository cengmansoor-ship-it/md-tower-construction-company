import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from "sequelize";
import { sequelize } from "../connection";
import type { Account } from "./Account";

export type JournalDirection = "debit" | "credit";
export type PartyType = "customer" | "supplier" | "tenant" | "employee" | "partner" | "exchange_dealer";

export class JournalLine extends Model<InferAttributes<JournalLine>, InferCreationAttributes<JournalLine>> {
  declare id: CreationOptional<number>;
  declare transactionId: number;
  declare accountId: number;
  declare currencyCode: string;
  declare direction: JournalDirection;
  declare amount: string;
  declare partyType: CreationOptional<PartyType | null>;
  declare partyId: CreationOptional<number | null>;
  declare description: CreationOptional<string | null>;
  declare account?: NonAttribute<Account>;
}

JournalLine.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    transactionId: { type: DataTypes.INTEGER, allowNull: false },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    direction: { type: DataTypes.ENUM("debit", "credit"), allowNull: false },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    partyType: {
      type: DataTypes.ENUM("customer", "supplier", "tenant", "employee", "partner", "exchange_dealer"),
      allowNull: true,
    },
    partyId: { type: DataTypes.INTEGER, allowNull: true },
    description: { type: DataTypes.TEXT, allowNull: true },
  },
  { sequelize, modelName: "JournalLine", tableName: "journal_lines", timestamps: false },
);
