import { DataTypes } from "sequelize";
import { defineMigration } from "./runner";

type DecimalColumn = {
  table: string;
  column: string;
  allowNull: boolean;
  defaultValue?: string | number;
};

const DECIMAL_COLUMNS: DecimalColumn[] = [
  { table: "attendances", column: "payableAmount", allowNull: false, defaultValue: "0" },
  { table: "daily_cash_entries", column: "amount", allowNull: false },
  { table: "employees", column: "wageAmount", allowNull: false },
  { table: "employee_payments", column: "amount", allowNull: false },
  { table: "employee_payments", column: "previousBalance", allowNull: true },
  { table: "employee_payments", column: "newBalance", allowNull: true },
  { table: "exchange_transactions", column: "amountGiven", allowNull: false },
  { table: "exchange_transactions", column: "amountReceived", allowNull: false },
  { table: "exchange_transactions", column: "rate", allowNull: false },
  { table: "exchange_transactions", column: "fee", allowNull: false, defaultValue: "0" },
  { table: "expenses", column: "amount", allowNull: false },
  { table: "journal_lines", column: "amount", allowNull: false },
  { table: "partners", column: "initialInvestment", allowNull: false },
  { table: "partners", column: "ownershipPercent", allowNull: true },
  { table: "partner_transactions", column: "amount", allowNull: false },
  { table: "partner_transactions", column: "previousBalance", allowNull: true },
  { table: "partner_transactions", column: "newBalance", allowNull: true },
  { table: "purchase_payments", column: "amount", allowNull: false },
  { table: "purchase_payments", column: "previousBalance", allowNull: true },
  { table: "purchase_payments", column: "newBalance", allowNull: true },
  { table: "purchase_returns", column: "quantity", allowNull: false },
  { table: "purchase_returns", column: "amount", allowNull: false },
  { table: "purchases", column: "quantity", allowNull: false },
  { table: "purchases", column: "unitPrice", allowNull: false },
  { table: "purchases", column: "totalAmount", allowNull: false },
  { table: "rental_receipts", column: "amount", allowNull: false },
  { table: "rental_receipts", column: "previousBalance", allowNull: true },
  { table: "rental_receipts", column: "newBalance", allowNull: true },
  { table: "rentals", column: "rentAmount", allowNull: false },
  { table: "rentals", column: "depositAmount", allowNull: false, defaultValue: "0" },
  { table: "sale_credits", column: "amount", allowNull: false },
  { table: "sale_receipts", column: "amount", allowNull: false },
  { table: "sale_receipts", column: "previousBalance", allowNull: true },
  { table: "sale_receipts", column: "newBalance", allowNull: true },
  { table: "sales", column: "price", allowNull: false },
  { table: "sales", column: "discount", allowNull: false, defaultValue: "0" },
  { table: "sales", column: "finalPrice", allowNull: false },
  { table: "units", column: "areaSqm", allowNull: true },
];

defineMigration({
  name: "006-exact-decimal-precision",
  async up({ queryInterface, sequelize }) {
    if (sequelize.getDialect() === "sqlite") {
      return;
    }
    for (const def of DECIMAL_COLUMNS) {
      const table = await queryInterface.describeTable(def.table);
      if (!table[def.column]) continue;
      await queryInterface.changeColumn(def.table, def.column, {
        type: DataTypes.DECIMAL(36, 18),
        allowNull: def.allowNull,
        ...(def.defaultValue !== undefined ? { defaultValue: def.defaultValue } : {}),
      });
    }
  },
  async down() {
    // Intentionally left as a no-op: reducing precision could destroy stored business values.
  },
});
