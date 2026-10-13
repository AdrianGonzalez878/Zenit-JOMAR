-- Avisos push (celular con la app cerrada)
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
  ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins ven avisos" ON push_subscriptions;
CREATE POLICY "Admins ven avisos"
  ON push_subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins guardan avisos" ON push_subscriptions;
CREATE POLICY "Admins guardan avisos"
  ON push_subscriptions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins actualizan avisos" ON push_subscriptions;
CREATE POLICY "Admins actualizan avisos"
  ON push_subscriptions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins borran avisos" ON push_subscriptions;
CREATE POLICY "Admins borran avisos"
  ON push_subscriptions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service gestiona avisos" ON push_subscriptions;
CREATE POLICY "Service gestiona avisos"
  ON push_subscriptions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
