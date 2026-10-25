import { RazorpayClient } from './razorpay.ts';

// The site calls these functions from the browser with the student's sign-in
// token (not cookies), so any origin may call them.
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`${name} is not set. Add it with: supabase secrets set ${name}=...`);
  return value;
}

export function razorpay(): RazorpayClient {
  return new RazorpayClient(
    requireEnv('RAZORPAY_KEY_ID'),
    requireEnv('RAZORPAY_KEY_SECRET'),
    // Only for local testing against a stand-in server.
    Deno.env.get('RAZORPAY_API_URL') || undefined,
  );
}
