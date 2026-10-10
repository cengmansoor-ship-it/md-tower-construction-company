import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

export class Account extends Model<InferAttributes<Account>, InferCreationAttributes<Account>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare type: AccountType;
  declare isSystem: CreationOptional<boolean>;
  declare isActive: CreationOptional<boolean>;
}

Account.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    type: { type: DataTypes.ENUM("asset", "liability", "equity", "income", "expense"), allowNull: false },
    isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: "Account", tableName: "accounts", timestamps: false },
);
