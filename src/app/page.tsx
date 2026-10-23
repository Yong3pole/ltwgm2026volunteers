"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Swal from "sweetalert2";

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
type Participant = {
  id: string;
  stakeDistrict: string;
  wardBranch: string;
  fullName: string;
  phone: string;
  date: string;
  shiftId: string;
};
type StakeScheduleGuidance = {
  stake: string;
  dateRange: string;
  shiftPeriod: "DAYTIME" | "EVENING";
};

const stakeScheduleGuidance: StakeScheduleGuidance[] = [
  { stake: "Tagum", dateRange: "Nov 28 – Dec 10", shiftPeriod: "DAYTIME" },
  { stake: "Davao", dateRange: "Nov 28 – Dec 10", shiftPeriod: "EVENING" },
  { stake: "Panabo", dateRange: "Dec 11 – Dec 23", shiftPeriod: "DAYTIME" },
  { stake: "Davao West", dateRange: "Dec 11 – Dec 23", shiftPeriod: "EVENING" },
  { stake: "Digos", dateRange: "Dec 24 – Jan 6", shiftPeriod: "DAYTIME" },
  { stake: "Buhangin", dateRange: "Dec 24 – Jan 6", shiftPeriod: "EVENING" },
];

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
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [volunteerCountInput, setVolunteerCountInput] = useState("1");
  const [activeParticipant, setActiveParticipant] = useState(0);
  const [selectedDate, setSelectedDate] = useState(fallbackStart);
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 10, 1, 12));
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [shiftPickerOpen, setShiftPickerOpen] = useState(false);
  const [schedulePickerStep, setSchedulePickerStep] = useState<"date" | "shift">("date");
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

  useEffect(() => {
    function handleBrowserBack() {
      if (volunteerCount === 0) return;
      setShiftPickerOpen(false);
      setConfirmationOpen(false);
      setError("");
      setVolunteerCountInput(String(volunteerCount));
      setVolunteerCount(0);
      setParticipants([]);
      setActiveParticipant(0);
    }

    window.addEventListener("popstate", handleBrowserBack);
    return () => window.removeEventListener("popstate", handleBrowserBack);
  }, [volunteerCount]);

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
  const currentParticipant = participants[activeParticipant];
  const activeParticipantDate = currentParticipant?.date
    ? new Date(`${currentParticipant.date}T12:00:00+08:00`)
    : selectedDate;
  const activeSelectedDate = eventDates.length > 0 && !availableDateKeys.includes(dateKey(activeParticipantDate))
    ? eventDates[0]
    : activeParticipantDate;
  const selectedDateAvailability = availability.filter((item) => item.date === dateKey(activeSelectedDate));
  const displayedShifts = selectedDateAvailability.length > 0
    ? selectedDateAvailability
    : fallbackShifts.map((shift) => ({
      shiftId: `${dateKey(activeSelectedDate)}-${shift.id === "morning" ? "day" : "evening"}`,
      date: dateKey(eventDates[0] ?? fallbackStart),
      label: shift.label,
      startTime: shift.id === "morning" ? "10:00" : "15:00",
      endTime: shift.id === "morning" ? "16:00" : "21:00",
      capacity: 2,
      reserved: 0,
    }));
  const selectedDateKey = dateKey(activeSelectedDate);
  const currentParticipantDateLabel = currentParticipant?.date
    ? formatDate(new Date(`${currentParticipant.date}T12:00:00+08:00`))
    : "Date not selected";
  const currentParticipantShift = currentParticipant?.shiftId
    ? displayedShifts.find((shift) => shift.shiftId === currentParticipant.shiftId)
    : undefined;
  const currentParticipantShiftLabel = currentParticipant?.shiftId
    ? currentParticipantShift?.label ?? "Selected shift"
    : "Shift not selected";
  const currentParticipantShiftTime = currentParticipantShift
    ? `${formatTime12(currentParticipantShift.startTime)} – ${formatTime12(currentParticipantShift.endTime)}`
    : "";
  const currentStakeGuidance = currentParticipant?.stakeDistrict
    ? stakeScheduleGuidance.find((item) => item.stake === currentParticipant.stakeDistrict)
    : undefined;
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

  function updateParticipant(id: string, update: Partial<Participant>) {
    setParticipants((current) => current.map((person) => person.id === id ? { ...person, ...update } : person));
  }

  function beginForm(count: number) {
    if (volunteerCount === 0) {
      window.history.pushState({ bookingStep: "details" }, "", window.location.href);
    }
    const people = Array.from({ length: count }, (_, index) => ({
      id: `person-${index + 1}`,
      stakeDistrict: "",
      wardBranch: "",
      fullName: "",
      phone: "",
      date: dateKey(eventDates[0] ?? fallbackStart),
      shiftId: "",
    }));
    setVolunteerCount(count);
    setParticipants(people);
    setActiveParticipant(0);
    setSelectedDate(eventDates[0] ?? fallbackStart);
  }

  function changeVolunteerCount() {
    if (window.history.state?.bookingStep === "details") {
      window.history.back();
      return;
    }
    setShiftPickerOpen(false);
    setConfirmationOpen(false);
    setError("");
    setVolunteerCountInput(String(volunteerCount));
    setVolunteerCount(0);
    setParticipants([]);
    setActiveParticipant(0);
  }

  function chooseParticipant(index: number) {
    const person = participants[index];
    setActiveParticipant(index);
    const date = person?.date ? new Date(`${person.date}T12:00:00+08:00`) : fallbackStart;
    setSelectedDate(date);
    setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
  }

  function setVolunteerCountFromInput(value: string) {
    setVolunteerCountInput(value.replace(/[^\d]/g, "").slice(0, 2));
  }

  function normalizeVolunteerCount() {
    const parsed = Number(volunteerCountInput);
    const count = Math.min(20, Math.max(1, Number.isFinite(parsed) && parsed > 0 ? parsed : 1));
    setVolunteerCountInput(String(count));
    return count;
  }

  async function handleSubmit() {
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          people: participants.map((person) => ({
            shiftId: person.shiftId,
            stakeDistrict: person.stakeDistrict,
            wardBranch: person.wardBranch,
            fullName: person.fullName,
            phone: person.phone,
          })),
        }),
      });
      const data = (await response.json()) as { error?: string; groupReference?: string; waitlisted?: boolean };

      if (!response.ok) {
        throw new Error(data.error ?? "We could not save your request.");
      }

      setConfirmationOpen(false);
      await Swal.fire({
        icon: "success",
        title: data.waitlisted ? "You are on the waitlist." : "Thank you for volunteering.",
        text: data.waitlisted
          ? "That shift is currently full, so your details have been saved in case a spot opens."
          : "Your request is pending coordinator review and is holding a spot for this shift.",
        footer: `Reference: <strong>${data.groupReference ?? "Not available"}</strong>`,
        confirmButtonText: "Done",
        confirmButtonColor: "#d50032",
      });
      window.location.reload();
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
            <h1><em>#LightTheWorld</em><br />One Act at a Time</h1>
            <Link className="hero__overview-link" href="/overview">View All Volunteers <span>→</span></Link>
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
        {volunteerCount === 0 ? (
          <div className="booking-panel">
            <div className="panel-top">
              <p className="eyebrow eyebrow--dark" style={{ fontSize: "12px" }}>Start your request</p>
              <h2>How many volunteers are you registering</h2>
            </div>
            <form onSubmit={(event) => {
              event.preventDefault();
              const count = normalizeVolunteerCount();
              beginForm(count);
            }}>
              <label className="volunteer-count-label">Number of volunteers
                <div className="number-stepper">
                  <input
                    name="volunteerCount"
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="20"
                    value={volunteerCountInput}
                    required
                    aria-label="Number of volunteers"
                    onChange={(event) => setVolunteerCountFromInput(event.target.value)}
                    onBlur={normalizeVolunteerCount}
                  />
                </div>
              </label>
              <button className="button" type="submit">Continue <span>→</span></button>
            </form>
          </div>
        ) : (
        <>
        <aside className="booking-panel booking-panel--active">
          <div className="panel-top participant-focus">
            <p className="eyebrow eyebrow--dark" style={{ fontSize: "12px" }}>Select a Volunteer to enter details</p>
            <div className="volunteer-tabs">
              {participants.map((person, index) => <button className={index === activeParticipant ? "status-tab status-tab--active" : "status-tab"} key={person.id} onClick={() => chooseParticipant(index)} type="button">Volunteer {index + 1}</button>)}
            </div>
            <p style={{ fontSize: "16px" }}>Enter details, date, and shift.</p>
            <button className="change-volunteer-count" onClick={changeVolunteerCount} type="button">
              ← Change number of volunteers
            </button>
          </div>
          <form onSubmit={(event) => event.preventDefault()}>
              {currentParticipant && (
                <div className="participant-card">
                  <label>
                    Stake or District
                    <select value={currentParticipant.stakeDistrict} required onChange={(event) => updateParticipant(currentParticipant.id, { stakeDistrict: event.target.value })}>
                      <option value="" disabled>Select your stake or district</option>
                      {["Buhangin", "Davao", "Davao West", "Panabo", "Tagum", "Digos"].map((name) => <option key={name} value={name}>{name}</option>)}
                    </select>
                  </label>
                  {currentStakeGuidance && (
                    <div className="stake-guidance" role="status">
                      <strong>Recommended schedule for {currentStakeGuidance.stake.toUpperCase()} stake:</strong>
                      <span>Please select {currentStakeGuidance.shiftPeriod} shifts between {currentStakeGuidance.dateRange}</span>
                    </div>
                  )}
                  <label>
                    Ward or Branch
                    <input value={currentParticipant.wardBranch} required placeholder="Enter your ward or branch" maxLength={160} onChange={(event) => updateParticipant(currentParticipant.id, { wardBranch: event.target.value })} />
                  </label>
                  <label>
                    Full Name
                    <input value={currentParticipant.fullName} required placeholder="e.g. Juan Dela Cruz" maxLength={120} autoComplete="name" onChange={(event) => updateParticipant(currentParticipant.id, { fullName: event.target.value })} />
                  </label>
                  <label>
                    Contact Number
                    <input value={currentParticipant.phone} required placeholder="09123456789" type="tel" inputMode="tel" autoComplete="tel" pattern="(09[0-9]{9}|\+639[0-9]{9}|9[0-9]{9})" title="Use 09123456789, +639123456789, or 9123456789" onChange={(event) => updateParticipant(currentParticipant.id, { phone: event.target.value })} />
                  </label>
                </div>
              )}
              <div className="schedule-picker">
                <button
                  className="schedule-picker__trigger"
                  type="button"
                  onClick={() => {
                    setSchedulePickerStep("date");
                    setShiftPickerOpen(true);
                  }}
                >
                  <span className="schedule-picker__copy">
                    <small>Selected schedule · Volunteer {activeParticipant + 1}</small>
                    <strong>{currentParticipantDateLabel}</strong>
                    <span className="schedule-picker__shift">
                      {currentParticipant?.shiftId ? `${currentParticipantShiftLabel} · ${currentParticipantShiftTime}` : "Choose a shift"}
                    </span>
                  </span>
                  <span className="schedule-picker__chevron" aria-hidden="true">⌄</span>
                </button>
              </div>

              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}

              <button className="button" disabled={submitting} onClick={(event) => {
                if (!participants.every((person) => person.stakeDistrict && person.wardBranch && person.fullName && person.phone && person.shiftId)) {
                  event.preventDefault();
                  setError("Complete the details and schedule for every volunteer before reviewing.");
                  return;
                }
                event.preventDefault();
                setConfirmationOpen(true);
              }} type="submit">
                Submit Request{" "}
                <span>→</span>
              </button>

              <p className="form-footnote">
                Your coordinator will review and confirm your request after submission.
              </p>
          </form>
        </aside>
        </>
        )}
      </section>

      {shiftPickerOpen && currentParticipant && (
        <div className="modal-backdrop" role="presentation">
          <section className="shift-picker-modal schedule-picker-modal" role="dialog" aria-modal="true" aria-labelledby="shift-picker-title">
            <div className="shift-picker-modal__header">
              <div>
                <p className="eyebrow eyebrow--dark">Volunteer {activeParticipant + 1}</p>
                <h2 id="shift-picker-title">{schedulePickerStep === "date" ? "Choose a date" : "Choose a shift"}</h2>
                <p>{schedulePickerStep === "date" ? "Select an available date to see its shifts." : `${formatDate(selectedDate)} · Select an available shift or join its waitlist.`}</p>
              </div>
              <button type="button" onClick={() => setShiftPickerOpen(false)} aria-label="Close schedule picker">×</button>
            </div>
            {schedulePickerStep === "date" ? (
              <div className="schedule-picker-calendar calendar" aria-label="Choose a volunteer date">
                <div className="calendar__header">
                  <button className="calendar__nav" disabled={firstCalendarMonth} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1, 12))} type="button" aria-label="Previous month">‹</button>
                  <strong>{calendarMonthLabel}</strong>
                  <button className="calendar__nav" disabled={lastCalendarMonth} onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1, 12))} type="button" aria-label="Next month">›</button>
                </div>
                <div className="calendar__weekdays" aria-hidden="true">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => <span key={weekday}>{weekday}</span>)}
                </div>
                <div className="calendar__grid">
                  {calendarDays.map((date, index) => {
                    if (!date) return <span className="calendar__empty" key={`empty-${index}`} />;
                    const key = dateKey(date);
                    const isAvailable = availableDateKeys.length > 0 ? availableDateKeys.includes(key) : key >= dateKey(fallbackStart) && key <= dateKey(fallbackEnd);
                    const isSelected = key === selectedDateKey;
                    return (
                      <button className={`calendar__day${isSelected ? " calendar__day--selected" : ""}${!isAvailable ? " calendar__day--disabled" : ""}`} disabled={!isAvailable} key={key} onClick={() => {
                        setSelectedDate(date);
                        setCalendarMonth(new Date(date.getFullYear(), date.getMonth(), 1, 12));
                        updateParticipant(currentParticipant.id, { date: key, shiftId: "" });
                        setSchedulePickerStep("shift");
                      }} type="button" aria-label={isAvailable ? `Choose ${formatDate(date)}` : `${formatDate(date)} unavailable`} aria-pressed={isSelected}>
                        {date.getDate()}{isAvailable && <i aria-hidden="true" />}
                      </button>
                    );
                  })}
                </div>
                <p className="calendar__hint"><span aria-hidden="true" /> Available dates are marked with a dot</p>
              </div>
            ) : (
              <div className="shift-picker-options">
                <button className="schedule-picker__back" type="button" onClick={() => setSchedulePickerStep("date")}>← Change date</button>
                {displayedShifts.map((shift) => {
                  const spots = getSpotsOpen(shift.shiftId);
                  const full = spots === 0;
                  return (
                    <button className={`shift-picker-option${currentParticipant.shiftId === shift.shiftId ? " shift-picker-option--selected" : ""}${full ? " shift-picker-option--full" : ""}`} key={shift.shiftId} type="button" onClick={() => {
                      updateParticipant(currentParticipant.id, { date: selectedDateKey, shiftId: shift.shiftId });
                      setShiftPickerOpen(false);
                    }}>
                      <span className="shift-picker-option__main"><strong>{shift.label}</strong><small>{formatTime12(shift.startTime)} – {formatTime12(shift.endTime)}</small></span>
                      <span className="shift-picker-option__availability"><b>{full ? "FULL" : `${spots} open`}</b><small>{full ? "Waitlist available" : "spots remaining"}</small></span>
                      {full && <span className="shift-picker-warning">This shift is full. Selecting it will waitlist this volunteer.</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {confirmationOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="edit-modal confirmation-modal" role="dialog" aria-modal="true" aria-labelledby="confirmation-title">
            <div className="edit-modal__header">
              <h2 id="confirmation-title">Confirm request</h2>
              <button type="button" onClick={() => setConfirmationOpen(false)} aria-label="Close confirmation">×</button>
            </div>
            <p>Review the volunteers and schedules below before submitting.</p>
            <div className="confirmation-list">
              {participants.map((person, index) => {
                const shift = availability.find((item) => item.shiftId === person.shiftId);
                return (
                  <article className="confirmation-card" key={person.id}>
                    <strong>Volunteer {index + 1}: {person.fullName}</strong>
                    <small>{person.stakeDistrict} · {person.wardBranch}</small>
                    <small>{person.phone}</small>
                    <small>{person.date ? formatDate(new Date(`${person.date}T12:00:00+08:00`)) : "Date not selected"} · {shift?.label ?? "Shift not selected"}</small>
                    <small>{shift ? `${formatTime12(shift.startTime)} – ${formatTime12(shift.endTime)} · ${Math.max(shift.capacity - shift.reserved, 0)} spots currently open` : ""}</small>
                  </article>
                );
              })}
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button" disabled={submitting} onClick={() => handleSubmit()} type="button">
              {submitting ? "Submitting…" : "Confirm and Submit"} <span>→</span>
            </button>
          </section>
        </div>
      )}

      <footer className="footer" id="admin">
        <div className="shell footer__inner">
          <span>Need help? <a href="mailto:davaocoordinatingcouncil@gmail.com">davaocoordinatingcouncil@gmail.com</a> · <a href="tel:09055501894">09055501894</a></span>
          <span>Light The World Giving Machines · 2026–2027</span>
        </div>
      </footer>
    </main>
  );
}
