import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export type AttendanceStatus = "present" | "absent" | "leave" | "half_day";

export class Attendance extends Model<InferAttributes<Attendance>, InferCreationAttributes<Attendance>> {
  declare id: CreationOptional<number>;
  declare employeeId: number;
  declare date: string;
  declare status: AttendanceStatus;
  declare payableAmount: string;
  declare currencyCode: string;
  declare notes: CreationOptional<string | null>;
  declare createdByUserId: CreationOptional<number | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Attendance.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    employeeId: { type: DataTypes.INTEGER, allowNull: false },
    date: { type: DataTypes.DATEONLY, allowNull: false },
    status: { type: DataTypes.ENUM("present", "absent", "leave", "half_day"), allowNull: false },
    payableAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: "0.0000" },
    currencyCode: { type: DataTypes.STRING(8), allowNull: false },
    notes: { type: DataTypes.TEXT, allowNull: true },
    createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    modelName: "Attendance",
    tableName: "attendances",
    timestamps: true,
    indexes: [{ unique: true, fields: ["employeeId", "date"] }],
  },
);
