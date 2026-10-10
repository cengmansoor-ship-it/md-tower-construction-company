import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

/**
 * Adds branding/contact fields to company_settings (logo, address, phone, whatsapp, email,
 * website) so print views can show the required company header. Additive only.
 */
defineMigration({
  name: "004-company-settings-contact-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    const columns: Record<string, { type: unknown; allowNull: boolean }> = {
      logoUrl: { type: DataTypes.STRING(512), allowNull: true },
      address: { type: DataTypes.STRING(512), allowNull: true },
      phone: { type: DataTypes.STRING(64), allowNull: true },
      whatsapp: { type: DataTypes.STRING(64), allowNull: true },
      email: { type: DataTypes.STRING(128), allowNull: true },
      website: { type: DataTypes.STRING(256), allowNull: true },
    };
    for (const [name, def] of Object.entries(columns)) {
      if (!table[name]) {
        await queryInterface.addColumn("company_settings", name, def as never);
      }
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    for (const name of ["logoUrl", "address", "phone", "whatsapp", "email", "website"]) {
      if (table[name]) {
        await queryInterface.removeColumn("company_settings", name);
      }
    }
  },
});
