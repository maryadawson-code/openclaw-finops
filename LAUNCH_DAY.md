# IntegrityPulse Integrity Suite — Launch Day Assets

---

## Show HN

**Title:** Show HN: IntegrityPulse – The first revenue-gated MCP suite for agentic infrastructure

**Comment:**

Hi HN. I built a suite of three MCP servers that prevent AI agents from making expensive mistakes with cloud infrastructure.

**The problem:** AI agents are moving from "write me code" to "deploy this for me." When they do, three things go wrong:

1. **Cost hallucinations.** Ask an LLM what an RDS instance costs and it'll say $15/month. Real price: $204.40. When agents deploy autonomously, that 13x error becomes a real invoice.

2. **API schema guessing.** Agents confidently fabricate API parameters that don't exist, leading to failed integrations and wasted debugging time.

3. **Security blindspots.** An agent will generate Terraform with `acl = "public-read"` on an S3 bucket and `cidr_blocks = ["0.0.0.0/0"]` on SSH without blinking.

**The solution:** IntegrityPulse is three MCP servers deployed as independent Cloudflare Workers, sharing one auth system:

- **FinOps** — Verified cloud pricing for AWS, GCP, and Azure. Deterministic, not generated.
- **API-Bridge** — Fetches live OpenAPI/Swagger specs and converts them into structured tool definitions. No more hallucinated endpoints.
- **Guardrail** — Scans Terraform/CloudFormation for security vulnerabilities (public buckets, open ports, unencrypted DBs) and ghost costs (idle NAT gateways at $32/mo, m5.metal at $4,608/mo for a simple API).

The architecture worth discussing: **Revenue-Gated MCP.** When a free user hits their limit, we don't return HTTP 402 — the MCP transport swallows it and the user never sees it. Instead, we return a valid tool result with `isError: true` so the upgrade CTA lands directly in the conversation. This is how you monetize tool access when your customer is an LLM, not a browser.

Stack: PNPM monorepo, Cloudflare Workers (Hono), Supabase (auth + usage), Stripe (billing), MCP SDK (Streamable HTTP). Each tool deploys independently to its own Worker.

Free tier: 25 ops/month. Pro: 500. Enterprise: 50,000 + Guardrail access.

MIT licensed, self-hostable. Feedback welcome — especially on the revenue gate pattern.

---

## X / Twitter Thread

**Tweet 1 (Hook):**
2026 is the year AI agents start spending real money.

Not token costs. Infrastructure costs.

An agent that deploys an m5.metal ($4,608/mo) when you needed a t3.micro ($7.59/mo) because it hallucinated the pricing.

We built the integrity layer to prevent this. Thread:

**Tweet 2:**
IntegrityPulse is three MCP tools, one API key:

1. FinOps — verified cloud pricing (not guessed)
2. API-Bridge — live OpenAPI specs (not hallucinated)
3. Guardrail — security scanning (not optional)

Each runs as its own Cloudflare Worker. Same auth. Tiered billing.

**Tweet 3:**
The innovation isn't the tools — it's how they monetize.

When a free user hits 25 ops, we don't return HTTP 429. Agents can't read that.

We return a tool result with `isError: true` so the upgrade CTA appears INSIDE THE CONVERSATION.

Commerce at the point of intent. We call it Revenue-Gated MCP.

**Tweet 4:**
Guardrail caught 7 issues in a 40-line Terraform file:

- 3 CRITICAL: public S3 bucket, open SSH, open RDP
- 3 HIGH: unencrypted DB, m5.metal overkill, idle NAT gateway
- 1 MEDIUM: unattached Elastic IP

All before `terraform apply`. That's the point.

**Tweet 5:**
Live now. Add to Claude Desktop or Cursor in 30 seconds:

FinOps: integritypulse.marywomack.workers.dev/mcp
API-Bridge: integritypulse-api-bridge.marywomack.workers.dev/mcp
Guardrail: integritypulse-guardrail.marywomack.workers.dev/mcp

Free tier. No credit card. MIT licensed.

GitHub: [link]

#MCP #AgenticAI #FinOps #CloudSecurity #Terraform #DevOps #AI #OpenSource #AgenticCommerce #RevenueGatedMCP

---

## LinkedIn Post

**The Integrity Layer for Agentic Infrastructure**

We're entering the era of autonomous cloud operations. AI agents are moving from writing code to deploying it — provisioning infrastructure, configuring security groups, selecting instance types.

The problem isn't capability. It's accuracy.

I asked an LLM what an RDS Postgres db.m5.large costs. It said "$15/month." The real number is $204.40. That's a 13x hallucination, and when an agent acts on it autonomously, it becomes a real line item on your AWS bill.

Today I'm launching the IntegrityPulse Integrity Suite — three MCP tools that form a verification layer between AI agents and production infrastructure:

**FinOps** stops cost hallucinations. Verified pricing for AWS, GCP, and Azure from a deterministic matrix. Not generated. Not guessed.

**API-Bridge** stops integration hallucinations. Fetches live OpenAPI specs and converts them into structured tool definitions. Your agent works with the real API, not its imagination.

**Guardrail** stops security blindspots. Scans Terraform, CloudFormation, and Pulumi for public buckets, open ports, unencrypted databases, and ghost costs (idle NAT gateways billing $32/mo with zero traffic).

Each tool is an independent Cloudflare Worker. They share one authentication system and one billing tier. The architecture is a PNPM monorepo with a shared internal SDK — the same auth, Stripe, and Supabase logic powers all three services.

What makes this different from a linting tool is the monetization model. We built what I'm calling "Revenue-Gated MCP" — when a user hits their free tier limit, the upgrade prompt appears inside the AI conversation itself, not as an HTTP error. When your customer is an LLM, you need commerce at the point of intent.

Open source. Self-hostable. Free tier available.

If you're a CTO watching AI agents make infrastructure decisions, or a CFO trying to understand why the cloud bill doubled after your team adopted Cursor — this is the control plane you're missing.

#FinOps #AgenticAI #CloudSecurity #MCP #DevOps #InfrastructureAsCode
