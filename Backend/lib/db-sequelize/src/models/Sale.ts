import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type SaleStatus = "draft" | "reserved" | "active" | "fully_paid" | "cancelled" | "reversed";

export class Sale extends Model<InferAttributes<Sale>, InferCreationAttributes<Sale>> {
  declare id: CreationOptional<number>;
  declare saleNumber: string;
  declare contractNumber: CreationOptional<string | null>;
  declare unitId: number;
  declare partyId: number;
  declare price: string;
  declare discount: CreationOptional<string>;
  declare finalPrice: string;
  declare currencyCode: string;
  declare saleDate: string;
  declare paymentType: CreationOptional<string | null>;
  declare status: CreationOptional<SaleStatus>;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Sale.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    saleNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    contractNumber: { type: DataTypes.STRING(64), allowNull: true },
    unitId: { type: DataTypes.INTEGER, allowNull: false },
    partyId: { type: DataTypes.INTEGER, allowNull: false },
    price: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    discount: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
    finalPrice: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    saleDate: { type: DataTypes.DATEONLY, allowNull: false },
    paymentType: { type: DataTypes.STRING(32), allowNull: true },
    status: {
      type: DataTypes.ENUM("draft", "reserved", "active", "fully_paid", "cancelled", "reversed"),
      allowNull: false,
      defaultValue: "draft",
    },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Sale", tableName: "sales", timestamps: true },
);
