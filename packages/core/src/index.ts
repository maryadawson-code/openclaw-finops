// @openclaw/core — shared auth, billing, and database logic for all OpenClaw servers

export {
  authenticateAndCheckLimits,
  extractApiKey,
  extractReferralCode,
  TIER_RANK,
  type AuthResult,
} from "./auth.js";

export {
  getSupabaseClient,
  getUserByApiKey,
  getUserByReferralCode,
  getUserById,
  linkReferral,
  incrementUsage,
  upgradeUser,
  type UserRecord,
  getCanonicalAsset,
  getRouteManifest,
  getForbiddenPatterns,
  type AssetRegistryEntry,
  type RouteManifestEntry,
  type ForbiddenContentEntry,
} from "./supabase.js";

export { sendProWelcomeEmail, type WelcomeEmailData } from "./email.js";

export { handleStripeWebhook, type StripeEnv } from "./stripe.js";
