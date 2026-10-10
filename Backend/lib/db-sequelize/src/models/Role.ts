import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type BelongsToManyAddAssociationMixin,
  type BelongsToManyHasAssociationMixin,
  type BelongsToManyGetAssociationsMixin,
  type BelongsToManyRemoveAssociationMixin,
  type BelongsToManySetAssociationsMixin,
} from "sequelize";
import { sequelize } from "../connection";
import type { Permission } from "./Permission";
import type { User } from "./User";

export class Role extends Model<InferAttributes<Role>, InferCreationAttributes<Role>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare addPermission: BelongsToManyAddAssociationMixin<Permission, number>;
  declare hasPermission: BelongsToManyHasAssociationMixin<Permission, number>;
  declare removePermission: BelongsToManyRemoveAssociationMixin<Permission, number>;
  declare setPermissions: BelongsToManySetAssociationsMixin<Permission, number>;
  declare getPermissions: BelongsToManyGetAssociationsMixin<Permission>;
  declare getUsers: BelongsToManyGetAssociationsMixin<User>;
}

Role.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    description: { type: DataTypes.STRING(255), allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Role", tableName: "roles" },
);
