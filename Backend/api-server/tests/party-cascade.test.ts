import { describe, it, expect } from "vitest";
import { createTestUnit, newAgent, loginAs, postWithCsrf } from "./helpers";
import {
  DailyCashEntry,
  ExchangeTransaction,
  JournalTransaction,
  Party,
  PartyRole,
  PostingLink,
  Purchase,
  PurchasePayment,
  Rental,
  RentalReceipt,
  Sale,
  SaleReceipt,
  TrashItem,
  Unit,
} from "@workspace/db-sequelize";

async function adminAgent() {
  const agent = newAgent();
  await loginAs(agent, "admin", "admin123");
  return agent;
}

type Agent = Awaited<ReturnType<typeof adminAgent>>;

async function createParty(agent: Agent, type: string, name: string): Promise<number> {
  const res = await postWithCsrf(agent, "/api/parties", { name, type });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

async function deleteParty(agent: Agent, partyId: number, reason: string) {
  return postWithCsrf(agent, `/api/parties/${partyId}/delete`, { reason });
}

async function dashboard(agent: Agent) {
  const res = await agent.get("/api/reports/dashboard");
  expect(res.status).toBe(200);
  return res.body as {
    totalCustomers: number;
    activeRentals: number;
    salesTotalsByCurrency: Record<string, string>;
    companyReceivablesByCurrency: Record<string, string>;
    companyPayablesByCurrency: Record<string, string>;
    alerts: string[];
    recentTransactions: Array<{ id: number }>;
    drilldowns: { customers: Array<{ id: number }> };
  };
}

/** Same "today" definition the backend uses for the dashboard (APP_TIMEZONE, default Asia/Kabul). */
function kabulTodayIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: process.env["APP_TIMEZONE"] || "Asia/Kabul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

async function employeeDashboard(agent: Agent) {
  const res = await agent.get("/api/reports/dashboard");
  expect(res.status).toBe(200);
  return res.body as {
    todayOutgoingByCurrency: Record<string, string>;
    recentTransactions: Array<{ id: number }>;
    attendanceToday: { presentEmployees: Array<{ id: number }>; totalEmployees: number };
  };
}

function sumMap(map: Record<string, string> | undefined): number {
  return Object.values(map ?? {}).reduce((sum, value) => sum + Number(value || 0), 0);
}

/** The dashboard response must never contain mojibake (Windows-1252 artifacts). */
function expectNoMojibake(body: unknown): void {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/[À-ÿ]/);
}

describe("Party deletion cascade (reverse + trash)", () => {
  it("deleting a sales customer reverses sales, voids receipts and removes them from the dashboard", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_sale");
    const partyId = await createParty(agent, "sales_customer", `Cascade Sales Customer ${Date.now()}`);

    const saleRes = await postWithCsrf(agent, "/api/sales", {
      unitId: unit.id,
      partyId,
      price: 250000,
      currencyCode: "AFN",
      saleDate: "2026-06-01",
    });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.id as number;

    const receiptRes = await postWithCsrf(agent, `/api/sales/${saleId}/receipts`, {
      amount: 100000,
      currencyCode: "AFN",
      receiptDate: "2026-06-02",
    });
    expect(receiptRes.status).toBe(201);
    const receiptId = receiptRes.body.id as number;

    const before = await dashboard(agent);
    expect(before.drilldowns.customers.some((customer) => customer.id === partyId)).toBe(true);
    const beforeSalesAfn = Number(before.salesTotalsByCurrency["AFN"] ?? 0);
    const beforeReceivablesAfn = Number(before.companyReceivablesByCurrency["AFN"] ?? 0);

    const deleteRes = await deleteParty(agent, partyId, "cascade test delete");
    expect(deleteRes.status).toBe(200);

    const sale = await Sale.findByPk(saleId);
    expect(sale?.status).toBe("reversed");
    const receipt = await SaleReceipt.findByPk(receiptId);
    expect(receipt?.voidedAt).not.toBeNull();
    const refreshedUnit = await Unit.findByPk(unit.id);
    expect(refreshedUnit?.status).toBe("available");

    const after = await dashboard(agent);
    expectNoMojibake(after);
    expect(after.totalCustomers).toBe(before.totalCustomers - 1);
    expect(after.drilldowns.customers.some((customer) => customer.id === partyId)).toBe(false);
    expect(Number(after.salesTotalsByCurrency["AFN"] ?? 0)).toBeCloseTo(beforeSalesAfn - 250000, 2);
    expect(Number(after.companyReceivablesByCurrency["AFN"] ?? 0)).toBeCloseTo(beforeReceivablesAfn - 150000, 2);

    const trashItem = await TrashItem.findOne({ where: { entityType: "Party", entityId: String(partyId) } });
    expect(trashItem).toBeTruthy();
  });

  it("deleting a tenant cancels rentals, voids receipts and frees the unit", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_rent");
    const partyId = await createParty(agent, "tenant", `Cascade Tenant ${Date.now()}`);

    const rentalRes = await postWithCsrf(agent, "/api/rentals", {
      unitId: unit.id,
      tenantPartyId: partyId,
      startDate: "2026-05-01",
      rentAmount: 15000,
      frequency: "monthly",
      currencyCode: "AFN",
    });
    expect(rentalRes.status).toBe(201);
    const rentalId = rentalRes.body.id as number;

    const receiptRes = await postWithCsrf(agent, `/api/rentals/${rentalId}/receipts`, {
      amount: 15000,
      currencyCode: "AFN",
      receiptDate: "2026-05-02",
    });
    expect(receiptRes.status).toBe(201);
    const receiptId = receiptRes.body.id as number;

    const before = await dashboard(agent);
    const beforeSalesAfn = Number(before.salesTotalsByCurrency["AFN"] ?? 0);

    const deleteRes = await deleteParty(agent, partyId, "cascade tenant delete");
    expect(deleteRes.status).toBe(200);

    const rental = await Rental.findByPk(rentalId);
    expect(rental?.status).toBe("cancelled");
    const receipt = await RentalReceipt.findByPk(receiptId);
    expect(receipt?.voidedAt).not.toBeNull();
    const refreshedUnit = await Unit.findByPk(unit.id);
    expect(refreshedUnit?.status).toBe("available");

    // The rental is gone from the rentals list and detail (its tenant is deleted).
    const rentalDetail = await agent.get(`/api/rentals/${rentalId}`);
    expect(rentalDetail.status).toBe(404);
    const rentalsList = await agent.get("/api/rentals");
    expect(rentalsList.status).toBe(200);
    expect((rentalsList.body as Array<{ id: number }>).some((row) => row.id === rentalId)).toBe(false);

    const after = await dashboard(agent);
    expectNoMojibake(after);
    expect(after.activeRentals).toBe(before.activeRentals - 1);
    expect(Number(after.salesTotalsByCurrency["AFN"] ?? 0)).toBeCloseTo(beforeSalesAfn - 15000, 2);

    const rentalTrash = await TrashItem.findOne({ where: { entityType: "Rental", entityId: String(rentalId) } });
    expect(rentalTrash).toBeTruthy();
  });

  it("deleting a supplier cancels purchases, voids payments and clears payables", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, "supplier", `Cascade Supplier ${Date.now()}`);

    const purchaseRes = await postWithCsrf(agent, "/api/purchases", {
      purchaseNumber: `P-${Date.now()}`,
      supplierPartyId: partyId,
      purchaseDate: "2026-04-10",
      itemName: "سیمان",
      quantity: 50,
      unitOfMeasure: "بوجۍ",
      unitPrice: 600,
      currencyCode: "AFN",
    });
    expect(purchaseRes.status).toBe(201);
    const purchaseId = purchaseRes.body.id as number;
    const totalAmount = Number(purchaseRes.body.totalAmount);

    const paymentRes = await postWithCsrf(agent, `/api/purchases/${purchaseId}/payments`, {
      amount: 10000,
      currencyCode: "AFN",
      paymentDate: "2026-04-11",
    });
    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.id as number;

    const before = await dashboard(agent);
    const beforePayablesAfn = Number(before.companyPayablesByCurrency["AFN"] ?? 0);

    const deleteRes = await deleteParty(agent, partyId, "cascade supplier delete");
    expect(deleteRes.status).toBe(200);

    const purchase = await Purchase.findByPk(purchaseId);
    expect(purchase?.status).toBe("cancelled");
    const payment = await PurchasePayment.findByPk(paymentId);
    expect(payment?.voidedAt).not.toBeNull();

    const after = await dashboard(agent);
    expectNoMojibake(after);
    expect(Number(after.companyPayablesByCurrency["AFN"] ?? 0)).toBeCloseTo(beforePayablesAfn - (totalAmount - 10000), 2);
  });

  it("deleting an exchange dealer removes its exchange transactions and voids their postings", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, "exchange_dealer", `Cascade Exchange ${Date.now()}`);

    const exchangeRes = await postWithCsrf(agent, "/api/exchange", {
      partyId,
      exchangeDate: "2026-03-15",
      currencyGiven: "USD",
      amountGiven: 100,
      currencyReceived: "AFN",
      amountReceived: 7400,
      rate: 74,
    });
    expect(exchangeRes.status).toBe(201);
    const exchangeId = exchangeRes.body.id as number;

    const deleteRes = await deleteParty(agent, partyId, "cascade exchange delete");
    expect(deleteRes.status).toBe(200);

    expect(await ExchangeTransaction.findByPk(exchangeId)).toBeNull();
    const link = await PostingLink.findOne({ where: { sourceModule: "exchange", sourceId: exchangeId, postingType: "exchange_creation" } });
    expect(link).toBeTruthy();
    const journal = await JournalTransaction.findByPk(link!.transactionId);
    expect(journal?.voidedAt).not.toBeNull();

    const exchangeTrash = await TrashItem.findOne({ where: { entityType: "ExchangeTransaction", entityId: String(exchangeId) } });
    expect(exchangeTrash).toBeTruthy();
  });

  it("deleting a market customer voids its daily cash entries", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, "market_customer", `Cascade Market ${Date.now()}`);

    const entryRes = await postWithCsrf(agent, "/api/journal/daily-cash", {
      entryDate: "2026-03-20",
      description: "د بازار ورځنی ثبت",
      category: "other",
      entryType: "out",
      targetType: "market_customer",
      targetId: partyId,
      amount: 3500,
      currencyCode: "AFN",
    });
    expect(entryRes.status).toBe(201);
    const entryId = entryRes.body.id as number;

    const deleteRes = await deleteParty(agent, partyId, "cascade market delete");
    expect(deleteRes.status).toBe(200);

    const entry = await DailyCashEntry.findByPk(entryId);
    expect(entry?.voidedAt).not.toBeNull();
    const journal = await JournalTransaction.findByPk(entry!.journalTransactionId!);
    expect(journal?.voidedAt).not.toBeNull();
  });

  it("deleting a party reverses its direct ledger entries", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, "individual_customer", `Cascade Ledger ${Date.now()}`);

    const ledgerRes = await postWithCsrf(agent, `/api/parties/${partyId}/ledger`, {
      date: "2026-02-10",
      description: "مستقیم کهاته ننوتنه",
      currencyCode: "AFN",
      entryType: "money",
      amount: 5000,
    });
    expect(ledgerRes.status).toBe(201);
    const journalId = ledgerRes.body.id as number;

    const deleteRes = await deleteParty(agent, partyId, "cascade ledger delete");
    expect(deleteRes.status).toBe(200);

    const journal = await JournalTransaction.findByPk(journalId);
    expect(journal?.voidedAt).not.toBeNull();
    const ledgerTrash = await TrashItem.findOne({ where: { entityType: "PartyLedgerLine", entityId: String(journalId) } });
    expect(ledgerTrash).toBeTruthy();
  });

  it("does not touch another party's records when one party is deleted", async () => {
    const agent = await adminAgent();
    const unitA = await createTestUnit("for_sale");
    const unitB = await createTestUnit("for_sale");
    const partyA = await createParty(agent, "sales_customer", `Cascade Keep A ${Date.now()}`);
    const partyB = await createParty(agent, "sales_customer", `Cascade Keep B ${Date.now()}`);

    const saleARes = await postWithCsrf(agent, "/api/sales", {
      unitId: unitA.id,
      partyId: partyA,
      price: 70000,
      currencyCode: "AFN",
      saleDate: "2026-01-10",
    });
    expect(saleARes.status).toBe(201);
    const saleBRes = await postWithCsrf(agent, "/api/sales", {
      unitId: unitB.id,
      partyId: partyB,
      price: 90000,
      currencyCode: "AFN",
      saleDate: "2026-01-11",
    });
    expect(saleBRes.status).toBe(201);
    const saleBId = saleBRes.body.id as number;

    const deleteRes = await deleteParty(agent, partyA, "cascade isolation delete");
    expect(deleteRes.status).toBe(200);

    const saleB = await Sale.findByPk(saleBId);
    expect(saleB?.status).toBe("active");
    const unitBAfter = await Unit.findByPk(unitB.id);
    expect(unitBAfter?.status).toBe("sold");
    const after = await dashboard(agent);
    expect(after.drilldowns.customers.some((customer) => customer.id === partyB)).toBe(true);
  });

  it("restoring a deleted party from trash recreates its roles", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, "tenant", `Cascade Restore ${Date.now()}`);

    const deleteRes = await deleteParty(agent, partyId, "cascade restore test");
    expect(deleteRes.status).toBe(200);
    expect(await PartyRole.findOne({ where: { partyId } })).toBeNull();

    const trashItem = await TrashItem.findOne({ where: { entityType: "Party", entityId: String(partyId) } });
    expect(trashItem).toBeTruthy();

    const restoreRes = await postWithCsrf(agent, `/api/trash/${trashItem!.id}/restore`, { reason: "test restore" });
    expect(restoreRes.status).toBe(200);

    const party = await Party.findByPk(partyId);
    expect(party?.deletedAt).toBeNull();
    const role = await PartyRole.findOne({ where: { partyId, role: "tenant" } });
    expect(role).toBeTruthy();

    // Clean up: the restored party is deleted again so it does not pollute other tests.
    const secondDelete = await deleteParty(agent, partyId, "cleanup after restore test");
    expect(secondDelete.status).toBe(200);
  });

  it("dashboard alerts contain proper Pashto and no mojibake", async () => {
    const agent = await adminAgent();
    const body = await dashboard(agent);
    expectNoMojibake(body);
    for (const alert of body.alerts) {
      expect(alert).toMatch(/[؀-ۿ]/);
    }
    expect(Object.keys(body.salesTotalsByCurrency ?? {}).length).toBeGreaterThanOrEqual(0);
    expect(sumMap(body.salesTotalsByCurrency)).toBeGreaterThanOrEqual(0);
    expect(sumMap(body.companyPayablesByCurrency)).toBeGreaterThanOrEqual(0);
  });

  it("deleting a regular employee hides their payment from dashboard money, recent transactions and attendance", async () => {
    const agent = await adminAgent();
    const today = kabulTodayIso();

    const empRes = await postWithCsrf(agent, "/api/employees", {
      name: `Cascade Regular Worker ${Date.now()}`,
      position: "Laborer",
      wageType: "daily",
      wageAmount: 1000,
      currencyCode: "AFN",
      startDate: today,
    });
    expect(empRes.status).toBe(201);
    const employeeId = empRes.body.id as number;

    const attRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, {
      date: today,
      status: "present",
    });
    expect(attRes.status).toBe(201);

    const paymentRes = await postWithCsrf(agent, `/api/employees/${employeeId}/payments`, {
      amount: 400,
      type: "salary",
      currencyCode: "AFN",
      paymentDate: today,
    });
    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.id as number;

    const link = await PostingLink.findOne({
      where: { sourceModule: "employee_payment", sourceId: paymentId, postingType: "employee_payment" },
    });
    expect(link).toBeTruthy();

    const before = await employeeDashboard(agent);
    const beforeOutgoing = Number(before.todayOutgoingByCurrency["AFN"] ?? 0);
    expect(before.recentTransactions.some((transaction) => transaction.id === link!.transactionId)).toBe(true);
    expect(before.attendanceToday.presentEmployees.some((row) => row.id === employeeId)).toBe(true);

    const deleteRes = await postWithCsrf(agent, `/api/employees/${employeeId}/delete`, { reason: "cascade employee delete" });
    expect(deleteRes.status).toBe(200);

    const after = await employeeDashboard(agent);
    expectNoMojibake(after);
    // Today's outgoing money must drop by exactly the deleted employee's payment.
    expect(beforeOutgoing - Number(after.todayOutgoingByCurrency["AFN"] ?? 0)).toBeCloseTo(400, 2);
    // The payment journal must no longer be listed in recent transactions.
    expect(after.recentTransactions.some((transaction) => transaction.id === link!.transactionId)).toBe(false);
    // The deleted employee must disappear from the attendance drilldowns.
    expect(after.attendanceToday.presentEmployees.some((row) => row.id === employeeId)).toBe(false);

    const trashItem = await TrashItem.findOne({ where: { entityType: "Employee", entityId: String(employeeId) } });
    expect(trashItem).toBeTruthy();
  });

  it("deleting a misc worker hides their payment from dashboard money and recent transactions", async () => {
    const agent = await adminAgent();
    const today = kabulTodayIso();

    const empRes = await postWithCsrf(agent, "/api/employees", {
      name: `Cascade Misc Worker ${Date.now()}`,
      position: "Helper",
      wageType: "daily",
      wageAmount: 800,
      currencyCode: "AFN",
      startDate: today,
      workerType: "misc",
    });
    expect(empRes.status).toBe(201);
    const employeeId = empRes.body.id as number;

    const paymentRes = await postWithCsrf(agent, `/api/employees/${employeeId}/payments`, {
      amount: 300,
      type: "salary",
      currencyCode: "AFN",
      paymentDate: today,
    });
    expect(paymentRes.status).toBe(201);
    const paymentId = paymentRes.body.id as number;

    const link = await PostingLink.findOne({
      where: { sourceModule: "employee_payment", sourceId: paymentId, postingType: "employee_payment" },
    });
    expect(link).toBeTruthy();

    const before = await employeeDashboard(agent);
    const beforeOutgoing = Number(before.todayOutgoingByCurrency["AFN"] ?? 0);
    expect(before.recentTransactions.some((transaction) => transaction.id === link!.transactionId)).toBe(true);

    const deleteRes = await postWithCsrf(agent, `/api/employees/${employeeId}/delete`, { reason: "cascade misc delete" });
    expect(deleteRes.status).toBe(200);

    const after = await employeeDashboard(agent);
    expectNoMojibake(after);
    expect(beforeOutgoing - Number(after.todayOutgoingByCurrency["AFN"] ?? 0)).toBeCloseTo(300, 2);
    expect(after.recentTransactions.some((transaction) => transaction.id === link!.transactionId)).toBe(false);
  });

  it("excludes records of a party deleted without cascade (legacy data) from dashboard, recent transactions and reports", async () => {
    const agent = await adminAgent();
    const partyId = await createParty(agent, "supplier", `Legacy Supplier ${Date.now()}`);

    const dashBase = await dashboard(agent);
    const basePayables = Number(dashBase.companyPayablesByCurrency["AFN"] ?? 0);

    const purchaseRes = await postWithCsrf(agent, "/api/purchases", {
      purchaseNumber: `LG${Date.now()}`,
      supplierPartyId: partyId,
      purchaseDate: "2026-02-05",
      itemName: "ټوکر",
      quantity: 10,
      unitOfMeasure: "متره",
      unitPrice: 2000,
      currencyCode: "AFN",
    });
    expect(purchaseRes.status).toBe(201);
    const purchaseId = purchaseRes.body.id as number;
    const purchaseNumber = purchaseRes.body.purchaseNumber as string;
    const totalAmount = Number(purchaseRes.body.totalAmount);

    const dashWith = await dashboard(agent);
    expect(Number(dashWith.companyPayablesByCurrency["AFN"] ?? 0)).toBeCloseTo(basePayables + totalAmount, 2);

    // Simulate the OLD delete behavior: the party is soft-deleted with no cascade,
    // so the purchase stays "open" and its journal stays live in the database.
    const party = await Party.findByPk(partyId);
    expect(party).toBeTruthy();
    party!.deletedAt = new Date();
    party!.isActive = false;
    await party!.save();

    const purchaseAfter = await Purchase.findByPk(purchaseId);
    expect(purchaseAfter?.status).toBe("open");

    // Dashboard: payables must drop back to the baseline even though the purchase is open.
    const dashAfter = await dashboard(agent);
    expectNoMojibake(dashAfter);
    expect(Number(dashAfter.companyPayablesByCurrency["AFN"] ?? 0)).toBeCloseTo(basePayables, 2);

    // Recent transactions: the purchase journal must not be listed.
    const link = await PostingLink.findOne({
      where: { sourceModule: "purchase", sourceId: purchaseId, postingType: "purchase_creation" },
    });
    expect(link).toBeTruthy();
    expect(dashAfter.recentTransactions.some((transaction) => transaction.id === link!.transactionId)).toBe(false);

    // Profit & loss: purchases for the deleted supplier are excluded.
    const pl = await agent.get("/api/reports/profit-loss?currencyCode=AFN&startDate=2026-02-05&endDate=2026-02-05");
    expect(pl.status).toBe(200);
    expect(Number(pl.body.purchases)).toBe(0);

    // General report: the purchase number must not appear anywhere.
    const report = await agent.get("/api/reports/general?currencyCode=AFN&startDate=2026-02-05&endDate=2026-02-05");
    expect(report.status).toBe(200);
    expect(JSON.stringify(report.body)).not.toContain(purchaseNumber);
  });
});
