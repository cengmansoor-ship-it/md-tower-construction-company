import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class EmployeeDocument extends Model<InferAttributes<EmployeeDocument>, InferCreationAttributes<EmployeeDocument>> {
  declare id: CreationOptional<number>;
  declare employeeId: number;
  declare fileName: string;
  declare fileUrl: string;
  declare mimeType: string;
  declare sizeBytes: number;
  declare uploadedByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EmployeeDocument.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    fileName: { type: DataTypes.STRING(256), allowNull: false },
    fileUrl: { type: DataTypes.STRING(512), allowNull: false },
    mimeType: { type: DataTypes.STRING(64), allowNull: false },
    sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
    uploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "EmployeeDocument",
    tableName: "employee_documents",
    timestamps: true,
    indexes: [{ fields: ["employeeId"] }],
  },
);
