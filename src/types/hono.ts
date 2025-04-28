import type { Env, ExecutionContext } from './env.js';

/**
 * Hono app bindings for TypeScript type safety
 */
export interface AppBindings {
  Bindings: Env;
  Variables: {
    /**
     * Current request path
     */
    path: string;
    
    /**
     * User ID if authenticated
     */
    userId?: string;
    
    /**
     * Execution context for the worker
     */
    ctx: ExecutionContext;

    /**
     * Auth state for OAuth flow
     */
    authState?: string;
  };
} 