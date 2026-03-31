export const DEMO_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>IntegrityPulse Integrity Suite — See It In Action</title>
<meta property="og:title" content="IntegrityPulse: 4 tools that stop AI agents from making expensive mistakes">
<meta property="og:description" content="Watch AI agents get verified cloud pricing, real API specs, security audits, and ghost cost detection.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://integritypulse.marywomack.workers.dev/demo">
<meta name="twitter:card" content="summary_large_image">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#cdd6f4;overflow-x:hidden}
code,.mono{font-family:'SF Mono',Monaco,'Cascadia Code',monospace}

.hero{text-align:center;padding:48px 24px 0}
.hero h1{font-size:2.2rem;font-weight:800;color:#fff;margin-bottom:8px}
.hero h1 span{color:#f97316}
.hero p{color:#a0a0a0;font-size:1.05rem;max-width:560px;margin:0 auto 32px}

.scene-nav{display:flex;justify-content:center;gap:8px;margin-bottom:32px;flex-wrap:wrap;padding:0 16px}
.scene-tab{background:#1a1a2e;border:1px solid #333;color:#999;padding:8px 18px;border-radius:9999px;cursor:pointer;font-size:13px;font-weight:600;transition:all .2s}
.scene-tab:hover{border-color:#f97316;color:#f97316}
.scene-tab.active{background:#f97316;color:#000;border-color:#f97316}

.screen{width:min(900px,calc(100vw - 48px));margin:0 auto;border-radius:16px;overflow:hidden;box-shadow:0 20px 80px rgba(0,0,0,.6);position:relative}
.titlebar{background:#181825;height:36px;display:flex;align-items:center;padding:0 16px;gap:8px}
.dot{width:12px;height:12px;border-radius:50%}
.dot.r{background:#f38ba8}.dot.y{background:#f9e2af}.dot.g{background:#a6e3a1}
.titlebar-text{color:#6c7086;font-size:12px;margin-left:auto;margin-right:auto;font-family:'SF Mono',Monaco,monospace}
.chat{background:#1e1e2e;min-height:440px;padding:24px 28px;position:relative;overflow:hidden}

.msg{opacity:0;transform:translateY(10px);margin-bottom:14px}
.msg.show{opacity:1;transform:translateY(0);transition:opacity .4s ease,transform .4s ease}

.user-msg{display:flex;justify-content:flex-end}
.user-bubble{background:#45475a;color:#cdd6f4;padding:11px 16px;border-radius:16px 16px 4px 16px;max-width:480px;font-size:13.5px;line-height:1.5}

.bot-msg{display:flex;gap:10px}
.avatar{width:26px;height:26px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#000;flex-shrink:0;margin-top:2px}
.av-fin{background:linear-gradient(135deg,#f97316,#ea580c)}
.av-api{background:linear-gradient(135deg,#8b5cf6,#6d28d9)}
.av-grd{background:linear-gradient(135deg,#ef4444,#dc2626)}
.av-frt{background:linear-gradient(135deg,#06b6d4,#0891b2)}
.bot-bubble{background:#181825;border:1px solid #313244;color:#cdd6f4;padding:14px 18px;border-radius:4px 16px 16px 16px;max-width:580px;font-size:13px;line-height:1.6}

.tool-call{background:#1a1a2e;border:1px solid #f9731640;border-radius:8px;padding:8px 12px;margin:6px 0;font-size:11px;color:#f97316;font-family:'SF Mono',Monaco,monospace}
.tool-label{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#f9731660;margin-bottom:3px}
.badge{display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:9999px;margin-left:6px}
.badge-fin{background:#f9731620;color:#f97316}
.badge-api{background:#8b5cf620;color:#8b5cf6}
.badge-grd{background:#ef444420;color:#ef4444}
.badge-frt{background:#06b6d420;color:#06b6d4}

table{width:100%;border-collapse:collapse;margin:10px 0;font-size:11.5px;font-family:'SF Mono',Monaco,monospace}
th{text-align:left;padding:5px 8px;border-bottom:2px solid #f97316;color:#f97316;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
td{padding:5px 8px;border-bottom:1px solid #252535;color:#bac2de}
.cost-col{text-align:right;font-weight:600}
.total-row td{border-top:2px solid #333;font-weight:700;font-size:13px;color:#f97316;padding-top:8px}

.hl{color:#f38ba8;text-decoration:line-through;opacity:.7}
.ok{color:#a6e3a1;font-weight:700}
.warn{color:#f9e2af}
.crit{color:#f38ba8;font-weight:700}
.tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;margin-right:4px}
.tag-crit{background:#f38ba820;color:#f38ba8}
.tag-high{background:#fab38720;color:#fab387}
.tag-med{background:#f9e2af20;color:#f9e2af}

.gate{background:linear-gradient(135deg,#1a1a2e,#1e1025);border:1px solid #f9731650;border-radius:10px;padding:14px 16px;margin:8px 0}
.gate-title{color:#f97316;font-weight:700;font-size:13px;margin-bottom:6px}
.gate p{font-size:12px;color:#a0a0a0;margin-bottom:4px}
.gate a{color:#f97316;font-weight:600}

.progress{position:absolute;bottom:0;left:0;height:3px;background:#f97316;width:0%;transition:width .3s linear}

.cta-section{text-align:center;padding:40px 24px 56px}
.cta-section h2{font-size:1.5rem;color:#fff;margin-bottom:8px}
.cta-section p{color:#888;margin-bottom:24px;font-size:.95rem}
.btn{display:inline-block;background:#f97316;color:#000;font-weight:700;padding:14px 32px;border-radius:9999px;font-size:1rem;text-decoration:none;margin:6px;transition:opacity .2s}
.btn:hover{opacity:.85}
.btn-outline{background:transparent;border:2px solid #f97316;color:#f97316}
.install-box{max-width:520px;margin:24px auto 0;background:#111;border:1px solid #333;border-radius:10px;padding:16px;font-family:'SF Mono',Monaco,monospace;font-size:12px;color:#a6e3a1;text-align:left;position:relative}
.install-box .copy-btn{position:absolute;top:10px;right:10px;background:#333;border:1px solid #555;color:#ccc;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer}
.install-box .copy-btn:hover{background:#444}
footer{text-align:center;padding:0 24px 32px;color:#555;font-size:.8rem}
.context-banner{max-width:min(900px,calc(100vw - 48px));margin:0 auto 16px;background:#111;border:1px solid #252535;border-radius:12px;padding:20px 24px;opacity:0;transform:translateY(8px);transition:opacity .4s,transform .4s}
.context-banner.show{opacity:1;transform:translateY(0)}
.context-banner .ctx-problem{font-size:13px;color:#cdd6f4;margin-bottom:10px;line-height:1.5}
.context-banner .ctx-problem strong{color:#fff}
.context-banner .ctx-why{font-size:12px;color:#a0a0a0;margin-bottom:10px;line-height:1.5;padding-left:12px;border-left:3px solid #333}
.context-banner .ctx-roi{font-size:13px;color:#cdd6f4;line-height:1.5;padding:10px 14px;background:#0a1a0a;border:1px solid #1a3a1a;border-radius:8px}
</style>
</head>
<body>

<div class="hero">
  <h1>The <span>Integrity Layer</span> for AI Agents</h1>
  <p>Four tools. One API key. Watch what happens when AI agents get grounded in reality.</p>
</div>

<div class="scene-nav">
  <div class="scene-tab active" onclick="switchScene(0)">FinOps</div>
  <div class="scene-tab" onclick="switchScene(1)">API-Bridge</div>
  <div class="scene-tab" onclick="switchScene(2)">Guardrail</div>
  <div class="scene-tab" onclick="switchScene(3)">Fortress</div>
  <div class="scene-tab" onclick="switchScene(4)">Revenue Gate</div>
</div>

<div class="context-banner" id="ctxBanner">
  <div class="ctx-problem" id="ctxProblem"></div>
  <div class="ctx-why" id="ctxWhy"></div>
  <div class="ctx-roi" id="ctxRoi"></div>
</div>

<div class="screen">
  <div class="titlebar">
    <div class="dot r"></div><div class="dot y"></div><div class="dot g"></div>
    <span class="titlebar-text" id="titletext">Claude Desktop</span>
  </div>
  <div class="chat" id="chat"></div>
  <div class="progress" id="progress"></div>
</div>

<div style="display:flex;justify-content:center;gap:10px;margin:24px 0;flex-wrap:wrap">
  <a href="https://twitter.com/intent/tweet?text=AI%20agents%20hallucinate%20cloud%20costs%20by%205-15x.%20This%20open-source%20MCP%20tool%20fixes%20it.%20Free%20tier%2C%20MIT%20licensed.&url=https://integritypulse.marywomack.workers.dev/demo" target="_blank" rel="noopener" style="background:#1DA1F2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:13px">Share on X</a>
  <a href="https://www.linkedin.com/sharing/share-offsite/?url=https://integritypulse.marywomack.workers.dev/demo" target="_blank" rel="noopener" style="background:#0A66C2;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:13px">Share on LinkedIn</a>
  <a href="https://www.reddit.com/submit?url=https://integritypulse.marywomack.workers.dev/demo&title=AI%20agents%20hallucinate%20cloud%20costs%20by%205-15x.%20This%20MCP%20tool%20fixes%20it." target="_blank" rel="noopener" style="background:#FF4500;color:#fff;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:13px">Share on Reddit</a>
  <a href="https://news.ycombinator.com/submitlink?u=https://integritypulse.marywomack.workers.dev/demo&t=IntegrityPulse%3A%20MCP%20tools%20that%20stop%20AI%20agents%20from%20hallucinating%20cloud%20costs" target="_blank" rel="noopener" style="background:#f97316;color:#000;padding:10px 20px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:13px">Share on HN</a>
</div>

<div class="cta-section">
  <h2>Stop hallucinations. Start shipping.</h2>
  <p>Free tier: 25 ops/month. No credit card. Set up in 30 seconds.</p>
  <a href="https://github.com/maryadawson-code/integritypulse" class="btn">Get Free API Key</a>
  <a href="/try" class="btn btn-outline">Try It Live</a>
  <div class="install-box">
    <button class="copy-btn" onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)">Copy</button>
    <pre>{
  "mcpServers": {
    "integritypulse": {
      "type": "streamable-http",
      "url": "https://integritypulse.marywomack.workers.dev/mcp",
      "headers": { "x-api-key": "YOUR_KEY" }
    }
  }
}</pre>
  </div>

  <div style="margin-top:32px;padding:24px;background:#111;border:1px solid #333;border-radius:12px;max-width:480px;margin-left:auto;margin-right:auto">
    <h3 style="color:#fff;font-size:1rem;margin-bottom:4px">Get notified when we ship new tools</h3>
    <p style="color:#888;font-size:.85rem;margin-bottom:16px">Join engineers building with verified AI infrastructure. No spam.</p>
    <form action="https://buttondown.com/api/emails/embed-subscribe/openclaw" method="post" target="_blank" style="display:flex;gap:8px">
      <input type="email" name="email" placeholder="you@company.com" required style="flex:1;padding:10px 14px;background:#1a1a1a;border:1px solid #444;border-radius:8px;color:#fff;font-size:14px">
      <button type="submit" style="background:#f97316;color:#000;font-weight:700;padding:10px 20px;border:none;border-radius:8px;cursor:pointer;font-size:14px;white-space:nowrap">Subscribe</button>
    </form>
  </div>

  <div style="margin-top:32px;max-width:520px;margin-left:auto;margin-right:auto">
    <h3 style="color:#fff;font-size:1rem;margin-bottom:8px">Add "Powered by IntegrityPulse" to your project</h3>
    <p style="color:#888;font-size:.85rem;margin-bottom:12px">Show your team uses verified pricing. Copy this badge:</p>
    <div style="background:#111;border:1px solid #333;border-radius:8px;padding:12px;font-family:monospace;font-size:11px;color:#a6e3a1;position:relative">
      <button onclick="navigator.clipboard.writeText(this.nextElementSibling.textContent);this.textContent='Copied!';setTimeout(()=>this.textContent='Copy',1500)" style="position:absolute;top:8px;right:8px;background:#333;border:1px solid #555;color:#ccc;padding:3px 8px;border-radius:4px;font-size:10px;cursor:pointer">Copy</button>
      <code>[![IntegrityPulse FinOps](https://img.shields.io/badge/Verified%20Pricing-IntegrityPulse%20FinOps-f97316)](https://integritypulse.marywomack.workers.dev)</code>
    </div>
  </div>
</div>

<footer>
  IntegrityPulse Integrity Suite &mdash; MIT Licensed &mdash; Built by <a href="https://missionmeetstech.com" style="color:#f97316">Mission Meets Tech</a>
  <p style="margin-top:8px"><a href="https://github.com/maryadawson-code/integritypulse" style="color:#f97316">GitHub</a> &middot; <a href="https://smithery.ai/server/maryadawson-code/finops" style="color:#f97316">Smithery</a> &middot; <a href="/llms.txt" style="color:#666">llms.txt</a> &middot; <a href="/.well-known/mcp" style="color:#666">MCP Discovery</a></p>
</footer>

<script>
const SCENES = [
  // Scene 0: FinOps
  {
    title: "integritypulse",
    context: {
      problem: "LLMs are wrong about cloud pricing by 5\\u201315x. When agents deploy autonomously, hallucinated estimates become real invoices.",
      why: "One bad forecast can cost your team <strong style=\\"color:#f38ba8\\">$2,900/year</strong> in unexpected charges\\u2014per service. Multiply across 10 microservices and that\\'s a $29K budget surprise.",
      roi: "\\ud83d\\udcb0 <strong>ROI:</strong> Catches cost errors before deployment. A single corrected RDS estimate saves <strong style=\\"color:#a6e3a1\\">$2,273/year</strong> ($204 real vs $15 hallucinated, times 12 months)."
    },
    messages: [
      {type:'user', text:'What would it cost to run our API on AWS with an m5.large, managed Postgres, and Redis?'},
      {type:'bot', avatar:'fin', html:'<div class="tool-call"><div class="tool-label">Tool Call</div>forecast_deployment_cost<span class="badge badge-fin">integritypulse</span></div>'},
      {type:'bot', avatar:'fin', html:'<div style="font-size:12px;color:#a6adc8;margin-bottom:8px">An LLM would estimate: <span class="hl">~$45/month</span>. Here\\'s the verified pricing:</div><table><tr><th>Service</th><th>Category</th><th>Hours</th><th class="cost-col">Cost</th></tr><tr class="anim-row"><td>m5.large</td><td>Compute</td><td>730</td><td class="cost-col">$70.08</td></tr><tr class="anim-row"><td>rds.postgres.db.m5.large</td><td>Database</td><td>730</td><td class="cost-col">$204.40</td></tr><tr class="anim-row"><td>elasticache.redis.t3.micro</td><td>Cache</td><td>730</td><td class="cost-col">$11.68</td></tr><tr class="anim-row total-row"><td colspan="3">Total Estimated Monthly Cost</td><td class="cost-col">$286.16</td></tr></table><div style="font-size:12px;color:#f38ba8;margin-top:4px"><strong>6.4x more</strong> than the LLM hallucinated. Annualized: <strong>$2,893 over budget</strong> if you trusted the agent\\'s estimate.</div>'},
    ]
  },
  // Scene 1: API-Bridge
  {
    title: "openclaw-api-bridge",
    context: {
      problem: "AI agents confidently fabricate API endpoints, parameters, and authentication flows that don\\'t exist\\u2014leading to failed integrations and hours of debugging.",
      why: "Engineering teams report <strong style=\\"color:#f38ba8\\">2\\u20134 hours wasted per hallucinated API integration</strong>. At $150/hr loaded cost, each fabricated endpoint costs $300\\u2013$600 in developer time.",
      roi: "\\ud83d\\udcb0 <strong>ROI:</strong> Eliminates API debugging from hallucinated specs. Saves <strong style=\\"color:#a6e3a1\\">$1,200\\u2013$2,400/month</strong> for teams doing 4\\u201310 integrations monthly."
    },
    messages: [
      {type:'user', text:'Parse the Stripe API spec and show me the endpoints for creating charges.'},
      {type:'bot', avatar:'api', html:'<div class="tool-call"><div class="tool-label">Tool Call</div>bridge_api_spec<span class="badge badge-api">openclaw-api-bridge</span></div><div style="color:#6c7086;font-size:11px;margin-top:4px">Fetching live OpenAPI spec from api.stripe.com...</div>'},
      {type:'bot', avatar:'api', html:'<div style="font-size:12px;color:#a6adc8;margin-bottom:8px">Without API-Bridge, I would have <span class="hl">guessed endpoints that don\\'t exist</span>. Here\\'s the real spec:</div><table><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr><tr class="anim-row"><td style="color:#8b5cf6;font-family:monospace;font-size:11px">/v1/charges</td><td><span class="tag" style="background:#a6e3a120;color:#a6e3a1">POST</span></td><td>Create a new charge</td></tr><tr class="anim-row"><td style="color:#8b5cf6;font-family:monospace;font-size:11px">/v1/charges/{id}</td><td><span class="tag" style="background:#06b6d420;color:#06b6d4">GET</span></td><td>Retrieve a charge</td></tr><tr class="anim-row"><td style="color:#8b5cf6;font-family:monospace;font-size:11px">/v1/charges/{id}</td><td><span class="tag" style="background:#f9e2af20;color:#f9e2af">POST</span></td><td>Update a charge</td></tr><tr class="anim-row"><td style="color:#8b5cf6;font-family:monospace;font-size:11px">/v1/charges/{id}/capture</td><td><span class="tag" style="background:#a6e3a120;color:#a6e3a1">POST</span></td><td>Capture a charge</td></tr></table><div style="font-size:12px;color:#a6adc8;margin-top:6px">4 real endpoints with full parameter schemas. That\\'s <strong style="color:#a6e3a1">2\\u20134 hours of debugging saved</strong> per integration.</div>'},
    ]
  },
  // Scene 2: Guardrail
  {
    title: "openclaw-guardrail",
    context: {
      problem: "AI agents generate infrastructure code with public S3 buckets, open SSH ports, and unencrypted databases\\u2014without warning. One <code>terraform apply</code> and you\\'re breached.",
      why: "The average cost of a cloud data breach is <strong style=\\"color:#f38ba8\\">$4.45 million</strong> (IBM 2024). Public S3 buckets alone caused 12 major breaches last year. AI-generated IaC makes this worse\\u2014agents don\\'t think about security by default.",
      roi: "\\ud83d\\udcb0 <strong>ROI:</strong> Pre-deploy scanning is <strong style=\\"color:#a6e3a1\\">1,000x cheaper</strong> than incident response. Catching one public bucket saves regulatory fines, customer trust, and months of remediation."
    },
    messages: [
      {type:'user', text:'Audit this Terraform before I deploy:\\nresource \\"aws_s3_bucket\\" \\"data\\" {\\n  acl = \\"public-read\\"\\n}\\nresource \\"aws_security_group\\" \\"ssh\\" {\\n  ingress { from_port=22; to_port=22; cidr_blocks=[\\"0.0.0.0/0\\"] }\\n}'},
      {type:'bot', avatar:'grd', html:'<div class="tool-call"><div class="tool-label">Tool Call</div>audit_infrastructure_code<span class="badge badge-grd">openclaw-guardrail</span></div>'},
      {type:'bot', avatar:'grd', html:'<div style="font-size:13px;font-weight:700;color:#f38ba8;margin-bottom:10px">\\u26a0\\ufe0f 5 findings \\u2014 DEPLOYMENT BLOCKED</div><table><tr><th>Severity</th><th>Resource</th><th>Issue</th></tr><tr class="anim-row"><td><span class="tag tag-crit">CRITICAL</span></td><td style="font-family:monospace;font-size:11px">aws_s3_bucket.data</td><td>Public read ACL \\u2014 all objects exposed to internet</td></tr><tr class="anim-row"><td><span class="tag tag-crit">CRITICAL</span></td><td style="font-family:monospace;font-size:11px">aws_security_group.ssh</td><td>SSH open to 0.0.0.0/0 \\u2014 brute force target</td></tr><tr class="anim-row"><td><span class="tag tag-high">HIGH</span></td><td style="font-family:monospace;font-size:11px">aws_s3_bucket.data</td><td>No encryption \\u2014 fails SOC 2 / HIPAA compliance</td></tr><tr class="anim-row"><td><span class="tag tag-high">HIGH</span></td><td style="font-family:monospace;font-size:11px">aws_s3_bucket.data</td><td>No versioning \\u2014 no recovery from accidental deletion</td></tr><tr class="anim-row"><td><span class="tag tag-med">MEDIUM</span></td><td style="font-family:monospace;font-size:11px">aws_s3_bucket.data</td><td>No access logging \\u2014 invisible to audit trail</td></tr></table><div style="font-size:12px;color:#f38ba8;margin-top:6px"><strong>Without Guardrail:</strong> Agent runs <code>terraform apply</code>, your customer data is public, SSH is open to the world, and your next security audit fails. <strong>With Guardrail:</strong> caught in 200ms, before anything touches production.</div>'},
    ]
  },
  // Scene 3: Fortress
  {
    title: "openclaw-fortress",
    context: {
      problem: "Ghost costs\\u2014idle resources quietly billing you\\u2014are the #1 source of cloud waste. Gartner estimates <strong style=\\"color:#f38ba8\\">30% of cloud spend is wasted</strong> on resources nobody uses.",
      why: "An oversized instance or forgotten NAT gateway costs nothing to provision but thousands per month to ignore. Teams don\\'t notice because the resource \\"works\\"\\u2014it\\'s just 600x more expensive than it needs to be.",
      roi: "\\ud83d\\udcb0 <strong>ROI:</strong> Detecting one oversized m5.metal (\\u2192 t3.micro) saves <strong style=\\"color:#a6e3a1\\">$55,200/year</strong>. The idle NAT gateway adds another $389/year. Fortress pays for itself in the first scan."
    },
    messages: [
      {type:'user', text:'Verify my production endpoint is live and check for ghost costs in our AWS account.'},
      {type:'bot', avatar:'frt', html:'<div class="tool-call"><div class="tool-label">Tool Call</div>verify_live_state<span class="badge badge-frt">openclaw-fortress</span></div><div style="color:#6c7086;font-size:11px;margin-top:4px">Running zero-trust verification against production...</div>'},
      {type:'bot', avatar:'frt', html:'<div style="font-size:12px;color:#a6adc8;margin-bottom:10px">Live state verification complete:</div><table><tr><th>Check</th><th>Status</th><th>Annual Impact</th></tr><tr class="anim-row"><td>API endpoint health</td><td><span class="ok">\\u2705 200 OK</span></td><td>\\u2014</td></tr><tr class="anim-row"><td>NAT Gateway (us-east-1)</td><td><span class="crit">\\u26a0\\ufe0f Idle \\u2014 zero traffic</span></td><td class="cost-col" style="color:#f38ba8">$389/yr wasted</td></tr><tr class="anim-row"><td>Instance sizing</td><td><span class="warn">\\u26a0\\ufe0f m5.metal for a simple API</span></td><td class="cost-col" style="color:#f38ba8">$55,200/yr (vs $91/yr for t3.micro)</td></tr><tr class="anim-row"><td>Elastic IP (unattached)</td><td><span class="warn">\\u26a0\\ufe0f Idle \\u2014 not bound to instance</span></td><td class="cost-col" style="color:#fab387">$44/yr wasted</td></tr></table><div style="font-size:12px;color:#06b6d4;margin-top:8px"><strong>$55,633/year</strong> in ghost costs. Rightsizing the m5.metal alone puts <strong style="color:#a6e3a1">$55,109 back in your budget</strong>. This single scan pays for 9 years of Enterprise tier.</div>'},
    ]
  },
  // Scene 4: Revenue Gate
  {
    title: "Revenue-Gated MCP",
    context: {
      problem: "MCP servers need to monetize, but AI agents consume tools via protocol\\u2014not browsers. Standard HTTP paywalls (402/429) get swallowed by the transport layer and the user never sees them.",
      why: "If your MCP server returns HTTP 402, the agent\\'s client silently fails. The user has no idea why the tool stopped working. <strong style=\\"color:#f38ba8\\">You lose the conversion because the CTA never reaches the human.</strong>",
      roi: "\\ud83d\\udcb0 <strong>ROI:</strong> Revenue Gate delivers upgrade prompts inside the conversation, at the exact moment of intent. <strong style=\\"color:#a6e3a1\\">Conversion happens where attention lives</strong>\\u2014not on a billing page the user has to find."
    },
    messages: [
      {type:'user', text:'What would it cost to run a t3.medium on AWS for a month?'},
      {type:'bot', avatar:'fin', html:'<div class="tool-call"><div class="tool-label">Tool Call</div>forecast_deployment_cost<span class="badge badge-fin">integritypulse</span></div>'},
      {type:'bot', avatar:'fin', html:'<div class="gate"><div class="gate-title">\\ud83d\\udd12 Free Tier Limit Reached</div><p>You\\'ve used 25/25 free operations this month.</p><p style="margin-top:8px;color:#cdd6f4">Upgrade to <strong style="color:#f97316">Pro ($29/mo)</strong> for 500 ops/month \\u2014 that\\'s <strong>$0.058 per forecast</strong>:</p><p style="margin-top:4px"><a href="#">\\u2192 Upgrade now</a></p></div><div style="font-size:11px;color:#6c7086;margin-top:8px;font-style:italic">This message was delivered inside the conversation via MCP\\'s isError:true flag \\u2014 not as an HTTP error that gets swallowed by the transport layer.</div>'},
      {type:'bot', avatar:'fin', html:'<div style="font-size:12px;color:#a6adc8">This is <strong style="color:#f97316">Revenue-Gated MCP</strong> \\u2014 the monetization pattern for AI tool access. The upgrade prompt reaches the human through the agent\\'s conversation, exactly where intent lives.</div><div style="font-size:12px;color:#6c7086;margin-top:10px">\\u274c HTTP 402/429 \\u2192 agent swallows it, user never sees it, conversion lost<br>\\u2705 MCP isError:true \\u2192 agent surfaces it in chat, user acts immediately</div><div style="font-size:12px;margin-top:10px;color:#a6adc8">If you\\'re building MCP servers and need to monetize, this pattern is <a href="https://github.com/maryadawson-code/integritypulse" style="color:#f97316">open source and documented</a> for you to use.</div>'},
    ]
  },
];

let currentScene = 0;
let animating = false;

function switchScene(idx) {
  if (animating) return;
  currentScene = idx;
  document.querySelectorAll('.scene-tab').forEach((t,i) => t.classList.toggle('active', i===idx));
  playScene(idx);
}

async function playScene(idx) {
  animating = true;
  const scene = SCENES[idx];
  const chat = document.getElementById('chat');
  const progress = document.getElementById('progress');
  const banner = document.getElementById('ctxBanner');
  document.getElementById('titletext').textContent = scene.title;
  chat.innerHTML = '';
  progress.style.width = '0%';

  // Show context banner
  banner.classList.remove('show');
  await sleep(100);
  document.getElementById('ctxProblem').innerHTML = '<strong>The problem:</strong> ' + scene.context.problem;
  document.getElementById('ctxWhy').innerHTML = scene.context.why;
  document.getElementById('ctxRoi').innerHTML = scene.context.roi;
  banner.classList.add('show');

  const totalSteps = scene.messages.length;
  for (let i = 0; i < scene.messages.length; i++) {
    const m = scene.messages[i];
    const div = document.createElement('div');
    div.className = 'msg';

    if (m.type === 'user') {
      div.innerHTML = '<div class="user-msg"><div class="user-bubble">' + m.text.replace(/\\\\n/g,'<br>') + '</div></div>';
    } else {
      const avClass = {fin:'av-fin',api:'av-api',grd:'av-grd',frt:'av-frt'}[m.avatar] || 'av-fin';
      const letter = {fin:'F',api:'A',grd:'G',frt:'F'}[m.avatar] || 'O';
      div.innerHTML = '<div class="bot-msg"><div class="avatar ' + avClass + '">' + letter + '</div><div class="bot-bubble">' + m.html + '</div></div>';
    }

    chat.appendChild(div);
    await sleep(i === 0 ? 600 : 1200);
    div.classList.add('show');

    // Animate table rows
    const rows = div.querySelectorAll('.anim-row');
    for (const row of rows) {
      row.style.opacity = '0';
    }
    if (rows.length) {
      await sleep(300);
      for (const row of rows) {
        await sleep(280);
        row.style.transition = 'opacity .35s ease';
        row.style.opacity = '1';
      }
    }

    progress.style.width = ((i + 1) / totalSteps * 100) + '%';
  }
  animating = false;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.addEventListener('load', () => setTimeout(() => playScene(0), 400));
</script>
</body>
</html>`;
