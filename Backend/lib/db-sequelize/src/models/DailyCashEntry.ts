import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type DailyCashCategory = "cash_in" | "labor" | "kitchen" | "machinery" | "company" | "customers" | "other";
export type DailyCashEntryType = "in" | "out";
export type DailyCashTargetType =
  | "supplier"
  | "sales_customer"
  | "exchange_dealer"
  | "market_customer"
  | "individual_customer"
  | "regular_employee"
  | "misc_worker"
  | "expense"
  | "company"
  | "other";

export class DailyCashEntry extends Model<InferAttributes<DailyCashEntry>, InferCreationAttributes<DailyCashEntry>> {
  declare id: CreationOptional<number>;
  declare entryDate: string;
  declare description: string;
  declare category: DailyCashCategory;
  declare entryType: CreationOptional<DailyCashEntryType>;
  declare targetType: CreationOptional<DailyCashTargetType | null>;
  declare targetId: CreationOptional<number | null>;
  declare targetName: CreationOptional<string | null>;
  declare amount: string;
  declare currencyCode: string;
  declare journalTransactionId: CreationOptional<number | null>;
  declare linkedEmployeePaymentId: CreationOptional<number | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare voidedAt: CreationOptional<Date | null>;
  declare voidedByUserId: CreationOptional<number | null>;
  declare voidReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

DailyCashEntry.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    category: {
      type: DataTypes.ENUM("cash_in", "labor", "kitchen", "machinery", "company", "customers", "other"),
      allowNull: false,
    },
    entryType: { type: DataTypes.ENUM("in", "out"), allowNull: false, defaultValue: "out" },
    targetType: {
      type: DataTypes.ENUM(
        "supplier",
        "sales_customer",
        "exchange_dealer",
        "market_customer",
        "individual_customer",
        "regular_employee",
        "misc_worker",
        "expense",
        "company",
        "other",
      ),
      allowNull: true,
    },
    targetId: { type: DataTypes.INTEGER, allowNull: true },
    targetName: { type: DataTypes.STRING(256), allowNull: true },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    journalTransactionId: { type: DataTypes.INTEGER, allowNull: true },
    linkedEmployeePaymentId: { type: DataTypes.INTEGER, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidReason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
  },
  { sequelize, modelName: "DailyCashEntry", tableName: "daily_cash_entries", updatedAt: false },
);
