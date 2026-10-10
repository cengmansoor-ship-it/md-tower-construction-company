import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class FiscalPeriod extends Model<InferAttributes<FiscalPeriod>, InferCreationAttributes<FiscalPeriod>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare startDate: string;
  declare endDate: string;
  declare isClosed: CreationOptional<boolean>;
}

FiscalPeriod.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(64), allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    isClosed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "FiscalPeriod", tableName: "fiscal_periods", timestamps: false },
);
