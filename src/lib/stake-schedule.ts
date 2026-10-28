export type StakeScheduleGuidance = {
  stake: string;
  dateRange: string;
  startDate: string;
  endDate: string;
  shiftPeriod: "DAYTIME" | "EVENING";
};

export const stakeScheduleGuidance: StakeScheduleGuidance[] = [
  { stake: "Tagum", dateRange: "Nov 28 – Dec 10", startDate: "2026-11-28", endDate: "2026-12-10", shiftPeriod: "DAYTIME" },
  { stake: "Davao", dateRange: "Nov 28 – Dec 10", startDate: "2026-11-28", endDate: "2026-12-10", shiftPeriod: "EVENING" },
  { stake: "Panabo", dateRange: "Dec 11 – Dec 23", startDate: "2026-12-11", endDate: "2026-12-23", shiftPeriod: "DAYTIME" },
  { stake: "Davao West", dateRange: "Dec 11 – Dec 23", startDate: "2026-12-11", endDate: "2026-12-23", shiftPeriod: "EVENING" },
  { stake: "Digos", dateRange: "Dec 24 – Jan 6", startDate: "2026-12-24", endDate: "2027-01-06", shiftPeriod: "DAYTIME" },
  { stake: "Buhangin", dateRange: "Dec 24 – Jan 6", startDate: "2026-12-24", endDate: "2027-01-06", shiftPeriod: "EVENING" },
];

export function getStakeSchedule(stake: string) {
  return stakeScheduleGuidance.find((schedule) => schedule.stake === stake);
}

export function isShiftAllowedForStake(
  schedule: StakeScheduleGuidance,
  date: string,
  startTime: string,
) {
  const isDaytime = Number(startTime.slice(0, 2)) < 12;
  return date >= schedule.startDate &&
    date <= schedule.endDate &&
    (schedule.shiftPeriod === "DAYTIME" ? isDaytime : !isDaytime);
}
