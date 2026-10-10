import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes, type NonAttribute } from "sequelize";
import { sequelize } from "../connection";
import type { User } from "./User";

export class Delegation extends Model<InferAttributes<Delegation>, InferCreationAttributes<Delegation>> {
  declare id: CreationOptional<number>;
  declare delegatedUserId: number;
  declare delegatedByUserId: CreationOptional<number | null>;
  declare delegatedRole: CreationOptional<string>;
  declare startDate: string;
  declare endDate: string;
  declare reason: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare delegatedUser?: NonAttribute<User>;
  declare delegatedBy?: NonAttribute<User>;
}

Delegation.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    delegatedUserId: { type: DataTypes.INTEGER, allowNull: false },
    delegatedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    delegatedRole: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "kafil" },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "Delegation",
    tableName: "user_delegations",
    timestamps: true,
    indexes: [
      { fields: ["delegatedUserId"] },
      { fields: ["isActive", "startDate", "endDate"] },
    ],
  },
);
