import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

const UNKNOWN_ITEM_LABEL = "\u0646\u0627\u0645\u0639\u0644\u0648\u0645";
const RETURN_ITEM_LABEL = "\u0648\u0627\u067e\u0633\u064a";

async function hasTable(queryInterface: { showAllTables: () => Promise<unknown[]> }, tableName: string): Promise<boolean> {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name =
      typeof table === "string" ? table : (table as { tableName?: string; table_name?: string }).tableName ?? (table as { table_name?: string }).table_name;
    return String(name).toLowerCase() === tableName.toLowerCase();
  });
}

defineMigration({
  name: "020-purchase-schema-compatibility",
  async up({ queryInterface, sequelize }) {
    const dialect = sequelize.getDialect();

    if (await hasTable(queryInterface, "purchases")) {
      const purchases = await queryInterface.describeTable("purchases");

      if (!purchases["supplierPartyId"]) {
        await queryInterface.addColumn("purchases", "supplierPartyId", {
          type: DataTypes.INTEGER,
          allowNull: true,
        });
      }
      if (!purchases["itemName"]) {
        await queryInterface.addColumn("purchases", "itemName", {
          type: DataTypes.STRING(256),
          allowNull: false,
          defaultValue: UNKNOWN_ITEM_LABEL,
        });
      }
      if (!purchases["quantity"]) {
        await queryInterface.addColumn("purchases", "quantity", {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: "0",
        });
      }
      if (!purchases["unitOfMeasure"]) {
        await queryInterface.addColumn("purchases", "unitOfMeasure", {
          type: DataTypes.STRING(32),
          allowNull: true,
        });
      }
      if (!purchases["unitPrice"]) {
        await queryInterface.addColumn("purchases", "unitPrice", {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: "0",
        });
      }
      if (!purchases["status"]) {
        await queryInterface.addColumn("purchases", "status", {
          type: DataTypes.ENUM("open", "paid", "cancelled"),
          allowNull: false,
          defaultValue: "open",
        });
      }

      const refreshedPurchases = await queryInterface.describeTable("purchases");
      if (refreshedPurchases["supplierId"] && refreshedPurchases["supplierPartyId"]) {
        await sequelize.query("UPDATE `purchases` SET `supplierPartyId` = `supplierId` WHERE `supplierPartyId` IS NULL");
      }
      if (refreshedPurchases["paymentStatus"] && refreshedPurchases["status"]) {
        await sequelize.query(`
          UPDATE \`purchases\`
          SET \`status\` = CASE
            WHEN \`paymentStatus\` = 'paid' THEN 'paid'
            WHEN \`paymentStatus\` = 'voided' THEN 'cancelled'
            ELSE 'open'
          END
        `);
      }
      if (await hasTable(queryInterface, "purchase_items")) {
        if (dialect === "sqlite") {
          await sequelize.query(
            `
            UPDATE \`purchases\`
            SET
              \`itemName\` = COALESCE((SELECT pi.\`itemName\` FROM \`purchase_items\` pi WHERE pi.\`purchaseId\` = \`purchases\`.\`id\` ORDER BY pi.\`id\` LIMIT 1), \`itemName\`),
              \`quantity\` = COALESCE((SELECT pi.\`quantity\` FROM \`purchase_items\` pi WHERE pi.\`purchaseId\` = \`purchases\`.\`id\` ORDER BY pi.\`id\` LIMIT 1), \`quantity\`),
              \`unitOfMeasure\` = COALESCE((SELECT pi.\`unit\` FROM \`purchase_items\` pi WHERE pi.\`purchaseId\` = \`purchases\`.\`id\` ORDER BY pi.\`id\` LIMIT 1), \`unitOfMeasure\`),
              \`unitPrice\` = COALESCE((SELECT pi.\`unitPrice\` FROM \`purchase_items\` pi WHERE pi.\`purchaseId\` = \`purchases\`.\`id\` ORDER BY pi.\`id\` LIMIT 1), \`unitPrice\`)
            WHERE EXISTS (SELECT 1 FROM \`purchase_items\` pi WHERE pi.\`purchaseId\` = \`purchases\`.\`id\`)
              AND (\`itemName\` = :unknownItemLabel OR \`quantity\` = 0 OR \`unitPrice\` = 0)
          `,
            { replacements: { unknownItemLabel: UNKNOWN_ITEM_LABEL } },
          );
        } else {
          await sequelize.query(
            `
            UPDATE \`purchases\` p
            JOIN (
              SELECT pi.*
              FROM \`purchase_items\` pi
              JOIN (
                SELECT \`purchaseId\`, MIN(\`id\`) AS \`firstItemId\`
                FROM \`purchase_items\`
                GROUP BY \`purchaseId\`
              ) first_items ON first_items.\`firstItemId\` = pi.\`id\`
            ) item ON item.\`purchaseId\` = p.\`id\`
            SET
              p.\`itemName\` = item.\`itemName\`,
              p.\`quantity\` = item.\`quantity\`,
              p.\`unitOfMeasure\` = item.\`unit\`,
              p.\`unitPrice\` = item.\`unitPrice\`
            WHERE p.\`itemName\` = :unknownItemLabel OR p.\`quantity\` = 0 OR p.\`unitPrice\` = 0
          `,
            { replacements: { unknownItemLabel: UNKNOWN_ITEM_LABEL } },
          );
        }
      }
    }

    if (await hasTable(queryInterface, "purchase_returns")) {
      const returns = await queryInterface.describeTable("purchase_returns");
      if (!returns["returnedItemName"]) {
        await queryInterface.addColumn("purchase_returns", "returnedItemName", {
          type: DataTypes.STRING(256),
          allowNull: false,
          defaultValue: RETURN_ITEM_LABEL,
        });
      }
      if (!returns["quantity"]) {
        await queryInterface.addColumn("purchase_returns", "quantity", {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: "0",
        });
      }
      if (!returns["amount"]) {
        await queryInterface.addColumn("purchase_returns", "amount", {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: "0",
        });
      }

      const refreshedReturns = await queryInterface.describeTable("purchase_returns");
      if (refreshedReturns["totalAmount"] && refreshedReturns["amount"]) {
        await sequelize.query("UPDATE `purchase_returns` SET `amount` = `totalAmount` WHERE `amount` = 0");
      }
      if (await hasTable(queryInterface, "purchases")) {
        if (dialect === "sqlite") {
          await sequelize.query(
            `
            UPDATE \`purchase_returns\`
            SET \`returnedItemName\` = COALESCE((SELECT p.\`itemName\` FROM \`purchases\` p WHERE p.\`id\` = \`purchase_returns\`.\`purchaseId\` LIMIT 1), \`returnedItemName\`)
            WHERE \`returnedItemName\` = :returnItemLabel
              AND EXISTS (SELECT 1 FROM \`purchases\` p WHERE p.\`id\` = \`purchase_returns\`.\`purchaseId\` AND p.\`itemName\` IS NOT NULL)
          `,
            { replacements: { returnItemLabel: RETURN_ITEM_LABEL } },
          );
        } else {
          await sequelize.query(
            `
            UPDATE \`purchase_returns\` r
            JOIN \`purchases\` p ON p.\`id\` = r.\`purchaseId\`
            SET r.\`returnedItemName\` = p.\`itemName\`
            WHERE r.\`returnedItemName\` = :returnItemLabel AND p.\`itemName\` IS NOT NULL
          `,
            { replacements: { returnItemLabel: RETURN_ITEM_LABEL } },
          );
        }
      }
    }
  },
  async down() {
    // No-op: this migration only adds compatibility columns and copies old values forward.
  },
});
