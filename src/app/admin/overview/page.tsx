"use client";

import { useEffect, useMemo, useState } from "react";

type ScheduleRow = {
  shiftId: string;
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
};

type RequestRow = {
  reference: string;
  shiftId: string;
  stakeDistrict: string;
  fullName: string;
  phone: string;
  organization: string;
  status: "pending" | "confirmed" | "rejected" | "cancelled";
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(new Date(`${value.slice(0, 10)}T12:00:00+08:00`));
}

function formatTime(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours >= 12 ? "PM" : "AM"}`;
}

export default function AdminOverviewPage() {
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/overview")
      .then(async (response) => {
        const data = await response.json() as {
          schedule?: ScheduleRow[];
          requests?: RequestRow[];
          error?: string;
        };
        if (!response.ok) throw new Error(data.error ?? "Unable to load the overview.");
        setSchedule(data.schedule ?? []);
        setRequests(data.requests ?? []);
      })
      .catch((loadError) => {
        setError(loadError instanceof Error ? loadError.message : "Unable to load the overview.");
      })
      .finally(() => setLoading(false));
  }, []);

  const dates = useMemo(() => [...new Set(schedule.map((row) => row.date))], [schedule]);
  const maxCapacity = useMemo(
    () => Math.max(...schedule.map((shift) => shift.capacity), 1),
    [schedule],
  );

  if (loading) {
    return <main className="admin-page overview-page"><div className="shell overview-container"><p className="empty-state">Loading schedule overview…</p></div></main>;
  }

  if (error) {
    return (
      <main className="admin-page overview-page">
        <div className="shell overview-container">
          <p className="form-error" role="alert">{error}</p>
          <a className="button button--secondary overview-action" href="/admin">Back to dashboard</a>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-page overview-page">
      <div className="shell overview-container">
        <header className="overview-header">
          <div>
            <p className="eyebrow eyebrow--dark">Light The World · Admin</p>
            <h1 className="overview-title">Schedule overview</h1>
            <p className="overview-intro">A quick view of every date, shift, and available slot.</p>
          </div>
          <div className="overview-actions">
            <button className="button button--secondary overview-action" onClick={() => window.print()} type="button">Print overview</button>
            <a className="button button--secondary overview-action" href="/admin">Back to dashboard</a>
          </div>
        </header>

        <div className="overview-sheet">
          <div className="overview-sheet__bar">
            <strong>Volunteer schedule</strong>
            <span>{dates.length} dates · {schedule.length} shifts · GMT+8</span>
          </div>
          <div className="overview-sheet__scroll">
            <table className="overview-grid">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Shift &amp; time</th>
                  {Array.from({ length: maxCapacity }, (_, index) => <th key={index}>Slot {index + 1}</th>)}
                </tr>
              </thead>
              <tbody>
                {dates.flatMap((date) => {
                  const dateShifts = schedule.filter((row) => row.date === date);
                  return dateShifts.map((shift, shiftIndex) => {
                    const bookings = requests.filter((request) =>
                      request.shiftId === shift.shiftId &&
                      (request.status === "pending" || request.status === "confirmed")
                    );
                    return (
                      <tr className={shiftIndex === 0 ? "overview-grid__first-row" : ""} key={shift.shiftId}>
                        <th className="overview-grid__date">{shiftIndex === 0 ? formatDate(date) : ""}</th>
                        <th className="overview-grid__shift">{shift.label}<span className="overview-grid__time">{formatTime(shift.startTime)} – {formatTime(shift.endTime)}</span></th>
                          {Array.from({ length: shift.capacity }, (_, index) => {
                            const booking = bookings[index];
                            return (
                              <td className={`overview-grid__slot ${booking ? `overview-grid__slot--${booking.status}` : "overview-grid__slot--open"}`} key={booking?.reference ?? `${shift.shiftId}-open-${index}`}>
                                {booking ? (
                                  <span className="overview-grid__details">
                                    <strong>{booking.fullName}</strong>
                                    <span className="overview-grid__status">{booking.status}</span>
                                    <small>{booking.stakeDistrict} · {booking.organization}</small>
                                    <small>{booking.phone}</small>
                                  </span>
                                ) : (
                                  <span className="overview-grid__details">
                                    <strong>OPEN</strong>
                                    <small>Available</small>
                                  </span>
                                )}
                              </td>
                            );
                          })}
                          {Array.from({ length: maxCapacity - shift.capacity }, (_, index) => (
                            <td className="overview-grid__slot overview-grid__slot--unused" key={`${shift.shiftId}-unused-${index}`}>—</td>
                          ))}
                      </tr>
                    );
                  });
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}
