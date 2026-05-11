/**
 * CORS Configuration for Edge Functions
 * 
 * IMPORTANT: Update the allowedOrigins array with your actual domain URLs
 * before deploying to production!
 */

// Allowed origins for CORS
// TODO: Replace 'YOUR_PRODUCTION_DOMAIN' and 'YOUR_STAGING_DOMAIN' with actual URLs
const allowedOrigins = [
    'http://localhost:5173',                    // Local development
    'http://localhost:5174',                    // Alternative local port
    'http://localhost:3000',                    // Alternative local port
    'http://localhost:8080',                    // User's current local port
    'https://sheizenwellness.com',              // Production
    'https://www.sheizenwellness.com',          // Production with www
    'https://tyrannizingly-beamish-jackie.ngrok-free.dev', // ngrok tunnel
];

/**
 * Get CORS headers for the given origin
 * Only allows requests from whitelisted origins
 * 
 * @param origin - The origin header from the request
 * @returns CORS headers object
 */
export function getCorsHeaders(origin: string | null): Record<string, string> {
    // Check if origin is in allowed list
    const isAllowed = origin && allowedOrigins.includes(origin);

    // If origin is allowed, use it; otherwise default to first allowed origin
    const allowedOrigin = isAllowed ? origin : allowedOrigins[0];

    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Credentials': 'true',
    };
}

/**
 * Get simple CORS headers for OPTIONS preflight requests
 * @param origin - The origin header from the request
 * @returns CORS headers object
 */
export function getPreflightCorsHeaders(origin: string | null): Record<string, string> {
    return {
        ...getCorsHeaders(origin),
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Max-Age': '86400', // 24 hours
    };
}
