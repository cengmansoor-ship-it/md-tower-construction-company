import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type UnitStatus = "draft" | "available" | "reserved" | "sold" | "rented" | "blocked" | "cancelled" | "inactive";
export type UnitPurpose = "for_sale" | "for_rent" | "both" | "not_available";

/** Statuses that can be selected from the project unit editor. */
export const MANUALLY_SETTABLE_UNIT_STATUSES: UnitStatus[] = ["draft", "available", "reserved", "sold", "rented", "blocked", "cancelled", "inactive"];

export class Unit extends Model<InferAttributes<Unit>, InferCreationAttributes<Unit>> {
  declare id: CreationOptional<number>;
  declare floorId: number;
  declare unitTypeId: number;
  declare unitNumber: string;
  declare status: CreationOptional<UnitStatus>;
  declare purpose: CreationOptional<UnitPurpose>;
  declare roomCount: CreationOptional<number | null>;
  declare areaSqm: CreationOptional<number | null>;
  declare notes: CreationOptional<string | null>;
}

Unit.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    floorId: { type: DataTypes.INTEGER, allowNull: false },
    unitTypeId: { type: DataTypes.INTEGER, allowNull: false },
    unitNumber: { type: DataTypes.STRING(32), allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "available", "reserved", "sold", "rented", "blocked", "cancelled", "inactive"),
      allowNull: false,
      defaultValue: "draft",
    },
    purpose: {
      type: DataTypes.ENUM("for_sale", "for_rent", "both", "not_available"),
      allowNull: false,
      defaultValue: "not_available",
    },
    roomCount: { type: DataTypes.INTEGER, allowNull: true },
    areaSqm: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: "Unit",
    tableName: "units",
    timestamps: false,
    indexes: [{ unique: true, fields: ["floorId", "unitNumber"] }],
  },
);
