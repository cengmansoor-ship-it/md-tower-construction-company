import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class Permission extends Model<InferAttributes<Permission>, InferCreationAttributes<Permission>> {
  declare id: CreationOptional<number>;
  declare key: string;
  declare description: CreationOptional<string | null>;
}

Permission.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    key: { type: DataTypes.STRING(96), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
  },
  { sequelize, modelName: "Permission", tableName: "permissions", timestamps: false },
);
