-- Growth analytics: self-learning viral optimization
CREATE TABLE IF NOT EXISTS growth_analytics (
  id BIGSERIAL PRIMARY KEY,
  event TEXT NOT NULL,          -- 'page_view', 'share_click', 'try_forecast', 'email_signup', 'install_copy'
  page TEXT,                    -- '/', '/demo', '/try'
  channel TEXT,                 -- 'x', 'linkedin', 'reddit', 'hn', 'organic'
  variant TEXT,                 -- A/B test variant ID
  metadata JSONB DEFAULT '{}',
  ip_hash TEXT,                 -- hashed IP for dedup (not PII)
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ga_event ON growth_analytics(event);
CREATE INDEX IF NOT EXISTS idx_ga_created ON growth_analytics(created_at);
CREATE INDEX IF NOT EXISTS idx_ga_channel ON growth_analytics(channel);
CREATE INDEX IF NOT EXISTS idx_ga_variant ON growth_analytics(variant);

-- Growth config: stores A/B test variants, share button order, best performers
CREATE TABLE IF NOT EXISTS growth_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial config
INSERT INTO growth_config (key, value) VALUES
  ('hero_variants', '[
    {"id":"A","headline":"Verified Cloud Pricing for AI Agents","sub":"Stop hallucinated cost estimates. AWS, GCP, Azure.","weight":25},
    {"id":"B","headline":"Your AI Agent Is Wrong About Cloud Costs","sub":"LLMs say RDS costs $15/mo. Real price: $204. We fix that.","weight":25},
    {"id":"C","headline":"The Integrity Layer for Agentic Infrastructure","sub":"Four tools that stop AI agents from making expensive mistakes.","weight":25},
    {"id":"D","headline":"Stop Your AI Agent From Blowing Your Cloud Budget","sub":"13x pricing errors become real invoices. IntegrityPulse returns the real number.","weight":25}
  ]'::jsonb),
  ('share_order', '["x","linkedin","reddit","hn"]'::jsonb),
  ('best_channel', '"x"'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Grant access via service role
ALTER TABLE growth_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE growth_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on growth_analytics" ON growth_analytics
  FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service role full access on growth_config" ON growth_config
  FOR ALL USING (auth.role() = 'service_role');
