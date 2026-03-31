import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  getSupabaseClient,
  authenticateAndCheckLimits,
  extractApiKey,
  extractReferralCode,
  handleStripeWebhook,
  TIER_RANK,
} from "@integritypulse/core";
import { createFortressServer } from "./mcp-server.js";

const TEAM_GATE_MESSAGE =
  "IntegrityPulse Fortress Core requires a TEAM subscription ($99/mo). " +
  "Upgrade to prevent AI deployment drift: https://billing.openclaw.com/team";

// The Fortress no longer has a single Enterprise gate at the /mcp level.
// Instead, tool-level gating is handled inside the MCP server itself.
// The /mcp endpoint lets all authenticated users through, and each tool
// checks the tier via the user record passed to createFortressServer.

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY?: string;
  NOTIFICATION_WEBHOOK_URL?: string;
  GITHUB_PAT?: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/", (c) =>
  c.json({ status: "ok", service: "openclaw-fortress", suite: "openclaw" })
);

app.get("/.well-known/mcp", (c) => {
  return c.json({
    "mcp-version": "1.0.0",
    name: "IntegrityPulse-Fortress",
    version: "1.0.0",
    description:
      "Zero-trust live state verification. Fetches URLs with cache-busting, inspects HTTP headers, and validates DOM signatures.",
    transport: {
      type: "https",
      url: "https://integritypulse-fortress.marywomack.workers.dev/mcp",
    },
    capabilities: { tools: ["verify_live_state"] },
    auth: { type: "apiKey", header: "x-api-key" },
    access: "enterprise-only",
  });
});

app.get("/.well-known/ai", (c) => {
  return c.json({
    aiendpoint: "1.0",
    service: {
      name: "IntegrityPulse Fortress",
      description:
        "Zero-trust live state verification engine. Fetches URLs, bypasses edge caches, and validates DOM signatures to prove what end users actually see.",
      category: ["developer"],
      language: ["en"],
    },
    capabilities: [
      {
        id: "verify_live_state",
        description: "Fetch a URL, report cache status, and validate DOM assertions.",
        endpoint: "/mcp",
        method: "POST",
        params: {
          target_url: "string, required -- URL to verify",
          expected_dom_signature: "string, optional -- DOM assertion (e.g., 'exactly one <header id=\"main-nav\">')",
          bypass_cache: "boolean, optional, default false -- force origin hit",
        },
        returns: "result {content[] {type, text}, isError?} -- verification report with cache verdict and DOM check",
      },
    ],
    auth: { type: "apikey", header: "x-api-key" },
    meta: { last_updated: "2026-03-28" },
  });
});

app.post("/mcp", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const apiKey = extractApiKey(c.req.raw.headers);
  const referralCode = extractReferralCode(c.req.raw.headers);
  const authResult = await authenticateAndCheckLimits(supabase, apiKey, referralCode);

  const rawBody = await c.req.text();
  let requestId: string | number | null = null;
  try {
    requestId = JSON.parse(rawBody)?.id ?? null;
  } catch {}

  if (!authResult.ok) {
    if (authResult.reason === "rate_limited") {
      return c.json({
        jsonrpc: "2.0",
        id: requestId,
        result: {
          content: [{ type: "text", text: authResult.message }],
          isError: true,
        },
      }, 200);
    }
    return c.json({
      jsonrpc: "2.0",
      id: requestId,
      error: { code: -32001, message: authResult.message },
    }, 401);
  }

  // Minimum tier for Fortress: TEAM
  // Individual tools enforce their own tier gates (TEAM for 1-7, ENTERPRISE for 8-12)
  const userRank = TIER_RANK[authResult.user.tier] ?? 0;
  if (userRank < TIER_RANK.TEAM) {
    return c.json({
      jsonrpc: "2.0",
      id: requestId,
      result: {
        content: [{ type: "text", text: TEAM_GATE_MESSAGE }],
        isError: true,
      },
    }, 200);
  }

  const reconstructed = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: rawBody,
  });

  // Pass the user so the MCP server can enforce per-tool tier gates
  const server = createFortressServer(supabase, {
    supabase,
    notificationWebhookUrl: c.env.NOTIFICATION_WEBHOOK_URL,
    githubPat: c.env.GITHUB_PAT,
    userTier: authResult.user.tier,
  });
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(reconstructed);
});

app.post("/api/webhook/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing stripe-signature header" }, 400);
  const rawBody = await c.req.text();
  const result = await handleStripeWebhook(rawBody, sig, {
    STRIPE_SECRET_KEY: c.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: c.env.STRIPE_WEBHOOK_SECRET,
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY,
    RESEND_API_KEY: c.env.RESEND_API_KEY,
  });
  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ received: true });
});

export default app;
