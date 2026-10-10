import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

async function hasTable(queryInterface: { showAllTables: () => Promise<unknown[]> }, tableName: string): Promise<boolean> {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name = typeof table === "string" ? table : (table as { tableName?: string; table_name?: string }).tableName ?? (table as { table_name?: string }).table_name;
    return String(name).toLowerCase() === tableName.toLowerCase();
  });
}

defineMigration({
  name: "034-partner-transaction-description",
  async up({ queryInterface }) {
    if (!(await hasTable(queryInterface, "partner_transactions"))) return;
    const table = await queryInterface.describeTable("partner_transactions");
    if (!table["description"]) {
      await queryInterface.addColumn("partner_transactions", "description", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
  },
  async down() {
    // No-op: keep the column to preserve data.
  },
});
