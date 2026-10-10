import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "011-project-soft-delete-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("projects");
    if (!table["deletedAt"]) {
      await queryInterface.addColumn("projects", "deletedAt", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!table["deletedByUserId"]) {
      await queryInterface.addColumn("projects", "deletedByUserId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["deleteReason"]) {
      await queryInterface.addColumn("projects", "deleteReason", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("projects");
    if (table["deleteReason"]) await queryInterface.removeColumn("projects", "deleteReason");
    if (table["deletedByUserId"]) await queryInterface.removeColumn("projects", "deletedByUserId");
    if (table["deletedAt"]) await queryInterface.removeColumn("projects", "deletedAt");
  },
});
