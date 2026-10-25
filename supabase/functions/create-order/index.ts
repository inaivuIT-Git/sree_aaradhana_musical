// Starts a payment: creates a Razorpay order for a plan at the plan's current
// price (never a price sent by the browser) and records it as unpaid.

import { corsHeaders, json, razorpay, requireEnv } from '../_shared/http.ts';
import { RazorpayError, receiptFor } from '../_shared/razorpay.ts';
import { db, getUser } from '../_shared/supabase.ts';

interface Plan {
  id: string;
  name: string;
  price_paise: number;
  duration_days: number;
  is_active: boolean;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in again.' }, 401);

    const body = await req.json().catch(() => ({}));
    const planId = typeof body?.plan_id === 'string' ? body.plan_id : '';
    if (!/^[0-9a-f-]{36}$/i.test(planId)) return json({ error: 'Choose a plan.' }, 400);

    const [plan] = await db.select<Plan>(
      'plans',
      `id=eq.${planId}&select=id,name,price_paise,duration_days,is_active`,
    );
    if (!plan || !plan.is_active) return json({ error: 'This plan is no longer available.' }, 404);

    const order = await razorpay().createOrder({
      amount: plan.price_paise,
      currency: 'INR',
      receipt: receiptFor(user.id),
      notes: { plan_id: plan.id, user_id: user.id },
    });

    await db.insert('payments', {
      user_id: user.id,
      plan_id: plan.id,
      amount_paise: plan.price_paise,
      currency: 'INR',
      duration_days: plan.duration_days,
      razorpay_order_id: order.id,
    });

    return json({
      key_id: requireEnv('RAZORPAY_KEY_ID'),
      order_id: order.id,
      amount: plan.price_paise,
      currency: 'INR',
      plan_name: plan.name,
      email: user.email ?? '',
      name: typeof user.user_metadata?.full_name === 'string' ? user.user_metadata.full_name : '',
    });
  } catch (error) {
    console.error('create-order failed', error);
    const message = error instanceof RazorpayError
      ? 'The payment service could not start this payment. Please try again.'
      : 'Something went wrong. Please try again.';
    return json({ error: message }, 502);
  }
});
