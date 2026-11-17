export interface Stats {
  requests: number;
  cost_usd: number | string;
  total_tokens: number;
  cache?: {
    prompt_tokens: number;
    cached_input_tokens: number;
    hit_ratio: number;
    savings_usd: number | string;
    semantic_hits?: number;
  };
  latency_ms?: { p50: number; p95: number; p99: number };
  fallback_requests?: number;
  by_model?: { model: string; requests: number; tokens: number; cost_usd: number }[];
  by_provider?: Record<string, { requests: number; cost_usd: number }>;
}

export interface ProviderRow {
  id: number;
  slug: string;
  display_name: string;
  type: string;
  base_url: string;
  api_version?: string | null;
  enabled: boolean;
  circuit_state: string;
  circuit_retry_after_seconds?: number;
  credential_hint?: string;
}

export interface RouteRow {
  id: number;
  public_model_id: string;
  provider: string;
  upstream_model_id: string;
  priority: number;
  strategy: string;
  enabled: boolean;
  cache_enabled: boolean;
  semantic_cache_enabled?: boolean;
  ewma_latency_ms?: number | null;
  ewma_error_rate?: number;
  input_price_per_million?: number | string;
  output_price_per_million?: number | string;
}

export interface KeyRow {
  id: number;
  name: string;
  prefix?: string;
  enabled: boolean;
  credit_limit_usd?: number | string | null;
  used_usd?: number | string;
  daily_limit_usd?: number | string | null;
  monthly_limit_usd?: number | string | null;
  end_user_daily_limit_usd?: number | string | null;
  rpm_limit?: number;
  last_used_at?: string | null;
}

export interface UsageRow {
  id: number;
  at: string;
  key_name: string;
  model: string;
  provider: string;
  status: string;
  cost_usd: number | string;
  total_tokens: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cached_input_tokens?: number;
  cached_savings_usd?: number | string;
  latency_ms: number;
  end_user?: string | null;
  error_code?: string | null;
  error_message?: string | null;
  upstream_request_id?: string | null;
  attempts?: number;
  fallback_from?: string | null;
}
