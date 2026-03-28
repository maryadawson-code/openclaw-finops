import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Headers that reveal cache vs origin behavior
const CACHE_HEADERS = [
  "cf-cache-status",
  "x-cache",
  "x-cache-hits",
  "x-served-by",
  "x-varnish",
  "age",
  "cache-control",
  "cdn-cache-control",
  "x-fastly-request-id",
  "x-amz-cf-pop",
  "x-vercel-cache",
  "x-netlify-cache",
];

interface VerificationResult {
  url: string;
  final_url: string;
  status: number;
  cache_busted: boolean;
  cache_evidence: Record<string, string>;
  cache_verdict: "ORIGIN" | "EDGE_CACHE" | "INDETERMINATE";
  dom_signature_match: boolean | null;
  dom_signature_detail: string;
  response_headers: Record<string, string>;
  body_preview: string;
  body_length: number;
  timestamp: string;
}

function assessCacheVerdict(headers: Record<string, string>): "ORIGIN" | "EDGE_CACHE" | "INDETERMINATE" {
  const cfCache = headers["cf-cache-status"]?.toUpperCase();
  if (cfCache === "HIT" || cfCache === "STALE" || cfCache === "REVALIDATED") return "EDGE_CACHE";
  if (cfCache === "MISS" || cfCache === "DYNAMIC" || cfCache === "BYPASS") return "ORIGIN";

  const xCache = headers["x-cache"]?.toUpperCase();
  if (xCache?.includes("HIT")) return "EDGE_CACHE";
  if (xCache?.includes("MISS")) return "ORIGIN";

  const vercelCache = headers["x-vercel-cache"]?.toUpperCase();
  if (vercelCache === "HIT" || vercelCache === "STALE") return "EDGE_CACHE";
  if (vercelCache === "MISS") return "ORIGIN";

  const age = parseInt(headers["age"] || "0", 10);
  if (age > 0) return "EDGE_CACHE";

  return "INDETERMINATE";
}

function checkDomSignature(html: string, signature: string): { match: boolean; detail: string } {
  if (!signature || signature.trim() === "") {
    return { match: true, detail: "No signature provided — skipped." };
  }

  // Parse simple signature patterns:
  // "exactly one <header id='main-nav'>" → count occurrences of the tag
  // "contains <div class='app-root'>" → check existence
  // "no <iframe>" → check absence

  const exactlyMatch = signature.match(/^exactly\s+(\w+)\s+(<.+>)$/i);
  if (exactlyMatch) {
    const count = exactlyMatch[1] === "one" ? 1 : exactlyMatch[1] === "two" ? 2 : parseInt(exactlyMatch[1], 10);
    const tag = exactlyMatch[2];
    // Extract tag pattern for regex
    const tagContent = tag.replace(/^</, "").replace(/>$/, "");
    const regex = new RegExp(`<${tagContent}[\\s>]`, "gi");
    const matches = html.match(regex);
    const found = matches?.length ?? 0;
    if (found === count) {
      return { match: true, detail: `PASS: Found exactly ${count} occurrence(s) of ${tag}.` };
    }
    return { match: false, detail: `FAIL: Expected ${count} occurrence(s) of ${tag}, found ${found}.` };
  }

  const containsMatch = signature.match(/^contains\s+(<.+>)$/i);
  if (containsMatch) {
    const tag = containsMatch[1].replace(/^</, "").replace(/>$/, "");
    const regex = new RegExp(`<${tag}[\\s>]`, "i");
    if (regex.test(html)) {
      return { match: true, detail: `PASS: Found ${containsMatch[1]} in DOM.` };
    }
    return { match: false, detail: `FAIL: ${containsMatch[1]} not found in DOM.` };
  }

  const noMatch = signature.match(/^no\s+(<.+>)$/i);
  if (noMatch) {
    const tag = noMatch[1].replace(/^</, "").replace(/>$/, "");
    const regex = new RegExp(`<${tag}[\\s>]`, "i");
    if (!regex.test(html)) {
      return { match: true, detail: `PASS: Confirmed ${noMatch[1]} is absent from DOM.` };
    }
    return { match: false, detail: `FAIL: ${noMatch[1]} was found in DOM but should be absent.` };
  }

  // Fallback: treat signature as a literal string search
  if (html.includes(signature)) {
    return { match: true, detail: `PASS: Literal string "${signature.substring(0, 50)}" found in response body.` };
  }
  return { match: false, detail: `FAIL: Literal string "${signature.substring(0, 50)}" not found in response body.` };
}

function formatReport(result: VerificationResult): string {
  let report = `## OpenClaw Fortress — Live State Verification\n\n`;
  report += `**Target:** \`${result.url}\`\n`;
  if (result.final_url !== result.url) {
    report += `**Redirected to:** \`${result.final_url}\`\n`;
  }
  report += `**Status:** ${result.status}\n`;
  report += `**Timestamp:** ${result.timestamp}\n`;
  report += `**Body size:** ${result.body_length.toLocaleString()} bytes\n\n`;

  // Cache analysis
  report += `### Cache Analysis\n\n`;
  report += `**Cache busted:** ${result.cache_busted ? "Yes (query param + no-cache headers)" : "No (standard request)"}\n`;
  report += `**Verdict:** **${result.cache_verdict}**\n\n`;

  if (Object.keys(result.cache_evidence).length > 0) {
    report += `| Header | Value |\n`;
    report += `|--------|-------|\n`;
    for (const [k, v] of Object.entries(result.cache_evidence)) {
      report += `| \`${k}\` | ${v} |\n`;
    }
    report += `\n`;
  } else {
    report += `No cache-related headers detected.\n\n`;
  }

  // DOM signature
  report += `### DOM Signature Check\n\n`;
  report += `${result.dom_signature_detail}\n\n`;

  // Key response headers
  report += `### Response Headers\n\n`;
  report += `| Header | Value |\n`;
  report += `|--------|-------|\n`;
  const importantHeaders = ["content-type", "server", "x-powered-by", "strict-transport-security", "content-security-policy"];
  for (const h of importantHeaders) {
    if (result.response_headers[h]) {
      report += `| \`${h}\` | ${result.response_headers[h]} |\n`;
    }
  }
  report += `\n`;

  // Body preview
  report += `### Body Preview (first 500 chars)\n\n`;
  report += `\`\`\`html\n${result.body_preview}\n\`\`\`\n`;

  return report;
}

// ---------------------------------------------------------------------------
// Tool 2: pre_flight_firewall — scan code for forbidden content
// ---------------------------------------------------------------------------

interface FirewallFinding {
  file: string;
  line: number;
  rule: string;
  match: string;
}

const FORBIDDEN_RULES: Array<{ id: string; name: string; pattern: RegExp }> = [
  { id: "FW-001", name: "Leaked code block backticks", pattern: /^```/m },
  { id: "FW-002", name: "TODO tag", pattern: /\bTODO:/i },
  { id: "FW-003", name: "FIXME tag", pattern: /\bFIXME:/i },
  { id: "FW-004", name: "PLACEHOLDER tag", pattern: /\bPLACEHOLDER:/i },
  { id: "FW-005", name: "AI prompt leakage: 'Here is the code'", pattern: /\bHere is the code:/i },
  { id: "FW-006", name: "AI prompt leakage: 'Certainly!'", pattern: /\bCertainly!/i },
  { id: "FW-007", name: "AI prompt leakage: 'As an AI'", pattern: /\bAs an AI\b/i },
  { id: "FW-008", name: "AI prompt leakage: 'I'd be happy to'", pattern: /\bI'd be happy to\b/i },
  { id: "FW-009", name: "AI prompt leakage: 'Sure thing'", pattern: /\bSure thing[!,.]?\s/i },
  { id: "FW-010", name: "Hardcoded secret pattern", pattern: /(?:api[_-]?key|secret|password)\s*[:=]\s*["'][A-Za-z0-9]{16,}/i },
];

function scanFilesForForbidden(
  files: Array<{ path: string; content: string }>
): { status: "PASSED" | "BLOCKED"; findings: FirewallFinding[] } {
  const findings: FirewallFinding[] = [];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const rule of FORBIDDEN_RULES) {
        if (rule.pattern.test(lines[i])) {
          const matchText = lines[i].trim();
          findings.push({
            file: file.path,
            line: i + 1,
            rule: `${rule.id}: ${rule.name}`,
            match: matchText.length > 80 ? matchText.substring(0, 77) + "..." : matchText,
          });
        }
      }
    }
  }

  return {
    status: findings.length > 0 ? "BLOCKED" : "PASSED",
    findings,
  };
}

function formatFirewallReport(result: ReturnType<typeof scanFilesForForbidden>, fileCount: number): string {
  let report = `## OpenClaw Fortress — Pre-Flight Firewall\n\n`;
  report += `**Files scanned:** ${fileCount}\n`;
  report += `**Status:** **${result.status}**\n\n`;

  if (result.status === "PASSED") {
    report += `No forbidden patterns detected. Clear for build/commit.\n`;
    return report;
  }

  report += `**Findings:** ${result.findings.length} violation(s) — resolve before committing.\n\n`;
  report += `| File | Line | Rule | Match |\n`;
  report += `|------|------|------|-------|\n`;
  for (const f of result.findings) {
    report += `| \`${f.file}\` | ${f.line} | ${f.rule} | \`${f.match}\` |\n`;
  }
  report += `\n> **Do not commit or build until all findings are resolved.**\n`;

  return report;
}

// ---------------------------------------------------------------------------
// Tool 3: simulate_blast_radius — check change scope vs declared intent
// ---------------------------------------------------------------------------

// File categories for blast radius analysis
const GLOBAL_CONFIG_PATTERNS = [
  /global\.css$/i, /globals\.css$/i, /global\.scss$/i,
  /index\.html$/i, /app\.html$/i, /_app\.tsx?$/i, /_document\.tsx?$/i,
  /layout\.tsx?$/i, /root\.tsx?$/i,
  /\.env/, /config\.(ts|js|json)$/i, /wrangler\.toml$/i,
];

const SHARED_SHELL_PATTERNS = [
  /header\.tsx?$/i, /footer\.tsx?$/i, /nav(bar|igation)?\.tsx?$/i,
  /sidebar\.tsx?$/i, /layout\.tsx?$/i, /shell\.tsx?$/i,
  /app-shell\.tsx?$/i, /wrapper\.tsx?$/i,
];

const ROUTING_STATE_PATTERNS = [
  /router\.(ts|tsx|js)$/i, /routes\.(ts|tsx|js)$/i,
  /store\.(ts|tsx|js)$/i, /context\.(ts|tsx|js)$/i,
  /reducer\.(ts|tsx|js)$/i, /middleware\.(ts|tsx|js)$/i,
  /api\/.*\.(ts|tsx|js)$/i,
];

function matchesAny(file: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(file));
}

interface BlastResult {
  status: "PASSED" | "BLOCKED";
  declared_class: string;
  violations: Array<{ file: string; reason: string }>;
  explanation: string;
}

function simulateBlast(
  modifiedFiles: string[],
  declaredClass: string
): BlastResult {
  const violations: Array<{ file: string; reason: string }> = [];

  for (const file of modifiedFiles) {
    if (declaredClass === "content-only") {
      if (matchesAny(file, GLOBAL_CONFIG_PATTERNS)) {
        violations.push({ file, reason: "Content-only changes cannot modify global configuration." });
      }
      if (matchesAny(file, SHARED_SHELL_PATTERNS)) {
        violations.push({ file, reason: "Content-only changes cannot modify shared shell components." });
      }
      if (matchesAny(file, ROUTING_STATE_PATTERNS)) {
        violations.push({ file, reason: "Content-only changes cannot modify routing or state logic." });
      }
    }

    if (declaredClass === "style-only") {
      if (matchesAny(file, ROUTING_STATE_PATTERNS)) {
        violations.push({ file, reason: "Style-only changes cannot modify routing or state logic." });
      }
      // Style changes to global CSS are expected, but modifying component logic is not
      if (!file.match(/\.(css|scss|sass|less|styl)$/i) && !matchesAny(file, GLOBAL_CONFIG_PATTERNS)) {
        if (file.match(/\.(ts|tsx|js|jsx)$/i)) {
          violations.push({ file, reason: "Style-only changes should not modify TypeScript/JavaScript source files." });
        }
      }
    }

    if (declaredClass === "shared-shell") {
      // Shared-shell changes are expected to touch shell components — no restriction there
      // But flag if they touch unrelated content pages
      if (file.match(/\/(pages|views|screens)\//i) && !matchesAny(file, SHARED_SHELL_PATTERNS)) {
        violations.push({ file, reason: "Shared-shell changes should not modify individual page components." });
      }
    }
  }

  const status = violations.length > 0 ? "BLOCKED" : "PASSED";
  let explanation: string;

  if (status === "PASSED") {
    explanation = `All ${modifiedFiles.length} modified file(s) are consistent with the declared "${declaredClass}" change class.`;
  } else {
    explanation =
      `${violations.length} file(s) violate the declared "${declaredClass}" scope. ` +
      `This indicates the change has a wider blast radius than intended. ` +
      `Either reclassify the change or remove the out-of-scope modifications.`;
  }

  return { status, declared_class: declaredClass, violations, explanation };
}

function formatBlastReport(result: BlastResult): string {
  let report = `## OpenClaw Fortress — Blast Radius Simulation\n\n`;
  report += `**Declared change class:** ${result.declared_class}\n`;
  report += `**Status:** **${result.status}**\n\n`;
  report += `${result.explanation}\n\n`;

  if (result.violations.length > 0) {
    report += `| File | Violation |\n`;
    report += `|------|-----------|\n`;
    for (const v of result.violations) {
      report += `| \`${v.file}\` | ${v.reason} |\n`;
    }
    report += `\n> **Reclassify the change or remove out-of-scope modifications before proceeding.**\n`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// Tool 4: reconcile_deployment_state — source vs live comparison
// ---------------------------------------------------------------------------

interface StringCheckResult {
  expected_present: Array<{ str: string; found: boolean }>;
  forbidden_absent: Array<{ str: string; found: boolean }>;
  passed: boolean;
}

function checkStrings(
  body: string,
  expected: string[],
  forbidden: string[]
): StringCheckResult {
  const expectedResults = expected.map((s) => ({
    str: s,
    found: body.includes(s),
  }));
  const forbiddenResults = forbidden.map((s) => ({
    str: s,
    found: body.includes(s),
  }));

  const passed =
    expectedResults.every((r) => r.found) &&
    forbiddenResults.every((r) => !r.found);

  return {
    expected_present: expectedResults,
    forbidden_absent: forbiddenResults,
    passed,
  };
}

type ReconcileStatus = "SYNCED" | "DIVERGED";

interface ReconcileResult {
  status: ReconcileStatus;
  source_state: "PASS" | "FAIL";
  live_state: "PASS" | "FAIL";
  live_http_status: number;
  live_cache_verdict: string;
  source_checks: StringCheckResult;
  live_checks: StringCheckResult;
  mismatch_reason: string;
}

function formatReconcileReport(r: ReconcileResult, manifest: { source_path: string; live_url: string }): string {
  let report = `## OpenClaw Fortress — Deployment State Reconciliation\n\n`;
  report += `**Source:** \`${manifest.source_path}\`\n`;
  report += `**Live:** \`${manifest.live_url}\`\n`;
  report += `**Status:** **${r.status}**\n`;
  report += `**Source state:** ${r.source_state} | **Live state:** ${r.live_state}\n`;
  report += `**Live HTTP:** ${r.live_http_status} | **Cache:** ${r.live_cache_verdict}\n\n`;

  if (r.status === "SYNCED") {
    report += `Source and live states are consistent. All expected strings present, all forbidden strings absent in both.\n`;
    return report;
  }

  report += `**Mismatch:** ${r.mismatch_reason}\n\n`;

  // Expected strings table
  report += `### Expected Strings\n\n`;
  report += `| String | Source | Live |\n`;
  report += `|--------|--------|------|\n`;
  for (let i = 0; i < r.source_checks.expected_present.length; i++) {
    const s = r.source_checks.expected_present[i];
    const l = r.live_checks.expected_present[i];
    const sIcon = s.found ? "FOUND" : "**MISSING**";
    const lIcon = l.found ? "FOUND" : "**MISSING**";
    const display = s.str.length > 40 ? s.str.substring(0, 37) + "..." : s.str;
    report += `| \`${display}\` | ${sIcon} | ${lIcon} |\n`;
  }

  // Forbidden strings table
  if (r.source_checks.forbidden_absent.length > 0) {
    report += `\n### Forbidden Strings\n\n`;
    report += `| String | Source | Live |\n`;
    report += `|--------|--------|------|\n`;
    for (let i = 0; i < r.source_checks.forbidden_absent.length; i++) {
      const s = r.source_checks.forbidden_absent[i];
      const l = r.live_checks.forbidden_absent[i];
      const sIcon = s.found ? "**PRESENT (BAD)**" : "absent" ;
      const lIcon = l.found ? "**PRESENT (BAD)**" : "absent";
      const display = s.str.length > 40 ? s.str.substring(0, 37) + "..." : s.str;
      report += `| \`${display}\` | ${sIcon} | ${lIcon} |\n`;
    }
  }

  report += `\n> **Do not mark this task complete until status is SYNCED.** `;
  report += `Investigate the build pipeline, routing config, or edge cache.\n`;

  return report;
}

// ---------------------------------------------------------------------------
// MCP Server — all four tools
// ---------------------------------------------------------------------------

export function createFortressServer(): McpServer {
  const server = new McpServer({
    name: "openclaw-fortress",
    version: "1.0.0",
    instructions:
      "You are connected to OpenClaw Fortress, a zero-trust verification engine. " +
      "You MUST run simulate_blast_radius before executing any file writes to verify " +
      "the change scope matches the declared intent. You MUST run pre_flight_firewall " +
      "before executing any build or git commit commands to catch forbidden content. " +
      "Use verify_live_state to confirm deployments are live and not cache-masked. " +
      "You are strictly forbidden from marking a task complete until reconcile_deployment_state " +
      "returns status: 'SYNCED'. If it returns 'DIVERGED', you must investigate the build " +
      "step, routing configuration, or edge cache before proceeding.",
  });

  server.tool(
    "verify_live_state",
    "Fetch a live URL and return the actual HTTP response, cache status, and DOM signature check. " +
      "Use this to verify deployments, detect cache-masking, and confirm what end users actually see. " +
      "Set bypass_cache=true to force an origin hit.",
    {
      target_url: z
        .string()
        .url()
        .describe("The URL to verify (must be HTTPS or HTTP)"),
      expected_dom_signature: z
        .string()
        .default("")
        .describe(
          "DOM assertion to check. Formats: 'exactly one <header id=\"main-nav\">', " +
            "'contains <div class=\"app-root\">', 'no <iframe>', or a literal string."
        ),
      bypass_cache: z
        .boolean()
        .default(false)
        .describe("If true, append a cache-busting param and set no-cache headers to force an origin hit"),
    },
    async ({ target_url, expected_dom_signature, bypass_cache }) => {
      try {
        // Build the request URL
        let fetchUrl = target_url;
        if (bypass_cache) {
          const separator = target_url.includes("?") ? "&" : "?";
          fetchUrl = `${target_url}${separator}_ocfcb=${Date.now()}`;
        }

        const headers: Record<string, string> = {
          "User-Agent": "OpenClaw-Fortress/1.0 (Live State Verifier)",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        };
        if (bypass_cache) {
          headers["Cache-Control"] = "no-cache, no-store, must-revalidate";
          headers["Pragma"] = "no-cache";
        }

        const res = await fetch(fetchUrl, {
          headers,
          redirect: "follow",
        });

        const body = await res.text();

        // Collect all response headers
        const responseHeaders: Record<string, string> = {};
        res.headers.forEach((v, k) => {
          responseHeaders[k.toLowerCase()] = v;
        });

        // Extract cache-specific headers
        const cacheEvidence: Record<string, string> = {};
        for (const h of CACHE_HEADERS) {
          if (responseHeaders[h]) {
            cacheEvidence[h] = responseHeaders[h];
          }
        }

        const cacheVerdict = assessCacheVerdict(responseHeaders);
        const sigCheck = checkDomSignature(body, expected_dom_signature);

        const result: VerificationResult = {
          url: target_url,
          final_url: res.url || fetchUrl,
          status: res.status,
          cache_busted: bypass_cache,
          cache_evidence: cacheEvidence,
          cache_verdict: cacheVerdict,
          dom_signature_match: expected_dom_signature ? sigCheck.match : null,
          dom_signature_detail: sigCheck.detail,
          response_headers: responseHeaders,
          body_preview: body.substring(0, 500),
          body_length: body.length,
          timestamp: new Date().toISOString(),
        };

        const report = formatReport(result);

        return {
          content: [{ type: "text" as const, text: report }],
          isError: sigCheck.match === false,
        };
      } catch (err: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `OpenClaw Fortress Error: Failed to verify ${target_url}\n\n${err.message}`,
            },
          ],
          isError: true,
        };
      }
    }
  );

  // -----------------------------------------------------------------------
  // Tool 2: pre_flight_firewall
  // -----------------------------------------------------------------------
  server.tool(
    "pre_flight_firewall",
    "Scan source files for forbidden content before build or commit. Catches leaked code block " +
      "backticks, TODO/FIXME/PLACEHOLDER tags, AI prompt leakage ('Certainly!', 'As an AI'), " +
      "and hardcoded secrets. Run this before every git commit or build command.",
    {
      files: z
        .array(
          z.object({
            path: z.string().describe("File path (e.g., 'src/components/Header.tsx')"),
            content: z.string().describe("Full file content to scan"),
          })
        )
        .min(1)
        .describe("Array of files to scan. Each entry has a path and content string."),
    },
    async ({ files }) => {
      const result = scanFilesForForbidden(files);
      const report = formatFirewallReport(result, files.length);

      return {
        content: [{ type: "text" as const, text: report }],
        isError: result.status === "BLOCKED",
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 3: simulate_blast_radius
  // -----------------------------------------------------------------------
  server.tool(
    "simulate_blast_radius",
    "Verify that modified files match the declared change scope. Catches scope creep where " +
      "a 'content-only' change accidentally modifies global CSS or shared shell components. " +
      "Run this BEFORE writing files to verify the change won't have unintended side effects.",
    {
      modified_files: z
        .array(z.string())
        .min(1)
        .describe("Array of file paths that will be modified (e.g., ['src/pages/about.tsx', 'src/global.css'])"),
      declared_change_class: z
        .enum(["content-only", "style-only", "shared-shell"])
        .describe("The intended scope of the change"),
    },
    async ({ modified_files, declared_change_class }) => {
      const result = simulateBlast(modified_files, declared_change_class);
      const report = formatBlastReport(result);

      return {
        content: [{ type: "text" as const, text: report }],
        isError: result.status === "BLOCKED",
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 4: reconcile_deployment_state
  // -----------------------------------------------------------------------
  server.tool(
    "reconcile_deployment_state",
    "Compare source code against the live deployment to detect drift. Checks that expected " +
      "strings are present and forbidden strings are absent in BOTH the source and the live URL. " +
      "Returns SYNCED or DIVERGED. You MUST NOT mark a task complete until this returns SYNCED.",
    {
      route_manifest: z.object({
        source_path: z.string().describe("Path of the source file being verified (for reporting)"),
        live_url: z.string().url().describe("The live URL to fetch and compare against"),
      }),
      source_content: z
        .string()
        .min(1)
        .describe("The full content of the source file (provided by the agent)"),
      expected_strings: z
        .array(z.string())
        .min(1)
        .describe("Strings that MUST exist in both source and live output"),
      forbidden_strings: z
        .array(z.string())
        .default([])
        .describe("Strings that MUST NOT exist in either source or live output"),
    },
    async ({ route_manifest, source_content, expected_strings, forbidden_strings }) => {
      // Step 1: Check source
      const sourceChecks = checkStrings(source_content, expected_strings, forbidden_strings);

      // Step 2: Fetch live with cache-busting
      let liveBody: string;
      let liveStatus: number;
      let liveCacheVerdict: string;

      try {
        const separator = route_manifest.live_url.includes("?") ? "&" : "?";
        const liveUrl = `${route_manifest.live_url}${separator}_ocrcl=${Date.now()}`;

        const res = await fetch(liveUrl, {
          headers: {
            "User-Agent": "OpenClaw-Fortress/1.0 (State Reconciler)",
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Pragma": "no-cache",
            Accept: "text/html,application/json,*/*",
          },
          redirect: "follow",
        });

        liveBody = await res.text();
        liveStatus = res.status;

        const headers: Record<string, string> = {};
        res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
        liveCacheVerdict = assessCacheVerdict(headers);
      } catch (err: any) {
        return {
          content: [{
            type: "text" as const,
            text: `## OpenClaw Fortress — Deployment State Reconciliation\n\n` +
              `**Status: DIVERGED**\n\n` +
              `Failed to fetch live URL \`${route_manifest.live_url}\`: ${err.message}\n\n` +
              `Source state: ${sourceChecks.passed ? "PASS" : "FAIL"}\n` +
              `Live state: UNREACHABLE\n\n` +
              `> Investigate DNS, routing, or Worker deployment status.`,
          }],
          isError: true,
        };
      }

      // Step 3: Check live
      const liveChecks = checkStrings(liveBody, expected_strings, forbidden_strings);

      // Step 4: Reconcile
      const sourceState = sourceChecks.passed ? "PASS" as const : "FAIL" as const;
      const liveState = liveChecks.passed ? "PASS" as const : "FAIL" as const;

      let status: ReconcileStatus;
      let mismatchReason: string;

      if (sourceChecks.passed && liveChecks.passed) {
        status = "SYNCED";
        mismatchReason = "";
      } else if (sourceChecks.passed && !liveChecks.passed) {
        status = "DIVERGED";
        const missingExpected = liveChecks.expected_present.filter((r) => !r.found).map((r) => r.str);
        const foundForbidden = liveChecks.forbidden_absent.filter((r) => r.found).map((r) => r.str);
        const reasons: string[] = [];
        if (missingExpected.length) reasons.push(`Live is missing expected strings: ${missingExpected.map(s => `"${s}"`).join(", ")}`);
        if (foundForbidden.length) reasons.push(`Live contains forbidden strings: ${foundForbidden.map(s => `"${s}"`).join(", ")}`);
        mismatchReason = `Source passes but live fails. ${reasons.join(". ")}. The deployment is stale — the latest source has not propagated to the live endpoint. Check the build pipeline and edge cache.`;
      } else if (!sourceChecks.passed && liveChecks.passed) {
        status = "DIVERGED";
        mismatchReason = "Live passes but source fails. The source file may have regressed or the live version is running an older, correct build. Verify the source file is the intended version.";
      } else {
        status = "DIVERGED";
        mismatchReason = "Both source and live fail the string checks. The expected content may never have been added, or the wrong file/URL was provided.";
      }

      const result: ReconcileResult = {
        status,
        source_state: sourceState,
        live_state: liveState,
        live_http_status: liveStatus,
        live_cache_verdict: liveCacheVerdict,
        source_checks: sourceChecks,
        live_checks: liveChecks,
        mismatch_reason: mismatchReason,
      };

      const report = formatReconcileReport(result, route_manifest);

      return {
        content: [{ type: "text" as const, text: report }],
        isError: status === "DIVERGED",
      };
    }
  );

  return server;
}
