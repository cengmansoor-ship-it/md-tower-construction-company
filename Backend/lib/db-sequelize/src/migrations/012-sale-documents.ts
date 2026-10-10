import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "012-sale-documents",
  async up({ queryInterface }) {
    const tables = await queryInterface.showAllTables();
    const normalized = tables.map((table) => (typeof table === "string" ? table : String(table)));
    if (normalized.includes("sale_documents")) return;
    await queryInterface.createTable("sale_documents", {
      id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
      saleId: { type: DataTypes.INTEGER, allowNull: false },
      fileName: { type: DataTypes.STRING(256), allowNull: false },
      fileUrl: { type: DataTypes.STRING(512), allowNull: false },
      mimeType: { type: DataTypes.STRING(64), allowNull: false },
      sizeBytes: { type: DataTypes.INTEGER, allowNull: false },
      uploadedByUserId: { type: DataTypes.INTEGER, allowNull: true },
      createdAt: { type: DataTypes.DATE, allowNull: false },
      updatedAt: { type: DataTypes.DATE, allowNull: false },
    });
    await queryInterface.addIndex("sale_documents", ["saleId"]);
  },
  async down({ queryInterface }) {
    await queryInterface.dropTable("sale_documents");
  },
});
