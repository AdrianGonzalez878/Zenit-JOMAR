const TIME_ZONE = "America/Mexico_City";
const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

export interface MexicoStamp {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
}

function windowFor(weekday: number): { open: number; close: number; slots: number[] } | null {
  if (weekday === 0) return null;
  if (weekday === 6) return { open: 10 * 60, close: 15 * 60, slots: [10 * 60, 13 * 60] };
  return { open: 9 * 60, close: 18 * 60, slots: [9 * 60, 16 * 60] };
}

export function mexicoStamp(now = new Date()): MexicoStamp {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    minute: Number(get("minute")),
    weekday: weekday >= 0 ? weekday : 0,
  };
}

export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function addCalendarDays(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function formatClock(hour24: number, minute: number): string {
  const period = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${minute.toString().padStart(2, "0")} ${period}`;
}

export function isWithinOfficeHours(year: number, month: number, day: number, hour: number, minute: number): boolean {
  const window = windowFor(weekdayOf(year, month, day));
  if (!window) return false;
  const minutes = hour * 60 + minute;
  return minutes >= window.open && minutes <= window.close;
}

export function mexicoNowLabel(now = new Date()): string {
  const stamp = mexicoStamp(now);
  return `${WEEKDAYS[stamp.weekday]}, ${formatClock(stamp.hour, stamp.minute)}`;
}

function dayLabel(shift: number, weekday: number): string {
  if (shift === 0) return "hoy";
  if (shift === 1) return "mañana";
  return `el ${WEEKDAYS[weekday]}`;
}

function nextOpenDay(stamp: MexicoStamp, startShift: number) {
  for (let shift = startShift; shift < 8; shift += 1) {
    const date = addCalendarDays(stamp.year, stamp.month, stamp.day, shift);
    const weekday = weekdayOf(date.year, date.month, date.day);
    const window = windowFor(weekday);
    if (!window) continue;
    return { shift, weekday, window };
  }
  return null;
}

const NOON = 12 * 60;

/**
 * Pregunta de la mañana o de la tarde, según la hora actual.
 * No propone horas en punto.
 */
export function callSlotOffer(now = new Date()): string {
  const stamp = mexicoStamp(now);
  const nowMinutes = stamp.hour * 60 + stamp.minute;
  const today = windowFor(stamp.weekday);
  const morningEnd = today ? Math.min(NOON, today.close) : 0;
  const morningLeft = today != null && morningEnd > today.open && nowMinutes < morningEnd - 30;
  const afternoonLeft = today != null && NOON < today.close && nowMinutes < today.close - 30;

  if (morningLeft && afternoonLeft) {
    return "Pregunta solo si prefiere la llamada hoy en la mañana o hoy en la tarde. No des una hora en punto.";
  }
  if (afternoonLeft) {
    const next = nextOpenDay(stamp, 1);
    const nextDay = next ? dayLabel(next.shift, next.weekday) : "mañana";
    return `Ya no ofrezcas la mañana de hoy. Pregunta solo si prefiere hoy en la tarde o ${nextDay} en la mañana. No des una hora en punto.`;
  }

  const next = nextOpenDay(stamp, today && nowMinutes < today.open ? 0 : 1);
  if (!next) return "No hay horario de oficina en los próximos días.";
  const when = dayLabel(next.shift, next.weekday);
  const closed = today && nowMinutes < today.open ? "" : "Hoy ya no queda horario. ";
  return `${closed}Pregunta solo si prefiere ${when} en la mañana o ${when} en la tarde. No des una hora en punto.`;
}
