---
name: render-vercel-devops
description: >-
  Operational runbook for deploying and managing the Milk Management backend on Render and
  the frontend/website on Vercel. Use when configuring build scripts, environment variables,
  CORS policies, keep-alive daemons, database SSL connections, or debugging cloud deployment failures.
---

# Render & Vercel DevOps Runbook

This skill covers the production deployment topology, keep-alive mechanisms, and cloud service configuration for the Milk Management system.

## Topology Overview

- **Backend**: NestJS + MikroORM PostgreSQL hosted on **Render** (`https://dairy-backend-eemp.onrender.com/`).
- **Frontend Admin Panel**: Vite/React SPA or Next.js hosted on **Vercel**.
- **Marketing / Public Website**: Next.js App Router hosted on **Vercel**.
- **Database**: Managed PostgreSQL with SSL enabled.

---

## Render Backend Deployment Guidelines

### 1. Build and Start Commands
In Render Dashboard -> Settings:
- **Build Command**:
  ```bash
  npm install && npm run build
  ```
- **Start Command**:
  ```bash
  node dist/src/main.js
  ```

### 2. Database Connection & SSL
When connecting to PostgreSQL from Render:
- Ensure `DATABASE_URL` is configured in Render environment variables.
- MikroORM PostgreSQL driver must support cloud SSL mode:
  ```typescript
  // mikro-orm.config.ts
  driverOptions: {
    connection: {
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    },
  }
  ```

### 3. Keep-Alive Strategy for Collection Shifts
Render free-tier instances sleep after 15 minutes of inactivity, causing a 50+ second cold start.
Dairy operations peak during **6:00 AM – 9:00 AM** and **5:00 PM – 8:00 PM**.
- Use the script at `backend/deploy/render-keepalive.js` which pings the health endpoint every 5 minutes.
- Can be run as a lightweight cron / external monitor (e.g. UptimeRobot or GitHub Actions cron) pinging `GET /`.

---

## Vercel Frontend Configuration

### 1. SPA Routing (`vercel.json`)
For Vite/React Single Page Applications, prevent 404s on browser reload by routing all paths to `index.html`:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### 2. Next.js Deployment on Vercel
- Zero-config deployment: Vercel automatically detects Next.js.
- Ensure build environment variable `VITE_API_URL` or `NEXT_PUBLIC_API_URL` points to `https://dairy-backend-eemp.onrender.com/`.

---

## CORS Configuration

When Vercel frontend requests the Render backend, ensure CORS allows the Vercel origins in `main.ts`:
```typescript
app.enableCors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    /\.vercel\.app$/, // Allow all Vercel preview and production deployments
    'https://yourdairycustomdomain.com',
  ],
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
  credentials: true,
});
```
