# ============================================================
# CashFlow Platform — Environment Variables
# Copy to .env.local and fill in your values
# ============================================================

# ─── DATABASE (Neon PostgreSQL) ──────────────────────────────
# Get from: https://console.neon.tech → your project → Connection Details
# For LOCAL DEV: paste the same connection string for both
# For PRODUCTION: DATABASE_URL = pooled, DIRECT_URL = direct (Neon provides both)
DATABASE_URL="postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/cashflow?sslmode=require"
# DIRECT_URL not needed for local dev — uncomment for production Vercel deploys
# DIRECT_URL="postgresql://user:password@ep-xxx-direct.ap-southeast-1.aws.neon.tech/cashflow?sslmode=require"

# ─── AUTH ────────────────────────────────────────────────────
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_SECRET="any-long-random-string-at-least-32-chars-change-this"
# For local dev leave AUTH_URL unset — Next.js auto-detects localhost:3000

# ─── ANTHROPIC (Claude AI) ───────────────────────────────────
# Get from: https://console.anthropic.com → API Keys
# Leave blank to run without AI matching (ML-only mode still works)
ANTHROPIC_API_KEY=""
ANTHROPIC_MODEL="claude-sonnet-4-20250514"

# ─── CLICKSEND (Email + SMS notifications) ───────────────────
# Get from: https://www.clicksend.com/au/account → API Credentials
# Leave blank to disable notifications
CLICKSEND_USERNAME=""
CLICKSEND_API_KEY=""
CLICKSEND_FROM_EMAIL=""
CLICKSEND_FROM_NAME="CashFlow AI"
CLICKSEND_FROM_PHONE=""
CLICKSEND_EMAIL_ADDRESS_ID=""

# ─── APP ─────────────────────────────────────────────────────
NEXT_PUBLIC_APP_NAME="CashFlow AI"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

# ─── CRON SECRET (protects /api/automation/scheduled) ────────
# Generate with: node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
CRON_SECRET="change-this-to-random-string"

# ─── ENCRYPTION (for storing SFTP/API passwords at rest) ─────
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY="change-this-to-random-string"
