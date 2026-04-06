# CashFlow AI — Production Platform

> Governed cash application platform with AI-powered invoice matching, automated file pickup, region management, and ERP delivery.

## Stack
- **Frontend/API**: Next.js 14 → Vercel (Sydney `syd1`)
- **Database**: Neon PostgreSQL (serverless, connection pooling)
- **Auth**: NextAuth v5 + Prisma adapter (JWT)
- **AI Matching**: Anthropic Claude claude-sonnet-4-20250514
- **Notifications**: ClickSend (email + SMS)
- **Scheduler**: Railway (persistent cron) + GitHub Actions (15-min trigger)
- **CI/CD**: GitHub Actions → lint → Neon migrate → Vercel + Railway deploy

## Quick Start

```bash
npm install
cp .env.example .env.local   # Add Neon, Anthropic, ClickSend keys
npx prisma db push
npm run db:seed
npm run dev
```

## Deployment

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the complete step-by-step guide covering:
- GitHub Secrets setup
- Neon database configuration and branching strategy
- Vercel deployment with function timeout config
- Railway cron service setup
- ClickSend sender verification
- Anthropic API key management
- Security hardening checklist
- Cost breakdown

## Key Features

| Feature | Implementation |
|---------|---------------|
| Scheduled runs | GitHub Actions cron + Railway node-cron |
| Bank file pickup | URL/SFTP/S3 with retry logic |
| Debtors pickup | URL/API/CSV with region routing |
| ML matching | Historical pattern matching (Neon `MLRecord`) |
| AI matching | Claude claude-sonnet-4-20250514 fuzzy match + reasoning |
| Exception handling | AI classification + suggested action |
| Output delivery | POST URL / SFTP / S3 |
| ERP file formats | SAP IDOC / CSV / JSON / Oracle AR / NetSuite / Xero |
| Notifications | ClickSend email + SMS on batch complete, exceptions, approvals |
| Audit chain | SHA-256 tamper-evident rolling hash |
| Multi-region | Per-region debtors source + bank account filter |
| Governance | Approval thresholds, dual approval, hash verify |

## Environment Variables

See `.env.example` for all required variables with documentation.

## License
Proprietary — Hindle Consultants / Kuhlekt
