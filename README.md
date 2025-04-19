# OpenAuth Worker Template

This Cloudflare Worker provides a self-hosted OpenAuth server based on the OAuth 2.0 specification. It handles user authentication via configured providers (Password, GitHub included) and issues JWT access/refresh tokens.

This worker is designed as a **template** to be **cloned** and **customized**. It is intended to work alongside your main **backend application worker**, delegating user lookup/creation logic to it via a Cloudflare **Service Binding**.

## Features

- **Standards-based**: Implements OAuth 2.0 Authorization Code flow.
- **Extensible Providers**: Comes with Password and GitHub providers configured. Easy to add more from `@openauthjs/openauth`.
- **Delegated User Logic**: Uses a service binding (`BACKEND_SERVICE`) to call your separate backend worker for application-specific user management.
- **Secure Storage**: Uses Cloudflare KV (`AUTH_STORE` binding) for storing refresh tokens, password hashes, etc.
- **Debug UI**: Includes an optional, protected debug interface (`/internal/list-auth-users`) for inspecting/managing KV data during development.

## Setup and Configuration

1.  **Clone the Repository:**
    ```bash
    git clone <repository-url> openauth-worker
    cd openauth-worker
    ```

2.  **Install Dependencies:**
    ```bash
    npm install 
    # or pnpm install, yarn install
    ```

3.  **Configure KV Namespace Binding:**
    *   Open `wrangler.toml` and ensure the `AUTH_STORE` KV namespace binding is defined. The default configuration is usually sufficient for local development.
    ```toml
    [[kv_namespaces]]
    binding = "AUTH_STORE"
    # For local dev, wrangler simulates this. No cloud resource needed yet.
    id = "preview"      # Placeholder for deployment
    preview_id = "preview" # Used by wrangler dev simulation
    ```
    *   **For Production Deployment:** You WILL need to create a KV namespace in your Cloudflare dashboard and update the `id` in the `[env.production]` section (or the main `[[kv_namespaces]]` section if not using environments) with your actual production KV namespace ID.

4.  **Configure Providers:**
    *   **GitHub:** If using GitHub login:
        *   Create a GitHub OAuth App.
        *   Set the Authorization callback URL to `https://<your-worker-url>/callback/github`.
        *   Create a `.dev.vars` file in this directory (and configure production secrets via Cloudflare dashboard):
          ```
          GITHUB_CLIENT_ID=your_github_client_id
          GITHUB_CLIENT_SECRET=your_github_client_secret
          ```
    *   **Password:** The password provider uses `console.log` for verification codes by default. Customize the `sendCode` function in `apps/openauth/src/index.ts` to send emails or use another method.

5.  **Configure Backend Service Binding:**
    *   This worker needs to communicate with your main backend worker.
    *   Open `wrangler.toml` and find the `[[services]]` section.
    *   **Manually edit** the `service` value to the **name of your backend worker**.
    ```toml
    [[services]]
    binding = "BACKEND_SERVICE"
    # IMPORTANT: Change "vibestack-server" below to your actual backend worker name
    service = "vibestack-server" 
    ```
    *   This name will be used for both local development (`wrangler dev`) and production deployment unless overridden.

6.  **Implement Backend API Endpoint:**
    *   Your backend worker (the one named in the `service` field above) **MUST** implement the following endpoint:
    *   **Endpoint:** `POST /internal/auth/find-or-create` (or update the path in `apps/openauth/src/index.ts`'s `success` handler)
    *   **Request Body:** JSON object containing the authentication result from the provider. Example:
        ```json
        // For GitHub:
        { 
          "provider": "github", 
          "profile": { /* GitHub user profile data */ },
          "accessToken": "...",
          "refreshToken": "..." // If applicable
        }
        // For Password:
        { "provider": "password", "email": "user@example.com" }
        ```
    *   **Response Body:** JSON object containing the application-specific identifiers needed for the JWT.
        ```json
        // Example Response:
        { 
          "userId": "your-app-user-id-123", 
          "workspaceId": "your-app-workspace-id-abc"
          // Add any other fields required for your 'user' subject
        }
        ```
    *   **Action:** This endpoint should look up the user based on the provider details (e.g., email, GitHub ID) or create a new user record in your database if one doesn't exist. It must then return the required identifiers.
    *   **Note:** The placeholder `success` handler in `apps/openauth/src/index.ts` needs to be replaced with the provided example code that actually calls this service binding.

## Development

1.  **Start Your Backend Worker:** Ensure your main backend worker (e.g., `vibestack-server` or whatever you set in `wrangler.toml`) is running locally.

2.  **Start the OpenAuth Worker:** Simply run:
    ```bash
    wrangler dev
    ```
    Wrangler will use the hardcoded `service` name from `wrangler.toml` to bind `BACKEND_SERVICE` to your locally running worker.

    This worker typically runs on port `8788` (see `wrangler.toml [dev].port`).

3.  **Test:** Accessing `http://localhost:8788/` in your browser should redirect you to the authorization endpoint (`/authorize`) to start the login flow.

## Production Deployment

```bash
npm run deploy
# or pnpm deploy / yarn deploy
```
Ensure that:
- KV namespace bindings are correct in `wrangler.toml`.
- Secrets (like `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`) are set in the Cloudflare dashboard.
- The hardcoded `service = "..."` name in `wrangler.toml` matches your **deployed production backend worker name**, OR you have explicitly overridden the service binding under the `[env.production]` section in `wrangler.toml`:
  ```toml
  [env.production]
  # ... other prod settings ...
  [[services]]
  binding = "BACKEND_SERVICE"
  service = "YOUR_ACTUAL_PROD_WORKER_NAME"
  ```
