import type { SupabaseClient } from "@supabase/supabase-js";
import { formatClock, isWithinOfficeHours, mexicoHourKey, slotIsBusy } from "@/lib/ai/office-hours";

const TIME_ZONE = "America/Mexico_City";

export interface ChosenSlot {
  scheduledAt: Date;
  label: string;
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function mexicoParts(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

function zonedToUtc(year: number, month: number, day: number, hour: number, minute: number) {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcGuess));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return new Date(utcGuess - (asUtc - utcGuess));
}

function addDays(year: number, month: number, day: number, days: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

const HOUR_WORDS: Record<string, number> = {
  una: 1,
  dos: 2,
  tres: 3,
  cuatro: 4,
  cinco: 5,
  seis: 6,
  siete: 7,
  ocho: 8,
  nueve: 9,
  diez: 10,
  once: 11,
  doce: 12,
};

function weekdayIndex(folded: string): number | null {
  const names = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const index = names.findIndex((name) => new RegExp(`\\b${name}\\b`).test(folded));
  return index >= 0 ? index : null;
}

/**
 * Lee UNA sola confirmación de horario. Si el texto ofrece dos opciones
 * ("hoy en la tarde o mañana en la mañana"), no agenda nada.
 */
export function parseChosenSlot(text: string, now = new Date()): ChosenSlot | null {
  const folded = fold(text).replace(/\s+/g, " ").trim();
  if (!folded) return null;

  const morning = /\b(en|por) la manana\b/.test(folded);
  const afternoon = /\b(en|por) la tarde\b/.test(folded);
  const night = /\b(en|por) la noche\b/.test(folded);
  const noonPhrase = /\bmedio\s*dia\b/.test(folded) || /\b(?:12|doce)\s+del\s+dia\b/.test(folded);
  const ampmMatch = folded.match(/\b(?:a las )?(\d{1,2})(?::(\d{2}))?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/);
  const hourMatch = folded.match(
    /\b(?:a las|las) (una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|\d{1,2})(?::(\d{2}))?(?: y (?:media|treinta))?\b/
  );
  const clockCount = folded.match(/\b(\d{1,2})(?::\d{2})?\s*(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)\b/g)?.length ?? 0;
  const periods = [morning, afternoon, night].filter(Boolean).length;
  const offersChoice = /\bo\b/.test(folded) && (periods > 1 || clockCount > 1 || ((Boolean(hourMatch) || noonPhrase) && periods >= 1));
  if (offersChoice) return null;

  const callNow =
    !ampmMatch &&
    !hourMatch &&
    !noonPhrase &&
    /\b(llam|marc|hablar|comunica)/.test(folded) &&
    /\b(ya|ahorita|ahora|enseguida)\b/.test(folded);
  if (callNow) {
    const today = mexicoParts(now);
    const total = Math.ceil((today.hour * 60 + today.minute + 15) / 15) * 15;
    const hour = Math.floor(total / 60);
    const soonMinute = total % 60;
    if (hour < 24 && isWithinOfficeHours(today.year, today.month, today.day, hour, soonMinute)) {
      return {
        scheduledAt: zonedToUtc(today.year, today.month, today.day, hour, soonMinute),
        label: `hoy a las ${formatClock(hour, soonMinute)}`,
      };
    }
    return null;
  }

  if (!morning && !afternoon && !night && !hourMatch && !ampmMatch && !noonPhrase) return null;
  if (night && !ampmMatch && !hourMatch && !noonPhrase) return null;

  let clockHour: number | null = null;
  let minute = 0;
  if (ampmMatch) {
    const parsed = Number(ampmMatch[1]);
    minute = ampmMatch[2] ? Number(ampmMatch[2]) : 0;
    const isPm = ampmMatch[3].startsWith("p");
    clockHour = isPm ? (parsed === 12 ? 12 : parsed + 12) : parsed === 12 ? 0 : parsed;
  } else if (noonPhrase) {
    clockHour = 12;
    minute = 0;
  } else if (hourMatch) {
    const token = hourMatch[1];
    let parsed = HOUR_WORDS[token] ?? Number(token);
    minute = hourMatch[2] ? Number(hourMatch[2]) : /y (?:media|treinta)/.test(hourMatch[0]) ? 30 : 0;
    if (parsed >= 1 && parsed <= 6) parsed += 12;
    clockHour = parsed;
  }

  const today = mexicoParts(now);
  const withoutMorning = folded.replace(/\b(en|por) la manana\b/g, " ");
  const dayAfter = /\bpasado manana\b/.test(withoutMorning);
  const tomorrow = !dayAfter && /\bmanana\b/.test(withoutMorning);
  const explicitToday = /\bhoy\b/.test(folded);
  const weekday = weekdayIndex(folded);

  let shift = 0;
  if (weekday != null) {
    const todayWeekday = new Date(Date.UTC(today.year, today.month - 1, today.day)).getUTCDay();
    shift = (weekday - todayWeekday + 7) % 7;
  } else if (dayAfter) {
    shift = 2;
  } else if (tomorrow && !explicitToday) {
    shift = 1;
  } else if (clockHour == null && !explicitToday && !tomorrow) {
    if (morning && today.hour >= 12) shift = 1;
    else if (afternoon && today.hour >= 18) shift = 1;
    else if (night && today.hour >= 21) shift = 1;
  }

  const explicitDay = explicitToday || tomorrow || dayAfter || weekday != null;

  const resolve = (shiftDays: number) => {
    const date = addDays(today.year, today.month, today.day, shiftDays);
    let hour = clockHour;
    if (hour == null) return null;
    if (!isWithinOfficeHours(date.year, date.month, date.day, hour, minute)) return null;
    return { hour, scheduledAt: zonedToUtc(date.year, date.month, date.day, hour, minute) };
  };

  let resolved = resolve(shift);
  if (!resolved) return null;
  if (!explicitDay && resolved.scheduledAt.getTime() < now.getTime() - 30 * 60_000) {
    shift += 1;
    resolved = resolve(shift);
    if (!resolved) return null;
  }

  const when = explicitToday && shift === 0 ? "hoy" : shift === 1 ? "mañana" : shift === 2 ? "pasado mañana" : "";
  const label = `a las ${formatClock(resolved.hour, minute)}`;
  return { scheduledAt: resolved.scheduledAt, label: [when, label].filter(Boolean).join(" ") };
}

export async function recordConfirmedCall(
  supabase: SupabaseClient,
  input: {
    business: "zenit" | "propiedades";
    conversationId: string;
    customerName: string | null;
    customerPhone: string;
    customerText: string;
    assistantText: string;
    advisorName: string;
  }
) {
  const fromCustomer = parseChosenSlot(input.customerText);
  const fromAssistant = parseChosenSlot(input.assistantText);
  const assistantAsks = /\?\s*$/.test(input.assistantText.trim());
  const slot = fromCustomer ?? (!assistantAsks ? fromAssistant : null);
  if (!slot) return false;
  if (await hourIsTaken(supabase, slot.scheduledAt, input.conversationId)) return false;

  const title = `Llamada ${slot.label}`;
  const { data: existing } = await supabase
    .from("crm_appointments")
    .select("id")
    .eq("business", input.business)
    .eq("conversation_id", input.conversationId)
    .eq("status", "pendiente")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = {
    business: input.business,
    conversation_id: input.conversationId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    title,
    scheduled_at: slot.scheduledAt.toISOString(),
    advisor_name: input.advisorName,
    status: "pendiente",
    notes: "Confirmada por WhatsApp",
  };

  if (existing?.id) {
    await supabase.from("crm_appointments").update(row).eq("id", existing.id);
  } else {
    const { error } = await supabase.from("crm_appointments").insert(row);
    if (error) {
      console.error("No se pudo agendar la cita:", error.message);
      return false;
    }
  }

  const { data: contact } = await supabase
    .from("crm_contacts")
    .select("stage")
    .eq("business", input.business)
    .eq("conversation_id", input.conversationId)
    .maybeSingle();

  if (!contact) {
    await supabase.from("crm_contacts").insert({
      business: input.business,
      conversation_id: input.conversationId,
      stage: "cita",
    });
  } else if (contact.stage === "nuevo") {
    await supabase
      .from("crm_contacts")
      .update({ stage: "cita" })
      .eq("business", input.business)
      .eq("conversation_id", input.conversationId);
  }

  await notifyCalendarSync();
  return true;
}

export async function takenHourKeys(supabase: SupabaseClient, exceptConversationId: string) {
  const from = new Date(Date.now() - 60 * 60_000).toISOString();
  const until = new Date(Date.now() + 8 * 24 * 60 * 60_000).toISOString();
  const { data, error } = await supabase
    .from("crm_appointments")
    .select("scheduled_at, conversation_id")
    .eq("status", "pendiente")
    .gte("scheduled_at", from)
    .lt("scheduled_at", until);
  if (error) {
    console.error("No se pudieron leer las llamadas ocupadas:", error.message);
    return new Set<string>();
  }
  const taken = new Set<string>();
  for (const row of data ?? []) {
    if (row.conversation_id === exceptConversationId || !row.scheduled_at) continue;
    taken.add(mexicoHourKey(new Date(row.scheduled_at)));
  }
  return taken;
}

async function hourIsTaken(supabase: SupabaseClient, scheduledAt: Date, conversationId: string) {
  const taken = await takenHourKeys(supabase, conversationId);
  const key = mexicoHourKey(scheduledAt);
  const [year, month, day, minutes] = key.split("-").map(Number);
  return slotIsBusy(year, month, day, minutes, taken);
}

async function notifyCalendarSync() {
  const url = process.env.CRM_CALENDAR_SYNC_URL;
  const secret = process.env.CALENDAR_SYNC_SECRET;
  if (!url || !secret) return;
  await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
    signal: AbortSignal.timeout(4000),
  }).catch(() => undefined);
}
