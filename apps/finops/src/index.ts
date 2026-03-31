import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  getSupabaseClient,
  authenticateAndCheckLimits,
  extractApiKey,
  extractReferralCode,
  handleStripeWebhook,
} from "@openclaw/core";
import { createMcpServer } from "./mcp-server.js";
import { LLMS_TXT, LLMS_FULL_TXT } from "./llms-txt.js";

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
app.get("/", (c) => c.json({ status: "ok", service: "openclaw-finops", suite: "openclaw" }));

// ---------------------------------------------------------------------------
// Discovery: llms.txt
// ---------------------------------------------------------------------------
app.get("/llms.txt", (c) => c.text(LLMS_TXT));
app.get("/llms-full.txt", (c) => c.text(LLMS_FULL_TXT));

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp
// ---------------------------------------------------------------------------
app.get("/.well-known/mcp", (c) => {
  return c.json({
    "mcp-version": "1.0.0",
    name: "OpenClaw-FinOps",
    version: "1.0.0",
    description:
      "Real-time cloud cost forecasting with a built-in Revenue Gate for agentic workflows.",
    transport: {
      type: "https",
      url: "https://openclaw-finops.marywomack.workers.dev/mcp",
    },
    capabilities: { tools: ["forecast_deployment_cost"] },
    auth: { type: "apiKey", header: "x-api-key" },
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp/server-card.json (Smithery)
// ---------------------------------------------------------------------------
app.get("/.well-known/mcp/server-card.json", (c) => {
  return c.json({
    name: "OpenClaw FinOps",
    description: "Cloud deployment cost forecasting for AI agents. Returns verified, line-item pricing for AWS, GCP, and Azure directly inside agent conversations. Free tier includes 25 operations/month.",
    version: "1.0.0",
    tools: [
      {
        name: "forecast_deployment_cost",
        description: "Estimate monthly cloud deployment cost with a line-item breakdown. Supports AWS, GCP, and Azure.",
        inputSchema: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["AWS", "GCP", "AZURE"], description: "Cloud provider" },
            services_to_add: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  service_name: { type: "string", description: "Service identifier (e.g., ec2.m5.large, rds.postgres.db.m5.large)" },
                  estimated_usage_hours: { type: "number", description: "Monthly usage hours (730 = full month)" },
                },
                required: ["service_name"],
              },
              description: "List of services to price",
            },
          },
          required: ["provider", "services_to_add"],
        },
      },
    ],
    authentication: {
      type: "apiKey",
      header: "x-api-key",
      description: "API key required. Free tier: 25 ops/month.",
    },
  });
});

// ---------------------------------------------------------------------------
// Discovery: Google A2A Agent Card
// ---------------------------------------------------------------------------
app.get("/.well-known/agent.json", (c) => {
  return c.json({
    name: "OpenClaw Integrity Suite",
    description:
      "Three-tool suite for AI agents: verified cloud pricing (FinOps), live API spec parsing (API-Bridge), and infrastructure security scanning (Guardrail).",
    url: "https://openclaw-finops.marywomack.workers.dev",
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    authentication: { schemes: ["apiKey"], credentials: null },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "forecast_deployment_cost",
        name: "Forecast Deployment Cost",
        description: "Estimate monthly cloud deployment cost for AWS, GCP, or Azure.",
        tags: ["finops", "cloud-pricing", "aws", "gcp", "azure"],
        examples: ["What would it cost to run an m5.large with a managed Postgres on AWS?"],
      },
      {
        id: "bridge_api_spec",
        name: "Bridge API Spec",
        description: "Fetch and parse an OpenAPI/Swagger spec into structured endpoint definitions.",
        tags: ["api", "openapi", "swagger", "integration"],
        examples: ["Parse the Stripe API spec and show me the endpoints for creating charges."],
      },
      {
        id: "audit_infrastructure_code",
        name: "Audit Infrastructure Code",
        description: "Scan Terraform/CloudFormation/Pulumi for security vulnerabilities and ghost costs.",
        tags: ["security", "iac", "terraform", "guardrail", "enterprise"],
        examples: ["Audit this Terraform for security issues before I deploy."],
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/ai — IETF draft-aiendpoint-ai-discovery-00
// ---------------------------------------------------------------------------
app.get("/.well-known/ai", (c) => {
  return c.json({
    aiendpoint: "1.0",
    service: {
      name: "OpenClaw Suite",
      description:
        "OpenClaw Integrity Suite. Four tools: FinOps (verified cloud pricing), API-Bridge (live OpenAPI spec parsing), Guardrail (IaC security scanning), Fortress (zero-trust live state verification). One API key, tiered billing.",
      category: ["finance", "developer"],
      language: ["en"],
    },
    capabilities: [
      {
        id: "forecast_deployment_cost",
        description: "Estimate monthly cloud infrastructure cost with a line-item breakdown.",
        endpoint: "https://openclaw-finops.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          provider: "string, required -- AWS|GCP|AZURE",
          services_to_add: "array, required -- [{service_name: string, estimated_usage_hours: number}]",
        },
        returns: "result {content[] {type, text}, isError?} -- Markdown table with per-service costs and total",
      },
      {
        id: "bridge_api_spec",
        description: "Fetch an OpenAPI/Swagger spec and parse it into structured endpoint definitions. Stops AI hallucination by grounding API usage in live specifications.",
        endpoint: "https://openclaw-api-bridge.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          openapi_url: "string, required -- URL of the OpenAPI/Swagger spec (JSON or YAML)",
        },
        returns: "result {content[] {type, text}} -- Markdown table of endpoints with parameters, schemas, and operation IDs",
      },
      {
        id: "audit_infrastructure_code",
        description: "Enterprise security scanner. Audits Terraform/CloudFormation/Pulumi for vulnerabilities (public buckets, open ports, wildcard IAM) and ghost costs (idle NAT gateways, oversized instances).",
        endpoint: "https://openclaw-guardrail.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          code_content: "string, required -- infrastructure code to audit",
          provider: "string, required -- AWS|GCP|AZURE",
          format: "string, required -- HCL|YAML|JSON",
        },
        returns: "result {content[] {type, text}, isError?} -- audit report with findings and remediation",
      },
      {
        id: "verify_live_state",
        description: "Zero-trust live state verification. Fetches a URL with optional cache-busting, reports cache vs origin status, and validates DOM signatures.",
        endpoint: "https://openclaw-fortress.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          target_url: "string, required -- URL to verify",
          expected_dom_signature: "string, optional -- DOM assertion to check",
          bypass_cache: "boolean, optional, default false -- force origin hit",
        },
        returns: "result {content[] {type, text}, isError?} -- verification report with cache verdict, headers, and DOM check",
      },
    ],
    auth: {
      type: "apikey",
      header: "x-api-key",
      docs: "https://billing.openclaw.com/docs",
    },
    rate_limits: { requests_per_minute: 60, agent_tier_available: true },
    meta: { last_updated: "2026-03-28" },
  });
});

// ---------------------------------------------------------------------------
// MCP endpoint — GET handler for SSE-based clients (Smithery, etc.)
// ---------------------------------------------------------------------------
app.get("/mcp", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const apiKey = extractApiKey(c.req.raw.headers);
  const referralCode = extractReferralCode(c.req.raw.headers);
  const authResult = await authenticateAndCheckLimits(supabase, apiKey, referralCode);

  if (!authResult.ok) {
    return c.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: authResult.message },
    }, 401);
  }

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// ---------------------------------------------------------------------------
// MCP endpoint — Revenue Gate middleware → Streamable HTTP transport
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

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// ---------------------------------------------------------------------------
// Stripe webhook — shared handler from @openclaw/core
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
