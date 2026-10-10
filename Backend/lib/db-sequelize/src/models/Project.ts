import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type ProjectStatus = "draft" | "active" | "on_hold" | "completed" | "archived";

export class Project extends Model<InferAttributes<Project>, InferCreationAttributes<Project>> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare code: string;
  declare status: CreationOptional<ProjectStatus>;
  declare description: CreationOptional<string | null>;
  declare deletedAt: CreationOptional<Date | null>;
  declare deletedByUserId: CreationOptional<number | null>;
  declare deleteReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Project.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(128), allowNull: false },
    code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
    status: {
      type: DataTypes.ENUM("draft", "active", "on_hold", "completed", "archived"),
      allowNull: false,
      defaultValue: "draft",
    },
    description: { type: DataTypes.TEXT, allowNull: true },
    deletedAt: { type: DataTypes.DATE, allowNull: true },
    deletedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    deleteReason: { type: DataTypes.TEXT, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  { sequelize, modelName: "Project", tableName: "projects" },
);
