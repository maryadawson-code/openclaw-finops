# OpenClaw FinOps

**Stop your AI agents from hallucinating cloud costs. Get real pricing forecasts inside the conversation.**

[![MCP Server](https://img.shields.io/badge/MCP-Streamable%20HTTP-blue)](https://modelcontextprotocol.io)
[![Cloudflare Workers](https://img.shields.io/badge/Runtime-Cloudflare%20Workers-orange)](https://workers.cloudflare.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## What is this?

OpenClaw FinOps is a **remote MCP server** that gives AI coding agents accurate, real-time cloud deployment cost forecasts. Instead of your agent guessing that "an EC2 instance costs around $50/month," it calls a tool backed by a verified pricing matrix and returns a line-item breakdown.

**One tool. Three providers. Zero hallucinations.**

```
User: "What would it cost to run our API on AWS with an m5.large, a managed Postgres, and Redis?"

Agent (via OpenClaw FinOps):
  | Service                    | Category | Hours | Est. Cost |
  |----------------------------|----------|-------|-----------|
  | m5.large                   | Compute  | 730   | $70.08    |
  | rds.postgres.db.m5.large   | Database | 730   | $204.40   |
  | elasticache.redis.t3.micro | Cache    | 730   | $11.68    |

  Total Estimated Monthly Cost: $286.16
```

---

## Quick Start

### Claude Desktop

Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "openclaw-finops": {
      "type": "streamable-http",
      "url": "https://openclaw-finops.marywomack.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

### Cursor

Add to your `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openclaw-finops": {
      "type": "streamable-http",
      "url": "https://openclaw-finops.marywomack.workers.dev/mcp",
      "headers": {
        "x-api-key": "YOUR_API_KEY"
      }
    }
  }
}
```

### cURL

```bash
curl -X POST https://openclaw-finops.marywomack.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "x-api-key: YOUR_API_KEY" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "forecast_deployment_cost",
      "arguments": {
        "provider": "AWS",
        "services_to_add": [
          {"service_name": "m5.large", "estimated_usage_hours": 730}
        ]
      }
    }
  }'
```

---

## The Tool: `forecast_deployment_cost`

| Parameter | Type | Description |
|---|---|---|
| `provider` | `"AWS" \| "GCP" \| "AZURE"` | Cloud provider to price against |
| `services_to_add` | `Array<{ service_name, estimated_usage_hours }>` | Services to include in the forecast |

**Supported services:**

| AWS | GCP | Azure |
|-----|-----|-------|
| t3.micro, t3.medium, m5.large | e2-micro, e2-medium, n2-standard-2 | B1s, B2s, D2s_v3 |
| rds.postgres.db.t3.micro, rds.postgres.db.m5.large | cloudsql.postgres.db-custom-1-3840, cloudsql.postgres.db-custom-4-15360 | postgresql.flexible.b1ms |
| elasticache.redis.t3.micro | memorystore.redis.1gb | |
| s3.standard.1tb | | |

---

## Why It Exists: FinOps for the Agentic Era

AI agents are moving from "write me code" to "deploy this for me." When an agent provisions infrastructure, cost accuracy isn't a nice-to-have -- it's a financial control.

**The problem:** LLMs hallucinate pricing. They confidently tell you an RDS instance costs "$15/month" when the real number is $204. When agents start executing deployments autonomously, these hallucinations become real invoices.

**The solution:** OpenClaw FinOps is a **grounded pricing oracle** that agents call as a tool. The pricing matrix is maintained, versioned, and deterministic. No generation, no guessing.

### Agentic Commerce & the Revenue Gate

This server is also a reference implementation of **Revenue-Gated MCP** -- a pattern for monetizing MCP tools without breaking the agent experience.

Here's how it works:

1. Every request carries an `x-api-key` header.
2. The server checks the user's `tier` and `monthly_usage_count` in Supabase.
3. Free tier users get **25 operations/month**.
4. When the limit is hit, the server does NOT return an HTTP error. Instead, it returns a valid MCP tool result with `isError: true`:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [{
      "type": "text",
      "text": "OpenClaw FinOps Alert: Your free monthly tier (25/25 operations) has been exhausted. To generate this architectural cost forecast, please upgrade to the Pro tier here: https://billing.openclaw.com/upgrade. Once upgraded, ask me to retry."
    }],
    "isError": true
  }
}
```

**Why `isError: true` instead of HTTP 402/429?**

Because the consumer is an LLM, not a browser. An HTTP error gets swallowed by the MCP transport layer and the user never sees it. By returning a tool result with `isError: true`, the upgrade CTA lands **directly in the conversation** where the user is already engaged. The agent reads it, surfaces it, and the user can act on it immediately. This is commerce at the point of intent.

### Stripe Integration

When a user upgrades via the billing link, Stripe fires a `checkout.session.completed` webhook to `/api/webhook/stripe`. The server automatically:
- Updates their tier from `FREE` to `PRO`
- Resets their usage counter to 0
- The next agent request goes through seamlessly

---

## Architecture

```
                         +-----------------+
  Claude / Cursor        |  Cloudflare     |       +------------+
  (MCP Client)  -------->|  Worker (Hono)  |------>|  Supabase  |
                POST     |                 |       |  (users)   |
                /mcp     |  Revenue Gate   |       +------------+
                         |  MCP Server     |
                         |  Stripe Webhook |------>  Stripe API
                         +-----------------+
```

- **Runtime:** Cloudflare Workers (edge, ~0ms cold start)
- **Framework:** Hono (lightweight, Workers-native)
- **MCP SDK:** `@modelcontextprotocol/sdk` with Streamable HTTP transport
- **Auth:** API key in `x-api-key` or `Authorization: Bearer` header
- **Database:** Supabase (PostgreSQL)
- **Payments:** Stripe Checkout + Webhooks

---

## Self-Hosting

```bash
git clone https://github.com/maryadawson-code/openclaw-finops.git
cd openclaw-finops
npm install

# Configure secrets
cp .env.example .env
# Edit .env with your Supabase and Stripe credentials

# Local development
npx wrangler dev

# Deploy to Cloudflare Workers
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SERVICE_KEY
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler deploy
```

---

## License

MIT
