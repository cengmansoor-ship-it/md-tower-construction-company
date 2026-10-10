import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "032-trash-restore-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("trash_items");
    if (!table["restoredAt"]) {
      await queryInterface.addColumn("trash_items", "restoredAt", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
    if (!table["restoredByUserId"]) {
      await queryInterface.addColumn("trash_items", "restoredByUserId", {
        type: DataTypes.INTEGER,
        allowNull: true,
      });
    }
    if (!table["restoreReason"]) {
      await queryInterface.addColumn("trash_items", "restoreReason", {
        type: DataTypes.TEXT,
        allowNull: true,
      });
    }
    await queryInterface.addIndex("trash_items", ["restoredAt"], { name: "trash_items_restored_at" }).catch(() => undefined);
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("trash_items");
    await queryInterface.removeIndex("trash_items", "trash_items_restored_at").catch(() => undefined);
    if (table["restoreReason"]) await queryInterface.removeColumn("trash_items", "restoreReason");
    if (table["restoredByUserId"]) await queryInterface.removeColumn("trash_items", "restoredByUserId");
    if (table["restoredAt"]) await queryInterface.removeColumn("trash_items", "restoredAt");
  },
});
