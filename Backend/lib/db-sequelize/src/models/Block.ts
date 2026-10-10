import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class Block extends Model<InferAttributes<Block>, InferCreationAttributes<Block>> {
  declare id: CreationOptional<number>;
  declare projectId: number;
  declare blockGroupId: CreationOptional<number | null>;
  declare name: string;
  declare code: string;
  declare order: CreationOptional<number>;
  declare notes: CreationOptional<string | null>;
}

Block.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    projectId: { type: DataTypes.INTEGER, allowNull: false },
    blockGroupId: { type: DataTypes.INTEGER, allowNull: true },
    name: { type: DataTypes.STRING(64), allowNull: false },
    code: { type: DataTypes.STRING(32), allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    sequelize,
    modelName: "Block",
    tableName: "blocks",
    timestamps: false,
    indexes: [{ unique: true, fields: ["projectId", "code"] }],
  },
);
