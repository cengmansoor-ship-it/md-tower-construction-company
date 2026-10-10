/**
 * Gregorian <-> Jalali (Solar Hijri / "Hijri Shamsi") date conversion.
 * Self-contained (no external dependency) implementation of the standard
 * algorithm (jalaali-js / Borkowski), used to satisfy the brief's requirement
 * that operational records and print views show the Hijri Shamsi date
 * alongside the Gregorian date.
 */

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

const breaks = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178,
];

function jalCal(jy: number): { leap: number; gy: number; march: number } {
  const bl = breaks.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = breaks[0]!;
  if (jy < jp || jy >= breaks[bl - 1]!) {
    throw new Error("Invalid Jalaali year " + jy);
  }
  let jump = 0;
  for (let i = 1; i < bl; i += 1) {
    const jm = breaks[i]!;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number): number {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number): { jy: number; jm: number; jd: number } {
  const gy = d2g(jdn).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = jdn - jdn1f;
  if (k >= 0) {
    if (k <= 185) {
      return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

/** Converts a Gregorian y/m/d (m is 1-12) to its Jalali (Solar Hijri) equivalent. */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const jdn = g2d(gy, gm, gd);
  return d2j(jdn);
}

/** Converts a Jalali y/m/d back to a Gregorian Date. */
export function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const jdn = j2d(jy, jm, jd);
  const { gy, gm, gd } = d2g(jdn);
  return new Date(Date.UTC(gy, gm - 1, gd));
}

export function daysInJalaliMonth(jy: number, jm: number): number {
  if (!Number.isInteger(jy) || !Number.isInteger(jm) || jm < 1 || jm > 12) return 0;
  const next = jm === 12 ? { jy: jy + 1, jm: 1 } : { jy, jm: jm + 1 };
  return j2d(next.jy, next.jm, 1) - j2d(jy, jm, 1);
}

export function isValidJalaliDate(jy: number, jm: number, jd: number): boolean {
  return Number.isInteger(jy) && Number.isInteger(jm) && Number.isInteger(jd) && jd >= 1 && jd <= daysInJalaliMonth(jy, jm);
}

/** Converts an ISO date string ("YYYY-MM-DD" or a full ISO timestamp) to a formatted Jalali string. */
export function isoToJalaliString(iso: string | null | undefined): string {
  if (!iso) return "—";
  const datePart = iso.slice(0, 10);
  const [y, m, d] = datePart.split("-").map(Number);
  if (!y || !m || !d) return datePart;
  const { jy, jm, jd } = gregorianToJalali(y, m, d);
  return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
}
