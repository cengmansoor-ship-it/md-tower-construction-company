import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class BlockGroup extends Model<InferAttributes<BlockGroup>, InferCreationAttributes<BlockGroup>> {
  declare id: CreationOptional<number>;
  declare projectId: number;
  declare name: string;
  declare order: CreationOptional<number>;
}

BlockGroup.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    projectId: { type: DataTypes.INTEGER, allowNull: false },
    name: { type: DataTypes.STRING(64), allowNull: false },
    order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { sequelize, modelName: "BlockGroup", tableName: "block_groups", timestamps: false },
);
