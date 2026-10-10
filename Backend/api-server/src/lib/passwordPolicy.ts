export const PASSWORD_POLICY_TEXT =
  "پټنوم باید لږ تر لږه ۸ توري، یو حرف، یو عدد او یوه نښه ولري، تشه ونه لري، او له کارن نوم سره ورته نه وي.";

export function passwordValidationMessage(password: string, username?: string | null): string | null {
  if (Array.from(password).length < 8) return "پټنوم باید لږ تر لږه ۸ توري وي.";
  if (/\s/u.test(password)) return "پټنوم باید تشه ونه لري.";
  if (!/\p{L}/u.test(password)) return "پټنوم باید لږ تر لږه یو حرف ولري.";
  if (!/[0-9۰-۹٠-٩]/u.test(password)) return "پټنوم باید لږ تر لږه یو عدد ولري.";
  if (!/[^\p{L}\p{N}\s]/u.test(password)) return "پټنوم باید لږ تر لږه یوه نښه ولري.";

  const cleanUsername = (username ?? "").trim().toLowerCase();
  if (cleanUsername.length >= 3 && password.toLowerCase().includes(cleanUsername)) {
    return "پټنوم باید له کارن نوم سره ورته نه وي.";
  }

  return null;
}
