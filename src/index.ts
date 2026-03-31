import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import Stripe from "stripe";
import { getSupabaseClient, upgradeUser } from "./supabase.js";
import { sendProWelcomeEmail } from "./email.js";
import { authenticateAndCheckLimits, extractApiKey, extractReferralCode } from "./auth.js";
import { createMcpServer } from "./mcp-server.js";

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
app.get("/", (c) => c.json({ status: "ok", service: "integritypulse" }));

// ---------------------------------------------------------------------------
// Discovery: llms.txt (the robots.txt for AI crawlers)
// ---------------------------------------------------------------------------
import { LLMS_TXT, LLMS_FULL_TXT } from "./llms-txt.js";

app.get("/llms.txt", (c) => {
  return c.text(LLMS_TXT);
});

app.get("/llms-full.txt", (c) => {
  return c.text(LLMS_FULL_TXT);
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp — MCP server manifest for client auto-detection
// ---------------------------------------------------------------------------
app.get("/.well-known/mcp", (c) => {
  return c.json({
    "mcp-version": "1.0.0",
    name: "IntegrityPulse-FinOps",
    version: "1.0.0",
    description:
      "Real-time cloud cost forecasting with a built-in Revenue Gate for agentic workflows.",
    transport: {
      type: "https",
      url: "https://integritypulse.marywomack.workers.dev/mcp",
    },
    capabilities: {
      tools: ["forecast_deployment_cost"],
    },
    auth: {
      type: "apiKey",
      header: "x-api-key",
    },
  });
});

// ---------------------------------------------------------------------------
// Discovery: Google A2A Agent Card
// https://google.github.io/A2A/#/documentation?id=agent-card
// ---------------------------------------------------------------------------
app.get("/.well-known/agent.json", (c) => {
  return c.json({
    name: "IntegrityPulse FinOps",
    description:
      "Cloud deployment cost forecasting agent. Returns verified, line-item pricing for AWS, GCP, and Azure. Prevents cost hallucinations in agentic infrastructure workflows.",
    url: "https://integritypulse.marywomack.workers.dev",
    version: "1.0.0",
    capabilities: {
      streaming: false,
      pushNotifications: false,
    },
    authentication: {
      schemes: ["apiKey"],
      credentials: null,
    },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "forecast_deployment_cost",
        name: "Forecast Deployment Cost",
        description:
          "Estimate the monthly cloud deployment cost for a set of services on AWS, GCP, or Azure. Returns a line-item Markdown table with per-service costs and a total.",
        tags: ["finops", "cloud-pricing", "aws", "gcp", "azure", "cost-estimation"],
        examples: [
          "What would it cost to run an m5.large with a managed Postgres on AWS?",
          "Compare the cost of e2-medium on GCP vs B2s on Azure for 730 hours.",
        ],
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/ai — IETF draft-aiendpoint-ai-discovery-00
// https://datatracker.ietf.org/doc/draft-aiendpoint-ai-discovery/
// ---------------------------------------------------------------------------
app.get("/.well-known/ai", (c) => {
  return c.json({
    aiendpoint: "1.0",
    service: {
      name: "IntegrityPulse FinOps",
      description:
        "Cloud deployment cost forecasting for AI agents. Returns verified pricing for AWS, GCP, and Azure from a deterministic matrix.",
      category: ["finance", "developer"],
      language: ["en"],
    },
    capabilities: [
      {
        id: "forecast_deployment_cost",
        description:
          "Estimate monthly cloud infrastructure cost with a line-item breakdown.",
        endpoint: "/mcp",
        method: "POST",
        params: {
          provider: "string, required -- AWS|GCP|AZURE",
          services_to_add:
            "array, required -- [{service_name: string, estimated_usage_hours: number}]",
        },
        returns:
          "result {content[] {type, text}, isError?} -- Markdown table with per-service costs and total",
      },
    ],
    auth: {
      type: "apikey",
      header: "x-api-key",
      docs: "https://billing.openclaw.com/docs",
    },
    token_hints: {
      compact_mode: false,
      field_filtering: false,
      delta_support: false,
    },
    rate_limits: {
      requests_per_minute: 60,
      agent_tier_available: true,
    },
    meta: {
      last_updated: "2026-03-28",
      status: "https://integritypulse.marywomack.workers.dev/",
    },
  });
});

// ---------------------------------------------------------------------------
// MCP endpoint — Revenue Gate middleware → Streamable HTTP transport
// ---------------------------------------------------------------------------
app.post("/mcp", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

  // --- Revenue Gate: authenticate & enforce usage limits ----
  const apiKey = extractApiKey(c.req.raw.headers);
  const referralCode = extractReferralCode(c.req.raw.headers);
  const authResult = await authenticateAndCheckLimits(supabase, apiKey, referralCode);

  if (!authResult.ok) {
    // Parse the inbound JSON-RPC body to echo back the correct `id`.
    let requestId: string | number | null = null;
    try {
      const body = await c.req.json();
      requestId = body?.id ?? null;
    } catch {
      // body unreadable — leave id null
    }

    // Rate-limited users get a proper MCP tool-result with isError: true
    // so the LLM client sees the upgrade CTA inside the conversation.
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

    // Auth failures (missing / invalid key) → standard JSON-RPC error
    return c.json({
      jsonrpc: "2.0",
      id: requestId,
      error: {
        code: -32001,
        message: authResult.message,
      },
    }, 401);
  }

  // --- MCP passthrough: stateless server + transport per request ---
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode
    enableJsonResponse: true,
  });

  await server.connect(transport);

  return transport.handleRequest(c.req.raw);
});

// ---------------------------------------------------------------------------
// Stripe webhook — /api/webhook/stripe
// ---------------------------------------------------------------------------
app.post("/api/webhook/stripe", async (c) => {
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  const sig = c.req.header("stripe-signature");

  if (!sig) {
    return c.json({ error: "Missing stripe-signature header" }, 400);
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return c.json({ error: "Webhook signature verification failed" }, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const userId = session.metadata?.user_id;

    if (userId) {
      const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);

      // Determine tier from the price ID in session metadata or line items
      const priceId = session.metadata?.price_id;
      const tier = priceId === "price_1TG19DJ8qAPoi4y2q08hGQzo" ? "ENTERPRISE" as const : "PRO" as const;

      const upgradedUser = await upgradeUser(supabase, userId, tier);

      // Send welcome email with setup instructions
      if (upgradedUser && session.customer_email) {
        await sendProWelcomeEmail(
          {
            to: session.customer_email,
            userName: session.customer_email.split("@")[0],
            apiKey: upgradedUser.api_key,
            referralCode: upgradedUser.referral_code,
          },
          c.env.RESEND_API_KEY
        );
      }
    }
  }

  return c.json({ received: true });
});

export default app;
