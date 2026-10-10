import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

/**
 * Adds previousBalance/newBalance to sale_receipts so every receipt records the balance
 * snapshot required by the sales/receipts spec (previous balance, received amount, new balance).
 * Additive only — never drops or renames existing columns/data.
 */
defineMigration({
  name: "003-sale-receipt-balance-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("sale_receipts");
    if (!table["previousBalance"]) {
      await queryInterface.addColumn("sale_receipts", "previousBalance", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
    if (!table["newBalance"]) {
      await queryInterface.addColumn("sale_receipts", "newBalance", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("sale_receipts");
    if (table["previousBalance"]) {
      await queryInterface.removeColumn("sale_receipts", "previousBalance");
    }
    if (table["newBalance"]) {
      await queryInterface.removeColumn("sale_receipts", "newBalance");
    }
  },
});
