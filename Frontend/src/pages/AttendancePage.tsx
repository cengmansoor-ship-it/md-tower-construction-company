import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Save, UserPlus, X } from "lucide-react";
import { api, type Attendance, type AttendanceStatus, type Employee } from "../lib/api";
import JalaliDate from "../components/JalaliDate";
import ShamsiDateInput from "../components/ShamsiDateInput";
import DateFilterButton from "../components/DateFilterButton";
import { visibleText } from "../lib/labels";

const ATTENDANCE_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "present", label: "حاضر" },
  { value: "absent", label: "غیر حاضر" },
  { value: "leave", label: "رخصتي" },
  { value: "half_day", label: "نیمه ورځ" },
];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function cleanEmployeeNumber(employee: Employee, index: number): string {
  return visibleText(employee.employeeNumber, `ADR${String(index + 1).padStart(2, "0")}`)
    .replace(/^کارکوونکی[-\s]*/u, "")
    .replace(/^Employee[-\s]*/iu, "");
}

function attendanceEmployeeMatchesSearch(employee: Employee, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    employee.employeeNumber,
    employee.name,
    employee.fatherName,
    employee.phone,
    employee.position,
  ].some((value) => String(value ?? "").toLowerCase().includes(needle));
}

export default function AttendancePage() {
  const qc = useQueryClient();
  const [searchParams] = useSearchParams();
  const urlSearch = searchParams.get("q") ?? "";
  const [attendanceDate, setAttendanceDate] = useState(today());
  const [startDate, setStartDate] = useState(today());
  const [endDate, setEndDate] = useState(today());
  const [statuses, setStatuses] = useState<Record<number, AttendanceStatus>>({});
  const [q, setQ] = useState(urlSearch);
  const [message, setMessage] = useState<string | null>(null);

  const { data: employees, refetch: refetchEmployees } = useQuery({
    queryKey: ["employees", "attendance", "active", attendanceDate, startDate, endDate],
    queryFn: () => {
      const params = new URLSearchParams({ status: "active", workerType: "regular", attendanceOpen: "1", referenceDate: attendanceDate });
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
      return api.get<Employee[]>(`/employees?${params.toString()}`);
    },
  });

  useEffect(() => {
    setStatuses((current) => {
      const next: Record<number, AttendanceStatus> = {};
      for (const employee of employees ?? []) next[employee.id] = current[employee.id] ?? "present";
      return next;
    });
  }, [employees]);

  useEffect(() => {
    setQ(urlSearch);
  }, [urlSearch]);

  const visibleEmployees = useMemo(
    () => (employees ?? []).filter((employee) => attendanceEmployeeMatchesSearch(employee, q)),
    [employees, q],
  );

  const totals = useMemo(() => {
    const rows = visibleEmployees;
    return {
      present: rows.filter((employee) => (statuses[employee.id] ?? "present") === "present").length,
      absent: rows.filter((employee) => statuses[employee.id] === "absent").length,
      leave: rows.filter((employee) => statuses[employee.id] === "leave").length,
      halfDay: rows.filter((employee) => statuses[employee.id] === "half_day").length,
      total: rows.length,
    };
  }, [visibleEmployees, statuses]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const rows = employees ?? [];
      const results = await Promise.allSettled(
        rows.map((employee) =>
          api.post<Attendance>(`/employees/${employee.id}/attendance`, {
            date: attendanceDate,
            status: statuses[employee.id] ?? "present",
          }),
        ),
      );
      return {
        saved: results.filter((result) => result.status === "fulfilled").length,
        failed: results.filter((result) => result.status === "rejected").length,
      };
    },
    onSuccess: ({ saved, failed }) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      setMessage(failed ? `${saved} حاضري ثبت شوه، ${failed} مخکې ثبت وه یا ثبت نه شوه.` : `${saved} حاضري ثبت شوه.`);
    },
    onError: (err) => setMessage(err instanceof Error ? err.message : "حاضري ثبت نه شوه"),
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">د کارکوونکو حاضري</h1>
          <p className="page-sub">د ورځې حاضري د کارکوونکو له کهاتو سره تړلې ثبتېږي.</p>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link className="btn btn-outline" to="/employees" style={{ textDecoration: "none" }}>
            <UserPlus size={16} /> کارکوونکي
          </Link>
          <Link className="btn btn-outline" to="/misc-workers" style={{ textDecoration: "none" }}>
            <Plus size={16} /> متفرقه کاریګر
          </Link>
          <button className="btn btn-primary" disabled={!employees?.length || saveMutation.isPending} onClick={() => saveMutation.mutate()}>
            <Save size={16} /> حاضري ثبتول
          </button>
        </div>
      </div>

      <div className="card elevated-card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 14, alignItems: "end", flexWrap: "wrap" }}>
          <div>
            <label className="form-label">تاریخ</label>
            <ShamsiDateInput className="form-input" value={attendanceDate} onChange={setAttendanceDate} style={{ width: 170 }} />
          </div>
          <div>
            <label className="form-label">شروع تاریخ</label>
            <ShamsiDateInput className="form-input" value={startDate} onChange={setStartDate} style={{ width: 170 }} />
          </div>
          <div>
            <label className="form-label">ختم تاریخ</label>
            <ShamsiDateInput className="form-input" value={endDate} onChange={setEndDate} style={{ width: 170 }} />
          </div>
          <DateFilterButton onClick={() => void refetchEmployees()} />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span className="badge badge-success">حاضر: {totals.present}</span>
            <span className="badge badge-danger">غیر حاضر: {totals.absent}</span>
            <span className="badge badge-muted">رخصتي: {totals.leave}</span>
            <span className="badge badge-warning">نیمه ورځ: {totals.halfDay}</span>
            <span className="badge">ټول: {totals.total}</span>
          </div>
        </div>
        {message ? (
          <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "var(--surface-2)", color: "var(--text)", fontWeight: 800 }}>
            {message}
          </div>
        ) : null}
      </div>

      <div className="card elevated-card" style={{ padding: 0, overflow: "auto" }}>
        <table className="fl-table" style={{ minWidth: 980, fontSize: 13 }}>
          <thead>
            <tr><th>تاریخ</th><th><JalaliDate date={attendanceDate} /></th><th colSpan={7}></th></tr>
            <tr>
              <th>شمېره</th>
              <th>آی ډي نمبر</th>
              <th>نوم</th>
              <th>د پلار نوم</th>
              <th>وظیفه</th>
              <th>تماس شمېره</th>
              <th>حاضر</th>
              <th>غیر حاضر</th>
              <th>نور حالت</th>
            </tr>
          </thead>
          <tbody>
            {visibleEmployees.map((employee, index) => {
              const status = statuses[employee.id] ?? "present";
              return (
                <tr key={employee.id}>
                  <td>{index + 1}</td>
                  <td>{cleanEmployeeNumber(employee, index)}</td>
                  <td>{employee.name}</td>
                  <td>{employee.fatherName ?? "—"}</td>
                  <td>{employee.position}</td>
                  <td>{employee.phone ?? "—"}</td>
                  <td>
                    <button className={`btn btn-sm ${status === "present" ? "btn-primary" : "btn-outline"}`} onClick={() => setStatuses((current) => ({ ...current, [employee.id]: "present" }))}>
                      <Check size={13} /> حاضر
                    </button>
                  </td>
                  <td>
                    <button className={`btn btn-sm ${status === "absent" ? "btn-primary" : "btn-outline"}`} onClick={() => setStatuses((current) => ({ ...current, [employee.id]: "absent" }))}>
                      <X size={13} /> غیر حاضر
                    </button>
                  </td>
                  <td>
                    <select className="form-input" value={status} onChange={(event) => setStatuses((current) => ({ ...current, [employee.id]: event.target.value as AttendanceStatus }))}>
                      {ATTENDANCE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </td>
                </tr>
              );
            })}
            {!visibleEmployees.length ? (
              <tr>
                <td colSpan={9} style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
                  فعال کارکوونکي نشته. <Link to="/employees"><Plus size={13} /> کارکوونکی اضافه کړه</Link>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
