export type AdvisorNeedReason =
  | "Pide hablar con un asesor"
  | "Quiere llamada o visita"
  | "Quiere apartar o avanzar la compra"
  | "ARGI pasó el chat a un asesor"
  | "ARGI no pudo responder";

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

const HUMAN_PATTERNS = [
  /\b(asesor|asesora|agente)\b/,
  /\b(persona real|alguien real|un humano)\b/,
  /\bhablar con (alguien|una persona|un asesor|un humano|ustedes)\b/,
  /\bno (quiero|me sirve) (hablar con )?(la |el )?(ia|argi|bot|robot)\b/,
  /\bpasame (con |a )?(un )?(asesor|agente|humano)\b/,
];

const CONTACT_PATTERNS = [
  /\b(llamenme|llamame|llamarme|me (pueden |pueden )?llamar|quiero (una )?llamada|una llamada|que me llamen)\b/,
  /\b(me contacten|quiero que me contacten|que me contacte(n)?)\b/,
  /\b(visitenme|quiero (una )?visita|agendar( una)? (visita|cita|llamada)|una cita|la cita|conocer zenit)\b/,
  /\b(cuando (puedo|pueden) (ir|visitar|conocer)|quiero conocer (el )?(desarrollo|zenit))\b/,
  /\ba las \d{1,2}(?!\d)\b/,
  /\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b.{0,24}\b(\d{1,2}(?!\d)|manana|tarde|noche)\b/,
  /\b(hoy|manana|pasado manana)\b.{0,24}\b(tarde|noche|manana|\d{1,2}(?!\d))\b/,
  /\b(en la noche|en la tarde|por la noche|por la tarde|despues de trabajar)\b/,
];

const CLOSE_PATTERNS = [
  /\b(quiero apartar|apartarlo|apartar(lo|la)?|reservar(lo)?|quiero comprar|lo aparto)\b/,
  /\b(formalizar|firmar (el )?contrato|dar (el )?enganche)\b/,
];

export function detectAdvisorNeed(text: string): AdvisorNeedReason | null {
  const folded = fold(text.trim());
  if (!folded) return null;
  if (HUMAN_PATTERNS.some((re) => re.test(folded))) {
    return "Pide hablar con un asesor";
  }
  if (CONTACT_PATTERNS.some((re) => re.test(folded))) {
    return "Quiere llamada o visita";
  }
  if (CLOSE_PATTERNS.some((re) => re.test(folded))) {
    return "Quiere apartar o avanzar la compra";
  }
  return null;
}

export const ADVISOR_FALLBACK_REASON: AdvisorNeedReason = "ARGI no pudo responder";
export const ADVISOR_HANDOFF_REASON: AdvisorNeedReason = "ARGI pasó el chat a un asesor";

const HANDOFF_PATTERNS = [
  /\bun asesor te (contacta|atiende|atendera|llama|hablara|visita)/,
  /\bte (contacta|atiende|atendera|llama|llamamos) (un asesor|en breve)/,
  /\bun asesor se (pone|pondra) en contacto/,
  /\b(paso|canalizo|dejo) (tus datos|tu numero|el chat) (con |a )?(un )?asesor/,
  /\bte (paso|canalizo|agendo) (con )?(un )?asesor/,
  /\b(queda agendada|agendamos (tu |la )?(llamada|visita)|te llamamos)\b/,
];

export function detectAdvisorHandoff(aiText: string): AdvisorNeedReason | null {
  const folded = fold(aiText.trim());
  if (!folded) return null;
  if (HANDOFF_PATTERNS.some((re) => re.test(folded))) {
    return ADVISOR_HANDOFF_REASON;
  }
  return null;
}
