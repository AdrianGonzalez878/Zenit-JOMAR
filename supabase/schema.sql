-- ============================================================
-- ESQUEMA DE BASE DE DATOS — ARGI / JOMAR (Puerto Escondido)
-- Ejecutar en el SQL Editor de un proyecto NUEVO de Supabase.
-- No uses el proyecto de Conchita Plata BOT.
-- ============================================================

-- ------------------------------------------------------------
-- Conversaciones (WhatsApp)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_phone TEXT NOT NULL UNIQUE,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'ai_active'
    CHECK (status IN ('ai_active', 'paused', 'resolved')),
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  unread_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Mensajes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  sender TEXT NOT NULL CHECK (sender IN ('customer', 'ai', 'admin')),
  content TEXT NOT NULL,
  media_url TEXT,
  whatsapp_message_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Catálogo de terrenos / lotes
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT,
  zone TEXT NOT NULL,
  area_m2 NUMERIC(12, 2) NOT NULL,
  front_m NUMERIC(10, 2),
  depth_m NUMERIC(10, 2),
  cost_per_m2 NUMERIC(12, 2),
  price NUMERIC(14, 2),
  down_payment NUMERIC(14, 2),
  monthly_payment NUMERIC(14, 2),
  monthly_term INTEGER,
  price_36 NUMERIC(14, 2),
  monthly_36 NUMERIC(14, 2),
  price_48 NUMERIC(14, 2),
  monthly_48 NUMERIC(14, 2),
  price_12 NUMERIC(14, 2),
  price_cash NUMERIC(14, 2),
  has_electricity BOOLEAN NOT NULL DEFAULT false,
  has_water BOOLEAN NOT NULL DEFAULT false,
  has_sewage BOOLEAN NOT NULL DEFAULT false,
  other_services TEXT,
  status TEXT NOT NULL DEFAULT 'disponible'
    CHECK (status IN ('disponible', 'apartado', 'vendido')),
  photo_urls TEXT[] NOT NULL DEFAULT '{}',
  maps_url TEXT,
  latitude NUMERIC(10, 7),
  longitude NUMERIC(10, 7),
  plusvalia_notes TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_lots_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lots_updated_at ON lots;
CREATE TRIGGER trg_lots_updated_at
  BEFORE UPDATE ON lots
  FOR EACH ROW
  EXECUTE PROCEDURE set_lots_updated_at();

-- Índices
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_lots_status ON lots(status);
CREATE INDEX IF NOT EXISTS idx_lots_zone ON lots(zone);
CREATE INDEX IF NOT EXISTS idx_lots_price ON lots(price);
CREATE INDEX IF NOT EXISTS idx_lots_area ON lots(area_m2);

-- Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE lots ENABLE ROW LEVEL SECURITY;

-- Conversaciones
CREATE POLICY "Admins pueden ver conversaciones"
  ON conversations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins pueden actualizar conversaciones"
  ON conversations FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Service role puede insertar conversaciones"
  ON conversations FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role puede actualizar conversaciones"
  ON conversations FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Mensajes
CREATE POLICY "Admins pueden ver mensajes"
  ON messages FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Service role puede insertar mensajes"
  ON messages FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Lotes: el dashboard autenticado puede leer; el webhook usa service_role
CREATE POLICY "Admins pueden ver lotes"
  ON lots FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins pueden gestionar lotes"
  ON lots FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role puede leer lotes"
  ON lots FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role puede gestionar lotes"
  ON lots FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Incrementa no leídos cuando llega un mensaje
CREATE OR REPLACE FUNCTION increment_conversation_unread(conv_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE conversations
  SET unread_count = COALESCE(unread_count, 0) + 1,
      last_message_at = NOW()
  WHERE id = conv_id;
END;
$$;

-- Realtime para el dashboard en vivo
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
