-- Bandera de "necesita asesor" para conversaciones
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS needs_advisor BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS needs_advisor_at TIMESTAMPTZ;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS needs_advisor_reason TEXT;
