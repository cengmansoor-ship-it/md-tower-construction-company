import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

/**
 * Adds sourceReceiptId + voidedAt to sale_credits so an overpayment credit can be
 * traced back to (and voided alongside) the receipt that created it.
 * Additive only — never drops or renames existing columns/data.
 */
defineMigration({
  name: "002-sale-credit-void-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("sale_credits");
    if (!table["sourceReceiptId"]) {
      await queryInterface.addColumn("sale_credits", "sourceReceiptId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["voidedAt"]) {
      await queryInterface.addColumn("sale_credits", "voidedAt", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("sale_credits");
    if (table["sourceReceiptId"]) {
      await queryInterface.removeColumn("sale_credits", "sourceReceiptId");
    }
    if (table["voidedAt"]) {
      await queryInterface.removeColumn("sale_credits", "voidedAt");
    }
  },
});
