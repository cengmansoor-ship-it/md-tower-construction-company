import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";
import type { EmployeeWageType, EmployeeWorkerType } from "./Employee";

export class EmployeeWorkPeriod extends Model<InferAttributes<EmployeeWorkPeriod>, InferCreationAttributes<EmployeeWorkPeriod>> {
  declare id: CreationOptional<number>;
  declare employeeId: number;
  declare startDate: string;
  declare endDate: string;
  declare wageType: EmployeeWageType;
  declare wageAmount: string;
  declare currencyCode: string;
  declare workerType: EmployeeWorkerType;
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EmployeeWorkPeriod.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    wageType: { type: DataTypes.ENUM("daily", "monthly"), allowNull: false, defaultValue: "daily" },
    wageAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    workerType: { type: DataTypes.ENUM("regular", "misc"), allowNull: false, defaultValue: "regular" },
    note: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "EmployeeWorkPeriod", tableName: "employee_work_periods", timestamps: true },
);
