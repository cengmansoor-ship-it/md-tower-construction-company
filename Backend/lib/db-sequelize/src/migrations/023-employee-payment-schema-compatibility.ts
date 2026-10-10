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
  name: "023-employee-payment-schema-compatibility",
  async up({ queryInterface, sequelize }) {
    if (!(await hasTable(queryInterface, "employee_payments"))) return;
    const dialect = sequelize.getDialect();

    const table = await queryInterface.describeTable("employee_payments");
    if (!table["paymentNumber"]) {
      await queryInterface.addColumn("employee_payments", "paymentNumber", {
        type: DataTypes.STRING(32),
        allowNull: true,
      });
    }
    if (!table["type"]) {
      await queryInterface.addColumn("employee_payments", "type", {
        type: DataTypes.ENUM("salary", "advance"),
        allowNull: false,
        defaultValue: "salary",
      });
    }
    if (!table["previousBalance"]) {
      await queryInterface.addColumn("employee_payments", "previousBalance", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
    if (!table["newBalance"]) {
      await queryInterface.addColumn("employee_payments", "newBalance", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
    if (!table["method"]) {
      await queryInterface.addColumn("employee_payments", "method", {
        type: DataTypes.STRING(32),
        allowNull: false,
        defaultValue: "cash",
      });
    }
    if (!table["cashAccountId"]) {
      await queryInterface.addColumn("employee_payments", "cashAccountId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["note"]) {
      await queryInterface.addColumn("employee_payments", "note", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
    if (!table["paidByUserId"]) {
      await queryInterface.addColumn("employee_payments", "paidByUserId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }

    const refreshed = await queryInterface.describeTable("employee_payments");
    if (refreshed["paymentNumber"]) {
      await sequelize.query(
        dialect === "sqlite"
          ? "UPDATE `employee_payments` SET `paymentNumber` = 'EP-' || printf('%06d', `id`) WHERE `paymentNumber` IS NULL OR `paymentNumber` = ''"
          : "UPDATE `employee_payments` SET `paymentNumber` = CONCAT('EP-', LPAD(`id`, 6, '0')) WHERE `paymentNumber` IS NULL OR `paymentNumber` = ''",
      );
    }
    if (refreshed["payType"] && refreshed["type"]) {
      await sequelize.query("UPDATE `employee_payments` SET `type` = CASE WHEN `payType` = 'advance' THEN 'advance' ELSE 'salary' END");
    }
    if (refreshed["description"] && refreshed["note"]) {
      await sequelize.query("UPDATE `employee_payments` SET `note` = `description` WHERE `note` IS NULL");
    }
    if (refreshed["createdByUserId"] && refreshed["paidByUserId"]) {
      await sequelize.query("UPDATE `employee_payments` SET `paidByUserId` = `createdByUserId` WHERE `paidByUserId` IS NULL");
    }
  },
  async down() {
    // No-op: compatibility columns must remain to keep old MySQL data readable.
  },
});
