import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { parse as parseYaml } from "yaml";
import type { UserRecord } from "@integritypulse/core";

// --- Tier limits for number of APIs that can be bridged per session ---
const API_LIMITS: Record<string, number> = {
  FREE: 1,
  PRO: 5,
  ENTERPRISE: 999, // effectively unlimited
};

// --- Types for parsed OpenAPI spec ---
interface ParsedEndpoint {
  method: string;
  path: string;
  operationId: string;
  summary: string;
  parameters: Array<{
    name: string;
    in: string;
    required: boolean;
    type: string;
    description: string;
  }>;
  requestBody: string | null;
  responses: string[];
}

interface BridgeResult {
  spec_title: string;
  spec_version: string;
  base_url: string;
  endpoints_found: number;
  endpoints: ParsedEndpoint[];
}

/**
 * Fetch and parse an OpenAPI spec from a URL.
 * Supports both JSON and YAML formats.
 */
async function fetchAndParseSpec(url: string): Promise<BridgeResult> {
  const res = await fetch(url, {
    headers: { Accept: "application/json, application/yaml, text/yaml, */*" },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
  }

  const raw = await res.text();

  // Parse as JSON first, fall back to YAML
  let spec: any;
  try {
    spec = JSON.parse(raw);
  } catch {
    spec = parseYaml(raw);
  }

  if (!spec) throw new Error("Could not parse the spec as JSON or YAML.");

  // Determine OpenAPI version
  const isOpenApi3 = spec.openapi?.startsWith("3");
  const isSwagger2 = spec.swagger?.startsWith("2");
  if (!isOpenApi3 && !isSwagger2) {
    throw new Error(
      `Unsupported spec format. Expected OpenAPI 3.x or Swagger 2.x, got: ${spec.openapi || spec.swagger || "unknown"}`
    );
  }

  // Extract base URL
  let baseUrl = "";
  if (isOpenApi3 && spec.servers?.length) {
    baseUrl = spec.servers[0].url;
  } else if (isSwagger2) {
    const scheme = spec.schemes?.[0] || "https";
    baseUrl = `${scheme}://${spec.host || "unknown"}${spec.basePath || ""}`;
  }

  // Parse paths
  const endpoints: ParsedEndpoint[] = [];
  const paths = spec.paths || {};

  for (const [path, methods] of Object.entries(paths)) {
    if (!methods || typeof methods !== "object") continue;

    for (const [method, operation] of Object.entries(methods as Record<string, any>)) {
      if (["get", "post", "put", "patch", "delete"].indexOf(method) === -1) continue;

      const params = (operation.parameters || []).map((p: any) => ({
        name: p.name || "unknown",
        in: p.in || "query",
        required: p.required || false,
        type: p.schema?.type || p.type || "string",
        description: p.description || "",
      }));

      let requestBody: string | null = null;
      if (operation.requestBody) {
        const content = operation.requestBody.content;
        const mediaType = content?.["application/json"] || Object.values(content || {})[0];
        if (mediaType?.schema) {
          requestBody = JSON.stringify(mediaType.schema, null, 2).substring(0, 500);
        }
      }

      const responseCodes = Object.keys(operation.responses || {});

      endpoints.push({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId || `${method}_${path.replace(/[^a-zA-Z0-9]/g, "_")}`,
        summary: operation.summary || operation.description || "No description",
        parameters: params,
        requestBody,
        responses: responseCodes,
      });
    }
  }

  return {
    spec_title: spec.info?.title || "Untitled API",
    spec_version: spec.info?.version || "unknown",
    base_url: baseUrl,
    endpoints_found: endpoints.length,
    endpoints,
  };
}

/**
 * Format the parsed spec as a readable Markdown report.
 */
function formatBridgeReport(result: BridgeResult): string {
  let report = `## IntegrityPulse API-Bridge — Spec Analysis\n\n`;
  report += `**API:** ${result.spec_title} v${result.spec_version}\n`;
  report += `**Base URL:** \`${result.base_url}\`\n`;
  report += `**Endpoints discovered:** ${result.endpoints_found}\n\n`;
  report += `| Method | Path | Operation | Summary |\n`;
  report += `|--------|------|-----------|----------|\n`;

  for (const ep of result.endpoints) {
    const summary = ep.summary.length > 60 ? ep.summary.substring(0, 57) + "..." : ep.summary;
    report += `| ${ep.method} | \`${ep.path}\` | ${ep.operationId} | ${summary} |\n`;
  }

  // Show parameter details for up to 10 endpoints
  const detailed = result.endpoints.slice(0, 10);
  if (detailed.length > 0) {
    report += `\n### Endpoint Details (first ${detailed.length})\n\n`;

    for (const ep of detailed) {
      report += `#### \`${ep.method} ${ep.path}\`\n`;
      report += `${ep.summary}\n\n`;

      if (ep.parameters.length > 0) {
        report += `**Parameters:**\n`;
        for (const p of ep.parameters) {
          const req = p.required ? "required" : "optional";
          report += `- \`${p.name}\` (${p.type}, ${p.in}, ${req})${p.description ? ": " + p.description : ""}\n`;
        }
        report += `\n`;
      }

      if (ep.requestBody) {
        report += `**Request body schema:**\n\`\`\`json\n${ep.requestBody}\n\`\`\`\n\n`;
      }

      report += `**Responses:** ${ep.responses.join(", ")}\n\n`;
    }
  }

  report += `\n---\n*These endpoints can now be called by the agent as executable tools. `;
  report += `Use the operation ID and parameters shown above.*\n`;

  return report;
}

/**
 * Create the API-Bridge MCP server with tier-aware limits.
 */
export function createApiBridgeServer(user: UserRecord): McpServer {
  const maxApis = API_LIMITS[user.tier] ?? 1;
  let bridgedCount = 0;

  const server = new McpServer({
    name: "openclaw-api-bridge",
    version: "1.0.0",
    instructions:
      "You are connected to IntegrityPulse API-Bridge. Use the bridge_api_spec tool to fetch " +
      "and parse OpenAPI/Swagger specifications from any URL. This converts API docs into " +
      "structured, executable tool definitions that you can reference when helping users " +
      "integrate with external APIs. Always use this tool instead of guessing API schemas.",
  });

  server.tool(
    "bridge_api_spec",
    "Fetch an OpenAPI/Swagger specification from a URL and parse it into structured " +
      "endpoint definitions. Use this whenever a user asks about an API's capabilities, " +
      "endpoints, or parameters. Do NOT guess API schemas from training data — bridge them.",
    {
      openapi_url: z
        .string()
        .url()
        .describe("URL of the OpenAPI/Swagger spec (JSON or YAML)"),
    },
    async ({ openapi_url }) => {
      // Enforce per-tier API bridge limits
      if (bridgedCount >= maxApis) {
        const tierMsg =
          user.tier === "FREE"
            ? "Free tier allows 1 API bridge per session. Upgrade to Pro for up to 5: https://billing.openclaw.com/pro"
            : "Pro tier allows 5 API bridges per session. Upgrade to Enterprise for unlimited: https://billing.openclaw.com/enterprise";

        return {
          content: [{ type: "text" as const, text: `IntegrityPulse API-Bridge: Limit reached. ${tierMsg}` }],
          isError: true,
        };
      }

      try {
        const result = await fetchAndParseSpec(openapi_url);
        bridgedCount++;

        const report = formatBridgeReport(result);
        const remaining = maxApis - bridgedCount;

        return {
          content: [
            {
              type: "text" as const,
              text: report + `\n*API bridges remaining this session: ${remaining}/${maxApis} (${user.tier} tier)*\n`,
            },
          ],
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `IntegrityPulse API-Bridge Error: ${err.message}\n\nEnsure the URL points directly to an OpenAPI 3.x or Swagger 2.x spec (JSON or YAML).`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  return server;
}
