#!/bin/bash
# fix.sh — Run from inside cashflow-platform/ in Git Bash
# Patches schema.prisma and creates .env.local

echo ""
echo "CashFlow Platform — Applying fixes..."
echo ""

# ── 1. Patch prisma/schema.prisma ─────────────────────────────────────────────
SCHEMA="prisma/schema.prisma"
if [ ! -f "$SCHEMA" ]; then
    echo "✗ $SCHEMA not found. Are you in the cashflow-platform/ folder?"
    exit 1
fi

# Comment out the directUrl line
sed -i 's/^\s*directUrl\s*=\s*env("DIRECT_URL").*$/  \/\/ directUrl = env("DIRECT_URL") \/\/ production only/' "$SCHEMA"
echo "✓ prisma/schema.prisma — directUrl commented out"

# ── 2. Create .env.local if missing ───────────────────────────────────────────
if [ ! -f ".env.local" ]; then
    cat > .env.local << 'ENVEOF'
# CashFlow Platform — Local Environment
# REPLACE DATABASE_URL with your actual Neon connection string!
# Get it from: https://console.neon.tech → your project → Connection Details

DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@ep-YOUR-ID.YOUR-REGION.aws.neon.tech/cashflow?sslmode=require"
AUTH_SECRET="cashflow-dev-secret-change-this-in-production-2024"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="CashFlow AI"
CRON_SECRET="dev-cron-secret"
ENCRYPTION_KEY="dev-encryption-key-32-chars-minimum"
ANTHROPIC_API_KEY=""
CLICKSEND_USERNAME=""
CLICKSEND_API_KEY=""
CLICKSEND_FROM_EMAIL=""
CLICKSEND_FROM_NAME="CashFlow AI"
CLICKSEND_EMAIL_ADDRESS_ID=""
ENVEOF
    echo "✓ .env.local created"
    echo ""
    echo "*** EDIT .env.local NOW — replace DATABASE_URL with your Neon URL ***"
    echo "    https://console.neon.tech → project → Connection Details"
    echo ""
else
    # Check if DATABASE_URL looks real (not placeholder)
    if grep -q "YOUR_USER\|YOUR_PASSWORD\|xxx\|user:password" .env.local 2>/dev/null; then
        echo "⚠  .env.local has placeholder DATABASE_URL — edit it with your real Neon URL"
    elif grep -q "DATABASE_URL" .env.local; then
        echo "✓ .env.local found with DATABASE_URL"
    else
        echo "⚠  .env.local found but DATABASE_URL may be missing"
    fi
fi

# ── 3. Check for stray package-lock.json ──────────────────────────────────────
STRAY="/c/Users/$USERNAME/package-lock.json"
if [ -f "$STRAY" ]; then
    echo ""
    echo "⚠  Found stray package-lock.json at $STRAY"
    read -p "   Delete it to fix the Next.js workspace warning? (y/n): " ans
    if [ "$ans" = "y" ]; then
        rm "$STRAY"
        echo "✓ Deleted $STRAY"
    fi
fi

echo ""
echo "────────────────────────────────────────"
echo "Next steps — run IN THIS ORDER:"
echo ""
echo "  1. Edit .env.local (add your real Neon DATABASE_URL)"
echo "  2. npx prisma generate"
echo "  3. npx prisma db push"
echo "  4. npm run db:seed"
echo "  5. npm run dev"
echo "────────────────────────────────────────"
