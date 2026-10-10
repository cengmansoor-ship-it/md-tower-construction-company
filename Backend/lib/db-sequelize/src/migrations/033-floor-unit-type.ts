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
  name: "033-floor-unit-type",
  async up({ queryInterface }) {
    if (!(await hasTable(queryInterface, "floors"))) return;
    const floors = await queryInterface.describeTable("floors");
    if (!floors["unitTypeId"]) {
      await queryInterface.addColumn("floors", "unitTypeId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    if (!(await hasTable(queryInterface, "floors"))) return;
    const floors = await queryInterface.describeTable("floors");
    if (floors["unitTypeId"]) {
      await queryInterface.removeColumn("floors", "unitTypeId");
    }
  },
});
