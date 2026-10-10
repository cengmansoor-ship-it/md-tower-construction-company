import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "010-expense-category-config",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    if (table["expenseCategoryConfig"]) return;
    await queryInterface.addColumn("company_settings", "expenseCategoryConfig", {
      type: DataTypes.TEXT,
      allowNull: true,
    });
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    if (!table["expenseCategoryConfig"]) return;
    await queryInterface.removeColumn("company_settings", "expenseCategoryConfig");
  },
});
