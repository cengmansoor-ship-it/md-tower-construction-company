import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

/**
 * Adds account-lockout tracking columns to the users table.
 * Additive only — never drops or renames existing columns/data.
 */
defineMigration({
  name: "001-user-lockout-fields",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("users");
    if (!table["failedLoginAttempts"]) {
      await queryInterface.addColumn("users", "failedLoginAttempts", {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      });
    }
    if (!table["lockedUntil"]) {
      await queryInterface.addColumn("users", "lockedUntil", {
        type: DataTypes.DATE,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("users");
    if (table["failedLoginAttempts"]) {
      await queryInterface.removeColumn("users", "failedLoginAttempts");
    }
    if (table["lockedUntil"]) {
      await queryInterface.removeColumn("users", "lockedUntil");
    }
  },
});
