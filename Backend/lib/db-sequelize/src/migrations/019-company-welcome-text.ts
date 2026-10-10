import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

const columns: Record<string, { type: unknown; allowNull: boolean; defaultValue: string }> = {
  welcomeTitlePashto: {
    type: DataTypes.STRING(160),
    allowNull: false,
    defaultValue: "ښه راغلاست",
  },
  welcomeSubtitlePashto: {
    type: DataTypes.STRING(220),
    allowNull: false,
    defaultValue: "د مدیریت سیستم",
  },
  welcomeDescriptionPashto: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "د پروژو، فروشاتو، کرایې، تدارکاتو، کارکوونکو او مالي حسابونو مرکزي مدیریت.",
  },
  welcomeTitleEnglish: {
    type: DataTypes.STRING(160),
    allowNull: false,
    defaultValue: "Welcome",
  },
  welcomeSubtitleEnglish: {
    type: DataTypes.STRING(220),
    allowNull: false,
    defaultValue: "To Our Company",
  },
  welcomeDescriptionEnglish: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: "Central management for projects, sales, rentals, procurement, employees, and accounts.",
  },
};

defineMigration({
  name: "019-company-welcome-text",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    for (const [name, def] of Object.entries(columns)) {
      if (!table[name]) {
        await queryInterface.addColumn("company_settings", name, def as never);
      }
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("company_settings");
    for (const name of Object.keys(columns)) {
      if (table[name]) {
        await queryInterface.removeColumn("company_settings", name);
      }
    }
  },
});
