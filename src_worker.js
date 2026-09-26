const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", ...headers } });
function cors(origin) { return { "Access-Control-Allow-Origin": origin || "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" }; }
function clean(v, max = 255) { return String(v ?? "").trim().slice(0, max); }

const RAZORPAY_API = "https://api.razorpay.com/v1";
const AMOUNT = 900;

function razorpayConfig(env) {
  const keyId = env.RAZORPAY_KEY_ID;
  const keySecret = env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) throw new Error("Razorpay is not configured.");
  return { keyId, keySecret };
}

function basicAuth(keyId, keySecret) {
  return `Basic ${btoa(`${keyId}:${keySecret}`)}`;
}

async function razorpayFetch(env, path, options = {}) {
  const { keyId, keySecret } = razorpayConfig(env);
  const headers = {
    Authorization: basicAuth(keyId, keySecret),
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(options.headers || {})
  };
  return fetch(`${RAZORPAY_API}${path}`, { ...options, headers });
}

async function createPayment(env, body) {
  const name = clean(body.name, 40);
  const feeling = clean(body.feeling, 40);
  if (name.length < 2 || !feeling) throw new Error("Name and feeling are required.");

  const receipt = `SND${Date.now()}`.slice(0, 40);
  const payload = {
    amount: AMOUNT,
    currency: "INR",
    receipt,
    notes: {
      product: "Aaj Ka Sandesh",
      customer_name: name,
      feeling
    }
  };

  const r = await razorpayFetch(env, "/orders", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const d = await r.json();
  if (!r.ok || !d.id) {
    console.error("Razorpay order error", r.status, d);
    throw new Error("Razorpay payment could not be started.");
  }
  const { keyId } = razorpayConfig(env);
  return { keyId, orderId: d.id, amount: d.amount, currency: d.currency };
}

async function verifySignature(orderId, paymentId, signature, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const data = new TextEncoder().encode(`${orderId}|${paymentId}`);
  const digest = await crypto.subtle.sign("HMAC", key, data);
  const expected = Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
  return expected === signature;
}

async function getPayment(env, paymentId) {
  const r = await razorpayFetch(env, `/payments/${encodeURIComponent(paymentId)}`);
  const d = await r.json();
  if (!r.ok) throw new Error("Razorpay payment lookup failed.");
  return d;
}

async function verifyPayment(env, body) {
  const orderId = clean(body.orderId, 100);
  const paymentId = clean(body.paymentId, 100);
  const signature = clean(body.signature, 200);
  if (!orderId || !paymentId || !signature) throw new Error("Missing payment verification details.");

  const { keySecret } = razorpayConfig(env);
  const validSignature = await verifySignature(orderId, paymentId, signature, keySecret);
  if (!validSignature) throw new Error("Payment signature verification failed.");

  const payment = await getPayment(env, paymentId);
  if (String(payment.order_id) !== orderId) throw new Error("Payment does not match the order.");
  if (Number(payment.amount) !== AMOUNT || String(payment.currency) !== "INR") throw new Error("Payment amount mismatch.");
  if (String(payment.status).toLowerCase() !== "captured") throw new Error("Payment has not been captured yet.");

  return payment;
}

async function logSheet(env, row) {
  if (!env.GOOGLE_SHEETS_WEBHOOK_URL) return;
  try {
    await fetch(env.GOOGLE_SHEETS_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(row)
    });
  } catch (e) { console.error("Google Sheets logging failed", e.message); }
}

async function api(request, env) {
  const url = new URL(request.url);
  const headers = cors(request.headers.get("Origin"));
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

  if (url.pathname === "/api/create-payment" && request.method === "POST") {
    try {
      const data = await createPayment(env, await request.json());
      return json({ ok: true, ...data }, 200, headers);
    } catch (e) {
      console.error(e);
      return json({ ok: false, error: e.message || "अभी भुगतान शुरू नहीं हो सका।" }, 400, headers);
    }
  }

  if (url.pathname === "/api/verify-payment" && request.method === "POST") {
    try {
      const body = await request.json();
      const payment = await verifyPayment(env, body);
      const name = clean(body.name, 40);
      const feeling = clean(body.feeling, 40);
      if (name.length < 2 || !feeling) throw new Error("Missing message details.");

      await logSheet(env, {
        timestamp: new Date().toISOString(),
        name,
        feeling,
        order_id: payment.order_id,
        payment_id: payment.id,
        amount: 9,
        currency: "INR",
        status: "paid",
        gateway: "Razorpay"
      });

      return json({ ok: true, orderId: payment.order_id, paymentId: payment.id }, 200, headers);
    } catch (e) {
      console.error(e);
      return json({ ok: false, error: e.message || "Payment verification failed." }, 400, headers);
    }
  }

  return json({ ok: false, error: "Not found" }, 404, headers);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) return api(request, env);
    return env.ASSETS.fetch(request);
  }
};
