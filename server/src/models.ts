import { vars, secret } from "edgespark";
import type { VarKey, SecretKey } from "@defs";

export interface ModelConfig {
  baseURL: string;
  apiPath: string;
  apiKey: string;
  modelName: string;
}

const _models: Record<string, { baseKey: VarKey; apiPath: string; secretKey: SecretKey; modelName: string; fallbackURL: string }> = {
  "deepseek-v4-pro": {
    baseKey: "DEEPSEEK_BASE_URL", apiPath: "/v1/chat/completions",
    secretKey: "DEEPSEEK_API_KEY", modelName: "deepseek-v4-pro",
    fallbackURL: "https://api.deepseek.com",
  },
};

export function getModel(key: string): ModelConfig | null {
  const def = _models[key];
  if (!def) return null;
  const baseURL = vars.get(def.baseKey) || def.fallbackURL;
  const apiKey = secret.get(def.secretKey);
  if (!apiKey) return null;
  return { baseURL, apiPath: def.apiPath, apiKey, modelName: def.modelName };
}

export const DEFAULTS = {
  agent: "deepseek-v4-pro",
  chat: "deepseek-v4-pro",
  coding: "deepseek-v4-pro",
};
