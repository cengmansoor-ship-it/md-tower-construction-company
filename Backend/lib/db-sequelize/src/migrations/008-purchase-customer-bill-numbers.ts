import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "008-purchase-customer-bill-numbers",
  async up({ queryInterface }) {
    const purchases = await queryInterface.describeTable("purchases");
    if (!purchases["customerBillNumber"]) {
      await queryInterface.addColumn("purchases", "customerBillNumber", {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
    }

    const purchaseReturns = await queryInterface.describeTable("purchase_returns");
    if (!purchaseReturns["customerBillNumber"]) {
      await queryInterface.addColumn("purchase_returns", "customerBillNumber", {
        type: DataTypes.STRING(64),
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const purchases = await queryInterface.describeTable("purchases");
    if (purchases["customerBillNumber"]) {
      await queryInterface.removeColumn("purchases", "customerBillNumber");
    }

    const purchaseReturns = await queryInterface.describeTable("purchase_returns");
    if (purchaseReturns["customerBillNumber"]) {
      await queryInterface.removeColumn("purchase_returns", "customerBillNumber");
    }
  },
});
