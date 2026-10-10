import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "009-expense-category-name",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("expenses");
    if (table["categoryName"]) return;
    await queryInterface.addColumn("expenses", "categoryName", {
      type: DataTypes.STRING(128),
      allowNull: true,
    });
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("expenses");
    if (!table["categoryName"]) return;
    await queryInterface.removeColumn("expenses", "categoryName");
  },
});
