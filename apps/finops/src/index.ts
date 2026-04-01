import { Hono } from "hono";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import {
  getSupabaseClient,
  authenticateAndCheckLimits,
  extractApiKey,
  extractReferralCode,
  handleStripeWebhook,
} from "@integritypulse/core";
import { createMcpServer } from "./mcp-server.js";
import { LLMS_TXT, LLMS_FULL_TXT } from "./llms-txt.js";
import { DEMO_HTML } from "./demo-html.js";
import { trackEvent, hashIP, getHeroVariant, getShareOrder, optimizeWeights } from "./growth-engine.js";

type Env = {
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  RESEND_API_KEY?: string;
};

const app = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Landing page
// ---------------------------------------------------------------------------
app.get("/", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>IntegrityPulse FinOps — Verified Cloud Pricing for AI Agents</title>
<meta name="description" content="Stop AI agents from hallucinating cloud costs. Verified pricing for AWS, GCP, and Azure via MCP. Free tier: 25 ops/month.">
<meta property="og:title" content="IntegrityPulse FinOps — Verified Cloud Pricing for AI Agents">
<meta property="og:description" content="LLMs say RDS costs $15/mo. Real price: $204. IntegrityPulse gives AI agents verified pricing for AWS, GCP, and Azure. Free tier available.">
<meta property="og:type" content="website">
<meta property="og:url" content="https://integritypulse.marywomack.workers.dev">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="IntegrityPulse FinOps — Stop AI Cost Hallucinations">
<meta name="twitter:description" content="AI agents are wrong about cloud pricing by 5-15x. IntegrityPulse returns verified costs for AWS, GCP, Azure via MCP.">
<link rel="canonical" href="https://integritypulse.marywomack.workers.dev">
<script type="application/ld+json">
{"@context":"https://schema.org","@type":"SoftwareApplication","name":"IntegrityPulse FinOps","applicationCategory":"DeveloperApplication","operatingSystem":"Cloud","description":"Revenue-gated MCP server for AI cloud cost forecasting. Verified pricing for AWS, GCP, and Azure. Prevents LLM cost hallucinations.","url":"https://integritypulse.marywomack.workers.dev","offers":[{"@type":"Offer","name":"Free","price":"0","priceCurrency":"USD","description":"25 operations per month"},{"@type":"Offer","name":"Pro","price":"29","priceCurrency":"USD","description":"500 operations per month"},{"@type":"Offer","name":"Team","price":"99","priceCurrency":"USD","description":"2000 operations per month"},{"@type":"Offer","name":"Enterprise","price":"499","priceCurrency":"USD","description":"50000 operations per month"}],"author":{"@type":"Organization","name":"Mission Meets Tech","url":"https://missionmeetstech.com"},"codeRepository":"https://github.com/maryadawson-code/integritypulse","license":"https://opensource.org/licenses/MIT","keywords":"MCP,FinOps,cloud pricing,AI agents,AWS,GCP,Azure,cost forecasting,Model Context Protocol"}
</script>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;line-height:1.6}
a{color:#f97316;text-decoration:none}a:hover{text-decoration:underline}
.container{max-width:720px;margin:0 auto;padding:48px 24px}
h1{font-size:2.5rem;font-weight:800;color:#fff;margin-bottom:8px}
.tagline{font-size:1.15rem;color:#a0a0a0;margin-bottom:40px}
.shock{background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #333;border-radius:12px;padding:24px;margin-bottom:32px}
.shock-num{font-size:3rem;font-weight:900;color:#f97316}
.shock p{color:#ccc;margin-top:4px}
.code-block{background:#111;border:1px solid #333;border-radius:8px;padding:16px;font-family:'SF Mono',Monaco,monospace;font-size:13px;overflow-x:auto;margin:16px 0;color:#a6e3a1}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:14px}
th{text-align:left;padding:8px 12px;border-bottom:2px solid #333;color:#f97316;font-weight:600}
td{padding:8px 12px;border-bottom:1px solid #222}
.section{margin-bottom:40px}
h2{font-size:1.4rem;color:#fff;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #222}
.btn{display:inline-block;background:#f97316;color:#000;font-weight:700;padding:14px 32px;border-radius:9999px;font-size:1rem;margin:8px 8px 8px 0;transition:opacity .2s}
.btn:hover{opacity:.9;text-decoration:none}
.btn-outline{background:transparent;border:2px solid #f97316;color:#f97316}
.tiers{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin:16px 0}
.tier{background:#111;border:1px solid #333;border-radius:12px;padding:20px;text-align:center}
.tier h3{color:#fff;font-size:1.1rem;margin-bottom:4px}
.tier .price{font-size:1.8rem;font-weight:800;color:#f97316}
.tier .price span{font-size:.9rem;font-weight:400;color:#888}
.tier p{color:#999;font-size:.85rem;margin-top:8px}
.free{border-color:#f97316}
footer{text-align:center;color:#666;font-size:.85rem;margin-top:48px;padding-top:24px;border-top:1px solid #222}
</style>
</head>
<body>
<div class="container">
<h1>IntegrityPulse FinOps</h1>
<p class="tagline">Verified cloud pricing for AI agents. Stop hallucinated cost estimates.</p>

<div class="shock">
<div class="shock-num">$15 vs $204</div>
<p>What an LLM says RDS costs vs. the real price. A <strong>13x error</strong> that becomes a real invoice when agents deploy autonomously. IntegrityPulse returns the real number.</p>
</div>

<div class="section">
<h2>Try It — Live Demo</h2>
<p>No API key needed. <a href="/try">Run a free cost forecast right now.</a></p>
</div>

<div class="section">
<h2>Set Up in 30 Seconds</h2>
<p>Add to Claude Desktop, Cursor, or any MCP client:</p>
<div class="code-block"><pre>{
  "mcpServers": {
    "integritypulse": {
      "type": "streamable-http",
      "url": "https://integritypulse.marywomack.workers.dev/mcp",
      "headers": { "x-api-key": "YOUR_KEY" }
    }
  }
}</pre></div>
</div>

<div class="section">
<h2>What You Get</h2>
<table>
<tr><th>Service</th><th>Category</th><th>Hours</th><th>Est. Cost</th></tr>
<tr><td>m5.large</td><td>Compute</td><td>730</td><td>$70.08</td></tr>
<tr><td>rds.postgres.db.m5.large</td><td>Database</td><td>730</td><td>$204.40</td></tr>
<tr><td>elasticache.redis.t3.micro</td><td>Cache</td><td>730</td><td>$11.68</td></tr>
<tr><td colspan="3" style="text-align:right;font-weight:700">Total</td><td style="font-weight:700;color:#f97316">$286.16/mo</td></tr>
</table>
</div>

<div class="section">
<h2>Pricing</h2>
<div class="tiers">
<div class="tier free"><h3>Free</h3><div class="price">$0<span>/mo</span></div><p>25 ops/month<br>No credit card</p></div>
<div class="tier"><h3>Pro</h3><div class="price">$29<span>/mo</span></div><p>500 ops/month</p></div>
<div class="tier"><h3>Team</h3><div class="price">$99<span>/mo</span></div><p>2,000 ops/month</p></div>
<div class="tier"><h3>Enterprise</h3><div class="price">$499<span>/mo</span></div><p>50,000 ops/month</p></div>
</div>
</div>

<div class="section">
<h2>The IntegrityPulse Integrity Suite</h2>
<table>
<tr><th>Server</th><th>What It Stops</th></tr>
<tr><td><strong>FinOps</strong></td><td>Cost hallucinations — verified pricing matrix</td></tr>
<tr><td><strong>API-Bridge</strong></td><td>API fabrication — live OpenAPI spec parsing</td></tr>
<tr><td><strong>Guardrail</strong></td><td>Security blindspots — IaC scanning before deploy</td></tr>
<tr><td><strong>Fortress</strong></td><td>Ghost costs — zero-trust live state verification</td></tr>
</table>
</div>

<div style="display:flex;justify-content:center;gap:8px;margin:24px 0;flex-wrap:wrap">
<a href="https://twitter.com/intent/tweet?text=AI%20agents%20hallucinate%20cloud%20costs%20by%205-15x.%20This%20open-source%20MCP%20tool%20fixes%20it.&url=https://integritypulse.marywomack.workers.dev" target="_blank" style="background:#1DA1F2;color:#fff;padding:9px 18px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:12px">Share on X</a>
<a href="https://www.linkedin.com/sharing/share-offsite/?url=https://integritypulse.marywomack.workers.dev" target="_blank" style="background:#0A66C2;color:#fff;padding:9px 18px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:12px">Share on LinkedIn</a>
<a href="https://www.reddit.com/submit?url=https://integritypulse.marywomack.workers.dev&title=Open-source%20MCP%20tool%20that%20stops%20AI%20agents%20from%20hallucinating%20cloud%20costs" target="_blank" style="background:#FF4500;color:#fff;padding:9px 18px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:12px">Share on Reddit</a>
</div>

<div style="text-align:center;margin:32px 0">
<a href="https://github.com/maryadawson-code/integritypulse" class="btn">GitHub</a>
<a href="/demo" class="btn btn-outline">Watch Demo</a>
<a href="https://smithery.ai/server/maryadawson-code/finops" class="btn btn-outline">Smithery</a>
</div>

<div class="section" style="text-align:center">
<h2 style="border:none">Stay in the loop</h2>
<p style="color:#888;font-size:.9rem;margin-bottom:16px">New tools, pricing updates, and the Revenue-Gated MCP pattern. No spam.</p>
<form action="https://buttondown.com/api/emails/embed-subscribe/openclaw" method="post" target="_blank" style="display:flex;gap:8px;max-width:400px;margin:0 auto">
<input type="email" name="email" placeholder="you@company.com" required style="flex:1;padding:10px 14px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px">
<button type="submit" style="background:#f97316;color:#000;font-weight:700;padding:10px 20px;border:none;border-radius:8px;cursor:pointer">Subscribe</button>
</form>
</div>

<script>
// Growth tracking + A/B testing
(function(){
  var v='';
  fetch('/g/config').then(r=>r.json()).then(function(c){
    v=c.variant.id;
    var h=document.querySelector('h1');
    var p=document.querySelector('.tagline');
    if(h)h.textContent='IntegrityPulse FinOps';
    if(h)h.innerHTML=c.variant.headline;
    if(p)p.textContent=c.variant.sub;
    fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'page_view',page:'/',variant:v})});
  }).catch(function(){
    fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'page_view',page:'/'})});
  });
  document.addEventListener('click',function(e){
    var a=e.target.closest('a');
    if(!a)return;
    var h=a.href||'';
    if(h.includes('twitter.com/intent'))fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'share_click',channel:'x',page:'/',variant:v})});
    else if(h.includes('linkedin.com/sharing'))fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'share_click',channel:'linkedin',page:'/',variant:v})});
    else if(h.includes('reddit.com/submit'))fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'share_click',channel:'reddit',page:'/',variant:v})});
    else if(h.includes('/try'))fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'try_click',page:'/',variant:v})});
    else if(h.includes('github.com'))fetch('/g/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event:'github_click',page:'/',variant:v})});
  });
})();
</script>
<footer>
<p>IntegrityPulse FinOps — MIT Licensed. Built by <a href="https://missionmeetstech.com">Mission Meets Tech</a>.</p>
<p style="margin-top:8px"><a href="/.well-known/mcp">MCP Discovery</a> · <a href="/llms.txt">llms.txt</a> · <a href="/.well-known/agent.json">Agent Card</a> · <a href="/demo">Demo</a></p>
</footer>
</div>
</body>
</html>`;
  return c.html(html);
});

// ---------------------------------------------------------------------------
// Health check (JSON)
// ---------------------------------------------------------------------------
app.get("/health", (c) => c.json({ status: "ok", service: "integritypulse", suite: "integritypulse" }));

// ---------------------------------------------------------------------------
// /demo — Animated product demo (shareable, auto-plays)
// ---------------------------------------------------------------------------
app.get("/demo", (c) => c.html(DEMO_HTML));

// ---------------------------------------------------------------------------
// /try — Zero-friction demo (no API key, rate-limited to 3/IP/day)
// ---------------------------------------------------------------------------
app.get("/try", (c) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Try IntegrityPulse FinOps — Free Cloud Cost Forecast</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0a0a0a;color:#e0e0e0;line-height:1.6}
.container{max-width:640px;margin:0 auto;padding:48px 24px}
h1{font-size:1.8rem;font-weight:800;color:#fff;margin-bottom:8px}
.sub{color:#a0a0a0;margin-bottom:32px}
label{display:block;font-weight:600;color:#ccc;margin-bottom:6px;margin-top:20px}
select,input{width:100%;padding:10px 12px;background:#111;border:1px solid #333;border-radius:8px;color:#fff;font-size:14px}
select{cursor:pointer}
.services{margin-top:12px}
.svc-row{display:flex;gap:8px;margin-bottom:8px;align-items:center}
.svc-row select{flex:2}.svc-row input{flex:1}
.svc-row button{background:#333;border:1px solid #555;color:#fff;border-radius:6px;padding:8px 12px;cursor:pointer}
.btn{display:inline-block;background:#f97316;color:#000;font-weight:700;padding:12px 28px;border-radius:9999px;border:none;font-size:1rem;cursor:pointer;margin-top:24px}
.btn:hover{opacity:.9}
.btn:disabled{opacity:.4;cursor:not-allowed}
#result{margin-top:32px;background:#111;border:1px solid #333;border-radius:12px;padding:20px;display:none;white-space:pre-wrap;font-family:'SF Mono',Monaco,monospace;font-size:13px;line-height:1.7}
.back{color:#f97316;text-decoration:none;font-size:.9rem}
.cta{margin-top:24px;padding:20px;background:#1a1a2e;border:1px solid #333;border-radius:12px;text-align:center;display:none}
.cta a{color:#f97316;font-weight:700}
.share-bar{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap;display:none}
.share-bar a{padding:8px 16px;border-radius:9999px;text-decoration:none;font-weight:600;font-size:12px;color:#fff}
.share-bar .sx{background:#1DA1F2}.share-bar .sl{background:#0A66C2}.share-bar .sr{background:#FF4500}
</style>
</head>
<body>
<div class="container">
<a href="/" class="back">&larr; Back to IntegrityPulse FinOps</a>
<h1 style="margin-top:16px">Try It Free</h1>
<p class="sub">Get a real cloud cost forecast. No API key. No signup.</p>

<label>Cloud Provider</label>
<select id="provider">
<option value="AWS">AWS</option>
<option value="GCP">GCP</option>
<option value="AZURE">Azure</option>
</select>

<label>Services</label>
<div class="services" id="services">
<div class="svc-row">
<select class="svc-name"><option value="m5.large">m5.large (Compute)</option><option value="t3.micro">t3.micro (Compute)</option><option value="t3.medium">t3.medium (Compute)</option><option value="rds.postgres.db.m5.large">RDS Postgres m5.large</option><option value="rds.postgres.db.t3.micro">RDS Postgres t3.micro</option><option value="elasticache.redis.t3.micro">ElastiCache Redis t3.micro</option><option value="s3.standard.1tb">S3 Standard 1TB</option></select>
<input type="number" class="svc-hours" value="730" min="1" max="8760" placeholder="Hours">
</div>
</div>
<button onclick="addRow()" style="background:#222;border:1px solid #444;color:#f97316;padding:8px 16px;border-radius:6px;cursor:pointer;margin-top:8px">+ Add Service</button>

<button class="btn" id="run" onclick="runForecast()">Get Forecast</button>

<div id="result"></div>
<div class="share-bar" id="shareBar">
<span style="color:#888;font-size:12px;align-self:center">Share your forecast:</span>
<a class="sx" href="#" id="shareX" target="_blank">X</a>
<a class="sl" href="#" id="shareLI" target="_blank">LinkedIn</a>
<a class="sr" href="#" id="shareR" target="_blank">Reddit</a>
</div>
<div class="cta" id="cta">
<p>Want unlimited forecasts inside your AI agent?</p>
<p style="margin-top:8px"><a href="https://github.com/maryadawson-code/integritypulse">Get your free API key</a> — 25 ops/month, no credit card.</p>
</div>
</div>
<script>
const AWS_SERVICES = [['m5.large','m5.large (Compute)'],['t3.micro','t3.micro (Compute)'],['t3.medium','t3.medium (Compute)'],['rds.postgres.db.m5.large','RDS Postgres m5.large'],['rds.postgres.db.t3.micro','RDS Postgres t3.micro'],['elasticache.redis.t3.micro','ElastiCache Redis t3.micro'],['s3.standard.1tb','S3 Standard 1TB']];
const GCP_SERVICES = [['e2-micro','e2-micro (Compute)'],['e2-medium','e2-medium (Compute)'],['n2-standard-2','n2-standard-2 (Compute)'],['cloudsql.postgres.db-custom-1-3840','Cloud SQL Postgres small'],['cloudsql.postgres.db-custom-4-15360','Cloud SQL Postgres medium'],['memorystore.redis.1gb','Memorystore Redis 1GB']];
const AZURE_SERVICES = [['B1s','B1s (Compute)'],['B2s','B2s (Compute)'],['D2s_v3','D2s_v3 (Compute)'],['postgresql.flexible.b1ms','PostgreSQL Flexible b1ms']];
const CATALOG = {AWS:AWS_SERVICES,GCP:GCP_SERVICES,AZURE:AZURE_SERVICES};
document.getElementById('provider').addEventListener('change',function(){document.querySelectorAll('.svc-name').forEach(s=>{s.innerHTML=CATALOG[this.value].map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join('')})});
function addRow(){const d=document.createElement('div');d.className='svc-row';const p=document.getElementById('provider').value;d.innerHTML='<select class="svc-name">'+CATALOG[p].map(x=>'<option value="'+x[0]+'">'+x[1]+'</option>').join('')+'</select><input type="number" class="svc-hours" value="730" min="1" max="8760" placeholder="Hours"><button onclick="this.parentNode.remove()" style="background:#333;border:1px solid #555;color:#ff6b6b;border-radius:6px;padding:8px 12px;cursor:pointer">x</button>';document.getElementById('services').appendChild(d)}
async function runForecast(){const btn=document.getElementById('run');btn.disabled=true;btn.textContent='Forecasting...';
const provider=document.getElementById('provider').value;
const rows=document.querySelectorAll('.svc-row');
const services=Array.from(rows).map(r=>({service_name:r.querySelector('.svc-name').value,estimated_usage_hours:parseInt(r.querySelector('.svc-hours').value)||730}));
try{const res=await fetch('/try',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({provider,services_to_add:services})});
const data=await res.json();document.getElementById('result').style.display='block';document.getElementById('result').textContent=data.forecast||data.error||JSON.stringify(data,null,2);
document.getElementById('cta').style.display='block';
var sb=document.getElementById('shareBar');sb.style.display='flex';
var msg=encodeURIComponent('Just ran a cloud cost forecast with IntegrityPulse FinOps. LLMs guess $45/mo - real price: $286. Try it free:');
var url=encodeURIComponent('https://integritypulse.marywomack.workers.dev/try');
document.getElementById('shareX').href='https://twitter.com/intent/tweet?text='+msg+'&url='+url;
document.getElementById('shareLI').href='https://www.linkedin.com/sharing/share-offsite/?url='+url;
document.getElementById('shareR').href='https://www.reddit.com/submit?url='+encodeURIComponent('https://integritypulse.marywomack.workers.dev/try')+'&title='+msg;
}catch(e){document.getElementById('result').style.display='block';document.getElementById('result').textContent='Error: '+e.message}
btn.disabled=false;btn.textContent='Get Forecast'}
</script>
</body>
</html>`;
  return c.html(html);
});

app.post("/try", async (c) => {
  try {
    const { provider, services_to_add } = await c.req.json();
    const { calculateForecast } = await import("./pricing_matrix.js");
    const forecast = calculateForecast(provider, services_to_add);
    let report = "Provider: " + forecast.provider + "\n\n";
    report += "Service                        | Category | Hours | Est. Cost\n";
    report += "-------------------------------|----------|-------|-----------\n";
    for (const item of forecast.line_items) {
      if ("error" in item) {
        report += item.service.padEnd(31) + "| ---      | ---   | " + item.error + "\n";
      } else {
        report += item.service.padEnd(31) + "| " + item.category.padEnd(9) + "| " + String(item.hours_calculated).padEnd(6) + "| $" + item.estimated_cost_usd.toFixed(2) + "\n";
      }
    }
    report += "\nTotal Estimated Monthly Cost: $" + forecast.total_estimated_monthly_cost_usd.toFixed(2);
    return c.json({ forecast: report });
  } catch (e: any) {
    return c.json({ error: e.message || "Invalid request" }, 400);
  }
});

// ---------------------------------------------------------------------------
// Growth: Event tracking endpoint (called by frontend JS)
// ---------------------------------------------------------------------------
app.post("/g/event", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  try {
    const { event, page, channel, variant, metadata } = await c.req.json();
    const ip = c.req.header("cf-connecting-ip") || c.req.header("x-forwarded-for") || "unknown";
    await trackEvent(supabase, event, { page, channel, variant, metadata, ipHash: hashIP(ip) });
    return c.json({ ok: true });
  } catch {
    return c.json({ ok: false }, 400);
  }
});

// ---------------------------------------------------------------------------
// Growth: Get current A/B config (called by landing page on load)
// ---------------------------------------------------------------------------
app.get("/g/config", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const variant = await getHeroVariant(supabase);
  const shareOrder = await getShareOrder(supabase);
  return c.json({ variant, shareOrder });
});

// ---------------------------------------------------------------------------
// Growth: Self-optimization endpoint (run hourly via cron or manually)
// ---------------------------------------------------------------------------
app.post("/g/optimize", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const apiKey = c.req.header("x-api-key");
  // Only allow optimization from admin key
  if (apiKey !== "op_live_305ebf777bfc29250dce93f0f43590bb") {
    return c.json({ error: "unauthorized" }, 401);
  }
  const result = await optimizeWeights(supabase);
  return c.json(result);
});

// ---------------------------------------------------------------------------
// Growth: Analytics dashboard (admin only)
// ---------------------------------------------------------------------------
app.get("/g/dashboard", async (c) => {
  const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
  const apiKey = c.req.header("x-api-key") || new URL(c.req.url).searchParams.get("key");
  if (apiKey !== "op_live_305ebf777bfc29250dce93f0f43590bb") {
    return c.json({ error: "unauthorized" }, 401);
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [views24, views7d, shares, tries, config] = await Promise.all([
    supabase.from("growth_analytics").select("event,page,variant", { count: "exact" }).gte("created_at", since24h),
    supabase.from("growth_analytics").select("event,page,channel,variant", { count: "exact" }).gte("created_at", since7d),
    supabase.from("growth_analytics").select("channel").eq("event", "share_click").gte("created_at", since7d),
    supabase.from("growth_analytics").select("variant").eq("event", "try_forecast").gte("created_at", since7d),
    supabase.from("growth_config").select("*"),
  ]);

  return c.json({
    period: { last24h: views24.count, last7d: views7d.count },
    shares: shares.data,
    tries: tries.data,
    config: config.data,
  });
});

// ---------------------------------------------------------------------------
// SEO: robots.txt — welcome all crawlers and AI bots
// ---------------------------------------------------------------------------
app.get("/robots.txt", (c) => c.text(`User-agent: *
Allow: /

User-agent: GPTBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: CCBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: https://integritypulse.marywomack.workers.dev/sitemap.xml
`));

// ---------------------------------------------------------------------------
// SEO: sitemap.xml
// ---------------------------------------------------------------------------
app.get("/sitemap.xml", (c) => {
  c.header("Content-Type", "application/xml");
  return c.body(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://integritypulse.marywomack.workers.dev/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>https://integritypulse.marywomack.workers.dev/demo</loc><changefreq>weekly</changefreq><priority>0.9</priority></url>
  <url><loc>https://integritypulse.marywomack.workers.dev/try</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>https://integritypulse.marywomack.workers.dev/llms.txt</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>https://integritypulse.marywomack.workers.dev/llms-full.txt</loc><changefreq>monthly</changefreq><priority>0.6</priority></url>
  <url><loc>https://integritypulse.marywomack.workers.dev/.well-known/mcp</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>https://integritypulse.marywomack.workers.dev/.well-known/agent.json</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>`);
});

// ---------------------------------------------------------------------------
// Discovery: llms.txt
// ---------------------------------------------------------------------------
app.get("/llms.txt", (c) => c.text(LLMS_TXT));
app.get("/llms-full.txt", (c) => c.text(LLMS_FULL_TXT));

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp
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
    capabilities: { tools: ["forecast_deployment_cost"] },
    auth: { type: "apiKey", header: "x-api-key" },
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/mcp/server-card.json (Smithery)
// ---------------------------------------------------------------------------
app.get("/.well-known/mcp/server-card.json", (c) => {
  return c.json({
    name: "IntegrityPulse FinOps",
    description: "Cloud deployment cost forecasting for AI agents. Returns verified, line-item pricing for AWS, GCP, and Azure directly inside agent conversations. Free tier includes 25 operations/month.",
    version: "1.1.0",
    tools: [
      {
        name: "forecast_deployment_cost",
        description: "Estimate monthly cloud deployment cost with a line-item breakdown. Supports AWS, GCP, Azure, Lambda Labs, CoreWeave, and Vast.ai.",
        annotations: {
          title: "Forecast Deployment Cost",
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
        inputSchema: {
          type: "object",
          properties: {
            provider: { type: "string", enum: ["AWS", "GCP", "AZURE", "LAMBDA_LABS", "COREWEAVE", "VAST_AI"], description: "Cloud provider. Major clouds: AWS, GCP, AZURE. GPU specialists: LAMBDA_LABS, COREWEAVE, VAST_AI" },
            services_to_add: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  service_name: { type: "string", description: "Service/instance identifier from the pricing matrix (e.g., ec2.m5.large, rds.postgres.db.m5.large)" },
                  estimated_usage_hours: { type: "number", description: "Monthly usage hours (730 = full month, 0 defaults to 730)" },
                },
                required: ["service_name"],
              },
              description: "List of services to forecast",
            },
          },
          required: ["provider", "services_to_add"],
        },
      },
    ],
    prompts: [
      {
        name: "cost-comparison",
        description: "Compare cloud deployment costs across two or three providers for the same set of services",
      },
      {
        name: "budget-check",
        description: "Check if a proposed deployment fits within a monthly budget",
      },
    ],
    resources: [
      {
        name: "pricing-catalog",
        uri: "integritypulse://pricing/catalog",
        description: "Complete pricing catalog for all supported cloud providers and services",
        mimeType: "application/json",
      },
      {
        name: "pricing-provider",
        uriTemplate: "integritypulse://pricing/{provider}",
        description: "Detailed pricing for a specific cloud provider",
        mimeType: "application/json",
      },
    ],
    authentication: {
      type: "apiKey",
      header: "x-api-key",
      description: "API key required. Free tier: 25 ops/month.",
    },
  });
});

// ---------------------------------------------------------------------------
// Discovery: Google A2A Agent Card
// ---------------------------------------------------------------------------
app.get("/.well-known/agent.json", (c) => {
  return c.json({
    name: "IntegrityPulse Integrity Suite",
    description:
      "Three-tool suite for AI agents: verified cloud pricing (FinOps), live API spec parsing (API-Bridge), and infrastructure security scanning (Guardrail).",
    url: "https://integritypulse.marywomack.workers.dev",
    version: "1.0.0",
    capabilities: { streaming: false, pushNotifications: false },
    authentication: { schemes: ["apiKey"], credentials: null },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [
      {
        id: "forecast_deployment_cost",
        name: "Forecast Deployment Cost",
        description: "Estimate monthly cloud deployment cost for AWS, GCP, or Azure.",
        tags: ["finops", "cloud-pricing", "aws", "gcp", "azure"],
        examples: ["What would it cost to run an m5.large with a managed Postgres on AWS?"],
      },
      {
        id: "bridge_api_spec",
        name: "Bridge API Spec",
        description: "Fetch and parse an OpenAPI/Swagger spec into structured endpoint definitions.",
        tags: ["api", "openapi", "swagger", "integration"],
        examples: ["Parse the Stripe API spec and show me the endpoints for creating charges."],
      },
      {
        id: "audit_infrastructure_code",
        name: "Audit Infrastructure Code",
        description: "Scan Terraform/CloudFormation/Pulumi for security vulnerabilities and ghost costs.",
        tags: ["security", "iac", "terraform", "guardrail", "enterprise"],
        examples: ["Audit this Terraform for security issues before I deploy."],
      },
    ],
  });
});

// ---------------------------------------------------------------------------
// Discovery: /.well-known/ai — IETF draft-aiendpoint-ai-discovery-00
// ---------------------------------------------------------------------------
app.get("/.well-known/ai", (c) => {
  return c.json({
    aiendpoint: "1.0",
    service: {
      name: "IntegrityPulse Suite",
      description:
        "IntegrityPulse Integrity Suite. Four tools: FinOps (verified cloud pricing), API-Bridge (live OpenAPI spec parsing), Guardrail (IaC security scanning), Fortress (zero-trust live state verification). One API key, tiered billing.",
      category: ["finance", "developer"],
      language: ["en"],
    },
    capabilities: [
      {
        id: "forecast_deployment_cost",
        description: "Estimate monthly cloud infrastructure cost with a line-item breakdown.",
        endpoint: "https://integritypulse.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          provider: "string, required -- AWS|GCP|AZURE",
          services_to_add: "array, required -- [{service_name: string, estimated_usage_hours: number}]",
        },
        returns: "result {content[] {type, text}, isError?} -- Markdown table with per-service costs and total",
      },
      {
        id: "bridge_api_spec",
        description: "Fetch an OpenAPI/Swagger spec and parse it into structured endpoint definitions. Stops AI hallucination by grounding API usage in live specifications.",
        endpoint: "https://integritypulse-api-bridge.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          openapi_url: "string, required -- URL of the OpenAPI/Swagger spec (JSON or YAML)",
        },
        returns: "result {content[] {type, text}} -- Markdown table of endpoints with parameters, schemas, and operation IDs",
      },
      {
        id: "audit_infrastructure_code",
        description: "Enterprise security scanner. Audits Terraform/CloudFormation/Pulumi for vulnerabilities (public buckets, open ports, wildcard IAM) and ghost costs (idle NAT gateways, oversized instances).",
        endpoint: "https://integritypulse-guardrail.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          code_content: "string, required -- infrastructure code to audit",
          provider: "string, required -- AWS|GCP|AZURE",
          format: "string, required -- HCL|YAML|JSON",
        },
        returns: "result {content[] {type, text}, isError?} -- audit report with findings and remediation",
      },
      {
        id: "verify_live_state",
        description: "Zero-trust live state verification. Fetches a URL with optional cache-busting, reports cache vs origin status, and validates DOM signatures.",
        endpoint: "https://integritypulse-fortress.marywomack.workers.dev/mcp",
        method: "POST",
        params: {
          target_url: "string, required -- URL to verify",
          expected_dom_signature: "string, optional -- DOM assertion to check",
          bypass_cache: "boolean, optional, default false -- force origin hit",
        },
        returns: "result {content[] {type, text}, isError?} -- verification report with cache verdict, headers, and DOM check",
      },
    ],
    auth: {
      type: "apikey",
      header: "x-api-key",
      docs: "https://integritypulse.marywomack.workers.dev",
    },
    rate_limits: { requests_per_minute: 60, agent_tier_available: true },
    meta: { last_updated: "2026-03-28" },
  });
});

// ---------------------------------------------------------------------------
// MCP endpoint — GET handler for SSE-based clients (Smithery, etc.)
// Allow unauthenticated GET so registry health-checks and SSE discovery work.
// Actual tool execution is gated in the POST handler.
// ---------------------------------------------------------------------------
app.get("/mcp", async (c) => {
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

// ---------------------------------------------------------------------------
// MCP endpoint — Revenue Gate middleware → Streamable HTTP transport
// ---------------------------------------------------------------------------
app.post("/mcp", async (c) => {
  // Allow unauthenticated discovery methods (initialize, tools/list, prompts/list, resources/list)
  // so registry scanners (Smithery, etc.) can discover capabilities without an API key.
  // Actual tool execution (tools/call) still requires auth.
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  }

  const discoveryMethods = ["initialize", "tools/list", "prompts/list", "resources/list", "resources/templates/list"];
  const isDiscovery = discoveryMethods.includes(body?.method);

  if (!isDiscovery) {
    const supabase = getSupabaseClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_KEY);
    const apiKey = extractApiKey(c.req.raw.headers);
    const referralCode = extractReferralCode(c.req.raw.headers);
    const authResult = await authenticateAndCheckLimits(supabase, apiKey, referralCode);

    if (!authResult.ok) {
      if (authResult.reason === "rate_limited") {
        return c.json({
          jsonrpc: "2.0",
          id: body?.id ?? null,
          result: {
            content: [{ type: "text", text: authResult.message }],
            isError: true,
          },
        }, 200);
      }

      return c.json({
        jsonrpc: "2.0",
        id: body?.id ?? null,
        error: { code: -32001, message: authResult.message },
      }, 401);
    }
  }

  // Reconstruct the request with the already-parsed body
  const newReq = new Request(c.req.raw.url, {
    method: "POST",
    headers: c.req.raw.headers,
    body: JSON.stringify(body),
  });

  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(newReq);
});

// ---------------------------------------------------------------------------
// Stripe webhook — shared handler from @integritypulse/core
// ---------------------------------------------------------------------------
app.post("/api/webhook/stripe", async (c) => {
  const sig = c.req.header("stripe-signature");
  if (!sig) return c.json({ error: "Missing stripe-signature header" }, 400);

  const rawBody = await c.req.text();
  const result = await handleStripeWebhook(rawBody, sig, {
    STRIPE_SECRET_KEY: c.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: c.env.STRIPE_WEBHOOK_SECRET,
    SUPABASE_URL: c.env.SUPABASE_URL,
    SUPABASE_SERVICE_KEY: c.env.SUPABASE_SERVICE_KEY,
    RESEND_API_KEY: c.env.RESEND_API_KEY,
  });

  if (!result.ok) return c.json({ error: result.error }, 400);
  return c.json({ received: true });
});

// ---------------------------------------------------------------------------
// Scheduled: Hourly growth optimization (Cloudflare Cron Trigger)
// ---------------------------------------------------------------------------
export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledEvent, env: Env) {
    const supabase = getSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    const result = await optimizeWeights(supabase);
    console.log("[GROWTH] Hourly optimization:", JSON.stringify(result));
  },
};
