import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "037-company-slogan",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    if (!table.slogan) {
      await queryInterface.addColumn("company_settings", "slogan", {
        type: DataTypes.STRING(256),
        allowNull: true,
      } as never);
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    if (table.slogan) {
      await queryInterface.removeColumn("company_settings", "slogan");
    }
  },
});
