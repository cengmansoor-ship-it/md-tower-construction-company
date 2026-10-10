import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type EmployeeWageType = "daily" | "monthly";
export type EmployeeStatus = "active" | "inactive";
export type EmployeeWorkerType = "regular" | "misc";

export class Employee extends Model<InferAttributes<Employee>, InferCreationAttributes<Employee>> {
  declare id: CreationOptional<number>;
  declare employeeNumber: string;
  declare name: string;
  declare fatherName: CreationOptional<string | null>;
  declare phone: CreationOptional<string | null>;
  declare position: string;
  declare wageType: EmployeeWageType;
  declare wageAmount: string;
  declare currencyCode: string;
  declare startDate: string;
  declare endDate: CreationOptional<string | null>;
  declare status: CreationOptional<EmployeeStatus>;
  declare workerType: CreationOptional<EmployeeWorkerType>;
  declare notes: CreationOptional<string | null>;
  declare deletedAt: CreationOptional<Date | null>;
  declare deletedByUserId: CreationOptional<number | null>;
  declare deleteReason: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Employee.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    employeeNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(256), allowNull: false },
    fatherName: { type: DataTypes.STRING(256), allowNull: true },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    position: { type: DataTypes.STRING(128), allowNull: false },
    wageType: { type: DataTypes.ENUM("daily", "monthly"), allowNull: false, defaultValue: "daily" },
    wageAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
    workerType: { type: DataTypes.ENUM("regular", "misc"), allowNull: false, defaultValue: "regular" },
    notes: { type: DataTypes.TEXT, allowNull: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    deletedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    deleteReason: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Employee", tableName: "employees", timestamps: true },
);
