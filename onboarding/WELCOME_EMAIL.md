# Pro Welcome Email — Template Reference

This is the plain-text reference for the HTML email sent automatically by `src/email.ts` when a Stripe `checkout.session.completed` webhook fires.

---

## Subject Line

**Welcome to IntegrityPulse FinOps Pro — your key is inside**

---

## Email Content

### Welcome to IntegrityPulse FinOps Pro

Your cloud cost forecasts are now unlimited.

No more guessing. No more hallucinated pricing. Every time your AI agent needs to know what infrastructure costs, it gets a verified answer.

---

### Your Pro API Key

```
[USER'S API KEY — injected dynamically]
```

---

### Set Up in 30 Seconds

**Claude Desktop**

Open `~/Library/Application Support/Claude/claude_desktop_config.json` and add:

```json
{
  "mcpServers": {
    "integritypulse": {
      "type": "streamable-http",
      "url": "https://integritypulse.marywomack.workers.dev/mcp",
      "headers": { "x-api-key": "YOUR_PRO_KEY" }
    }
  }
}
```

**Cursor**

Go to **Settings > Models > MCP**, click **Add Server**, and paste:

```json
{
  "integritypulse": {
    "type": "streamable-http",
    "url": "https://integritypulse.marywomack.workers.dev/mcp",
    "headers": { "x-api-key": "YOUR_PRO_KEY" }
  }
}
```

**Claude Code (CLI)**

```bash
claude mcp add integritypulse \
  --transport http \
  https://integritypulse.marywomack.workers.dev/mcp \
  --header "x-api-key: YOUR_PRO_KEY"
```

---

### Share the Love

Your referral code: **[USER'S REFERRAL CODE]**

When someone includes your code in their `x-referral-code` header, you both get +5 free operations. Even on Pro, referrals expand your network — referred users get a better free experience and are more likely to upgrade.

---

### Trigger Conditions

- Sent automatically when `checkout.session.completed` webhook fires
- Email address pulled from `session.customer_email`
- API key and referral code pulled from the `users` table after tier upgrade
- If `RESEND_API_KEY` secret is set, sent via Resend API
- If not set, logged to console (dev mode)
