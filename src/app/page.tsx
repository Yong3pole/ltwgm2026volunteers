"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

const scheduleStart = new Date("2026-11-28T12:00:00+08:00");
const scheduleEnd = new Date("2027-01-10T12:00:00+08:00");

const shifts = [
  { id: "morning", label: "Day shift", time: "10:00 AM – 4:00 PM" },
  { id: "evening", label: "Evening shift", time: "3:00 PM – 9:00 PM" },
];

type Availability = {
  shiftId: string;
  date: string;
  capacity: number;
  reserved: number;
};

function getDates(start: Date, end: Date) {
  const dates: Date[] = [];
  const current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

const eventDates = getDates(scheduleStart, scheduleEnd);

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getCalendarDays(month: Date) {
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1, 12);
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0, 12);
  const days: (Date | null)[] = Array.from({ length: firstDay.getDay() }, () => null);

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    days.push(new Date(month.getFullYear(), month.getMonth(), day, 12));
  }

  return days;
}

export default function Home() {
  const [selectedDate, setSelectedDate] = useState(eventDates[0]);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 10, 1, 12));
  const [selectedShift, setSelectedShift] = useState(shifts[0].id);
  const [submitted, setSubmitted] = useState(false);
  const [reference, setReference] = useState("");
  const [waitlisted, setWaitlisted] = useState(false);
  const [availability, setAvailability] = useState<Availability[]>([]);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/availability")
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to load availability.");
        const data = (await response.json()) as { shifts: Availability[] };
        setAvailability(data.shifts);
      })
      .catch(() => setError("Live availability is not connected yet. Please try again shortly."));
  }, []);

  const selectedDateKey = dateKey(selectedDate);
  const calendarDays = getCalendarDays(calendarMonth);
  const calendarMonthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(calendarMonth);
  const firstCalendarMonth = calendarMonth.getFullYear() === 2026 && calendarMonth.getMonth() === 10;
  const lastCalendarMonth = calendarMonth.getFullYear() === 2027 && calendarMonth.getMonth() === 0;
  function getSpotsOpen(shiftId: string) {
    const shiftSuffix = shiftId === "morning" ? "day" : "evening";
    const shiftAvailability = availability.find(
      (item) => item.date === selectedDateKey && item.shiftId === `${selectedDateKey}-${shiftSuffix}`,
    );
    return shiftAvailability
      ? Math.max(shiftAvailability.capacity - shiftAvailability.reserved, 0)
      : 2;
  }

  const selectedDateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        dateStyle: "full",
        timeZone: "Asia/Manila",
      }).format(selectedDate),
    [selectedDate],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const formData = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shiftId: `${selectedDateKey}-${selectedShift === "morning" ? "day" : "evening"}`,
          fullName: formData.get("name"),
          phone: formData.get("phone"),
          organization: formData.get("organization"),
          leaderName: formData.get("leaderName"),
          leaderPhone: formData.get("leaderPhone"),
        }),
      });
      const data = (await response.json()) as { error?: string; reference?: string; waitlisted?: boolean };

      if (!response.ok) {
        throw new Error(data.error ?? "We could not save your request.");
      }

      setReference(data.reference ?? "");
      setWaitlisted(data.waitlisted ?? false);
      setSubmitted(true);
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "We could not save your request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <section className="hero">
        <div className="hero__glow" />
        <nav className="shell nav">
          <Link className="brand" href="/" aria-label="Light The World home">
            <span className="brand__mark">✦</span>
            <span>
              <strong>Light The World</strong>
              <small>Giving Machines</small>
            </span>
          </Link>
          <Link className="nav__admin" href="/admin">
            Admin sign in <span aria-hidden="true">↗</span>
          </Link>
        </nav>

        <div className="shell hero__content">
          <div className="hero__copy">
            <p className="eyebrow">Volunteer scheduling · Davao</p>
            <h1>Give your time.<br /><em>Light the world.</em></h1>
            <p className="hero__intro">
              Join us at the Light The World Giving Machines. Choose a date
              and shift that works for you, then submit your request for
              coordinator confirmation.
            </p>
            <div className="hero__details">
              <span><b>Nov 28</b> – <b>Jan 10</b>, 2027</span>
              <span className="dot" />
              <span>GMT+8 · Davao</span>
            </div>
          </div>
          <div className="hero__art" aria-label="Logo placeholder">
            <div className="hero__sun">✦</div>
            <span>Logo space</span>
            <small>Your event logo can go here</small>
          </div>
        </div>
      </section>

      <section className="shell booking-layout">
        <div className="booking-main">
          <div className="section-heading">
            <div>
              <p className="eyebrow eyebrow--dark">01 · Choose your schedule</p>
              <h2>When can you serve?</h2>
            </div>
            <span className="timezone">All times GMT+8</span>
          </div>

          <div className="calendar" aria-label="Choose a volunteer date">
            <div className="calendar__header">
              <button
                className="calendar__nav"
                disabled={firstCalendarMonth}
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1, 12))}
                type="button"
                aria-label="Previous month"
              >
                ‹
              </button>
              <strong>{calendarMonthLabel}</strong>
              <button
                className="calendar__nav"
                disabled={lastCalendarMonth}
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1, 12))}
                type="button"
                aria-label="Next month"
              >
                ›
              </button>
            </div>
            <div className="calendar__weekdays" aria-hidden="true">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => <span key={weekday}>{weekday}</span>)}
            </div>
            <div className="calendar__grid">
              {calendarDays.map((date, index) => {
                if (!date) return <span className="calendar__empty" key={`empty-${index}`} />;
                const key = dateKey(date);
                const isAvailable = key >= dateKey(scheduleStart) && key <= dateKey(scheduleEnd);
                const isSelected = key === selectedDateKey;
                return (
                  <button
                    className={`calendar__day${isSelected ? " calendar__day--selected" : ""}${!isAvailable ? " calendar__day--disabled" : ""}`}
                    disabled={!isAvailable}
                    key={key}
                    onClick={() => setSelectedDate(date)}
                    type="button"
                    aria-label={isAvailable ? `Choose ${formatDate(date)}` : `${formatDate(date)} unavailable`}
                    aria-pressed={isSelected}
                  >
                    {date.getDate()}
                    {isAvailable && <i aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
            <p className="calendar__hint"><span aria-hidden="true" /> Available dates are marked with a dot</p>
          </div>

          <div className="chosen-date">
            <span className="chosen-date__icon">◷</span>
            <div>
              <small>Selected date</small>
              <strong>{selectedDateLabel}</strong>
            </div>
          </div>

          <div className="shift-list">
            {shifts.map((shift) => {
              const isSelected = selectedShift === shift.id;
              return (
                <button
                  className={`shift-card${isSelected ? " shift-card--selected" : ""}`}
                  key={shift.id}
                  onClick={() => setSelectedShift(shift.id)}
                  type="button"
                  aria-pressed={isSelected}
                >
                  <span className={`radio${isSelected ? " radio--selected" : ""}`} />
                  <span className="shift-card__copy">
                    <strong>{shift.label}</strong>
                    <span>{shift.time}</span>
                  </span>
                  <span className="availability"><b>{getSpotsOpen(shift.id)}</b> spots open</span>
                </button>
              );
            })}
          </div>

          <div className="notice">
            <span>i</span>
            <p>Your request will hold a spot while it is reviewed. A coordinator will confirm your booking through the admin dashboard.</p>
          </div>
        </div>

        <aside className="booking-panel">
          <div className="panel-top">
            <p className="eyebrow eyebrow--dark">02 · Your details</p>
            <h2>Request a shift</h2>
            <p>Complete the form below to request your volunteer schedule.</p>
          </div>
          {submitted ? (
            <div className="success-message">
              <div className="success-icon">✓</div>
              <p className="eyebrow eyebrow--dark">{waitlisted ? "Added to the waitlist" : "Request received"}</p>
              <h3>{waitlisted ? "You are on the waitlist." : "Thank you for volunteering."}</h3>
              <p>{waitlisted ? "That shift is currently full, so your details have been saved in case a spot opens." : "Your request is pending coordinator review and is holding a spot for this shift."}</p>
              <p className="reference">Reference: <strong>{reference}</strong></p>
              <button className="button button--secondary" onClick={() => setSubmitted(false)} type="button">Submit another request</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <label>
                Full name
                <input name="name" required placeholder="Your full name" />
              </label>
              <label>
                Mobile number
                <input name="phone" required placeholder="09XXXXXXXXX or +639XXXXXXXXX" type="tel" inputMode="tel" pattern="(09[0-9]{9}|\+639[0-9]{9})" title="Use 09XXXXXXXXX or +639XXXXXXXXX" />
              </label>
              <label>
                Ward / organization
                <input name="organization" required placeholder="Your ward or organization" />
              </label>
              <label>
                Bishop / Branch President name
                <input name="leaderName" required placeholder="Full name" maxLength={120} />
              </label>
              <label>
                Bishop / Branch President contact <span className="optional">(optional)</span>
                <input name="leaderPhone" placeholder="09XXXXXXXXX or +639XXXXXXXXX" type="tel" inputMode="tel" pattern="(09[0-9]{9}|\+639[0-9]{9})" title="Use 09XXXXXXXXX or +639XXXXXXXXX" />
              </label>
              <div className="form-summary">
                <span>Your request</span>
                <strong>{formatDate(selectedDate)} · {shifts.find((shift) => shift.id === selectedShift)?.time}</strong>
              </div>
              {error && <p className="form-error" role="alert">{error}</p>}
              <button className="button" disabled={submitting} type="submit">{submitting ? "Saving request…" : "Submit booking request"} <span>→</span></button>
              <p className="form-footnote">No email notifications for now. Your coordinator will review and confirm your request.</p>
            </form>
          )}
        </aside>
      </section>

      <footer className="footer" id="admin">
        <div className="shell footer__inner">
          <span>Need help? <a href="mailto:davaocoordinatingcouncil@gmail.com">davaocoordinatingcouncil@gmail.com</a> · <a href="tel:09055501894">09055501894</a></span>
          <span>Light The World Giving Machines · 2026–2027</span>
        </div>
      </footer>
    </main>
  );
}
