// Razorpay helpers shared by the payment functions. No imports, so the same
// file runs in Supabase Edge Functions (Deno) and in the Node unit tests.

const encoder = new TextEncoder();

export async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
}

// Constant-time comparison, so response timing does not reveal a valid signature.
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Checkout returns razorpay_signature = HMAC-SHA256(order_id + "|" + payment_id, key secret).
export async function isValidPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
  keySecret: string,
): Promise<boolean> {
  if (!orderId || !paymentId || !signature || !keySecret) return false;
  return safeEqual(await hmacSha256Hex(keySecret, `${orderId}|${paymentId}`), signature);
}

// Webhooks carry X-Razorpay-Signature = HMAC-SHA256(raw request body, webhook secret).
export async function isValidWebhookSignature(
  rawBody: string,
  signature: string | null,
  webhookSecret: string,
): Promise<boolean> {
  if (!signature || !webhookSecret) return false;
  return safeEqual(await hmacSha256Hex(webhookSecret, rawBody), signature);
}

// Razorpay receipts are limited to 40 characters.
export function receiptFor(userId: string, now = Date.now()): string {
  return `sa_${userId.replaceAll('-', '').slice(0, 12)}_${now.toString(36)}`.slice(0, 40);
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

export interface RazorpayPayment {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: string;
}

export class RazorpayError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export class RazorpayClient {
  private keyId: string;
  private keySecret: string;
  private baseUrl: string;

  constructor(keyId: string, keySecret: string, baseUrl = 'https://api.razorpay.com') {
    this.keyId = keyId;
    this.keySecret = keySecret;
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.baseUrl}/v1${path}`, {
      method,
      headers: {
        Authorization: `Basic ${btoa(`${this.keyId}:${this.keySecret}`)}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const description = data?.error?.description ?? `Razorpay returned ${response.status}`;
      throw new RazorpayError(description, response.status);
    }
    return data as T;
  }

  createOrder(order: {
    amount: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
  }): Promise<RazorpayOrder> {
    return this.request('POST', '/orders', order);
  }

  fetchPayment(paymentId: string): Promise<RazorpayPayment> {
    return this.request('GET', `/payments/${encodeURIComponent(paymentId)}`);
  }

  capturePayment(paymentId: string, amount: number, currency: string): Promise<RazorpayPayment> {
    return this.request('POST', `/payments/${encodeURIComponent(paymentId)}/capture`, {
      amount,
      currency,
    });
  }
}
