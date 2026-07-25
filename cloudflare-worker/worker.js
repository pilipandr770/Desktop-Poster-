/**
 * CrossPost Desktop — License Validation Worker
 * Deploy to: license.crosspost-desktop.de  (Cloudflare Worker + custom domain)
 *
 * Environment variables (set in Cloudflare dashboard → Worker → Settings → Variables):
 *   LEMON_API_KEY   — LemonSqueezy API key (Settings → API → New API key)
 *   LEMON_STORE_ID  — your numeric store ID (from LemonSqueezy dashboard URL)
 */

const LEMON_VALIDATE_URL = "https://api.lemonsqueezy.com/v1/licenses/validate";

// Map LemonSqueezy variant names → internal plan IDs
const VARIANT_TO_PLAN = {
  "Solo": "solo",
  "Pro": "pro",
  "Agency": "agency",
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return corsResponse(null, 204);
    }

    const url = new URL(request.url);

    // POST /verify  — validate a license key
    if (request.method === "POST" && url.pathname === "/verify") {
      return handleVerify(request, env);
    }

    // POST /activate — first activation (registers an instance in LemonSqueezy)
    if (request.method === "POST" && url.pathname === "/activate") {
      return handleActivate(request, env);
    }

    // POST /deactivate — called when user removes the app
    if (request.method === "POST" && url.pathname === "/deactivate") {
      return handleDeactivate(request, env);
    }

    // POST /webhook  — LemonSqueezy subscription lifecycle events
    if (request.method === "POST" && url.pathname === "/webhook") {
      return handleWebhook(request, env);
    }

    return corsResponse({ error: "Not found" }, 404);
  },
};

// ── /verify ──────────────────────────────────────────────────────────────────

async function handleVerify(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return corsResponse({ valid: false, message: "Invalid JSON" }, 400); }

  const token = (body.token || "").trim();
  if (!token) {
    return corsResponse({ valid: false, message: "Kein Lizenzschlüssel angegeben" }, 400);
  }

  try {
    const ls = await lemonValidate(token, env);
    return corsResponse(ls);
  } catch (err) {
    return corsResponse({ valid: false, message: "Servervalidierung fehlgeschlagen: " + err.message }, 502);
  }
}

// ── /activate ─────────────────────────────────────────────────────────────────

async function handleActivate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return corsResponse({ valid: false, message: "Invalid JSON" }, 400); }

  const { token, instance_name = "crosspost-desktop" } = body;
  if (!token) return corsResponse({ valid: false, message: "Kein Token" }, 400);

  const resp = await fetch(LEMON_VALIDATE_URL, {
    method: "POST",
    headers: lemonHeaders(env),
    body: new URLSearchParams({ license_key: token, instance_name }),
  });

  const data = await resp.json();
  if (!data.valid) {
    return corsResponse({
      valid: false,
      message: data.error || "Lizenzschlüssel ungültig",
    });
  }

  return corsResponse(buildResult(data));
}

// ── /deactivate ───────────────────────────────────────────────────────────────

async function handleDeactivate(request, env) {
  let body;
  try { body = await request.json(); }
  catch { return corsResponse({ ok: false }, 400); }

  const { token, instance_id } = body;
  if (!token || !instance_id) return corsResponse({ ok: false }, 400);

  await fetch("https://api.lemonsqueezy.com/v1/licenses/deactivate", {
    method: "POST",
    headers: lemonHeaders(env),
    body: new URLSearchParams({ license_key: token, instance_id }),
  });

  return corsResponse({ ok: true });
}

// ── /webhook ──────────────────────────────────────────────────────────────────
// Handles subscription_cancelled, subscription_expired, etc.
// (Set webhook URL in LemonSqueezy → Settings → Webhooks)

async function handleWebhook(request, env) {
  // Just acknowledge — the app re-validates on next launch anyway
  return corsResponse({ received: true });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function lemonValidate(token, env) {
  const resp = await fetch(LEMON_VALIDATE_URL, {
    method: "POST",
    headers: lemonHeaders(env),
    body: new URLSearchParams({
      license_key: token,
      instance_name: "crosspost-desktop",
    }),
  });

  if (!resp.ok) {
    throw new Error(`LemonSqueezy HTTP ${resp.status}`);
  }

  const data = await resp.json();
  if (!data.valid) {
    return {
      valid: false,
      message: data.error || "Lizenzschlüssel ungültig oder abgelaufen",
    };
  }

  return buildResult(data);
}

function buildResult(data) {
  const variantName = data.meta?.variant_name || "";
  const plan = VARIANT_TO_PLAN[variantName] || guessFromKey(data.license_key?.key || "");

  // valid_until: subscriptions don't expire until cancelled — set 32 days from now
  // (app re-validates on each launch, so this is just a local cache TTL)
  const validUntil = new Date(Date.now() + 32 * 24 * 3600 * 1000).toISOString();

  return {
    valid: true,
    plan,
    valid_until: validUntil,
    message: `Lizenz aktiv — Plan: ${plan.toUpperCase()}`,
    instance_id: data.instance?.id,
  };
}

function guessFromKey(key) {
  if (key.startsWith("AGENCY-")) return "agency";
  if (key.startsWith("PRO-")) return "pro";
  return "solo";
}

function lemonHeaders(env) {
  return {
    "Accept": "application/vnd.api+json",
    "Content-Type": "application/x-www-form-urlencoded",
    "Authorization": `Bearer ${env.LEMON_API_KEY}`,
  };
}

function corsResponse(body, status = 200) {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
