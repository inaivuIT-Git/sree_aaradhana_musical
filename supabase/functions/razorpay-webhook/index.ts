// Razorpay calls this when a payment is captured, so a plan still opens if the
// student closes the page before Checkout finishes. Set it up in the Razorpay
// Dashboard → Webhooks with the events payment.captured and order.paid.

import { json, requireEnv } from '../_shared/http.ts';
import { isValidWebhookSignature } from '../_shared/razorpay.ts';
import { DatabaseError, db } from '../_shared/supabase.ts';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const rawBody = await req.text();
  const valid = await isValidWebhookSignature(
    rawBody,
    req.headers.get('X-Razorpay-Signature'),
    requireEnv('RAZORPAY_WEBHOOK_SECRET'),
  );
  if (!valid) return json({ error: 'Invalid signature' }, 400);

  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return json({ error: 'Invalid body' }, 400);
  }
  if (event?.event !== 'payment.captured' && event?.event !== 'order.paid') {
    return json({ ignored: event?.event ?? 'unknown' });
  }

  const payment = event?.payload?.payment?.entity;
  if (!payment?.order_id || !payment?.id) return json({ ignored: 'no order' });

  try {
    await db.rpc('record_payment', {
      p_order_id: payment.order_id,
      p_payment_id: payment.id,
      p_amount_paise: payment.amount,
    });
    return json({ ok: true });
  } catch (error) {
    // An order this site did not create (for example a payment link): nothing to do.
    if (error instanceof DatabaseError && error.code === 'P0002') return json({ ignored: 'unknown order' });
    // The amount differs from the order: never open the plan, and retrying will not help.
    if (error instanceof DatabaseError && error.code === '22023') {
      console.error('razorpay-webhook amount mismatch', payment.order_id, payment.amount);
      return json({ ignored: 'amount mismatch' });
    }
    console.error('razorpay-webhook failed', error);
    // A 5xx makes Razorpay retry later.
    return json({ error: 'Could not record the payment' }, 500);
  }
});
