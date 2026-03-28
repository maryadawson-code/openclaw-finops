export type CloudProvider = 'AWS' | 'GCP' | 'AZURE' | 'LAMBDA_LABS' | 'COREWEAVE' | 'VAST_AI';

export interface PricingEntry {
  service_name: string;
  hourly_rate_usd: number;
  monthly_rate_usd: number; // Based on 730 hours/month
  category: 'Compute' | 'Database' | 'Storage' | 'Cache' | 'GPU';
}

export const PRICING_MATRIX: Record<CloudProvider, Record<string, PricingEntry>> = {
  AWS: {
    't3.micro': { service_name: 't3.micro', hourly_rate_usd: 0.0104, monthly_rate_usd: 7.59, category: 'Compute' },
    't3.medium': { service_name: 't3.medium', hourly_rate_usd: 0.0416, monthly_rate_usd: 30.36, category: 'Compute' },
    'm5.large': { service_name: 'm5.large', hourly_rate_usd: 0.096, monthly_rate_usd: 70.08, category: 'Compute' },
    'p5.48xlarge': { service_name: 'p5.48xlarge (8x H100 SXM)', hourly_rate_usd: 3.93, monthly_rate_usd: 2868.90, category: 'GPU' },
    'rds.postgres.db.t3.micro': { service_name: 'rds.postgres.db.t3.micro', hourly_rate_usd: 0.018, monthly_rate_usd: 13.14, category: 'Database' },
    'rds.postgres.db.m5.large': { service_name: 'rds.postgres.db.m5.large', hourly_rate_usd: 0.28, monthly_rate_usd: 204.40, category: 'Database' },
    'elasticache.redis.t3.micro': { service_name: 'elasticache.redis.t3.micro', hourly_rate_usd: 0.016, monthly_rate_usd: 11.68, category: 'Cache' },
    's3.standard.1tb': { service_name: 's3.standard.1tb', hourly_rate_usd: 0.0315, monthly_rate_usd: 23.00, category: 'Storage' },
  },
  GCP: {
    'e2-micro': { service_name: 'e2-micro', hourly_rate_usd: 0.0084, monthly_rate_usd: 6.13, category: 'Compute' },
    'e2-medium': { service_name: 'e2-medium', hourly_rate_usd: 0.0336, monthly_rate_usd: 24.52, category: 'Compute' },
    'n2-standard-2': { service_name: 'n2-standard-2', hourly_rate_usd: 0.097, monthly_rate_usd: 70.81, category: 'Compute' },
    'a3-highgpu-8g': { service_name: 'a3-highgpu-8g (8x H100)', hourly_rate_usd: 13.50, monthly_rate_usd: 9855.00, category: 'GPU' },
    'cloudsql.postgres.db-custom-1-3840': { service_name: 'cloudsql.postgres.db-custom-1-3840', hourly_rate_usd: 0.05, monthly_rate_usd: 36.50, category: 'Database' },
    'cloudsql.postgres.db-custom-4-15360': { service_name: 'cloudsql.postgres.db-custom-4-15360', hourly_rate_usd: 0.20, monthly_rate_usd: 146.00, category: 'Database' },
    'memorystore.redis.1gb': { service_name: 'memorystore.redis.1gb', hourly_rate_usd: 0.049, monthly_rate_usd: 35.77, category: 'Cache' },
  },
  AZURE: {
    'B1s': { service_name: 'B1s', hourly_rate_usd: 0.0104, monthly_rate_usd: 7.59, category: 'Compute' },
    'B2s': { service_name: 'B2s', hourly_rate_usd: 0.0416, monthly_rate_usd: 30.36, category: 'Compute' },
    'D2s_v3': { service_name: 'D2s_v3', hourly_rate_usd: 0.096, monthly_rate_usd: 70.08, category: 'Compute' },
    'nd-h100-v5': { service_name: 'ND H100 v5', hourly_rate_usd: 6.98, monthly_rate_usd: 5095.40, category: 'GPU' },
    'postgresql.flexible.b1ms': { service_name: 'postgresql.flexible.b1ms', hourly_rate_usd: 0.026, monthly_rate_usd: 18.98, category: 'Database' },
  },
  LAMBDA_LABS: {
    'h100-pcie': { service_name: 'H100 PCIe (1x GPU)', hourly_rate_usd: 2.49, monthly_rate_usd: 1817.70, category: 'GPU' },
    'h100-sxm': { service_name: 'H100 SXM (1x GPU)', hourly_rate_usd: 2.99, monthly_rate_usd: 2182.70, category: 'GPU' },
  },
  COREWEAVE: {
    'h100-hgx': { service_name: 'H100 HGX Node (per-GPU normalized)', hourly_rate_usd: 6.16, monthly_rate_usd: 4496.80, category: 'GPU' },
  },
  VAST_AI: {
    'h100-marketplace': { service_name: 'H100 Marketplace Avg (1x GPU)', hourly_rate_usd: 1.85, monthly_rate_usd: 1350.50, category: 'GPU' },
  },
};

// Provider enum for the MCP tool schema
const SUPPORTED_PROVIDERS = Object.keys(PRICING_MATRIX) as CloudProvider[];

/**
 * Utility function to calculate the cost of a requested deployment.
 */
export function calculateForecast(provider: CloudProvider, services: { service_name: string, estimated_usage_hours: number }[]) {
  const providerPricing = PRICING_MATRIX[provider];
  if (!providerPricing) throw new Error(`Provider ${provider} not supported. Available: ${SUPPORTED_PROVIDERS.join(', ')}`);

  let totalMonthlyCost = 0;
  const lineItems = services.map(req => {
    const rateData = providerPricing[req.service_name];
    if (!rateData) {
      return { service: req.service_name, cost: 0, error: `Pricing data not found. Available for ${provider}: ${Object.keys(providerPricing).join(', ')}` };
    }

    // Calculate cost based on hours provided, or default to standard 730 hr month
    const hours = req.estimated_usage_hours || 730;
    const cost = rateData.hourly_rate_usd * hours;
    totalMonthlyCost += cost;

    return {
      service: rateData.service_name,
      category: rateData.category,
      hours_calculated: hours,
      estimated_cost_usd: Number(cost.toFixed(2))
    };
  });

  return {
    provider,
    total_estimated_monthly_cost_usd: Number(totalMonthlyCost.toFixed(2)),
    line_items: lineItems
  };
}
