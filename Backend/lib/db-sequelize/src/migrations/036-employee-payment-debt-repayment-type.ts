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
  name: "036-employee-payment-debt-repayment-type",
  async up({ queryInterface, sequelize }) {
    if (!(await hasTable(queryInterface, "employee_payments"))) return;
    const dialect = sequelize.getDialect();
    if (dialect === "mysql") {
      await sequelize.query(
        "ALTER TABLE `employee_payments` MODIFY COLUMN `type` ENUM('salary','advance','debt_repayment') NOT NULL DEFAULT 'salary'",
      );
    } else if (dialect === "sqlite") {
      const table = await queryInterface.describeTable("employee_payments");
      if (table["type"]) {
        await queryInterface.changeColumn("employee_payments", "type", {
          type: DataTypes.ENUM("salary", "advance", "debt_repayment"),
          allowNull: false,
          defaultValue: "salary",
        });
      }
    }
  },
  async down() {
    // No-op: keep the extended enum so existing records stay valid.
  },
});
