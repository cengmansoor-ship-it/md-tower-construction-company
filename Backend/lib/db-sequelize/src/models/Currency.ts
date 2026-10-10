import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class Currency extends Model<InferAttributes<Currency>, InferCreationAttributes<Currency>> {
  declare id: CreationOptional<number>;
  declare code: string;
  declare name: string;
  declare isBase: CreationOptional<boolean>;
}

Currency.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    code: { type: DataTypes.STRING(8), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(64), allowNull: false },
    isBase: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  { sequelize, modelName: "Currency", tableName: "currencies", timestamps: false },
);
