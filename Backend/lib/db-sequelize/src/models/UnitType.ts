import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class UnitType extends Model<InferAttributes<UnitType>, InferCreationAttributes<UnitType>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare isActive: CreationOptional<boolean>;
}

UnitType.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  },
  { sequelize, modelName: "UnitType", tableName: "unit_types", timestamps: false },
);
