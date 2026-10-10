import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type ExpenseCategory = "kitchen" | "office" | "transport" | "utilities" | "salaries" | "maintenance" | "other";

export class Expense extends Model<InferAttributes<Expense>, InferCreationAttributes<Expense>> {
  declare id: CreationOptional<number>;
  declare expenseNumber: string;
  declare category: ExpenseCategory;
  declare categoryName: CreationOptional<string | null>;
  declare expenseDate: string;
  declare description: string;
  declare amount: string;
  declare currencyCode: string;
  declare payeePartyId: CreationOptional<number | null>;
  declare payeeName: CreationOptional<string | null>;
  declare projectId: CreationOptional<number | null>;
  declare cashAccountId: CreationOptional<number | null>;
  declare voidedAt: CreationOptional<Date | null>;
  declare voidReason: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Expense.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    expenseNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    category: {
      type: DataTypes.ENUM("kitchen", "office", "transport", "utilities", "salaries", "maintenance", "other"),
      allowNull: false,
    },
    categoryName: { type: DataTypes.STRING(128), allowNull: true },
    expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: false },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    payeePartyId: { type: DataTypes.INTEGER, allowNull: true },
    payeeName: { type: DataTypes.STRING(256), allowNull: true },
    projectId: { type: DataTypes.INTEGER, allowNull: true },
    cashAccountId: { type: DataTypes.INTEGER, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidReason: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Expense", tableName: "expenses", timestamps: true },
);
