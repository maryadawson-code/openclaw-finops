/**
 * Lightweight email sender.
 *
 * In production, set the RESEND_API_KEY secret and emails go through Resend.
 * Without the key, emails are logged to the console (dev/test mode).
 */

export interface WelcomeEmailData {
  to: string;
  userName: string;
  apiKey: string;
  referralCode: string;
}

function buildProWelcomeHtml(data: WelcomeEmailData): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1a1a1a;">

<h1 style="font-size: 24px; margin-bottom: 4px;">Welcome to IntegrityPulse FinOps Pro</h1>
<p style="color: #666; margin-top: 0;">Your cloud cost forecasts are now unlimited.</p>

<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">

<h2 style="font-size: 18px;">Your Pro API Key</h2>
<div style="background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; font-family: 'SF Mono', Monaco, monospace; font-size: 14px; word-break: break-all;">
${data.apiKey}
</div>

<h2 style="font-size: 18px; margin-top: 32px;">Set Up in 30 Seconds</h2>

<h3 style="font-size: 15px; color: #333;">Claude Desktop</h3>
<p>Open <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> and add:</p>
<pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">{
  "mcpServers": {
    "integritypulse": {
      "type": "streamable-http",
      "url": "https://integritypulse.marywomack.workers.dev/mcp",
      "headers": { "x-api-key": "${data.apiKey}" }
    }
  }
}</pre>

<h3 style="font-size: 15px; color: #333;">Cursor</h3>
<p>Go to <strong>Settings → Models → MCP</strong>, click <strong>Add Server</strong>, then paste:</p>
<pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px; overflow-x: auto;">{
  "integritypulse": {
    "type": "streamable-http",
    "url": "https://integritypulse.marywomack.workers.dev/mcp",
    "headers": { "x-api-key": "${data.apiKey}" }
  }
}</pre>

<h3 style="font-size: 15px; color: #333;">Claude Code (CLI)</h3>
<pre style="background: #f5f5f5; padding: 12px; border-radius: 6px; font-size: 13px;">claude mcp add integritypulse \\
  --transport http \\
  https://integritypulse.marywomack.workers.dev/mcp \\
  --header "x-api-key: ${data.apiKey}"</pre>

<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">

<h2 style="font-size: 18px;">Share the love</h2>
<p>Your referral code: <strong>${data.referralCode}</strong></p>
<p>When someone includes your code in their <code>x-referral-code</code> header, you both get +5 free operations. Even on Pro, referrals expand your network — referred users get a better free experience and are more likely to upgrade.</p>

<hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;">
<p style="color: #999; font-size: 13px;">IntegrityPulse FinOps — Verified cloud pricing for AI agents.<br>
Questions? Reply to this email.</p>

</body>
</html>`;
}

export async function sendProWelcomeEmail(
  data: WelcomeEmailData,
  resendApiKey?: string
): Promise<{ sent: boolean; method: string }> {
  const html = buildProWelcomeHtml(data);
  const subject = "Welcome to IntegrityPulse FinOps Pro — your key is inside";

  // Production: send via Resend
  if (resendApiKey) {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "IntegrityPulse FinOps <noreply@openclaw.com>",
        to: [data.to],
        subject,
        html,
      }),
    });

    if (!res.ok) {
      console.error("Resend error:", await res.text());
      return { sent: false, method: "resend" };
    }
    return { sent: true, method: "resend" };
  }

  // Dev/test: log to console
  console.log(`[EMAIL] Would send to: ${data.to}`);
  console.log(`[EMAIL] Subject: ${subject}`);
  console.log(`[EMAIL] API Key: ${data.apiKey}`);
  return { sent: true, method: "console" };
}
