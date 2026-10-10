import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type PartnerTransactionType = "investment" | "withdrawal";

export class PartnerTransaction extends Model<InferAttributes<PartnerTransaction>, InferCreationAttributes<PartnerTransaction>> {
  declare id: CreationOptional<number>;
  declare transactionNumber: string;
  declare partnerId: number;
  declare transactionDate: string;
  declare type: PartnerTransactionType;
  declare amount: string;
  declare previousBalance: CreationOptional<string | null>;
  declare newBalance: CreationOptional<string | null>;
  declare currencyCode: string;
  declare description: CreationOptional<string | null>;
  declare note: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerTransaction.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    transactionNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    partnerId: { type: DataTypes.INTEGER, allowNull: false },
    transactionDate: { type: DataTypes.DATEONLY, allowNull: false },
    type: { type: DataTypes.ENUM("investment", "withdrawal"), allowNull: false },
    amount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
    previousBalance: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
    newBalance: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "PartnerTransaction", tableName: "partner_transactions", timestamps: true },
);
