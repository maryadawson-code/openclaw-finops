# OpenClaw FinOps — Registry Submissions Guide

## Smithery.ai

**Status:** Ready to submit. `smithery.yaml` is in the repo root.

**Steps:**
1. Go to https://smithery.ai/submit
2. Enter the GitHub repo URL: `https://github.com/maryadawson-code/openclaw-finops`
3. Smithery will auto-detect `smithery.yaml` and pull the config
4. Verify the listing preview, then publish

**Alternative (CLI):**
```bash
npx @smithery/cli publish openclaw-finops
```

---

## Glama.ai

**Steps:**
1. Go to https://glama.ai/mcp/servers/submit
2. Paste the GitHub repo URL: `https://github.com/maryadawson-code/openclaw-finops`
3. Glama reads `mcp-server.json` from the repo root for metadata
4. Add description: "Cloud deployment cost forecasting for AI agents. Verified pricing for AWS, GCP, and Azure. Revenue-gated with a 25 op/month free tier."

---

## PulseMCP

**Steps:**
1. Go to https://pulsemcp.com/submit
2. Submit the server URL: `https://openclaw-finops.marywomack.workers.dev/mcp`
3. PulseMCP will crawl `/.well-known/mcp` to auto-populate metadata

---

## MCP.so (Community Directory)

**Steps:**
1. Go to https://mcp.so/submit
2. Fill in:
   - Name: OpenClaw FinOps
   - URL: https://openclaw-finops.marywomack.workers.dev/mcp
   - GitHub: https://github.com/maryadawson-code/openclaw-finops
   - Category: DevOps / FinOps
   - Transport: Streamable HTTP (remote)
   - Auth: API Key

---

## Anthropic Skills Repository

**Status:** Ready to submit. `skills/openclaw-finops/SKILL.md` follows the template format.

**Steps:**
1. Fork https://github.com/anthropics/skills
2. Copy the `skills/openclaw-finops/` directory from this repo into the fork's `skills/` directory
3. Open a PR with title: "Add openclaw-finops: Cloud cost forecasting via MCP"
4. PR description should highlight:
   - Revenue Gate pattern (`isError: true` paywall as a security/business best practice)
   - Prevents LLM cost hallucinations by grounding pricing in a verified matrix
   - Remote MCP server — zero local dependencies

---

## AAIF (Agentic AI Foundation)

**Context:** AAIF is a Linux Foundation directed fund co-founded by Anthropic, Block, and OpenAI.
MCP is a founding project. As AAIF matures its registry/catalog processes, OpenClaw FinOps
is positioned for inclusion as a reference implementation of revenue-gated MCP.

**Current action:** No formal submission portal exists yet. Monitor:
- https://aaif.io/ for registry announcements
- https://github.com/modelcontextprotocol/ for catalog PRs

**Preparation complete:**
- `/.well-known/ai` follows IETF draft-aiendpoint-ai-discovery-00 (AAIF-aligned)
- `/.well-known/mcp` follows SEP-1960 proposal conventions
- `/.well-known/agent.json` follows Google A2A spec
- `smithery.yaml` ready for Smithery (AAIF member: Anthropic)
- Revenue Gate pattern documented as a reusable standard in SKILL.md

---

## Microsoft 365 Copilot

**Status:** `copilot/declarativeAgent.json` and `copilot/openclaw-finops-plugin.json` ready.

**Steps:**
1. The declarative agent manifest requires wrapping the MCP endpoint behind an OpenAPI spec
   (Copilot doesn't speak MCP natively — it uses API plugin manifests)
2. Create an `openapi.yaml` describing the REST interface to `forecast_deployment_cost`
3. Package as a Teams app: `manifest.json` + `declarativeAgent.json` + plugin + OpenAPI spec
4. Submit via Microsoft Partner Center or Teams Developer Portal

**Note:** When Microsoft adds native MCP support to Copilot (tracked in schema v1.5+ with
`actions` extensibility), the `/.well-known/mcp` endpoint will handle discovery directly.

---

## GitHub Topics (already applied)

The repo has these topics for GitHub search discoverability:
`mcp-server` `mcp` `model-context-protocol` `agentic-ai` `finops`
`cloud-pricing` `cloudflare-workers` `ai-agents` `llm-tools` `devops`

---

## Submission Checklist

- [ ] Smithery.ai — submit via web or CLI
- [ ] Glama.ai — submit GitHub URL
- [ ] PulseMCP — submit server URL
- [ ] MCP.so — submit listing
- [ ] Hacker News — post from LAUNCH_POSTS.md
- [ ] X/Twitter — post thread from LAUNCH_POSTS.md
- [ ] LinkedIn — post from LAUNCH_POSTS.md
- [ ] Anthropic Skills — fork repo, copy skills/openclaw-finops/, open PR
- [ ] Microsoft Copilot — package declarativeAgent.json as Teams app (requires OpenAPI wrapper)
- [ ] AAIF — monitor for registry launch, submit when portal opens
