# Changelog

All notable changes to the OpenClaw Integrity Suite are documented here.

**Update model:** OpenClaw runs as remote MCP servers on Cloudflare Workers. Updates deploy automatically — no client-side action needed. Use the Ambassador's `check_for_updates` tool or visit `/.well-known/mcp` on any endpoint to verify you're on the latest version.

---

## [1.1.0] — 2026-03-30

### Added
- **Ambassador Bot** — New MCP server that contextually surfaces OpenClaw tools when developers discuss cloud costs, Terraform, APIs, or vibe coding deployments. Six tools: `check_cloud_cost_risk`, `recommend_openclaw_tool`, `get_install_config`, `check_terraform_risks`, `check_for_updates`, `get_platform_install`. Free, no API key required.
- **One-click installer** (`scripts/install.sh`) — Auto-detects Claude Desktop and Cursor, adds MCP config automatically.
- **Auto-update version check** — Ambassador `check_for_updates` tool reports current versions across all services and notifies of new features.
- **11 platform configs** — `mcp-config.json` covers Claude Desktop, Cursor, Windsurf, VS Code Copilot, JetBrains, Claude Code, Zed, Continue.dev, Cline, Aider, OpenAI Agents SDK.
- **Platform-specific installer** — Ambassador `get_platform_install` gives exact step-by-step instructions for each platform.
- **Launch execution plan** (`LAUNCH_PLAN.md`) — 7-day phased rollout.
- **16+ registry submission configs** — Smithery, Glama, PulseMCP, MCP.so, mcp.run, mcpservers.org, Anthropic Skills, VS Code Marketplace, JetBrains Marketplace, FinOps Foundation, CNCF Landscape, Product Hunt, awesome-mcp lists.

### Fixed
- README self-hosting clone URL corrected.

---

## [1.0.0] — 2026-03-28

### Initial Release
- **FinOps** — Verified cloud pricing oracle for AWS, GCP, and Azure.
- **API-Bridge** — Live OpenAPI/Swagger spec parser.
- **Guardrail** — IaC security scanner for Terraform, CloudFormation, Pulumi.
- **Fortress** — Zero-trust live state verification engine (12 tools).
- **Core** — Shared auth, billing (Stripe 3-tier), usage tracking, referral system.
- **Revenue Gate Pattern** — Upgrade CTA inside AI conversations via MCP `isError: true`.
- **Discovery endpoints** — `/.well-known/mcp`, `/.well-known/ai`, `/.well-known/agent.json`, `/llms.txt`.
- **3-tier billing** — Free (25 ops), Pro $29/mo (500 ops), Team $99/mo (2,000 ops), Enterprise $499/mo (50,000 ops).
