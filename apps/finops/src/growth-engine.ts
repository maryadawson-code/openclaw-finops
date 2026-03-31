/**
 * Self-learning growth engine.
 *
 * Tracks: page views, share clicks, /try conversions, install copies, email signups.
 * Learns: which headline variant converts best, which share channel drives traffic.
 * Adapts: reweights A/B variants hourly, reorders share buttons by performance.
 */

import { getSupabaseClient } from "@integritypulse/core";

interface GrowthConfig {
  hero_variants: HeroVariant[];
  share_order: string[];
  best_channel: string;
}

interface HeroVariant {
  id: string;
  headline: string;
  sub: string;
  weight: number;
}

// ---------- Event Tracking ----------

export async function trackEvent(
  supabase: ReturnType<typeof getSupabaseClient>,
  event: string,
  opts: { page?: string; channel?: string; variant?: string; metadata?: Record<string, unknown>; ipHash?: string } = {}
) {
  try {
    await supabase.from("growth_analytics").insert({
      event,
      page: opts.page,
      channel: opts.channel,
      variant: opts.variant,
      metadata: opts.metadata || {},
      ip_hash: opts.ipHash,
    });
  } catch {
    // Non-blocking — never fail a request over analytics
  }
}

export function hashIP(ip: string): string {
  // Simple hash — not cryptographic, just for dedup
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    hash = ((hash << 5) - hash + ip.charCodeAt(i)) | 0;
  }
  return "h_" + Math.abs(hash).toString(36);
}

// ---------- A/B Test Selection ----------

export async function getHeroVariant(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<HeroVariant> {
  try {
    const { data } = await supabase
      .from("growth_config")
      .select("value")
      .eq("key", "hero_variants")
      .single();

    if (data?.value) {
      const variants = data.value as HeroVariant[];
      return weightedRandom(variants);
    }
  } catch {}

  // Fallback
  return { id: "A", headline: "Verified Cloud Pricing for AI Agents", sub: "Stop hallucinated cost estimates. AWS, GCP, Azure.", weight: 100 };
}

export async function getShareOrder(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<string[]> {
  try {
    const { data } = await supabase
      .from("growth_config")
      .select("value")
      .eq("key", "share_order")
      .single();

    if (data?.value) return data.value as string[];
  } catch {}

  return ["x", "linkedin", "reddit", "hn"];
}

function weightedRandom(variants: HeroVariant[]): HeroVariant {
  const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
  let r = Math.random() * totalWeight;
  for (const v of variants) {
    r -= v.weight;
    if (r <= 0) return v;
  }
  return variants[0];
}

// ---------- Self-Optimization ----------

export async function optimizeWeights(
  supabase: ReturnType<typeof getSupabaseClient>
): Promise<{ optimized: boolean; insights: Record<string, unknown> }> {
  // Get events from the last 24 hours
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Count conversions per variant (page_view with variant → try_forecast)
  const { data: views } = await supabase
    .from("growth_analytics")
    .select("variant")
    .eq("event", "page_view")
    .eq("page", "/")
    .gte("created_at", since);

  const { data: tries } = await supabase
    .from("growth_analytics")
    .select("variant")
    .eq("event", "try_forecast")
    .gte("created_at", since);

  const { data: shares } = await supabase
    .from("growth_analytics")
    .select("channel")
    .eq("event", "share_click")
    .gte("created_at", since);

  // Calculate variant conversion rates
  const variantViews: Record<string, number> = {};
  const variantConversions: Record<string, number> = {};

  for (const v of views || []) {
    if (v.variant) variantViews[v.variant] = (variantViews[v.variant] || 0) + 1;
  }
  for (const t of tries || []) {
    if (t.variant) variantConversions[t.variant] = (variantConversions[t.variant] || 0) + 1;
  }

  const variantRates: Record<string, number> = {};
  for (const [id, viewCount] of Object.entries(variantViews)) {
    const convCount = variantConversions[id] || 0;
    variantRates[id] = viewCount > 0 ? convCount / viewCount : 0;
  }

  // Calculate channel performance
  const channelCounts: Record<string, number> = {};
  for (const s of shares || []) {
    if (s.channel) channelCounts[s.channel] = (channelCounts[s.channel] || 0) + 1;
  }

  // Only optimize if we have enough data (min 50 total views)
  const totalViews = Object.values(variantViews).reduce((s, v) => s + v, 0);

  if (totalViews < 50) {
    return {
      optimized: false,
      insights: {
        reason: "Not enough data yet",
        totalViews,
        needed: 50,
        variantViews,
        variantConversions,
        channelCounts,
      },
    };
  }

  // Reweight variants: winners get more traffic (Thompson sampling simplified)
  const { data: configData } = await supabase
    .from("growth_config")
    .select("value")
    .eq("key", "hero_variants")
    .single();

  if (configData?.value) {
    const variants = configData.value as HeroVariant[];
    const totalRate = Object.values(variantRates).reduce((s, r) => s + r, 0) || 1;

    for (const v of variants) {
      const rate = variantRates[v.id] || 0;
      // Blend: 70% performance-based, 30% exploration floor
      v.weight = Math.max(5, Math.round((rate / totalRate) * 70 + 30 / variants.length));
    }

    // Normalize to 100
    const totalWeight = variants.reduce((s, v) => s + v.weight, 0);
    for (const v of variants) {
      v.weight = Math.round((v.weight / totalWeight) * 100);
    }

    await supabase
      .from("growth_config")
      .upsert({ key: "hero_variants", value: variants, updated_at: new Date().toISOString() });
  }

  // Reorder share buttons by click count
  const sortedChannels = Object.entries(channelCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([ch]) => ch);

  if (sortedChannels.length > 0) {
    // Ensure all channels present
    const allChannels = ["x", "linkedin", "reddit", "hn"];
    const ordered = [...sortedChannels, ...allChannels.filter((c) => !sortedChannels.includes(c))];

    await supabase
      .from("growth_config")
      .upsert({ key: "share_order", value: ordered, updated_at: new Date().toISOString() });

    await supabase
      .from("growth_config")
      .upsert({ key: "best_channel", value: ordered[0], updated_at: new Date().toISOString() });
  }

  return {
    optimized: true,
    insights: {
      totalViews,
      variantRates,
      channelCounts,
      newShareOrder: sortedChannels,
    },
  };
}
