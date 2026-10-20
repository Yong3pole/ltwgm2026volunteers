"use client";

import { FormEvent, useMemo, useState } from "react";
import AdminNav from "./AdminNav";

type Status = "pending" | "confirmed" | "rejected" | "cancelled" | "waitlisted";
type RequestRow = {
  reference: string; shiftId: string; date: string; shiftLabel: string;
  startTime: string; endTime: string; fullName: string; phone: string;
  organization: string; leaderName: string; leaderPhone: string;
  status: Status; createdAt: string;
};
type WaitlistRow = Omit<RequestRow, "status"> & { status: "waitlisted" };
type ScheduleRow = { shiftId: string; date: string; label: string; startTime: string; endTime: string; capacity: number; bookingCount: number; waitlistCount: number };

const statusTabs: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" }, { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" },   { id: "rejected", label: "Denied" }, { id: "waitlisted", label: "Waitlisted" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${value}T12:00:00+08:00`));
}
function formatTime12(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}
function calendarDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  return [...Array(first.getDay()).fill(null), ...Array.from({ length: last.getDate() }, (_, i) => i + 1)];
}
function keyFor(month: Date, day: number) {
  return `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState(false);
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"all" | Status>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [search, setSearch] = useState("");
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 10, 1, 12));
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);

  async function loadRequests() {
    const response = await fetch("/api/admin/requests");
    if (response.status === 401) { setAuthenticated(false); return; }
    const data = (await response.json()) as { requests?: RequestRow[]; waitlist?: WaitlistRow[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load requests.");
    setRequests(data.requests ?? []); setWaitlist((data.waitlist ?? []).map((entry) => ({ ...entry, status: "waitlisted" as const }))); setAuthenticated(true);
    await loadSchedule();
  }
  async function loadSchedule() {
    const response = await fetch("/api/admin/schedule");
    const data = (await response.json()) as { schedule?: ScheduleRow[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Unable to load schedule.");
    setSchedule(data.schedule ?? []);
  }
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Login failed.");
      setPassword(""); await loadRequests();
    } catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Login failed."); }
    finally { setLoading(false); }
  }
  async function changeStatus(reference: string, status: "confirmed" | "rejected") {
    await updateRequest({ reference, status });
  }
  async function updateRequest(body: Record<string, string>) {
    setError("");
    const response = await fetch("/api/admin/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setError(data.error ?? "Unable to update booking."); return false; }
    await loadRequests(); return true;
  }
  async function deleteRequest(reference: string) {
    if (!window.confirm(`Delete booking ${reference}? This cannot be undone.`)) return;
    const response = await fetch(`/api/admin/requests?reference=${encodeURIComponent(reference)}`, { method: "DELETE" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setError(data.error ?? "Unable to delete booking."); return; }
    await loadRequests();
  }
  async function promoteWaitlist(reference: string) {
    setError("");
    const response = await fetch("/api/admin/waitlist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setError(data.error ?? "Unable to promote volunteer."); return; }
    await loadRequests();
  }
  async function removeWaitlist(reference: string) {
    if (!window.confirm(`Remove waitlist entry ${reference}?`)) return;
    const response = await fetch(`/api/admin/waitlist?reference=${encodeURIComponent(reference)}`, { method: "DELETE" });
    const data = (await response.json()) as { error?: string };
    if (!response.ok) { setError(data.error ?? "Unable to remove waitlist entry."); return; }
    await loadRequests();
  }
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }); setAuthenticated(false);
  }
  function clearFilters() {
    setTab("all");
    setDateFilter("");
    setShiftFilter("");
    setSearch("");
  }

  const allRows = useMemo(() => [...requests, ...waitlist], [requests, waitlist]);
  const filterableRows = useMemo(() => allRows
    .filter((request) =>
      (!dateFilter || request.date.slice(0, 10) === dateFilter) &&
      (!shiftFilter || request.shiftId === shiftFilter) &&
      (!search || `${request.fullName} ${request.phone} ${request.reference} ${request.organization}`.toLowerCase().includes(search.toLowerCase()))
    ), [allRows, dateFilter, shiftFilter, search]);
  const filtered = useMemo(() => allRows
    .filter((request) => (tab === "all" || request.status === tab) &&
      (!dateFilter || request.date.slice(0, 10) === dateFilter) &&
      (!shiftFilter || request.shiftId === shiftFilter) &&
      (!search || `${request.fullName} ${request.phone} ${request.reference} ${request.organization}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`)), [allRows, tab, dateFilter, shiftFilter, search]);
  const availableShifts = useMemo(() => [...new Set(allRows.map((request) => request.shiftId))], [allRows]);
  const scheduleDates = useMemo(() => [...new Set(schedule.map((row) => row.date))].sort(), [schedule]);
  const counts = { pending: requests.filter((r) => r.status === "pending").length, confirmed: requests.filter((r) => r.status === "confirmed").length };
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(calendarMonth);

  if (!authenticated) return (
    <main className="admin-page"><section className="admin-login">
      <p className="eyebrow eyebrow--dark">Light The World · Admin</p><h1>Coordinator sign in</h1>
      <p>Review volunteer requests and confirm the schedule.</p>
      <form onSubmit={handleLogin}><label>Admin password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button" disabled={loading} type="submit">{loading ? "Signing in…" : "Sign in"} <span>→</span></button>
      </form>
    </section></main>
  );

  return <main className="admin-page"><div className="shell admin-dashboard">
    <header className="admin-header"><div><p className="eyebrow eyebrow--dark">Light The World · Admin</p><h1>Volunteer bookings</h1></div><button className="button button--secondary admin-logout" onClick={logout} type="button">Sign out</button></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-stats"><div><strong>{counts.pending}</strong><span>Pending review</span></div><div><strong>{counts.confirmed}</strong><span>Confirmed</span></div><div><strong>{waitlist.length}</strong><span>Waitlisted</span></div></div>
    <div className="admin-content-layout"><AdminNav /><div className="admin-layout">
      <aside className="admin-calendar">
        <div className="admin-calendar__header"><button className="calendar__nav" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1, 12))} type="button">‹</button><strong>{monthLabel}</strong><button className="calendar__nav" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1, 12))} type="button">›</button></div>
        <div className="calendar__weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <span key={`${day}-${i}`}>{day}</span>)}</div>
        <div className="calendar__grid">{calendarDays(calendarMonth).map((day, i) => day === null ? <span className="calendar__empty" key={`empty-${i}`} /> : <button className={`calendar__day${dateFilter === keyFor(calendarMonth, day) ? " calendar__day--selected" : ""}`} key={keyFor(calendarMonth, day)} onClick={() => setDateFilter(dateFilter === keyFor(calendarMonth, day) ? "" : keyFor(calendarMonth, day))} type="button">{day}{allRows.some((request) => request.date.slice(0, 10) === keyFor(calendarMonth, day)) && <i />}</button>)}</div>
        {dateFilter && <button className="clear-filter" onClick={clearFilters} type="button">Clear all filters</button>}
      </aside>
      <section className="admin-table-wrap">
        <div className="admin-table-heading"><div><h2>All volunteer requests</h2><p>{filtered.length} result{filtered.length === 1 ? "" : "s"}{dateFilter ? ` on ${formatDate(dateFilter)}` : ""}</p></div><button className="refresh-button" onClick={() => loadRequests()} type="button">Refresh ↻</button></div>
        <div className="status-tabs">{statusTabs.map((item) => <button className={tab === item.id ? "status-tab status-tab--active" : "status-tab"} key={item.id} onClick={() => setTab(item.id)} type="button">{item.label} <span>{item.id === "all" ? filterableRows.length : filterableRows.filter((r) => r.status === item.id).length}</span></button>)}</div>
        <div className="admin-filters">
          <label>Search<input value={search} placeholder="Name, phone, reference, organization" onChange={(event) => setSearch(event.target.value)} /></label>
          <label>Shift<select value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}><option value="">All shifts</option>{availableShifts.sort().map((shift) => <option key={shift} value={shift}>{shift.endsWith("-day") ? "Day shift" : "Evening shift"} · {formatDate(shift.slice(0, 10))}</option>)}</select></label>
          {(search || dateFilter || shiftFilter || tab !== "all") && <button className="clear-filter admin-clear-filters" onClick={clearFilters} type="button">Clear all filters</button>}
        </div>
        {filtered.length === 0 ? <p className="empty-state">No requests match these filters.</p> : <div className="admin-table-scroll"><table className="admin-bookings-table"><thead><tr><th>Volunteer</th><th>Schedule</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>{filtered.map((request) => <tr key={request.reference}><td data-label="Volunteer"><strong>{request.fullName}</strong><small>{request.reference}</small><small>{request.organization}</small></td><td data-label="Schedule"><strong>{formatDate(request.date)}</strong><small>{request.shiftLabel} · {formatTime12(request.startTime)}–{formatTime12(request.endTime)}</small></td><td data-label="Contact"><small>{request.phone}</small><small>{request.leaderName}</small><small>{request.leaderPhone || "Leader contact not provided"}</small></td><td data-label="Status"><span className={`status status--${request.status}`}>{request.status === "rejected" ? "denied" : request.status}</span></td><td data-label="Actions"><div className="table-actions">{request.status === "pending" && <><button className="action-confirm" onClick={() => changeStatus(request.reference, "confirmed")} type="button">Confirm</button><button className="action-reject" onClick={() => changeStatus(request.reference, "rejected")} type="button">Deny</button></>}{request.status === "waitlisted" && <><button className="action-confirm" onClick={() => promoteWaitlist(request.reference)} type="button">Promote</button><button className="action-delete" onClick={() => removeWaitlist(request.reference)} type="button">Remove</button></>}{request.status !== "waitlisted" && <><button className="action-edit" onClick={() => setEditing(request)} type="button">Edit</button><button className="action-delete" onClick={() => deleteRequest(request.reference)} type="button">Delete</button></>}</div></td></tr>)}</tbody></table></div>}
      </section>
    </div></div>
    {editing && <div className="modal-backdrop" role="presentation"><form className="edit-modal" onSubmit={async (event) => { event.preventDefault(); const data = new FormData(event.currentTarget); const saved = await updateRequest({ reference: editing.reference, shiftId: String(data.get("shiftId")), fullName: String(data.get("fullName")), phone: String(data.get("phone")), organization: String(data.get("organization")), leaderName: String(data.get("leaderName")), leaderPhone: String(data.get("leaderPhone")) }); if (saved) setEditing(null); }}><div className="edit-modal__header"><h2>Edit booking</h2><button type="button" onClick={() => setEditing(null)} aria-label="Close edit form">×</button></div><p className="reference">{editing.reference} · current: {formatDate(editing.date)} · {editing.shiftLabel}</p><label>Booking date<select name="shiftId" defaultValue={editing.shiftId} required>{scheduleDates.map((date) => <optgroup key={date} label={formatDate(date)}>{schedule.filter((row) => row.date === date).map((row) => <option key={row.shiftId} value={row.shiftId}>{row.label} · {formatTime12(row.startTime)}–{formatTime12(row.endTime)}</option>)}</optgroup>)}</select></label><label>Full name<input name="fullName" defaultValue={editing.fullName} required /></label><label>Mobile number<input name="phone" defaultValue={editing.phone} required /></label><label>Ward / organization<input name="organization" defaultValue={editing.organization} required /></label><label>Bishop / Branch President name<input name="leaderName" defaultValue={editing.leaderName} required /></label><label>Leader contact <span className="optional">(optional)</span><input name="leaderPhone" defaultValue={editing.leaderPhone} /></label><div className="edit-modal__actions"><button className="button button--secondary" onClick={() => setEditing(null)} type="button">Cancel</button><button className="button" type="submit">Save changes</button></div></form></div>}
  </div></main>;
}
