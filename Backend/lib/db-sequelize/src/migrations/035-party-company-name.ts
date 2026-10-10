import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "035-party-company-name",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("parties");
    if (!table["companyName"]) {
      await queryInterface.addColumn("parties", "companyName", {
        type: DataTypes.STRING(256),
        allowNull: true,
      });
    }
  },
  async down() {
    // No-op: keep the column to preserve data.
  },
});
