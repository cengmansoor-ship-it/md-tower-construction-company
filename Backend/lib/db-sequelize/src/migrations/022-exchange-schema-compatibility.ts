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
  name: "022-exchange-schema-compatibility",
  async up({ queryInterface, sequelize }) {
    if (!(await hasTable(queryInterface, "exchange_transactions"))) return;
    const dialect = sequelize.getDialect();

    const table = await queryInterface.describeTable("exchange_transactions");
    if (!table["exchangeNumber"]) {
      await queryInterface.addColumn("exchange_transactions", "exchangeNumber", {
        type: DataTypes.STRING(32),
        allowNull: true,
      });
    }
    if (!table["partyId"]) {
      await queryInterface.addColumn("exchange_transactions", "partyId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["exchangeDate"]) {
      await queryInterface.addColumn("exchange_transactions", "exchangeDate", {
        type: DataTypes.DATEONLY,
        allowNull: true,
      });
    }
    if (!table["currencyGiven"]) {
      await queryInterface.addColumn("exchange_transactions", "currencyGiven", {
        type: DataTypes.STRING(8),
        allowNull: true,
      });
    }
    if (!table["amountGiven"]) {
      await queryInterface.addColumn("exchange_transactions", "amountGiven", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: false,
        defaultValue: "0",
      });
    }
    if (!table["currencyReceived"]) {
      await queryInterface.addColumn("exchange_transactions", "currencyReceived", {
        type: DataTypes.STRING(8),
        allowNull: true,
      });
    }
    if (!table["amountReceived"]) {
      await queryInterface.addColumn("exchange_transactions", "amountReceived", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: false,
        defaultValue: "0",
      });
    }
    if (!table["rate"]) {
      await queryInterface.addColumn("exchange_transactions", "rate", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: false,
        defaultValue: "1",
      });
    }
    if (!table["reference"]) {
      await queryInterface.addColumn("exchange_transactions", "reference", {
        type: DataTypes.STRING(128),
        allowNull: true,
      });
    }
    if (!table["notes"]) {
      await queryInterface.addColumn("exchange_transactions", "notes", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }

    const refreshed = await queryInterface.describeTable("exchange_transactions");
    if (refreshed["exchangeNumber"]) {
      await sequelize.query(
        dialect === "sqlite"
          ? "UPDATE `exchange_transactions` SET `exchangeNumber` = 'EX-' || printf('%06d', `id`) WHERE `exchangeNumber` IS NULL OR `exchangeNumber` = ''"
          : "UPDATE `exchange_transactions` SET `exchangeNumber` = CONCAT('EX-', LPAD(`id`, 6, '0')) WHERE `exchangeNumber` IS NULL OR `exchangeNumber` = ''",
      );
    }
    if (refreshed["dealerId"] && refreshed["partyId"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `partyId` = `dealerId` WHERE `partyId` IS NULL");
    }
    if (refreshed["transactionDate"] && refreshed["exchangeDate"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `exchangeDate` = `transactionDate` WHERE `exchangeDate` IS NULL");
    }
    if (refreshed["sourceCurrency"] && refreshed["currencyGiven"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `currencyGiven` = `sourceCurrency` WHERE `currencyGiven` IS NULL");
    }
    if (refreshed["sourceAmount"] && refreshed["amountGiven"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `amountGiven` = `sourceAmount` WHERE `amountGiven` = 0");
    }
    if (refreshed["destCurrency"] && refreshed["currencyReceived"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `currencyReceived` = COALESCE(`destCurrency`, `sourceCurrency`) WHERE `currencyReceived` IS NULL");
    }
    if (refreshed["destAmount"] && refreshed["amountReceived"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `amountReceived` = COALESCE(`destAmount`, `sourceAmount`) WHERE `amountReceived` = 0");
    }
    if (refreshed["exchangeRate"] && refreshed["rate"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `rate` = COALESCE(`exchangeRate`, 1) WHERE `rate` = 1");
    }
    if (refreshed["description"] && refreshed["notes"]) {
      await sequelize.query("UPDATE `exchange_transactions` SET `notes` = `description` WHERE `notes` IS NULL");
    }
  },
  async down() {
    // No-op: keeps old exchange records readable by the current code.
  },
});
