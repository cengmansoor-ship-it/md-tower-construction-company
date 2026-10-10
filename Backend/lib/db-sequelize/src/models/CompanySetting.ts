import { DataTypes, Model, type CreationOptional, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../connection";

export class CompanySetting extends Model<InferAttributes<CompanySetting>, InferCreationAttributes<CompanySetting>> {
  declare id: CreationOptional<number>;
  declare companyName: string;
  declare baseCurrencyCode: CreationOptional<string>;
  declare fiscalYearStartMonth: CreationOptional<number>;
  declare locale: CreationOptional<string>;
  declare logoUrl: CreationOptional<string | null>;
  declare address: CreationOptional<string | null>;
  declare phone: CreationOptional<string | null>;
  declare whatsapp: CreationOptional<string | null>;
  declare email: CreationOptional<string | null>;
  declare website: CreationOptional<string | null>;
  declare slogan: CreationOptional<string | null>;
  declare expenseCategoryConfig: CreationOptional<string | null>;
  declare welcomeTitlePashto: CreationOptional<string>;
  declare welcomeSubtitlePashto: CreationOptional<string>;
  declare welcomeDescriptionPashto: CreationOptional<string>;
  declare welcomeTitleEnglish: CreationOptional<string>;
  declare welcomeSubtitleEnglish: CreationOptional<string>;
  declare welcomeDescriptionEnglish: CreationOptional<string>;
}

CompanySetting.init(
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    companyName: { type: DataTypes.STRING(128), allowNull: false, defaultValue: "د سیستم اداره" },
    baseCurrencyCode: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "AFN" },
    fiscalYearStartMonth: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    locale: { type: DataTypes.STRING(8), allowNull: false, defaultValue: "ps" },
    logoUrl: { type: DataTypes.TEXT("long"), allowNull: true },
    address: { type: DataTypes.STRING(512), allowNull: true },
    phone: { type: DataTypes.STRING(64), allowNull: true },
    whatsapp: { type: DataTypes.STRING(64), allowNull: true },
    email: { type: DataTypes.STRING(128), allowNull: true },
    website: { type: DataTypes.STRING(256), allowNull: true },
    slogan: { type: DataTypes.STRING(256), allowNull: true },
    expenseCategoryConfig: { type: DataTypes.TEXT, allowNull: true },
    welcomeTitlePashto: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "ښه راغلاست" },
    welcomeSubtitlePashto: { type: DataTypes.STRING(220), allowNull: false, defaultValue: "د مدیریت سیستم" },
    welcomeDescriptionPashto: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "د پروژو، فروشاتو، کرایې، تدارکاتو، کارکوونکو او مالي حسابونو مرکزي مدیریت.",
    },
    welcomeTitleEnglish: { type: DataTypes.STRING(160), allowNull: false, defaultValue: "Welcome" },
    welcomeSubtitleEnglish: { type: DataTypes.STRING(220), allowNull: false, defaultValue: "To Our Company" },
    welcomeDescriptionEnglish: {
      type: DataTypes.TEXT,
      allowNull: false,
      defaultValue: "Central management for projects, sales, rentals, procurement, employees, and accounts.",
    },
  },
  { sequelize, modelName: "CompanySetting", tableName: "company_settings", timestamps: false },
);
