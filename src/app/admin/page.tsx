"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Menu, X } from "lucide-react";
import Swal from "sweetalert2";

type Status = "pending" | "confirmed" | "rejected" | "cancelled" | "waitlisted";
type RequestRow = {
  reference: string;
  groupReference: string;
  shiftId: string;
  date: string;
  shiftLabel: string;
  startTime: string;
  endTime: string;
  stakeDistrict: string;
  fullName: string;
  phone: string;
  organization: string;
  status: Status;
  createdAt: string;
};
type WaitlistRow = Omit<RequestRow, "status"> & { status: "waitlisted" };
type ScheduleRow = { shiftId: string; date: string; label: string; startTime: string; endTime: string; capacity: number; bookingCount: number; waitlistCount: number };

const statusTabs: { id: "all" | Status; label: string }[] = [
  { id: "all", label: "All" }, { id: "pending", label: "Pending" },
  { id: "confirmed", label: "Confirmed" }, { id: "rejected", label: "Denied" }, { id: "waitlisted", label: "Waitlisted" },
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

function showLoadingAlert(title: string, text: string) {
  void Swal.fire({
    title,
    text,
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    didOpen: () => Swal.showLoading(),
  });
}

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<"all" | Status>("all");
  const [dateFilter, setDateFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [stakeFilter, setStakeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [pageSize, setPageSize] = useState(20);
  const [currentPage, setCurrentPage] = useState(1);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 10, 1, 12));
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);

  useEffect(() => {
    loadRequests().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Unable to load requests.");
      setAuthenticated(false);
    });
  }, []);

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
  async function refreshRequests() {
    showLoadingAlert("Refreshing requests", "Please wait while we reload the latest booking information.");
    try {
      await loadRequests();
    } catch (refreshError) {
      await Swal.fire({
        icon: "error",
        title: "Refresh failed",
        text: refreshError instanceof Error ? refreshError.message : "Unable to refresh requests.",
        confirmButtonColor: "#d50032",
      });
    } finally {
      Swal.close();
    }
  }
  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setLoading(true);
    showLoadingAlert("Signing in", "Please wait while we load the admin dashboard.");
    try {
      const response = await fetch("/api/admin/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Login failed.");
      setPassword(""); await loadRequests();
    } catch (loginError) { setError(loginError instanceof Error ? loginError.message : "Login failed."); }
    finally { Swal.close(); }
    setLoading(false);
  }
  async function changeStatus(reference: string, status: "confirmed" | "rejected") {
    const action = status === "confirmed" ? "confirm" : "deny";
    const result = await Swal.fire({
      icon: "question",
      title: `${status === "confirmed" ? "Confirm" : "Deny"} this request?`,
      text: `Booking reference: ${reference}`,
      showCancelButton: true,
      confirmButtonText: status === "confirmed" ? "Confirm request" : "Deny request",
      confirmButtonColor: status === "confirmed" ? "#198754" : "#d50032",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    await updateRequest({ reference, status }, `Request ${action}ed successfully.`);
  }
  async function updateRequest(body: Record<string, string>, successMessage = "Booking updated successfully.") {
    showLoadingAlert("Updating booking", "Please wait while we save the booking changes.");
    try {
      const response = await fetch("/api/admin/requests", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to update booking.");
      await loadRequests();
      Swal.close();
      await Swal.fire({ icon: "success", title: "Success", text: successMessage, confirmButtonColor: "#d50032" });
      return true;
    } catch (updateError) {
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Update failed",
        text: updateError instanceof Error ? updateError.message : "Unable to update booking.",
        confirmButtonColor: "#d50032",
      });
      return false;
    }
  }
  async function deleteRequest(reference: string) {
    const result = await Swal.fire({
      icon: "warning",
      title: "Delete this booking?",
      text: `${reference} will be permanently deleted. This cannot be undone.`,
      showCancelButton: true,
      confirmButtonText: "Delete booking",
      confirmButtonColor: "#d50032",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    showLoadingAlert("Deleting booking", "Please wait while we remove the booking.");
    try {
      const response = await fetch(`/api/admin/requests?reference=${encodeURIComponent(reference)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to delete booking.");
      await loadRequests();
      Swal.close();
      await Swal.fire({ icon: "success", title: "Booking deleted", text: "The booking was deleted successfully.", confirmButtonColor: "#d50032" });
    } catch (deleteError) {
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Delete failed",
        text: deleteError instanceof Error ? deleteError.message : "Unable to delete booking.",
        confirmButtonColor: "#d50032",
      });
    }
  }
  async function promoteWaitlist(reference: string) {
    const result = await Swal.fire({
      icon: "question",
      title: "Promote this volunteer?",
      text: `Booking reference: ${reference}`,
      showCancelButton: true,
      confirmButtonText: "Promote volunteer",
      confirmButtonColor: "#198754",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    showLoadingAlert("Promoting volunteer", "Please wait while we move this volunteer into booking review.");
    try {
      const response = await fetch("/api/admin/waitlist", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference }) });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to promote volunteer.");
      await loadRequests();
      Swal.close();
      await Swal.fire({ icon: "success", title: "Volunteer promoted", text: "The waitlisted volunteer is now a booking request.", confirmButtonColor: "#d50032" });
    } catch (promotionError) {
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Promotion failed",
        text: promotionError instanceof Error ? promotionError.message : "Unable to promote volunteer.",
        confirmButtonColor: "#d50032",
      });
    }
  }
  async function removeWaitlist(reference: string) {
    const result = await Swal.fire({
      icon: "warning",
      title: "Remove this waitlist entry?",
      text: `Booking reference: ${reference}`,
      showCancelButton: true,
      confirmButtonText: "Remove entry",
      confirmButtonColor: "#d50032",
      cancelButtonText: "Cancel",
    });
    if (!result.isConfirmed) return;
    showLoadingAlert("Removing waitlist entry", "Please wait while we remove this waitlist entry.");
    try {
      const response = await fetch(`/api/admin/waitlist?reference=${encodeURIComponent(reference)}`, { method: "DELETE" });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Unable to remove waitlist entry.");
      await loadRequests();
      Swal.close();
      await Swal.fire({ icon: "success", title: "Waitlist entry removed", text: "The waitlist entry was removed successfully.", confirmButtonColor: "#d50032" });
    } catch (removeError) {
      Swal.close();
      await Swal.fire({
        icon: "error",
        title: "Removal failed",
        text: removeError instanceof Error ? removeError.message : "Unable to remove waitlist entry.",
        confirmButtonColor: "#d50032",
      });
    }
  }
  async function logout() {
    showLoadingAlert("Signing out", "Please wait while we end your admin session.");
    try {
      await fetch("/api/admin/logout", { method: "POST" });
      setAuthenticated(false);
    } finally {
      Swal.close();
    }
  }
  function clearFilters() {
    setCurrentPage(1);
    setTab("all");
    setDateFilter("");
    setShiftFilter("");
    setStakeFilter("");
    setSearch("");
  }
  function clearDateFilter() {
    setCurrentPage(1);
    setDateFilter("");
    setCalendarOpen(false);
  }

  const allRows = useMemo(() => [...requests, ...waitlist], [requests, waitlist]);
  const stakeOptions = useMemo(
    () => [...new Set(allRows.map((request) => request.stakeDistrict).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [allRows],
  );
  const filterableRows = useMemo(
    () =>
      allRows.filter(
        (request) =>
          (!dateFilter || request.date.slice(0, 10) === dateFilter) &&
          (!shiftFilter || request.shiftId.endsWith(`-${shiftFilter}`)) &&
          (!stakeFilter || request.stakeDistrict === stakeFilter) &&
          (!search ||
            `${request.fullName} ${request.phone} ${request.reference} ${request.organization} ${request.stakeDistrict}`
              .toLowerCase()
              .includes(search.toLowerCase())),
      ),
    [allRows, dateFilter, shiftFilter, stakeFilter, search],
  );
  const filtered = useMemo(() => allRows
    .filter((request) => (tab === "all" || request.status === tab) &&
      (!dateFilter || request.date.slice(0, 10) === dateFilter) &&
      (!shiftFilter || request.shiftId.endsWith(`-${shiftFilter}`)) &&
      (!stakeFilter || request.stakeDistrict === stakeFilter) &&
      (!search || `${request.fullName} ${request.phone} ${request.reference} ${request.organization} ${request.stakeDistrict}`.toLowerCase().includes(search.toLowerCase())))
    .sort((a, b) => `${a.date}-${a.createdAt}`.localeCompare(`${b.date}-${b.createdAt}`)), [allRows, tab, dateFilter, shiftFilter, stakeFilter, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const visiblePage = Math.min(currentPage, pageCount);
  const pageRows = filtered.slice((visiblePage - 1) * pageSize, visiblePage * pageSize);
  const firstVisibleRow = filtered.length === 0 ? 0 : (visiblePage - 1) * pageSize + 1;
  const lastVisibleRow = Math.min(visiblePage * pageSize, filtered.length);

  const scheduleDates = useMemo(() => [...new Set(schedule.map((row) => row.date))].sort(), [schedule]);
  const counts = { pending: requests.filter((r) => r.status === "pending").length, confirmed: requests.filter((r) => r.status === "confirmed").length };
  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(calendarMonth);

  if (authenticated === null) return (
    <main className="admin-page"><section className="admin-login"><p className="eyebrow eyebrow--dark">Light The World · Admin</p><h1>Loading dashboard</h1><p>Checking your admin session…</p></section></main>
  );

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
    <header className="admin-header"><div><p className="eyebrow eyebrow--dark">Light The World · Admin</p><h1>Volunteer bookings</h1></div><button className="admin-menu-toggle" aria-expanded={menuOpen} aria-controls="admin-header-menu" aria-label={menuOpen ? "Close admin menu" : "Open admin menu"} onClick={() => setMenuOpen((open) => !open)} type="button">{menuOpen ? <X size={22} strokeWidth={1.8} /> : <Menu size={22} strokeWidth={1.8} />}</button><nav className={`admin-header-actions${menuOpen ? " admin-header-actions--open" : ""}`} id="admin-header-menu" aria-label="Admin sections"><a className="admin-nav__link admin-header-action admin-nav__link--active" href="/admin">Manage bookings</a><a className="admin-nav__link admin-header-action" href="/admin/schedule">Manage schedule</a><a className="admin-nav__link admin-header-action" href="/admin/overview" target="_blank" rel="noopener">View schedule</a><button className="admin-nav__link admin-header-action" onClick={logout} type="button">Sign out</button></nav></header>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="admin-stats"><div><strong>{counts.pending}</strong><span>Pending review</span></div><div><strong>{counts.confirmed}</strong><span>Confirmed</span></div><div><strong>{waitlist.length}</strong><span>Waitlisted</span></div></div>
    <section className="admin-table-wrap">
        <div className="admin-table-heading"><div><h2>All volunteer requests</h2><p>{filtered.length} result{filtered.length === 1 ? "" : "s"}{dateFilter ? ` on ${formatDate(dateFilter)}` : ""}</p></div><button className="refresh-button" onClick={refreshRequests} type="button">Refresh ↻</button></div>
        <div className="status-tabs">{statusTabs.map((item) => <button className={tab === item.id ? "status-tab status-tab--active" : "status-tab"} key={item.id} onClick={() => { setCurrentPage(1); setTab(item.id); }} type="button">{item.label} <span>{item.id === "all" ? filterableRows.length : filterableRows.filter((r) => r.status === item.id).length}</span></button>)}</div>
        <div className="admin-filters">
          <label>Search<input value={search} placeholder="Name, phone, reference, ward, or stake" onChange={(event) => { setCurrentPage(1); setSearch(event.target.value); }} /></label>
          <label>Shift<select value={shiftFilter} onChange={(event) => { setCurrentPage(1); setShiftFilter(event.target.value); }}><option value="">All shifts</option><option value="day">Day shift</option><option value="evening">Evening shift</option></select></label>
          <label>Stake / District<select value={stakeFilter} onChange={(event) => { setCurrentPage(1); setStakeFilter(event.target.value); }}><option value="">All stakes / districts</option>{stakeOptions.map((stake) => <option key={stake} value={stake}>{stake}</option>)}</select></label>
          <div className="date-filter">
            <span className="date-filter__label">Date</span>
            <button className="date-filter__trigger" aria-expanded={calendarOpen} onClick={() => setCalendarOpen((open) => !open)} type="button">{dateFilter ? formatDate(dateFilter) : "All dates"} <span aria-hidden="true">⌄</span></button>
            {calendarOpen && <div className="date-filter__popover" role="dialog" aria-label="Filter by date">
              <button className="date-filter__all" onClick={clearDateFilter} type="button">All dates</button>
              <div className="admin-calendar__header"><button className="calendar__nav" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1, 12))} type="button" aria-label="Previous month">‹</button><strong>{monthLabel}</strong><button className="calendar__nav" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1, 12))} type="button" aria-label="Next month">›</button></div>
              <div className="calendar__weekdays">{["S", "M", "T", "W", "T", "F", "S"].map((day, i) => <span key={`${day}-${i}`}>{day}</span>)}</div>
              <div className="calendar__grid">{calendarDays(calendarMonth).map((day, i) => day === null ? <span className="calendar__empty" key={`empty-${i}`} /> : <button className={`calendar__day${dateFilter === keyFor(calendarMonth, day) ? " calendar__day--selected" : ""}`} key={keyFor(calendarMonth, day)} onClick={() => { setCurrentPage(1); setDateFilter(keyFor(calendarMonth, day)); setCalendarOpen(false); }} type="button">{day}{allRows.some((request) => request.date.slice(0, 10) === keyFor(calendarMonth, day)) && <i />}</button>)}</div>
            </div>}
          </div>
          {(search || dateFilter || shiftFilter || stakeFilter || tab !== "all") && <button className="clear-filter admin-clear-filters" onClick={clearFilters} type="button">Clear all filters</button>}
        </div>
        {filtered.length > 0 && <nav className="admin-pagination" aria-label="Booking results pagination">
          <label className="admin-pagination__size">Rows per page
            <select value={pageSize} onChange={(event) => { setCurrentPage(1); setPageSize(Number(event.target.value)); }}>
              {[10, 20, 50].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <span className="admin-pagination__summary">Showing {firstVisibleRow}–{lastVisibleRow} of {filtered.length}</span>
          <div className="admin-pagination__buttons">
            <button disabled={visiblePage <= 1} onClick={() => setCurrentPage(visiblePage - 1)} type="button">Previous</button>
            <span>Page {visiblePage} of {pageCount}</span>
            <button disabled={visiblePage >= pageCount} onClick={() => setCurrentPage(visiblePage + 1)} type="button">Next</button>
          </div>
        </nav>}
        {filtered.length === 0 ? <p className="empty-state">No requests match these filters.</p> : <div className="admin-table-scroll"><table className="admin-bookings-table"><thead><tr><th>Volunteer</th><th>Schedule</th><th>Contact</th><th>Status</th><th>Actions</th></tr></thead><tbody>{pageRows.map((request) => <tr key={request.reference}><td data-label="Volunteer"><strong>{request.fullName}</strong><small>{request.reference}</small><small>Group: {request.groupReference}</small><small>{request.organization}</small></td><td data-label="Schedule"><strong>{formatDate(request.date)}</strong><small>{request.shiftLabel} · {formatTime12(request.startTime)}–{formatTime12(request.endTime)}</small></td><td data-label="Contact">
          <small>{request.phone}</small>
          <small>Stake / District: {request.stakeDistrict}</small>
        </td><td data-label="Status"><span className={`status status--${request.status}`}>{request.status === "rejected" ? "denied" : request.status}</span></td><td data-label="Actions"><div className="table-actions">{request.status === "pending" && <><button className="action-confirm" onClick={() => changeStatus(request.reference, "confirmed")} type="button">Confirm</button><button className="action-reject" onClick={() => changeStatus(request.reference, "rejected")} type="button">Deny</button></>}{request.status === "waitlisted" && <><button className="action-confirm" onClick={() => promoteWaitlist(request.reference)} type="button">Promote</button><button className="action-delete" onClick={() => removeWaitlist(request.reference)} type="button">Remove</button></>}{request.status !== "waitlisted" && <><button className="action-edit" onClick={() => setEditing(request)} type="button">Edit</button><button className="action-delete" onClick={() => deleteRequest(request.reference)} type="button">Delete</button></>}</div></td></tr>)}</tbody></table></div>}
      </section>
    {editing && <div className="modal-backdrop" role="presentation"><form className="edit-modal" onSubmit={async (event) => {
      event.preventDefault(); const data = new FormData(event.currentTarget); const saved = await updateRequest({
        reference: editing.reference,
        shiftId: String(data.get("shiftId")),
        stakeDistrict: String(data.get("stakeDistrict")),
        fullName: String(data.get("fullName")),
        phone: String(data.get("phone")),
        organization: String(data.get("organization")),
      }); if (saved) setEditing(null);
    }}><div className="edit-modal__header"><h2>Edit booking</h2><button type="button" onClick={() => setEditing(null)} aria-label="Close edit form">×</button></div><p className="reference">{editing.reference} · current: {formatDate(editing.date)} · {editing.shiftLabel}</p><label>
        Booking date
        <select name="shiftId" defaultValue={editing.shiftId} required>
          {scheduleDates.map((date) => (
            <optgroup key={date} label={formatDate(date)}>
              {schedule
                .filter((row) => row.date === date)
                .map((row) => (
                  <option key={row.shiftId} value={row.shiftId}>
                    {row.label} · {formatTime12(row.startTime)}–
                    {formatTime12(row.endTime)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <label>
        Stake or District
        <select
          name="stakeDistrict"
          defaultValue={editing.stakeDistrict}
          required
        >
          {["Buhangin", "Davao", "Davao West", "Panabo", "Tagum", "Digos"].map(
            (name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ),
          )}
        </select>
      </label>

      <label>
        Ward or Branch
        <input
          name="organization"
          defaultValue={editing.organization}
          required
          maxLength={160}
        />
      </label>

      <label>
        Full name
        <input
          name="fullName"
          defaultValue={editing.fullName}
          required
          maxLength={120}
        />
      </label>

      <label>
        Mobile number
        <input
          name="phone"
          type="tel"
          inputMode="tel"
          defaultValue={editing.phone}
          required
          pattern="(09[0-9]{9}|\+639[0-9]{9}|9[0-9]{9})"
          title="Use 09123456789, +639123456789, or 9123456789"
        />
      </label><div className="edit-modal__actions"><button className="button button--secondary" onClick={() => setEditing(null)} type="button">Cancel</button><button className="button" type="submit">Save changes</button></div></form></div>}
  </div></main>;
}
