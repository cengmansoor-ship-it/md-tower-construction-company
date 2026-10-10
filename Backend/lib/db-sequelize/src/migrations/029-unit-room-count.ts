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
  name: "029-unit-room-count",
  async up({ queryInterface }) {
    if (!(await hasTable(queryInterface, "units"))) return;
    const units = await queryInterface.describeTable("units");
    if (!units["roomCount"]) {
      await queryInterface.addColumn("units", "roomCount", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    if (!(await hasTable(queryInterface, "units"))) return;
    const units = await queryInterface.describeTable("units");
    if (units["roomCount"]) {
      await queryInterface.removeColumn("units", "roomCount");
    }
  },
});
