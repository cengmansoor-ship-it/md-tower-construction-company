import { Router, type IRouter } from "express";
import { Op } from "sequelize";
import { CompanySetting, Expense, Party, Project, createExpense, voidExpense, PostingError, type ExpenseCategory } from "@workspace/db-sequelize";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();

const expenseIncludes = [
  { model: Party, as: "payeeParty" as const },
  { model: Project, as: "project" as const },
];
const DEFAULT_EXPENSE_CATEGORY_KEYS: ExpenseCategory[] = ["kitchen", "office", "transport", "utilities", "salaries", "maintenance", "other"];
const CUSTOM_CATEGORY_PREFIX = "custom:";

interface ExpenseCategoryConfig {
  labels: Record<string, string>;
  hidden: string[];
  custom: string[];
}

function parseExpenseCategoryConfig(raw: string | null | undefined): ExpenseCategoryConfig {
  if (!raw) return { labels: {}, hidden: [], custom: [] };
  try {
    const parsed = JSON.parse(raw) as Partial<ExpenseCategoryConfig>;
    return {
      labels: parsed.labels && typeof parsed.labels === "object" ? parsed.labels : {},
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden.filter((key): key is string => typeof key === "string") : [],
      custom: Array.isArray(parsed.custom) ? parsed.custom.filter((name): name is string => typeof name === "string" && Boolean(name.trim())) : [],
    };
  } catch {
    return { labels: {}, hidden: [], custom: [] };
  }
}

function normalizeCustomCategoryNames(names: string[]): string[] {
  return Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
}

async function saveExpenseCategoryConfig(settings: CompanySetting, config: ExpenseCategoryConfig): Promise<void> {
  config.custom = normalizeCustomCategoryNames(config.custom);
  config.hidden = Array.from(new Set(config.hidden));
  settings.expenseCategoryConfig = JSON.stringify(config);
  await settings.save();
}

async function loadExpenseCategoryConfig(): Promise<{ settings: CompanySetting; config: ExpenseCategoryConfig }> {
  const settings = await CompanySetting.findByPk(1);
  if (!settings) throw new PostingError("Company settings not found");
  return { settings, config: parseExpenseCategoryConfig(settings.expenseCategoryConfig) };
}

function customCategoryNameFromKey(key: string): string | null {
  if (!key.startsWith(CUSTOM_CATEGORY_PREFIX)) return null;
  return key.slice(CUSTOM_CATEGORY_PREFIX.length).trim() || null;
}

function isDefaultExpenseCategory(key: string): key is ExpenseCategory {
  return DEFAULT_EXPENSE_CATEGORY_KEYS.includes(key as ExpenseCategory);
}

router.get("/", requireAuth, async (req, res) => {
  const category = typeof req.query.category === "string" ? req.query.category : undefined;
  const currencyCode = typeof req.query.currencyCode === "string" ? req.query.currencyCode : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const includeVoided = req.query.includeVoided === "1";
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const where: Record<string | symbol, unknown> = {};
  if (!includeVoided) where["voidedAt"] = null;
  if (category) where["category"] = category;
  if (currencyCode) where["currencyCode"] = currencyCode;
  if (startDate || endDate) {
    where["expenseDate"] = {
      ...(startDate ? { [Op.gte]: startDate } : {}),
      ...(endDate ? { [Op.lte]: endDate } : {}),
    };
  }
  if (q) {
    where[Op.or] = [
      { expenseNumber: { [Op.like]: `%${q}%` } },
      { categoryName: { [Op.like]: `%${q}%` } },
      { description: { [Op.like]: `%${q}%` } },
      { payeeName: { [Op.like]: `%${q}%` } },
    ];
  }
  const expenses = await Expense.findAll({ where, order: [["id", "DESC"]], include: expenseIncludes });
  res.json(expenses);
});

router.get("/categories", requireAuth, async (_req, res) => {
  const { settings, config } = await loadExpenseCategoryConfig();
  const rows = await Expense.findAll({
    attributes: ["categoryName"],
    where: { category: "other", categoryName: { [Op.ne]: null } },
    group: ["categoryName"],
  });
  const storedNames = rows.map((expense) => expense.categoryName?.trim()).filter((name): name is string => Boolean(name));
  config.custom = normalizeCustomCategoryNames([...config.custom, ...storedNames]);
  if (storedNames.length) await saveExpenseCategoryConfig(settings, config);
  res.json(config);
});

router.put("/category-label", requireAuth, requirePermission("expenses.manage"), async (req: AuthedRequest, res) => {
  const { key, label } = req.body ?? {};
  if (typeof key !== "string" || typeof label !== "string" || !key.trim() || !label.trim()) {
    res.status(400).json({ error: "key and label are required" });
    return;
  }

  const categoryKey = key.trim();
  const cleanLabel = label.trim();
  const customName = customCategoryNameFromKey(categoryKey);

  if (customName) {
    const { settings, config } = await loadExpenseCategoryConfig();
    const [updated] = await Expense.update({ categoryName: cleanLabel }, { where: { category: "other", categoryName: customName } });
    config.custom = normalizeCustomCategoryNames(config.custom.map((name) => (name === customName ? cleanLabel : name)).concat(cleanLabel));
    await saveExpenseCategoryConfig(settings, config);
    await recordAudit({
      userId: req.auth!.userId,
      action: "update",
      entityType: "ExpenseCategoryName",
      entityId: customName,
      details: { oldName: customName, newName: cleanLabel, updated },
    });
    res.json({ updated });
    return;
  }

  if (!isDefaultExpenseCategory(categoryKey)) {
    res.status(400).json({ error: "Invalid expense category" });
    return;
  }

  const { settings, config } = await loadExpenseCategoryConfig();
  config.labels[categoryKey] = cleanLabel;
  config.hidden = config.hidden.filter((hiddenKey) => hiddenKey !== categoryKey);
  await saveExpenseCategoryConfig(settings, config);
  await recordAudit({
    userId: req.auth!.userId,
    action: "update",
    entityType: "ExpenseCategoryLabel",
    entityId: categoryKey,
    details: { key: categoryKey, label: cleanLabel },
  });
  res.json(config);
});

router.post("/category-delete", requireAuth, requirePermission("expenses.manage"), async (req: AuthedRequest, res) => {
  const { key } = req.body ?? {};
  if (typeof key !== "string" || !key.trim()) {
    res.status(400).json({ error: "key is required" });
    return;
  }

  const categoryKey = key.trim();
  const customName = customCategoryNameFromKey(categoryKey);

  if (customName) {
    const { settings, config } = await loadExpenseCategoryConfig();
    const [updated] = await Expense.update({ categoryName: null }, { where: { category: "other", categoryName: customName } });
    config.custom = config.custom.filter((name) => name !== customName);
    await saveExpenseCategoryConfig(settings, config);
    await recordAudit({
      userId: req.auth!.userId,
      action: "delete",
      entityType: "ExpenseCategoryName",
      entityId: customName,
      details: { name: customName, updated, note: "Expense records were kept under the default other category." },
    });
    res.json({ updated });
    return;
  }

  if (!isDefaultExpenseCategory(categoryKey)) {
    res.status(400).json({ error: "Invalid expense category" });
    return;
  }

  const { settings, config } = await loadExpenseCategoryConfig();
  if (!config.hidden.includes(categoryKey)) config.hidden.push(categoryKey);
  await saveExpenseCategoryConfig(settings, config);
  await recordAudit({
    userId: req.auth!.userId,
    action: "delete",
    entityType: "ExpenseCategoryLabel",
    entityId: categoryKey,
    details: { key: categoryKey, note: "Expense records were kept; this category is hidden from expense entry dropdowns." },
  });
  res.json(config);
});

router.get("/:id", requireAuth, async (req, res) => {
  const expense = await Expense.findByPk(Number(req.params.id), { include: expenseIncludes });
  if (!expense) {
    res.status(404).json({ error: "Expense not found" });
    return;
  }
  res.json(expense);
});

router.post("/", requireAuth, requirePermission("expenses.manage"), async (req: AuthedRequest, res) => {
  const { category, categoryName, expenseDate, description, amount, currencyCode, payeePartyId, payeeName, projectId, cashAccountId } = req.body ?? {};
  if (
    typeof category !== "string" ||
    typeof expenseDate !== "string" ||
    typeof description !== "string" ||
    amount === undefined ||
    typeof currencyCode !== "string"
  ) {
    res.status(400).json({ error: "category, expenseDate, description, amount and currencyCode are required" });
    return;
  }
  try {
    const expense = await createExpense({
      category: category as ExpenseCategory,
      categoryName: typeof categoryName === "string" ? categoryName : null,
      expenseDate,
      description,
      amount,
      currencyCode,
      payeePartyId: payeePartyId ?? null,
      payeeName: payeeName ?? null,
      projectId: projectId ?? null,
      cashAccountId: cashAccountId ?? null,
      createdByUserId: req.auth!.userId,
    });
    if (typeof categoryName === "string" && categoryName.trim()) {
      const { settings, config } = await loadExpenseCategoryConfig();
      config.custom = normalizeCustomCategoryNames([...config.custom, categoryName.trim()]);
      await saveExpenseCategoryConfig(settings, config);
    }
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Expense", entityId: String(expense.id), details: req.body });
    res.status(201).json(expense);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.put("/category-name", requireAuth, requirePermission("expenses.manage"), async (req: AuthedRequest, res) => {
  const { oldName, newName } = req.body ?? {};
  if (typeof oldName !== "string" || typeof newName !== "string" || !oldName.trim() || !newName.trim()) {
    res.status(400).json({ error: "oldName and newName are required" });
    return;
  }

  const from = oldName.trim();
  const to = newName.trim();
  const [updated] = await Expense.update({ categoryName: to }, { where: { category: "other", categoryName: from } });
  await recordAudit({
    userId: req.auth!.userId,
    action: "update",
    entityType: "ExpenseCategoryName",
    entityId: from,
    details: { oldName: from, newName: to, updated },
  });
  res.json({ updated });
});

router.post("/category-name/delete", requireAuth, requirePermission("expenses.manage"), async (req: AuthedRequest, res) => {
  const { name } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const categoryName = name.trim();
  const [updated] = await Expense.update({ categoryName: null }, { where: { category: "other", categoryName } });
  await recordAudit({
    userId: req.auth!.userId,
    action: "delete",
    entityType: "ExpenseCategoryName",
    entityId: categoryName,
    details: { name: categoryName, updated, note: "Expense records were kept under the default other category." },
  });
  res.json({ updated });
});

router.post("/:id/void", requireAuth, requirePermission("expenses.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "reason is required" });
    return;
  }
  try {
    const expense = await voidExpense(Number(req.params.id), { userId: req.auth!.userId, reason: reason.trim() });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "Expense",
      entityId: expense.id,
      displayName: expense.expenseNumber || expense.description || `مصرف ${expense.id}`,
      sourcePath: "/expenses",
      snapshot: expense.toJSON(),
      reason: reason.trim(),
    });
    res.json(expense);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
