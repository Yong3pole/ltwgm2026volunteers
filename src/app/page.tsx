"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

const fallbackShifts = [
  { id: "morning", label: "Day shift", time: "10:00 AM – 4:00 PM" },
  { id: "evening", label: "Evening shift", time: "3:00 PM – 9:00 PM" },
];

type Availability = {
  shiftId: string;
  date: string;
  label: string;
  startTime: string;
  endTime: string;
  capacity: number;
  reserved: number;
};

const fallbackStart = new Date("2026-11-28T12:00:00+08:00");
const fallbackEnd = new Date("2027-01-10T12:00:00+08:00");

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "Asia/Manila",
  }).format(date);
}

function formatTime12(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  const period = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatScheduleRange(start: Date, end: Date) {
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "Asia/Manila",
  };

  const startLabel = new Intl.DateTimeFormat("en-US", options).format(start);
  const endLabel = new Intl.DateTimeFormat("en-US", options).format(end);

  return `${startLabel} – ${endLabel}`;
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
  const [selectedDate, setSelectedDate] = useState(fallbackStart);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 10, 1, 12));
  const [selectedShift, setSelectedShift] = useState(fallbackShifts[0].id);
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
        const dates = [...new Set(data.shifts.map((shift) => shift.date))].sort();
        setSelectedDate((current) => dates.includes(dateKey(current)) || dates.length === 0
          ? current
          : new Date(`${dates[0]}T12:00:00+08:00`));
        if (dates.length > 0) {
          const firstDate = new Date(`${dates[0]}T12:00:00+08:00`);
          setCalendarMonth(new Date(firstDate.getFullYear(), firstDate.getMonth(), 1, 12));
        }
      })
      .catch(() => setError("Live availability is not connected yet. Please try again shortly."));
  }, []);

  const availableDateKeys = useMemo(
    () => [...new Set(availability.map((item) => item.date))].sort(),
    [availability],
  );
  const eventDates = useMemo(
    () => availableDateKeys.map((value) => new Date(`${value}T12:00:00+08:00`)),
    [availableDateKeys],
  );
  const scheduleStart = eventDates[0] ?? fallbackStart;
  const scheduleEnd = eventDates[eventDates.length - 1] ?? fallbackEnd;
  const activeSelectedDate = eventDates.length > 0 && !availableDateKeys.includes(dateKey(selectedDate))
    ? eventDates[0]
    : selectedDate;
  const selectedDateAvailability = availability.filter((item) => item.date === dateKey(activeSelectedDate));
  const displayedShifts = selectedDateAvailability.length > 0
    ? selectedDateAvailability
    : fallbackShifts.map((shift) => ({
      shiftId: `${dateKey(activeSelectedDate)}-${shift.id === "morning" ? "day" : "evening"}`,
      date: dateKey(activeSelectedDate),
      label: shift.label,
      startTime: shift.id === "morning" ? "10:00" : "15:00",
      endTime: shift.id === "morning" ? "16:00" : "21:00",
      capacity: 2,
      reserved: 0,
    }));
  const selectedDateKey = dateKey(activeSelectedDate);
  const calendarDays = getCalendarDays(calendarMonth);
  const calendarMonthLabel = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Manila",
  }).format(calendarMonth);
  const firstCalendarMonth = eventDates.length > 0 && calendarMonth.getTime() <= new Date(eventDates[0].getFullYear(), eventDates[0].getMonth(), 1, 12).getTime();
  const lastCalendarMonth = eventDates.length > 0 && calendarMonth.getTime() >= new Date(eventDates[eventDates.length - 1].getFullYear(), eventDates[eventDates.length - 1].getMonth(), 1, 12).getTime();
  function getSpotsOpen(shiftId: string) {
    const shiftAvailability = availability.find(
      (item) => item.date === selectedDateKey && item.shiftId === shiftId,
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
      }).format(activeSelectedDate),
    [activeSelectedDate],
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
          shiftId: displayedShifts.find((shift) => shift.shiftId.endsWith(selectedShift === "morning" ? "-day" : "-evening"))?.shiftId,
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
        <div className="shell hero__content">
          <div className="hero__copy">
            <p className="eyebrow">Volunteer scheduling · Davao</p>
            <h1><em>Light the world.</em><br />One Act at a Time.</h1>
            <p className="hero__intro">
              Volunteer for the Light The World Giving Machines at{" "}
              <strong>Ayala Malls Abreeza, Davao City</strong>. Sign up for a shift between{" "}
              <strong>{formatScheduleRange(scheduleStart, scheduleEnd)}</strong> and submit your request for coordinator confirmation.
            </p>
          </div>
          <div className="hero__art" aria-label="Light The World logo">
            <img
              src="/images/giving-machine-3d.png"
              alt="Light The World Giving Machines"
            />
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
                const isAvailable = availableDateKeys.length > 0
                  ? availableDateKeys.includes(key)
                  : key >= dateKey(fallbackStart) && key <= dateKey(fallbackEnd);
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
            {displayedShifts.map((shift) => {
              const shiftType = shift.shiftId.endsWith("-day") ? "morning" : "evening";
              const isSelected = selectedShift === shiftType;
              return (
                <button
                  className={`shift-card${isSelected ? " shift-card--selected" : ""}`}
                  key={shift.shiftId}
                  onClick={() => setSelectedShift(shiftType)}
                  type="button"
                  aria-pressed={isSelected}
                >
                  <span className={`radio${isSelected ? " radio--selected" : ""}`} />
                  <span className="shift-card__copy">
                    <strong>{shift.label}</strong>
                    <span>{formatTime12(shift.startTime)} – {formatTime12(shift.endTime)}</span>
                  </span>
                  <span className="availability"><b>{getSpotsOpen(shift.shiftId)}</b> spots open</span>
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
                <strong>{formatDate(activeSelectedDate)} · {formatTime12(displayedShifts.find((shift) => shift.shiftId.endsWith(selectedShift === "morning" ? "-day" : "-evening"))?.startTime ?? "00:00")}–{formatTime12(displayedShifts.find((shift) => shift.shiftId.endsWith(selectedShift === "morning" ? "-day" : "-evening"))?.endTime ?? "00:00")}</strong>
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
