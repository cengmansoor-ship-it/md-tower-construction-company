import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type PartnerStatus = "active" | "inactive";

export class Partner extends Model<InferAttributes<Partner>, InferCreationAttributes<Partner>> {
  declare id: CreationOptional<number>;
  declare partnerNumber: string;
  declare partyId: number;
  declare initialInvestment: string;
  declare currencyCode: string;
  declare ownershipPercent: CreationOptional<string | null>;
  declare joinDate: string;
  declare status: CreationOptional<PartnerStatus>;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Partner.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    partnerNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    partyId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
    initialInvestment: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    ownershipPercent: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
    joinDate: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Partner", tableName: "partners", timestamps: true },
);
