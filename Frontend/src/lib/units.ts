export function unitTypeNameIsHouse(name: string | null | undefined): boolean {
  const normalized = (name ?? "").trim().toLowerCase();
  return normalized.includes("کور") || normalized.includes("house") || normalized.includes("home");
}

export function unitIsHouse(unit: { unitType?: { name?: string | null } | null } | null | undefined): boolean {
  return unitTypeNameIsHouse(unit?.unitType?.name);
}

export function roomCountLabel(unit: { roomCount?: number | null; unitType?: { name?: string | null } | null } | null | undefined): string {
  if (!unitIsHouse(unit)) return "—";
  return unit?.roomCount ? String(unit.roomCount) : "—";
}
