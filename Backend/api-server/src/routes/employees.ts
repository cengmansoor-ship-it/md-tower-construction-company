import { Router, type IRouter, type Response } from "express";
import { Op, type WhereOptions } from "sequelize";
import {
  Employee,
  Attendance,
  EmployeePayment,
  EmployeeWorkPeriod,
  EmployeeDocument,
  Decimal,
  createEmployee,
  recordAttendance,
  addEmployeePayment,
  editEmployeePayment,
  voidEmployeePayment,
  getEmployeeBalance,
  getEmployeeLedgerTotals,
  PostingError,
  type EmployeeWageType,
  type EmployeeWorkerType,
  type AttendanceStatus,
} from "@workspace/db-sequelize";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { requireAuth, type AuthedRequest } from "../middlewares/requireAuth";
import { requirePermission } from "../middlewares/requirePermission";
import { recordAudit } from "../lib/audit";
import { moveToTrash } from "../lib/trash";

const router: IRouter = Router();
const MAX_EMPLOYEE_DOCUMENTS = 3;
const MAX_EMPLOYEE_DOCUMENT_BYTES = 5 * 1024 * 1024;
const EMPLOYEE_DOCUMENT_MIME_EXTENSIONS: Record<string, "jpg" | "png"> = {
  "image/jpeg": "jpg",
  "image/png": "png",
};

function decodeFileName(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "document";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return value.trim();
  }
}

function safeOriginalName(value: string): string {
  const baseName = path.basename(value).replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").trim();
  return baseName || "document";
}

function looksLikeAllowedImage(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  return false;
}

async function readLimitedEmployeeDocumentBody(req: AuthedRequest): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_EMPLOYEE_DOCUMENT_BYTES) throw new Error("د عکس سایز باید تر ۵MB زیات نه وي");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readEmployeeDocumentUpload(req: AuthedRequest): Promise<{ buffer: Buffer; mimeType: string; extension: "jpg" | "png"; originalName: string }> {
  const mimeType = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const extension = EMPLOYEE_DOCUMENT_MIME_EXTENSIONS[mimeType];
  if (!extension) throw new Error("یوازې JPG او PNG عکسونه منل کېږي");
  const contentLength = Number(req.headers["content-length"] ?? 0);
  if (contentLength > MAX_EMPLOYEE_DOCUMENT_BYTES) throw new Error("د عکس سایز باید تر ۵MB زیات نه وي");
  const buffer = await readLimitedEmployeeDocumentBody(req);
  if (buffer.length === 0) throw new Error("عکس ونه لېږل شو");
  if (!looksLikeAllowedImage(buffer, mimeType)) throw new Error("د عکس فایل سم JPG/PNG نه دی");
  return { buffer, mimeType, extension, originalName: safeOriginalName(decodeFileName(req.headers["x-file-name"])) };
}

async function saveEmployeeDocumentFile(employeeId: number, extension: "jpg" | "png", buffer: Buffer): Promise<string> {
  const uploadDir = path.join(process.cwd(), "uploads", "employee-documents", String(employeeId));
  await fs.mkdir(uploadDir, { recursive: true });
  const fileName = `${crypto.randomUUID()}.${extension}`;
  await fs.writeFile(path.join(uploadDir, fileName), buffer, { flag: "wx" });
  return `/uploads/employee-documents/${employeeId}/${fileName}`;
}

function employeeDocumentPathFromUrl(fileUrl: string): string | null {
  if (!fileUrl.startsWith("/uploads/employee-documents/")) return null;
  const root = path.resolve(process.cwd(), "uploads", "employee-documents");
  const relativePath = fileUrl.replace(/^\/uploads\/employee-documents\//, "");
  const resolved = path.resolve(root, relativePath);
  return resolved.startsWith(root + path.sep) ? resolved : null;
}

async function removeStoredEmployeeDocumentFile(fileUrl: string): Promise<void> {
  const filePath = employeeDocumentPathFromUrl(fileUrl);
  if (!filePath) return;
  try {
    await fs.rm(filePath, { force: true });
  } catch {
    // The trash record keeps the database snapshot; a missing file should not block deletion.
  }
}

function normalizeOptionalPhone(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{10}$/.test(value.trim())) {
    throw new Error(`${label} باید دقیق ۱۰ عدده وي`);
  }
  return value.trim();
}

router.get("/", requireAuth, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const workerType = typeof req.query.workerType === "string" ? req.query.workerType : undefined;
  const startDate = typeof req.query.startDate === "string" ? req.query.startDate : undefined;
  const endDate = typeof req.query.endDate === "string" ? req.query.endDate : undefined;
  const attendanceOpen = req.query.attendanceOpen === "1";
  const referenceDate = typeof req.query.referenceDate === "string" ? req.query.referenceDate : undefined;
  const where: WhereOptions = { deletedAt: null };
  if (status) where["status"] = status;
  if (workerType === "regular" || workerType === "misc") where["workerType"] = workerType;
  const attendanceFilter: WhereOptions = attendanceOpen
    ? { [Op.or]: referenceDate ? [{ endDate: null }, { endDate: { [Op.gt]: referenceDate } }] : [{ endDate: null }] }
    : {};
  const employees = await Employee.findAll({ where: { ...where, ...attendanceFilter }, order: [["id", "DESC"]] });
  const withBalances = await Promise.all(
    employees.map(async (e) => ({ ...e.toJSON(), ...(await getEmployeeLedgerTotals(e, { startDate, endDate })) })),
  );
  res.json(withBalances);
});

router.get("/:id", requireAuth, async (req, res) => {
  const employee = await Employee.findByPk(Number(req.params.id), {
    include: [
      { model: Attendance, as: "attendances" as const },
      { model: EmployeePayment, as: "payments" as const, where: { voidedAt: null }, required: false },
      { model: EmployeeWorkPeriod, as: "workPeriods" as const },
      { model: EmployeeDocument, as: "documents" as const },
    ],
  });
  if (!employee || employee.deletedAt) {
    res.status(404).json({ error: "Employee not found" });
    return;
  }
  const balance = await getEmployeeBalance(employee);
  res.json({ ...employee.toJSON(), balance });
});

router.get("/:id/documents", requireAuth, async (req, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "د کارکوونکي شمېره ناسمه ده" });
    return;
  }
  const employee = await Employee.findByPk(employeeId);
  if (!employee || employee.deletedAt) {
    res.status(404).json({ error: "کارکوونکی ونه موندل شو" });
    return;
  }
  const documents = await EmployeeDocument.findAll({ where: { employeeId: employee.id }, order: [["id", "DESC"]] });
  res.json(documents);
});

router.post("/:id/documents", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "د کارکوونکي شمېره ناسمه ده" });
    return;
  }
  const employee = await Employee.findByPk(employeeId);
  if (!employee || employee.deletedAt) {
    res.status(404).json({ error: "کارکوونکی ونه موندل شو" });
    return;
  }
  if (employee.workerType !== "regular") {
    res.status(400).json({ error: "اسناد یوازې د رسمي کارکوونکي لپاره پورته کېدای شي" });
    return;
  }
  const existingCount = await EmployeeDocument.count({ where: { employeeId: employee.id } });
  if (existingCount >= MAX_EMPLOYEE_DOCUMENTS) {
    res.status(400).json({ error: "د کارکوونکي لپاره تر درې اسنادو زیات نه پورته کېږي" });
    return;
  }

  try {
    const { buffer, mimeType, extension, originalName } = await readEmployeeDocumentUpload(req);
    const fileUrl = await saveEmployeeDocumentFile(employee.id, extension, buffer);
    const document = await EmployeeDocument.create({
      employeeId: employee.id,
      fileName: originalName,
      fileUrl,
      mimeType,
      sizeBytes: buffer.length,
      uploadedByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "EmployeeDocument", entityId: String(document.id), details: { employeeId: employee.id, fileName: document.fileName } });
    res.status(201).json(document);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د اسنادو ثبت ناکام شو" });
  }
});

router.delete("/:id/documents/:documentId", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const bodyReason = (req.body as { reason?: unknown } | undefined)?.reason;
  const reason = typeof bodyReason === "string" && bodyReason.trim()
    ? bodyReason.trim()
    : typeof req.query.reason === "string"
      ? req.query.reason.trim()
      : "";
  if (!reason) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }

  const employeeId = Number(req.params.id);
  if (!Number.isFinite(employeeId)) {
    res.status(400).json({ error: "د کارکوونکي شمېره ناسمه ده" });
    return;
  }
  const employee = await Employee.findByPk(employeeId);
  if (!employee || employee.deletedAt) {
    res.status(404).json({ error: "کارکوونکی ونه موندل شو" });
    return;
  }
  const document = await EmployeeDocument.findOne({ where: { id: Number(req.params.documentId), employeeId: employee.id } });
  if (!document) {
    res.status(404).json({ error: "سند ونه موندل شو" });
    return;
  }

  const snapshot = document.toJSON();
  await moveToTrash({
    userId: req.auth!.userId,
    entityType: "EmployeeDocument",
    entityId: document.id,
    displayName: document.fileName || `سند ${document.id}`,
    sourcePath: `/employees/${employee.id}`,
    snapshot,
    reason,
  });
  await removeStoredEmployeeDocumentFile(document.fileUrl);
  await document.destroy();
  res.status(204).send();
});

router.post("/", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const { name, fatherName, phone, position, wageType, wageAmount, currencyCode, startDate, endDate, workerType, notes } = req.body ?? {};
  if (
    typeof name !== "string" ||
    typeof position !== "string" ||
    typeof wageType !== "string" ||
    wageAmount === undefined ||
    typeof currencyCode !== "string" ||
    typeof startDate !== "string"
  ) {
    res.status(400).json({ error: "name, position, wageType, wageAmount, currencyCode and startDate are required" });
    return;
  }
  let normalizedPhone: string | null;
  try {
    normalizedPhone = normalizeOptionalPhone(phone, "تماس شمېره");
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د تماس شمېره ناسمه ده" });
    return;
  }
  try {
    const employee = await createEmployee({
      name,
      fatherName: fatherName ?? null,
      phone: normalizedPhone,
      position,
      wageType: wageType as EmployeeWageType,
      wageAmount,
      currencyCode,
      startDate,
      endDate: typeof endDate === "string" && endDate.trim() ? endDate : null,
      workerType: workerType === "misc" ? "misc" : "regular",
      notes: notes ?? null,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({ userId: req.auth!.userId, action: "create", entityType: "Employee", entityId: String(employee.id), details: req.body });
    res.status(201).json(employee);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.put("/:id", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const employee = await Employee.findByPk(Number(req.params.id));
  if (!employee || employee.deletedAt) {
    res.status(404).json({ error: "کارکوونکی ونه موندل شو" });
    return;
  }
  const { name, fatherName, phone, position, wageType, wageAmount, currencyCode, startDate, endDate, workerType, status, notes } = req.body ?? {};

  let normalizedPhone: string | null | undefined;
  try {
    normalizedPhone = phone === undefined ? undefined : normalizeOptionalPhone(phone, "تماس شمېره");
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د تماس شمېره ناسمه ده" });
    return;
  }

  try {
    const oldStartDate = employee.startDate;
    const oldEndDate = employee.endDate;
    const oldWageType = employee.wageType;
    const oldWageAmount = employee.wageAmount;
    const oldCurrencyCode = employee.currencyCode;
    const oldWorkerType = employee.workerType;
    const nextStartDate = typeof startDate === "string" && startDate.trim() ? startDate.trim() : employee.startDate;
    const nextEndDate = endDate === null || typeof endDate === "string" ? endDate?.trim() || null : employee.endDate;
    const accountRestarted = Boolean(oldEndDate && nextEndDate === null && nextStartDate !== oldStartDate);

    if (typeof name === "string" && name.trim()) employee.name = name.trim();
    if (fatherName === null || typeof fatherName === "string") employee.fatherName = fatherName?.trim() || null;
    if (normalizedPhone !== undefined) employee.phone = normalizedPhone;
    if (typeof position === "string" && position.trim()) employee.position = position.trim();
    if (wageType === "daily" || wageType === "monthly") employee.wageType = wageType;
    if (wageAmount !== undefined) {
      const wage = new Decimal(wageAmount);
      if (wage.lessThanOrEqualTo(0)) {
        res.status(400).json({ error: "معاش باید له صفر څخه زیات وي" });
        return;
      }
      employee.wageAmount = wage.toFixed();
    }
    if (typeof currencyCode === "string" && currencyCode.trim() && currencyCode !== employee.currencyCode) {
      const hasLedger = await Attendance.count({ where: { employeeId: employee.id } }) + await EmployeePayment.count({ where: { employeeId: employee.id } });
      if (hasLedger > 0) {
        res.status(400).json({ error: "د موجودې کهاتې له امله د اسعارو بدلول خوندي نه دي" });
        return;
      }
      employee.currencyCode = currencyCode;
    }
    if (typeof startDate === "string" && startDate.trim()) employee.startDate = startDate;
    if (endDate === null || typeof endDate === "string") employee.endDate = endDate?.trim() || null;
    if (workerType === "regular" || workerType === "misc") employee.workerType = workerType as EmployeeWorkerType;
    if (status === "active" || status === "inactive") employee.status = status;
    if (employee.workerType === "misc" && employee.endDate) employee.status = "inactive";
    if (notes === null || typeof notes === "string") employee.notes = notes?.trim() || null;
    if (accountRestarted && oldEndDate) {
      await EmployeeWorkPeriod.findOrCreate({
        where: { employeeId: employee.id, startDate: oldStartDate, endDate: oldEndDate },
        defaults: {
          employeeId: employee.id,
          startDate: oldStartDate,
          endDate: oldEndDate,
          wageType: oldWageType,
          wageAmount: oldWageAmount,
          currencyCode: oldCurrencyCode,
          workerType: oldWorkerType,
          note: "پخوانی حساب بند شو",
        },
      });
      const restartNote = `نوی حساب د ${nextStartDate} څخه شروع شو`;
      employee.notes = [employee.notes?.trim(), restartNote].filter(Boolean).join("\n");
      employee.status = "active";
    }

    await employee.save();
    await recordAudit({ userId: req.auth!.userId, action: "update", entityType: "Employee", entityId: String(employee.id), details: req.body });
    const balance = await getEmployeeBalance(employee);
    res.json({ ...employee.toJSON(), balance });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "د کارکوونکي اصلاح ناکامه شوه" });
  }
});

async function softDeleteEmployee(req: AuthedRequest, res: Response): Promise<void> {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  const employee = await Employee.findByPk(Number(req.params.id), {
    include: [
      { model: Attendance, as: "attendances" as const },
      { model: EmployeePayment, as: "payments" as const },
    ],
  });
  if (!employee) {
    res.status(404).json({ error: "کارکوونکی ونه موندل شو" });
    return;
  }
  if (employee.deletedAt) {
    res.status(400).json({ error: "دا کارکوونکی مخکې حذف شوی دی" });
    return;
  }

  const snapshot = employee.toJSON();
  employee.status = "inactive";
  employee.deletedAt = new Date();
  employee.deletedByUserId = req.auth!.userId;
  employee.deleteReason = reason.trim();
  await employee.save();
  await moveToTrash({
    userId: req.auth!.userId,
    entityType: "Employee",
    entityId: employee.id,
    displayName: employee.name || employee.employeeNumber || `Employee ${employee.id}`,
    sourcePath: "/employees",
    snapshot,
    reason: reason.trim(),
  });
  const balance = await getEmployeeBalance(employee);
  res.json({ ...employee.toJSON(), balance });
}

router.post("/:id/delete", requireAuth, requirePermission("hr.manage"), softDeleteEmployee);
router.delete("/:id", requireAuth, requirePermission("hr.manage"), softDeleteEmployee);

router.post("/:id/attendance", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const { date, status, notes } = req.body ?? {};
  if (typeof date !== "string" || typeof status !== "string") {
    res.status(400).json({ error: "date and status are required" });
    return;
  }
  try {
    const attendance = await recordAttendance({
      employeeId: Number(req.params.id),
      date,
      status: status as AttendanceStatus,
      notes: notes ?? null,
      createdByUserId: req.auth!.userId,
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "Attendance",
      entityId: String(attendance.id),
      details: req.body,
    });
    res.status(201).json(attendance);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/payments", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const { amount, type, currencyCode, paymentDate, method, cashAccountId, note } = req.body ?? {};
  if (amount === undefined || typeof type !== "string" || typeof currencyCode !== "string" || typeof paymentDate !== "string") {
    res.status(400).json({ error: "amount, type, currencyCode and paymentDate are required" });
    return;
  }
  try {
    const payment = await addEmployeePayment({
      employeeId: Number(req.params.id),
      amount,
      type: type as "salary" | "advance" | "debt_repayment",
      currencyCode,
      paymentDate,
      method,
      cashAccountId: cashAccountId ?? null,
      note: note ?? null,
      paidByUserId: req.auth!.userId,
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "create",
      entityType: "EmployeePayment",
      entityId: String(payment.id),
      details: req.body,
    });
    res.status(201).json(payment);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.put("/:id/payments/:paymentId", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const { amount, type, paymentDate, note } = req.body ?? {};
  if (amount === undefined || typeof type !== "string" || typeof paymentDate !== "string") {
    res.status(400).json({ error: "amount, type and paymentDate are required" });
    return;
  }
  try {
    const payment = await editEmployeePayment(Number(req.params.paymentId), {
      employeeId: Number(req.params.id),
      amount,
      type: type as "salary" | "advance" | "debt_repayment",
      paymentDate,
      note: note ?? null,
      userId: req.auth!.userId,
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "update",
      entityType: "EmployeePayment",
      entityId: String(payment.id),
      details: req.body,
    });
    res.json(payment);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.post("/:id/payments/:paymentId/void", requireAuth, requirePermission("hr.manage"), async (req: AuthedRequest, res) => {
  const { reason } = req.body ?? {};
  if (typeof reason !== "string" || !reason.trim()) {
    res.status(400).json({ error: "د حذف دلیل اړین دی" });
    return;
  }
  try {
    const snapshot = await EmployeePayment.findByPk(Number(req.params.paymentId));
    const payment = await voidEmployeePayment(Number(req.params.paymentId), {
      employeeId: Number(req.params.id),
      userId: req.auth!.userId,
      reason: reason.trim(),
    });
    await recordAudit({
      userId: req.auth!.userId,
      action: "delete",
      entityType: "EmployeePayment",
      entityId: String(payment.id),
      details: { reason: reason.trim() },
    });
    await moveToTrash({
      userId: req.auth!.userId,
      entityType: "EmployeePayment",
      entityId: payment.id,
      displayName: payment.paymentNumber || `رسید ${payment.id}`,
      sourcePath: `/employees/${req.params.id}`,
      snapshot: snapshot?.toJSON() ?? payment.toJSON(),
      reason: reason.trim(),
    });
    res.json(payment);
  } catch (err) {
    if (err instanceof PostingError) {
      res.status(400).json({ error: err.message });
      return;
    }
    throw err;
  }
});

export default router;
