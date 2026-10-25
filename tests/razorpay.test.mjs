// Run with: node --test tests/*.test.mjs
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';

import {
  hmacSha256Hex,
  isValidPaymentSignature,
  isValidWebhookSignature,
  receiptFor,
  safeEqual,
} from '../supabase/functions/_shared/razorpay.ts';

const nodeHmac = (secret, message) => createHmac('sha256', secret).update(message).digest('hex');

test('HMAC matches Node crypto', async () => {
  assert.equal(await hmacSha256Hex('secret', 'order_1|pay_1'), nodeHmac('secret', 'order_1|pay_1'));
  assert.equal(await hmacSha256Hex('ключ', 'தமிழ் ₹'), nodeHmac('ключ', 'தமிழ் ₹'));
});

test('checkout signature is order_id|payment_id signed with the key secret', async () => {
  const signature = nodeHmac('key_secret', 'order_ABC|pay_XYZ');
  assert.equal(await isValidPaymentSignature('order_ABC', 'pay_XYZ', signature, 'key_secret'), true);
  assert.equal(await isValidPaymentSignature('order_ABC', 'pay_OTHER', signature, 'key_secret'), false);
  assert.equal(await isValidPaymentSignature('order_ABC', 'pay_XYZ', signature, 'wrong_secret'), false);
  assert.equal(await isValidPaymentSignature('order_ABC', 'pay_XYZ', '', 'key_secret'), false);
  assert.equal(await isValidPaymentSignature('', '', nodeHmac('key_secret', '|'), 'key_secret'), false);
});

test('webhook signature covers the exact raw body', async () => {
  const body = '{"event":"payment.captured","payload":{}}';
  const signature = nodeHmac('webhook_secret', body);
  assert.equal(await isValidWebhookSignature(body, signature, 'webhook_secret'), true);
  assert.equal(await isValidWebhookSignature(`${body} `, signature, 'webhook_secret'), false);
  assert.equal(await isValidWebhookSignature(body, null, 'webhook_secret'), false);
  assert.equal(await isValidWebhookSignature(body, signature, ''), false);
});

test('safeEqual', () => {
  assert.equal(safeEqual('abc', 'abc'), true);
  assert.equal(safeEqual('abc', 'abd'), false);
  assert.equal(safeEqual('abc', 'abcd'), false);
});

test('receipts fit Razorpay’s 40-character limit', () => {
  const receipt = receiptFor('3f1c2b4a-1111-2222-3333-444455556666', 1792895125112);
  assert.ok(receipt.length <= 40);
  assert.match(receipt, /^sa_3f1c2b4a1111_/);
});
