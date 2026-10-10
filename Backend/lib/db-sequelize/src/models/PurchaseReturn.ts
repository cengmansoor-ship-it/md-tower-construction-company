import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class PurchaseReturn extends Model<InferAttributes<PurchaseReturn>, InferCreationAttributes<PurchaseReturn>> {
  declare id: CreationOptional<number>;
  declare returnNumber: string;
  declare customerBillNumber: CreationOptional<string | null>;
  declare purchaseId: number;
  declare returnDate: string;
  declare returnedItemName: string;
  declare quantity: string;
  declare amount: string;
  declare currencyCode: string;
  declare reason: string;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PurchaseReturn.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    returnNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    customerBillNumber: { type: DataTypes.STRING(64), allowNull: true },
    purchaseId: { type: DataTypes.INTEGER, allowNull: false },
    returnDate: { type: DataTypes.DATEONLY, allowNull: false },
    returnedItemName: { type: DataTypes.STRING(256), allowNull: false },
    quantity: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    reason: { type: DataTypes.TEXT, allowNull: false },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "PurchaseReturn", tableName: "purchase_returns", timestamps: true },
);
