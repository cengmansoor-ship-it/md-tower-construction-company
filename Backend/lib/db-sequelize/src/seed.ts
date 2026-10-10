import { sequelize } from "./connection";
import { User, Role, Permission, CompanySetting, Currency, DocumentSequence, UnitType, Account, CashAccount } from "./models";
import { hashPassword } from "./auth";
import { runMigrations } from "./migrations";

const CORE_PERMISSIONS = [
  { key: "dashboard.view", description: "د ډشبورډ لیدل" },
  { key: "journal.view", description: "د روزنامچې لیدل" },
  { key: "journal.manage", description: "د روزنامچې اداره" },
  { key: "accounting.manage", description: "د حسابونو اداره" },
  { key: "parties.view", description: "د مشتریانو لیدل" },
  { key: "parties.manage", description: "د مشتریانو اداره" },
  { key: "projects.view", description: "د پروژو لیدل" },
  { key: "projects.manage", description: "د پروژو اداره" },
  { key: "unit_types.manage", description: "د واحدونو ډولونه اداره" },
  { key: "sales.view", description: "د فروشاتو لیدل" },
  { key: "sales.manage", description: "د فروشاتو اداره" },
  { key: "rentals.view", description: "د کرایې لیدل" },
  { key: "rentals.manage", description: "د کرایې اداره" },
  { key: "purchases.view", description: "د اجناسو خریداري لیدل" },
  { key: "purchases.manage", description: "د اجناسو خریداري اداره" },
  { key: "expenses.view", description: "د مصارفاتو لیدل" },
  { key: "expenses.manage", description: "د مصارفاتو اداره" },
  { key: "exchange.view", description: "د صرافۍ لیدل" },
  { key: "exchange.manage", description: "د صرافۍ اداره" },
  { key: "partners.view", description: "د شریکانو لیدل" },
  { key: "partners.manage", description: "د شریکانو اداره" },
  { key: "haji_ledger.view", description: "د حاجي صاحب کهاتې لیدل" },
  { key: "haji_ledger.manage", description: "د حاجي صاحب کهاتې اداره" },
  { key: "employees.view", description: "د کارکوونکو لیدل" },
  { key: "employees.manage", description: "د کارکوونکو اداره" },
  { key: "attendance.view", description: "د حاضرۍ لیدل" },
  { key: "attendance.manage", description: "د حاضرۍ اداره" },
  { key: "hr.manage", description: "د کارکوونکو او حاضرۍ اداره" },
  { key: "cash_accounts.manage", description: "د صندوقونو اداره" },
  { key: "reports.view", description: "د راپورونو لیدل" },
  { key: "reports.print", description: "د راپورونو چاپ" },
  { key: "reports.export", description: "د راپورونو راایستل" },
  { key: "delegations.view", description: "د کفیل مدیریت لیدل" },
  { key: "delegations.manage", description: "د کفیل مدیریت اداره" },
  { key: "settings.view", description: "د عمومي تنظیماتو لیدل" },
  { key: "settings.manage", description: "د عمومي تنظیماتو اداره" },
  { key: "users.manage", description: "د کاروونکو اداره" },
  { key: "roles.manage", description: "د رولونو او واکونو اداره" },
  { key: "audit.view", description: "د بدلونونو راپور لیدل" },
  { key: "trash.view", description: "حذف شوي ریکارډونه لیدل" },
  { key: "trash.manage", description: "حذف شوي ریکارډونه اداره" },
];

const CORE_ROLES = [
  {
    name: "manager",
    description: "د شرکت عمومي مسوول",
    permissions: [
      "dashboard.view",
      "journal.view",
      "parties.view",
      "projects.view",
      "sales.view",
      "rentals.view",
      "purchases.view",
      "expenses.view",
      "exchange.view",
      "partners.view",
      "haji_ledger.view",
      "employees.view",
      "attendance.view",
      "reports.view",
      "reports.print",
      "delegations.view",
    ],
  },
  {
    name: "accountant",
    description: "د حسابونو محاسب",
    permissions: [
      "dashboard.view",
      "journal.view",
      "journal.manage",
      "accounting.manage",
      "parties.view",
      "parties.manage",
      "expenses.view",
      "expenses.manage",
      "purchases.view",
      "sales.view",
      "rentals.view",
      "exchange.view",
      "partners.view",
      "haji_ledger.view",
      "reports.view",
      "reports.print",
      "reports.export",
      "delegations.view",
    ],
  },
  {
    name: "cashier",
    description: "د صندوق او نغدو پیسو مسوول",
    permissions: ["dashboard.view", "journal.view", "journal.manage", "accounting.manage", "cash_accounts.manage", "reports.view", "reports.print"],
  },
  {
    name: "project_manager",
    description: "د پروژو، بلاکونو او واحدونو مسوول",
    permissions: ["dashboard.view", "projects.view", "projects.manage", "unit_types.manage", "sales.view", "rentals.view", "reports.view"],
  },
  {
    name: "purchase_manager",
    description: "د اجناسو د خریداري مسوول",
    permissions: ["dashboard.view", "purchases.view", "purchases.manage", "parties.view", "parties.manage", "reports.view", "reports.print"],
  },
  {
    name: "sales_manager",
    description: "د فروشاتو او کرایې مسوول",
    permissions: ["dashboard.view", "sales.view", "sales.manage", "rentals.view", "rentals.manage", "parties.view", "parties.manage", "reports.view", "reports.print"],
  },
  {
    name: "expenses_manager",
    description: "د مصارفاتو مسوول",
    permissions: ["dashboard.view", "expenses.view", "expenses.manage", "reports.view", "reports.print"],
  },
  {
    name: "hr_manager",
    description: "د کارکوونکو او حاضرۍ مسوول",
    permissions: ["dashboard.view", "employees.view", "employees.manage", "attendance.view", "attendance.manage", "hr.manage", "reports.view", "reports.print"],
  },
  {
    name: "exchange_manager",
    description: "د صرافۍ مسوول",
    permissions: ["dashboard.view", "exchange.view", "exchange.manage", "parties.view", "parties.manage", "reports.view", "reports.print"],
  },
  {
    name: "partners_manager",
    description: "د شریکانو او حاجي صاحب کهاتې مسوول",
    permissions: ["dashboard.view", "partners.view", "partners.manage", "haji_ledger.view", "haji_ledger.manage", "reports.view", "reports.print"],
  },
  {
    name: "reports_viewer",
    description: "یوازې د راپورونو لیدونکی",
    permissions: ["dashboard.view", "reports.view", "reports.print"],
  },
  {
    name: "auditor",
    description: "د راپورونو او بدلونونو څارونکی",
    permissions: ["dashboard.view", "reports.view", "reports.print", "reports.export", "audit.view", "trash.view"],
  },
  {
    name: "kafil",
    description: "د موقتي کفیل او استازي عملیاتي رول",
    permissions: [
      "dashboard.view",
      "journal.view",
      "journal.manage",
      "accounting.manage",
      "parties.view",
      "parties.manage",
      "projects.view",
      "purchases.view",
      "purchases.manage",
      "sales.view",
      "sales.manage",
      "rentals.view",
      "rentals.manage",
      "expenses.view",
      "expenses.manage",
      "exchange.view",
      "exchange.manage",
      "partners.view",
      "haji_ledger.view",
      "employees.view",
      "attendance.view",
      "delegations.view",
      "reports.view",
      "reports.print",
    ],
  },
];

const CORE_UNIT_TYPES = [
  "کور",
  "دوکان",
  "موټر تمځای",
  "رستورانت",
  "کلینیک",
  "سوپر مارکېټ",
  "مسجد",
  "دفتر",
  "ګدام",
  "نور",
  "نور تجارتي",
];

const CORE_DOCUMENT_SEQUENCES = [
  { documentType: "sales_contract", prefix: "فروش-" },
  { documentType: "rental_contract", prefix: "کرایه-" },
  { documentType: "receipt", prefix: "رسید-" },
  { documentType: "rental_receipt", prefix: "دکرایېرسید-" },
  { documentType: "purchase_invoice", prefix: "خرید-" },
  { documentType: "purchase_payment", prefix: "دخریدتادیه-" },
  { documentType: "purchase_return", prefix: "بیل-" },
  { documentType: "expense_voucher", prefix: "مصرف-" },
  { documentType: "journal_entry", prefix: "روزنامچه-" },
  { documentType: "employee", prefix: "کارکوونکی-" },
  { documentType: "employee_payment", prefix: "معاش-" },
  { documentType: "exchange", prefix: "صرافي-" },
  { documentType: "company_partner", prefix: "شریک-" },
  { documentType: "partner", prefix: "حاجي-" },
  { documentType: "partner_transaction", prefix: "حاجيرسید-" },
];

export async function ensureDatabaseReady(): Promise<void> {
  await sequelize.authenticate();
  await sequelize.sync();
  await runMigrations();

  const [adminRole] = await Role.findOrCreate({
    where: { name: "admin" },
    defaults: { name: "admin", description: "د سیستم بشپړ واک" },
  });

  const permissionByKey = new Map<string, Permission>();
  for (const item of CORE_PERMISSIONS) {
    const [permission] = await Permission.findOrCreate({ where: { key: item.key }, defaults: { key: item.key, description: item.description } });
    if (permission.description !== item.description) {
      permission.description = item.description;
      await permission.save();
    }
    permissionByKey.set(item.key, permission);
    const existing = await adminRole.hasPermission(permission);
    if (!existing) await adminRole.addPermission(permission);
  }

  for (const roleDefinition of CORE_ROLES) {
    const [role] = await Role.findOrCreate({
      where: { name: roleDefinition.name },
      defaults: { name: roleDefinition.name, description: roleDefinition.description },
    });
    if (role.description !== roleDefinition.description) {
      role.description = roleDefinition.description;
      await role.save();
    }
    for (const key of roleDefinition.permissions) {
      const permission = permissionByKey.get(key);
      if (!permission) continue;
      const existing = await role.hasPermission(permission);
      if (!existing) await role.addPermission(permission);
    }
  }

  await CompanySetting.findOrCreate({
    where: { id: 1 },
    defaults: {
      companyName: "د سیستم اداره",
      baseCurrencyCode: "AFN",
      fiscalYearStartMonth: 1,
      locale: "ps",
      welcomeTitlePashto: "ښه راغلاست",
      welcomeSubtitlePashto: "د مدیریت سیستم",
      welcomeDescriptionPashto: "د پروژو، فروشاتو، کرایې، تدارکاتو، کارکوونکو او مالي حسابونو مرکزي مدیریت.",
      welcomeTitleEnglish: "Welcome",
      welcomeSubtitleEnglish: "To Our Company",
      welcomeDescriptionEnglish: "Central management for projects, sales, rentals, procurement, employees, and accounts.",
    },
  });

  await Currency.findOrCreate({ where: { code: "AFN" }, defaults: { code: "AFN", name: "افغانی", isBase: true } });
  await Currency.findOrCreate({ where: { code: "USD" }, defaults: { code: "USD", name: "ډالر", isBase: false } });
  await Currency.findOrCreate({ where: { code: "PKR" }, defaults: { code: "PKR", name: "کلداره", isBase: false } });
  await Currency.update({ name: "افغانی" }, { where: { code: "AFN" } });
  await Currency.update({ name: "ډالر" }, { where: { code: "USD" } });
  await Currency.update({ name: "کلداره" }, { where: { code: "PKR" } });

  for (const seq of CORE_DOCUMENT_SEQUENCES) {
    const [sequence] = await DocumentSequence.findOrCreate({ where: { documentType: seq.documentType }, defaults: { ...seq, nextNumber: 1 } });
    if (sequence.prefix !== seq.prefix) {
      sequence.prefix = seq.prefix;
      await sequence.save();
    }
  }

  for (const name of CORE_UNIT_TYPES) {
    await UnitType.findOrCreate({ where: { name }, defaults: { name, isActive: true } });
  }

  const coreAccounts: { code: string; name: string; type: "asset" | "liability" | "equity" | "income" | "expense" }[] = [
    { code: "1000", name: "نقدي صندوق", type: "asset" },
    { code: "1100", name: "د شرکت طلب", type: "asset" },
    { code: "2000", name: "د شرکت پور", type: "liability" },
    { code: "2100", name: "د کرایه دار امانت", type: "liability" },
    { code: "3000", name: "د حاجي صاحبانو سرمایه", type: "equity" },
    { code: "4000", name: "د فروش عاید", type: "income" },
    { code: "4100", name: "د کرایې عاید", type: "income" },
    { code: "5000", name: "عمومي مصارف", type: "expense" },
    { code: "5100", name: "د معاشاتو مصارف", type: "expense" },
    { code: "5200", name: "د صرافۍ مصارف", type: "expense" },
    { code: "3100", name: "د صرافۍ منځنی حساب", type: "asset" },
  ];
  for (const acc of coreAccounts) {
    const [account] = await Account.findOrCreate({ where: { code: acc.code }, defaults: { ...acc, isSystem: true, isActive: true } });
    if (account.name !== acc.name) {
      account.name = acc.name;
      await account.save();
    }
  }

  const cashAccount = await Account.findOne({ where: { code: "1000" } });
  if (cashAccount) {
    await CashAccount.findOrCreate({
      where: { name: "د افغانیو اصلي صندوق" },
      defaults: { name: "د افغانیو اصلي صندوق", currencyCode: "AFN", accountId: cashAccount.id, isActive: true },
    });
    await CashAccount.update({ name: "د افغانیو اصلي صندوق" }, { where: { name: "Main Cash Box (AFN)" } });
  }

  const anyUserExists = (await User.count()) > 0;
  if (!anyUserExists) {
    const isProduction = process.env["NODE_ENV"] === "production";
    const adminUsername = process.env["ADMIN_USERNAME"] || "admin";
    const adminPassword = process.env["ADMIN_PASSWORD"];

    if (!adminPassword && isProduction) {
      throw new Error(
        "No users exist yet and ADMIN_PASSWORD is not set. Set ADMIN_USERNAME/ADMIN_PASSWORD " +
          "environment variables to create the first admin account on boot.",
      );
    }

    if (!adminPassword) {
      // eslint-disable-next-line no-console
      console.warn(
        "[seed] ADMIN_PASSWORD not set - using default admin/admin123 for local development only. " +
          "Set ADMIN_USERNAME/ADMIN_PASSWORD before deploying.",
      );
    }

    const admin = await User.create({
      username: adminUsername,
      fullName: "د سیستم اداره کوونکی",
      passwordHash: await hashPassword(adminPassword || "admin123"),
      isActive: true,
    });
    await admin.addRole(adminRole);
  }
}
