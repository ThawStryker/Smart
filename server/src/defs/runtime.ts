// Typed runtime input keys for app code.
// VarKey and SecretKey are string literal union types, not values or config storage.
// Add a key here before using vars.get("KEY") or secret.get("KEY") in code.
// Values still come from .env.local in local dev and remote vars/secrets in deployed envs.

export type VarKey =
  | "DEEPSEEK_BASE_URL"
  | "SEED_BASE_URL"
  | "SEED_LITE_BASE_URL"
  | "SEED_PRO_BASE_URL";

export type SecretKey =
  | "DEEPSEEK_API_KEY"
  | "SEED_API_KEY"
  | "SEED_LITE_API_KEY"
  | "SEED_PRO_API_KEY"
  | "ALIYUN_ACCESS_KEY_ID"
  | "ALIYUN_ACCESS_KEY_SECRET"
  | "DOMAIN_SYNC_API_KEY";
