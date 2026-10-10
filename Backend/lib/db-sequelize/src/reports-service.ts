import Decimal from "decimal.js";
import { Op } from "sequelize";
import {
  Sale,
  SaleReceipt,
  Rental,
  RentalReceipt,
  Expense,
  Purchase,
  PurchaseReturn,
  PurchasePayment,
  EmployeePayment,
  PartnerTransaction,
  ExchangeTransaction,
  JournalLine,
  Account,
  CashAccount,
  Block,
  Floor,
  Unit,
  UnitType,
  Project,
  Party,
  Employee,
  Attendance,
  JournalTransaction,
  PostingLink,
  DailyCashEntry,
  Partner,
  Delegation,
  User,
} from "./models";
import { getEmployeeLedgerTotals } from "./employee-service";
import { findVoidedPostedSourceIds } from "./posting-source";

export interface ProfitLossInput {
  currencyCode: string;
  startDate: string;
  endDate: string;
}

export interface ProfitLossReport {
  currencyCode: string;
  startDate: string;
  endDate: string;
  propertySaleIncome: string;
  rentalIncome: string;
  otherIncome: string;
  totalIncome: string;
  purchases: string;
  expenses: string;
  employeeCosts: string;
  totalOutflow: string;
  partnerWithdrawals: string;
  availableBalance: string;
  profit: string;
  loss: string;
}

async function sumDecimal<T>(rows: T[], pick: (row: T) => string): Promise<Decimal> {
  return rows.reduce((sum, row) => sum.plus(new Decimal(pick(row))), new Decimal(0));
}

function groupSum<T>(rows: T[], currencyOf: (r: T) => string, amountOf: (r: T) => string): Record<string, string> {
  const totals = new Map<string, Decimal>();
  for (const row of rows) {
    const currency = currencyOf(row);
    const prev = totals.get(currency) ?? new Decimal(0);
    totals.set(currency, prev.plus(new Decimal(amountOf(row))));
  }
  const out: Record<string, string> = {};
  for (const [currency, total] of totals) out[currency] = total.toFixed();
  return out;
}

function mergeSubtract(a: Record<string, string>, b: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  const currencies = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const c of currencies) {
    out[c] = new Decimal(a[c] ?? 0).minus(new Decimal(b[c] ?? 0)).toFixed();
  }
  return out;
}

function addCurrencyAmount(totals: Record<string, string>, currencyCode: string, amount: string): void {
  totals[currencyCode] = new Decimal(totals[currencyCode] ?? 0).plus(amount).toFixed();
}

function currencyLabel(code: string): string {
  switch (code) {
    case "AFN":
      return "افغانی";
    case "USD":
      return "ډالر";
    case "PKR":
      return "کلداره";
    default:
      return code;
  }
}

export interface DashboardSummary {
  totalBlocks: number;
  totalFloors: number;
  totalProperties: number;
  unitsByStatus: Record<string, number>;
  unitStatusDetails: Record<string, DashboardDrilldownItem[]>;
  totalCustomers: number;
  drilldowns: {
    blocks: DashboardDrilldownItem[];
    floors: DashboardDrilldownItem[];
    properties: DashboardDrilldownItem[];
    customers: DashboardDrilldownItem[];
    activeRentals: DashboardDrilldownItem[];
  };
  salesTotalsByCurrency: Record<string, string>;
  receivedTotalsByCurrency: Record<string, string>;
  outstandingTotalsByCurrency: Record<string, string>;
  todayIncomingByCurrency: Record<string, string>;
  todayOutgoingByCurrency: Record<string, string>;
  activeRentals: number;
  attendanceToday: {
    present: number;
    absent: number;
    halfDay: number;
    leave: number;
    notRecorded: number;
    totalEmployees: number;
    presentEmployees: DashboardDrilldownItem[];
    absentEmployees: DashboardDrilldownItem[];
    halfDayEmployees: DashboardDrilldownItem[];
    leaveEmployees: DashboardDrilldownItem[];
    notRecordedEmployees: DashboardDrilldownItem[];
  };
  companyReceivablesByCurrency: Record<string, string>;
  companyPayablesByCurrency: Record<string, string>;
  recentTransactions: Array<{ id: number; date: string; memo: string | null; isManual: boolean; sourceUrl: string | null }>;
  alerts: string[];
}

export interface DashboardDrilldownItem {
  id: number;
  label: string;
  detail: string | null;
  to: string;
}

function limitDrilldown(items: DashboardDrilldownItem[], limit = 60): DashboardDrilldownItem[] {
  return items.slice(0, limit);
}

function dailyCashTargetUrl(entry: DailyCashEntry, transactionDate: string): string {
  if (!entry.targetId) return `/journal?date=${encodeURIComponent(transactionDate)}`;
  switch (entry.targetType) {
    case "supplier":
    case "sales_customer":
    case "exchange_dealer":
    case "market_customer":
    case "individual_customer":
      return `/parties/${entry.targetId}`;
    case "regular_employee":
    case "misc_worker":
      return `/employees/${entry.targetId}`;
    case "expense":
      return "/expenses";
    default:
      return `/journal?date=${encodeURIComponent(transactionDate)}`;
  }
}

async function transactionSourceUrl(sourceModule: string | null | undefined, sourceId: number | null | undefined, transactionDate: string): Promise<string | null> {
  if (!sourceModule || !sourceId) return `/journal?date=${encodeURIComponent(transactionDate)}`;
  switch (sourceModule) {
    case "purchase":
      return `/purchases/${sourceId}`;
    case "purchase_payment": {
      const payment = await PurchasePayment.findByPk(sourceId);
      return payment ? `/purchases/${payment.purchaseId}` : "/purchases/list";
    }
    case "purchase_return": {
      const purchaseReturn = await PurchaseReturn.findByPk(sourceId);
      return purchaseReturn ? `/purchases/${purchaseReturn.purchaseId}` : "/purchase-returns";
    }
    case "sale":
      return `/sales/${sourceId}`;
    case "sale_receipt": {
      const receipt = await SaleReceipt.findByPk(sourceId);
      return receipt ? `/sales/${receipt.saleId}` : "/sales?customerType=sales_customer&salesDetail=1&allDates=1";
    }
    case "rental":
      return `/rentals/${sourceId}`;
    case "rental_receipt": {
      const receipt = await RentalReceipt.findByPk(sourceId);
      return receipt ? `/rentals/${receipt.rentalId}` : "/rentals";
    }
    case "expense":
      return `/expenses?q=${encodeURIComponent(String(sourceId))}`;
    case "exchange":
      return "/exchange/transactions";
    case "daily_cash": {
      const entry = await DailyCashEntry.findByPk(sourceId);
      return entry ? dailyCashTargetUrl(entry, transactionDate) : `/journal?date=${encodeURIComponent(transactionDate)}`;
    }
    case "employee_payment": {
      const payment = await EmployeePayment.findByPk(sourceId);
      return payment ? `/employees/${payment.employeeId}` : "/employees";
    }
    case "partner":
      return `/haji-ledger/${sourceId}`;
    case "partner_transaction": {
      const tx = await PartnerTransaction.findByPk(sourceId);
      return tx ? `/haji-ledger/${tx.partnerId}` : "/haji-ledger";
    }
    default:
      return `/journal?date=${encodeURIComponent(transactionDate)}`;
  }
}

const activeDashboardProjectWhere = { deletedAt: null, status: { [Op.ne]: "archived" } };
const dashboardCustomerPartyTypes = ["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer"];

function activeDashboardProjectInclude() {
  return { model: Project, as: "project", where: activeDashboardProjectWhere, required: true };
}

function activeDashboardBlockInclude() {
  return { model: Block, as: "block", required: true, include: [activeDashboardProjectInclude()] };
}

function activeDashboardFloorInclude() {
  return { model: Floor, as: "floor", required: true, include: [activeDashboardBlockInclude()] };
}

function activeDashboardUnitInclude() {
  return { model: Unit, as: "unit", required: true, include: [activeDashboardFloorInclude()] };
}

async function deletedEmployeeTransactionIds(transactionIds: number[]): Promise<Set<number>> {
  if (transactionIds.length === 0) return new Set();
  const deletedEmployeeIds = (
    await Employee.findAll({ where: { deletedAt: { [Op.ne]: null } }, attributes: ["id"] })
  ).map((employee) => employee.id);
  if (deletedEmployeeIds.length === 0) return new Set();
  const lines = await JournalLine.findAll({
    where: {
      transactionId: { [Op.in]: transactionIds },
      partyType: "employee",
      partyId: { [Op.in]: deletedEmployeeIds },
    },
    attributes: ["transactionId"],
  });
  return new Set(lines.map((line) => line.transactionId));
}

async function getCashMovementByCurrency(todayIso: string): Promise<{
  incoming: Record<string, string>;
  outgoing: Record<string, string>;
}> {
  const cashAccounts = await CashAccount.findAll();
  const cashAccountIds = Array.from(new Set(cashAccounts.map((account) => account.accountId)));
  if (cashAccountIds.length === 0) return { incoming: {}, outgoing: {} };

  const cashLines = await JournalLine.findAll({
    where: { accountId: { [Op.in]: cashAccountIds } },
    include: [{ model: JournalTransaction, as: "transaction", where: { transactionDate: todayIso, voidedAt: null, reversalOfId: null }, attributes: [] }],
  });
  const cashTransactionIds = Array.from(new Set(cashLines.map((line) => line.transactionId)));
  const deletedCashPartyIds = new Set(
    (await Party.findAll({ where: { deletedAt: { [Op.ne]: null } }, attributes: ["id"] })).map((party) => party.id),
  );
  const cashPartyLines = cashTransactionIds.length
    ? await JournalLine.findAll({
        where: {
          transactionId: { [Op.in]: cashTransactionIds },
          partyType: { [Op.in]: ["customer", "supplier", "tenant", "exchange_dealer"] },
          partyId: { [Op.ne]: null },
        },
        attributes: ["transactionId", "partyId"],
      })
    : [];
  const cashTxnWithDeletedParty = new Set(
    cashPartyLines
      .filter((line) => line.partyId !== null && deletedCashPartyIds.has(line.partyId))
      .map((line) => line.transactionId),
  );
  for (const transactionId of await deletedEmployeeTransactionIds(cashTransactionIds)) {
    cashTxnWithDeletedParty.add(transactionId);
  }
  const incoming: Record<string, string> = {};
  const outgoing: Record<string, string> = {};
  for (const line of cashLines) {
    if (cashTxnWithDeletedParty.has(line.transactionId)) continue;
    if (line.direction === "debit") addCurrencyAmount(incoming, line.currencyCode, line.amount);
    else addCurrencyAmount(outgoing, line.currencyCode, line.amount);
  }
  return { incoming, outgoing };
}

async function getSaleLedgerMoneyByCurrency(
  sales: Sale[],
  saleReceipts: SaleReceipt[],
): Promise<{ received: Record<string, string>; outstanding: Record<string, string> }> {
  const received: Record<string, string> = {};
  const outstanding: Record<string, string> = {};
  const salesCustomerRows = sales.filter((sale) => {
    const row = sale.toJSON() as { party?: { type?: string | null } };
    return row.party?.type === "sales_customer" && Number.isFinite(sale.partyId);
  });
  const salesCustomerIds = new Set(salesCustomerRows.map((sale) => sale.id));
  const salesCustomerPartyIds = Array.from(new Set(salesCustomerRows.map((sale) => sale.partyId)));
  const creditByPartyCurrency = new Map<string, Decimal>();

  if (salesCustomerPartyIds.length > 0) {
    const creditLines = await JournalLine.findAll({
      where: {
        partyType: "customer",
        partyId: { [Op.in]: salesCustomerPartyIds },
        direction: "credit",
      },
      include: [{ model: JournalTransaction, as: "transaction", where: { voidedAt: null }, attributes: [] }],
    });
    for (const line of creditLines) {
      if (!line.partyId) continue;
      const key = `${line.partyId}::${line.currencyCode}`;
      creditByPartyCurrency.set(key, (creditByPartyCurrency.get(key) ?? new Decimal(0)).plus(line.amount));
    }
  }

  const salesByPartyCurrency = new Map<string, Sale[]>();
  for (const sale of salesCustomerRows) {
    const key = `${sale.partyId}::${sale.currencyCode}`;
    const bucket = salesByPartyCurrency.get(key) ?? [];
    bucket.push(sale);
    salesByPartyCurrency.set(key, bucket);
  }

  for (const [key, bucket] of salesByPartyCurrency) {
    bucket.sort((left, right) => {
      const byDate = left.saleDate.localeCompare(right.saleDate);
      return byDate !== 0 ? byDate : left.id - right.id;
    });
    let remainingCredit = creditByPartyCurrency.get(key) ?? new Decimal(0);
    bucket.forEach((sale, index) => {
      const price = new Decimal(sale.finalPrice);
      const isLast = index === bucket.length - 1;
      const applied = isLast ? remainingCredit : Decimal.min(Decimal.max(remainingCredit, 0), price);
      addCurrencyAmount(received, sale.currencyCode, applied.toFixed());
      addCurrencyAmount(outstanding, sale.currencyCode, price.minus(applied).toFixed());
      remainingCredit = remainingCredit.minus(applied);
    });
  }

  const receiptBySaleId = new Map<number, Decimal>();
  for (const receipt of saleReceipts) {
    if (salesCustomerIds.has(receipt.saleId)) continue;
    receiptBySaleId.set(receipt.saleId, (receiptBySaleId.get(receipt.saleId) ?? new Decimal(0)).plus(receipt.amount));
  }
  for (const sale of sales) {
    if (salesCustomerIds.has(sale.id)) continue;
    const paid = receiptBySaleId.get(sale.id) ?? new Decimal(0);
    addCurrencyAmount(received, sale.currencyCode, paid.toFixed());
    addCurrencyAmount(outstanding, sale.currencyCode, new Decimal(sale.finalPrice).minus(paid).toFixed());
  }

  return { received, outstanding };
}

/** Every figure here is computed live from the database — no hard-coded dashboard values. */
export async function getDashboardSummary(todayIso: string): Promise<DashboardSummary> {
  const [blocks, floors, units, customerParties, activeRentalRows, activeEmployees] = await Promise.all([
    Block.findAll({
      include: [activeDashboardProjectInclude()],
      order: [["id", "DESC"]],
    }),
    Floor.findAll({
      include: [activeDashboardBlockInclude()],
      order: [["id", "DESC"]],
    }),
    Unit.findAll({
      include: [
        { model: UnitType, as: "unitType" },
        activeDashboardFloorInclude(),
      ],
      order: [["id", "DESC"]],
    }),
    Party.findAll({ where: { type: { [Op.in]: dashboardCustomerPartyTypes }, deletedAt: null }, order: [["id", "DESC"]] }),
    Rental.findAll({ where: { status: "active" }, include: [{ model: Party, as: "tenant", where: { deletedAt: null }, required: true }, activeDashboardUnitInclude()], order: [["id", "DESC"]] }),
    Employee.findAll({
      where: {
        status: "active",
        workerType: "regular",
        deletedAt: null,
        startDate: { [Op.lte]: todayIso },
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gt]: todayIso } }],
      },
      order: [["id", "DESC"]],
    }),
  ]);
  const todaysAttendance = await Attendance.findAll({
    where: { date: todayIso },
    include: [
      {
        model: Employee,
        as: "employee",
        where: { workerType: "regular", deletedAt: null },
        required: true,
      },
    ],
  });
  const totalBlocks = blocks.length;
  const totalFloors = floors.length;
  const totalCustomers = customerParties.length;
  const activeRentals = activeRentalRows.length;

  const unitsByStatus: Record<string, number> = {};
  for (const u of units) unitsByStatus[u.status] = (unitsByStatus[u.status] ?? 0) + 1;
  const unitStatusDetails: Record<string, DashboardDrilldownItem[]> = {};
  for (const unit of units) {
    const row = unit.toJSON() as {
      unitType?: { name?: string | null };
      floor?: { name?: string | null; block?: { id?: number; name?: string | null; code?: string | null; projectId?: number; project?: { id?: number; name?: string | null } } };
    };
    const projectId = row.floor?.block?.project?.id ?? row.floor?.block?.projectId;
    const detail = [row.floor?.block?.project?.name, row.floor?.block?.name ?? row.floor?.block?.code, row.floor?.name, row.unitType?.name]
      .filter(Boolean)
      .join(" / ");
    const item: DashboardDrilldownItem = {
      id: unit.id,
      label: `نمبر ${unit.unitNumber}`,
      detail: detail || null,
      to: projectId ? `/projects/${projectId}` : "/projects/list",
    };
    unitStatusDetails[unit.status] = [...(unitStatusDetails[unit.status] ?? []), item];
  }
  for (const [status, items] of Object.entries(unitStatusDetails)) unitStatusDetails[status] = limitDrilldown(items);

  const drilldowns = {
    blocks: limitDrilldown(blocks.map((block) => {
      const row = block.toJSON() as { project?: { name?: string | null } };
      return {
        id: block.id,
        label: block.name || block.code,
        detail: row.project?.name ?? null,
        to: `/projects/${block.projectId}`,
      };
    })),
    floors: limitDrilldown(floors.map((floor) => {
      const row = floor.toJSON() as { block?: { name?: string | null; code?: string | null; projectId?: number; project?: { name?: string | null } } };
      return {
        id: floor.id,
        label: floor.name,
        detail: [row.block?.project?.name, row.block?.name ?? row.block?.code].filter(Boolean).join(" / ") || null,
        to: row.block?.projectId ? `/projects/${row.block.projectId}` : "/projects/list",
      };
    })),
    properties: limitDrilldown(units.map((unit) => {
      const row = unit.toJSON() as {
        unitType?: { name?: string | null };
        floor?: { name?: string | null; block?: { projectId?: number; name?: string | null; code?: string | null; project?: { name?: string | null } } };
      };
      return {
        id: unit.id,
        label: `نمبر ${unit.unitNumber}`,
        detail: [row.floor?.block?.project?.name, row.floor?.block?.name ?? row.floor?.block?.code, row.floor?.name, row.unitType?.name]
          .filter(Boolean)
          .join(" / ") || null,
        to: row.floor?.block?.projectId ? `/projects/${row.floor.block.projectId}` : "/projects/list",
      };
    })),
    customers: limitDrilldown(customerParties.map((party) => ({
      id: party.id,
      label: party.name,
      detail: party.fatherName ?? party.phone1 ?? null,
      to: `/parties/${party.id}`,
    }))),
    activeRentals: limitDrilldown(activeRentalRows.map((rental) => {
      const row = rental.toJSON() as { tenant?: { name?: string | null }; unit?: { unitNumber?: string | null } };
      return {
        id: rental.id,
        label: rental.rentalNumber,
        detail: [row.tenant?.name, row.unit?.unitNumber, `${rental.rentAmount} ${currencyLabel(rental.currencyCode)}`].filter(Boolean).join(" / ") || null,
        to: `/rentals/${rental.id}`,
      };
    })),
  };

  const activeDashboardPartyInclude = () => ({ model: Party, as: "party", where: { deletedAt: null }, required: true });
  const activeDashboardTenantInclude = () => ({ model: Party, as: "tenant", where: { deletedAt: null }, required: true });
  const activeDashboardSupplierInclude = () => ({ model: Party, as: "supplier", where: { deletedAt: null }, required: true });
  const [sales, saleReceipts, rentals, rentalReceipts, purchases, purchaseReturns, purchasePayments] = await Promise.all([
    Sale.findAll({
      where: { status: { [Op.notIn]: ["cancelled", "reversed"] } },
      include: [activeDashboardUnitInclude(), activeDashboardPartyInclude()],
    }),
    SaleReceipt.findAll({
      where: { voidedAt: null },
      include: [
        {
          model: Sale,
          as: "sale",
          required: true,
          where: { status: { [Op.notIn]: ["cancelled", "reversed"] } },
          include: [activeDashboardUnitInclude(), activeDashboardPartyInclude()],
        },
      ],
    }),
    Rental.findAll({
      where: { status: { [Op.notIn]: ["cancelled"] } },
      include: [activeDashboardUnitInclude(), activeDashboardTenantInclude()],
    }),
    RentalReceipt.findAll({
      where: { voidedAt: null },
      include: [
        {
          model: Rental,
          as: "rental",
          required: true,
          where: { status: { [Op.ne]: "cancelled" } },
          include: [activeDashboardUnitInclude(), activeDashboardTenantInclude()],
        },
      ],
    }),
    Purchase.findAll({
      where: { status: { [Op.notIn]: ["cancelled"] } },
      include: [activeDashboardSupplierInclude()],
    }),
    PurchaseReturn.findAll({
      include: [
        {
          model: Purchase,
          as: "purchase",
          required: true,
          where: { status: { [Op.ne]: "cancelled" } },
          include: [activeDashboardSupplierInclude()],
        },
      ],
    }),
    PurchasePayment.findAll({
      where: { voidedAt: null },
      include: [
        {
          model: Purchase,
          as: "purchase",
          required: true,
          where: { status: { [Op.ne]: "cancelled" } },
          include: [activeDashboardSupplierInclude()],
        },
      ],
    }),
  ]);

  const salesTotalsByCurrency = groupSum(sales, (s) => s.currencyCode, (s) => s.finalPrice);
  const rentalTotalsByCurrency = groupSum(rentals, (r) => r.currencyCode, (r) => r.rentAmount);
  const saleLedgerMoney = await getSaleLedgerMoneyByCurrency(sales, saleReceipts);
  const rentalReceivedByCurrency = groupSum(rentalReceipts, (r) => r.currencyCode, (r) => r.amount);
  const receivedTotalsByCurrency = mergeSubtract(saleLedgerMoney.received, {});
  for (const [c, v] of Object.entries(rentalReceivedByCurrency)) {
    receivedTotalsByCurrency[c] = new Decimal(receivedTotalsByCurrency[c] ?? 0).plus(v).toFixed();
  }
  const combinedSalesTotals: Record<string, string> = { ...salesTotalsByCurrency };
  for (const [c, v] of Object.entries(rentalTotalsByCurrency)) {
    combinedSalesTotals[c] = new Decimal(combinedSalesTotals[c] ?? 0).plus(v).toFixed();
  }
  const outstandingTotalsByCurrency = mergeSubtract(saleLedgerMoney.outstanding, {});
  const rentalOutstandingByCurrency = mergeSubtract(rentalTotalsByCurrency, rentalReceivedByCurrency);
  for (const [c, v] of Object.entries(rentalOutstandingByCurrency)) {
    outstandingTotalsByCurrency[c] = new Decimal(outstandingTotalsByCurrency[c] ?? 0).plus(v).toFixed();
  }
  const companyReceivablesByCurrency = outstandingTotalsByCurrency;

  const purchasesGrossByCurrency = groupSum(purchases, (p) => p.currencyCode, (p) => p.totalAmount);
  const purchaseReturnsByCurrency = groupSum(purchaseReturns, (r) => r.currencyCode, (r) => r.amount);
  const purchasePaymentsByCurrency = groupSum(purchasePayments, (p) => p.currencyCode, (p) => p.amount);
  const purchasesNetByCurrency = mergeSubtract(purchasesGrossByCurrency, purchaseReturnsByCurrency);
  const companyPayablesByCurrency = mergeSubtract(purchasesNetByCurrency, purchasePaymentsByCurrency);

  const { incoming: todayIncomingByCurrency, outgoing: todayOutgoingByCurrency } = await getCashMovementByCurrency(todayIso);

  const attendanceByEmployeeId = new Map(todaysAttendance.map((attendance) => [attendance.employeeId, attendance]));
  const attendanceEmployeeRows = new Map<number, Employee>();
  for (const attendance of todaysAttendance) {
    const row = attendance.toJSON() as { employee?: Employee };
    if (row.employee) attendanceEmployeeRows.set(attendance.employeeId, row.employee);
  }
  const employeesForAttendance = new Map<number, Employee>();
  for (const employee of activeEmployees) employeesForAttendance.set(employee.id, employee);
  for (const [employeeId, employee] of attendanceEmployeeRows) employeesForAttendance.set(employeeId, employee);

  const attendanceToday = {
    present: todaysAttendance.filter((a) => a.status === "present").length,
    absent: todaysAttendance.filter((a) => a.status === "absent").length,
    halfDay: todaysAttendance.filter((a) => a.status === "half_day").length,
    leave: todaysAttendance.filter((a) => a.status === "leave").length,
    totalEmployees: employeesForAttendance.size,
    notRecorded: activeEmployees.filter((employee) => !attendanceByEmployeeId.has(employee.id)).length,
    presentEmployees: [] as DashboardDrilldownItem[],
    absentEmployees: [] as DashboardDrilldownItem[],
    halfDayEmployees: [] as DashboardDrilldownItem[],
    leaveEmployees: [] as DashboardDrilldownItem[],
    notRecordedEmployees: [] as DashboardDrilldownItem[],
  };
  const employeeDrilldown = (employee: Employee): DashboardDrilldownItem => ({
    id: employee.id,
    label: employee.name,
    detail: [employee.employeeNumber, employee.fatherName, employee.position].filter(Boolean).join(" / ") || null,
    to: `/employees/${employee.id}`,
  });
  for (const employee of employeesForAttendance.values()) {
    const attendance = attendanceByEmployeeId.get(employee.id);
    if (!attendance) {
      attendanceToday.notRecordedEmployees.push(employeeDrilldown(employee));
    } else if (attendance.status === "present") {
      attendanceToday.presentEmployees.push(employeeDrilldown(employee));
    } else if (attendance.status === "absent") {
      attendanceToday.absentEmployees.push(employeeDrilldown(employee));
    } else if (attendance.status === "half_day") {
      attendanceToday.halfDayEmployees.push(employeeDrilldown(employee));
    } else if (attendance.status === "leave") {
      attendanceToday.leaveEmployees.push(employeeDrilldown(employee));
    }
  }
  attendanceToday.presentEmployees = limitDrilldown(attendanceToday.presentEmployees);
  attendanceToday.absentEmployees = limitDrilldown(attendanceToday.absentEmployees);
  attendanceToday.halfDayEmployees = limitDrilldown(attendanceToday.halfDayEmployees);
  attendanceToday.leaveEmployees = limitDrilldown(attendanceToday.leaveEmployees);
  attendanceToday.notRecordedEmployees = limitDrilldown(attendanceToday.notRecordedEmployees);

  const recentTxns = await JournalTransaction.findAll({
    where: { voidedAt: null, reversalOfId: null },
    order: [["id", "DESC"]],
    limit: 15,
  });
  // Never surface transactions that belong to a deleted party (e.g. leftover rows from
  // deletions made before the cascade logic existed) — "employee"/"partner" lines use
  // employee/partner ids, not party ids, so only party-backed line types are checked.
  const deletedRecentPartyIds = new Set(
    (await Party.findAll({ where: { deletedAt: { [Op.ne]: null } }, attributes: ["id"] })).map((party) => party.id),
  );
  const recentTxnLines = recentTxns.length
    ? await JournalLine.findAll({
        where: {
          transactionId: { [Op.in]: recentTxns.map((transaction) => transaction.id) },
          partyType: { [Op.in]: ["customer", "supplier", "tenant", "exchange_dealer"] },
          partyId: { [Op.ne]: null },
        },
        attributes: ["transactionId", "partyId"],
      })
    : [];
  const recentTxnWithDeletedParty = new Set(
    recentTxnLines
      .filter((line) => line.partyId !== null && deletedRecentPartyIds.has(line.partyId))
      .map((line) => line.transactionId),
  );
  for (const transactionId of await deletedEmployeeTransactionIds(recentTxns.map((transaction) => transaction.id))) {
    recentTxnWithDeletedParty.add(transactionId);
  }
  const visibleRecentTxns = recentTxns.filter((transaction) => !recentTxnWithDeletedParty.has(transaction.id));
  const recentTxnLinks = visibleRecentTxns.length
    ? await PostingLink.findAll({ where: { transactionId: { [Op.in]: visibleRecentTxns.map((transaction) => transaction.id) } } })
    : [];
  const recentLinkByTransactionId = new Map(recentTxnLinks.map((link) => [link.transactionId, link]));
  const recentTransactions = await Promise.all(
    visibleRecentTxns.map(async (t) => {
      const source = recentLinkByTransactionId.get(t.id);
      return {
        id: t.id,
        date: t.transactionDate,
        memo: t.memo ?? null,
        isManual: t.isManual,
        sourceUrl: await transactionSourceUrl(source?.sourceModule, source?.sourceId, t.transactionDate),
      };
    }),
  );

  const alerts: string[] = [];
  for (const [c, v] of Object.entries(companyPayablesByCurrency)) {
    if (new Decimal(v).greaterThan(0)) alerts.push(`د تادیو وړ پور ${v} ${currencyLabel(c)} شتون لري (پیرودونکو ته)`);
  }
  for (const [c, v] of Object.entries(companyReceivablesByCurrency)) {
    if (new Decimal(v).greaterThan(0)) alerts.push(`نوسانتوونکي پیسې ${v} ${currencyLabel(c)} د راټولیدو په تمه دي`);
  }
  if (attendanceToday.notRecorded > 0) {
    alerts.push(`د نن ورځې د ${attendanceToday.notRecorded} کارکوونکو حاضري نه ده ثبت شوې`);
  }

  return {
    totalBlocks,
    totalFloors,
    totalProperties: units.length,
    unitsByStatus,
    unitStatusDetails,
    totalCustomers,
    drilldowns,
    salesTotalsByCurrency: combinedSalesTotals,
    receivedTotalsByCurrency,
    outstandingTotalsByCurrency,
    todayIncomingByCurrency,
    todayOutgoingByCurrency,
    activeRentals,
    attendanceToday,
    companyReceivablesByCurrency,
    companyPayablesByCurrency,
    recentTransactions,
    alerts,
  };
}

export interface GeneralReportInput {
  currencyCode?: string;
  startDate: string;
  endDate: string;
}

export interface GeneralReportRow {
  date: string;
  reference: string;
  party: string | null;
  itemName?: string | null;
  quantity?: string | null;
  currencyCode: string;
  totalAmount: string;
  moneyReceived: string;
  moneyPaid: string;
  owedToCompany: string;
  owedByCompany: string;
  blockName?: string | null;
  floorName?: string | null;
  unitNumber?: string | null;
  unitTypeName?: string | null;
  sourceUrl?: string | null;
  note: string | null;
}

export interface GeneralReportCurrencySummary {
  totalAmount: string;
  moneyReceived: string;
  moneyPaid: string;
  owedToCompany: string;
  owedByCompany: string;
}

export interface GeneralReportSectionSummary {
  rowCount: number;
  byCurrency: Record<string, GeneralReportCurrencySummary>;
}

export interface GeneralReportSalesSummary {
  soldCount: number;
  remainingCount: number;
  soldLocations: string[];
  remainingLocations: string[];
  totalSoldByCurrency: Record<string, string>;
  receivedByCurrency: Record<string, string>;
  customerDebtByCurrency: Record<string, string>;
}

export interface GeneralReportPurchaseItemSummary {
  itemName: string;
  quantity: string;
  unitOfMeasure: string | null;
  currencyCode: string;
  totalAmount: string;
}

export interface ProjectStructureRow {
  projectId: number;
  projectName: string;
  blocks: number;
  floors: number;
  totalProperties: number;
  available: number;
  reserved: number;
  sold: number;
  rented: number;
  unavailable: number;
}

export interface GeneralReport {
  currencyCode: string | null;
  startDate: string;
  endDate: string;
  purchasing: GeneralReportRow[];
  expenses: GeneralReportRow[];
  customers: GeneralReportRow[];
  marketIndividualCustomers: GeneralReportRow[];
  exchange: GeneralReportRow[];
  propertySales: GeneralReportRow[];
  rentals: GeneralReportRow[];
  employees: GeneralReportRow[];
  miscWorkers: GeneralReportRow[];
  kafil: GeneralReportRow[];
  partners: GeneralReportRow[];
  journal: GeneralReportRow[];
  ledger: GeneralReportRow[];
  purchaseItems: GeneralReportPurchaseItemSummary[];
  purchaseItemTotalsByCurrency: Record<string, string>;
  projects: ProjectStructureRow[];
  sectionSummaries: Record<string, GeneralReportSectionSummary>;
  salesSummary: GeneralReportSalesSummary;
  grandSummary: GeneralReportSectionSummary;
}

export interface KafilLedgerReport {
  delegation: {
    id: number;
    delegatedUserId: number;
    delegatedUserName: string;
    delegatedUsername: string;
    startDate: string;
    endDate: string;
    reason: string | null;
    isActive: boolean;
  } | null;
  rows: GeneralReportRow[];
  summary: GeneralReportSectionSummary;
}

type LegacyGeneralReportRow = Omit<GeneralReportRow, "currencyCode" | "totalAmount">;

type ReportUnitLocation = {
  unitNumber?: string | null;
  unitType?: { name?: string | null } | null;
  floor?: { name?: string | null; block?: { name?: string | null; code?: string | null } | null } | null;
} | null;

function reportUnitInclude() {
  const unitInclude = activeDashboardUnitInclude();
  return {
    ...unitInclude,
    required: false,
    include: [...unitInclude.include, { model: UnitType, as: "unitType", required: false }],
  };
}

function reportUnitLocation(unit: ReportUnitLocation | undefined): {
  label: string | null;
  blockName: string | null;
  floorName: string | null;
  unitNumber: string | null;
  unitTypeName: string | null;
} {
  const blockName = unit?.floor?.block?.name ?? unit?.floor?.block?.code ?? null;
  const floorName = unit?.floor?.name ?? null;
  const unitNumber = unit?.unitNumber ?? null;
  const unitTypeName = unit?.unitType?.name ?? null;
  const label = [blockName, floorName, unitNumber].filter(Boolean).join(" / ") || null;
  return { label, blockName, floorName, unitNumber, unitTypeName };
}

function reportSumByCurrency<T>(rows: T[], currencyOf: (row: T) => string, amountOf: (row: T) => string | number | null | undefined): Record<string, string> {
  const totals = new Map<string, Decimal>();
  for (const row of rows) {
    const currency = currencyOf(row);
    const amount = new Decimal(amountOf(row) ?? 0);
    totals.set(currency, (totals.get(currency) ?? new Decimal(0)).plus(amount));
  }
  return Object.fromEntries(Array.from(totals.entries()).map(([currency, amount]) => [currency, amount.toFixed()]));
}

function reportAddCurrencyMaps(...items: Array<Record<string, string> | number>): Record<string, string> {
  const result = new Map<string, Decimal>();
  let factor = new Decimal(1);
  for (const item of items) {
    if (typeof item === "number") {
      factor = new Decimal(item);
      continue;
    }
    for (const [currency, amount] of Object.entries(item)) {
      result.set(currency, (result.get(currency) ?? new Decimal(0)).plus(new Decimal(amount).times(factor)));
    }
    factor = new Decimal(1);
  }
  return Object.fromEntries(Array.from(result.entries()).map(([currency, amount]) => [currency, amount.toFixed()]));
}

function reportSplitDebtBySign(
  netByCurrency: Record<string, string>,
  positiveMeansOwedToCompany: boolean,
): { owedToCompany: Record<string, string>; owedByCompany: Record<string, string> } {
  const owedToCompany: Record<string, string> = {};
  const owedByCompany: Record<string, string> = {};
  for (const [currency, value] of Object.entries(netByCurrency)) {
    const amount = new Decimal(value);
    if (amount.isZero()) continue;
    if (amount.greaterThan(0) === positiveMeansOwedToCompany) owedToCompany[currency] = amount.abs().toFixed();
    else owedByCompany[currency] = amount.abs().toFixed();
  }
  return { owedToCompany, owedByCompany };
}

function reportEnsureCurrencyKeys(record: Record<string, string>, currencies: Iterable<string>): Record<string, string> {
  const next = { ...record };
  for (const currency of currencies) {
    if (currency && next[currency] === undefined) next[currency] = "0";
  }
  return next;
}

function reportSumSimple<T>(rows: T[], amountOf: (row: T) => string | number | null | undefined): string {
  return rows.reduce((sum, row) => sum.plus(new Decimal(amountOf(row) ?? 0)), new Decimal(0)).toFixed();
}

function reportMakeSummary(
  rows: GeneralReportRow[],
  overrides: Partial<Record<keyof GeneralReportCurrencySummary, Record<string, string>>> = {},
): GeneralReportSectionSummary {
  const currencies = new Set<string>([
    ...rows.map((row) => row.currencyCode),
    ...Object.values(overrides).flatMap((record) => Object.keys(record ?? {})),
  ]);
  const byCurrency: Record<string, GeneralReportCurrencySummary> = {};
  for (const currency of currencies) {
    const currencyRows = rows.filter((row) => row.currencyCode === currency);
    byCurrency[currency] = {
      totalAmount: overrides.totalAmount?.[currency] ?? reportSumSimple(currencyRows, (row) => row.totalAmount),
      moneyReceived: overrides.moneyReceived?.[currency] ?? reportSumSimple(currencyRows, (row) => row.moneyReceived),
      moneyPaid: overrides.moneyPaid?.[currency] ?? reportSumSimple(currencyRows, (row) => row.moneyPaid),
      owedToCompany: overrides.owedToCompany?.[currency] ?? reportSumSimple(currencyRows, (row) => row.owedToCompany),
      owedByCompany: overrides.owedByCompany?.[currency] ?? reportSumSimple(currencyRows, (row) => row.owedByCompany),
    };
  }
  return { rowCount: rows.length, byCurrency };
}

function reportCombineSummaries(summaries: GeneralReportSectionSummary[]): GeneralReportSectionSummary {
  const currencies = new Set(summaries.flatMap((summary) => Object.keys(summary.byCurrency)));
  const byCurrency: Record<string, GeneralReportCurrencySummary> = {};
  for (const currency of currencies) {
    byCurrency[currency] = {
      totalAmount: reportSumSimple(summaries, (summary) => summary.byCurrency[currency]?.totalAmount ?? "0"),
      moneyReceived: reportSumSimple(summaries, (summary) => summary.byCurrency[currency]?.moneyReceived ?? "0"),
      moneyPaid: reportSumSimple(summaries, (summary) => summary.byCurrency[currency]?.moneyPaid ?? "0"),
      owedToCompany: reportSumSimple(summaries, (summary) => summary.byCurrency[currency]?.owedToCompany ?? "0"),
      owedByCompany: reportSumSimple(summaries, (summary) => summary.byCurrency[currency]?.owedByCompany ?? "0"),
    };
  }
  return { rowCount: summaries.reduce((sum, summary) => sum + summary.rowCount, 0), byCurrency };
}

function reportMergeTransactionTotalsWithLedgerDebt(
  transactionSummary: GeneralReportSectionSummary,
  ledgerSummary: GeneralReportSectionSummary,
): GeneralReportSectionSummary {
  const currencies = new Set([...Object.keys(transactionSummary.byCurrency), ...Object.keys(ledgerSummary.byCurrency)]);
  const byCurrency: Record<string, GeneralReportCurrencySummary> = {};
  for (const currency of currencies) {
    byCurrency[currency] = {
      totalAmount: transactionSummary.byCurrency[currency]?.totalAmount ?? "0",
      moneyReceived: transactionSummary.byCurrency[currency]?.moneyReceived ?? "0",
      moneyPaid: transactionSummary.byCurrency[currency]?.moneyPaid ?? "0",
      owedToCompany: ledgerSummary.byCurrency[currency]?.owedToCompany ?? "0",
      owedByCompany: ledgerSummary.byCurrency[currency]?.owedByCompany ?? "0",
    };
  }
  return { rowCount: transactionSummary.rowCount + ledgerSummary.rowCount, byCurrency };
}

function reportPartyTypeLabel(partyType: string | null | undefined): string {
  switch (partyType) {
    case "customer":
      return "مشتري";
    case "supplier":
      return "عرضه کوونکی";
    case "tenant":
      return "کرایه دار";
    case "employee":
      return "کارکوونکی";
    case "partner":
      return "شریک";
    case "exchange_dealer":
      return "صراف";
    default:
      return "شخص";
  }
}

function reportSourceLabel(sourceModule: string | null | undefined): string {
  switch (sourceModule) {
    case "purchase":
      return "خریداري";
    case "purchase_payment":
      return "د خرید رسید";
    case "purchase_return":
      return "واپسي بیل";
    case "sale":
      return "فروش";
    case "sale_receipt":
      return "د فروش رسید";
    case "rental":
      return "کرایه";
    case "rental_receipt":
      return "د کرایې رسید";
    case "expense":
      return "مصرف";
    case "exchange":
      return "صرافي";
    case "employee_payment":
      return "د کارکوونکي تادیه";
    case "partner":
      return "د شریک لومړنی حساب";
    case "partner_transaction":
      return "د شریک راکړه/ورکړه";
    case "daily_cash":
      return "روزنامچه";
    default:
      return "اصلاحي ثبت";
  }
}

const REPORT_RECEIPT_DETAIL_PREFIX = "د پیسو رسید - ";
const REPORT_RECEIPT_KIND_LABELS = ["تجري", "صراف", "بانک"];
const REPORT_CUSTOMER_BILL_PREFIX_PATTERN = /^\s*-?\s*د\s+(?:مشتری|مشتري)\s+بیل\s+(?:نمبر|شمېره|شماره)\s*[:：]?\s*[^-]*(?:\s+-\s*)?/u;
const REPORT_EXCHANGE_LEDGER_PREFIX_PATTERN = /^\s*صرافي\s*-\s*(?:صراف ته جمع|د صرافی له طرفه رسیده ګی دفتر ته)\s*(?:-\s*)?/u;

function reportStripGeneratedLedgerDetail(value: string): string {
  let text = value.trim();
  text = text.replace(/\s+-\s+د شرکت بیل نمبر:\s*.+$/u, "").trim();
  if (text.startsWith(REPORT_RECEIPT_DETAIL_PREFIX)) text = text.slice(REPORT_RECEIPT_DETAIL_PREFIX.length).trim();
  for (const label of REPORT_RECEIPT_KIND_LABELS) {
    if (text === label) return "";
    const prefix = `${label} - `;
    if (text.startsWith(prefix)) {
      text = text.slice(prefix.length).trim();
      break;
    }
  }
  text = text.replace(/^\s*بازار\/انفرادي\s+[^-]+(?:\s+-\s+د مشتری بیل نمبر:\s*[^-]*)?(?:\s+-\s*)?/u, "");
  text = text.replace(/^\s*بازار\/انفرادي\s+[^-]+(?:\s+-\s+د مشتري بیل نمبر:\s*[^-]*)?(?:\s+-\s*)?/u, "");
  text = text.replace(REPORT_EXCHANGE_LEDGER_PREFIX_PATTERN, "");
  text = text.replace(REPORT_CUSTOMER_BILL_PREFIX_PATTERN, "");
  text = text.replace(/^\s*-\s*/u, "");
  return text.trim();
}

function reportUserDetail(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  return reportStripGeneratedLedgerDetail(value) || null;
}

async function reportSourceUserDetail(sourceModule: string | null | undefined, sourceId: number | null | undefined): Promise<string | null> {
  if (!sourceModule || !sourceId) return null;
  switch (sourceModule) {
    case "purchase": {
      const row = await Purchase.findByPk(sourceId);
      return reportUserDetail(row?.notes);
    }
    case "purchase_payment": {
      const row = await PurchasePayment.findByPk(sourceId);
      return reportUserDetail(row?.note);
    }
    case "purchase_return": {
      const row = await PurchaseReturn.findByPk(sourceId);
      return reportUserDetail(row?.reason);
    }
    case "sale": {
      const row = await Sale.findByPk(sourceId);
      return reportUserDetail(row?.notes);
    }
    case "sale_receipt": {
      const row = await SaleReceipt.findByPk(sourceId);
      return reportUserDetail(row?.note);
    }
    case "rental": {
      const row = await Rental.findByPk(sourceId);
      return reportUserDetail(row?.notes);
    }
    case "rental_receipt": {
      const row = await RentalReceipt.findByPk(sourceId);
      return reportUserDetail(row?.note);
    }
    case "expense": {
      const row = await Expense.findByPk(sourceId);
      return reportUserDetail(row?.description);
    }
    case "exchange": {
      const row = await ExchangeTransaction.findByPk(sourceId);
      return reportUserDetail(row?.notes);
    }
    case "employee_payment": {
      const row = await EmployeePayment.findByPk(sourceId);
      return reportUserDetail(row?.note);
    }
    case "partner_transaction": {
      const row = await PartnerTransaction.findByPk(sourceId);
      return reportUserDetail(row?.note);
    }
    case "daily_cash": {
      const row = await DailyCashEntry.findByPk(sourceId);
      return reportUserDetail(row?.description);
    }
    default:
      return null;
  }
}

function reportLedgerUrl(line: JournalLine): string {
  if (!line.partyId) return "/reports/general";
  if (line.partyType === "employee") return `/employees/${line.partyId}`;
  if (line.partyType === "partner") return `/haji-ledger/${line.partyId}`;
  return `/parties/${line.partyId}`;
}

function reportLedgerNetSign(line: JournalLine): Decimal {
  const amount = new Decimal(line.amount);
  if (line.partyType === "supplier" || line.partyType === "employee" || line.partyType === "partner") {
    return line.direction === "credit" ? amount : amount.negated();
  }
  return line.direction === "debit" ? amount : amount.negated();
}

function reportLedgerDebtSummary(lines: JournalLine[]): { owedToCompany: Record<string, string>; owedByCompany: Record<string, string> } {
  const balances = new Map<string, { currencyCode: string; partyType: string | null; balance: Decimal }>();
  for (const line of lines) {
    if (!line.partyId || !line.partyType) continue;
    const key = `${line.partyType}:${line.partyId}:${line.currencyCode}`;
    const current = balances.get(key) ?? { currencyCode: line.currencyCode, partyType: line.partyType, balance: new Decimal(0) };
    current.balance = current.balance.plus(reportLedgerNetSign(line));
    balances.set(key, current);
  }

  const owedToCompany: Record<string, Decimal> = {};
  const owedByCompany: Record<string, Decimal> = {};
  for (const row of balances.values()) {
    if (row.balance.isZero()) continue;
    const companyOwes = row.partyType === "supplier" || row.partyType === "employee" || row.partyType === "partner";
    if (row.balance.greaterThan(0)) {
      const target = companyOwes ? owedByCompany : owedToCompany;
      target[row.currencyCode] = (target[row.currencyCode] ?? new Decimal(0)).plus(row.balance.abs());
    } else {
      const target = companyOwes ? owedToCompany : owedByCompany;
      target[row.currencyCode] = (target[row.currencyCode] ?? new Decimal(0)).plus(row.balance.abs());
    }
  }

  const currencies = new Set([
    ...lines.map((line) => line.currencyCode),
    ...Object.keys(owedToCompany),
    ...Object.keys(owedByCompany),
  ]);

  return {
    owedToCompany: Object.fromEntries(Array.from(currencies).map((currency) => [currency, (owedToCompany[currency] ?? new Decimal(0)).toFixed()])),
    owedByCompany: Object.fromEntries(Array.from(currencies).map((currency) => [currency, (owedByCompany[currency] ?? new Decimal(0)).toFixed()])),
  };
}

function reportLedgerDirectionTotals(lines: JournalLine[]): { debit: Record<string, string>; credit: Record<string, string> } {
  const debit: Record<string, Decimal> = {};
  const credit: Record<string, Decimal> = {};
  for (const line of lines) {
    const target = line.direction === "debit" ? debit : credit;
    target[line.currencyCode] = (target[line.currencyCode] ?? new Decimal(0)).plus(line.amount);
  }
  return {
    debit: Object.fromEntries(Object.entries(debit).map(([currency, amount]) => [currency, amount.toFixed()])),
    credit: Object.fromEntries(Object.entries(credit).map(([currency, amount]) => [currency, amount.toFixed()])),
  };
}

function reportLedgerLineDescription(line: JournalLine): string {
  const joined = line.toJSON() as { transaction?: { memo?: string | null } };
  return line.description ?? joined.transaction?.memo ?? "";
}

function normalizeLedgerPashtoText(value: string): string {
  return value.replace(/ي/g, "ی").replace(/ك/g, "ک").trim();
}

function reportIsMarketTransactionLine(line: JournalLine): boolean {
  const text = normalizeLedgerPashtoText(reportLedgerLineDescription(line));
  return text.startsWith("بازار/انفرادي ") || text.startsWith("بازار/انفرادی ");
}

function reportIsMarketBalanceDecreaseLine(line: JournalLine): boolean {
  const text = normalizeLedgerPashtoText(reportLedgerLineDescription(line));
  return reportIsMarketTransactionLine(line) && (text.includes("واپسي") || text.includes("واپس"));
}

function reportIsMarketSettlementLine(line: JournalLine): boolean {
  return !reportIsMarketTransactionLine(line);
}

function decimalMapToRecord(map: Map<string, Decimal>, currencies: Iterable<string>): Record<string, string> {
  const output: Record<string, string> = {};
  for (const currency of currencies) {
    output[currency] = (map.get(currency) ?? new Decimal(0)).toFixed();
  }
  return output;
}

function reportMarketIndividualLedgerSummary(lines: JournalLine[]): Record<keyof GeneralReportCurrencySummary, Record<string, string>> {
  const totalAmount = new Map<string, Decimal>();
  const moneyReceived = new Map<string, Decimal>();
  const moneyPaid = new Map<string, Decimal>();
  const balance = new Map<string, Decimal>();
  const owedToCompany = new Map<string, Decimal>();
  const owedByCompany = new Map<string, Decimal>();
  const currencies = new Set(lines.map((line) => line.currencyCode));

  for (const line of lines) {
    const amount = new Decimal(line.amount);
    const currency = line.currencyCode;
    const currentBalance = balance.get(currency) ?? new Decimal(0);
    if (reportIsMarketSettlementLine(line)) {
      if (currentBalance.lessThan(0)) {
        moneyPaid.set(currency, (moneyPaid.get(currency) ?? new Decimal(0)).plus(amount));
        balance.set(currency, currentBalance.plus(amount));
      } else {
        moneyReceived.set(currency, (moneyReceived.get(currency) ?? new Decimal(0)).plus(amount));
        balance.set(currency, currentBalance.minus(amount));
      }
      continue;
    }
    if (reportIsMarketTransactionLine(line)) {
      totalAmount.set(currency, (totalAmount.get(currency) ?? new Decimal(0)).plus(amount));
      balance.set(currency, line.direction === "credit" ? currentBalance.minus(amount) : currentBalance.plus(amount));
      continue;
    }
    if (reportIsMarketBalanceDecreaseLine(line)) {
      balance.set(currency, currentBalance.minus(amount.abs()));
      continue;
    }
    totalAmount.set(currency, (totalAmount.get(currency) ?? new Decimal(0)).plus(amount));
    balance.set(currency, currentBalance.plus(amount));
  }

  for (const [currency, amount] of balance.entries()) {
    if (amount.greaterThan(0)) owedToCompany.set(currency, amount.abs());
    else if (amount.lessThan(0)) owedByCompany.set(currency, amount.abs());
    currencies.add(currency);
  }

  return {
    totalAmount: decimalMapToRecord(totalAmount, currencies),
    moneyReceived: decimalMapToRecord(moneyReceived, currencies),
    moneyPaid: decimalMapToRecord(moneyPaid, currencies),
    owedToCompany: decimalMapToRecord(owedToCompany, currencies),
    owedByCompany: decimalMapToRecord(owedByCompany, currencies),
  };
}

type ReportActiveSourceModel = { id: number };

async function reportDeletedSourceTransactionIds(links: PostingLink[]): Promise<Set<number>> {
  const watchedModules = new Set([
    "daily_cash",
    "expense",
    "purchase",
    "purchase_payment",
    "purchase_return",
    "sale",
    "sale_receipt",
    "rental",
    "rental_receipt",
    "employee_payment",
    "partner",
    "partner_transaction",
    "exchange",
  ]);
  const idsByModule = new Map<string, Set<number>>();
  for (const link of links) {
    if (!watchedModules.has(link.sourceModule)) continue;
    const bucket = idsByModule.get(link.sourceModule) ?? new Set<number>();
    bucket.add(link.sourceId);
    idsByModule.set(link.sourceModule, bucket);
  }
  if (idsByModule.size === 0) return new Set();

  const sourceIds = (module: string): number[] => Array.from(idsByModule.get(module) ?? []);
  const activeKeys = new Set<string>();
  const addRows = (module: string, rows: ReportActiveSourceModel[]) => {
    for (const row of rows) activeKeys.add(`${module}:${row.id}`);
  };
  const tasks: Promise<void>[] = [];
  const addTask = (module: string, promise: Promise<unknown[]>) => {
    tasks.push(promise.then((rows) => addRows(module, rows as ReportActiveSourceModel[])));
  };

  const dailyCashIds = sourceIds("daily_cash");
  if (dailyCashIds.length) addTask("daily_cash", DailyCashEntry.findAll({ attributes: ["id"], where: { id: { [Op.in]: dailyCashIds }, voidedAt: null } }));

  const expenseIds = sourceIds("expense");
  if (expenseIds.length) addTask("expense", Expense.findAll({ attributes: ["id"], where: { id: { [Op.in]: expenseIds }, voidedAt: null } }));

  const purchaseIds = sourceIds("purchase");
  if (purchaseIds.length) addTask("purchase", Purchase.findAll({ attributes: ["id"], where: { id: { [Op.in]: purchaseIds }, status: { [Op.ne]: "cancelled" } } }));

  const purchasePaymentIds = sourceIds("purchase_payment");
  if (purchasePaymentIds.length) addTask("purchase_payment", PurchasePayment.findAll({ attributes: ["id"], where: { id: { [Op.in]: purchasePaymentIds }, voidedAt: null } }));

  const purchaseReturnIds = sourceIds("purchase_return");
  if (purchaseReturnIds.length) addTask("purchase_return", PurchaseReturn.findAll({ attributes: ["id"], where: { id: { [Op.in]: purchaseReturnIds } } }));

  const saleIds = sourceIds("sale");
  if (saleIds.length) addTask("sale", Sale.findAll({ attributes: ["id"], where: { id: { [Op.in]: saleIds }, status: { [Op.notIn]: ["cancelled", "reversed"] } } }));

  const saleReceiptIds = sourceIds("sale_receipt");
  if (saleReceiptIds.length) addTask("sale_receipt", SaleReceipt.findAll({ attributes: ["id"], where: { id: { [Op.in]: saleReceiptIds }, voidedAt: null } }));

  const rentalIds = sourceIds("rental");
  if (rentalIds.length) addTask("rental", Rental.findAll({ attributes: ["id"], where: { id: { [Op.in]: rentalIds }, status: { [Op.ne]: "cancelled" } } }));

  const rentalReceiptIds = sourceIds("rental_receipt");
  if (rentalReceiptIds.length) addTask("rental_receipt", RentalReceipt.findAll({ attributes: ["id"], where: { id: { [Op.in]: rentalReceiptIds }, voidedAt: null } }));

  const employeePaymentIds = sourceIds("employee_payment");
  if (employeePaymentIds.length) addTask("employee_payment", EmployeePayment.findAll({ attributes: ["id"], where: { id: { [Op.in]: employeePaymentIds }, voidedAt: null } }));

  const partnerIds = sourceIds("partner");
  if (partnerIds.length) addTask("partner", Partner.findAll({ attributes: ["id"], where: { id: { [Op.in]: partnerIds } } }));

  const partnerTransactionIds = sourceIds("partner_transaction");
  if (partnerTransactionIds.length) addTask("partner_transaction", PartnerTransaction.findAll({ attributes: ["id"], where: { id: { [Op.in]: partnerTransactionIds } } }));

  const exchangeIds = sourceIds("exchange");
  if (exchangeIds.length) addTask("exchange", ExchangeTransaction.findAll({ attributes: ["id"], where: { id: { [Op.in]: exchangeIds } } }));

  await Promise.all(tasks);

  const deletedTransactionIds = new Set<number>();
  for (const link of links) {
    if (!watchedModules.has(link.sourceModule)) continue;
    if (!activeKeys.has(`${link.sourceModule}:${link.sourceId}`)) deletedTransactionIds.add(link.transactionId);
  }
  return deletedTransactionIds;
}

type LedgerReportEntry = { line: JournalLine; row: GeneralReportRow };

function reportLedgerTotalRows(entries: LedgerReportEntry[], endDate: string): GeneralReportRow[] {
  const totals = new Map<
    string,
    {
      line: JournalLine;
      party: string | null;
      itemName: string | null;
      currencyCode: string;
      debit: Decimal;
      credit: Decimal;
      balance: Decimal;
      sourceUrl: string | null;
    }
  >();

  for (const { line, row } of entries) {
    if (!line.partyId || !line.partyType) continue;
    const key = `${line.partyType}:${line.partyId}:${line.currencyCode}`;
    const current =
      totals.get(key) ??
      {
        line,
        party: row.party,
        itemName: row.itemName ?? reportPartyTypeLabel(line.partyType),
        currencyCode: line.currencyCode,
        debit: new Decimal(0),
        credit: new Decimal(0),
        balance: new Decimal(0),
        sourceUrl: row.sourceUrl ?? reportLedgerUrl(line),
      };
    const amount = new Decimal(line.amount);
    if (line.direction === "debit") current.debit = current.debit.plus(amount);
    else current.credit = current.credit.plus(amount);
    current.balance = current.balance.plus(reportLedgerNetSign(line));
    if (!current.party && row.party) current.party = row.party;
    totals.set(key, current);
  }

  return Array.from(totals.values())
    .map((entry) => {
      const companyOwes = entry.line.partyType === "supplier" || entry.line.partyType === "employee" || entry.line.partyType === "partner";
      let owedToCompany = "0";
      let owedByCompany = "0";
      if (entry.balance.greaterThan(0)) {
        if (companyOwes) owedByCompany = entry.balance.abs().toFixed();
        else owedToCompany = entry.balance.abs().toFixed();
      } else if (entry.balance.lessThan(0)) {
        if (companyOwes) owedToCompany = entry.balance.abs().toFixed();
        else owedByCompany = entry.balance.abs().toFixed();
      }

      return {
        date: endDate,
        reference: `${reportPartyTypeLabel(entry.line.partyType)} ${entry.line.partyId}`,
        party: entry.party,
        itemName: entry.itemName,
        quantity: null,
        currencyCode: entry.currencyCode,
        totalAmount: entry.balance.abs().toFixed(),
        moneyReceived: entry.credit.toFixed(),
        moneyPaid: entry.debit.toFixed(),
        owedToCompany,
        owedByCompany,
        sourceUrl: entry.sourceUrl,
        note: null,
      };
    })
    .sort((left, right) => `${left.party ?? ""} ${left.reference}`.localeCompare(`${right.party ?? ""} ${right.reference}`, "ps"));
}

function reportPartnerTransactionTypeLabel(type: string): string {
  switch (type) {
    case "investment":
      return "سرمایه";
    case "withdrawal":
      return "ایستل شوې پیسې";
    default:
      return "د شریک حساب";
  }
}

function reportEmployeePaymentTypeLabel(type: string): string {
  switch (type) {
    case "advance":
      return "پیشکي";
    case "salary":
      return "معاش";
    case "debt_repayment":
      return "د قرضداري تادیه";
    default:
      return "د کارکوونکي پیسې";
  }
}

function reportRangeForEmployeeLedger(startDate: string, endDate: string): { startDate?: string; endDate?: string } {
  return {
    ...(startDate !== "0001-01-01" ? { startDate } : {}),
    ...(endDate !== "9999-12-31" ? { endDate } : {}),
  };
}

function kafilDelegationUserName(delegation: Delegation): string {
  const joined = delegation.toJSON() as {
    delegatedUser?: { fullName?: string | null; username?: string | null };
  };
  return joined.delegatedUser?.fullName || joined.delegatedUser?.username || `Kafil ${delegation.delegatedUserId}`;
}

function kafilDelegationUsername(delegation: Delegation): string {
  const joined = delegation.toJSON() as {
    delegatedUser?: { username?: string | null };
  };
  return joined.delegatedUser?.username ?? "";
}

function serializeKafilDelegation(delegation: Delegation): KafilLedgerReport["delegation"] {
  return {
    id: delegation.id,
    delegatedUserId: delegation.delegatedUserId,
    delegatedUserName: kafilDelegationUserName(delegation),
    delegatedUsername: kafilDelegationUsername(delegation),
    startDate: delegation.startDate,
    endDate: delegation.endDate,
    reason: delegation.reason,
    isActive: delegation.isActive,
  };
}

function clampReportDateRange(startDate: string, endDate: string, rowStartDate: string, rowEndDate: string): { startDate: string; endDate: string } | null {
  const clampedStart = rowStartDate > startDate ? rowStartDate : startDate;
  const clampedEnd = rowEndDate < endDate ? rowEndDate : endDate;
  return clampedStart <= clampedEnd ? { startDate: clampedStart, endDate: clampedEnd } : null;
}

function isCashAccountLine(line: JournalLine, cashAccountIds: Set<number>): boolean {
  return cashAccountIds.has(line.accountId);
}

function isCompanyPayablePartyLine(line: JournalLine): boolean {
  return line.partyType === "supplier" || line.partyType === "employee" || line.partyType === "partner";
}

export async function getKafilLedgerReport(input: {
  delegationId?: number;
  startDate: string;
  endDate: string;
  currencyCode?: string;
  includeDelegationRows?: boolean;
}): Promise<KafilLedgerReport> {
  const currencyCode = input.currencyCode?.trim() || undefined;
  const delegationWhere: Record<string, unknown> = {
    delegatedRole: "kafil",
    startDate: { [Op.lte]: input.endDate },
    endDate: { [Op.gte]: input.startDate },
  };
  if (input.delegationId !== undefined) delegationWhere["id"] = input.delegationId;

  const delegations = await Delegation.findAll({
    where: delegationWhere,
    include: [{ model: User, as: "delegatedUser" }],
    order: [
      ["startDate", "ASC"],
      ["id", "ASC"],
    ],
  });

  const cashAccounts = await CashAccount.findAll();
  const cashAccountIds = new Set(cashAccounts.map((account) => account.accountId));
  if (cashAccountIds.size === 0) {
    const defaultCash = await Account.findOne({ where: { code: "1000" } });
    if (defaultCash) cashAccountIds.add(defaultCash.id);
  }

  const rows: GeneralReportRow[] = [];
  for (const delegation of delegations) {
    const activeRange = clampReportDateRange(input.startDate, input.endDate, delegation.startDate, delegation.endDate);
    if (!activeRange) continue;

    const transactions = await JournalTransaction.findAll({
      where: {
        createdByUserId: delegation.delegatedUserId,
        transactionDate: { [Op.gte]: activeRange.startDate, [Op.lte]: activeRange.endDate },
        voidedAt: null,
        reversalOfId: null,
      },
      include: [
        {
          model: JournalLine,
          as: "lines",
          required: true,
          where: currencyCode ? { currencyCode } : undefined,
          include: [{ model: Account, as: "account" }],
        },
      ],
      order: [["transactionDate", "ASC"], ["id", "ASC"]],
    });

    const transactionIds = transactions.map((transaction) => transaction.id);
    const links = transactionIds.length > 0
      ? await PostingLink.findAll({ where: { transactionId: { [Op.in]: transactionIds } } })
      : [];
    const deletedTransactionIds = await reportDeletedSourceTransactionIds(links);
    const linkByTransactionId = new Map<number, PostingLink>();
    for (const link of links) {
      if (!linkByTransactionId.has(link.transactionId)) linkByTransactionId.set(link.transactionId, link);
    }

    let visibleTransactionCount = 0;
    const delegatedUserName = kafilDelegationUserName(delegation);
    for (const transaction of transactions) {
      if (deletedTransactionIds.has(transaction.id)) continue;
      const lines = (transaction as unknown as { lines?: JournalLine[] }).lines ?? [];
      if (lines.length === 0) continue;
      visibleTransactionCount += 1;
      const source = linkByTransactionId.get(transaction.id);
      const sourceLabel = reportSourceLabel(source?.sourceModule);
      const sourceUrl = await transactionSourceUrl(source?.sourceModule, source?.sourceId, transaction.transactionDate);
      const userDetail = source
        ? await reportSourceUserDetail(source.sourceModule, source.sourceId)
        : reportUserDetail(transaction.memo);
      const currencyBuckets = new Map<
        string,
        {
          debitTotal: Decimal;
          moneyReceived: Decimal;
          moneyPaid: Decimal;
          owedToCompany: Decimal;
          owedByCompany: Decimal;
        }
      >();

      for (const line of lines) {
        const bucket = currencyBuckets.get(line.currencyCode) ?? {
          debitTotal: new Decimal(0),
          moneyReceived: new Decimal(0),
          moneyPaid: new Decimal(0),
          owedToCompany: new Decimal(0),
          owedByCompany: new Decimal(0),
        };
        const amount = new Decimal(line.amount);
        if (line.direction === "debit") bucket.debitTotal = bucket.debitTotal.plus(amount);
        if (isCashAccountLine(line, cashAccountIds)) {
          if (line.direction === "debit") bucket.moneyReceived = bucket.moneyReceived.plus(amount);
          else bucket.moneyPaid = bucket.moneyPaid.plus(amount);
        }
        if (line.partyId && line.partyType) {
          if (isCompanyPayablePartyLine(line)) {
            if (line.direction === "credit") bucket.owedByCompany = bucket.owedByCompany.plus(amount);
          } else if (line.direction === "debit") {
            bucket.owedToCompany = bucket.owedToCompany.plus(amount);
          }
        }
        currencyBuckets.set(line.currencyCode, bucket);
      }

      for (const [rowCurrency, bucket] of currencyBuckets.entries()) {
        rows.push({
          date: transaction.transactionDate,
          reference: `${sourceLabel}-${transaction.id}`,
          party: delegatedUserName,
          itemName: sourceLabel,
          quantity: null,
          currencyCode: rowCurrency,
          totalAmount: bucket.debitTotal.toFixed(),
          moneyReceived: bucket.moneyReceived.toFixed(),
          moneyPaid: bucket.moneyPaid.toFixed(),
          owedToCompany: bucket.owedToCompany.toFixed(),
          owedByCompany: bucket.owedByCompany.toFixed(),
          sourceUrl,
          note: userDetail,
        });
      }
    }

    if (input.includeDelegationRows && visibleTransactionCount === 0) {
      rows.push({
        date: activeRange.startDate,
        reference: `KAFIL-${delegation.id}`,
        party: delegatedUserName,
        itemName: delegation.isActive ? "فعال کفیل" : "غیر فعال کفیل",
        quantity: `${delegation.startDate} - ${delegation.endDate}`,
        currencyCode: currencyCode ?? "AFN",
        totalAmount: "0",
        moneyReceived: "0",
        moneyPaid: "0",
        owedToCompany: "0",
        owedByCompany: "0",
        sourceUrl: "/kafil",
        note: delegation.reason,
      });
    }
  }

  const summary = reportMakeSummary(rows);
  return {
    delegation: delegations.length === 1 ? serializeKafilDelegation(delegations[0]!) : null,
    rows,
    summary,
  };
}

async function getEmployeeReportRows(params: {
  workerType: "regular" | "misc";
  currencyCode?: string;
  startDate: string;
  endDate: string;
}): Promise<GeneralReportRow[]> {
  const employees = await Employee.findAll({
    where: {
      deletedAt: null,
      workerType: params.workerType,
      ...(params.currencyCode ? { currencyCode: params.currencyCode } : {}),
    },
    order: [["id", "ASC"]],
  });
  const range = reportRangeForEmployeeLedger(params.startDate, params.endDate);
  const reportDate = params.endDate === "9999-12-31" ? "" : params.endDate;

  return Promise.all(
    employees.map(async (employee) => {
      const totals = await getEmployeeLedgerTotals(employee, range);
      const balance = new Decimal(totals.balance);
      return {
        date: reportDate || employee.endDate || employee.startDate,
        reference: employee.employeeNumber,
        party: employee.name,
        itemName: employee.workerType === "misc" ? "متفرقه کاریګر" : employee.position,
        quantity: null,
        currencyCode: employee.currencyCode,
        totalAmount: totals.earnedTotal,
        moneyReceived: "0",
        moneyPaid: totals.paidTotal,
        // Employee balance is earned - paid:
        // positive means the company owes the employee, negative means the employee owes the company.
        owedToCompany: balance.lessThan(0) ? balance.abs().toFixed() : "0",
        owedByCompany: balance.greaterThan(0) ? balance.toFixed() : "0",
        sourceUrl: employee.workerType === "misc" ? "/misc-workers" : `/employees/${employee.id}`,
        note: reportUserDetail(employee.notes),
      };
    }),
  );
}

async function getReportExchangeRows(currencyCode: string | undefined, startDate: string, endDate: string): Promise<GeneralReportRow[]> {
  const { ExchangeTransaction } = await import("./models");
  const dateRange = { [Op.gte]: startDate, [Op.lte]: endDate };
  const rows = await ExchangeTransaction.findAll({
    where: {
      exchangeDate: dateRange,
      ...(currencyCode ? { [Op.or]: [{ currencyGiven: currencyCode }, { currencyReceived: currencyCode }] } : {}),
    },
    include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }],
  });
  return rows.flatMap((r) => {
    const party = (r as unknown as { party?: { name: string } }).party?.name ?? null;
    const base = {
      date: r.exchangeDate,
      reference: r.exchangeNumber,
      party,
      quantity: null,
      owedToCompany: "0",
      owedByCompany: "0",
      sourceUrl: "/exchange/transactions",
      note: reportUserDetail(r.notes),
    };
    const outgoing =
      !currencyCode || currencyCode === r.currencyGiven
        ? [
            {
              ...base,
              itemName: "ورکړل شوي اسعار",
              currencyCode: r.currencyGiven,
              totalAmount: r.amountGiven,
              moneyReceived: "0",
              moneyPaid: r.amountGiven,
            },
          ]
        : [];
    const incoming =
      !currencyCode || currencyCode === r.currencyReceived
        ? [
            {
              ...base,
              itemName: "ترلاسه شوي اسعار",
              currencyCode: r.currencyReceived,
              totalAmount: r.amountReceived,
              moneyReceived: r.amountReceived,
              moneyPaid: "0",
            },
          ]
        : [];
    return [...outgoing, ...incoming];
  });
}

export async function getGeneralReport(input: GeneralReportInput): Promise<GeneralReport> {
  const { startDate, endDate } = input;
  const currencyCode = input.currencyCode?.trim() || undefined;
  const dateRange = { [Op.gte]: startDate, [Op.lte]: endDate };
  const currencyWhere = currencyCode ? { currencyCode } : {};
  const activeSupplierInclude = { model: Party, as: "supplier" as const, where: { deletedAt: null }, required: true };

  let purchases = await Purchase.findAll({
    where: { ...currencyWhere, purchaseDate: dateRange, status: { [Op.notIn]: ["cancelled"] } },
    include: [activeSupplierInclude],
  });
  const voidedPurchaseSourceIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase",
    sourceIds: purchases.map((purchase) => purchase.id),
    postingType: "purchase_creation",
  });
  purchases = purchases.filter((purchase) => !voidedPurchaseSourceIds.has(purchase.id));
  const purchaseIds = purchases.map((p) => p.id);
  let purchasePayments =
    purchaseIds.length > 0
      ? await PurchasePayment.findAll({
          where: { ...currencyWhere, purchaseId: { [Op.in]: purchaseIds }, voidedAt: null },
          include: [{ model: Purchase, as: "purchase", required: true, include: [activeSupplierInclude] }],
        })
      : [];
  const voidedPurchasePaymentSourceIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_payment",
    sourceIds: purchasePayments.map((payment) => payment.id),
    postingType: "purchase_payment",
  });
  purchasePayments = purchasePayments.filter((payment) => !voidedPurchasePaymentSourceIds.has(payment.id));
  let purchaseReturns =
    purchaseIds.length > 0
      ? await PurchaseReturn.findAll({
          where: { ...currencyWhere, purchaseId: { [Op.in]: purchaseIds } },
          include: [{ model: Purchase, as: "purchase", required: true, include: [activeSupplierInclude] }],
        })
      : [];
  const voidedPurchaseReturnSourceIds = await findVoidedPostedSourceIds({
    sourceModule: "purchase_return",
    sourceIds: purchaseReturns.map((ret) => ret.id),
    postingType: "purchase_return",
  });
  purchaseReturns = purchaseReturns.filter((ret) => !voidedPurchaseReturnSourceIds.has(ret.id));
  const purchasing: GeneralReportRow[] = [
    ...purchases.map((p) => ({
      date: p.purchaseDate,
      reference: p.purchaseNumber,
      party: (p as unknown as { supplier?: { name: string } }).supplier?.name ?? null,
      itemName: p.itemName,
      quantity: `${p.quantity}${p.unitOfMeasure ? ` ${p.unitOfMeasure}` : ""}`,
      currencyCode: p.currencyCode,
      totalAmount: p.totalAmount,
      moneyReceived: "0",
      moneyPaid: "0",
      owedToCompany: "0",
      owedByCompany: p.totalAmount,
      sourceUrl: `/purchases/${p.id}`,
      note: reportUserDetail(p.notes),
    })),
    ...purchasePayments.map((p) => {
      const purchase = (p as unknown as { purchase?: { supplier?: { name: string }; itemName?: string | null } }).purchase;
      return {
        date: p.paymentDate,
        reference: p.paymentNumber,
        party: purchase?.supplier?.name ?? null,
        itemName: purchase?.itemName ?? null,
        quantity: null,
        currencyCode: p.currencyCode,
        totalAmount: "0",
        moneyReceived: "0",
        moneyPaid: p.amount,
        owedToCompany: "0",
        owedByCompany: p.newBalance ?? "0",
        sourceUrl: `/purchases/${p.purchaseId}`,
        note: reportUserDetail(p.note),
      };
    }),
    ...purchaseReturns.map((r) => {
      const purchase = (r as unknown as { purchase?: { supplier?: { name: string } } }).purchase;
      return {
        date: r.returnDate,
        reference: r.returnNumber,
        party: purchase?.supplier?.name ?? null,
        itemName: r.returnedItemName,
        quantity: r.quantity,
        currencyCode: r.currencyCode,
        totalAmount: r.amount,
        moneyReceived: "0",
        moneyPaid: "0",
        owedToCompany: "0",
        owedByCompany: "0",
        sourceUrl: "/purchase-returns",
        note: reportUserDetail(r.reason),
      };
    }),
  ];
  const purchaseGross = reportSumByCurrency(purchases, (p) => p.currencyCode, (p) => p.totalAmount);
  const purchasePaid = reportSumByCurrency(purchasePayments, (p) => p.currencyCode, (p) => p.amount);
  const purchaseReturned = reportSumByCurrency(purchaseReturns, (r) => r.currencyCode, (r) => r.amount);
  const purchaseSettled = reportAddCurrencyMaps(purchasePaid, purchaseReturned);
  const purchaseBalance = reportAddCurrencyMaps(purchaseGross, -1, purchaseSettled);
  const purchaseCurrencies = new Set([...Object.keys(purchaseGross), ...Object.keys(purchaseSettled), ...Object.keys(purchaseBalance)]);
  const purchaseDebts = reportSplitDebtBySign(purchaseBalance, false);
  const purchaseItemMap = new Map<string, GeneralReportPurchaseItemSummary>();
  for (const purchase of purchases) {
    const key = `${purchase.itemName}::${purchase.unitOfMeasure ?? ""}::${purchase.currencyCode}`;
    const current = purchaseItemMap.get(key) ?? {
      itemName: purchase.itemName,
      quantity: "0",
      unitOfMeasure: purchase.unitOfMeasure ?? null,
      currencyCode: purchase.currencyCode,
      totalAmount: "0",
    };
    current.quantity = new Decimal(current.quantity).plus(purchase.quantity).toFixed();
    current.totalAmount = new Decimal(current.totalAmount).plus(purchase.totalAmount).toFixed();
    purchaseItemMap.set(key, current);
  }
  for (const ret of purchaseReturns) {
    const purchase = (ret as unknown as { purchase?: Purchase }).purchase;
    const unitOfMeasure = purchase?.unitOfMeasure ?? null;
    const key = `${ret.returnedItemName}::${unitOfMeasure ?? ""}::${ret.currencyCode}`;
    const current = purchaseItemMap.get(key) ?? {
      itemName: ret.returnedItemName,
      quantity: "0",
      unitOfMeasure,
      currencyCode: ret.currencyCode,
      totalAmount: "0",
    };
    current.quantity = new Decimal(current.quantity).minus(ret.quantity).toFixed();
    current.totalAmount = new Decimal(current.totalAmount).minus(ret.amount).toFixed();
    purchaseItemMap.set(key, current);
  }
  const purchaseItems = Array.from(purchaseItemMap.values()).sort((left, right) =>
    left.itemName.localeCompare(right.itemName, "ps"),
  );
  let purchasingSummary = reportMakeSummary(purchasing, {
    totalAmount: purchaseGross,
    moneyPaid: reportEnsureCurrencyKeys(purchaseSettled, purchaseCurrencies),
    owedToCompany: reportEnsureCurrencyKeys(purchaseDebts.owedToCompany, purchaseCurrencies),
    owedByCompany: reportEnsureCurrencyKeys(purchaseDebts.owedByCompany, purchaseCurrencies),
  });
  purchasingSummary = { ...purchasingSummary, rowCount: purchases.length };

  const expensesRows = await Expense.findAll({ where: { ...currencyWhere, expenseDate: dateRange, voidedAt: null } });
  const expenses: GeneralReportRow[] = expensesRows.map((e) => ({
    date: e.expenseDate,
    reference: e.expenseNumber,
    party: e.payeeName ?? null,
    itemName: e.categoryName ?? e.category,
    quantity: null,
    currencyCode: e.currencyCode,
    totalAmount: e.amount,
    moneyReceived: "0",
    moneyPaid: e.amount,
    owedToCompany: "0",
    owedByCompany: "0",
    sourceUrl: `/expenses?q=${encodeURIComponent(e.expenseNumber)}`,
    note: reportUserDetail(e.description),
  }));
  const expensesSummary = reportMakeSummary(expenses);

  const dailyCashRows = await DailyCashEntry.findAll({ where: { ...currencyWhere, entryDate: dateRange, voidedAt: null } });
  const deletedPartyIds = new Set(
    (await Party.findAll({ where: { deletedAt: { [Op.ne]: null } }, attributes: ["id"] })).map((party) => party.id),
  );
  const customerDailyRows = dailyCashRows.filter(
    (entry) =>
      ["supplier", "sales_customer", "exchange_dealer", "market_customer", "individual_customer"].includes(entry.targetType ?? "") &&
      !(entry.targetId !== null && deletedPartyIds.has(entry.targetId)),
  );
  let customers: GeneralReportRow[] = customerDailyRows.map((entry) => ({
    date: entry.entryDate,
    reference: `روزنامچه-${entry.id}`,
    party: entry.targetName ?? null,
    itemName: entry.targetType ?? entry.category,
    quantity: null,
    currencyCode: entry.currencyCode,
    totalAmount: entry.amount,
    moneyReceived: entry.entryType === "in" ? entry.amount : "0",
    moneyPaid: entry.entryType === "out" ? entry.amount : "0",
    owedToCompany: entry.entryType === "out" ? entry.amount : "0",
    owedByCompany: entry.entryType === "in" ? entry.amount : "0",
    sourceUrl: dailyCashTargetUrl(entry, entry.entryDate),
    note: reportUserDetail(entry.description),
  }));
  let customersSummary = reportMakeSummary(customers);

  const exchangeRows = await getReportExchangeRows(currencyCode, startDate, endDate);
  let exchangeSummary = reportMakeSummary(exchangeRows);

  const salesRows = await Sale.findAll({
    where: { ...currencyWhere, saleDate: dateRange, status: { [Op.notIn]: ["cancelled", "reversed"] } },
    include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }, reportUnitInclude()],
  });
  const saleIds = salesRows.map((s) => s.id);
  const saleReceiptRows =
    saleIds.length > 0
      ? await SaleReceipt.findAll({
          where: { ...currencyWhere, saleId: { [Op.in]: saleIds }, receiptDate: dateRange, voidedAt: null },
          include: [{ model: Sale, as: "sale", include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }, reportUnitInclude()] }],
        })
      : [];
  const propertySales: GeneralReportRow[] = [
    ...salesRows.map((s) => {
      const location = reportUnitLocation((s as unknown as { unit?: ReportUnitLocation }).unit);
      return {
        date: s.saleDate,
        reference: s.saleNumber,
        party: (s as unknown as { party?: { name: string } }).party?.name ?? null,
        itemName: location.label,
        quantity: "1",
        currencyCode: s.currencyCode,
        totalAmount: s.finalPrice,
        moneyReceived: "0",
        moneyPaid: "0",
        owedToCompany: s.finalPrice,
        owedByCompany: "0",
        ...location,
        sourceUrl: `/sales/${s.id}`,
        note: reportUserDetail(s.notes),
      };
    }),
    ...saleReceiptRows.map((r) => {
      const sale = (r as unknown as { sale?: { party?: { name: string }; unit?: ReportUnitLocation } }).sale;
      const location = reportUnitLocation(sale?.unit);
      return {
        date: r.receiptDate,
        reference: r.receiptNumber,
        party: sale?.party?.name ?? null,
        itemName: location.label,
        quantity: null,
        currencyCode: r.currencyCode,
        totalAmount: "0",
        moneyReceived: r.amount,
        moneyPaid: "0",
        owedToCompany: r.newBalance ?? "0",
        owedByCompany: "0",
        ...location,
        sourceUrl: `/sales/${r.saleId}`,
        note: reportUserDetail(r.note),
      };
    }),
  ];
  const salesGross = reportSumByCurrency(salesRows, (s) => s.currencyCode, (s) => s.finalPrice);
  const salesReceived = reportSumByCurrency(saleReceiptRows, (r) => r.currencyCode, (r) => r.amount);
  const salesDebts = reportSplitDebtBySign(reportAddCurrencyMaps(salesGross, -1, salesReceived), true);
  let propertySalesSummary = reportMakeSummary(propertySales, {
    totalAmount: salesGross,
    moneyReceived: salesReceived,
    owedToCompany: salesDebts.owedToCompany,
    owedByCompany: salesDebts.owedByCompany,
  });

  const rentalRows = await Rental.findAll({
    where: { ...currencyWhere, startDate: dateRange, status: { [Op.notIn]: ["cancelled"] } },
    include: [{ model: Party, as: "tenant", where: { deletedAt: null }, required: true }, reportUnitInclude()],
  });
  const rentalIds = rentalRows.map((r) => r.id);
  const rentalReceiptRows =
    rentalIds.length > 0
      ? await RentalReceipt.findAll({
          where: { ...currencyWhere, rentalId: { [Op.in]: rentalIds }, receiptDate: dateRange, voidedAt: null },
          include: [{ model: Rental, as: "rental", include: [{ model: Party, as: "tenant", where: { deletedAt: null }, required: true }, reportUnitInclude()] }],
        })
      : [];
  const rentals: GeneralReportRow[] = [
    ...rentalRows.map((r) => {
      const location = reportUnitLocation((r as unknown as { unit?: ReportUnitLocation }).unit);
      return {
        date: r.startDate,
        reference: r.rentalNumber,
        party: (r as unknown as { tenant?: { name: string } }).tenant?.name ?? null,
        itemName: location.label,
        quantity: r.frequency,
        currencyCode: r.currencyCode,
        totalAmount: r.rentAmount,
        moneyReceived: "0",
        moneyPaid: "0",
        owedToCompany: r.rentAmount,
        owedByCompany: "0",
        ...location,
        sourceUrl: `/rentals/${r.id}`,
        note: reportUserDetail(r.notes),
      };
    }),
    ...rentalReceiptRows.map((r) => {
      const rental = (r as unknown as { rental?: { tenant?: { name: string }; unit?: ReportUnitLocation } }).rental;
      const location = reportUnitLocation(rental?.unit);
      return {
        date: r.receiptDate,
        reference: r.receiptNumber,
        party: rental?.tenant?.name ?? null,
        itemName: location.label,
        quantity: null,
        currencyCode: r.currencyCode,
        totalAmount: "0",
        moneyReceived: r.amount,
        moneyPaid: "0",
        owedToCompany: r.newBalance ?? "0",
        owedByCompany: "0",
        ...location,
        sourceUrl: `/rentals/${r.rentalId}`,
        note: reportUserDetail(r.note),
      };
    }),
  ];
  const rentalGross = reportSumByCurrency(rentalRows, (r) => r.currencyCode, (r) => r.rentAmount);
  const rentalReceived = reportSumByCurrency(rentalReceiptRows, (r) => r.currencyCode, (r) => r.amount);
  const rentalDebts = reportSplitDebtBySign(reportAddCurrencyMaps(rentalGross, -1, rentalReceived), true);
  let rentalsSummary = reportMakeSummary(rentals, {
    totalAmount: rentalGross,
    moneyReceived: rentalReceived,
    owedToCompany: rentalDebts.owedToCompany,
    owedByCompany: rentalDebts.owedByCompany,
  });

  const employees = await getEmployeeReportRows({ workerType: "regular", currencyCode, startDate, endDate });
  const miscWorkers = await getEmployeeReportRows({ workerType: "misc", currencyCode, startDate, endDate });
  const employeesSummary = reportMakeSummary(employees);
  const miscWorkersSummary = reportMakeSummary(miscWorkers);

  const partnerTransactionRows = await PartnerTransaction.findAll({
    where: { ...currencyWhere, transactionDate: dateRange },
    include: [{ model: Partner, as: "partner", include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }] }],
  });
  const partners: GeneralReportRow[] = partnerTransactionRows.map((p) => {
    const partner = (p as unknown as { partner?: { party?: { name: string } } }).partner;
    const typeLabel = reportPartnerTransactionTypeLabel(p.type);
    return {
      date: p.transactionDate,
      reference: p.transactionNumber,
      party: partner?.party?.name ?? null,
      itemName: typeLabel,
      quantity: null,
      currencyCode: p.currencyCode,
      totalAmount: p.amount,
      moneyReceived: p.type === "investment" ? p.amount : "0",
      moneyPaid: p.type === "withdrawal" ? p.amount : "0",
      owedToCompany: "0",
      owedByCompany: p.newBalance ?? "0",
      sourceUrl: `/haji-ledger/${p.partnerId}`,
      note: reportUserDetail(p.note),
    };
  });
  const partnerInvestments = reportSumByCurrency(partnerTransactionRows.filter((p) => p.type === "investment"), (p) => p.currencyCode, (p) => p.amount);
  const partnerWithdrawals = reportSumByCurrency(partnerTransactionRows.filter((p) => p.type === "withdrawal"), (p) => p.currencyCode, (p) => p.amount);
  const partnerDebts = reportSplitDebtBySign(reportAddCurrencyMaps(partnerInvestments, -1, partnerWithdrawals), false);
  let partnersSummary = reportMakeSummary(partners, {
    totalAmount: partnerInvestments,
    moneyReceived: partnerInvestments,
    moneyPaid: partnerWithdrawals,
    owedToCompany: partnerDebts.owedToCompany,
    owedByCompany: partnerDebts.owedByCompany,
  });

  const journal: GeneralReportRow[] = dailyCashRows.map((entry) => ({
    date: entry.entryDate,
    reference: `روزنامچه-${entry.id}`,
    party: entry.targetName ?? null,
    itemName: entry.category,
    quantity: null,
    currencyCode: entry.currencyCode,
    totalAmount: entry.amount,
    moneyReceived: entry.entryType === "in" ? entry.amount : "0",
    moneyPaid: entry.entryType === "out" ? entry.amount : "0",
    owedToCompany: "0",
    owedByCompany: "0",
    sourceUrl: `/journal?date=${encodeURIComponent(entry.entryDate)}`,
    note: reportUserDetail(entry.description),
  }));
  const customerDailyIds = new Set(customerDailyRows.map((entry) => entry.id));
  const linkedEmployeeDailyIds = new Set(dailyCashRows.filter((entry) => entry.linkedEmployeePaymentId).map((entry) => entry.id));
  const journalRowsForGrand = journal.filter((row) => {
    const id = Number(row.reference.replace("روزنامچه-", ""));
    return !customerDailyIds.has(id) && !linkedEmployeeDailyIds.has(id);
  });
  const journalSummary = reportMakeSummary(journal);

  const ledgerLines = await JournalLine.findAll({
    where: {
      ...currencyWhere,
      partyType: { [Op.ne]: null },
      partyId: { [Op.ne]: null },
    },
    include: [
      { model: JournalTransaction, as: "transaction", where: { transactionDate: dateRange, voidedAt: null, reversalOfId: null } },
      { model: Account, as: "account" },
    ],
    order: [[{ model: JournalTransaction, as: "transaction" }, "transactionDate", "ASC"], ["id", "ASC"]],
  });
  const ledgerPartyIds = Array.from(
    new Set(
      ledgerLines
        .filter((line) => line.partyId && line.partyType !== "employee" && line.partyType !== "partner")
        .map((line) => line.partyId as number),
    ),
  );
  const ledgerEmployeeIds = Array.from(new Set(ledgerLines.filter((line) => line.partyType === "employee" && line.partyId).map((line) => line.partyId as number)));
  const ledgerPartnerIds = Array.from(new Set(ledgerLines.filter((line) => line.partyType === "partner" && line.partyId).map((line) => line.partyId as number)));
  const ledgerTransactionIds = Array.from(new Set(ledgerLines.map((line) => line.transactionId)));
  const [ledgerParties, ledgerEmployees, ledgerPartners, ledgerLinks] = await Promise.all([
    ledgerPartyIds.length ? Party.findAll({ where: { id: { [Op.in]: ledgerPartyIds }, deletedAt: null } }) : Promise.resolve([]),
    ledgerEmployeeIds.length ? Employee.findAll({ where: { id: { [Op.in]: ledgerEmployeeIds }, deletedAt: null } }) : Promise.resolve([]),
    ledgerPartnerIds.length
      ? Partner.findAll({ where: { id: { [Op.in]: ledgerPartnerIds }, status: "active" }, include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }] })
      : Promise.resolve([]),
    ledgerTransactionIds.length ? PostingLink.findAll({ where: { transactionId: { [Op.in]: ledgerTransactionIds } } }) : Promise.resolve([]),
  ]);
  const ledgerPartyById = new Map(ledgerParties.map((party) => [party.id, party.name]));
  const ledgerPartyModelById = new Map(ledgerParties.map((party) => [party.id, party]));
  const ledgerEmployeeById = new Map(ledgerEmployees.map((employee) => [employee.id, employee.name]));
  const ledgerPartnerById = new Map(
    ledgerPartners.map((partner) => [
      partner.id,
      (partner as unknown as { party?: { name?: string | null } }).party?.name ?? `شریک ${partner.id}`,
    ]),
  );
  const ledgerLinkByTransactionId = new Map<number, PostingLink>();
  for (const link of ledgerLinks) {
    if (!ledgerLinkByTransactionId.has(link.transactionId)) ledgerLinkByTransactionId.set(link.transactionId, link);
  }
  const deletedSourceTransactionIds = await reportDeletedSourceTransactionIds(ledgerLinks);
  const hasActiveLedgerParty = (line: JournalLine): boolean => {
    if (!line.partyId || !line.partyType) return true;
    if (line.partyType === "employee") return ledgerEmployeeById.has(line.partyId);
    if (line.partyType === "partner") return ledgerPartnerById.has(line.partyId);
    return ledgerPartyModelById.has(line.partyId);
  };
  const reportLedgerLines = ledgerLines.filter((line) => !deletedSourceTransactionIds.has(line.transactionId) && hasActiveLedgerParty(line));
  const ledgerSourceDetailByTransactionId = new Map<number, string | null>();
  await Promise.all(
    Array.from(ledgerLinkByTransactionId.values()).map(async (source) => {
      ledgerSourceDetailByTransactionId.set(source.transactionId, await reportSourceUserDetail(source.sourceModule, source.sourceId));
    }),
  );
  const ledgerRowsWithLines = reportLedgerLines.map((line) => {
    const joined = line.toJSON() as {
      transaction?: { transactionDate?: string | null; memo?: string | null };
      account?: { name?: string | null };
    };
    const partyName =
      line.partyType === "employee"
        ? ledgerEmployeeById.get(line.partyId ?? 0)
        : line.partyType === "partner"
          ? ledgerPartnerById.get(line.partyId ?? 0)
          : ledgerPartyById.get(line.partyId ?? 0);
    const source = ledgerLinkByTransactionId.get(line.transactionId);
    const sourceLabel = reportSourceLabel(source?.sourceModule);
    const userDetail = source
      ? ledgerSourceDetailByTransactionId.get(line.transactionId) ?? null
      : reportUserDetail(line.description) ?? reportUserDetail(joined.transaction?.memo);
    const companyOwes = line.partyType === "supplier" || line.partyType === "employee" || line.partyType === "partner";
    const row: GeneralReportRow = {
      date: joined.transaction?.transactionDate ?? "",
      reference: `${sourceLabel}-${line.id}`,
      party: partyName ?? null,
      itemName: `${reportPartyTypeLabel(line.partyType)}${joined.account?.name ? ` / ${joined.account.name}` : ""}`,
      quantity: null,
      currencyCode: line.currencyCode,
      totalAmount: companyOwes ? (line.direction === "credit" ? line.amount : "0") : line.direction === "debit" ? line.amount : "0",
      moneyReceived: !companyOwes && line.direction === "credit" ? line.amount : "0",
      moneyPaid: companyOwes && line.direction === "debit" ? line.amount : "0",
      owedToCompany: !companyOwes && line.direction === "debit" ? line.amount : "0",
      owedByCompany: companyOwes && line.direction === "credit" ? line.amount : "0",
      sourceUrl: reportLedgerUrl(line),
      note: userDetail,
    };
    return { line, row };
  });
  const ledger = reportLedgerTotalRows(ledgerRowsWithLines, endDate);
  const ledgerSummary = reportMakeSummary(ledger);
  const supplierLedgerLines = reportLedgerLines.filter((line) => line.partyType === "supplier");
  const supplierLedgerAmounts = reportLedgerDirectionTotals(supplierLedgerLines);
  const supplierLedgerDebts = reportLedgerDebtSummary(supplierLedgerLines);
  const supplierCurrencies = new Set([
    ...Object.keys(supplierLedgerAmounts.debit),
    ...Object.keys(supplierLedgerAmounts.credit),
    ...Object.keys(supplierLedgerDebts.owedToCompany),
    ...Object.keys(supplierLedgerDebts.owedByCompany),
  ]);
  purchasingSummary = {
    ...reportMakeSummary(purchasing, {
      totalAmount: reportEnsureCurrencyKeys(supplierLedgerAmounts.credit, supplierCurrencies),
      moneyReceived: reportEnsureCurrencyKeys({}, supplierCurrencies),
      moneyPaid: reportEnsureCurrencyKeys(supplierLedgerAmounts.debit, supplierCurrencies),
      owedToCompany: reportEnsureCurrencyKeys(supplierLedgerDebts.owedToCompany, supplierCurrencies),
      owedByCompany: reportEnsureCurrencyKeys(supplierLedgerDebts.owedByCompany, supplierCurrencies),
    }),
    rowCount: purchases.length,
  };
  const customerLedgerEntries = ledgerRowsWithLines.filter(({ line }) => ["customer", "supplier", "exchange_dealer"].includes(line.partyType ?? ""));
  customers = reportLedgerTotalRows(customerLedgerEntries, endDate);
  customersSummary = reportMakeSummary(customers);

  const isMarketIndividualCustomerLedgerLine = (line: JournalLine): boolean => {
    if (line.partyType !== "customer" || !line.partyId) return false;
    const partyType = ledgerPartyModelById.get(line.partyId)?.type;
    return partyType === "market_customer" || partyType === "individual_customer";
  };
  const marketIndividualCustomerLedgerEntries = ledgerRowsWithLines.filter(({ line }) => isMarketIndividualCustomerLedgerLine(line));
  const marketIndividualCustomerLedgerLines = reportLedgerLines.filter(isMarketIndividualCustomerLedgerLine);
  const marketIndividualCustomers = reportLedgerTotalRows(marketIndividualCustomerLedgerEntries, endDate);
  const marketIndividualCustomerLedgerSummary = reportMarketIndividualLedgerSummary(marketIndividualCustomerLedgerLines);
  const marketIndividualCustomerCurrencies = new Set([
    ...Object.keys(marketIndividualCustomerLedgerSummary.totalAmount),
    ...Object.keys(marketIndividualCustomerLedgerSummary.moneyReceived),
    ...Object.keys(marketIndividualCustomerLedgerSummary.moneyPaid),
    ...Object.keys(marketIndividualCustomerLedgerSummary.owedToCompany),
    ...Object.keys(marketIndividualCustomerLedgerSummary.owedByCompany),
  ]);
  const marketIndividualCustomersSummary = reportMakeSummary(marketIndividualCustomers, {
    totalAmount: reportEnsureCurrencyKeys(marketIndividualCustomerLedgerSummary.totalAmount, marketIndividualCustomerCurrencies),
    moneyReceived: reportEnsureCurrencyKeys(marketIndividualCustomerLedgerSummary.moneyReceived, marketIndividualCustomerCurrencies),
    moneyPaid: reportEnsureCurrencyKeys(marketIndividualCustomerLedgerSummary.moneyPaid, marketIndividualCustomerCurrencies),
    owedToCompany: reportEnsureCurrencyKeys(marketIndividualCustomerLedgerSummary.owedToCompany, marketIndividualCustomerCurrencies),
    owedByCompany: reportEnsureCurrencyKeys(marketIndividualCustomerLedgerSummary.owedByCompany, marketIndividualCustomerCurrencies),
  });

  const salesCustomerLedgerLines = reportLedgerLines.filter(
    (line) => line.partyType === "customer" && line.partyId && ledgerPartyModelById.get(line.partyId)?.type === "sales_customer",
  );
  const salesCustomerLedgerAmounts = reportLedgerDirectionTotals(salesCustomerLedgerLines);
  const salesCustomerLedgerDebts = reportLedgerDebtSummary(salesCustomerLedgerLines);
  propertySalesSummary = reportMakeSummary(propertySales, {
    totalAmount: salesCustomerLedgerAmounts.debit,
    moneyReceived: salesCustomerLedgerAmounts.credit,
    owedToCompany: salesCustomerLedgerDebts.owedToCompany,
    owedByCompany: salesCustomerLedgerDebts.owedByCompany,
  });

  const exchangeLedgerLines = reportLedgerLines.filter((line) => line.partyType === "exchange_dealer");
  const exchangeLedgerEntries = ledgerRowsWithLines.filter(({ line }) => line.partyType === "exchange_dealer");
  const exchangeLedgerRows = reportLedgerTotalRows(exchangeLedgerEntries, endDate);
  const exchangeLedgerAmounts = reportLedgerDirectionTotals(exchangeLedgerLines);
  const exchangeLedgerDebts = reportLedgerDebtSummary(exchangeLedgerLines);
  const exchangeCurrencies = new Set([
    ...Object.keys(exchangeLedgerAmounts.debit),
    ...Object.keys(exchangeLedgerAmounts.credit),
    ...Object.keys(exchangeLedgerDebts.owedToCompany),
    ...Object.keys(exchangeLedgerDebts.owedByCompany),
  ]);
  exchangeSummary = reportMakeSummary(exchangeLedgerRows, {
    totalAmount: reportEnsureCurrencyKeys(exchangeLedgerAmounts.debit, exchangeCurrencies),
    moneyReceived: reportEnsureCurrencyKeys(exchangeLedgerAmounts.credit, exchangeCurrencies),
    moneyPaid: reportEnsureCurrencyKeys({}, exchangeCurrencies),
    owedToCompany: reportEnsureCurrencyKeys(exchangeLedgerDebts.owedToCompany, exchangeCurrencies),
    owedByCompany: reportEnsureCurrencyKeys(exchangeLedgerDebts.owedByCompany, exchangeCurrencies),
  });

  const rentalLedgerLines = reportLedgerLines.filter((line) => line.partyType === "tenant");
  const rentalLedgerAmounts = reportLedgerDirectionTotals(rentalLedgerLines);
  const rentalLedgerDebts = reportLedgerDebtSummary(rentalLedgerLines);
  rentalsSummary = reportMakeSummary(rentals, {
    totalAmount: rentalLedgerAmounts.debit,
    moneyReceived: rentalLedgerAmounts.credit,
    owedToCompany: rentalLedgerDebts.owedToCompany,
    owedByCompany: rentalLedgerDebts.owedByCompany,
  });

  const partnerLedgerLines = reportLedgerLines.filter((line) => line.partyType === "partner");
  const partnerLedgerAmounts = reportLedgerDirectionTotals(partnerLedgerLines);
  const partnerLedgerDebts = reportLedgerDebtSummary(partnerLedgerLines);
  partnersSummary = reportMakeSummary(partners, {
    totalAmount: partnerLedgerAmounts.credit,
    moneyReceived: partnerLedgerAmounts.credit,
    moneyPaid: partnerLedgerAmounts.debit,
    owedToCompany: partnerLedgerDebts.owedToCompany,
    owedByCompany: partnerLedgerDebts.owedByCompany,
  });

  const kafilReport = await getKafilLedgerReport({
    startDate,
    endDate,
    currencyCode,
    includeDelegationRows: true,
  });
  const kafil = kafilReport.rows;
  const kafilSummary = kafilReport.summary;

  const projects = await getProjectStructureReport();
  const remainingUnits = await Unit.findAll({
    where: { status: { [Op.in]: ["available", "draft", "reserved"] } },
    include: [activeDashboardFloorInclude()],
  });
  const soldLocations = Array.from(
    new Set(
      salesRows
        .map((sale) => {
          const location = reportUnitLocation((sale as unknown as { unit?: ReportUnitLocation }).unit);
          const parts = [location.blockName, location.floorName].filter(Boolean);
          return parts.length > 0 ? parts.join(" / ") : null;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const remainingLocations = Array.from(
    new Set(
      remainingUnits
        .map((unit) => {
          const location = reportUnitLocation(unit as unknown as ReportUnitLocation);
          const parts = [location.blockName, location.floorName].filter(Boolean);
          return parts.length > 0 ? parts.join(" / ") : null;
        })
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const sectionSummaries: Record<string, GeneralReportSectionSummary> = {
    purchasing: purchasingSummary,
    expenses: expensesSummary,
    customers: customersSummary,
    marketIndividualCustomers: marketIndividualCustomersSummary,
    exchange: exchangeSummary,
    propertySales: propertySalesSummary,
    rentals: rentalsSummary,
    employees: employeesSummary,
    miscWorkers: miscWorkersSummary,
    kafil: kafilSummary,
    partners: partnersSummary,
    journal: journalSummary,
    ledger: ledgerSummary,
  };
  const grandTransactionSummary = reportCombineSummaries([
    purchasingSummary,
    expensesSummary,
    exchangeSummary,
    propertySalesSummary,
    marketIndividualCustomersSummary,
    rentalsSummary,
    employeesSummary,
    miscWorkersSummary,
    partnersSummary,
    reportMakeSummary(journalRowsForGrand),
  ]);
  const grandSummary = grandTransactionSummary;

  return {
    currencyCode: currencyCode ?? null,
    startDate,
    endDate,
    purchasing,
    expenses,
    customers,
    marketIndividualCustomers,
    exchange: exchangeRows,
    propertySales,
    rentals,
    employees,
    miscWorkers,
    kafil,
    partners,
    journal,
    ledger,
    purchaseItems,
    purchaseItemTotalsByCurrency: reportAddCurrencyMaps(purchaseGross, -1, purchaseReturned),
    projects,
    sectionSummaries,
    salesSummary: {
      soldCount: salesRows.length,
      remainingCount: remainingUnits.length,
      soldLocations,
      remainingLocations,
      totalSoldByCurrency: salesGross,
      receivedByCurrency: salesReceived,
      customerDebtByCurrency: salesDebts.owedToCompany,
    },
    grandSummary,
  };
}

/**
 * The eight-section general company report (section S of the brief): purchasing, expenses,
 * customers, exchange, property sales, rentals, employees, projects — each filterable by
 * date range and currency and reconcilable against the module it summarizes (every row here
 * is read directly from that module's own table, not re-derived from the journal).
 */
async function getLegacyGeneralReport(input: { currencyCode: string; startDate: string; endDate: string }): Promise<unknown> {
  const { currencyCode, startDate, endDate } = input;
  const dateRange = { [Op.gte]: startDate, [Op.lte]: endDate };

  const purchases = await Purchase.findAll({ where: { currencyCode, purchaseDate: dateRange }, include: [{ model: Party, as: "supplier" }] });
  const purchasing: LegacyGeneralReportRow[] = purchases.map((p) => ({
    date: p.purchaseDate,
    reference: p.purchaseNumber,
    party: (p as unknown as { supplier?: { name: string } }).supplier?.name ?? null,
    itemName: p.itemName,
    quantity: `${p.quantity}${p.unitOfMeasure ? ` ${p.unitOfMeasure}` : ""}`,
    moneyReceived: "0",
    moneyPaid: p.totalAmount,
    owedToCompany: "0",
    owedByCompany: p.totalAmount,
    note: reportUserDetail(p.notes),
  }));

  const expensesRows = await Expense.findAll({ where: { currencyCode, expenseDate: dateRange, voidedAt: null } });
  const expenses: LegacyGeneralReportRow[] = expensesRows.map((e) => ({
    date: e.expenseDate,
    reference: e.expenseNumber,
    party: e.payeeName ?? null,
    moneyReceived: "0",
    moneyPaid: e.amount,
    owedToCompany: "0",
    owedByCompany: "0",
    note: reportUserDetail(e.description),
  }));

  const saleReceiptRows = await SaleReceipt.findAll({
    where: { currencyCode, receiptDate: dateRange, voidedAt: null },
    include: [{ model: Sale, as: "sale", include: [{ model: Party, as: "party" }] }],
  });
  const customers: LegacyGeneralReportRow[] = saleReceiptRows.map((r) => {
    const sale = (r as unknown as { sale?: { party?: { name: string }; finalPrice: string } }).sale;
    return {
      date: r.receiptDate,
      reference: r.receiptNumber,
      party: sale?.party?.name ?? null,
      moneyReceived: r.amount,
      moneyPaid: "0",
      owedToCompany: r.newBalance ?? "0",
      owedByCompany: "0",
      note: null,
    };
  });

  const exchangeRows = await getLegacyExchangeRowsForReport(currencyCode, startDate, endDate);

  const salesRows = await Sale.findAll({ where: { currencyCode, saleDate: dateRange }, include: [{ model: Party, as: "party" }] });
  const propertySales: LegacyGeneralReportRow[] = salesRows.map((s) => ({
    date: s.saleDate,
    reference: s.saleNumber,
    party: (s as unknown as { party?: { name: string } }).party?.name ?? null,
    moneyReceived: "0",
    moneyPaid: "0",
    owedToCompany: s.finalPrice,
    owedByCompany: "0",
    note: reportUserDetail(s.notes),
  }));

  const rentalRows = await Rental.findAll({ where: { currencyCode, startDate: dateRange }, include: [{ model: Party, as: "tenant" }] });
  const rentals: LegacyGeneralReportRow[] = rentalRows.map((r) => ({
    date: r.startDate,
    reference: r.rentalNumber,
    party: (r as unknown as { tenant?: { name: string } }).tenant?.name ?? null,
    moneyReceived: "0",
    moneyPaid: "0",
    owedToCompany: r.rentAmount,
    owedByCompany: "0",
    note: reportUserDetail(r.notes),
  }));

  const employeePaymentRows = await EmployeePayment.findAll({
    where: { currencyCode, paymentDate: dateRange, voidedAt: null },
    include: [{ model: Employee, as: "employee" }],
  });
  const employees: LegacyGeneralReportRow[] = employeePaymentRows.map((p) => ({
    date: p.paymentDate,
    reference: p.paymentNumber,
    party: (p as unknown as { employee?: { name: string } }).employee?.name ?? null,
    moneyReceived: "0",
    moneyPaid: p.amount,
    owedToCompany: "0",
    owedByCompany: p.newBalance ?? "0",
    note: reportUserDetail(p.note),
  }));

  const partnerTransactionRows = await PartnerTransaction.findAll({
    where: { currencyCode, transactionDate: dateRange },
    include: [{ model: Partner, as: "partner", include: [{ model: Party, as: "party" }] }],
  });
  const partners: LegacyGeneralReportRow[] = partnerTransactionRows.map((p) => {
    const partner = (p as unknown as { partner?: { party?: { name: string } } }).partner;
    return {
      date: p.transactionDate,
      reference: p.transactionNumber,
      party: partner?.party?.name ?? null,
      moneyReceived: p.type === "investment" ? p.amount : "0",
      moneyPaid: p.type === "withdrawal" ? p.amount : "0",
      owedToCompany: "0",
      owedByCompany: p.newBalance ?? "0",
      note: reportUserDetail(p.note),
    };
  });

  const projects = await getProjectStructureReport();

  return { currencyCode, startDate, endDate, purchasing, expenses, customers, exchange: exchangeRows, propertySales, rentals, employees, partners, projects };
}

async function getLegacyExchangeRowsForReport(currencyCode: string, startDate: string, endDate: string): Promise<LegacyGeneralReportRow[]> {
  const { ExchangeTransaction } = await import("./models");
  const dateRange = { [Op.gte]: startDate, [Op.lte]: endDate };
  const rows = await ExchangeTransaction.findAll({
    where: {
      exchangeDate: dateRange,
      [Op.or]: [{ currencyGiven: currencyCode }, { currencyReceived: currencyCode }],
    },
    include: [{ model: Party, as: "party" }],
  });
  return rows.map((r) => ({
    date: r.exchangeDate,
    reference: r.exchangeNumber,
    party: (r as unknown as { party?: { name: string } }).party?.name ?? null,
    moneyReceived: r.currencyReceived === currencyCode ? r.amountReceived : "0",
    moneyPaid: r.currencyGiven === currencyCode ? r.amountGiven : "0",
    owedToCompany: "0",
    owedByCompany: "0",
    note: reportUserDetail(r.notes),
  }));
}

async function getProjectStructureReport(): Promise<ProjectStructureRow[]> {
  const { Project } = await import("./models");
  const projects = await Project.findAll({ where: { deletedAt: null } });
  const rows: ProjectStructureRow[] = [];
  for (const project of projects) {
    const blocks = await Block.findAll({ where: { projectId: project.id } });
    const blockIds = blocks.map((b) => b.id);
    const floors = blockIds.length > 0 ? await Floor.findAll({ where: { blockId: { [Op.in]: blockIds } } }) : [];
    const floorIds = floors.map((f) => f.id);
    const units = floorIds.length > 0 ? await Unit.findAll({ where: { floorId: { [Op.in]: floorIds } } }) : [];
    const byStatus = (status: string) => units.filter((u) => u.status === status).length;
    rows.push({
      projectId: project.id,
      projectName: project.name,
      blocks: blocks.length,
      floors: floors.length,
      totalProperties: units.length,
      available: byStatus("available"),
      reserved: byStatus("reserved"),
      sold: byStatus("sold"),
      rented: byStatus("rented"),
      unavailable: byStatus("blocked") + byStatus("cancelled") + byStatus("inactive") + byStatus("draft"),
    });
  }
  return rows;
}

/**
 * Profit & loss for one currency over a date range, computed directly from each module's own
 * records (Sale/Rental/Expense/Purchase/EmployeePayment/PartnerTransaction) rather than by
 * re-deriving it from shared journal accounts — this avoids ambiguity where Purchases and
 * Expenses both post to the same general expense account (5000), and keeps the report trivially
 * reconcilable against each module's own totals. Partner withdrawals are shown for visibility
 * but are excluded from the profit/loss calculation itself (they are an equity movement, not a
 * cost of doing business).
 */
export async function getProfitAndLoss(input: ProfitLossInput): Promise<ProfitLossReport> {
  const { currencyCode, startDate, endDate } = input;
  const dateRange = { [Op.gte]: startDate, [Op.lte]: endDate };

  const sales = await Sale.findAll({
    where: { currencyCode, saleDate: dateRange, status: { [Op.notIn]: ["cancelled", "reversed"] } },
    include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }],
  });
  const rentals = await Rental.findAll({
    where: { currencyCode, startDate: dateRange, status: { [Op.notIn]: ["cancelled"] } },
    include: [{ model: Party, as: "tenant", where: { deletedAt: null }, required: true }],
  });
  const expenses = await Expense.findAll({ where: { currencyCode, expenseDate: dateRange, voidedAt: null } });
  const purchases = await Purchase.findAll({
    where: { currencyCode, purchaseDate: dateRange, status: { [Op.notIn]: ["cancelled"] } },
    include: [{ model: Party, as: "supplier", where: { deletedAt: null }, required: true }],
  });
  const purchaseReturns = await PurchaseReturn.findAll({
    where: { currencyCode, returnDate: dateRange },
    include: [
      {
        model: Purchase,
        as: "purchase",
        where: { currencyCode, status: { [Op.ne]: "cancelled" } },
        required: true,
        include: [{ model: Party, as: "supplier", where: { deletedAt: null }, required: true }],
      },
    ],
  });
  const employeePayments = await EmployeePayment.findAll({
    where: { currencyCode, paymentDate: dateRange, voidedAt: null },
    include: [{ model: Employee, as: "employee", where: { deletedAt: null }, required: true }],
  });
  const partnerWithdrawals = await PartnerTransaction.findAll({
    where: { currencyCode, transactionDate: dateRange, type: "withdrawal" },
    include: [{ model: Partner, as: "partner", required: true, include: [{ model: Party, as: "party", where: { deletedAt: null }, required: true }] }],
  });

  const propertySaleIncome = await sumDecimal(sales, (s) => s.finalPrice);
  const rentalIncome = await sumDecimal(rentals, (r) => r.rentAmount);
  const otherIncome = new Decimal(0);
  const totalIncome = propertySaleIncome.plus(rentalIncome).plus(otherIncome);

  const purchasesGross = await sumDecimal(purchases, (p) => p.totalAmount);
  const purchaseReturnsTotal = await sumDecimal(purchaseReturns, (r) => r.amount);
  const purchasesNet = purchasesGross.minus(purchaseReturnsTotal);
  const expensesTotal = await sumDecimal(expenses, (e) => e.amount);
  const employeeCosts = await sumDecimal(employeePayments, (p) => p.amount);
  const totalOutflow = purchasesNet.plus(expensesTotal).plus(employeeCosts);

  const partnerWithdrawalsTotal = await sumDecimal(partnerWithdrawals, (p) => p.amount);

  const cashAccounts = await CashAccount.findAll({ where: { currencyCode } });
  const accountIds = cashAccounts.map((c) => c.accountId);
  let availableBalance = new Decimal(0);
  if (accountIds.length > 0) {
    const lines = await JournalLine.findAll({ where: { accountId: { [Op.in]: accountIds }, currencyCode } });
    for (const line of lines) {
      const amount = new Decimal(line.amount);
      availableBalance = line.direction === "debit" ? availableBalance.plus(amount) : availableBalance.minus(amount);
    }
  }

  const net = totalIncome.minus(totalOutflow);
  const profit = net.greaterThan(0) ? net : new Decimal(0);
  const loss = net.lessThan(0) ? net.abs() : new Decimal(0);

  return {
    currencyCode,
    startDate,
    endDate,
    propertySaleIncome: propertySaleIncome.toFixed(),
    rentalIncome: rentalIncome.toFixed(),
    otherIncome: otherIncome.toFixed(),
    totalIncome: totalIncome.toFixed(),
    purchases: purchasesNet.toFixed(),
    expenses: expensesTotal.toFixed(),
    employeeCosts: employeeCosts.toFixed(),
    totalOutflow: totalOutflow.toFixed(),
    partnerWithdrawals: partnerWithdrawalsTotal.toFixed(),
    availableBalance: availableBalance.toFixed(),
    profit: profit.toFixed(),
    loss: loss.toFixed(),
  };
}
