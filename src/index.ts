/// <reference path="../worker-configuration.d.ts" />

// Set up node polyfills first
import 'reflect-metadata';

// Import OpenAuth core
import { issuer } from '@openauthjs/openauth';
import { PasswordProvider } from '@openauthjs/openauth/provider/password';
import { PasswordUI } from '@openauthjs/openauth/ui/password';
import { GithubProvider } from '@openauthjs/openauth/provider/github';

// Import local modules
import { subjects } from './subjects.js';
import { createStorage } from './storage.js';
import type { Env, ExecutionContext } from './types/env.js';
import { Hono } from 'hono';
import debugApp from './debug.js';

/**
 * Main worker export
 * 
 * This is the entry point for all requests to the OpenAuth worker.
 */
const worker = {
  /**
   * Main fetch handler for the worker
   * 
   * @param request - The incoming request
   * @param env - Environment variables and bindings
   * @param ctx - Execution context
   * @returns Response to the request
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Create the OpenAuth issuer instance FIRST
    const issuerApp = issuer({
      // Configure authentication providers
      providers: {
        // GitHub OAuth provider
        github: GithubProvider({
          clientID: process.env.GITHUB_CLIENT_ID || 'placeholder-id',
          clientSecret: process.env.GITHUB_CLIENT_SECRET || 'placeholder-secret',
          scopes: ['user:email'],
        }),
        
        // Username/password provider with builtin UI
        password: PasswordProvider(
          PasswordUI({
            sendCode: async (email, code) => {
              console.log(`[OpenAuth] Code for ${email}: ${code}`);
              // In a real implementation, you would send this via email
            },
          }),
        ),
      },
      
      // Define JWT subject schemas
      subjects,
      
      // Configure storage adapter
      storage: createStorage(env),
      
      // Handle successful authentication
      async success(ctx, value) {
        // --- USER IMPLEMENTATION REQUIRED --- 
        // This is where you call your backend service (bound as BACKEND_SERVICE)
        // to find or create the user based on the provider details (`value`)
        // and return the necessary identifiers for the JWT subject.

        // 1. Access the backend service binding directly from the outer scope's 'env':
        const backendService = env.BACKEND_SERVICE; 
        if (!backendService) {
          console.error('[OpenAuth] BACKEND_SERVICE binding is not configured or accessible!');
          return new Response('Internal server configuration error', { status: 500 });
        }

        // 2. Define the expected API endpoint on your backend service:
        const findOrCreateEndpoint = '/internal/auth/find-or-create'; // Example path

        // 3. Prepare the request to your backend service:
        const backendRequest = new Request(new URL(findOrCreateEndpoint, 'http://backend.service'), { 
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(value), 
        });

        try {
          // 4. Call your backend service:
          const backendResponse = await backendService.fetch(backendRequest);
          
          if (!backendResponse.ok) {
            const errorText = await backendResponse.text();
            console.error(`[OpenAuth] Backend service error (${backendResponse.status}): ${errorText}`);
            return new Response('Failed to authenticate with backend service', { status: 500 });
          }

          // 5. Parse the response from your backend service:
          const userData = await backendResponse.json<{ userId: string; workspaceId: string }>();
          
          // 6. Create the JWT subject using data from your backend:
          console.log(`[OpenAuth] User authenticated via backend: ${JSON.stringify(userData)}`);
          return ctx.subject('user', {
            userId: userData.userId,
            workspaceId: userData.workspaceId,
          });

        } catch (error) {
           console.error('[OpenAuth] Error calling BACKEND_SERVICE:', error);
           return new Response('Internal communication error', { status: 500 });
        }

        /* --- Placeholder Implementation (Remove or Replace) ---
        // ... (placeholder remains commented out) ...
        */
      }
    });

    // Create a new Hono app for custom routing, providing Env type
    const app = new Hono<{ Bindings: Env }>();

    // Define specific handlers FIRST
    // Redirect root to authorize endpoint
    app.get('/', (c) => {
      const backendCallbackUrl = 'http://localhost:8787/api/auth/callback';
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: 'test-client', // Use actual client ID
        redirect_uri: backendCallbackUrl,
        scope: 'openid',
      });
      const authorizeUrl = `/authorize?${params.toString()}`;
      console.log(`[OpenAuth] Redirecting / to ${authorizeUrl}`);
      return c.redirect(authorizeUrl, 302);
    });

    // --- Mount Debug Routes ---
    app.route('/internal', debugApp);

    // Mount the OpenAuth issuer app LAST to handle remaining auth routes
    app.route('/', issuerApp);

    // Handle the request using the main app (which includes the fallback)
    return app.fetch(request, env, ctx);
  }
};

export default worker; 