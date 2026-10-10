import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type CompanyPartnerStatus = "active" | "inactive";

export class CompanyPartner extends Model<InferAttributes<CompanyPartner>, InferCreationAttributes<CompanyPartner>> {
  declare id: CreationOptional<number>;
  declare partnerNumber: string;
  declare name: string;
  declare initialInvestment: string;
  declare currencyCode: string;
  declare ownershipPercent: CreationOptional<string | null>;
  declare joinDate: string;
  declare status: CreationOptional<CompanyPartnerStatus>;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

CompanyPartner.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    partnerNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    name: { type: DataTypes.STRING(160), allowNull: false },
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
  { sequelize, modelName: "CompanyPartner", tableName: "company_partners", timestamps: true },
);
