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
import type { AppBindings } from './types/hono.js';

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

      // Allow all origins in development
      allow: async () => true,
      
      // Handle successful authentication
      async success(ctx, value) {
        console.log('[OpenAuth] Entering success handler. Value:', JSON.stringify(value));
        
        // Access the backend service binding from env
        const backendService = env.BACKEND_SERVICE; 
        if (!backendService) {
          console.error('[OpenAuth] BACKEND_SERVICE binding is not configured or accessible!');
          return new Response('Internal server configuration error', { status: 500 });
        }

        try {
          // Construct the request to the backend service
          const backendUrl = '/internal/auth/find-or-create';
          const backendRequest = new Request(`http://internal${backendUrl}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(value),
          });

          // Call your backend service
          console.log(`[OpenAuth] Calling backend service at ${backendUrl} with auth data`);
          const backendResponse = await backendService.fetch(backendRequest);
          
          if (!backendResponse.ok) {
            console.error(`[OpenAuth] Backend service returned ${backendResponse.status}: ${await backendResponse.text()}`);
            return new Response('Error communicating with application backend', { 
              status: 500 
            });
          }

          // Parse the user data from the backend response
          const userData = await backendResponse.json() as { 
            userId: string; 
            workspaceId: string;
          };
          console.log('[OpenAuth] Received user data from backend:', JSON.stringify(userData));
          
          // Create the subject with the real user data
          const subject = {
            userId: userData.userId,
            workspaceId: userData.workspaceId
          };
          
          // Create the subject and get the response
          const response = await ctx.subject('user', subject);
          
          // Add CORS headers to the response
          response.headers.set('Access-Control-Allow-Origin', '*');
          response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
          response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
          
          return response;
        } catch (error) {
          console.error('[OpenAuth] Error in success handler:', error);
          
          // If anything fails, return a basic success response
          // with the user data - client can handle this specially
          return new Response(JSON.stringify({
            success: true,
            message: 'Authentication successful but could not create standard token',
            user: {
              userId: 'temp',
              workspaceId: 'temp'
            }
          }), { 
            status: 200, 
            headers: { 
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type'
            } 
          });
        }
      }
    });

    // Create a new Hono app for custom routing, providing Env type
    const app = new Hono<AppBindings>();

    // Define specific handlers FIRST
    // Redirect root to authorize endpoint
    app.get('/', (c) => {
      // Get the host from the request
      const host = c.req.header('host') || 'localhost:8787';
      const protocol = env.ENVIRONMENT === 'production' ? 'https' : 'http';
      
      // Make sure this URL matches your actual backend callback endpoint
      const backendCallbackUrl = `${protocol}://${host}/api/auth/callback`;
      
      // Build standard OAuth parameters
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: 'test-client', // Should match client ID expected by your backend
        redirect_uri: backendCallbackUrl,
        scope: 'openid',
        state: crypto.randomUUID() // Add a unique state parameter
      });
      
      const authorizeUrl = `/authorize?${params.toString()}`;
      console.log(`[OpenAuth] Redirecting / to ${authorizeUrl}`);
      return c.redirect(authorizeUrl, 302);
    });

    // Add OPTIONS handler for CORS preflight requests
    app.options('*', (c) => {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
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