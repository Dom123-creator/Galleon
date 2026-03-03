# EpicTale - Financial History & Market Lessons

A subscription-based educational platform delivering curated short-form audio stories about financial history, market crashes, trading legends, and economic policy decisions.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Authentication:** Clerk
- **Database:** PostgreSQL with Prisma ORM
- **Payments:** Stripe
- **File Storage:** AWS S3
- **Email:** Resend

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or cloud)
- Accounts for: Clerk, Stripe, AWS, Resend

### 1. Clone and Install

```bash
cd epictale
npm install
```

### 2. Configure Environment

```bash
# Copy the example environment file
cp .env.example .env
```

Edit `.env` with your credentials. See [Environment Setup](#environment-setup) below.

### 3. Set Up Database

```bash
# Generate Prisma client
npm run db:generate

# Run migrations
npm run db:migrate

# Seed sample data
npm run db:seed
```

### 4. Start Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Environment Setup

### Database (Required)

**Option A: Neon (Recommended - Free tier)**
1. Create account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy connection string to `DATABASE_URL`

**Option B: Supabase (Free tier)**
1. Create account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to Settings → Database → Connection string

**Option C: Docker (Local)**
```bash
docker-compose up -d db
# DATABASE_URL="postgresql://epictale:epictale_dev_password@localhost:5432/epictale"
```

### Clerk Authentication (Required)

1. Create account at [clerk.com](https://clerk.com)
2. Create a new application
3. Enable Google and LinkedIn OAuth in User & Authentication → Social Connections
4. Copy API keys to `.env`:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

**Webhook Setup (for production):**
1. Go to Webhooks in Clerk Dashboard
2. Add endpoint: `https://yourdomain.com/api/webhooks/clerk`
3. Select events: `user.created`, `user.updated`, `user.deleted`
4. Copy signing secret to `CLERK_WEBHOOK_SECRET`

### Stripe Payments (Required)

1. Create account at [stripe.com](https://stripe.com)
2. Get API keys from Developers → API Keys
3. Copy to `.env`:
   - `STRIPE_PUBLISHABLE_KEY`
   - `STRIPE_SECRET_KEY`

**Create Products:**
1. Go to Products → Add product
2. Create "Professional" - $24.99/month recurring
3. Create "Enterprise" - $199/year recurring
4. Copy price IDs to:
   - `STRIPE_PROFESSIONAL_PRICE_ID`
   - `STRIPE_ENTERPRISE_PRICE_ID`

**Webhook Setup:**
1. Go to Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/webhooks/stripe`
3. Select events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy signing secret to `STRIPE_WEBHOOK_SECRET`

**Local Testing:**
```bash
# Install Stripe CLI
stripe listen --forward-to localhost:3000/api/webhooks/stripe
```

### AWS S3 (Required for uploads)

1. Create S3 bucket in AWS Console
2. Create IAM user with S3 access
3. Configure bucket CORS:
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST"],
    "AllowedOrigins": ["http://localhost:3000", "https://yourdomain.com"],
    "ExposeHeaders": ["ETag"]
  }
]
```
4. Copy credentials to `.env`

### Resend Email (Required)

1. Create account at [resend.com](https://resend.com)
2. Verify your domain
3. Copy API key to `RESEND_API_KEY`

## Project Structure

```
epictale/
├── prisma/
│   ├── schema.prisma    # Database schema
│   └── seed.ts          # Sample data seeder
├── public/              # Static assets
├── src/
│   ├── app/             # Next.js App Router pages
│   │   ├── (main)/      # Public pages
│   │   ├── admin/       # Admin dashboard
│   │   └── api/         # API routes
│   ├── components/      # React components
│   │   ├── ui/          # Base UI components
│   │   ├── audio/       # Audio player
│   │   └── layout/      # Layout components
│   └── lib/             # Utilities and configs
│       ├── db.ts        # Prisma client
│       ├── stripe.ts    # Stripe utilities
│       ├── s3.ts        # S3 upload utilities
│       └── email.ts     # Email templates
├── .env.example         # Environment template
└── docker-compose.yml   # Local services
```

## Available Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run type-check` | TypeScript checking |
| `npm run db:generate` | Generate Prisma client |
| `npm run db:migrate` | Run database migrations |
| `npm run db:push` | Push schema to database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run db:seed` | Seed sample data |

## Subscription Tiers

| Feature | Free | Professional | Enterprise |
|---------|------|--------------|------------|
| Price | $0 | $24.99/mo | $199/yr |
| Stories/month | 3 | Unlimited | Unlimited |
| Transcripts | ✗ | ✓ | ✓ |
| Download audio | ✗ | ✗ | ✓ |
| Playback speed | ✗ | ✓ | ✓ |

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import project in Vercel
3. Add environment variables
4. Deploy

### Environment Variables for Production

Set all variables from `.env.example` in your hosting platform, plus:
- `NEXT_PUBLIC_APP_URL` = your production URL

## License

Private - All rights reserved
