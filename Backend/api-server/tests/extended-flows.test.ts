import { describe, it, expect } from "vitest";
import { createTestUnit, newAgent, loginAs, postWithCsrf } from "./helpers";
import {
  Sale,
  SaleReceipt,
  Rental,
  RentalReceipt,
  Expense,
  Purchase,
  PurchasePayment,
  Employee,
  Attendance,
  EmployeePayment,
  Decimal,
  Party,
  daysInJalaliMonth,
  gregorianToJalali,
  sequelize,
} from "@workspace/db-sequelize";

async function adminAgent() {
  const agent = newAgent();
  await loginAs(agent, "admin", "admin123");
  return agent;
}

async function createParty(agent: Awaited<ReturnType<typeof adminAgent>>, name: string, type: string) {
  const res = await postWithCsrf(agent, "/api/parties", { name, type });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Party creation", () => {
  it("creates a customer party", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, `Customer ${Date.now()}`, "individual_customer");
    const party = await Party.findByPk(partyId);
    expect(party).not.toBeNull();
    expect(party!.type).toBe("individual_customer");
  });
});

describe("Sales with receipts", () => {
  it("creates a sale, adds a receipt, and updates balance", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_sale");
    const partyId = await createParty(agent, `Sale Customer ${Date.now()}`, "individual_customer");

    const saleRes = await postWithCsrf(agent, "/api/sales", {
      unitId: unit.id,
      partyId,
      price: 200000,
      currencyCode: "AFN",
      saleDate: "2026-07-13",
    });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.id;
    expect(saleId).toBeGreaterThan(0);

    const receiptRes = await postWithCsrf(agent, `/api/sales/${saleId}/receipts`, {
      amount: 50000,
      currencyCode: "AFN",
      receiptDate: "2026-07-13",
    });
    expect(receiptRes.status).toBe(201);

    const detail = await agent.get(`/api/sales/${saleId}`);
    expect(detail.status).toBe(200);
    const receipts = detail.body.receipts ?? [];
    const totalReceived = receipts.reduce(
      (sum: number, r: { amount: string; voidedAt: string | null }) => (r.voidedAt ? sum : sum + Number(r.amount)),
      0,
    );
    expect(totalReceived).toBe(50000);
  });
});

describe("Rentals", () => {
  it("creates a rental contract", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_rent");
    const partyId = await createParty(agent, `Tenant ${Date.now()}`, "tenant");

    const rentalRes = await postWithCsrf(agent, "/api/rentals", {
      unitId: unit.id,
      tenantPartyId: partyId,
      rentAmount: 8000,
      frequency: "monthly",
      currencyCode: "AFN",
      startDate: "2026-07-13",
    });
    expect(rentalRes.status).toBe(201);
    const rentalId = rentalRes.body.id;
    expect(rentalId).toBeGreaterThan(0);

    // Add a receipt
    const receiptRes = await postWithCsrf(agent, `/api/rentals/${rentalId}/receipts`, {
      amount: 8000,
      currencyCode: "AFN",
      receiptDate: "2026-07-13",
    });
    expect(receiptRes.status).toBe(201);
  });

  it("prevents double rental on the same unit", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_rent");
    const party1 = await createParty(agent, `Tenant A ${Date.now()}`, "tenant");
    const party2 = await createParty(agent, `Tenant B ${Date.now()}`, "tenant");

    const r1 = await postWithCsrf(agent, "/api/rentals", {
      unitId: unit.id,
      tenantPartyId: party1,
      rentAmount: 5000,
      frequency: "monthly",
      currencyCode: "AFN",
      startDate: "2026-07-01",
    });
    expect(r1.status).toBe(201);

    const r2 = await postWithCsrf(agent, "/api/rentals", {
      unitId: unit.id,
      tenantPartyId: party2,
      rentAmount: 5000,
      frequency: "monthly",
      currencyCode: "AFN",
      startDate: "2026-07-01",
    });
    expect(r2.status).toBe(400);
  });
});

describe("Expenses", () => {
  it("creates an expense", async () => {
    const agent = await adminAgent();
    const res = await postWithCsrf(agent, "/api/expenses", {
      description: `Office supplies ${Date.now()}`,
      amount: 1500,
      currencyCode: "AFN",
      expenseDate: "2026-07-13",
      category: "office",
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeGreaterThan(0);
  });
});

describe("Purchases", () => {
  it("creates a purchase with supplier payment", async () => {
    const agent = await adminAgent();
    const supplierId = await createParty(agent, `Supplier ${Date.now()}`, "supplier");

    const purchaseRes = await postWithCsrf(agent, "/api/purchases", {
      purchaseNumber: `P-${Date.now()}`,
      supplierPartyId: supplierId,
      itemName: "Cement bags",
      quantity: 100,
      unitOfMeasure: "bag",
      unitPrice: 350,
      totalAmount: 35000,
      currencyCode: "AFN",
      purchaseDate: "2026-07-13",
    });
    expect(purchaseRes.status).toBe(201);
    const purchaseId = purchaseRes.body.id;

    const paymentRes = await postWithCsrf(agent, `/api/purchases/${purchaseId}/payments`, {
      amount: 35000,
      currencyCode: "AFN",
      paymentDate: "2026-07-13",
    });
    expect(paymentRes.status).toBe(201);
  });
});

describe("Employees", () => {
  it("creates an employee and takes attendance", async () => {
    const agent = await adminAgent();
    const baseName = `Worker ${Date.now()}`;

    const empRes = await postWithCsrf(agent, "/api/employees", {
      name: baseName,
      position: "Laborer",
      wageType: "daily",
      wageAmount: 500,
      currencyCode: "AFN",
      startDate: "2026-07-01",
    });
    expect(empRes.status).toBe(201);
    const employeeId = empRes.body.id;

    // Take attendance via the employee-specific attendance endpoint
    const attRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: "2026-07-13",
      status: "present",
      currencyCode: "AFN",
    });
    expect(attRes.status).toBe(201);

    // Re-saving the same date should update the existing attendance instead of failing.
    const dupAttRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: "2026-07-13",
      status: "absent",
      currencyCode: "AFN",
    });
    expect(dupAttRes.status).toBe(201);
    expect(dupAttRes.body.status).toBe("absent");
    expect(dupAttRes.body.payableAmount).toBe("0");
  });

  it("calculates monthly employee attendance pay from the Shamsi month days", async () => {
    const agent = await adminAgent();
    const attendanceDate = "2026-10-01";
    const jalali = gregorianToJalali(2026, 10, 1);
    const monthDays = daysInJalaliMonth(jalali.jy, jalali.jm);
    const expectedPayable = new Decimal(20000).dividedBy(monthDays).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed();
    const expectedHalfPayable = new Decimal(20000).dividedBy(monthDays).dividedBy(2).toDecimalPlaces(6, Decimal.ROUND_HALF_UP).toFixed();

    const empRes = await postWithCsrf(agent, "/api/employees", {
      name: `Monthly Worker ${Date.now()}`,
      position: "Guard",
      wageType: "monthly",
      wageAmount: 20000,
      currencyCode: "AFN",
      startDate: attendanceDate,
    });
    expect(empRes.status).toBe(201);
    const employeeId = empRes.body.id;

    const presentRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: attendanceDate,
      status: "present",
    });
    expect(presentRes.status).toBe(201);
    expect(presentRes.body.payableAmount).toBe(expectedPayable);

    const absentRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: "2026-10-02",
      status: "absent",
    });
    expect(absentRes.status).toBe(201);
    expect(absentRes.body.payableAmount).toBe("0");

    const leaveRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: "2026-10-03",
      status: "leave",
    });
    expect(leaveRes.status).toBe(201);
    expect(leaveRes.body.payableAmount).toBe(expectedPayable);

    const halfDayRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: "2026-10-04",
      status: "half_day",
    });
    expect(halfDayRes.status).toBe(201);
    expect(halfDayRes.body.payableAmount).toBe(expectedHalfPayable);

    const detail = await agent.get(`/api/employees/${employeeId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.balance).toBe(new Decimal(expectedPayable).times(2).plus(expectedHalfPayable).toFixed());
  });

  it("maps employee balances to company debt and receivable in the general report", async () => {
    const agent = await adminAgent();
    const date = "2026-12-20";
    const empRes = await postWithCsrf(agent, "/api/employees", {
      name: `Report Balance Worker ${Date.now()}`,
      position: "Guard",
      wageType: "daily",
      wageAmount: 100,
      currencyCode: "USD",
      startDate: date,
    });
    expect(empRes.status).toBe(201);
    const employeeId = empRes.body.id;

    const attendanceRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date,
      status: "present",
    });
    expect(attendanceRes.status).toBe(201);

    const firstReport = await agent.get(`/api/reports/general?currencyCode=USD&startDate=${date}&endDate=${date}`);
    expect(firstReport.status).toBe(200);
    const firstSummary = firstReport.body.sectionSummaries.employees.byCurrency.USD;
    expect(firstSummary.owedByCompany).toBe("100");
    expect(firstSummary.owedToCompany).toBe("0");

    const paymentRes = await postWithCsrf(agent, `/api/employees/${employeeId}/payments`, {
      amount: 150,
      type: "salary",
      currencyCode: "USD",
      paymentDate: date,
    });
    expect(paymentRes.status).toBe(201);

    const settledReport = await agent.get(`/api/reports/general?currencyCode=USD&startDate=${date}&endDate=${date}`);
    expect(settledReport.status).toBe(200);
    const settledSummary = settledReport.body.sectionSummaries.employees.byCurrency.USD;
    expect(settledSummary.owedByCompany).toBe("0");
    expect(settledSummary.owedToCompany).toBe("50");
  });
});

describe("Currency separation", () => {
  it("keeps AFN and USD totals separate", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_sale");
    const partyId = await createParty(agent, `Currency Test ${Date.now()}`, "individual_customer");

    const saleAfn = await postWithCsrf(agent, "/api/sales", {
      unitId: unit.id,
      partyId,
      price: 100000,
      currencyCode: "AFN",
      saleDate: "2026-07-13",
    });
    expect(saleAfn.status).toBe(201);

    // Check dashboard report has separate currencies
    const dash = await agent.get("/api/reports/dashboard");
    expect(dash.status).toBe(200);
    expect(dash.body.salesTotalsByCurrency).toHaveProperty("AFN");
  });
});

describe("Unauthorized access", () => {
  it("rejects API access without authentication", async () => {
    const agent = newAgent();
    const res = await agent.get("/api/parties");
    expect(res.status).toBe(401);
  });

  it("rejects unauthorized POST without authentication", async () => {
    const agent = newAgent();
    const res = await agent.post("/api/parties").send({ name: "test", type: "individual_customer" });
    // CSRF check returns 403 before auth check, either is acceptable
    expect([401, 403]).toContain(res.status);
  });
});

describe("Safe API error messages", () => {
  it("does not leak stack traces in error responses", async () => {
    const agent = newAgent();
    await loginAs(agent, "admin", "admin123");
    // Try a non-existent entity
    const res = await agent.get("/api/parties/99999999");
    expect([400, 404]).toContain(res.status);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/at\s+.*\(.*:\d+:\d+\)/);
    expect(body).not.toMatch(/Error\s*:/);
  });
});

describe("Database integrity", () => {
  it("verifies journal transactions balance per currency", async () => {
    const { JournalLine } = await import("@workspace/db-sequelize");
    const lines = await JournalLine.findAll();
    const grouped = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const key = `${line.transactionId}-${line.currencyCode}`;
      const entry = grouped.get(key) ?? { debit: 0, credit: 0 };
      const amt = Number(line.amount);
      if (line.direction === "debit") entry.debit += amt;
      else entry.credit += amt;
      grouped.set(key, entry);
    }
    for (const { debit, credit } of grouped.values()) {
      expect(Math.abs(debit - credit)).toBeLessThan(0.01);
    }
  });

  it("verifies SQLite integrity", async () => {
    const [[result]] = (await sequelize.query("PRAGMA integrity_check")) as unknown as [Array<{ integrity_check: string }>];
    expect(result.integrity_check).toBe("ok");
  });
});
