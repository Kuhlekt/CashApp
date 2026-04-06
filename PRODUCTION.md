# CashFlow AI — Production Setup Checklist

## Vercel Environment Variables

### Required
```
DATABASE_URL          = postgresql://... (Neon pooled connection string)
AUTH_SECRET           = (random 32+ chars)
NEXTAUTH_URL          = https://your-domain.vercel.app
NEXT_PUBLIC_APP_URL   = https://your-domain.vercel.app
ANTHROPIC_API_KEY     = sk-ant-api03-...
CRON_SECRET           = (random string — used to authenticate cron calls)
```

### Email (ClickSend)
```
CLICKSEND_USERNAME        = your@email.com
CLICKSEND_API_KEY         = your-api-key
CLICKSEND_FROM_NAME       = CashFlow AI
CLICKSEND_FROM_EMAIL      = cashflow@yourcompany.com
CLICKSEND_EMAIL_ADDRESS_ID = 6504 (your verified sender ID)
```

### Billing (Stripe)
```
STRIPE_SECRET_KEY         = sk_live_...
STRIPE_WEBHOOK_SECRET     = whsec_...
STRIPE_PRICE_STARTER      = price_...
STRIPE_PRICE_PROFESSIONAL = price_...
STRIPE_PRICE_ENTERPRISE   = price_...
```

## Stripe Setup
1. Create products in Stripe dashboard
2. Create prices for each plan (monthly, recurring)
3. Copy price IDs to env vars above
4. Add webhook endpoint: https://your-domain.vercel.app/api/billing/webhook
5. Subscribe to events: checkout.session.completed, customer.subscription.updated/deleted, invoice.payment_failed

## Vercel Cron Jobs (configured in vercel.json)
- Trial expiry check: daily at 1am UTC → /api/cron/trial-expiry
- Automation scheduler: every 15 min → /api/automation/scheduled

## Custom Domain
1. Vercel → Project → Settings → Domains → Add domain
2. Add CNAME record at your DNS provider pointing to cname.vercel-dns.com
3. Update NEXTAUTH_URL and NEXT_PUBLIC_APP_URL to your custom domain

## Post-Deploy Checklist
- [ ] Run database migration: npx prisma db push
- [ ] Seed default org: npm run db:seed
- [ ] Test login at /login
- [ ] Test signup at /signup
- [ ] Verify Claude chat works
- [ ] Test Stripe checkout (use test mode first)
- [ ] Set up Stripe webhook
- [ ] Verify trial expiry cron fires
- [ ] Check /api/health returns healthy

## Super Admin Access
URL: /admin
Login with: admin@cashflow.ai / CashFlow2024! (or ian@kuhlekt.com)
Change password immediately after first login.

## Security Hardening (post-launch)
- [ ] Rotate AUTH_SECRET
- [ ] Enable Neon IP allowlist
- [ ] Set up Vercel password protection for preview deployments
- [ ] Configure Stripe radar rules
- [ ] Enable Vercel WAF (Pro plan)
- [ ] Set up uptime monitoring (BetterStack, etc.)
