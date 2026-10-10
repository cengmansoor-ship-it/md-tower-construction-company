import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "017-daily-cash-target-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("daily_cash_entries");
    if (!table["entryType"]) {
      await queryInterface.addColumn("daily_cash_entries", "entryType", {
        type: DataTypes.STRING(8),
        allowNull: false,
        defaultValue: "out",
      });
      await queryInterface.sequelize.query("UPDATE daily_cash_entries SET entryType = CASE WHEN category = 'cash_in' THEN 'in' ELSE 'out' END");
    }
    if (!table["targetType"]) {
      await queryInterface.addColumn("daily_cash_entries", "targetType", {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
    }
    if (!table["targetId"]) {
      await queryInterface.addColumn("daily_cash_entries", "targetId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["targetName"]) {
      await queryInterface.addColumn("daily_cash_entries", "targetName", {
        type: DataTypes.STRING(256),
        allowNull: true,
      });
    }
    if (!table["linkedEmployeePaymentId"]) {
      await queryInterface.addColumn("daily_cash_entries", "linkedEmployeePaymentId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("daily_cash_entries");
    if (table["linkedEmployeePaymentId"]) await queryInterface.removeColumn("daily_cash_entries", "linkedEmployeePaymentId");
    if (table["targetName"]) await queryInterface.removeColumn("daily_cash_entries", "targetName");
    if (table["targetId"]) await queryInterface.removeColumn("daily_cash_entries", "targetId");
    if (table["targetType"]) await queryInterface.removeColumn("daily_cash_entries", "targetType");
    if (table["entryType"]) await queryInterface.removeColumn("daily_cash_entries", "entryType");
  },
});
