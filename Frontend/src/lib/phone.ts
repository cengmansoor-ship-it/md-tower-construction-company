export const PHONE_DIGIT_COUNT = 10;

export function phoneDigits(value: string): string {
  return value.replace(/\D/g, "").slice(0, PHONE_DIGIT_COUNT);
}

export function isValidOptionalPhone(value?: string | null): boolean {
  const normalized = String(value ?? "").trim();
  return !normalized || /^\d{10}$/.test(normalized);
}

export function phoneRestrictionMessage(label = "تماس شمېره"): string {
  return `${label} باید دقیق ۱۰ عدده وي.`;
}
