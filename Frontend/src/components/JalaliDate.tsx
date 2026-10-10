import { isoToJalaliString } from "../lib/jalali";

interface JalaliDateProps {
  date: string | null | undefined;
  showGregorian?: boolean;
}

export default function JalaliDate({ date }: JalaliDateProps) {
  if (!date) return <span>-</span>;
  return (
    <span style={{ direction: "ltr", display: "inline-flex", flexDirection: "column", lineHeight: 1.3 }}>
      <span>{isoToJalaliString(date)}</span>
    </span>
  );
}
