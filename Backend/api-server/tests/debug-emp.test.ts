import { describe, it, expect } from "vitest";
import { newAgent, loginAs, postWithCsrf } from "./helpers";
import { JournalLine, JournalTransaction, PostingLink, CashAccount, Employee } from "@workspace/db-sequelize";

describe("debug employee dashboard", () => {
  it("shows values", async () => {
    const agent = newAgent();
    await loginAs(agent, "admin", "admin123");
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kabul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const today = `${parts.find((p) => p.type === "year")!.value}-${parts.find((p) => p.type === "month")!.value}-${parts.find((p) => p.type === "day")!.value}`;
    console.log("TODAY:", today);

    const cashAccounts = await CashAccount.findAll();
    console.log("CASH ACCOUNTS:", cashAccounts.map((c) => ({ id: c.id, accountId: c.accountId, name: c.name, currency: c.currencyCode })));

    const empRes = await postWithCsrf(agent, "/api/employees", {
      name: `Debug Worker ${Date.now()}`,
      position: "Laborer",
      wageType: "daily",
      wageAmount: 1000,
      currencyCode: "AFN",
      startDate: today,
    });
    const employeeId = empRes.body.id;
    const attRes = await postWithCsrf(agent, `/api/employees/${employeeId}/attendance`, { date: today, status: "present" });
    console.log("ATT:", attRes.status, attRes.body?.payableAmount);
    const payRes = await postWithCsrf(agent, `/api/employees/${employeeId}/payments`, { amount: 400, type: "salary", currencyCode: "AFN", paymentDate: today });
    console.log("PAY:", payRes.status, payRes.body?.id);
    const paymentId = payRes.body.id;
    const link = await PostingLink.findOne({ where: { sourceModule: "employee_payment", sourceId: paymentId, postingType: "employee_payment" } });
    console.log("LINK txn:", link?.transactionId);
    const txn = await JournalTransaction.findByPk(link!.transactionId);
    console.log("TXN:", txn?.transactionDate, "voided:", txn?.voidedAt);
    const lines = await JournalLine.findAll({ where: { transactionId: link!.transactionId } });
    console.log("LINES:", lines.map((l) => ({ accountId: l.accountId, dir: l.direction, amount: l.amount, partyType: l.partyType, partyId: l.partyId, currency: l.currencyCode })));

    const dash1 = await agent.get("/api/reports/dashboard");
    console.log("BEFORE outgoing:", JSON.stringify(dash1.body.todayOutgoingByCurrency), "incoming:", JSON.stringify(dash1.body.todayIncomingByCurrency));
    console.log("BEFORE recent ids:", dash1.body.recentTransactions.map((t: { id: number }) => t.id).slice(0, 5));

    const delRes = await postWithCsrf(agent, `/api/employees/${employeeId}/delete`, { reason: "debug delete" });
    console.log("DELETE:", delRes.status);
    const emp = await Employee.findByPk(employeeId);
    console.log("EMP deletedAt:", emp?.deletedAt);

    const dash2 = await agent.get("/api/reports/dashboard");
    console.log("AFTER outgoing:", JSON.stringify(dash2.body.todayOutgoingByCurrency), "incoming:", JSON.stringify(dash2.body.todayIncomingByCurrency));
    console.log("AFTER recent has txn:", dash2.body.recentTransactions.some((t: { id: number }) => t.id === link!.transactionId));

    const { Op } = await import("sequelize");
    const deletedEmployees = await Employee.findAll({ where: { deletedAt: { [Op.ne]: null } }, attributes: ["id"] });
    console.log("DELETED EMP IDS:", deletedEmployees.map((e) => e.id));
    const rawLines = await JournalLine.findAll({
      where: { transactionId: link!.transactionId, partyType: "employee", partyId: deletedEmployees.map((e) => e.id) },
      attributes: ["transactionId"],
    });
    console.log("MATCHING LINES:", rawLines.length);
    expect(true).toBe(true);
  });
});
