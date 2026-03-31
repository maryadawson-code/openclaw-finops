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
import { createGuardrailServer } from "./mcp-server.js";

const TEAM_GATE_MESSAGE =
  "IntegrityPulse Guardrail requires a TEAM subscription ($99/mo). " +
  "Upgrade to scan infrastructure for security vulnerabilities and ghost costs: " +
  "https://billing.openclaw.com/team";

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
  c.json({ status: "ok", service: "openclaw-guardrail", suite: "openclaw" })
);

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp
// ---------------------------------------------------------------------------
app.get("/.well-known/mcp", (c) => {
  return c.json({
    "mcp-version": "1.0.0",
    name: "IntegrityPulse-Guardrail",
    version: "1.0.0",
    description:
      "Enterprise infrastructure security scanner. Audits IaC for security vulnerabilities and ghost costs before deployment.",
    transport: {
      type: "https",
      url: "https://integritypulse-guardrail.marywomack.workers.dev/mcp",
    },
    capabilities: { tools: ["audit_infrastructure_code"] },
    auth: { type: "apiKey", header: "x-api-key" },
    access: "enterprise-only",
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/ai
// ---------------------------------------------------------------------------
app.get("/.well-known/ai", (c) => {
  return c.json({
    aiendpoint: "1.0",
    service: {
      name: "IntegrityPulse Guardrail",
      description:
        "Enterprise infrastructure security scanner. Audits Terraform, CloudFormation, and Pulumi code for vulnerabilities and ghost costs.",
      category: ["developer"],
      language: ["en"],
    },
    capabilities: [
      {
        id: "audit_infrastructure_code",
        description: "Scan IaC for security risks and ghost costs before deployment.",
        endpoint: "/mcp",
        method: "POST",
        params: {
          code_content: "string, required -- infrastructure code to audit",
          provider: "string, required -- AWS|GCP|AZURE",
          format: "string, required -- HCL|YAML|JSON",
        },
        returns: "result {content[] {type, text}, isError?} -- audit report with findings, severity, and remediation",
      },
    ],
    auth: { type: "apikey", header: "x-api-key" },
    rate_limits: { requests_per_minute: 30 },
    meta: { last_updated: "2026-03-28" },
  });
});

// ---------------------------------------------------------------------------
// MCP endpoint — Enterprise gate → Guardrail server
// ---------------------------------------------------------------------------
app.post("/mcp", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const apiKey = extractApiKey(c.req.raw.headers);
  const referralCode = extractReferralCode(c.req.raw.headers);
  const authResult = await authenticateAndCheckLimits(supabase, apiKey, referralCode);

  // Read the raw body once — we may need it for error responses or the MCP transport
  const rawBody = await c.req.text();
  let requestId: string | number | null = null;
  try {
    const parsed = JSON.parse(rawBody);
    requestId = parsed?.id ?? null;
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

  // --- TEAM+ gate ---
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

  // Reconstruct the request with the body for the MCP transport
  const reconstructed = new Request(c.req.raw.url, {
    method: c.req.raw.method,
    headers: c.req.raw.headers,
    body: rawBody,
  });

  const server = createGuardrailServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(reconstructed);
});

// ---------------------------------------------------------------------------
// Stripe webhook
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
