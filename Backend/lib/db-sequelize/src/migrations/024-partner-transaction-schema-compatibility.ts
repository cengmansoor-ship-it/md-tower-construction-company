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
  name: "024-partner-transaction-schema-compatibility",
  async up({ queryInterface, sequelize }) {
    if (!(await hasTable(queryInterface, "partner_transactions"))) return;
    const dialect = sequelize.getDialect();

    const table = await queryInterface.describeTable("partner_transactions");
    if (!table["transactionNumber"]) {
      await queryInterface.addColumn("partner_transactions", "transactionNumber", {
        type: DataTypes.STRING(32),
        allowNull: true,
      });
    }
    if (!table["type"]) {
      await queryInterface.addColumn("partner_transactions", "type", {
        type: DataTypes.ENUM("investment", "withdrawal"),
        allowNull: false,
        defaultValue: "investment",
      });
    }
    if (!table["previousBalance"]) {
      await queryInterface.addColumn("partner_transactions", "previousBalance", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
    if (!table["newBalance"]) {
      await queryInterface.addColumn("partner_transactions", "newBalance", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
    if (!table["note"]) {
      await queryInterface.addColumn("partner_transactions", "note", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }

    const refreshed = await queryInterface.describeTable("partner_transactions");
    if (refreshed["transactionNumber"]) {
      await sequelize.query(
        dialect === "sqlite"
          ? "UPDATE `partner_transactions` SET `transactionNumber` = 'PT-' || printf('%06d', `id`) WHERE `transactionNumber` IS NULL OR `transactionNumber` = ''"
          : "UPDATE `partner_transactions` SET `transactionNumber` = CONCAT('PT-', LPAD(`id`, 6, '0')) WHERE `transactionNumber` IS NULL OR `transactionNumber` = ''",
      );
    }
    if (refreshed["txType"] && refreshed["type"]) {
      await sequelize.query("UPDATE `partner_transactions` SET `type` = CASE WHEN `txType` = 'withdrawal' THEN 'withdrawal' ELSE 'investment' END");
    }
    if (refreshed["description"] && refreshed["note"]) {
      await sequelize.query("UPDATE `partner_transactions` SET `note` = `description` WHERE `note` IS NULL");
    }
  },
  async down() {
    // No-op: compatibility columns must remain for existing MySQL databases.
  },
});
