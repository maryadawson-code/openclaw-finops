/**
 * Integration test: calls the /mcp endpoint repeatedly to exercise
 * the Revenue Gate and the forecast_deployment_cost tool.
 *
 * Run with: npx tsx scripts/test-mcp.ts
 * Requires the server running on localhost:8787.
 */
const BASE = "http://localhost:8787";
const API_KEY = "test_key_123";

interface McpToolCall {
  jsonrpc: "2.0";
  id: number;
  method: "tools/call";
  params: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

function buildRequest(id: number): McpToolCall {
  return {
    jsonrpc: "2.0",
    id,
    method: "tools/call",
    params: {
      name: "forecast_deployment_cost",
      arguments: {
        provider: "AWS",
        services_to_add: [
          { service_name: "m5.large", estimated_usage_hours: 730 },
          { service_name: "rds.postgres.db.m5.large", estimated_usage_hours: 730 },
          { service_name: "elasticache.redis.t3.micro", estimated_usage_hours: 730 },
        ],
      },
    },
  };
}

async function callMcp(id: number): Promise<any> {
  const res = await fetch(`${BASE}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": API_KEY,
    },
    body: JSON.stringify(buildRequest(id)),
  });

  const body = await res.json();
  return { status: res.status, body };
}

async function main() {
  console.log("=== IntegrityPulse FinOps — MCP Integration Test ===\n");

  // Call 1 — should succeed
  console.log("📡 Call 1: forecast_deployment_cost (AWS stack)");
  const r1 = await callMcp(1);
  console.log(`   Status: ${r1.status}`);
  if (r1.body?.result?.isError) {
    console.log("   🚫 RATE LIMITED:");
    console.log(`   ${r1.body.result.content[0].text}\n`);
  } else if (r1.body?.result?.content) {
    console.log("   ✅ Forecast received:");
    console.log(`   ${r1.body.result.content[0].text.substring(0, 200)}...\n`);
  } else {
    console.log("   Response:", JSON.stringify(r1.body, null, 2), "\n");
  }

  // Call 2 — should succeed or hit limit depending on current count
  console.log("📡 Call 2: forecast_deployment_cost (AWS stack)");
  const r2 = await callMcp(2);
  console.log(`   Status: ${r2.status}`);
  if (r2.body?.result?.isError) {
    console.log("   🚫 RATE LIMITED:");
    console.log(`   ${r2.body.result.content[0].text}\n`);
  } else if (r2.body?.result?.content) {
    console.log("   ✅ Forecast received:");
    console.log(`   ${r2.body.result.content[0].text.substring(0, 200)}...\n`);
  } else {
    console.log("   Response:", JSON.stringify(r2.body, null, 2), "\n");
  }

  console.log("=== Test complete ===");
}

main().catch(console.error);
