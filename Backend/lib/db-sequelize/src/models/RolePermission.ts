import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class RolePermission extends Model<InferAttributes<RolePermission>, InferCreationAttributes<RolePermission>> {
  declare id: CreationOptional<number>;
  declare roleId: number;
  declare permissionId: number;
}

RolePermission.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    roleId: { type: DataTypes.INTEGER, allowNull: false },
    permissionId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    sequelize,
    modelName: "RolePermission",
    tableName: "role_permissions",
    timestamps: false,
    indexes: [{ unique: true, fields: ["roleId", "permissionId"] }],
  },
);
