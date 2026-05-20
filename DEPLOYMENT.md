# CFO Pilot — Metadata Management Module
## Deployment Guide

---

## Architecture

```
┌─────────────────────────────┐
│   Next.js Frontend + API    │  Port 3000
│  (App Router + Server Comp) │
└────────────┬────────────────┘
             │
    ┌────────┴────────┐
    │   PostgreSQL     │  Port 5432
    │  (via Prisma)    │
    └────────┬────────┘
             │
    ┌────────┴─────────────┐
    │  Python FastAPI AI    │  Port 8000
    │  Validation Service   │
    └──────────────────────┘
```

---

## Prerequisites

- Node.js 18+
- Python 3.11+
- PostgreSQL 15+
- npm or yarn

---

## 1. Database Setup

```bash
# Create PostgreSQL database
createdb cfopilot_metadata

# Or using psql
psql -U postgres -c "CREATE DATABASE cfopilot_metadata;"
```

---

## 2. Environment Variables

Create a `.env` file in the `metadata-module/` directory:

```env
# Database
DATABASE_URL="postgresql://postgres:password@localhost:5432/cfopilot_metadata"

# Auth
JWT_SECRET="your-super-secret-jwt-key-min-32-chars"
JWT_EXPIRES_IN="24h"

# AI Service
AI_SERVICE_URL="http://localhost:8000"
AI_SERVICE_TIMEOUT_MS=5000

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

> ⚠️ **Never commit `.env` to git**. Add it to `.gitignore`.

---

## 3. Install Node.js Dependencies

```bash
cd metadata-module
npm install
```

Key packages installed:
- `next` — App framework
- `@prisma/client` — Database ORM
- `jose` — JWT authentication
- `bcryptjs` — Password hashing
- `xlsx` — Excel file parsing
- `sonner` — Toast notifications
- `lucide-react` — Icons
- `tailwindcss` — Styling

---

## 4. Database Migration

```bash
# Generate Prisma client
npx prisma generate

# Run migrations (creates all tables)
npx prisma migrate dev --name init

# Seed initial data (demo users, sample accounts)
npx prisma db seed
```

The seed script creates:
- 3 demo users (admin, manager, viewer)
- Sample chart of accounts
- Sample entities, departments, cost centers

---

## 5. Python AI Service

```bash
cd metadata-module/ai-service

# Create virtual environment
python -m venv venv
source venv/bin/activate     # macOS/Linux
# OR
venv\Scripts\activate        # Windows

# Install dependencies
pip install -r requirements.txt

# Run the service
python main.py
# Service starts at http://localhost:8000
# Docs at http://localhost:8000/docs
```

### Running with Docker

```bash
cd ai-service
docker build -t cfo-pilot-ai .
docker run -p 8000:8000 cfo-pilot-ai
```

---

## 6. Run the Next.js App

```bash
cd metadata-module
npm run dev
# App starts at http://localhost:3000
# Redirects to /metadata (requires login)
```

---

## 7. Production Build

```bash
npm run build
npm start
```

---

## 8. Demo Login Credentials

After running `npx prisma db seed`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@cfopilot.com | admin123 |
| Finance Manager | manager@cfopilot.com | manager123 |
| Finance User | user@cfopilot.com | user123 |
| Viewer | viewer@cfopilot.com | viewer123 |

---

## 9. Module Pages

| URL | Description | Required Role |
|-----|-------------|---------------|
| `/login` | Authentication | Public |
| `/metadata` | Dashboard with stats | All roles |
| `/metadata/accounts` | Chart of accounts | All roles |
| `/metadata/entities` | Legal entities | All roles |
| `/metadata/departments` | Department hierarchy | All roles |
| `/metadata/cost-centers` | Cost center tree | All roles |
| `/metadata/import` | Excel/CSV import wizard | Finance User+ |
| `/metadata/validation` | AI data validation | Finance User+ |
| `/metadata/audit-logs` | Change history | Finance Manager+ |

---

## 10. RBAC Matrix

| Action | Admin | Finance Manager | Finance User | Viewer |
|--------|-------|-----------------|--------------|--------|
| View metadata | ✅ | ✅ | ✅ | ✅ |
| Create/Edit | ✅ | ✅ | ✅ | ❌ |
| Delete | ✅ | ❌ | ❌ | ❌ |
| Import | ✅ | ✅ | ✅ | ❌ |
| Export | ✅ | ✅ | ✅ | ❌ |
| View audit logs | ✅ | ✅ | ❌ | ❌ |
| Run validation | ✅ | ✅ | ✅ | ❌ |

---

## 11. Deploying to Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Set environment variables in Vercel dashboard:
# DATABASE_URL, JWT_SECRET, AI_SERVICE_URL
```

> Note: The AI service needs to be deployed separately (e.g., Railway, Render, Fly.io,
> or a VPS). Update `AI_SERVICE_URL` accordingly.

---

## 12. AI Service Deployment (Railway)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Deploy from ai-service directory
cd ai-service
railway init
railway up
```

Or use the Dockerfile:
```bash
docker build -t cfo-pilot-ai .
# Push to your container registry and deploy
```

---

## 13. Running Tests

### TypeScript/JS tests
```bash
cd metadata-module
npx jest
```

### Python tests
```bash
cd ai-service
source venv/bin/activate
python -m pytest test_validators.py -v
```

---

## 14. Troubleshooting

**"Cannot connect to database"**
- Ensure PostgreSQL is running: `pg_ctl status`
- Check `DATABASE_URL` in `.env`
- Verify database exists: `psql -l`

**"JWT_SECRET must be at least 32 characters"**
- Generate a secure secret: `openssl rand -base64 32`

**"AI service timeout"**
- The app falls back to local validation automatically
- Check if the AI service is running at `AI_SERVICE_URL`
- Increase timeout in `.env`: `AI_SERVICE_TIMEOUT_MS=10000`

**"Prisma migration error"**
- Reset and retry: `npx prisma migrate reset`
- Check database permissions

**Import fails with "required columns missing"**
- Download the template from the Import page
- Ensure column headers match exactly (case insensitive): `code`, `name`, `type`

---

## 15. Project Structure

```
metadata-module/
├── prisma/
│   └── schema.prisma          # Database schema
├── src/
│   ├── app/
│   │   ├── api/               # REST API routes
│   │   │   ├── auth/          # Login, logout, me
│   │   │   └── metadata/      # CRUD + import + audit
│   │   ├── login/             # Login page
│   │   └── metadata/          # All metadata pages
│   ├── components/
│   │   ├── layout/            # Sidebar, Header
│   │   └── metadata/          # Tables, Forms, Wizard, etc.
│   ├── lib/
│   │   ├── auth.ts            # JWT utilities
│   │   ├── permissions.ts     # RBAC matrix
│   │   ├── audit.ts           # Audit logging
│   │   ├── prisma.ts          # Prisma client
│   │   └── validations.ts     # Zod schemas
│   ├── middleware.ts           # Auth middleware
│   └── types/                 # TypeScript types
├── ai-service/
│   ├── main.py                # FastAPI app
│   ├── models.py              # Pydantic models
│   ├── validators.py          # Validation logic
│   ├── test_validators.py     # Unit tests
│   ├── requirements.txt       # Python dependencies
│   └── Dockerfile             # Container config
└── DEPLOYMENT.md              # This file
```
