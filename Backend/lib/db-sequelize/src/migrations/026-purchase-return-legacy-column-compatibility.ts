import type { QueryInterface } from "sequelize";
import { defineMigration } from "./runner";

async function describeIfExists(queryInterface: QueryInterface, tableName: string) {
  try {
    return await queryInterface.describeTable(tableName);
  } catch {
    return null;
  }
}

defineMigration({
  name: "026-purchase-return-legacy-column-compatibility",
  async up({ queryInterface, sequelize }) {
    const table = await describeIfExists(queryInterface, "purchase_returns");
    if (!table) return;
    const dialect = sequelize.getDialect();

    if (table["supplierId"] && dialect === "mysql") {
      const purchases = await describeIfExists(queryInterface, "purchases");
      const purchaseSupplierColumn = purchases?.["supplierPartyId"]
        ? "supplierPartyId"
        : purchases?.["supplierId"]
          ? "supplierId"
          : null;

      if (purchaseSupplierColumn) {
        await sequelize.query(`
          UPDATE \`purchase_returns\` r
          JOIN \`purchases\` p ON p.\`id\` = r.\`purchaseId\`
          SET r.\`supplierId\` = p.\`${purchaseSupplierColumn}\`
          WHERE r.\`supplierId\` IS NULL OR r.\`supplierId\` = 0
        `);
      }

      await sequelize.query("ALTER TABLE `purchase_returns` MODIFY `supplierId` INT NULL");
    }

    if (table["totalAmount"] && dialect === "mysql") {
      if (table["amount"]) {
        await sequelize.query(`
          UPDATE \`purchase_returns\`
          SET \`totalAmount\` = \`amount\`
          WHERE \`totalAmount\` IS NULL OR \`totalAmount\` = 0
        `);
      }

      await sequelize.query("ALTER TABLE `purchase_returns` MODIFY `totalAmount` DECIMAL(36, 18) NULL");
    }
  },
  async down() {
    // Compatibility-only migration; no destructive rollback.
  },
});
