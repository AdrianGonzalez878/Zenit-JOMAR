// ============================================================
// TIPOS — ARGI / JOMAR
// ============================================================

export type WhatsAppMessageType =
  | "text"
  | "image"
  | "audio"
  | "document"
  | "interactive"
  | "location";

export interface WhatsAppMessage {
  id: string;
  from: string;
  timestamp: string;
  type: WhatsAppMessageType;
  text?: { body: string };
  image?: { id: string; mime_type: string; caption?: string };
}

export interface WhatsAppWebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: { display_phone_number: string; phone_number_id: string };
        contacts?: Array<{ profile: { name: string }; wa_id: string }>;
        messages?: WhatsAppMessage[];
        statuses?: Array<{
          id: string;
          status: string;
          timestamp: string;
          recipient_id: string;
        }>;
      };
      field: string;
    }>;
  }>;
}

export type ConversationStatus = "ai_active" | "paused" | "resolved";

export interface Conversation {
  id: string;
  customer_phone: string;
  customer_name: string | null;
  status: ConversationStatus;
  last_message_at: string;
  created_at: string;
  unread_count: number;
  needs_advisor: boolean;
  needs_advisor_at: string | null;
  needs_advisor_reason: string | null;
}

export type MessageRole = "user" | "assistant" | "system";
export type MessageSender = "customer" | "ai" | "admin";

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  sender: MessageSender;
  content: string;
  media_url: string | null;
  whatsapp_message_id: string | null;
  created_at: string;
}

export type LotStatus = "disponible" | "apartado" | "vendido";

export interface Lot {
  id: string;
  code: string;
  name: string | null;
  zone: string;
  area_m2: number;
  front_m: number | null;
  depth_m: number | null;
  cost_per_m2: number | null;
  price: number | null;
  down_payment: number | null;
  monthly_payment: number | null;
  monthly_term: number | null;
  price_36: number | null;
  monthly_36: number | null;
  price_48: number | null;
  monthly_48: number | null;
  price_12: number | null;
  price_cash: number | null;
  has_electricity: boolean;
  has_water: boolean;
  has_sewage: boolean;
  other_services: string | null;
  status: LotStatus;
  photo_urls: string[];
  maps_url: string | null;
  latitude: number | null;
  longitude: number | null;
  plusvalia_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}
