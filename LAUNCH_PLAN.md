# IntegrityPulse Launch Execution Plan

**Created:** 2026-03-30
**Goal:** Get IntegrityPulse in front of every vibe coder, AI agent builder, and FinOps practitioner within 7 days.

---

## The Problem We Solve (Messaging Core)

Every vibe coder hitting "deploy" with an AI agent faces four risks:

1. **Cost hallucinations** — LLMs say RDS costs $15/mo. Real price: $204.40. That's a 13x surprise on your AWS bill.
2. **API fabrication** — Agents invent API parameters that don't exist, wasting hours debugging phantom endpoints.
3. **Security blindspots** — Agents generate Terraform with public S3 buckets and open SSH without warning.
4. **Ghost costs** — Idle NAT gateways ($32/mo), oversized instances ($4,608/mo for a simple API) slip through unnoticed.

IntegrityPulse is the integrity layer that catches all four — before `terraform apply`.

---

## Phase 1: Foundation (Day 1 — TODAY)

### 1.1 Create GitHub Release v1.0.0
- Tag the current `main` as `v1.0.0`
- Write release notes highlighting all four apps: FinOps, API-Bridge, Guardrail, Fortress
- Include quick-start JSON config for Claude Desktop and Cursor
- This unlocks GitHub's release discovery, email notifications to watchers, and SEO

### 1.2 Verify GitHub Topics
Ensure these topics are set on the repo for search discoverability:
`mcp-server` `mcp` `model-context-protocol` `agentic-ai` `finops`
`cloud-pricing` `cloudflare-workers` `ai-agents` `llm-tools` `devops`
`vibe-coding` `cloud-cost` `terraform` `infrastructure-as-code`

### 1.3 Fix README Self-Hosting URL
Update `git clone https://github.com/yourusername/integritypulse.git` to use the real URL:
`git clone https://github.com/maryadawson-code/integritypulse.git`

---

## Phase 2: Registry Submissions (Day 1-2)

Submit to every MCP directory. These are the app stores for AI tools — this is where developers browse for MCP servers.

| Registry | Action | Config File Ready? |
|----------|--------|-----------|
| **Smithery.ai** | Submit at https://smithery.ai/submit or `npx @smithery/cli publish integritypulse` | Yes — `smithery.yaml` |
| **Glama.ai** | Submit at https://glama.ai/mcp/servers/submit with repo URL | Yes — `mcp-server.json` |
| **PulseMCP** | Submit server URL at https://pulsemcp.com/submit | Yes — `/.well-known/mcp` |
| **MCP.so** | Submit at https://mcp.so/submit (Category: DevOps/FinOps) | Manual entry |
| **Anthropic Skills** | Fork anthropics/skills, add `skills/integritypulse/`, open PR | Yes — `skills/` dir ready |

**Priority order:** Smithery > Glama > MCP.so > PulseMCP > Anthropic Skills

These are the highest-leverage actions. Once listed, developers searching for "cloud pricing MCP" or "FinOps AI" will find you organically.

---

## Phase 3: Community Launch (Day 2-3)

### 3.1 Hacker News — Show HN
- Post the Show HN from `LAUNCH_DAY.md`
- **Timing:** Tuesday or Wednesday, 9-10am EST (peak HN traffic)
- Be ready to respond to comments for the first 3-4 hours — HN rewards active founders
- Key talking points: Revenue-Gated MCP pattern (HN loves novel architecture), the 13x pricing hallucination stat, MIT licensed

### 3.2 X/Twitter Thread
- Post the thread from `LAUNCH_POSTS.md`
- Include the Claude Desktop config JSON as a screenshot/code block
- Tag: `#MCP` `#AgenticAI` `#FinOps` `#VibeCoding` `#BuildInPublic`
- Engage with anyone who quote-tweets or replies

### 3.3 LinkedIn Post
- Post the LinkedIn version from `LAUNCH_POSTS.md`
- Target audience: CTOs, VPs Engineering, FinOps practitioners
- Add the GitHub link in first comment (LinkedIn suppresses link posts)

---

## Phase 4: Developer Communities (Day 3-5)

### 4.1 Reddit
- **r/MCP** — "I built an MCP server that stops AI agents from hallucinating cloud costs"
- **r/devops** — Focus on the Guardrail/security angle
- **r/aws**, **r/googlecloud**, **r/azure** — Provider-specific pricing hallucination examples
- **r/LocalLLaMA** / **r/ClaudeAI** — Tool/MCP server announcement
- **r/vibecoding** — "The 4 things that go wrong when your AI agent deploys infrastructure"

### 4.2 Discord Communities
- **Anthropic/Claude Discord** — Share in the MCP/tools channel
- **Cursor Discord** — Post in community tools/extensions
- **Cloudflare Workers Discord** — Workers-on-Workers showcase
- **MCP Community Discord** — If one exists, announce there

### 4.3 Dev.to / Hashnode Blog Post
Write a technical article: **"Revenue-Gated MCP: How to Monetize AI Tool Access Without Breaking the Agent Experience"**
- Walk through the `isError: true` pattern
- Include architecture diagram
- Code examples from the actual codebase
- This becomes evergreen SEO content

---

## Phase 5: Ecosystem Partnerships (Day 5-7)

### 5.1 MCP Ecosystem Outreach
- Reach out to other MCP server builders — cross-promotion opportunities
- Comment on MCP-related GitHub discussions with relevant use cases
- Contribute to modelcontextprotocol org discussions if applicable

### 5.2 FinOps Foundation
- The FinOps Foundation (finops.org) tracks tools in the space
- Submit IntegrityPulse for their landscape/tool directory
- This legitimizes the project for enterprise buyers

### 5.3 Cloud Cost Newsletter/Podcast Circuit
- **The Duckbill Group / Last Week in AWS** — Corey Quinn covers FinOps tools
- **FinOps Pod** — Podcast covering cloud financial management
- **DevOps Weekly** / **TLDR DevOps** — Newsletter submissions

---

## Phase 6: Ongoing Growth Engine

### 6.1 Content Flywheel
- Weekly tweet showing a real pricing hallucination caught by IntegrityPulse
- Monthly blog post on the Revenue Gate pattern, new services added, etc.
- GitHub Discussions enabled for community Q&A

### 6.2 Track Metrics
Check these dashboards regularly:
- **Supabase** — New user signups, API key creations, monthly_usage_count
- **Stripe** — New customers, MRR, tier upgrades
- **Cloudflare** — Worker request volume, unique visitors
- **GitHub** — Stars, forks, clones, traffic (Settings > Insights > Traffic)

### 6.3 Referral Program
The referral system is already built (+5 ops per referral). Promote it:
- Add referral CTA to the README
- Mention it in launch posts
- Include it in the upgrade CTA message

---

## Immediate Action Items (Do Right Now)

1. **Create GitHub Release v1.0.0** (unlocks discoverability)
2. **Fix the self-hosting clone URL** in README
3. **Submit to Smithery.ai** (largest MCP registry — 5 min)
4. **Submit to Glama.ai** (second largest — 5 min)
5. **Submit to MCP.so and PulseMCP** (5 min each)
6. **Post Show HN** (next Tue/Wed morning)
7. **Post X/Twitter thread** (same day as HN)
8. **Post LinkedIn** (same day, afternoon)
9. **Check Supabase + Stripe dashboards** for any existing activity

---

## Success Metrics (30-Day Targets)

| Metric | Target |
|--------|--------|
| GitHub Stars | 100+ |
| Free Tier Signups | 200+ |
| Pro Tier Conversions | 10+ ($290/mo MRR) |
| Registry Listings Live | 4+ (Smithery, Glama, MCP.so, PulseMCP) |
| Hacker News Front Page | Top 30 |
| Weekly Active API Calls | 500+ |
