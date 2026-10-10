import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "031-party-soft-delete-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("parties");
    if (!table["deletedAt"]) {
      await queryInterface.addColumn("parties", "deletedAt", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!table["deletedByUserId"]) {
      await queryInterface.addColumn("parties", "deletedByUserId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["deleteReason"]) {
      await queryInterface.addColumn("parties", "deleteReason", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("parties");
    if (table["deleteReason"]) await queryInterface.removeColumn("parties", "deleteReason");
    if (table["deletedByUserId"]) await queryInterface.removeColumn("parties", "deletedByUserId");
    if (table["deletedAt"]) await queryInterface.removeColumn("parties", "deletedAt");
  },
});
