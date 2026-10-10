import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "018-kafil-delegations",
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("user_delegations")) return;

    await queryInterface.createTable("user_delegations", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      delegatedUserId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      delegatedByUserId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
      },
      delegatedRole: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "kafil" },
      startDate: { type: DataTypes.DATEONLY, allowNull: false },
      endDate: { type: DataTypes.DATEONLY, allowNull: false },
      reason: { type: DataTypes.TEXT, allowNull: true },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    });
    await queryInterface.addIndex("user_delegations", ["delegatedUserId"]);
    await queryInterface.addIndex("user_delegations", ["isActive", "startDate", "endDate"]);
  },
  async down({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("user_delegations")) await queryInterface.dropTable("user_delegations");
  },
});
