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

const CALL_MINUTES = 30;

export function mexicoHourKey(date: Date): string {
  const stamp = mexicoStamp(date);
  const hour = stamp.hour === 24 ? 0 : stamp.hour;
  return `${stamp.year}-${stamp.month}-${stamp.day}-${hour * 60 + stamp.minute}`;
}

export function slotIsBusy(year: number, month: number, day: number, minutes: number, taken: Set<string>): boolean {
  const prefix = `${year}-${month}-${day}-`;
  for (const key of taken) {
    if (!key.startsWith(prefix)) continue;
    const other = Number(key.slice(prefix.length));
    if (!Number.isFinite(other)) continue;
    if (minutes < other + CALL_MINUTES && other < minutes + CALL_MINUTES) return true;
  }
  return false;
}

function hourStarts(window: { open: number; close: number }): number[] {
  const starts: number[] = [];
  for (let minute = window.open; minute + CALL_MINUTES <= window.close; minute += CALL_MINUTES) starts.push(minute);
  return starts;
}

function joinSpanish(labels: string[]): string {
  if (labels.length <= 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} o ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} o ${labels[labels.length - 1]}`;
}

/** Tres horarios, cada 30 minutos, que todavía caben y no se empalman con otra llamada. */
export function callSlotOffer(now = new Date(), taken: Set<string> = new Set()): string {
  const stamp = mexicoStamp(now);
  const nowMinutes = stamp.hour * 60 + stamp.minute;
  const labels: string[] = [];

  for (let shift = 0; shift < 8 && labels.length < 3; shift += 1) {
    const date = addCalendarDays(stamp.year, stamp.month, stamp.day, shift);
    const weekday = weekdayOf(date.year, date.month, date.day);
    const window = windowFor(weekday);
    if (!window) continue;
    for (const minute of hourStarts(window)) {
      if (shift === 0 && minute < nowMinutes + 20) continue;
      if (slotIsBusy(date.year, date.month, date.day, minute, taken)) continue;
      const hour = Math.floor(minute / 60);
      labels.push(`${dayLabel(shift, weekday)} a las ${formatClock(hour, minute % 60)}`);
      if (labels.length === 3) break;
    }
  }

  if (!labels.length) {
    return "No quedan horas libres en los próximos días. Di que un asesor confirma el horario. No inventes una hora.";
  }
  return `Cada llamada dura unos 30 minutos. Pregunta solo entre estas horas libres: ${joinSpanish(labels)}. Si elige una, confírmala tal cual. Si pide otra hora que sí cabe en el horario de oficina y no está ocupada, también confírmala tal cual, aunque no esté en esta lista. Si esa hora está ocupada o queda fuera del horario, no la confirmes y ofrece la siguiente libre.`;
}
