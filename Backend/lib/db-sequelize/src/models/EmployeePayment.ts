import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type EmployeePaymentType = "salary" | "advance" | "debt_repayment";

export class EmployeePayment extends Model<InferAttributes<EmployeePayment>, InferCreationAttributes<EmployeePayment>> {
  declare id: CreationOptional<number>;
  declare paymentNumber: string;
  declare employeeId: number;
  declare paymentDate: string;
  declare type: EmployeePaymentType;
  declare amount: string;
  declare previousBalance: CreationOptional<string | null>;
  declare newBalance: CreationOptional<string | null>;
  declare currencyCode: string;
  declare method: CreationOptional<string>;
  declare cashAccountId: CreationOptional<number | null>;
  declare note: CreationOptional<string | null>;
  declare paidByUserId: CreationOptional<number | null>;
  declare voidedAt: CreationOptional<Date | null>;
  declare voidReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EmployeePayment.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    paymentNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false },
    type: { type: DataTypes.ENUM("salary", "advance", "debt_repayment"), allowNull: false, defaultValue: "salary" },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    previousBalance: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
    newBalance: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    method: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "cash" },
    cashAccountId: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    paidByUserId: { type: DataTypes.INTEGER, allowNull: true },
    voidedAt: { type: DataTypes.DATE, allowNull: true },
    voidReason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "EmployeePayment", tableName: "employee_payments", timestamps: true },
);
