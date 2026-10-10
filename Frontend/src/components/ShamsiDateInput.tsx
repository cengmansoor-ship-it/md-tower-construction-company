import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { daysInJalaliMonth, gregorianToJalali, isoToJalaliString, jalaliInputToIso, jalaliToGregorian } from "../lib/jalali";

type ShamsiDateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
};

const WEEK_DAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];
const MONTH_NAMES = ["حمل", "ثور", "جوزا", "سرطان", "اسد", "سنبله", "میزان", "عقرب", "قوس", "جدی", "دلو", "حوت"];

function todayJalali() {
  const now = new Date();
  return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function isoFromJalali(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}

function jalaliFromIso(value: string) {
  const [gy, gm, gd] = value.slice(0, 10).split("-").map(Number);
  if (!gy || !gm || !gd) {
    const now = new Date();
    return gregorianToJalali(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  return gregorianToJalali(gy, gm, gd);
}

function weekdayOffset(jy: number, jm: number): number {
  const { gy, gm, gd } = jalaliToGregorian(jy, jm, 1);
  const day = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay();
  return (day + 1) % 7;
}

export default function ShamsiDateInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  className,
  style,
  disabled,
  placeholder,
  ...props
}: ShamsiDateInputProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [displayValue, setDisplayValue] = useState(value ? isoToJalaliString(value) : "");
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => {
    const selected = value ? jalaliFromIso(value) : todayJalali();
    return { jy: selected.jy, jm: selected.jm };
  });

  useEffect(() => {
    setDisplayValue(value ? isoToJalaliString(value) : "");
    if (value) {
      const selected = jalaliFromIso(value);
      setViewMonth({ jy: selected.jy, jm: selected.jm });
    }
  }, [value]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const selectedDay = value ? jalaliFromIso(value) : null;
  const monthDays = useMemo(() => {
    const offset = weekdayOffset(viewMonth.jy, viewMonth.jm);
    const days = daysInJalaliMonth(viewMonth.jy, viewMonth.jm);
    return [
      ...Array.from({ length: offset }, () => null),
      ...Array.from({ length: days }, (_, index) => index + 1),
    ];
  }, [viewMonth]);

  function commitValue() {
    if (!displayValue.trim()) {
      onChange("");
      setDisplayValue("");
      return;
    }
    const isoValue = jalaliInputToIso(displayValue);
    if (!isoValue) {
      setDisplayValue(value ? isoToJalaliString(value) : "");
      return;
    }
    onChange(isoValue);
    setDisplayValue(isoToJalaliString(isoValue));
  }

  function openCalendar() {
    if (disabled) return;
    setOpen((current) => !current);
  }

  function moveMonth(delta: number) {
    setViewMonth((current) => {
      const month = current.jm + delta;
      if (month < 1) return { jy: current.jy - 1, jm: 12 };
      if (month > 12) return { jy: current.jy + 1, jm: 1 };
      return { jy: current.jy, jm: month };
    });
  }

  function selectJalaliDate(jy: number, jm: number, jd: number) {
    const iso = isoFromJalali(jy, jm, jd);
    onChange(iso);
    setDisplayValue(isoToJalaliString(iso));
    setOpen(false);
  }

  function selectDay(day: number) {
    selectJalaliDate(viewMonth.jy, viewMonth.jm, day);
  }

  return (
    <div ref={wrapperRef} className={`shamsi-date-field ${className ?? ""}`} style={style}>
      <input
        {...props}
        type="text"
        inputMode="numeric"
        dir="ltr"
        disabled={disabled}
        placeholder={placeholder ?? "نېټه"}
        className="shamsi-date-text"
        value={displayValue}
        onChange={(event) => setDisplayValue(event.target.value)}
        onBlur={(event) => {
          commitValue();
          onBlur?.(event);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitValue();
          onKeyDown?.(event);
        }}
      />
      <button type="button" className="shamsi-date-button" disabled={disabled} onClick={openCalendar} title="جنتري">
        <CalendarDays size={16} />
      </button>
      {open ? (
        <div className="shamsi-calendar-popover" dir="rtl">
          <div className="shamsi-calendar-header">
            <button type="button" onClick={() => moveMonth(-1)} title="مخکینۍ میاشت"><ChevronRight size={16} /></button>
            <strong>{MONTH_NAMES[viewMonth.jm - 1]} {viewMonth.jy}</strong>
            <button type="button" onClick={() => moveMonth(1)} title="بله میاشت"><ChevronLeft size={16} /></button>
          </div>
          <div className="shamsi-calendar-grid shamsi-calendar-weekdays">
            {WEEK_DAYS.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="shamsi-calendar-grid">
            {monthDays.map((day, index) => day == null ? (
              <span key={`blank-${index}`} />
            ) : (
              <button
                key={day}
                type="button"
                className={selectedDay?.jy === viewMonth.jy && selectedDay.jm === viewMonth.jm && selectedDay.jd === day ? "selected" : ""}
                onClick={() => selectDay(day)}
              >
                {day}
              </button>
            ))}
          </div>
          <div className="shamsi-calendar-footer">
            <button type="button" onClick={() => {
              const today = todayJalali();
              setViewMonth({ jy: today.jy, jm: today.jm });
              selectJalaliDate(today.jy, today.jm, today.jd);
            }}>نن</button>
            <button type="button" onClick={() => {
              onChange("");
              setDisplayValue("");
              setOpen(false);
            }}>پاکول</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
