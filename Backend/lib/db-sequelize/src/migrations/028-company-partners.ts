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
  name: "028-company-partners",
  async up({ queryInterface }) {
    if (await hasTable(queryInterface, "company_partners")) return;
    await queryInterface.createTable("company_partners", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      partnerNumber: { type: DataTypes.STRING(32), allowNull: false, unique: true },
      name: { type: DataTypes.STRING(160), allowNull: false },
      initialInvestment: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
      currencyCode: { type: DataTypes.STRING(8), allowNull: false },
      ownershipPercent: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
      joinDate: { type: DataTypes.DATEONLY, allowNull: false },
      status: { type: DataTypes.ENUM("active", "inactive"), allowNull: false, defaultValue: "active" },
      notes: { type: DataTypes.TEXT, allowNull: true },
      createdByUserId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
  },
  async down({ queryInterface }) {
    if (await hasTable(queryInterface, "company_partners")) {
      await queryInterface.dropTable("company_partners");
    }
  },
});
