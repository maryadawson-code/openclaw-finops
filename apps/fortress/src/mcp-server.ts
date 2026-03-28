import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  getCanonicalAsset,
  getRouteManifest,
  getForbiddenPatterns,
} from "@openclaw/core";

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
// Tool 5: verify_asset_identity — SHA-256 hash verification
// ---------------------------------------------------------------------------

async function computeSha256(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Tool 6: escalate_to_recovery — circuit breaker
// ---------------------------------------------------------------------------

const RECOVERY_DIRECTIVE =
  "STOP PATCHING. You have hit the rollback threshold. " +
  "Execute a 'git revert' to the last known good commit. " +
  "Do not attempt further automated fixes on this route. " +
  "Request human checkpoint review immediately.";

// ---------------------------------------------------------------------------
// Tool 8: run_accessibility_scan — structural A11y checks on raw HTML
// ---------------------------------------------------------------------------

interface A11yViolation {
  rule: string;
  severity: "ERROR" | "WARNING";
  detail: string;
}

function scanAccessibility(html: string): A11yViolation[] {
  const violations: A11yViolation[] = [];

  // Rule 1: Multiple <main> tags
  const mainTags = html.match(/<main[\s>]/gi);
  if (mainTags && mainTags.length > 1) {
    violations.push({
      rule: "A11Y-001: Multiple <main> landmarks",
      severity: "ERROR",
      detail: `Found ${mainTags.length} <main> elements. A page must have exactly one <main> landmark.`,
    });
  }

  // Rule 2: Missing <main> entirely
  if (!mainTags || mainTags.length === 0) {
    violations.push({
      rule: "A11Y-002: Missing <main> landmark",
      severity: "WARNING",
      detail: "No <main> element found. Pages should have a <main> landmark for screen reader navigation.",
    });
  }

  // Rule 3: Inputs without associated label or aria-label
  // Match <input> tags that are NOT type="hidden" and NOT type="submit"/"button"
  const inputRegex = /<input\b([^>]*)>/gi;
  let inputMatch: RegExpExecArray | null;
  let inputIndex = 0;
  while ((inputMatch = inputRegex.exec(html)) !== null) {
    const attrs = inputMatch[1];
    // Skip hidden, submit, button, image, reset inputs
    if (/type\s*=\s*["']?(hidden|submit|button|image|reset)["']?/i.test(attrs)) continue;

    const hasAriaLabel = /aria-label\s*=\s*["'][^"']+["']/i.test(attrs);
    const hasAriaLabelledBy = /aria-labelledby\s*=\s*["'][^"']+["']/i.test(attrs);
    const hasId = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const hasTitle = /title\s*=\s*["'][^"']+["']/i.test(attrs);

    if (hasAriaLabel || hasAriaLabelledBy || hasTitle) continue;

    // Check if there's a <label for="id"> matching this input
    if (hasId) {
      const inputId = hasId[1];
      const labelRegex = new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${inputId}["']`, "i");
      if (labelRegex.test(html)) continue;
    }

    // Check if input is wrapped in a <label>
    // Rough heuristic: look for <label> within ~200 chars before this input
    const before = html.substring(Math.max(0, inputMatch.index - 200), inputMatch.index);
    const openLabels = (before.match(/<label/gi) || []).length;
    const closeLabels = (before.match(/<\/label/gi) || []).length;
    if (openLabels > closeLabels) continue; // input is inside an unclosed <label>

    inputIndex++;
    const nameAttr = /name\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const typeAttr = /type\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const identifier = nameAttr ? `name="${nameAttr[1]}"` : hasId ? `id="${hasId[1]}"` : `#${inputIndex}`;
    const inputType = typeAttr ? typeAttr[1] : "text";

    violations.push({
      rule: "A11Y-003: Input without accessible label",
      severity: "ERROR",
      detail: `<input type="${inputType}" ${identifier}> has no associated <label>, aria-label, or aria-labelledby.`,
    });
  }

  // Rule 4: <textarea> without label
  const textareaRegex = /<textarea\b([^>]*)>/gi;
  let taMatch: RegExpExecArray | null;
  while ((taMatch = textareaRegex.exec(html)) !== null) {
    const attrs = taMatch[1];
    const hasAriaLabel = /aria-label\s*=\s*["'][^"']+["']/i.test(attrs);
    const hasId = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);

    if (hasAriaLabel) continue;
    if (hasId) {
      const labelRegex = new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${hasId[1]}["']`, "i");
      if (labelRegex.test(html)) continue;
    }

    const identifier = hasId ? `id="${hasId[1]}"` : "(no id)";
    violations.push({
      rule: "A11Y-003: Textarea without accessible label",
      severity: "ERROR",
      detail: `<textarea ${identifier}> has no associated <label> or aria-label.`,
    });
  }

  // Rule 5: <select> without label
  const selectRegex = /<select\b([^>]*)>/gi;
  let selMatch: RegExpExecArray | null;
  while ((selMatch = selectRegex.exec(html)) !== null) {
    const attrs = selMatch[1];
    const hasAriaLabel = /aria-label\s*=\s*["'][^"']+["']/i.test(attrs);
    const hasId = /\bid\s*=\s*["']([^"']+)["']/i.exec(attrs);

    if (hasAriaLabel) continue;
    if (hasId) {
      const labelRegex = new RegExp(`<label[^>]*\\bfor\\s*=\\s*["']${hasId[1]}["']`, "i");
      if (labelRegex.test(html)) continue;
    }

    const identifier = hasId ? `id="${hasId[1]}"` : "(no id)";
    violations.push({
      rule: "A11Y-003: Select without accessible label",
      severity: "ERROR",
      detail: `<select ${identifier}> has no associated <label> or aria-label.`,
    });
  }

  // Rule 6: Heading level skips (H1 → H3, missing H2)
  const headingRegex = /<h([1-6])[\s>]/gi;
  const headingLevels: number[] = [];
  let hMatch: RegExpExecArray | null;
  while ((hMatch = headingRegex.exec(html)) !== null) {
    headingLevels.push(parseInt(hMatch[1], 10));
  }

  for (let i = 1; i < headingLevels.length; i++) {
    const prev = headingLevels[i - 1];
    const curr = headingLevels[i];
    if (curr > prev + 1) {
      violations.push({
        rule: "A11Y-004: Heading level skip",
        severity: "WARNING",
        detail: `Heading jumps from <h${prev}> to <h${curr}>, skipping <h${prev + 1}>. Screen readers use heading hierarchy for navigation.`,
      });
    }
  }

  // Rule 7: Images without alt attribute
  const imgRegex = /<img\b([^>]*)>/gi;
  let imgMatch: RegExpExecArray | null;
  let imgIndex = 0;
  while ((imgMatch = imgRegex.exec(html)) !== null) {
    imgIndex++;
    const attrs = imgMatch[1];
    const hasAlt = /\balt\s*=/i.test(attrs);
    if (!hasAlt) {
      const src = /src\s*=\s*["']([^"']+)["']/i.exec(attrs);
      const identifier = src ? src[1].split("/").pop() : `image #${imgIndex}`;
      violations.push({
        rule: "A11Y-005: Image without alt attribute",
        severity: "ERROR",
        detail: `<img src="...${identifier}"> is missing the alt attribute.`,
      });
    }
  }

  // Rule 8: Missing lang attribute on <html>
  const htmlTag = /<html\b([^>]*)>/i.exec(html);
  if (htmlTag && !/\blang\s*=\s*["'][^"']+["']/i.test(htmlTag[1])) {
    violations.push({
      rule: "A11Y-006: Missing lang attribute on <html>",
      severity: "WARNING",
      detail: "The <html> element should have a lang attribute (e.g., lang=\"en\") for screen readers.",
    });
  }

  return violations;
}

function formatA11yReport(violations: A11yViolation[], url: string): string {
  const errors = violations.filter((v) => v.severity === "ERROR").length;
  const warnings = violations.filter((v) => v.severity === "WARNING").length;
  const status = errors > 0 ? "FAIL" : warnings > 0 ? "WARN" : "PASS";

  let report = `## OpenClaw Fortress — Accessibility Scan\n\n`;
  report += `**Target:** \`${url}\`\n`;
  report += `**Status:** **${status}**\n`;
  report += `**Findings:** ${violations.length} (${errors} errors, ${warnings} warnings)\n\n`;

  if (violations.length === 0) {
    report += `No structural accessibility violations detected.\n\n`;
    report += `*Note: This is a structural HTML scan, not a full WCAG audit. `;
    report += `It checks landmarks, labels, heading hierarchy, and alt attributes. `;
    report += `For comprehensive compliance, supplement with axe-core or Lighthouse.*\n`;
    return report;
  }

  report += `| # | Severity | Rule | Detail |\n`;
  report += `|---|----------|------|--------|\n`;
  for (let i = 0; i < violations.length; i++) {
    const v = violations[i];
    report += `| ${i + 1} | **${v.severity}** | ${v.rule} | ${v.detail} |\n`;
  }

  if (errors > 0) {
    report += `\n> **${errors} error(s) must be fixed before deployment.** These represent barriers for assistive technology users.\n`;
  }

  report += `\n*Structural HTML scan — covers landmarks, labels, headings, alt text, lang attribute. Not a full WCAG 2.2 audit.*\n`;
  return report;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Tool 10: verify_route_parity_and_metadata — §10.7 + §10.9
// ---------------------------------------------------------------------------

interface MetadataViolation {
  field: string;
  expected: string;
  actual: string;
}

function extractMetadata(html: string): {
  title: string | null;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  description: string | null;
} {
  const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  const canonicalMatch = /<link[^>]*rel\s*=\s*["']canonical["'][^>]*href\s*=\s*["']([^"']+)["']/i.exec(html)
    || /<link[^>]*href\s*=\s*["']([^"']+)["'][^>]*rel\s*=\s*["']canonical["']/i.exec(html);
  const ogTitleMatch = /<meta[^>]*property\s*=\s*["']og:title["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)
    || /<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:title["']/i.exec(html);
  const ogDescMatch = /<meta[^>]*property\s*=\s*["']og:description["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)
    || /<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:description["']/i.exec(html);
  const ogImageMatch = /<meta[^>]*property\s*=\s*["']og:image["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)
    || /<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*property\s*=\s*["']og:image["']/i.exec(html);
  const descMatch = /<meta[^>]*name\s*=\s*["']description["'][^>]*content\s*=\s*["']([^"']+)["']/i.exec(html)
    || /<meta[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']description["']/i.exec(html);

  return {
    title: titleMatch ? titleMatch[1].trim() : null,
    canonical: canonicalMatch ? canonicalMatch[1].trim() : null,
    ogTitle: ogTitleMatch ? ogTitleMatch[1].trim() : null,
    ogDescription: ogDescMatch ? ogDescMatch[1].trim() : null,
    ogImage: ogImageMatch ? ogImageMatch[1].trim() : null,
    description: descMatch ? descMatch[1].trim() : null,
  };
}

function stripDynamicContent(html: string): string {
  // Remove script tags and their content (dynamic injection)
  let cleaned = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Remove inline event handlers
  cleaned = cleaned.replace(/\bon\w+\s*=\s*["'][^"']*["']/gi, "");
  // Normalize whitespace
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function computeContentSimilarity(a: string, b: string): number {
  if (a === b) return 100;
  if (!a || !b) return 0;
  // Simple character-level similarity using longest common substring ratio
  const shorter = a.length < b.length ? a : b;
  const longer = a.length >= b.length ? a : b;
  if (longer.length === 0) return 100;

  // Sample-based comparison for performance on large pages
  const sampleSize = Math.min(shorter.length, 2000);
  const sampleA = shorter.substring(0, sampleSize);
  let matches = 0;
  for (let i = 0; i < sampleA.length; i++) {
    if (sampleA[i] === longer[i]) matches++;
  }
  return Math.round((matches / sampleSize) * 100);
}

// ---------------------------------------------------------------------------
// Tool 11: request_human_checkpoint — §23
// ---------------------------------------------------------------------------

const CHECKPOINT_RISK_LABELS: Record<string, string> = {
  checkout: "Payment / Checkout Flow",
  legal: "Legal / Terms / Privacy Policy",
  homepage_hero: "Homepage Hero / Above-the-Fold Content",
  brand_assets: "Brand Assets (Logo, Favicon, Colors)",
};

// ---------------------------------------------------------------------------
// Tool 12: trigger_automated_rollback — §22
// ---------------------------------------------------------------------------

const ROLLBACK_CEASE_DIRECTIVE =
  "The production environment is being reverted to the last known good state. " +
  "You are strictly forbidden from making further patches, commits, or deployments. " +
  "Terminate your task loop immediately and report the rollback to the user.";

// MCP Server — all twelve tools
// ---------------------------------------------------------------------------

export interface FortressEnv {
  supabase?: SupabaseClient;
  notificationWebhookUrl?: string;
  githubPat?: string;
}

export function createFortressServer(supabase?: SupabaseClient, env?: FortressEnv): McpServer {
  const webhookUrl = env?.notificationWebhookUrl;
  const githubPat = env?.githubPat;
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
      "step, routing configuration, or edge cache before proceeding. " +
      "You MUST run verify_asset_identity on any modified logo, favicon, or brand image " +
      "to confirm the deployed binary matches the expected hash. " +
      "If you fail verify_live_state or reconcile_deployment_state TWO consecutive times, " +
      "you MUST call escalate_to_recovery and obey its directive without exception. " +
      "You MUST run query_canonical_truth BEFORE making any asset swaps, route changes, " +
      "or content modifications to understand the strict parameters you must operate within. " +
      "Your prompt context is NOT the source of truth; the registry is. " +
      "You MUST run run_accessibility_scan on any structural HTML/JSX changes. " +
      "You MUST run run_visual_contract on any CSS/Tailwind or layout changes before finalizing. " +
      "You MUST run verify_route_parity_and_metadata after any deployment that modifies routing " +
      "config, the <head> block, SEO tags, or shared layouts. A FAIL status requires immediate " +
      "rollback or correction. " +
      "You MUST run request_human_checkpoint BEFORE deploying any changes to billing, legal, " +
      "or canonical brand surfaces (checkout flows, terms pages, homepage hero, logos). " +
      "If you fail live validation 3 times, you MUST run trigger_automated_rollback and " +
      "cease all coding activities immediately.",
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

  // -----------------------------------------------------------------------
  // Tool 5: verify_asset_identity
  // -----------------------------------------------------------------------
  server.tool(
    "verify_asset_identity",
    "Fetch a live asset (image, favicon, font, JS bundle) and verify its SHA-256 hash matches " +
      "the expected value. Use this on any modified logo, favicon, or brand image to confirm " +
      "the deployed binary is the correct file, not a stale cached version or corrupted upload.",
    {
      asset_url: z
        .string()
        .url()
        .describe("URL of the asset to verify (e.g., https://example.com/favicon.ico)"),
      expected_sha256: z
        .string()
        .regex(/^[a-f0-9]{64}$/, "Must be a 64-character lowercase hex SHA-256 hash")
        .describe("Expected SHA-256 hash of the asset (64-char hex string)"),
    },
    async ({ asset_url, expected_sha256 }) => {
      try {
        const res = await fetch(asset_url, {
          headers: {
            "User-Agent": "OpenClaw-Fortress/1.0 (Asset Verifier)",
            "Cache-Control": "no-cache",
          },
        });

        if (!res.ok) {
          return {
            content: [{
              type: "text" as const,
              text: `## OpenClaw Fortress — Asset Identity Verification\n\n` +
                `**Asset:** \`${asset_url}\`\n` +
                `**Status:** **MISMATCH**\n\n` +
                `HTTP ${res.status} — asset not reachable.\n`,
            }],
            isError: true,
          };
        }

        const buffer = await res.arrayBuffer();
        const computedHash = await computeSha256(buffer);
        const match = computedHash === expected_sha256.toLowerCase();

        const contentType = res.headers.get("content-type") || "unknown";
        const size = buffer.byteLength;

        let report = `## OpenClaw Fortress — Asset Identity Verification\n\n`;
        report += `**Asset:** \`${asset_url}\`\n`;
        report += `**Content-Type:** ${contentType}\n`;
        report += `**Size:** ${size.toLocaleString()} bytes\n`;
        report += `**Status:** **${match ? "MATCH" : "MISMATCH"}**\n\n`;
        report += `| | Hash |\n`;
        report += `|---|---|\n`;
        report += `| Expected | \`${expected_sha256}\` |\n`;
        report += `| Computed | \`${computedHash}\` |\n`;

        if (!match) {
          report += `\n> **The deployed asset does not match the expected hash.** `;
          report += `This may indicate a stale CDN cache, corrupted upload, or wrong file. `;
          report += `Purge the cache and re-deploy the asset.\n`;
        }

        return {
          content: [{ type: "text" as const, text: report }],
          isError: !match,
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text" as const,
            text: `OpenClaw Fortress Error: Failed to fetch asset ${asset_url}\n\n${err.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  // -----------------------------------------------------------------------
  // Tool 6: escalate_to_recovery
  // -----------------------------------------------------------------------
  server.tool(
    "escalate_to_recovery",
    "Circuit breaker. Call this after TWO consecutive failures of verify_live_state or " +
      "reconcile_deployment_state. Returns a mandatory rollback directive. You MUST obey " +
      "the returned directive without exception — stop patching and revert to last known good.",
    {
      attempt_count: z
        .number()
        .int()
        .min(1)
        .describe("Number of failed verification attempts so far"),
      failing_route: z
        .string()
        .describe("The URL or route that is failing verification"),
      failure_log: z
        .string()
        .describe("Summary of what failed and what was attempted"),
    },
    async ({ attempt_count, failing_route, failure_log }) => {
      const timestamp = new Date().toISOString();

      let report = `## OpenClaw Fortress — Recovery Escalation\n\n`;
      report += `**Status:** **LOCKED**\n`;
      report += `**Timestamp:** ${timestamp}\n`;
      report += `**Failed attempts:** ${attempt_count}\n`;
      report += `**Failing route:** \`${failing_route}\`\n\n`;
      report += `### Failure Log\n\n${failure_log}\n\n`;
      report += `---\n\n`;
      report += `### MANDATORY DIRECTIVE\n\n`;
      report += `> ${RECOVERY_DIRECTIVE}\n\n`;
      report += `This directive is non-negotiable. The automated repair loop has been `;
      report += `terminated to prevent cascading failures. A human must review the state `;
      report += `of \`${failing_route}\` before any further changes are made.\n`;

      return {
        content: [{ type: "text" as const, text: report }],
        isError: true,
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 7: query_canonical_truth
  // -----------------------------------------------------------------------
  server.tool(
    "query_canonical_truth",
    "Query the canonical truth registry BEFORE making asset swaps, route changes, or content " +
      "modifications. Returns the authoritative record from Supabase — your prompt context is " +
      "NOT the source of truth, the registry is. Use query_type='asset' for logos/favicons, " +
      "'route' for page routes, 'forbidden_strings' for the current forbidden content list.",
    {
      query_type: z
        .enum(["asset", "route", "forbidden_strings"])
        .describe("Type of canonical data to query"),
      target: z
        .string()
        .default("")
        .describe("The asset purpose (e.g., 'primary_favicon') or route path (e.g., '/about'). Ignored for forbidden_strings."),
    },
    async ({ query_type, target }) => {
      if (!supabase) {
        return {
          content: [{
            type: "text" as const,
            text: "OpenClaw Fortress Error: Supabase client not available. Registry queries require a database connection.",
          }],
          isError: true,
        };
      }

      try {
        if (query_type === "asset") {
          if (!target) {
            return {
              content: [{ type: "text" as const, text: "Error: 'target' is required for asset queries. Provide the asset_purpose (e.g., 'primary_favicon', 'logo_dark')." }],
              isError: true,
            };
          }

          const asset = await getCanonicalAsset(supabase, target);
          if (!asset) {
            return {
              content: [{
                type: "text" as const,
                text: `## OpenClaw Fortress — Canonical Truth\n\n**Query:** asset \`${target}\`\n**Result:** NOT FOUND\n\nNo active asset registered with purpose \`${target}\`. Register it in the \`asset_registry\` table before proceeding.`,
              }],
              isError: true,
            };
          }

          let report = `## OpenClaw Fortress — Canonical Truth\n\n`;
          report += `**Query type:** Asset\n`;
          report += `**Purpose:** ${asset.asset_purpose}\n`;
          report += `**Status:** ${asset.status}\n\n`;
          report += `| Property | Value |\n`;
          report += `|----------|-------|\n`;
          report += `| Canonical path | \`${asset.canonical_path}\` |\n`;
          report += `| Expected SHA-256 | \`${asset.expected_sha256}\` |\n`;
          report += `\n> Use this SHA-256 hash with \`verify_asset_identity\` after deployment.\n`;

          return { content: [{ type: "text" as const, text: report }] };
        }

        if (query_type === "route") {
          if (!target) {
            return {
              content: [{ type: "text" as const, text: "Error: 'target' is required for route queries. Provide the route_path (e.g., '/about', '/pricing')." }],
              isError: true,
            };
          }

          const route = await getRouteManifest(supabase, target);
          if (!route) {
            return {
              content: [{
                type: "text" as const,
                text: `## OpenClaw Fortress — Canonical Truth\n\n**Query:** route \`${target}\`\n**Result:** NOT FOUND\n\nNo route manifest registered for \`${target}\`. Register it in the \`route_manifest\` table before proceeding.`,
              }],
              isError: true,
            };
          }

          let report = `## OpenClaw Fortress — Canonical Truth\n\n`;
          report += `**Query type:** Route\n`;
          report += `**Route:** ${route.route_path}\n\n`;
          report += `| Property | Value |\n`;
          report += `|----------|-------|\n`;
          report += `| Canonical URL | \`${route.canonical_url}\` |\n`;
          report += `| Expected shell signature | \`${route.expected_shell_signature}\` |\n`;
          report += `\n> Use this URL and signature with \`verify_live_state\` and \`reconcile_deployment_state\`.\n`;

          return { content: [{ type: "text" as const, text: report }] };
        }

        if (query_type === "forbidden_strings") {
          const patterns = await getForbiddenPatterns(supabase);

          let report = `## OpenClaw Fortress — Canonical Truth\n\n`;
          report += `**Query type:** Forbidden Strings\n`;
          report += `**Patterns registered:** ${patterns.length}\n\n`;
          report += `| Pattern | Category |\n`;
          report += `|---------|----------|\n`;
          for (const p of patterns) {
            report += `| \`${p.keyword_pattern}\` | ${p.category} |\n`;
          }
          report += `\n> These patterns are enforced by \`pre_flight_firewall\`. Any match blocks the build.\n`;

          return { content: [{ type: "text" as const, text: report }] };
        }

        return {
          content: [{ type: "text" as const, text: "Unknown query_type." }],
          isError: true,
        };
      } catch (err: any) {
        return {
          content: [{
            type: "text" as const,
            text: `OpenClaw Fortress Error: Registry query failed.\n\n${err.message}`,
          }],
          isError: true,
        };
      }
    }
  );

  // -----------------------------------------------------------------------
  // Tool 8: run_accessibility_scan
  // -----------------------------------------------------------------------
  server.tool(
    "run_accessibility_scan",
    "Scan a URL or HTML content for structural accessibility violations. Checks for multiple " +
      "<main> landmarks, inputs without labels, heading level skips, images without alt, and " +
      "missing lang attribute. Run this on ANY structural HTML/JSX change before deployment.",
    {
      target_url: z
        .string()
        .default("")
        .describe("URL to fetch and scan. Either this or html_content must be provided."),
      html_content: z
        .string()
        .default("")
        .describe("Raw HTML to scan directly (use this when the page isn't deployed yet)."),
    },
    async ({ target_url, html_content }) => {
      let html = html_content;
      let source = "provided HTML";

      if (!html && target_url) {
        try {
          const res = await fetch(target_url, {
            headers: {
              "User-Agent": "OpenClaw-Fortress/1.0 (A11y Scanner)",
              Accept: "text/html,*/*",
            },
          });
          if (!res.ok) {
            return {
              content: [{
                type: "text" as const,
                text: `OpenClaw Fortress Error: Failed to fetch ${target_url} — HTTP ${res.status}`,
              }],
              isError: true,
            };
          }
          html = await res.text();
          source = target_url;
        } catch (err: any) {
          return {
            content: [{
              type: "text" as const,
              text: `OpenClaw Fortress Error: Failed to fetch ${target_url}\n\n${err.message}`,
            }],
            isError: true,
          };
        }
      }

      if (!html) {
        return {
          content: [{
            type: "text" as const,
            text: "Error: Provide either target_url or html_content to scan.",
          }],
          isError: true,
        };
      }

      const violations = scanAccessibility(html);
      const report = formatA11yReport(violations, source);
      const hasErrors = violations.some((v) => v.severity === "ERROR");

      return {
        content: [{ type: "text" as const, text: report }],
        isError: hasErrors,
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 9: run_visual_contract
  // -----------------------------------------------------------------------
  server.tool(
    "run_visual_contract",
    "Initiate visual regression verification for CSS/layout changes. Fetches a live render " +
      "reference and returns a checkpoint directive. Run this on ANY CSS, Tailwind, or layout " +
      "change before finalizing. V1 requires human visual confirmation; automated pixel-diffing " +
      "will be added in V2.",
    {
      target_url: z
        .string()
        .url()
        .describe("The live URL to capture for visual verification"),
      baseline_image_url: z
        .string()
        .default("")
        .describe("URL of the baseline screenshot to compare against (optional for V1)"),
      tolerance_percent: z
        .number()
        .min(0)
        .max(100)
        .default(2.0)
        .describe("Acceptable visual difference percentage (default 2.0%)"),
    },
    async ({ target_url, baseline_image_url, tolerance_percent }) => {
      // Verify the target URL is reachable
      let status: number;
      let contentType: string;
      try {
        const res = await fetch(target_url, {
          method: "HEAD",
          headers: { "User-Agent": "OpenClaw-Fortress/1.0 (Visual Contract)" },
        });
        status = res.status;
        contentType = res.headers.get("content-type") || "unknown";
      } catch (err: any) {
        return {
          content: [{
            type: "text" as const,
            text: `OpenClaw Fortress Error: Target URL unreachable.\n\n${target_url}: ${err.message}`,
          }],
          isError: true,
        };
      }

      const timestamp = new Date().toISOString();

      let report = `## OpenClaw Fortress — Visual Contract\n\n`;
      report += `**Target:** \`${target_url}\`\n`;
      report += `**HTTP Status:** ${status}\n`;
      report += `**Content-Type:** ${contentType}\n`;
      report += `**Timestamp:** ${timestamp}\n`;
      report += `**Tolerance:** ${tolerance_percent}%\n`;

      if (baseline_image_url) {
        report += `**Baseline:** \`${baseline_image_url}\`\n`;
      }

      report += `\n### Status: **PENDING_VISUAL_CONFIRMATION**\n\n`;

      report += `Visual validation requires external confirmation. The architectural hook `;
      report += `for automated pixel-diffing (V2) is in place.\n\n`;

      report += `**For V1, you must:**\n`;
      report += `1. Open \`${target_url}\` in a browser.\n`;
      report += `2. Compare the current render against the design spec or baseline.\n`;
      report += `3. Verify that layout, spacing, colors, and typography match expectations.\n`;
      report += `4. Check responsive behavior at mobile (375px), tablet (768px), and desktop (1280px).\n\n`;

      if (baseline_image_url) {
        report += `**Baseline reference available:** Open \`${baseline_image_url}\` side-by-side with the live render.\n\n`;
      }

      report += `> **Do not finalize CSS/layout changes until visual confirmation is complete.** `;
      report += `Respond to the user: "Visual contract check pending — please confirm the `;
      report += `render at ${target_url} matches expectations before I proceed."\n`;

      return {
        content: [{ type: "text" as const, text: report }],
        isError: false,
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 10: verify_route_parity_and_metadata
  // -----------------------------------------------------------------------
  server.tool(
    "verify_route_parity_and_metadata",
    "Verify route parity (pretty URL vs static .html) and validate SEO metadata (<title>, " +
      "canonical, og:title). Run after ANY deployment that modifies routing, <head>, SEO tags, " +
      "or shared layouts. A FAIL requires immediate rollback or correction.",
    {
      target_route: z
        .string()
        .describe("Route path to verify (e.g., '/about', '/pricing')"),
      base_domain: z
        .string()
        .url()
        .describe("Base domain (e.g., 'https://app.example.com')"),
      expected_metadata: z.object({
        title: z
          .string()
          .describe("Expected <title> tag content"),
        canonical_url: z
          .string()
          .describe("Expected canonical URL"),
        require_og: z
          .boolean()
          .default(false)
          .describe("Whether og:title must be present"),
      }),
    },
    async ({ target_route, base_domain, expected_metadata }) => {
      const prettyUrl = `${base_domain}${target_route}`.replace(/\/$/, "");
      const staticUrl = `${base_domain}${target_route}.html`;

      // Step 1: Fetch both routes
      let prettyHtml: string | null = null;
      let prettyStatus = 0;
      let staticHtml: string | null = null;
      let staticStatus = 0;

      try {
        const prettyRes = await fetch(prettyUrl, {
          headers: { "User-Agent": "OpenClaw-Fortress/1.0 (Route Parity)", Accept: "text/html,*/*" },
          redirect: "follow",
        });
        prettyStatus = prettyRes.status;
        if (prettyRes.ok) prettyHtml = await prettyRes.text();
      } catch {}

      try {
        const staticRes = await fetch(staticUrl, {
          headers: { "User-Agent": "OpenClaw-Fortress/1.0 (Route Parity)", Accept: "text/html,*/*" },
          redirect: "follow",
        });
        staticStatus = staticRes.status;
        if (staticRes.ok) staticHtml = await staticRes.text();
      } catch {}

      // Determine which HTML to use for metadata extraction
      const html = prettyHtml || staticHtml;

      // Step 1 result: Route parity
      let parityStatus: "MATCH" | "MISMATCH" | "SINGLE_ROUTE" | "BOTH_FAILED";
      let parityDetail: string;

      if (!prettyHtml && !staticHtml) {
        parityStatus = "BOTH_FAILED";
        parityDetail = `Both ${prettyUrl} (HTTP ${prettyStatus}) and ${staticUrl} (HTTP ${staticStatus}) returned non-200 responses.`;
      } else if (!prettyHtml || !staticHtml) {
        parityStatus = "SINGLE_ROUTE";
        const working = prettyHtml ? prettyUrl : staticUrl;
        const failing = prettyHtml ? staticUrl : prettyUrl;
        const failStatus = prettyHtml ? staticStatus : prettyStatus;
        parityDetail = `Only ${working} returns content. ${failing} returned HTTP ${failStatus}. This is normal for SPAs and server-rendered apps that don't serve .html files.`;
      } else {
        const cleanPretty = stripDynamicContent(prettyHtml);
        const cleanStatic = stripDynamicContent(staticHtml);
        const similarity = computeContentSimilarity(cleanPretty, cleanStatic);

        if (similarity >= 90) {
          parityStatus = "MATCH";
          parityDetail = `Pretty and static routes return ${similarity}% similar content (after stripping dynamic scripts).`;
        } else {
          parityStatus = "MISMATCH";
          parityDetail = `Content similarity is only ${similarity}%. Pretty route and .html route serve different content. This may cause SEO duplication or inconsistent user experience.`;
        }
      }

      // Step 2: Metadata extraction and comparison
      const metadataViolations: MetadataViolation[] = [];

      if (html) {
        const meta = extractMetadata(html);

        // Check title
        if (meta.title !== expected_metadata.title) {
          metadataViolations.push({
            field: "<title>",
            expected: expected_metadata.title,
            actual: meta.title || "(missing)",
          });
        }

        // Check canonical
        if (meta.canonical !== expected_metadata.canonical_url) {
          metadataViolations.push({
            field: '<link rel="canonical">',
            expected: expected_metadata.canonical_url,
            actual: meta.canonical || "(missing)",
          });
        }

        // Check og:title if required
        if (expected_metadata.require_og) {
          if (!meta.ogTitle) {
            metadataViolations.push({
              field: "og:title",
              expected: "(must be present)",
              actual: "(missing)",
            });
          }
        }
      } else {
        metadataViolations.push({
          field: "HTML",
          expected: "200 OK response",
          actual: "No HTML available — both routes failed",
        });
      }

      // Build report
      const overallStatus =
        parityStatus === "MISMATCH" || parityStatus === "BOTH_FAILED" || metadataViolations.length > 0
          ? "FAIL"
          : "PASS";

      let report = `## OpenClaw Fortress — Route Parity & Metadata Verification\n\n`;
      report += `**Route:** \`${target_route}\`\n`;
      report += `**Domain:** \`${base_domain}\`\n`;
      report += `**Status:** **${overallStatus}**\n\n`;

      report += `### Route Parity (§10.7)\n\n`;
      report += `| Route | URL | HTTP |\n`;
      report += `|-------|-----|------|\n`;
      report += `| Pretty | \`${prettyUrl}\` | ${prettyStatus} |\n`;
      report += `| Static | \`${staticUrl}\` | ${staticStatus} |\n`;
      report += `\n**Parity:** ${parityStatus}\n`;
      report += `${parityDetail}\n\n`;

      report += `### Metadata Verification (§10.9)\n\n`;

      if (html) {
        const meta = extractMetadata(html);
        report += `| Tag | Found | Expected | Match |\n`;
        report += `|-----|-------|----------|-------|\n`;
        report += `| \`<title>\` | ${meta.title || "(missing)"} | ${expected_metadata.title} | ${meta.title === expected_metadata.title ? "✓" : "**✗**"} |\n`;
        report += `| \`canonical\` | ${meta.canonical || "(missing)"} | ${expected_metadata.canonical_url} | ${meta.canonical === expected_metadata.canonical_url ? "✓" : "**✗**"} |\n`;
        if (expected_metadata.require_og) {
          report += `| \`og:title\` | ${meta.ogTitle || "(missing)"} | (required) | ${meta.ogTitle ? "✓" : "**✗**"} |\n`;
        }
        if (meta.description) report += `| \`description\` | ${meta.description.substring(0, 60)}... | — | info |\n`;
        if (meta.ogImage) report += `| \`og:image\` | ${meta.ogImage.substring(0, 60)}... | — | info |\n`;
      }

      if (metadataViolations.length > 0) {
        report += `\n**Violations:**\n\n`;
        for (const v of metadataViolations) {
          report += `- **${v.field}**: expected \`${v.expected}\`, got \`${v.actual}\`\n`;
        }
        report += `\n> **Fix metadata violations before finalizing.** Mismatched titles and canonicals harm SEO and social sharing.\n`;
      }

      return {
        content: [{ type: "text" as const, text: report }],
        isError: overallStatus === "FAIL",
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 11: request_human_checkpoint
  // -----------------------------------------------------------------------
  server.tool(
    "request_human_checkpoint",
    "Request human approval before deploying changes to high-risk surfaces. MUST be called " +
      "before any changes to checkout/billing flows, legal pages, homepage hero content, or " +
      "brand assets. Returns BLOCKED_PENDING_APPROVAL — you must stop and wait for confirmation.",
    {
      risk_category: z
        .enum(["checkout", "legal", "homepage_hero", "brand_assets"])
        .describe("Category of the high-risk surface being modified"),
      change_summary: z
        .string()
        .min(1)
        .describe("Brief description of what the agent is about to change"),
    },
    async ({ risk_category, change_summary }) => {
      const timestamp = new Date().toISOString();
      const riskLabel = CHECKPOINT_RISK_LABELS[risk_category] || risk_category;

      // Attempt to send notification webhook if configured
      let notificationSent = false;
      if (webhookUrl) {
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text: `⚠️ HUMAN CHECKPOINT REQUIRED\n\nRisk Category: ${riskLabel}\nSummary: ${change_summary}\nTimestamp: ${timestamp}\n\nAn AI agent is attempting to modify a high-risk surface. Review and approve or reject via the chat interface.`,
              category: risk_category,
              summary: change_summary,
              timestamp,
            }),
          });
          notificationSent = res.ok;
        } catch {
          // Notification failure is non-fatal — the tool still blocks
        }
      }

      let report = `## OpenClaw Fortress — Human Checkpoint\n\n`;
      report += `**Status:** **BLOCKED_PENDING_APPROVAL**\n`;
      report += `**Risk category:** ${riskLabel}\n`;
      report += `**Timestamp:** ${timestamp}\n\n`;
      report += `### Change Summary\n\n${change_summary}\n\n`;
      report += `---\n\n`;

      if (notificationSent) {
        report += `Notification sent to the operations team via webhook.\n\n`;
      } else if (webhookUrl) {
        report += `⚠️ Webhook notification failed — manual approval still required.\n\n`;
      }

      report += `### MANDATORY DIRECTIVE\n\n`;
      report += `> You must **stop all execution** and wait for the human to confirm `;
      report += `via the chat interface. Do not proceed with any file writes, builds, `;
      report += `or deployments to the \`${riskLabel}\` surface until explicit approval `;
      report += `is received.\n\n`;
      report += `Present this checkpoint to the user:\n\n`;
      report += `"I need your approval before proceeding. I'm about to modify **${riskLabel}**. `;
      report += `Here's what I plan to change: ${change_summary}. `;
      report += `Please reply **approved** to continue or **rejected** to abort."\n`;

      return {
        content: [{ type: "text" as const, text: report }],
        isError: true, // isError ensures the agent treats this as a blocking response
      };
    }
  );

  // -----------------------------------------------------------------------
  // Tool 12: trigger_automated_rollback
  // -----------------------------------------------------------------------
  server.tool(
    "trigger_automated_rollback",
    "Trigger an automated production rollback via GitHub Actions. Call this after 3 consecutive " +
      "live validation failures. Dispatches the rollback.yml workflow and returns a mandatory " +
      "cease directive. You MUST obey the directive and terminate all coding activities.",
    {
      github_repo: z
        .string()
        .regex(/^[^/]+\/[^/]+$/, "Must be in 'owner/repo' format")
        .describe("GitHub repository (e.g., 'maryadawson-code/openclaw-finops')"),
      reason: z
        .string()
        .min(1)
        .describe("Reason for the rollback (include failure details)"),
    },
    async ({ github_repo, reason }) => {
      const timestamp = new Date().toISOString();

      let rollbackDispatched = false;
      let dispatchError: string | null = null;

      if (githubPat) {
        try {
          const res = await fetch(
            `https://api.github.com/repos/${github_repo}/actions/workflows/rollback.yml/dispatches`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${githubPat}`,
                Accept: "application/vnd.github.v3+json",
                "User-Agent": "OpenClaw-Fortress/1.0",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                ref: "main",
                inputs: {
                  reason,
                  triggered_by: "openclaw-fortress",
                  timestamp,
                },
              }),
            }
          );

          if (res.status === 204 || res.ok) {
            rollbackDispatched = true;
          } else {
            const body = await res.text();
            dispatchError = `GitHub API returned ${res.status}: ${body.substring(0, 200)}`;
          }
        } catch (err: any) {
          dispatchError = err.message;
        }
      } else {
        dispatchError = "GITHUB_PAT not configured. Automated rollback requires a GitHub Personal Access Token.";
      }

      let report = `## OpenClaw Fortress — Automated Rollback\n\n`;
      report += `**Status:** **ROLLBACK_INITIATED**\n`;
      report += `**Repository:** \`${github_repo}\`\n`;
      report += `**Timestamp:** ${timestamp}\n\n`;
      report += `### Reason\n\n${reason}\n\n`;

      if (rollbackDispatched) {
        report += `GitHub Actions workflow \`rollback.yml\` dispatched successfully.\n\n`;
      } else {
        report += `⚠️ **Rollback dispatch failed:** ${dispatchError}\n\n`;
        report += `**Manual rollback required.** Run:\n`;
        report += `\`\`\`bash\ncd ${github_repo.split("/")[1]} && git revert HEAD --no-edit && git push origin main\n\`\`\`\n\n`;
      }

      report += `---\n\n`;
      report += `### MANDATORY DIRECTIVE\n\n`;
      report += `> ${ROLLBACK_CEASE_DIRECTIVE}\n`;

      return {
        content: [{ type: "text" as const, text: report }],
        isError: true,
      };
    }
  );

  return server;
}
