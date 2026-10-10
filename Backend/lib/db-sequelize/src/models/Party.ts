import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type PartyType =
  | "individual_customer"
  | "market_customer"
  | "supplier"
  | "sales_customer"
  | "tenant"
  | "exchange_dealer"
  | "employee"
  | "partner"
  | "other";

export class Party extends Model<InferAttributes<Party>, InferCreationAttributes<Party>> {
  declare id: CreationOptional<number>;
  declare type: PartyType;
  declare name: string;
  declare companyName: CreationOptional<string | null>;
  declare fatherName: CreationOptional<string | null>;
  declare grandfatherName: CreationOptional<string | null>;
  declare tazkiraNumber: CreationOptional<string | null>;
  declare taxRegNumber: CreationOptional<string | null>;
  declare phone1: CreationOptional<string | null>;
  declare phone2: CreationOptional<string | null>;
  declare address: CreationOptional<string | null>;
  declare notes: CreationOptional<string | null>;
  declare photoUrl: CreationOptional<string | null>;
  declare isActive: CreationOptional<boolean>;
  declare deletedAt: CreationOptional<Date | null>;
  declare deletedByUserId: CreationOptional<number | null>;
  declare deleteReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Party.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    type: {
      type: DataTypes.ENUM(
        "individual_customer",
        "market_customer",
        "supplier",
        "sales_customer",
        "tenant",
        "exchange_dealer",
        "employee",
        "partner",
        "other",
      ),
      allowNull: false,
    },
    name: { type: DataTypes.STRING(256), allowNull: false },
    companyName: { type: DataTypes.STRING(256), allowNull: true },
    fatherName: { type: DataTypes.STRING(256), allowNull: true },
    grandfatherName: { type: DataTypes.STRING(256), allowNull: true },
    tazkiraNumber: { type: DataTypes.STRING(64), allowNull: true },
    taxRegNumber: { type: DataTypes.STRING(64), allowNull: true },
    phone1: { type: DataTypes.STRING(32), allowNull: true },
    phone2: { type: DataTypes.STRING(32), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },
    photoUrl: { type: DataTypes.STRING(512), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    deletedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    deleteReason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "Party",
    tableName: "parties",
    timestamps: true,
    indexes: [{ fields: ["name"] }, { fields: ["tazkiraNumber"] }, { fields: ["type"] }],
  },
);
