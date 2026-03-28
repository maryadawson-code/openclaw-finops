-- Migration 006: Add TEAM tier to users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_tier_check;
ALTER TABLE users ADD CONSTRAINT users_tier_check
  CHECK (tier IN ('FREE', 'PRO', 'TEAM', 'ENTERPRISE'));
