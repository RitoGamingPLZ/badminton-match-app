/**
 * Application-wide constants and configuration.
 *
 * Centralises values that are referenced in multiple modules so they
 * are changed in one place.
 */

export const MAX_UNDO               = 10;
export const MAX_LOG                = 50;
export const MAX_PLAYER_NAME_LENGTH = 50;

/** Progressive backoff delays (ms) for optimistic-concurrency conflict retries. */
export const TRANSACTION_DELAYS_MS  = [300, 600, 900];

// ── CORS ──────────────────────────────────────────────────────────────────────

export const corsHeaders = {
  'Access-Control-Allow-Origin':  process.env.ALLOWED_ORIGIN || '*',
  'Access-Control-Allow-Headers': 'Content-Type, X-Host-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};
