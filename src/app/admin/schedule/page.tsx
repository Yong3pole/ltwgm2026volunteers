"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminNav from "../AdminNav";

type ScheduleRow = {
  shiftId: string; date: string; label: string; startTime: string; endTime: string;
  capacity: number; bookingCount: number; waitlistCount: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${value}T12:00:00+08:00`));
}
function formatTime12(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export default function SchedulePage() {
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [error, setError] = useState("");
  const [authenticated, setAuthenticated] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);

  async function loadSchedule() {
    const response = await fetch("/api/admin/schedule");
    const data = (await response.json()) as { schedule?: ScheduleRow[]; error?: string };
    if (response.status === 401) { setAuthenticated(false); return; }
    if (!response.ok) throw new Error(data.error ?? "Unable to load schedule.");
    setSchedule(data.schedule ?? []);
  }
  useEffect(() => {
    fetch("/api/admin/schedule").then(async (response) => {
      const data = (await response.json()) as { schedule?: ScheduleRow[]; error?: string };
      if (response.status === 401) { setAuthenticated(false); return; }
      if (!response.ok) throw new Error(data.error ?? "Unable to load schedule.");
      setSchedule(data.schedule ?? []);
    }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load schedule."));
  }, []);

  async function addSchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const response = await fetch("/api/admin/schedule", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: data.get("date"), sourceDate: data.get("sourceDate") || undefined }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) { setError(result.error ?? "Unable to add schedule date."); return; }
    event.currentTarget.reset(); await loadSchedule();
  }
  async function saveSchedule(event: FormEvent<HTMLFormElement>, currentDate: string) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const rows = schedule.filter((row) => row.date === currentDate);
    const response = await fetch("/api/admin/schedule", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      currentDate, date: data.get("date"), shifts: rows.map((row, index) => ({ shiftId: row.shiftId, startTime: data.get(`startTime-${index}`), endTime: data.get(`endTime-${index}`), capacity: Number(data.get(`capacity-${index}`)) })),
    }) });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) { setError(result.error ?? "Unable to update schedule."); return; }
    setEditing(null); await loadSchedule();
  }
  async function removeSchedule(date: string) {
    if (!window.confirm(`Remove the schedule for ${formatDate(date)}?`)) return;
    const response = await fetch(`/api/admin/schedule?date=${encodeURIComponent(date)}`, { method: "DELETE" });
    const result = (await response.json()) as { error?: string };
    if (!response.ok) { setError(result.error ?? "Unable to remove schedule."); return; }
    await loadSchedule();
  }

  const dates = useMemo(() => [...new Set(schedule.map((row) => row.date))].sort(), [schedule]);
  if (!authenticated) return <main className="admin-page"><section className="admin-login"><p className="eyebrow eyebrow--dark">Light The World · Admin</p><h1>Sign in required</h1><p>Please sign in from the bookings page before opening schedule management.</p><Link className="button" href="/admin">Go to admin sign in <span>→</span></Link></section></main>;

  return <main className="admin-page"><div className="shell admin-dashboard">
    <header className="admin-header"><div><p className="eyebrow eyebrow--dark">Light The World · Admin</p><h1>Manage schedule</h1></div><Link className="button button--secondary admin-logout" href="/admin">Manage bookings</Link></header>
    <div className="admin-content-layout"><AdminNav /><section className="schedule-manager schedule-manager-page">
      <div className="schedule-manager__header"><div><p className="eyebrow eyebrow--dark">Schedule management</p><h2>Event dates and shifts</h2><p>Add dates, adjust shift times, or copy a schedule. Dates with active requests cannot be removed.</p></div>
        <form className="schedule-add" onSubmit={addSchedule}><label>Add date<input name="date" type="date" required /></label><label>Copy from<select name="sourceDate"><option value="">Default shifts</option>{dates.map((date) => <option key={date} value={date}>{formatDate(date)}</option>)}</select></label><button className="button" type="submit">Add date</button></form>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="schedule-list">{dates.map((date) => {
        const rows = schedule.filter((row) => row.date === date);
        const bookings = rows.reduce((sum, row) => sum + Number(row.bookingCount), 0);
        const waitlisted = rows.reduce((sum, row) => sum + Number(row.waitlistCount), 0);
        return <div className="schedule-card" key={date}><div className="schedule-card__heading"><div><strong>{formatDate(date)}</strong><small>{bookings} booking{bookings === 1 ? "" : "s"} · {waitlisted} waitlisted</small></div><div><button className="action-edit" onClick={() => setEditing(date)} type="button">Edit</button><button className="action-delete" disabled={bookings > 0 || waitlisted > 0} onClick={() => removeSchedule(date)} type="button">Remove</button></div></div><div className="schedule-card__shifts">{rows.map((row) => <div key={row.shiftId}><strong>{row.label}</strong><span>{formatTime12(row.startTime)}–{formatTime12(row.endTime)} · capacity {row.capacity}</span></div>)}</div></div>;
      })}</div>
    </section></div>
    {editing && <div className="modal-backdrop" role="presentation"><form className="edit-modal" onSubmit={(event) => saveSchedule(event, editing)}><div className="edit-modal__header"><h2>Edit schedule</h2><button type="button" onClick={() => setEditing(null)} aria-label="Close schedule form">×</button></div><p className="reference">Existing bookings remain attached to their shift.</p><label>Schedule date<input name="date" type="date" defaultValue={editing} required /></label>{schedule.filter((row) => row.date === editing).map((row, index) => <fieldset className="schedule-fieldset" key={row.shiftId}><legend>{row.label}</legend><label>Start time<input name={`startTime-${index}`} type="time" defaultValue={row.startTime} required /></label><label>End time<input name={`endTime-${index}`} type="time" defaultValue={row.endTime} required /></label><label>Capacity<input name={`capacity-${index}`} type="number" min="1" max="99" defaultValue={row.capacity} required /></label></fieldset>)}<div className="edit-modal__actions"><button className="button button--secondary" onClick={() => setEditing(null)} type="button">Cancel</button><button className="button" type="submit">Save schedule</button></div></form></div>}
  </div></main>;
}
