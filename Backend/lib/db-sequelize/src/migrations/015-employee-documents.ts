import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "015-employee-documents",
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("employee_documents")) return;

    await queryInterface.createTable("employee_documents", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      employeeId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "employees", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
      },
      fileName: { type: DataTypes.STRING(256), allowNull: false },
      fileUrl: { type: DataTypes.STRING(512), allowNull: false },
      mimeType: { type: DataTypes.STRING(64), allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
      uploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("employee_documents", ["employeeId"]);
  },
  async down({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    if (tables.map(String).includes("employee_documents")) await queryInterface.dropTable("employee_documents");
  },
});
