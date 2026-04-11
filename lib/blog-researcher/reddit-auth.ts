/**
 * Reddit OAuth2 Application-Only Authentication
 *
 * C4 fix: The public Reddit JSON endpoint (`reddit.com/r/{sub}/hot.json`)
 * rate-limits at 60 req/min **per IP**.  On Vercel serverless with shared IPs,
 * other tenants' traffic counts against our quota, making the limit unreliable.
 *
 * OAuth2 "client_credentials" flow solves this:
 *   - 100 req/min per **token** (not per IP)
 *   - Dedicated quota — not shared with other Vercel tenants
 *   - Endpoint switches to `oauth.reddit.com`
 *
 * Setup:
 *   1. Create a "script" app at https://www.reddit.com/prefs/apps
 *   2. Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET in .env.local
 *   3. The module auto-detects and uses OAuth; without the vars it's a no-op
 *
 * Token lifecycle: Reddit tokens last ~24 h.  We cache in-memory and refresh
 * 5 minutes before expiry.  On serverless cold starts the token is re-fetched
 * (one extra request, negligible cost).
 */

import { optionalEnv } from '@/lib/env';
import { loggers } from '@/lib/logger';

const log = loggers.blog;

// =============================================================================
// TOKEN CACHE
// =============================================================================

interface CachedToken {
  accessToken: string;
  /** Absolute timestamp (ms) when this token expires */
  expiresAt: number;
}

let _cachedToken: CachedToken | null = null;

/** Refresh 5 minutes before actual expiry to avoid edge-case 401s. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Returns `true` when Reddit OAuth credentials are configured.
 * Callers can use this to choose between authenticated and anonymous paths.
 */
export function isRedditOAuthConfigured(): boolean {
  return Boolean(optionalEnv.REDDIT_CLIENT_ID && optionalEnv.REDDIT_CLIENT_SECRET);
}

/**
 * Returns a valid Reddit OAuth2 bearer token, fetching or refreshing as needed.
 * Returns `null` if credentials are not configured or if the token request fails.
 */
export async function getRedditAccessToken(): Promise<string | null> {
  if (!isRedditOAuthConfigured()) return null;

  // Return cached token if still fresh
  if (_cachedToken && Date.now() < _cachedToken.expiresAt - REFRESH_MARGIN_MS) {
    return _cachedToken.accessToken;
  }

  try {
    const clientId = optionalEnv.REDDIT_CLIENT_ID!;
    const clientSecret = optionalEnv.REDDIT_CLIENT_SECRET!;

    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'AutonordBlogResearcher/1.0 (by /u/autonord_bot)',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      log.error(`[RedditAuth] Token request failed: ${response.status} ${response.statusText}`);
      _cachedToken = null;
      return null;
    }

    const data = await response.json() as {
      access_token: string;
      token_type: string;
      expires_in: number;
      scope: string;
    };

    _cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    log.info(`[RedditAuth] OAuth token acquired (expires in ${data.expires_in}s, scope: ${data.scope})`);
    return _cachedToken.accessToken;
  } catch (err) {
    log.error('[RedditAuth] Failed to acquire OAuth token:', err);
    _cachedToken = null;
    return null;
  }
}
