import { createHmac } from 'node:crypto';

/** Ripio Retail API signature: base64(HMAC-SHA256(secret, timestamp + method + path + body)). */
export function signRequest(secret: string, timestamp: string, method: 'GET', path: string, body = ''): string {
  return createHmac('sha256', secret).update(`${timestamp}${method}${path}${body}`).digest('base64');
}
