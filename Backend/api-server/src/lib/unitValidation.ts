export function unitTypeNameIsHouse(name: string | null | undefined): boolean {
  const normalized = (name ?? "").trim().toLowerCase();
  return normalized.includes("کور") || normalized.includes("house") || normalized.includes("home");
}

export function normalizeRoomCount(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : Number.NaN;
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error("د اطاقونو تعداد باید صفر یا مثبت بشپړ عدد وي");
  }
  return parsed;
}

export function roomCountValidationError(unitTypeName: string | null | undefined, roomCount: number | null): string | null {
  if (unitTypeNameIsHouse(unitTypeName) && (!roomCount || roomCount <= 0)) {
    return "د کور لپاره د اطاقونو تعداد اړین دی";
  }
  return null;
}
