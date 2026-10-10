import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type PurchaseStatus = "open" | "paid" | "cancelled";

export class Purchase extends Model<InferAttributes<Purchase>, InferCreationAttributes<Purchase>> {
  declare id: CreationOptional<number>;
  declare purchaseNumber: string;
  declare customerBillNumber: CreationOptional<string | null>;
  declare supplierPartyId: number;
  declare purchaseDate: string;
  declare itemName: string;
  declare quantity: string;
  declare unitOfMeasure: CreationOptional<string | null>;
  declare unitPrice: string;
  declare totalAmount: string;
  declare currencyCode: string;
  declare status: CreationOptional<PurchaseStatus>;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Purchase.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    purchaseNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    customerBillNumber: { type: DataTypes.STRING(64), allowNull: true },
    supplierPartyId: { type: DataTypes.INTEGER, allowNull: false },
    purchaseDate: { type: DataTypes.DATEONLY, allowNull: false },
    itemName: { type: DataTypes.STRING(256), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    unitOfMeasure: { type: DataTypes.STRING(32), allowNull: true },
    unitPrice: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    totalAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    status: { type: DataTypes.ENUM("open", "paid", "cancelled"), allowNull: false, defaultValue: "open" },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Purchase", tableName: "purchases", timestamps: true },
);
