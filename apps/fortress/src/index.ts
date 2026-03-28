import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  getSupabaseClient,
  authenticateAndCheckLimits,
  extractApiKey,
  extractReferralCode,
  handleStripeWebhook,
} from "@openclaw/core";
import { createFortressServer } from "./mcp-server.js";

const ENTERPRISE_GATE_MESSAGE =
  "OpenClaw Fortress is an Enterprise-only zero-trust QA layer. " +
  "To prevent AI deployment drift, cache-masking, and prompt-leakage, " +
  "upgrade here: https://billing.openclaw.com/enterprise";

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
    name: "OpenClaw-Fortress",
    version: "1.0.0",
    description:
      "Zero-trust live state verification. Fetches URLs with cache-busting, inspects HTTP headers, and validates DOM signatures.",
    transport: {
      type: "https",
      url: "https://openclaw-fortress.marywomack.workers.dev/mcp",
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
      name: "OpenClaw Fortress",
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

  if (authResult.user.tier !== "ENTERPRISE") {
    return c.json({
      jsonrpc: "2.0",
      id: requestId,
      result: {
        content: [{ type: "text", text: ENTERPRISE_GATE_MESSAGE }],
        isError: true,
      },
    }, 200);
  }

  const reconstructed = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: rawBody,
  });

  const server = createFortressServer(supabase, {
    supabase,
    notificationWebhookUrl: c.env.NOTIFICATION_WEBHOOK_URL,
    githubPat: c.env.GITHUB_PAT,
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
