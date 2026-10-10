import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type RentalStatus = "active" | "ended" | "cancelled";
export type RentalFrequency = "monthly" | "quarterly" | "yearly";

export class Rental extends Model<InferAttributes<Rental>, InferCreationAttributes<Rental>> {
  declare id: CreationOptional<number>;
  declare rentalNumber: string;
  declare unitId: number;
  declare tenantPartyId: number;
  declare startDate: string;
  declare endDate: CreationOptional<string | null>;
  declare rentAmount: string;
  declare frequency: RentalFrequency;
  declare depositAmount: CreationOptional<string>;
  declare currencyCode: string;
  declare status: CreationOptional<RentalStatus>;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Rental.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    rentalNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    unitId: { type: DataTypes.INTEGER, allowNull: false },
    tenantPartyId: { type: DataTypes.INTEGER, allowNull: false },
    startDate: { type: DataTypes.DATEONLY, allowNull: false },
    endDate: { type: DataTypes.DATEONLY, allowNull: true },
    rentAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    frequency: { type: DataTypes.ENUM("monthly", "quarterly", "yearly"), allowNull: false, defaultValue: "monthly" },
    depositAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    status: { type: DataTypes.ENUM("active", "ended", "cancelled"), allowNull: false, defaultValue: "active" },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Rental", tableName: "rentals", timestamps: true },
);
