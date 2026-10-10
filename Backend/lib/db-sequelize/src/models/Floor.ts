import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type FloorType =
  | "basement"
  | "ground"
  | "mezzanine"
  | "residential"
  | "commercial"
  | "parking"
  | "roof"
  | "other";

export type FloorPurpose = "for_sale" | "for_rent";

export class Floor extends Model<InferAttributes<Floor>, InferCreationAttributes<Floor>> {
  declare id: CreationOptional<number>;
  declare blockId: number;
  declare name: string;
  declare levelNumber: number;
  declare floorType: FloorType;
  declare unitTypeId: CreationOptional<number | null>;
  declare purpose: CreationOptional<FloorPurpose | null>;
  declare order: CreationOptional<number>;
}

Floor.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    blockId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(64), allowNull: false },
    levelNumber: { type: DataTypes.INTEGER, allowNull: false },
    floorType: {
      type: DataTypes.ENUM("basement", "ground", "mezzanine", "residential", "commercial", "parking", "roof", "other"),
      allowNull: false,
      defaultValue: "residential",
    },
    unitTypeId: { type: DataTypes.INTEGER, allowNull: true },
    purpose: { type: DataTypes.ENUM("for_sale", "for_rent"), allowNull: true },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  {
    sequelize,
    modelName: "Floor",
    tableName: "floors",
    timestamps: false,
    indexes: [{ unique: true, fields: ["blockId", "levelNumber"] }],
  },
);
