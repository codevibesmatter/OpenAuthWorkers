import { Hono } from 'hono';
import type { Env } from './types/env.js';

// Use a type that includes potential context properties if needed, assuming Env are the bindings
type DebugEnv = { Bindings: Env };

// Variable to hold the debug challenge code (scoped to this module)
let currentDebugChallenge: string | null = null;

const debugApp = new Hono<DebugEnv>();

// Basic HTML escaping helper function (scoped to this module)
const escapeHtml = (unsafe: string): string => {
   return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
};

// --- DEBUG ADMIN UI with Console Challenge ---
debugApp.get('/list-auth-users', async (c) => {
    console.log('[OpenAuth] DEBUG: ENTERING /internal/list-auth-users handler'); 
    const userChallenge = c.req.query('challenge');

    const showChallengePage = (expectedCode: string) => {
        console.log(`[OpenAuth] DEBUG CHALLENGE: To access admin UI, use challenge code: ${expectedCode}`);
        return c.html(`
            <!DOCTYPE html><html><head><title>Challenge Required</title></head>
            <body><h1>Admin UI Challenge</h1>
            <p>Please check the worker console logs for the required challenge code.</p>
            <p>Then, add <code>?challenge=&lt;code&gt;</code> to the URL and refresh.</p>
            <p>(Expected code was just logged to console)</p>
            </body></html>
        `, 401);
    };

    // --- Revised Challenge Logic --- 
    const expectedChallenge = currentDebugChallenge; // Store the currently expected code
    
    // Check if the user provided the currently expected challenge
    if (expectedChallenge && userChallenge === expectedChallenge) {
        // Correct challenge provided! Proceed to show the list page.
        console.log('[OpenAuth] DEBUG: Challenge passed.');
        currentDebugChallenge = null; // Reset the challenge AFTER successful entry

        // --- Original Logic to Show List Page --- 
        const authStore = c.env.AUTH_STORE;
        if (!authStore) {
            return c.text('AUTH_STORE binding not available', 500);
        }
        
        let emails: string[] = [];
        let errorMsg: string | null = null;
        const keyLimit = 1000;
        const EMAIL_PREFIX = 'email\u001f';
        const SUBJECT_SUFFIX = '\u001fsubject';
        
        try {
            console.log(`[OpenAuth] DEBUG: Listing keys with prefix: "${EMAIL_PREFIX}"`);
            const listResult = await authStore.list({ prefix: EMAIL_PREFIX, limit: keyLimit });
            console.log('[OpenAuth] DEBUG: Raw list result:', JSON.stringify(listResult));

            const DELIMITER = '\u001f'; // Define the delimiter

            emails = listResult.keys
                // --- Adjust Filter --- 
                .filter((keyInfo: KVNamespaceListKey<unknown>) => keyInfo.name.startsWith(EMAIL_PREFIX))
                // --- Adjust Map --- 
                .map((keyInfo: KVNamespaceListKey<unknown>) => {
                    const startIndex = EMAIL_PREFIX.length;
                    const endIndex = keyInfo.name.indexOf(DELIMITER, startIndex);
                    if (endIndex !== -1) {
                        return keyInfo.name.substring(startIndex, endIndex);
                    } 
                    // Handle cases where the key format might be unexpected (e.g., missing second delimiter)
                    console.warn(`[OpenAuth] DEBUG: Could not extract email from key: ${keyInfo.name}`);
                    return null; // Or handle as appropriate
                })
                .filter((email): email is string => email !== null); // Filter out any nulls from mapping errors
            
            console.log(`[OpenAuth] DEBUG: Extracted emails: ${JSON.stringify(emails)}`);

            if (listResult.list_complete === false) {
                 const truncatedMsg = `Warning: Key list truncated at ${keyLimit} keys (prefix: '${escapeHtml(EMAIL_PREFIX)}'). Not all users may be shown.`;
                 console.warn(`[OpenAuth] ${truncatedMsg}`);
                 errorMsg = truncatedMsg;
            }

            console.log(`[OpenAuth] DEBUG: Performing separate list for ALL keys (limit: ${keyLimit}) for console log...`);
            const allKeysResult = await authStore.list({ limit: keyLimit });
            console.log('[OpenAuth] DEBUG CONSOLE LOG: Full list result:', JSON.stringify(allKeysResult));
            
        } catch (error) {
            console.error('[OpenAuth] Error listing KV keys:', error);
            errorMsg = `Error listing auth users from KV: ${escapeHtml(error instanceof Error ? error.message : String(error))}`;
        }

        const status = c.req.query('status');
        const statusEmail = c.req.query('email');
        const deletedCountParam = c.req.query('deleted');
        const errorCountParam = c.req.query('errors');
        let statusMsg: string | null = null;

        if (status === 'deleted' && statusEmail) {
            statusMsg = `Successfully deleted auth data for ${escapeHtml(statusEmail)}.`;
        } else if (status === 'error' && statusEmail) {
            statusMsg = `Error deleting auth data for ${escapeHtml(statusEmail)}. Check console logs.`;
        } else if (status === 'clear_success') {
            statusMsg = `Successfully cleared all auth data. Attempted to delete ${escapeHtml(deletedCountParam || 'N/A')} keys.`;
        } else if (status === 'clear_partial') {
             statusMsg = `Partially cleared auth data. Attempted to delete ${escapeHtml(deletedCountParam || 'N/A')} keys with ${escapeHtml(errorCountParam || 'N/A')} errors. Check console logs.`;
        } else if (status === 'clear_error') {
             statusMsg = `Error occurred during clear all operation. Check console logs.`;
        }

        // Generate HTML to display emails
        const htmlContent = ` 
          <!DOCTYPE html>
          <html>
          <head>
              <title>Auth User Admin (DEBUG)</title>
               <style>
                    body { font-family: sans-serif; margin: 2em; }
                    table { border-collapse: collapse; width: 100%; margin-top: 1em; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; word-break: break-all; }
                    th { background-color: #f2f2f2; }
                    .status-success { color: green; border: 1px solid green; padding: 1em; margin-bottom: 1em; }
                    .status-error { color: red; border: 1px solid red; padding: 1em; margin-bottom: 1em; }
                    .error { color: red; font-weight: bold; border: 1px solid red; padding: 1em; margin-bottom: 1em; }
                    .warning { color: orange; font-weight: bold; margin-bottom: 1em; border: 1px solid orange; padding: 1em; }
                    button, .button-danger { border: none; padding: 10px 15px; cursor: pointer; color: white; }
                    button:disabled { cursor: not-allowed; opacity: 0.6; }
                    .button-danger { background-color: #dc3545; }
                    code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
                </style>
          </head>
          <body>
              <h1>Auth User Admin (DEBUG)</h1>
              <p class="warning">WARNING: For development only. Lists users based on finding keys starting with <code>email\u001f</code> in KV.</p>
              
              ${statusMsg ? `<p class="${status?.includes('error') || status?.includes('partial') ? 'status-error' : 'status-success'}">${statusMsg}</p>` : ''}
              
              <h2>Users Found (via KV Prefix: <code>${escapeHtml(EMAIL_PREFIX)}</code>)</h2>
              
              ${errorMsg ? `<p class="error">${errorMsg}</p>` : ''}

              ${emails.length > 0 ? `
              <table>
                  <thead>
                      <tr>
                          <th>Email (from KV key)</th>
                          <th>Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${emails.map(email => `
                      <tr>
                          <td>${escapeHtml(email)}</td>
                          <td>
                              <form method="POST" action="/internal/delete-user-action" style="display:inline;" onsubmit="return confirm('DELETE AUTH DATA for ${escapeHtml(email)}? This includes password hash and refresh tokens.');">
                                  <input type="hidden" name="email" value="${escapeHtml(email)}">
                                  <button type="submit">Delete Auth Data</button>
                              </form>
                              <form method="POST" action="/internal/reset-password-action" style="display:inline;" onsubmit="alert('ACTION NOT IMPLEMENTED. Trigger password reset for ${escapeHtml(email)}?'); return false;">
                                   <input type="hidden" name="email" value="${escapeHtml(email)}">
                                   <button type="submit" disabled>Trigger Password Reset</button>
                              </form>
                          </td>
                      </tr>
                      `).join('')}
                  </tbody>
              </table>
              ` : '<p>No users found with the specified KV key pattern.</p>'}

              <hr style="margin-top: 2em; margin-bottom: 2em;">
              <h2>Clear All User Auth Data</h2>
              <form method="POST" action="/internal/clear-all-auth-data" onsubmit="return confirm('DANGER! This will delete ALL password hashes, email mappings, and refresh tokens from KV. Are you absolutely sure?');">
                 <button type="submit" class="button-danger">Clear All Auth Data</button>
              </form>

          </body>
          </html>
        `; // End of template literal

        return c.html(htmlContent);
        // --- End Original Logic --- 

    } else {
        // Incorrect/missing challenge OR no challenge was active.
        // Generate a NEW challenge and show the 401 page.
        currentDebugChallenge = Math.random().toString(36).substring(2, 8).toUpperCase();
        return showChallengePage(currentDebugChallenge); // Show 401 page with the NEW challenge code
    }
    // --- End Revised Logic ---
});

// --- Handler for Deleting User Auth Data --- 
debugApp.post('/delete-user-action', async (c) => {
    console.log('[OpenAuth] DEBUG: Received POST to /internal/delete-user-action');
    const authStore = c.env.AUTH_STORE;
    if (!authStore) {
        return c.text('AUTH_STORE binding not available', 500);
    }

    let status: string = 'error';
    let emailValue: FormDataEntryValue | null = null;
    let email: string | null = null;

    try {
        const formData = await c.req.formData();
        emailValue = formData.get('email');
        
        if (typeof emailValue !== 'string' || !emailValue) {
            console.error('[OpenAuth] Delete Action: Missing or invalid email (not a string) in form data.');
            return c.text('Invalid request: Email is required and must be a string.', 400);
        }
        email = emailValue; 
        
        console.log(`[OpenAuth] Delete Action: Processing request for email: ${email}`);

        const EMAIL_PREFIX = 'email\u001f';
        const PWD_SUFFIX = '\u001fpassword';
        const SUBJECT_SUFFIX = '\u001fsubject';
        const REFRESH_TOKEN_PREFIX_PART1 = 'oauth:refresh'; // Use colon here as base
        const DELIMITER = '\u001f'; // Use Unit Separator

        const pwdHashKey = `${EMAIL_PREFIX}${email}${PWD_SUFFIX}`;
        const subjectMapKey = `${EMAIL_PREFIX}${email}${SUBJECT_SUFFIX}`;
        let subjectId: string | null = null;

        try {
            subjectId = await authStore.get(subjectMapKey, { type: 'text' });
            if (subjectId) {
                console.log(`[OpenAuth] Delete Action: Found subject ID ${subjectId} for email ${email}`);
            } else {
                 console.warn(`[OpenAuth] Delete Action: No subject mapping key found for ${email}. Skipping refresh token cleanup.`);
            }
        } catch (e) {
             console.warn(`[OpenAuth] Delete Action: Error reading subject mapping key for ${email}, continuing cleanup. Error: ${e}`);
        }

        console.log(`[OpenAuth] Delete Action: Deleting key: ${pwdHashKey}`);
        await authStore.delete(pwdHashKey);
        console.log(`[OpenAuth] Delete Action: Deleting key: ${subjectMapKey}`);
        await authStore.delete(subjectMapKey);

        if (subjectId) {
            // Construct the prefix using the correct delimiter for refresh tokens
            // Format: oauth:refresh<US>subjectId<US>
            const refreshTokenPrefixForUser = `${REFRESH_TOKEN_PREFIX_PART1}${DELIMITER}${subjectId}${DELIMITER}`;
            console.log(`[OpenAuth] Delete Action: Listing refresh tokens with prefix: ${refreshTokenPrefixForUser}`);
            const listResult = await authStore.list({ prefix: refreshTokenPrefixForUser });
            if (listResult.keys.length > 0) {
                console.log(`[OpenAuth] Delete Action: Found ${listResult.keys.length} refresh token keys to delete.`);
                const deletePromises = listResult.keys.map(key => {
                    console.log(`[OpenAuth] Delete Action: Deleting refresh token key: ${key.name}`);
                    return authStore.delete(key.name);
                });
                await Promise.all(deletePromises);
            } else {
                 console.log(`[OpenAuth] Delete Action: No refresh tokens found for subject ${subjectId} with prefix ${refreshTokenPrefixForUser}`);
            }
        }

        status = 'deleted';
        console.log(`[OpenAuth] Delete Action: Successfully processed deletion for email: ${email}`);

    } catch (error) {
        console.error(`[OpenAuth] Delete Action: Error processing deletion for email ${email}:`, error);
    }

    // Redirect back, ensure challenge is still required for next view
    currentDebugChallenge = null; // Force re-challenge
    return c.redirect(`/internal/list-auth-users?status=${status}&email=${encodeURIComponent(email || 'unknown')}`, 303); 
});

// --- Handler for Clearing All User Auth Data ---
debugApp.post('/clear-all-auth-data', async (c) => {
    console.warn('[OpenAuth] DEBUG: Received POST to /internal/clear-all-auth-data');
    const authStore = c.env.AUTH_STORE;
    if (!authStore) {
        return c.text('AUTH_STORE binding not available', 500);
    }

    // Add a challenge check here too for safety
    const userChallenge = (await c.req.formData()).get('challenge'); // Simple way to get it POSTed
    // TODO: Implement challenge check similar to GET /list-auth-users if needed,
    // otherwise this endpoint is unprotected after the first list view.
    // For simplicity here, skipping the re-challenge for the clear action.

    const prefixes_to_delete = [
        'email\u001f',         
        'oauth:refresh\u001f' 
    ];
    let totalAttemptedDeletions = 0;
    let totalErrors = 0;
    let overallStatus = 'success'; // Assume success unless errors occur

    try {
        for (const prefix of prefixes_to_delete) {
            console.log(`[OpenAuth] Clear All: Listing keys with prefix: "${prefix}"`);
            let cursor: string | undefined = undefined;
            do {
                const listResult: KVNamespaceListResult<unknown> = await authStore.list({ prefix: prefix, cursor: cursor, limit: 1000 });
                const keysToDelete = listResult.keys.map(key => key.name);
                
                if (keysToDelete.length > 0) {
                    console.log(`[OpenAuth] Clear All: Found ${keysToDelete.length} keys with prefix "${prefix}" to delete in this batch.`);
                    totalAttemptedDeletions += keysToDelete.length;
                    const deletePromises = keysToDelete.map(key => authStore.delete(key).catch(err => {
                         console.error(`[OpenAuth] Clear All: Error deleting key ${key}:`, err);
                         totalErrors++;
                         return null; // Indicate error, but don't stop Promise.all
                    }));
                    await Promise.all(deletePromises);
                } else {
                    console.log(`[OpenAuth] Clear All: No more keys found with prefix "${prefix}" in this batch.`);
                }

                // Update cursor *only* if list is not complete
                cursor = listResult.list_complete ? undefined : listResult.cursor; 

                if (cursor) {
                    console.log(`[OpenAuth] Clear All: More keys exist for prefix "${prefix}", fetching next batch with cursor.`);
                }

            } while (cursor); // Continue while there's a cursor
        }

        if (totalErrors > 0) {
            overallStatus = totalAttemptedDeletions > 0 ? 'partial' : 'error';
            console.warn(`[OpenAuth] Clear All: Completed with ${totalErrors} errors.`);
        } else {
             console.log(`[OpenAuth] Clear All: Completed successfully. Attempted to delete ${totalAttemptedDeletions} keys across all prefixes.`);
        }

    } catch (error) {
        console.error('[OpenAuth] Clear All: Fatal error during operation:', error);
        overallStatus = 'error';
    }

    // --- BEGIN: Re-render page instead of redirecting --- 
    
    // 1. Construct the status message
    let statusMsg: string | null = null;
    if (overallStatus === 'success') {
        statusMsg = `Successfully cleared all auth data. Attempted to delete ${totalAttemptedDeletions} keys.`;
    } else if (overallStatus === 'partial') {
        statusMsg = `Partially cleared auth data. Attempted to delete ${totalAttemptedDeletions} keys with ${totalErrors} errors. Check console logs.`;
    } else { // error
        statusMsg = `Error occurred during clear all operation. Check console logs.`;
    }

    // 2. Fetch the (now likely empty) user list to display
    let emails: string[] = [];
    let listErrorMsg: string | null = null;
    const EMAIL_PREFIX = 'email\u001f'; // Need prefix definition here too
    const DELIMITER = '\u001f';
    const keyLimit = 1000; 
    
    if (!authStore) {
         listErrorMsg = 'AUTH_STORE binding not available';
    } else {
        try {
            const listResult = await authStore.list({ prefix: EMAIL_PREFIX, limit: keyLimit });
            emails = listResult.keys
                .filter((keyInfo: KVNamespaceListKey<unknown>) => keyInfo.name.startsWith(EMAIL_PREFIX))
                .map((keyInfo: KVNamespaceListKey<unknown>) => {
                    const startIndex = EMAIL_PREFIX.length;
                    const endIndex = keyInfo.name.indexOf(DELIMITER, startIndex);
                    if (endIndex !== -1) return keyInfo.name.substring(startIndex, endIndex);
                    return null;
                })
                .filter((email): email is string => email !== null);
                
            if (listResult.list_complete === false) {
                 const truncatedMsg = `Warning: Key list truncated at ${keyLimit} keys.`;
                 listErrorMsg = listErrorMsg ? `${listErrorMsg}; ${truncatedMsg}` : truncatedMsg;
            } 
        } catch (error) {
             const kvError = `Error re-listing auth users after clear: ${escapeHtml(error instanceof Error ? error.message : String(error))}`;
             listErrorMsg = listErrorMsg ? `${listErrorMsg}; ${kvError}` : kvError;
             console.error("[OpenAuth] Clear All: Error re-listing keys after clear:", error);
        }
    }

    // 3. Generate HTML content (using the same structure as the GET handler)
     const htmlContent = ` 
          <!DOCTYPE html>
          <html>
          <head>
              <title>Auth User Admin (DEBUG)</title>
              <style>
                    body { font-family: sans-serif; margin: 2em; }
                    table { border-collapse: collapse; width: 100%; margin-top: 1em; }
                    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; word-break: break-all; }
                    th { background-color: #f2f2f2; }
                    .status-success { color: green; border: 1px solid green; padding: 1em; margin-bottom: 1em; }
                    .status-error { color: red; border: 1px solid red; padding: 1em; margin-bottom: 1em; }
                    .error { color: red; font-weight: bold; border: 1px solid red; padding: 1em; margin-bottom: 1em; }
                    .warning { color: orange; font-weight: bold; margin-bottom: 1em; border: 1px solid orange; padding: 1em; }
                    button, .button-danger { border: none; padding: 10px 15px; cursor: pointer; color: white; }
                    button:disabled { cursor: not-allowed; opacity: 0.6; }
                    .button-danger { background-color: #dc3545; }
                    code { background-color: #eee; padding: 2px 4px; border-radius: 3px; }
                </style>
          </head>
          <body>
              <h1>Auth User Admin (DEBUG)</h1>
              <p class="warning">WARNING: For development only. Lists users based on finding keys starting with <code>${escapeHtml(EMAIL_PREFIX)}</code> in KV.</p>
              
              ${statusMsg ? `<p class="${overallStatus === 'success' ? 'status-success' : 'status-error'}">${statusMsg}</p>` : ''}
              
              <h2>Users Found (via KV Prefix: <code>${escapeHtml(EMAIL_PREFIX)}</code>)</h2>
              
              ${listErrorMsg ? `<p class="error">${listErrorMsg}</p>` : ''}

              ${emails.length > 0 ? `
              <table>
                  <thead>
                      <tr>
                          <th>Email (from KV key)</th>
                          <th>Actions</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${emails.map(email => `
                      <tr>
                          <td>${escapeHtml(email)}</td>
                          <td>
                              <form method="POST" action="/internal/delete-user-action" style="display:inline;" onsubmit="return confirm('DELETE AUTH DATA for ${escapeHtml(email)}? This includes password hash and refresh tokens.');">
                                  <input type="hidden" name="email" value="${escapeHtml(email)}">
                                  <button type="submit">Delete Auth Data</button>
                              </form>
                              <form method="POST" action="/internal/reset-password-action" style="display:inline;" onsubmit="alert('ACTION NOT IMPLEMENTED. Trigger password reset for ${escapeHtml(email)}?'); return false;">
                                   <input type="hidden" name="email" value="${escapeHtml(email)}">
                                   <button type="submit" disabled>Trigger Password Reset</button>
                              </form>
                          </td>
                      </tr>
                      `).join('')}
                  </tbody>
              </table>
              ` : '<p>No users found with the specified KV key pattern.</p>'}

              <hr style="margin-top: 2em; margin-bottom: 2em;">
              <h2>Clear All User Auth Data</h2>
              <form method="POST" action="/internal/clear-all-auth-data" onsubmit="return confirm('DANGER! This will delete ALL password hashes, email mappings, and refresh tokens from KV. Are you absolutely sure?');">
                 <button type="submit" class="button-danger">Clear All Auth Data</button>
              </form>

          </body>
          </html>
        `; // End of template literal

    // 4. Return the HTML as the response to the POST request
    return c.html(htmlContent);

    // --- END: Re-render page instead of redirecting --- 

    /* --- OLD REDIRECT LOGIC (COMMENTED OUT) ---
    // Redirect back to the list page with status
    const redirectUrl = new URL('/internal/list-auth-users', c.req.url);
    redirectUrl.searchParams.set('status', `clear_${overallStatus}`);
    if (overallStatus !== 'error') {
         redirectUrl.searchParams.set('deleted', String(totalAttemptedDeletions));
         if (totalErrors > 0) {
             redirectUrl.searchParams.set('errors', String(totalErrors));
         }
    }
    return c.redirect(redirectUrl.toString(), 303);
    */
});


export default debugApp; 