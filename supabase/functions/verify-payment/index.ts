// Finishes a payment after Razorpay Checkout: checks Checkout's signature,
// confirms the payment with Razorpay, then opens the plan for the student.
// The webhook does the same if the student closes the page too early.

import { corsHeaders, json, razorpay, requireEnv } from '../_shared/http.ts';
import { isValidPaymentSignature } from '../_shared/razorpay.ts';
import { db, getUser } from '../_shared/supabase.ts';

interface PaymentRow {
  id: string;
  user_id: string;
  amount_paise: number;
  currency: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  try {
    const user = await getUser(req);
    if (!user) return json({ error: 'Please sign in again.' }, 401);

    const body = await req.json().catch(() => ({}));
    const orderId = String(body?.razorpay_order_id ?? '');
    const paymentId = String(body?.razorpay_payment_id ?? '');
    const signature = String(body?.razorpay_signature ?? '');

    if (!(await isValidPaymentSignature(orderId, paymentId, signature, requireEnv('RAZORPAY_KEY_SECRET')))) {
      return json({ error: 'We could not confirm this payment.' }, 400);
    }

    const [row] = await db.select<PaymentRow>(
      'payments',
      `razorpay_order_id=eq.${encodeURIComponent(orderId)}&select=id,user_id,amount_paise,currency`,
    );
    if (!row || row.user_id !== user.id) return json({ error: 'This payment is not yours.' }, 403);

    const client = razorpay();
    let payment = await client.fetchPayment(paymentId);
    if (payment.order_id !== orderId) return json({ error: 'We could not confirm this payment.' }, 400);
    // Accounts with manual capture leave payments "authorized" until captured.
    if (payment.status === 'authorized') {
      payment = await client.capturePayment(paymentId, row.amount_paise, row.currency);
    }
    if (payment.status !== 'captured') {
      return json({ error: 'The payment is not complete yet. If money was taken, it will be confirmed shortly.' }, 409);
    }

    const subscriptionId = await db.rpc<string>('record_payment', {
      p_order_id: orderId,
      p_payment_id: paymentId,
      p_amount_paise: payment.amount,
    });
    return json({ subscription_id: subscriptionId });
  } catch (error) {
    console.error('verify-payment failed', error);
    return json({ error: 'We could not confirm the payment yet. If money was taken, it will be confirmed shortly.' }, 502);
  }
});
