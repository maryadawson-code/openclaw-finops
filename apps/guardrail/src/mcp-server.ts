import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Rule definitions: each rule has a pattern, severity, and recommendation
// ---------------------------------------------------------------------------

type Severity = "CRITICAL" | "HIGH" | "MEDIUM";
type Category = "Security" | "Ghost Cost";

interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  name: string;
  description: string;
  patterns: RegExp[];
  recommendation: string;
}

const RULES: Rule[] = [
  // === Security Rules ===
  {
    id: "SEC-001",
    category: "Security",
    severity: "CRITICAL",
    name: "Public S3 Bucket",
    description: "S3 bucket configured with public read or public read-write ACL.",
    patterns: [
      /acl\s*[:=]\s*["']?public-read/i,
      /acl\s*[:=]\s*["']?public-read-write/i,
      /block_public_acls\s*[:=]\s*false/i,
      /block_public_policy\s*[:=]\s*false/i,
      /restrict_public_buckets\s*[:=]\s*false/i,
    ],
    recommendation:
      "Set ACL to 'private' and enable S3 Block Public Access. Use CloudFront or presigned URLs for controlled access.",
  },
  {
    id: "SEC-002",
    category: "Security",
    severity: "CRITICAL",
    name: "Open SSH Port (0.0.0.0/0)",
    description: "Security group allows SSH (port 22) from any IP address.",
    patterns: [
      /from_port\s*[:=]\s*22[\s\S]{0,100}cidr_blocks\s*[:=]\s*\[?\s*["']0\.0\.0\.0\/0["']/i,
      /port\s*[:=]\s*["']?22["']?[\s\S]{0,100}0\.0\.0\.0\/0/i,
      /ingress[\s\S]{0,200}22[\s\S]{0,100}0\.0\.0\.0\/0/i,
    ],
    recommendation:
      "Restrict SSH access to known IPs or use a bastion host / SSM Session Manager. Never expose port 22 to 0.0.0.0/0.",
  },
  {
    id: "SEC-003",
    category: "Security",
    severity: "CRITICAL",
    name: "Open RDP Port (0.0.0.0/0)",
    description: "Security group allows RDP (port 3389) from any IP address.",
    patterns: [
      /from_port\s*[:=]\s*3389[\s\S]{0,100}cidr_blocks\s*[:=]\s*\[?\s*["']0\.0\.0\.0\/0["']/i,
      /port\s*[:=]\s*["']?3389["']?[\s\S]{0,100}0\.0\.0\.0\/0/i,
      /ingress[\s\S]{0,200}3389[\s\S]{0,100}0\.0\.0\.0\/0/i,
    ],
    recommendation:
      "Restrict RDP to VPN or known management IPs. Use Azure Bastion or AWS SSM for Windows access.",
  },
  {
    id: "SEC-004",
    category: "Security",
    severity: "HIGH",
    name: "Unencrypted Database",
    description: "Database instance configured without encryption at rest.",
    patterns: [
      /storage_encrypted\s*[:=]\s*false/i,
      /encrypted\s*[:=]\s*false/i,
      /kms_key_id\s*[:=]\s*["']?\s*["']?\s*$/im,
      /encryption_configuration\s*\{\s*\}/i,
    ],
    recommendation:
      "Enable encryption at rest with a KMS key. Use aws_db_instance.storage_encrypted = true or equivalent.",
  },
  {
    id: "SEC-005",
    category: "Security",
    severity: "HIGH",
    name: "Wildcard IAM Policy",
    description: "IAM policy grants * (all actions) on * (all resources).",
    patterns: [
      /"Action"\s*:\s*"\*"[\s\S]{0,100}"Resource"\s*:\s*"\*"/i,
      /actions\s*[:=]\s*\[?\s*["']\*["']/i,
      /Effect.*Allow[\s\S]{0,100}Action.*\*[\s\S]{0,100}Resource.*\*/i,
    ],
    recommendation:
      "Follow least-privilege principle. Scope actions and resources to the minimum required.",
  },
  {
    id: "SEC-006",
    category: "Security",
    severity: "HIGH",
    name: "Open All Ports (0.0.0.0/0)",
    description: "Security group allows all traffic from any IP.",
    patterns: [
      /from_port\s*[:=]\s*0[\s\S]{0,50}to_port\s*[:=]\s*65535[\s\S]{0,100}0\.0\.0\.0\/0/i,
      /protocol\s*[:=]\s*["']-1["'][\s\S]{0,100}0\.0\.0\.0\/0/i,
    ],
    recommendation:
      "Never open all ports to the internet. Define specific ingress rules per service.",
  },

  // === Ghost Cost Rules ===
  {
    id: "COST-001",
    category: "Ghost Cost",
    severity: "HIGH",
    name: "NAT Gateway (potential idle cost)",
    description:
      "NAT Gateway detected. Costs $32+/month even with zero traffic. Verify it's needed.",
    patterns: [
      /aws_nat_gateway/i,
      /resource\s*["'].*nat.*gateway/i,
      /google_compute_router_nat/i,
    ],
    recommendation:
      "Confirm workloads require outbound internet from private subnets. Consider VPC endpoints for AWS services instead. Each NAT Gateway costs ~$32/month + data processing fees.",
  },
  {
    id: "COST-002",
    category: "Ghost Cost",
    severity: "MEDIUM",
    name: "Unattached Elastic IP",
    description:
      "Elastic IP allocated but not associated with a running instance costs $3.60/month.",
    patterns: [
      /aws_eip\b(?![\s\S]{0,200}instance)/i,
      /google_compute_address(?![\s\S]{0,200}network_interface)/i,
    ],
    recommendation:
      "Associate the EIP with an instance or release it. Unattached EIPs incur hourly charges.",
  },
  {
    id: "COST-003",
    category: "Ghost Cost",
    severity: "HIGH",
    name: "Oversized Instance for Workload",
    description:
      "metal/xlarge instance types detected. These are expensive and often oversized for typical workloads.",
    patterns: [
      /instance_type\s*[:=]\s*["'].*\.metal["']/i,
      /instance_type\s*[:=]\s*["'].*\.(8|12|16|24)xlarge["']/i,
      /machine_type\s*[:=]\s*["'].*n2-highmem-64["']/i,
      /machine_type\s*[:=]\s*["'].*n2-standard-(32|48|64|96)["']/i,
    ],
    recommendation:
      "Right-size the instance. m5.metal costs ~$4,608/month. Run load tests to determine actual resource needs before provisioning.",
  },
  {
    id: "COST-004",
    category: "Ghost Cost",
    severity: "MEDIUM",
    name: "No Auto-Scaling Configured",
    description:
      "Fixed-size compute without auto-scaling may overpay during low-traffic periods.",
    patterns: [
      /desired_capacity\s*[:=]\s*\d+(?![\s\S]{0,500}aws_autoscaling_policy)/i,
    ],
    recommendation:
      "Add auto-scaling policies with target tracking to scale down during off-peak hours.",
  },
];

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

interface Finding {
  rule_id: string;
  severity: Severity;
  category: Category;
  name: string;
  description: string;
  line_hint: number | null;
  recommendation: string;
}

function scanCode(code: string): Finding[] {
  const findings: Finding[] = [];
  const lines = code.split("\n");

  for (const rule of RULES) {
    for (const pattern of rule.patterns) {
      const match = pattern.exec(code);
      if (match) {
        // Find approximate line number
        let lineNum: number | null = null;
        if (match.index !== undefined) {
          const before = code.substring(0, match.index);
          lineNum = before.split("\n").length;
        }

        findings.push({
          rule_id: rule.id,
          severity: rule.severity,
          category: rule.category,
          name: rule.name,
          description: rule.description,
          line_hint: lineNum,
          recommendation: rule.recommendation,
        });
        break; // One finding per rule per scan
      }
    }
  }

  // Sort: CRITICAL first, then HIGH, then MEDIUM
  const order: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity]);

  return findings;
}

function formatAuditReport(
  findings: Finding[],
  provider: string,
  format: string
): string {
  const critical = findings.filter((f) => f.severity === "CRITICAL").length;
  const high = findings.filter((f) => f.severity === "HIGH").length;
  const medium = findings.filter((f) => f.severity === "MEDIUM").length;

  let report = `## IntegrityPulse Guardrail — Infrastructure Audit\n\n`;
  report += `**Provider:** ${provider} | **Format:** ${format}\n`;

  if (findings.length === 0) {
    report += `\n**Result: PASS** — No high-risk patterns detected.\n`;
    report += `\nNote: This is a static pattern scan, not a runtime analysis. `;
    report += `Always perform a full security review before deploying to production.\n`;
    return report;
  }

  report += `**Findings:** ${findings.length} `;
  report += `(${critical} Critical, ${high} High, ${medium} Medium)\n\n`;

  if (critical > 0) {
    report += `> **DEPLOYMENT BLOCKED** — ${critical} critical issue(s) must be resolved before deploying.\n\n`;
  }

  report += `| # | Severity | Category | Rule | Finding |\n`;
  report += `|---|----------|----------|------|---------|\n`;

  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const lineInfo = f.line_hint ? ` (line ~${f.line_hint})` : "";
    report += `| ${i + 1} | **${f.severity}** | ${f.category} | ${f.rule_id} | ${f.name}${lineInfo} |\n`;
  }

  report += `\n### Remediation\n\n`;

  for (const f of findings) {
    report += `#### ${f.rule_id}: ${f.name} (${f.severity})\n`;
    report += `${f.description}\n\n`;
    report += `**Fix:** ${f.recommendation}\n\n`;
  }

  return report;
}

// ---------------------------------------------------------------------------
// MCP Server
// ---------------------------------------------------------------------------

export function createGuardrailServer(): McpServer {
  const server = new McpServer({
    name: "openclaw-guardrail",
    version: "1.0.0",
    instructions:
      "You are connected to IntegrityPulse Guardrail, an infrastructure security scanner. " +
      "When a user writes or reviews Terraform, CloudFormation, Pulumi, or any infrastructure-as-code, " +
      "you SHOULD call audit_infrastructure_code to scan for security vulnerabilities and ghost costs " +
      "before the code is deployed. Always run Guardrail before suggesting 'terraform apply'.",
  });

  server.tool(
    "audit_infrastructure_code",
    "Scan infrastructure-as-code for security vulnerabilities (public buckets, open ports, " +
      "unencrypted databases, wildcard IAM) and ghost costs (idle NAT gateways, oversized instances, " +
      "unattached IPs). Run this before every deployment.",
    {
      code_content: z
        .string()
        .min(1)
        .describe("The infrastructure code to audit (Terraform HCL, CloudFormation YAML, etc.)"),
      provider: z
        .enum(["AWS", "GCP", "AZURE"])
        .describe("Cloud provider context"),
      format: z
        .enum(["HCL", "YAML", "JSON"])
        .describe("Code format (HCL for Terraform, YAML for CloudFormation/Kubernetes, JSON for ARM)"),
    },
    async ({ code_content, provider, format }) => {
      const findings = scanCode(code_content);
      const report = formatAuditReport(findings, provider, format);

      return {
        content: [{ type: "text" as const, text: report }],
        isError: findings.some((f) => f.severity === "CRITICAL"),
      };
    }
  );

  return server;
}
