export const WHATSAPP_VERTICALS = [
  { value: "PROF_SERVICES", label: "Servicios profesionales (inmobiliaria)" },
  { value: "OTHER", label: "Otra" },
  { value: "RETAIL", label: "Retail" },
  { value: "HOTEL", label: "Hotel / hospedaje" },
  { value: "TRAVEL", label: "Viajes" },
  { value: "FINANCE", label: "Finanzas" },
  { value: "EDU", label: "Educación" },
  { value: "HEALTH", label: "Salud" },
  { value: "BEAUTY", label: "Belleza" },
  { value: "APPAREL", label: "Ropa" },
  { value: "AUTO", label: "Automotriz" },
  { value: "RESTAURANT", label: "Restaurante" },
  { value: "GROCERY", label: "Abarrotes" },
  { value: "ENTERTAIN", label: "Entretenimiento" },
  { value: "EVENT_PLAN", label: "Eventos" },
  { value: "NONPROFIT", label: "Organización sin fines de lucro" },
  { value: "GOVT", label: "Gobierno" },
] as const;

export type WhatsAppVertical = (typeof WHATSAPP_VERTICALS)[number]["value"];

export interface WhatsAppBusinessProfile {
  about: string;
  address: string;
  description: string;
  email: string;
  profile_picture_url: string;
  websites: string[];
  vertical: string;
  verified_name: string;
  display_phone_number: string;
  quality_rating: string;
}
