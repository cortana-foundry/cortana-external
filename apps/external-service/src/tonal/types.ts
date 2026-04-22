import type { ProviderAuthAlertState } from "../lib/authalert.js";

export interface TonalTokenData {
  id_token: string;
  refresh_token?: string;
  expires_at: string;
}

export interface StrengthScoreData {
  current: Array<Record<string, unknown>>;
  history: Array<Record<string, unknown>>;
}

export interface TonalCacheData {
  user_id: string;
  profile: Record<string, unknown>;
  workouts: Record<string, Record<string, unknown>>;
  strength_scores: StrengthScoreData | null;
  last_updated: string;
}

export interface TonalDataResponse {
  profile: Record<string, unknown>;
  workouts: Record<string, Record<string, unknown>>;
  workout_count: number;
  strength_scores: StrengthScoreData | null;
  last_updated: string;
}

export interface TonalHealthResponse extends Record<string, unknown> {
  status: "healthy" | "unhealthy";
  authenticated: boolean;
  user_id?: string;
  expires_at: string | null;
  expires_in_seconds: number | null;
  is_expired: boolean;
  needs_refresh: boolean;
  refresh_token_present: boolean;
  error?: string;
  details?: string;
  auth_alert: ProviderAuthAlertState;
}
