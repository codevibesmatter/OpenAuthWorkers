import { CloudflareStorage } from "@openauthjs/openauth/storage/cloudflare";
import type { Env } from "./types/env.js";

/**
 * Create CloudflareStorage adapter for OpenAuth
 * Uses Cloudflare KV for secure token and credential storage
 */
export const createStorage = (env: Env) => {
  return CloudflareStorage({
    namespace: env.AUTH_STORE as any,
  });
};