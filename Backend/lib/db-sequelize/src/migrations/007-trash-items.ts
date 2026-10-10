import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "007-trash-items",
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((table) => (typeof table === "string" ? table : String(table)));
    if (normalized.includes("trash_items")) return;
    await queryInterface.createTable("trash_items", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      entityType: { type: DataTypes.STRING(64), allowNull: false },
      entityId: { type: DataTypes.STRING(64), allowNull: false },
      displayName: { type: DataTypes.STRING(256), allowNull: false },
      sourcePath: { type: DataTypes.STRING(256), allowNull: true },
      snapshot: { type: DataTypes.TEXT("long"), allowNull: true },
      deleteReason: { type: DataTypes.TEXT, allowNull: false },
      deletedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      deletedAt: { type: DataTypes.DATE, allowNull: false },
      purgeAfter: { type: DataTypes.DATE, allowNull: false },
      purgedAt: { type: DataTypes.DATE, allowNull: true },
      purgedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      purgeReason: { type: DataTypes.TEXT, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("trash_items", ["entityType", "entityId"]);
    await queryInterface.addIndex("trash_items", ["purgedAt", "purgeAfter"]);
  },
  async down({ queryInterface }) {
    await queryInterface.dropTable("trash_items");
  },
});
