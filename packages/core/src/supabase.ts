import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface UserRecord {
  user_id: string;
  api_key: string;
  stripe_customer_id: string | null;
  tier: "FREE" | "PRO" | "TEAM" | "ENTERPRISE";
  monthly_usage_count: number;
  monthly_limit: number;
  referral_code: string;
  referred_by: string | null;
}

export function getSupabaseClient(url: string, key: string): SupabaseClient {
  return createClient(url, key);
}

export async function getUserByApiKey(
  supabase: SupabaseClient,
  apiKey: string
): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("api_key", apiKey)
    .single();

  if (error || !data) return null;
  return data as UserRecord;
}

export async function getUserByReferralCode(
  supabase: SupabaseClient,
  referralCode: string
): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("referral_code", referralCode)
    .single();

  if (error || !data) return null;
  return data as UserRecord;
}

export async function linkReferral(
  supabase: SupabaseClient,
  newUserId: string,
  referrerId: string
): Promise<void> {
  // Link the new user to the referrer
  await supabase
    .from("users")
    .update({ referred_by: referrerId })
    .eq("user_id", newUserId);

  // Bonus: +5 monthly_limit for BOTH users
  for (const uid of [newUserId, referrerId]) {
    const { data } = await supabase
      .from("users")
      .select("monthly_limit")
      .eq("user_id", uid)
      .single();

    const current = data?.monthly_limit ?? 25;
    await supabase
      .from("users")
      .update({ monthly_limit: current + 5 })
      .eq("user_id", uid);
  }
}

export async function incrementUsage(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  // Atomic increment via raw SQL RPC if available, otherwise read-then-write.
  const { error: rpcError } = await supabase.rpc("increment_usage", { uid: userId });

  if (rpcError) {
    // Fallback: fetch current count → write +1 (acceptable for low-contention dev/test)
    const { data } = await supabase
      .from("users")
      .select("monthly_usage_count")
      .eq("user_id", userId)
      .single();

    const current = data?.monthly_usage_count ?? 0;
    await supabase
      .from("users")
      .update({ monthly_usage_count: current + 1 })
      .eq("user_id", userId);
  }
}

export async function getUserById(
  supabase: SupabaseClient,
  userId: string
): Promise<UserRecord | null> {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data as UserRecord;
}

export async function upgradeUser(
  supabase: SupabaseClient,
  userId: string,
  tier: "PRO" | "TEAM" | "ENTERPRISE" = "PRO"
): Promise<UserRecord | null> {
  const TIER_LIMITS: Record<string, number> = {
    PRO: 500,
    TEAM: 2000,
    ENTERPRISE: 50000,
  };
  const limit = TIER_LIMITS[tier] ?? 500;

  await supabase
    .from("users")
    .update({ tier, monthly_usage_count: 0, monthly_limit: limit })
    .eq("user_id", userId);

  // Log the upgrade event
  await supabase.from("upgrade_events").insert({
    user_id: userId,
    upgraded_at: new Date().toISOString(),
    source: "stripe_checkout",
  }).then(() => {}, () => {
    // Table may not exist yet — non-fatal
  });

  return getUserById(supabase, userId);
}

// =========================================================================
// Fortress Registry Types & Queries
// =========================================================================

export interface AssetRegistryEntry {
  id: string;
  asset_purpose: string;
  canonical_path: string;
  expected_sha256: string;
  status: "active" | "deprecated";
}

export interface RouteManifestEntry {
  id: string;
  route_path: string;
  canonical_url: string;
  expected_shell_signature: string;
}

export interface ForbiddenContentEntry {
  id: string;
  keyword_pattern: string;
  category: "prompt_leak" | "placeholder" | "internal_note";
}

export async function getCanonicalAsset(
  supabase: SupabaseClient,
  purpose: string
): Promise<AssetRegistryEntry | null> {
  const { data, error } = await supabase
    .from("asset_registry")
    .select("*")
    .eq("asset_purpose", purpose)
    .eq("status", "active")
    .single();

  if (error || !data) return null;
  return data as AssetRegistryEntry;
}

export async function getRouteManifest(
  supabase: SupabaseClient,
  route: string
): Promise<RouteManifestEntry | null> {
  const { data, error } = await supabase
    .from("route_manifest")
    .select("*")
    .eq("route_path", route)
    .single();

  if (error || !data) return null;
  return data as RouteManifestEntry;
}

export async function getForbiddenPatterns(
  supabase: SupabaseClient
): Promise<ForbiddenContentEntry[]> {
  const { data, error } = await supabase
    .from("forbidden_content")
    .select("*")
    .order("category");

  if (error || !data) return [];
  return data as ForbiddenContentEntry[];
}
