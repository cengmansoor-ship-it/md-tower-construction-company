import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "016-employee-soft-delete-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("employees");
    if (!table["deletedAt"]) {
      await queryInterface.addColumn("employees", "deletedAt", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!table["deletedByUserId"]) {
      await queryInterface.addColumn("employees", "deletedByUserId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["deleteReason"]) {
      await queryInterface.addColumn("employees", "deleteReason", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("employees");
    if (table["deleteReason"]) await queryInterface.removeColumn("employees", "deleteReason");
    if (table["deletedByUserId"]) await queryInterface.removeColumn("employees", "deletedByUserId");
    if (table["deletedAt"]) await queryInterface.removeColumn("employees", "deletedAt");
  },
});
