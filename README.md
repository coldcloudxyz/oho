# Aaj Ka Sandesh — Cloudflare Workers + Razorpay PG

This version uses Razorpay Standard Checkout. The website asks only for the customer's name and feeling before opening Razorpay Checkout. The payment amount is ₹9.

## Cloudflare secrets
Set these on the Worker:
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET` (secret)
- `GOOGLE_SHEETS_WEBHOOK_URL`

Never commit the Razorpay secret key.

## Razorpay flow
1. Worker creates the ₹9 Razorpay order server-side.
2. Browser opens Razorpay Checkout with the returned public Key ID and Order ID.
3. Razorpay returns `razorpay_payment_id`, `razorpay_order_id`, and `razorpay_signature` to the browser handler.
4. Worker verifies the HMAC-SHA256 signature server-side.
5. Worker fetches the payment from Razorpay and verifies the order ID, amount, currency, and captured status.
6. Only after verification does the Worker log the purchase to Google Sheets and reveal the message.

Razorpay's current documentation recommends server-side signature validation for Orders API integrations. The secret key must remain server-side.

## Deploy
```cmd
npm install
npx wrangler login
npx wrangler secret put RAZORPAY_KEY_ID
npx wrangler secret put RAZORPAY_KEY_SECRET
npx wrangler secret put GOOGLE_SHEETS_WEBHOOK_URL
npx wrangler deploy
```
