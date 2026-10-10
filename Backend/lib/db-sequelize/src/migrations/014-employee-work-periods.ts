import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "014-employee-work-periods",
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("employee_work_periods")) return;

    await queryInterface.createTable("employee_work_periods", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      wageType: { type: DataTypes.ENUM("daily", "monthly"), allowNull: false, defaultValue: "daily" },
      wageAmount: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
      currencyCode: { type: DataTypes.STRING(8), allowNull: false },
      workerType: { type: DataTypes.ENUM("regular", "misc"), allowNull: false, defaultValue: "regular" },
      note: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
  },
  async down({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("employee_work_periods")) await queryInterface.dropTable("employee_work_periods");
  },
});
