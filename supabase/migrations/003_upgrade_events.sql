-- Migration: Create upgrade_events table for tracking paying customers
CREATE TABLE IF NOT EXISTS upgrade_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(user_id),
  upgraded_at timestamptz NOT NULL DEFAULT NOW(),
  source text NOT NULL DEFAULT 'stripe_checkout'
);

CREATE INDEX IF NOT EXISTS idx_upgrade_events_user ON upgrade_events(user_id);
CREATE INDEX IF NOT EXISTS idx_upgrade_events_date ON upgrade_events(upgraded_at);
