import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

async function hasTable(queryInterface: { showAllTables: () => Promise<unknown[]> }, tableName: string): Promise<boolean> {
  const tables = await queryInterface.showAllTables();
  return tables.some((table) => {
    const name =
      typeof table === "string" ? table : (table as { tableName?: string; table_name?: string }).tableName ?? (table as { table_name?: string }).table_name;
    return String(name).toLowerCase() === tableName.toLowerCase();
  });
}

defineMigration({
  name: "025-partner-schema-compatibility",
  async up({ queryInterface, sequelize }) {
    if (!(await hasTable(queryInterface, "partners"))) return;
    const dialect = sequelize.getDialect();

    const table = await queryInterface.describeTable("partners");
    if (!table["partnerNumber"]) {
      await queryInterface.addColumn("partners", "partnerNumber", {
        type: DataTypes.STRING(32),
        allowNull: true,
      });
    }
    if (!table["initialInvestment"]) {
      await queryInterface.addColumn("partners", "initialInvestment", {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: true,
      });
    }
    if (!table["joinDate"]) {
      await queryInterface.addColumn("partners", "joinDate", {
        type: DataTypes.DATEONLY,
        allowNull: true,
      });
    }
    if (!table["status"]) {
      await queryInterface.addColumn("partners", "status", {
        type: DataTypes.ENUM("active", "inactive"),
        allowNull: false,
        defaultValue: "active",
      });
    }
    if (!table["createdByUserId"]) {
      await queryInterface.addColumn("partners", "createdByUserId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }

    const refreshed = await queryInterface.describeTable("partners");
    if (refreshed["partnerNumber"]) {
      await sequelize.query(
        dialect === "sqlite"
          ? "UPDATE `partners` SET `partnerNumber` = 'PAR-' || printf('%06d', `id`) WHERE `partnerNumber` IS NULL OR `partnerNumber` = ''"
          : "UPDATE `partners` SET `partnerNumber` = CONCAT('PAR-', LPAD(`id`, 6, '0')) WHERE `partnerNumber` IS NULL OR `partnerNumber` = ''",
      );
    }
    if (refreshed["statedValue"] && refreshed["initialInvestment"]) {
      await sequelize.query("UPDATE `partners` SET `initialInvestment` = `statedValue` WHERE `initialInvestment` IS NULL");
    }
    if (refreshed["effectiveDate"] && refreshed["joinDate"]) {
      await sequelize.query("UPDATE `partners` SET `joinDate` = `effectiveDate` WHERE `joinDate` IS NULL");
    }
    if (refreshed["isActive"] && refreshed["status"]) {
      await sequelize.query("UPDATE `partners` SET `status` = CASE WHEN `isActive` = 1 THEN 'active' ELSE 'inactive' END");
    }
  },
  async down() {
    // No-op: compatibility columns must remain for existing MySQL databases.
  },
});
