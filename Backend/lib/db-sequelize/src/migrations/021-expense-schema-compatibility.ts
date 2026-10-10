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
  name: "021-expense-schema-compatibility",
  async up({ queryInterface, sequelize }) {
    if (!(await hasTable(queryInterface, "expenses"))) return;

    const expenses = await queryInterface.describeTable("expenses");
    if (!expenses["category"]) {
      await queryInterface.addColumn("expenses", "category", {
        type: DataTypes.ENUM("kitchen", "office", "transport", "utilities", "salaries", "maintenance", "other"),
        allowNull: false,
        defaultValue: "other",
      });
    }
    if (!expenses["payeePartyId"]) {
      await queryInterface.addColumn("expenses", "payeePartyId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!expenses["payeeName"]) {
      await queryInterface.addColumn("expenses", "payeeName", {
        type: DataTypes.STRING(256),
        allowNull: true,
      });
    }

    const refreshed = await queryInterface.describeTable("expenses");
    if (refreshed["partyId"] && refreshed["payeePartyId"]) {
      await sequelize.query("UPDATE `expenses` SET `payeePartyId` = `partyId` WHERE `payeePartyId` IS NULL");
    }
  },
  async down() {
    // No-op: these columns make old MySQL databases readable by the current code.
  },
});
