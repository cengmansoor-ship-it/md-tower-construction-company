import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class CashAccount extends Model<InferAttributes<CashAccount>, InferCreationAttributes<CashAccount>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare currencyCode: string;
  declare accountId: number;
  declare isActive: CreationOptional<boolean>;
}

CashAccount.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: "CashAccount", tableName: "cash_accounts", timestamps: false },
);
