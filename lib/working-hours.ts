import { prisma } from "./prisma";

export const ETHIOPIA_TZ = "Africa/Addis_Ababa";

const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type WorkingHoursConfig = {
  startTime: string;
  endTime: string;
  isActive: boolean;
};

export type WorkingHoursStatus = {
  isOpen: boolean;
  isActive: boolean;
  startTime: string;
  endTime: string;
  startTimeLabel: string;
  endTimeLabel: string;
  nextOpenAt: string;
  currentEthiopianTime: string;
};

type EthiopianDateParts = {
  year: number;
  month: number;
  day: number;
  hours: number;
  minutes: number;
};

function readPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  const value = parts.find((p) => p.type === type)?.value ?? "0";
  return Number(value);
}

export function getEthiopianDateParts(date = new Date()): EthiopianDateParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ETHIOPIA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return {
    year: readPart(parts, "year"),
    month: readPart(parts, "month"),
    day: readPart(parts, "day"),
    hours: readPart(parts, "hour"),
    minutes: readPart(parts, "minute"),
  };
}

export function parseTimeToMinutes(hhmm: string): number {
  const match = HHMM_RE.exec(hhmm.trim());
  if (!match) throw new Error(`Invalid time format: ${hhmm}`);
  return Number(match[1]) * 60 + Number(match[2]);
}

export function isValidHhmm(value: string): boolean {
  return HHMM_RE.test(value.trim());
}

function addDays(year: number, month: number, day: number, delta: number) {
  const d = new Date(Date.UTC(year, month - 1, day + delta));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

/** Ethiopia is fixed UTC+3 (no DST). */
export function ethiopianLocalToDate(
  year: number,
  month: number,
  day: number,
  hours: number,
  minutes: number
): Date {
  const pad = (n: number) => String(n).padStart(2, "0");
  return new Date(`${year}-${pad(month)}-${pad(day)}T${pad(hours)}:${pad(minutes)}:00+03:00`);
}

/** Ethiopian traditional clock is 6 hours behind EAT wall clock (e.g. 1:12 PM → 7 ሰዓት). */
function internationalToEthiopianHour(hour24: number): number {
  const shifted = (hour24 - 6 + 24) % 24;
  return shifted % 12 || 12;
}

function getEthiopianPeriodLabel(hour24: number): string {
  if (hour24 >= 6 && hour24 < 12) return "ጠዋት";
  if (hour24 === 12) return "ከሰዓት";
  if (hour24 >= 13 && hour24 < 18) return "ከረፋዱ";
  return "ማታ";
}

/** Display only — traditional Ethiopian time in Amharic, e.g. "ከረፋዱ 7:12 ሰዓት". */
export function formatTraditionalEthiopianTime(
  hour24: number,
  minute: number,
  second?: number
): string {
  const period = getEthiopianPeriodLabel(hour24);
  const ethHour = internationalToEthiopianHour(hour24);
  let time = String(ethHour);
  if (minute > 0) time += `:${String(minute).padStart(2, "0")}`;
  if (second != null && second > 0) time += `:${String(second).padStart(2, "0")}`;
  return `${period} ${time} ሰዓት`;
}

/** Display label for a stored EAT HH:mm value (validation still uses the raw 24h value). */
export function formatEthiopianTimeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return formatTraditionalEthiopianTime(h, m);
}

export function formatCurrentEthiopianTime(date = new Date()): string {
  const { hours, minutes } = getEthiopianDateParts(date);
  const seconds = new Intl.DateTimeFormat("en-US", {
    timeZone: ETHIOPIA_TZ,
    second: "2-digit",
  })
    .formatToParts(date)
    .find((p) => p.type === "second")?.value;
  return formatTraditionalEthiopianTime(hours, minutes, seconds ? Number(seconds) : 0);
}

export function isWithinWorkingHours(
  startTime: string,
  endTime: string,
  now = new Date()
): boolean {
  // Validation uses exact EAT wall clock (stored HH:mm), not traditional Ethiopian display time.
  const { hours, minutes } = getEthiopianDateParts(now);
  const nowMinutes = hours * 60 + minutes;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === endMinutes) return false;

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  // Overnight window (e.g. 22:00 – 06:00)
  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

export function getNextOpenDate(
  startTime: string,
  endTime: string,
  now = new Date()
): Date {
  const parts = getEthiopianDateParts(now);
  const nowMinutes = parts.hours * 60 + parts.minutes;
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  const [startH, startM] = startTime.split(":").map(Number);

  if (isWithinWorkingHours(startTime, endTime, now)) {
    return now;
  }

  let { year, month, day } = parts;

  if (startMinutes < endMinutes) {
    if (nowMinutes < startMinutes) {
      return ethiopianLocalToDate(year, month, day, startH, startM);
    }
    const next = addDays(year, month, day, 1);
    return ethiopianLocalToDate(next.year, next.month, next.day, startH, startM);
  }

  // Overnight: closed between end and start on the same calendar day
  if (nowMinutes >= endMinutes && nowMinutes < startMinutes) {
    return ethiopianLocalToDate(year, month, day, startH, startM);
  }

  const next = addDays(year, month, day, 1);
  return ethiopianLocalToDate(next.year, next.month, next.day, startH, startM);
}

export function buildWorkingHoursStatus(
  config: WorkingHoursConfig,
  now = new Date()
): WorkingHoursStatus {
  const isOpen = !config.isActive || isWithinWorkingHours(config.startTime, config.endTime, now);
  const nextOpen = getNextOpenDate(config.startTime, config.endTime, now);

  return {
    isOpen,
    isActive: config.isActive,
    startTime: config.startTime,
    endTime: config.endTime,
    startTimeLabel: formatEthiopianTimeLabel(config.startTime),
    endTimeLabel: formatEthiopianTimeLabel(config.endTime),
    nextOpenAt: nextOpen.toISOString(),
    currentEthiopianTime: formatCurrentEthiopianTime(now),
  };
}

export async function getOrCreateWorkingHoursConfig(): Promise<WorkingHoursConfig> {
  const row = await (prisma as any).systemWorkingTime.upsert({
    where: { id: 1 },
    create: { id: 1, startTime: "11:00", endTime: "23:00", isActive: true },
    update: {},
  });
  return {
    startTime: row.startTime,
    endTime: row.endTime,
    isActive: row.isActive,
  };
}
