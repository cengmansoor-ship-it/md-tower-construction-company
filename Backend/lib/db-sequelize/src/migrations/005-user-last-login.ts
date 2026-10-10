import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "005-user-last-login",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("users");
    if (!table["lastLoginAt"]) {
      await queryInterface.addColumn("users", "lastLoginAt", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("users");
    if (table["lastLoginAt"]) {
      await queryInterface.removeColumn("users", "lastLoginAt");
    }
  },
});
