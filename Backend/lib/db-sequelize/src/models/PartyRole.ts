import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";
import type { PartyType } from "./Party";

export class PartyRole extends Model<InferAttributes<PartyRole>, InferCreationAttributes<PartyRole>> {
  declare id: CreationOptional<number>;
  declare partyId: number;
  declare role: PartyType;
}

PartyRole.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    partyId: { type: DataTypes.INTEGER, allowNull: false },
    role: {
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
  },
  {
    sequelize,
    modelName: "PartyRole",
    tableName: "party_roles",
    timestamps: false,
    indexes: [{ unique: true, fields: ["partyId", "role"] }],
  },
);
