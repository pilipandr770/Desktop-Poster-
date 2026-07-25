# CrossPost License Worker

Cloudflare Worker — validates LemonSqueezy license keys for CrossPost Desktop.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/verify` | Validate key (called by the app on activation) |
| POST | `/activate` | Activate + register instance |
| POST | `/deactivate` | Deactivate instance when app is removed |
| POST | `/webhook` | LemonSqueezy subscription lifecycle events |

## Setup (one-time)

### 1. LemonSqueezy Store

1. Go to https://app.lemonsqueezy.com → **Create a store**
   - Store slug: `crosspost-desktop`
2. Create **Products**:

   | Product | Type | Price | Variant Name |
   |---------|------|-------|--------------|
   | Solo    | Subscription (monthly) | €29 | `Solo` |
   | Pro     | Subscription (monthly) | €79 | `Pro` |
   | Agency  | Contact us | €199 | `Agency` |

3. For each product: **Licensing** tab → enable **License keys** → set activation limit = 3 (Solo) / 5 (Pro) / 20 (Agency)

4. Go to **Settings → API** → create an API key → copy it

5. Note your **Store ID** (visible in the dashboard URL: `app.lemonsqueezy.com/stores/12345/`)

### 2. Deploy the Worker

```bash
cd cloudflare-worker
npm install -g wrangler
wrangler login

# Deploy
wrangler deploy

# Set API key as secret (never in wrangler.toml)
wrangler secret put LEMON_API_KEY
# paste your LemonSqueezy API key when prompted
```

### 3. Custom domain

In Cloudflare dashboard:
1. Add `crosspost-desktop.de` as a zone (or use existing)
2. Workers → crosspost-license → Triggers → Add Custom Domain: `license.crosspost-desktop.de`

### 4. Webhook (optional — for subscription cancellations)

In LemonSqueezy → Settings → Webhooks → Add:
- URL: `https://license.crosspost-desktop.de/webhook`
- Events: `subscription_cancelled`, `subscription_expired`, `license_key_updated`

## Test

```bash
curl -X POST https://license.crosspost-desktop.de/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"YOUR-LICENSE-KEY"}'
```

Expected response:
```json
{
  "valid": true,
  "plan": "solo",
  "valid_until": "2026-08-26T...",
  "message": "Lizenz aktiv — Plan: SOLO"
}
```
