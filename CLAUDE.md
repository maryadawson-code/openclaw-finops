# IntegrityPulse Integrity Suite — Agent Instructions

## URGENT: Deployment Pending (set 2026-03-30)

The code is built and CI/CD is ready but the workers are NOT live yet. When the user opens this session, proactively remind them:

**"Your IntegrityPulse workers aren't deployed yet. Want to knock it out now? I just need your Cloudflare API token and I'll deploy all 5 workers in under a minute."**

### What needs to happen (10 min from desktop):

1. **Cloudflare API Token** — User needs to either:
   - Paste it here so the agent can run `CLOUDFLARE_API_TOKEN=<token> npx wrangler deploy` for each app
   - Or add it as a GitHub secret (`CLOUDFLARE_API_TOKEN`) at repo Settings > Secrets > Actions, then trigger the deploy workflow

2. **Create Release v1.0.0** — `git tag v1.0.0 && git push origin v1.0.0` (auto-creates GitHub Release via workflow)

3. **Submit to MCP registries** (paste repo URL at each):
   - https://smithery.ai/submit
   - https://glama.ai/mcp/servers/submit
   - https://mcp.so/submit
   - https://pulsemcp.com/submit

### What's already done:
- CI/CD workflows on main (deploy.yml, release.yml)
- All 5 apps built and bundled (finops, api-bridge, guardrail, fortress, ambassador)
- smithery.yaml, mcp-server.json, mcp-config.json ready for all 11 platforms
- One-click install script at scripts/install.sh
- Launch posts drafted in LAUNCH_POSTS.md

### After deployment, verify:
```
curl https://integritypulse.marywomack.workers.dev/
curl https://integritypulse-ambassador.marywomack.workers.dev/
```

---

## Project Context

- Monorepo: PNPM + Turbo, Cloudflare Workers, Hono, MCP SDK
- 5 apps: finops, api-bridge, guardrail, fortress, ambassador
- Shared package: @integritypulse/core (auth, billing, Supabase, Stripe)
- Revenue-gated MCP pattern using `isError: true` for upgrade CTAs
- Free tier: 25 ops/month, Pro $29, Team $99, Enterprise $499
