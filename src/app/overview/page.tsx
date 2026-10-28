"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type ScheduleRow = { shiftId: string; date: string; label: string; startTime: string; endTime: string; capacity: number; bookingCount: number };
type RequestRow = { shiftId: string; stakeDistrict: string; fullName: string; phone: string; organization: string; status: "pending" | "confirmed" | "rejected" | "cancelled" };
type WaitlistRow = Omit<RequestRow, "status">;

function VolunteerList({ volunteers, queue = false }: { volunteers: RequestRow[] | WaitlistRow[]; queue?: boolean }) {
  if (volunteers.length === 0) return <span className="overview-grid__empty">—</span>;

  return (
    <div className="overview-grid__people">
      {volunteers.map((volunteer, index) => (
        <article className="overview-person" key={`${volunteer.fullName}-${volunteer.phone}-${index}`}>
          <strong>{queue && <span className="overview-person__queue">#{index + 1} </span>}{volunteer.fullName}</strong>
          <small>{volunteer.stakeDistrict} · {volunteer.organization}</small>
          <small>{volunteer.phone}</small>
        </article>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "Asia/Manila" }).format(new Date(`${value.slice(0, 10)}T12:00:00+08:00`));
}

function formatTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export default function PublicOverviewPage() {
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/overview")
      .then(async (response) => {
        const data = await response.json() as { schedule?: ScheduleRow[]; requests?: RequestRow[]; waitlist?: WaitlistRow[]; error?: string };
        if (!response.ok) throw new Error(data.error ?? "Unable to load the overview.");
        setSchedule(data.schedule ?? []);
        setRequests(data.requests ?? []);
        setWaitlist(data.waitlist ?? []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Unable to load the overview."))
      .finally(() => setLoading(false));
  }, []);

  const dates = useMemo(() => [...new Set(schedule.map((row) => row.date))], [schedule]);
  if (loading) return <main className="admin-page overview-page"><div className="shell overview-container"><p className="empty-state">Loading volunteer overview…</p></div></main>;
  if (error) return <main className="admin-page overview-page"><div className="shell overview-container"><p className="form-error" role="alert">{error}</p><Link className="button button--secondary overview-action" href="/">Back to volunteering</Link></div></main>;

  return (
    <main className="admin-page overview-page">
      <div className="shell overview-container">
        <header className="overview-header">
          <div>
            <p className="eyebrow eyebrow--dark">Light The World · Volunteers</p>
            <h1 className="overview-title">Volunteer overview</h1>
            <p className="overview-intro">See confirmed volunteers, requests awaiting review, and the waitlist for each shift.</p>
          </div>
          <div className="overview-actions">
            <button className="button button--secondary overview-action" onClick={() => window.print()} type="button">Print overview</button>
            <Link className="button button--secondary overview-action" href="/">Back to volunteering</Link>
          </div>
        </header>
        <div className="overview-sheet">
          <div className="overview-sheet__bar"><strong>Volunteer schedule</strong><span>{dates.length} dates · {schedule.length} shifts · GMT+8</span></div>
          <div className="overview-sheet__scroll">
                <table className="overview-grid">
                  <thead><tr><th>Date</th><th>Shift &amp; time</th><th>Confirmed</th><th>Pending review</th><th>Waitlist</th></tr></thead>
                  <tbody>
                    {dates.flatMap((date) => schedule.filter((row) => row.date === date).map((shift, shiftIndex) => {
                      const confirmed = requests.filter((request) => request.shiftId === shift.shiftId && request.status === "confirmed");
                      const pending = requests.filter((request) => request.shiftId === shift.shiftId && request.status === "pending");
                      const queued = waitlist.filter((request) => request.shiftId === shift.shiftId);
                      const reserved = confirmed.length + pending.length;
                      return (
                        <tr className={shiftIndex === 0 ? "overview-grid__first-row" : ""} key={shift.shiftId}>
                          <th className="overview-grid__date">{shiftIndex === 0 ? formatDate(date) : ""}</th>
                          <th className="overview-grid__shift">
                            {shift.label}
                            <span className="overview-grid__time">{formatTime(shift.startTime)} – {formatTime(shift.endTime)}</span>
                            <span className="overview-grid__capacity">{reserved} of {shift.capacity} spots reserved · {Math.max(shift.capacity - reserved, 0)} open</span>
                          </th>
                          <td className="overview-grid__group overview-grid__group--confirmed"><VolunteerList volunteers={confirmed} /></td>
                          <td className="overview-grid__group overview-grid__group--pending"><VolunteerList volunteers={pending} /></td>
                          <td className="overview-grid__group overview-grid__group--waitlist"><VolunteerList volunteers={queued} queue /></td>
                        </tr>
                      );
                    }))}
                  </tbody>
                </table>
          </div>
        </div>
      </div>
    </main>
  );
}
