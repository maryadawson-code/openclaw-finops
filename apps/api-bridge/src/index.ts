import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  getSupabaseClient,
  authenticateAndCheckLimits,
  extractApiKey,
  extractReferralCode,
  handleStripeWebhook,
} from "@integritypulse/core";
import { createApiBridgeServer } from "./mcp-server.js";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
app.get("/", (c) =>
  c.json({ status: "ok", service: "openclaw-api-bridge", suite: "openclaw" })
);

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp
// ---------------------------------------------------------------------------
app.get("/.well-known/mcp", (c) => {
  return c.json({
    "mcp-version": "1.0.0",
    name: "IntegrityPulse-API-Bridge",
    version: "1.0.0",
    description:
      "Fetch and parse OpenAPI/Swagger specs into executable MCP tool definitions. Stops AI hallucination by grounding API usage in live specifications.",
    transport: {
      type: "https",
      url: "https://integritypulse-api-bridge.marywomack.workers.dev/mcp",
    },
    capabilities: { tools: ["bridge_api_spec"] },
    auth: { type: "apiKey", header: "x-api-key" },
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/ai — IETF draft-aiendpoint-ai-discovery-00
// ---------------------------------------------------------------------------
app.get("/.well-known/ai", (c) => {
  return c.json({
    aiendpoint: "1.0",
    service: {
      name: "IntegrityPulse API-Bridge",
      description:
        "Fetches live OpenAPI/Swagger specs and converts them into structured, executable tool definitions for AI agents.",
      category: ["developer"],
      language: ["en"],
    },
    capabilities: [
      {
        id: "bridge_api_spec",
        description: "Parse an OpenAPI/Swagger spec URL into structured endpoint definitions.",
        endpoint: "/mcp",
        method: "POST",
        params: {
          openapi_url: "string, required -- URL of the OpenAPI/Swagger spec (JSON or YAML)",
        },
        returns: "result {content[] {type, text}} -- Markdown table of endpoints with parameters and schemas",
      },
    ],
    auth: {
      type: "apikey",
      header: "x-api-key",
      docs: "https://billing.openclaw.com/docs",
    },
    rate_limits: { requests_per_minute: 30, agent_tier_available: true },
    meta: { last_updated: "2026-03-28" },
  });
});

// ---------------------------------------------------------------------------
// MCP endpoint — Revenue Gate → API-Bridge server
// ---------------------------------------------------------------------------
app.post("/mcp", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const apiKey = extractApiKey(c.req.raw.headers);
  const referralCode = extractReferralCode(c.req.raw.headers);
  const authResult = await authenticateAndCheckLimits(supabase, apiKey, referralCode);

  if (!authResult.ok) {
    let requestId: string | number | null = null;
    try {
      const body = await c.req.json();
      requestId = body?.id ?? null;
    } catch {}

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

  // Create a server scoped to this user's tier (controls API bridge limits)
  const server = createApiBridgeServer(authResult.user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// ---------------------------------------------------------------------------
// Stripe webhook — shared handler from @integritypulse/core
// ---------------------------------------------------------------------------
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
