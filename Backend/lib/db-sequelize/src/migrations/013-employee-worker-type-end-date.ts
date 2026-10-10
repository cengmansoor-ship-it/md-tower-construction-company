import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

defineMigration({
  name: "013-employee-worker-type-end-date",
  async up({ queryInterface }) {
    const table = await queryInterface.describeTable("employees");
    if (!table["workerType"]) {
      await queryInterface.addColumn("employees", "workerType", {
        type: DataTypes.ENUM("regular", "misc"),
        allowNull: false,
        defaultValue: "regular",
      });
    }
    if (!table["endDate"]) {
      await queryInterface.addColumn("employees", "endDate", {
        type: DataTypes.DATEONLY,
        allowNull: true,
      });
    }
  },
  async down({ queryInterface }) {
    const table = await queryInterface.describeTable("employees");
    if (table["endDate"]) await queryInterface.removeColumn("employees", "endDate");
    if (table["workerType"]) await queryInterface.removeColumn("employees", "workerType");
  },
});
