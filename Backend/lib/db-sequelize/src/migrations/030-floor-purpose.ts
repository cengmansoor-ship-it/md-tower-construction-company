import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

async function hasTable(queryInterface: { showAllTables: () => Promise<unknown[]> }, tableName: string): Promise<boolean> {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name =
      typeof table === "string" ? table : (table as { tableName?: string; table_name?: string }).tableName ?? (table as { table_name?: string }).table_name;
    return String(name).toLowerCase() === tableName.toLowerCase();
  });
}

defineMigration({
  name: "030-floor-purpose",
  async up({ queryInterface }) {
    if (!(await hasTable(queryInterface, "floors"))) return;
    const floors = await queryInterface.describeTable("floors");
    if (!floors["purpose"]) {
      await queryInterface.addColumn("floors", "purpose", {
        type: DataTypes.ENUM("for_sale", "for_rent"),
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    if (!(await hasTable(queryInterface, "floors"))) return;
    const floors = await queryInterface.describeTable("floors");
    if (floors["purpose"]) {
      await queryInterface.removeColumn("floors", "purpose");
    }
  },
});
