# CrossPost License Worker (Stripe)

Cloudflare Worker — обрабатывает оплату через Stripe, выдаёт license keys по email,
хранит их в Cloudflare KV, валидирует при каждом запуске приложения.

## Поток

```
Лендинг → GET /checkout?plan=solo
  → Stripe Checkout (hosted, твой домен)
  → checkout.session.completed webhook
  → Worker генерирует SOLO-XXXX-XXXX-XXXX-XXXX
  → KV: license:{key} = {plan, email, status, stripe_ids}
  → Resend: письмо с ключом на email покупателя
  → Приложение: POST /verify → KV lookup → {valid, plan}
```

## Установка (один раз)

### 1. Stripe — создать продукты

В [Stripe Dashboard](https://dashboard.stripe.com/products):

| Название | Тип | Цена | Billing |
|----------|-----|------|---------|
| Solo | Subscription | €29 | monthly |
| Pro  | Subscription | €79 | monthly |

После создания скопируй **Price ID** каждого продукта (`price_xxx`) → вставь в `wrangler.toml`.

### 2. Resend — верифицировать домен

1. Зайди на [resend.com](https://resend.com) → создай аккаунт (бесплатно до 3000 писем/мес)
2. Domains → Add Domain: `andrii-it.de` → добавь DNS-записи
3. API Keys → Create API Key → скопируй

### 3. Deploy

```bash
cd cloudflare-worker

# Установи Wrangler
npm install -g wrangler
wrangler login

# Создай KV namespace — скопируй id в wrangler.toml
wrangler kv namespace create LICENSE_KV

# Деплой
wrangler deploy

# Secrets
wrangler secret put STRIPE_SECRET_KEY       # sk_live_...
wrangler secret put STRIPE_WEBHOOK_SECRET   # пока whsec_test, потом заменишь
wrangler secret put RESEND_API_KEY          # re_...
```

### 4. Stripe Webhook

В Stripe Dashboard → Developers → Webhooks → Add endpoint:
- URL: `https://crosspost-license.<subdomain>.workers.dev/webhook`  
  (или `https://license.crosspost-desktop.de/webhook` после custom domain)
- Events:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `customer.subscription.paused`
- Скопируй **Signing secret** (`whsec_...`) → `wrangler secret put STRIPE_WEBHOOK_SECRET`

### 5. Custom domain (опционально)

В Cloudflare Dashboard → Workers → crosspost-license → Settings → Domains & Routes
→ Add Custom Domain: `license.crosspost-desktop.de`

### 6. Обнови лендинг

Кнопки "Solo kaufen" и "Pro kaufen" уже ведут на Worker:
- `https://crosspost-license.<subdomain>.workers.dev/checkout?plan=solo`

Замени на реальный URL в `docs/index.html` (или custom domain).

## Тест

```bash
# Создать Checkout сессию
curl "https://crosspost-license.<subdomain>.workers.dev/checkout?plan=solo"
# → редиректит на stripe.com/checkout/...

# Проверить ключ (после тестовой оплаты)
curl -X POST https://crosspost-license.<subdomain>.workers.dev/verify \
  -H "Content-Type: application/json" \
  -d '{"token":"SOLO-ABCD-EFGH-IJKL-MNOP"}'
# → {"valid":true,"plan":"solo","valid_until":"...","message":"Lizenz aktiv — Plan: SOLO"}
```

## KV структура

| Key | Value |
|-----|-------|
| `license:{KEY}` | `{plan, email, stripe_customer_id, stripe_subscription_id, created_at, status}` |
| `customer:{stripe_customer_id}` | `{KEY}` (для отмены подписки) |
