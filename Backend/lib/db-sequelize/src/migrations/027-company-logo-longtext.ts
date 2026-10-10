import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "027-company-logo-longtext",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    if (table.logoUrl) {
      await queryInterface.changeColumn("company_settings", "logoUrl", {
        type: DataTypes.TEXT("long"),
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    if (table.logoUrl) {
      await queryInterface.changeColumn("company_settings", "logoUrl", {
        type: DataTypes.STRING(512),
        allowNull: true,
      });
    }
  },
});
