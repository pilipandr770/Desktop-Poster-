/**
 * CrossPost Desktop — License Worker (Stripe)
 *
 * Secrets (set via `wrangler secret put <NAME>`):
 *   STRIPE_SECRET_KEY        — sk_live_... (Stripe → Developers → API keys)
 *   STRIPE_WEBHOOK_SECRET    — whsec_...  (Stripe → Webhooks → signing secret)
 *   RESEND_API_KEY           — re_...     (resend.com → API Keys)
 *
 * Plain vars in wrangler.toml:
 *   STRIPE_PRICE_SOLO        — price_xxx  (Solo €29/mo recurring price ID)
 *   STRIPE_PRICE_PRO         — price_xxx  (Pro  €79/mo recurring price ID)
 *   SUCCESS_URL              — https://crosspost-desktop.de/success (or landing page)
 *   CANCEL_URL               — https://crosspost-desktop.de/#pricing
 *   FROM_EMAIL               — noreply@crosspost-desktop.de
 *
 * KV namespace:
 *   LICENSE_KV  (binding name in wrangler.toml)
 *
 * Endpoints:
 *   GET  /checkout?plan=solo|pro   → redirect to Stripe Checkout
 *   POST /webhook                  → Stripe events (checkout.session.completed, etc.)
 *   POST /verify                   → app license check { token }
 *   POST /deactivate               → optional: mark deactivated { token }
 */

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return cors(null, 204);

    const { pathname, searchParams } = new URL(request.url);

    if (pathname === "/checkout" && request.method === "GET") {
      return handleCheckout(searchParams, env);
    }
    if (pathname === "/webhook" && request.method === "POST") {
      return handleWebhook(request, env);
    }
    if (pathname === "/verify" && request.method === "POST") {
      return handleVerify(request, env);
    }
    if (pathname === "/deactivate" && request.method === "POST") {
      return handleDeactivate(request, env);
    }

    return cors({ error: "Not found" }, 404);
  },
};

// ── GET /checkout?plan=solo|pro ───────────────────────────────────────────────

async function handleCheckout(params, env) {
  const plan = (params.get("plan") || "solo").toLowerCase();
  const priceId = plan === "pro" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_SOLO;

  if (!priceId) {
    return cors({ error: "Price not configured" }, 500);
  }

  const session = await stripePost("checkout/sessions", env.STRIPE_SECRET_KEY, {
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${env.SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.CANCEL_URL,
    // Store plan in metadata so webhook can read it
    subscription_data: { metadata: { plan } },
    // Collect email for license delivery
    customer_email: null,   // Stripe Checkout always collects it
  });

  if (session.error) {
    return cors({ error: session.error.message }, 502);
  }

  // Redirect user to Stripe-hosted checkout
  return Response.redirect(session.url, 303);
}

// ── POST /webhook (Stripe) ────────────────────────────────────────────────────

async function handleWebhook(request, env) {
  const body = await request.text();
  const sig = request.headers.get("stripe-signature");

  // Verify Stripe signature
  const ok = await verifyStripeSignature(body, sig, env.STRIPE_WEBHOOK_SECRET);
  if (!ok) return new Response("Bad signature", { status: 400 });

  const event = JSON.parse(body);

  if (event.type === "checkout.session.completed") {
    await onCheckoutComplete(event.data.object, env);
  }

  if (event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused") {
    await onSubscriptionCancelled(event.data.object, env);
  }

  return new Response("ok");
}

async function onCheckoutComplete(session, env) {
  const email = session.customer_details?.email || session.customer_email;
  const customerId = session.customer;

  // Get subscription to read plan metadata
  const sub = await stripeGet(`subscriptions/${session.subscription}`, env.STRIPE_SECRET_KEY);
  const plan = sub.metadata?.plan || "solo";

  // Generate license key: SOLO-XXXX-XXXX-XXXX-XXXX
  const key = generateKey(plan);

  // Persist in KV
  const record = {
    plan,
    email,
    stripe_customer_id: customerId,
    stripe_subscription_id: session.subscription,
    created_at: new Date().toISOString(),
    status: "active",
  };
  await env.LICENSE_KV.put(`license:${key}`, JSON.stringify(record));
  // Reverse lookup: customer → key (for cancellation flow)
  await env.LICENSE_KV.put(`customer:${customerId}`, key);

  // Send license key by email
  await sendEmail(env, email, key, plan);
}

async function onSubscriptionCancelled(subscription, env) {
  const customerId = subscription.customer;
  const key = await env.LICENSE_KV.get(`customer:${customerId}`);
  if (!key) return;

  const raw = await env.LICENSE_KV.get(`license:${key}`);
  if (!raw) return;

  const record = JSON.parse(raw);
  record.status = "cancelled";
  await env.LICENSE_KV.put(`license:${key}`, JSON.stringify(record));
}

// ── POST /verify ──────────────────────────────────────────────────────────────

async function handleVerify(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return cors({ valid: false, message: "Invalid JSON" }, 400); }

  const token = (body.token || "").trim().toUpperCase();
  if (!token) return cors({ valid: false, message: "Kein Lizenzschlüssel" }, 400);

  const raw = await env.LICENSE_KV.get(`license:${token}`);
  if (!raw) {
    return cors({ valid: false, message: "Lizenzschlüssel nicht gefunden" });
  }

  const record = JSON.parse(raw);

  if (record.status !== "active") {
    return cors({
      valid: false,
      message: "Lizenz deaktiviert oder Abonnement beendet. Bitte erneuern.",
    });
  }

  // valid_until: 32 days from now (app re-validates on each launch)
  const validUntil = new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();

  return cors({
    valid: true,
    plan: record.plan,
    valid_until: validUntil,
    message: `Lizenz aktiv — Plan: ${record.plan.toUpperCase()}`,
  });
}

// ── POST /deactivate ──────────────────────────────────────────────────────────

async function handleDeactivate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return cors({ ok: false }, 400); }

  const token = (body.token || "").trim().toUpperCase();
  if (!token) return cors({ ok: false }, 400);

  const raw = await env.LICENSE_KV.get(`license:${token}`);
  if (!raw) return cors({ ok: false });

  const record = JSON.parse(raw);
  record.status = "deactivated";
  await env.LICENSE_KV.put(`license:${token}`, JSON.stringify(record));

  return cors({ ok: true });
}

// ── Stripe helpers ────────────────────────────────────────────────────────────

async function stripePost(path, key, params) {
  const body = new URLSearchParams();
  for (const [k, v] of flattenParams(params)) {
    if (v !== null && v !== undefined) body.append(k, String(v));
  }
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  return resp.json();
}

async function stripeGet(path, key) {
  const resp = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return resp.json();
}

// Flatten nested object to Stripe's form-encoded format:
// { subscription_data: { metadata: { plan } } } → subscription_data[metadata][plan]=...
function flattenParams(obj, prefix = "") {
  const result = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      result.push(...flattenParams(v, key));
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (typeof item === "object") {
          result.push(...flattenParams(item, `${key}[${i}]`));
        } else {
          result.push([`${key}[${i}]`, item]);
        }
      });
    } else {
      result.push([key, v]);
    }
  }
  return result;
}

// Stripe webhook signature verification (HMAC-SHA256)
async function verifyStripeSignature(body, header, secret) {
  if (!header || !secret) return false;
  try {
    const parts = Object.fromEntries(header.split(",").map(p => p.split("=")));
    const timestamp = parts.t;
    const sig = parts.v1;
    const payload = `${timestamp}.${body}`;
    const enc = new TextEncoder();
    const cryptoKey = await crypto.subtle.importKey(
      "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    const signed = await crypto.subtle.sign("HMAC", cryptoKey, enc.encode(payload));
    const hex = Array.from(new Uint8Array(signed)).map(b => b.toString(16).padStart(2, "0")).join("");
    return hex === sig;
  } catch {
    return false;
  }
}

// ── License key generator ─────────────────────────────────────────────────────

function generateKey(plan) {
  const prefix = plan === "agency" ? "AGENCY" : plan === "pro" ? "PRO" : "SOLO";
  const seg = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${prefix}-${seg()}-${seg()}-${seg()}-${seg()}`;
}

// ── Email via Resend ──────────────────────────────────────────────────────────

async function sendEmail(env, to, key, plan) {
  const planLabel = plan === "pro" ? "Pro" : plan === "agency" ? "Agency" : "Solo";
  const body = {
    from: env.FROM_EMAIL,
    to,
    subject: `Ihr CrossPost Desktop Lizenzschlüssel — Plan ${planLabel}`,
    html: `
      <div style="font-family:sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#1e1e2e">CrossPost Desktop — Lizenzschlüssel</h2>
        <p>Vielen Dank für Ihren Kauf! Hier ist Ihr Lizenzschlüssel für Plan <strong>${planLabel}</strong>:</p>
        <div style="background:#f4f4f5;border-radius:8px;padding:20px 24px;font-size:22px;
                    font-family:monospace;letter-spacing:2px;text-align:center;margin:24px 0">
          ${key}
        </div>
        <p><strong>Aktivierung:</strong></p>
        <ol>
          <li>CrossPost Desktop starten</li>
          <li>Menü → <em>Lizenz</em></li>
          <li>Schlüssel eingeben und <em>Aktivieren</em> klicken</li>
        </ol>
        <p style="color:#888;font-size:13px">
          Bei Fragen: <a href="mailto:info@andrii-it.de">info@andrii-it.de</a>
        </p>
      </div>
    `,
  };

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// ── CORS ──────────────────────────────────────────────────────────────────────

function cors(body, status = 200) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
