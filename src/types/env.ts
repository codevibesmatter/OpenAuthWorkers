/// <reference types="@cloudflare/workers-types" />

/**
 * Environment variables and bindings
 */
export interface Env {
  /**
   * KV namespace for storing auth tokens and related data
   */
  AUTH_STORE: KVNamespace;
  
  /**
   * Service binding for the main server worker
   */
  USER_SERVICE: Fetcher;
  
  /**
   * Current environment (development or production)
   */
  ENVIRONMENT: 'development' | 'production';
  
  /**
   * Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
   */
  BACKEND_SERVICE: Service;
}

/**
 * Cloudflare Worker execution context
 */
export interface ExecutionContext {
  /**
   * Extend the lifetime of the worker to complete async tasks
   */
  waitUntil(promise: Promise<any>): void;
  
  /**
   * Continue executing the worker on uncaught exceptions
   */
  passThroughOnException(): void;
} 