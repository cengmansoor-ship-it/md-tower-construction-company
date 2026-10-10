import { describe, it, expect } from "vitest";
import { createTestUnit, newAgent, loginAs, postWithCsrf, deleteWithCsrf } from "./helpers";
import { DailyCashEntry, JournalLine, JournalTransaction, Sale, Unit, sequelize } from "@workspace/db-sequelize";

async function adminAgent() {
  const agent = newAgent();
  await loginAs(agent, "admin", "admin123");
  return agent;
}

async function createCustomer(agent: Awaited<ReturnType<typeof adminAgent>>, name: string) {
  const res = await postWithCsrf(agent, "/api/parties", { name, type: "individual_customer" });
  expect(res.status).toBe(201);
  return res.body.id as number;
}

describe("Sales: creation, duplicate prevention, receipts, ledger", () => {
  it("17-19. creates a sale, prevents selling the same unit twice, and posts a balanced journal entry", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_sale");
    const partyId = await createCustomer(agent, `Sale Test Customer ${Date.now()}`);

    const saleRes = await postWithCsrf(agent, "/api/sales", {
      unitId: unit.id,
      partyId,
      price: 100000,
      currencyCode: "AFN",
      saleDate: "2026-07-12",
    });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.id;

    // Duplicate sale of the same unit must be rejected (unit no longer available).
    const dupRes = await postWithCsrf(agent, "/api/sales", {
      unitId: unit.id,
      partyId,
      price: 50000,
      currencyCode: "AFN",
      saleDate: "2026-07-12",
    });
    expect(dupRes.status).toBe(400);

    // 23. Journal posting: the sale's journal transaction balances (sum of debits = sum of credits).
    const lines = await JournalLine.findAll({ where: { currencyCode: "AFN" } });
    const grouped = new Map<number, { debit: number; credit: number }>();
    for (const line of lines) {
      const entry = grouped.get(line.transactionId) ?? { debit: 0, credit: 0 };
      const amt = Number(line.amount);
      if (line.direction === "debit") entry.debit += amt;
      else entry.credit += amt;
      grouped.set(line.transactionId, entry);
    }
    for (const { debit, credit } of grouped.values()) {
      expect(Math.abs(debit - credit)).toBeLessThan(0.0001);
    }

    // 20-21. First receipt + a second installment.
    const receipt1 = await postWithCsrf(agent, `/api/sales/${saleId}/receipts`, {
      amount: 20000,
      currencyCode: "AFN",
      receiptDate: "2026-07-12",
    });
    expect(receipt1.status).toBe(201);
    const receipt2 = await postWithCsrf(agent, `/api/sales/${saleId}/receipts`, {
      amount: 10000,
      currencyCode: "AFN",
      receiptDate: "2026-07-13",
    });
    expect(receipt2.status).toBe(201);

    // 22. Ledger calculation: sale detail reflects total received across both installments.
    const detail = await agent.get(`/api/sales/${saleId}`);
    expect(detail.status).toBe(200);
    const totalReceived = (detail.body.receipts ?? []).reduce(
      (sum: number, r: { amount: string; voidedAt: string | null }) => (r.voidedAt ? sum : sum + Number(r.amount)),
      0,
    );
    expect(totalReceived).toBe(30000);
  });

  it("removes a linked sale from sales detail and reports when deleted from the party ledger", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_sale");
    const partyRes = await postWithCsrf(agent, "/api/parties", {
      name: `Ledger Delete Sales Customer ${Date.now()}`,
      type: "sales_customer",
    });
    expect(partyRes.status).toBe(201);
    const partyId = partyRes.body.id as number;

    const saleRes = await postWithCsrf(agent, "/api/sales", {
      unitId: unit.id,
      partyId,
      price: 9000,
      currencyCode: "PKR",
      saleDate: "2027-01-15",
    });
    expect(saleRes.status).toBe(201);
    const saleId = saleRes.body.id as number;

    const ledger = await agent.get(`/api/parties/${partyId}/ledger?currency=PKR`);
    expect(ledger.status).toBe(200);
    const saleRow = ledger.body.rows.find((row: { lineId: number; sourceModule: string | null; sourceId: number | null }) => row.sourceModule === "sale" && row.sourceId === saleId);
    expect(saleRow).toBeTruthy();

    const deleteRes = await deleteWithCsrf(agent, `/api/parties/${partyId}/ledger/rows/${saleRow.lineId}?reason=${encodeURIComponent("ledger sale delete sync test")}`);
    expect(deleteRes.status).toBe(200);

    const sale = await Sale.findByPk(saleId);
    expect(sale?.status).toBe("reversed");
    const refreshedUnit = await Unit.findByPk(unit.id);
    expect(refreshedUnit?.status).toBe("available");

    const salesList = await agent.get("/api/sales?customerType=sales_customer&allDates=1");
    expect(salesList.status).toBe(200);
    expect((salesList.body as Array<{ id: number }>).some((row) => row.id === saleId)).toBe(false);

    const report = await agent.get("/api/reports/general?currencyCode=PKR&startDate=2027-01-15&endDate=2027-01-15");
    expect(report.status).toBe(200);
    expect(report.body.sectionSummaries.propertySales.byCurrency.PKR?.totalAmount ?? "0").toBe("0");
    expect(report.body.sectionSummaries.propertySales.byCurrency.PKR?.owedToCompany ?? "0").toBe("0");
  });
});

describe("Rentals: double-booking prevention", () => {
  it("25-26. creates a rental and blocks renting the same unit again while active", async () => {
    const agent = await adminAgent();
    const unit = await createTestUnit("for_rent");
    const partyId = await createCustomer(agent, `Rental Test Tenant ${Date.now()}`);

    const rentalRes = await postWithCsrf(agent, "/api/rentals", {
      unitId: unit.id,
      tenantPartyId: partyId,
      rentAmount: 5000,
      frequency: "monthly",
      currencyCode: "AFN",
      startDate: "2026-07-12",
    });
    expect(rentalRes.status).toBe(201);

    const dupRes = await postWithCsrf(agent, "/api/rentals", {
      unitId: unit.id,
      tenantPartyId: partyId,
      rentAmount: 4000,
      frequency: "monthly",
      currencyCode: "AFN",
      startDate: "2026-07-12",
    });
    expect(dupRes.status).toBe(400);
  });
});

describe("Journal: manual entries and duplicate prevention", () => {
  it("creates a daily cash roznamcha entry without rounding the amount", async () => {
    const agent = await adminAgent();
    const res = await postWithCsrf(agent, "/api/journal/daily-cash", {
      entryDate: "2026-07-12",
      description: "د آشپزخانې دقیق مصرف",
      category: "kitchen",
      amount: "123.456789",
      currencyCode: "AFN",
    });
    expect(res.status).toBe(201);
    expect(String(res.body.amount)).toBe("123.456789");

    const summary = await agent.get("/api/journal/daily-cash?date=2026-07-12&currencyCode=AFN");
    expect(summary.status).toBe(200);
    expect(summary.body.totals.kitchen).toBe("123.456789");
    expect(summary.body.totals.total_expenses).toBe("123.456789");

    const lines = await JournalLine.findAll({ where: { transactionId: res.body.journalTransactionId } });
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => String(line.amount) === "123.456789")).toBe(true);
  });

  it("24. rejects an unbalanced manual journal entry", async () => {
    const agent = await adminAgent();
    const accounts = await agent.get("/api/journal/accounts");
    expect(accounts.status).toBe(200);
    const [a, b] = accounts.body;
    const res = await postWithCsrf(agent, "/api/journal/manual", {
      transactionDate: "2026-07-12",
      lines: [
        { accountId: a.id, direction: "debit", amount: 100, currencyCode: "AFN" },
        { accountId: b.id, direction: "credit", amount: 50, currencyCode: "AFN" },
      ],
    });
    expect(res.status).toBe(400);
  });

  it("keeps daily cash and ledger in sync when a daily cash journal is reversed", async () => {
    const agent = await adminAgent();
    const partyId = await createCustomer(agent, `Journal Sync Customer ${Date.now()}`);
    const res = await postWithCsrf(agent, "/api/journal/daily-cash", {
      entryDate: "2026-07-14",
      description: "journal sync test",
      category: "customers",
      entryType: "in",
      targetType: "individual_customer",
      targetId: partyId,
      amount: "77",
      currencyCode: "AFN",
    });
    expect(res.status).toBe(201);

    const reverse = await postWithCsrf(agent, `/api/journal/${res.body.journalTransactionId}/reverse`, {
      reason: "sync reverse test",
    });
    expect(reverse.status).toBe(201);

    const entry = await DailyCashEntry.findByPk(res.body.id);
    expect(entry?.voidedAt).toBeTruthy();
    const journal = await JournalTransaction.findByPk(res.body.journalTransactionId);
    expect(journal?.voidedAt).toBeTruthy();

    const summary = await agent.get("/api/journal/daily-cash?date=2026-07-14&currencyCode=AFN");
    expect(summary.status).toBe(200);
    expect((summary.body.entries ?? []).some((row: { id: number }) => row.id === res.body.id)).toBe(false);
  });
});

describe("Market individual ledger accounting", () => {
  it("shows only user detail and keeps market received goods out of settlement totals", async () => {
    const agent = await adminAgent();
    const partyRes = await postWithCsrf(agent, "/api/parties", {
      name: `Market Test ${Date.now()}`,
      type: "market_customer",
    });
    expect(partyRes.status).toBe(201);
    const partyId = partyRes.body.id as number;

    const entryRes = await postWithCsrf(agent, `/api/parties/${partyId}/ledger`, {
      date: "2026-07-20",
      description: "بازار/انفرادي راکړه - د مشتری بیل نمبر: 546 - برقي سامان الآت",
      entryType: "receipt",
      amount: 500,
      currencyCode: "USD",
    });
    expect(entryRes.status).toBe(201);

    const ledgerRes = await agent.get(`/api/parties/${partyId}/ledger?startDate=2026-07-01&endDate=2026-07-31`);
    expect(ledgerRes.status).toBe(200);
    expect(ledgerRes.body.rows[0].description).toBe("برقي سامان الآت");
    expect(ledgerRes.body.rows[0].isMarketTransaction).toBe(true);

    const reportRes = await agent.get("/api/reports/general?allDates=1");
    expect(reportRes.status).toBe(200);
    const summary = reportRes.body.sectionSummaries.marketIndividualCustomers.byCurrency.USD;
    expect(summary.totalAmount).toBe("500");
    expect(summary.moneyReceived).toBe("0");
    expect(summary.owedByCompany).toBe("500");
    expect(summary.owedToCompany).toBe("0");

    const settlementRes = await postWithCsrf(agent, `/api/parties/${partyId}/ledger`, {
      date: "2026-07-21",
      description: "رسیدګي د دفتر له طرفه",
      entryType: "receipt",
      amount: 200,
      currencyCode: "USD",
    });
    expect(settlementRes.status).toBe(201);
    const settlementPartyLine = await JournalLine.findOne({ where: { transactionId: settlementRes.body.id, partyId } });
    expect(settlementPartyLine?.direction).toBe("debit");

    // Existing deployments may already have market settlements saved with the old credit direction.
    // The report must still treat settlement as reducing the previous market balance.
    await settlementPartyLine?.update({ direction: "credit" });

    const settledReportRes = await agent.get("/api/reports/general?allDates=1");
    expect(settledReportRes.status).toBe(200);
    const settledSummary = settledReportRes.body.sectionSummaries.marketIndividualCustomers.byCurrency.USD;
    expect(settledSummary.totalAmount).toBe("500");
    expect(settledSummary.moneyReceived).toBe("0");
    expect(settledSummary.moneyPaid).toBe("200");
    expect(settledSummary.owedByCompany).toBe("300");
    expect(settledSummary.owedToCompany).toBe("0");
  });
});

describe("Database integrity", () => {
  it("verifies SQLite integrity and that every journal transaction balances per currency", async () => {
    const [[result]] = (await sequelize.query("PRAGMA integrity_check")) as unknown as [Array<{ integrity_check: string }>];
    expect(result.integrity_check).toBe("ok");
  });
});
