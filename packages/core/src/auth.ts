import { SupabaseClient } from "@supabase/supabase-js";
import {
  getUserByApiKey,
  getUserByReferralCode,
  linkReferral,
  incrementUsage,
  UserRecord,
} from "./supabase.js";

const DEFAULT_FREE_LIMIT = 25;

/**
 * Tier hierarchy (ascending access):
 *   FREE  → FinOps, API-Bridge (limited)
 *   PRO   → FinOps, API-Bridge (expanded)          $29/mo
 *   TEAM  → + Guardrail, Fortress Core (Tools 1-7)  $99/mo
 *   ENTERPRISE → + Fortress Advanced (Tools 8-12)   $499/mo
 */
export const TIER_RANK: Record<string, number> = {
  FREE: 0,
  PRO: 1,
  TEAM: 2,
  ENTERPRISE: 3,
};

function buildExhaustedMessage(user: UserRecord): string {
  const limit = user.monthly_limit ?? DEFAULT_FREE_LIMIT;
  const tier = user.tier;

  if (tier === "ENTERPRISE") {
    return (
      `OpenClaw: Enterprise usage limit reached (${limit}/${limit}). ` +
      `Contact support@openclaw.com to increase your allocation.`
    );
  }

  if (tier === "TEAM") {
    return (
      `OpenClaw: Team usage limit reached (${limit}/${limit}). ` +
      `Upgrade to Enterprise ($499/mo) to unlock 50,000 ops/month, visual contracts, ` +
      `automated rollbacks, and route parity verification: https://billing.openclaw.com/enterprise`
    );
  }

  if (tier === "PRO") {
    return (
      `OpenClaw: Pro usage limit reached (${limit}/${limit}). ` +
      `Upgrade to Team ($99/mo) for 2,000 ops/month plus Guardrail and Fortress Core: ` +
      `https://billing.openclaw.com/team`
    );
  }

  // FREE
  return (
    `OpenClaw FinOps Alert: Your free monthly tier (${limit}/${limit} operations) has been exhausted. ` +
    `Upgrade to Pro ($29/mo) for 500 ops/month: https://billing.openclaw.com/pro. ` +
    `Once upgraded, ask me to retry.\n\n` +
    `Need more free calls? Share your referral code "${user.referral_code}" — ` +
    `when a new user includes it in their x-referral-code header, you both get +5 operations.`
  );
}

export type AuthResult =
  | { ok: true; user: UserRecord }
  | { ok: false; reason: "missing_key" | "invalid_key" | "rate_limited"; message: string };

/**
 * Extract the API key from x-api-key or Authorization (Bearer) header.
 */
export function extractApiKey(headers: Headers): string | undefined {
  const explicit = headers.get("x-api-key");
  if (explicit) return explicit;

  const auth = headers.get("authorization");
  if (auth) {
    const match = auth.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }

  return undefined;
}

/**
 * Extract the referral code from the x-referral-code header.
 */
export function extractReferralCode(headers: Headers): string | undefined {
  return headers.get("x-referral-code") ?? undefined;
}

export async function authenticateAndCheckLimits(
  supabase: SupabaseClient,
  apiKey: string | undefined,
  referralCode?: string
): Promise<AuthResult> {
  if (!apiKey) {
    return {
      ok: false,
      reason: "missing_key",
      message: "Missing API key. Provide an x-api-key or Authorization: Bearer header.",
    };
  }

  const user = await getUserByApiKey(supabase, apiKey);
  if (!user) {
    return { ok: false, reason: "invalid_key", message: "Invalid API key." };
  }

  // --- Referral processing ---
  if (referralCode && !user.referred_by) {
    const referrer = await getUserByReferralCode(supabase, referralCode);
    if (referrer && referrer.user_id !== user.user_id) {
      await linkReferral(supabase, user.user_id, referrer.user_id);
      user.monthly_limit += 5;
    }
  }

  // --- Rate limit check ---
  const limit = user.monthly_limit ?? DEFAULT_FREE_LIMIT;
  if (user.monthly_usage_count >= limit) {
    return {
      ok: false,
      reason: "rate_limited",
      message: buildExhaustedMessage(user),
    };
  }

  await incrementUsage(supabase, user.user_id);

  return { ok: true, user };
}
