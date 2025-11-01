# Vercel Deployment Guide

## Environment Variables Required

You need to add these environment variables in your Vercel project settings:

### 1. GEMINI_API_KEY (Required for AI Categorization)
- Go to https://vercel.com/your-username/windfarm/settings/environment-variables
- Add variable: `GEMINI_API_KEY`
- Value: Your Google Gemini API key
- Apply to: Production, Preview, Development

### 2. REDIS_URL (Required for Caching)
- Add variable: `REDIS_URL`
- Value: Your Redis connection URL
- Format: `redis://default:password@host:port` or `rediss://...` for SSL
- Apply to: Production, Preview, Development

### 3. CRON_SECRET (Optional - for security)
- Add variable: `CRON_SECRET`
- Value: A random secure string (e.g., generate with `openssl rand -hex 32`)
- Apply to: Production

## How It Works

### Vercel Cron Jobs
The AI categorization now runs automatically every 10 minutes via Vercel Cron:
- Schedule: `*/10 * * * *` (every 10 minutes)
- Endpoint: `/api/cron-refresh`
- Configured in `vercel.json`

### Batch Processing
- Processes **40 NEW articles per run** (2 batches of 20)
- Smart caching: Skips articles that already have AI categories
- From your logs: You have **289 articles waiting** - will take ~7 runs (70 minutes) to categorize all

### Architecture
1. **Frontend** (Static Files): HTML, CSS, JS served from Vercel CDN
2. **API Endpoints** (Serverless Functions):
   - `/api/articles` - Returns articles with AI categories
   - `/api/health` - Health check
   - `/api/version` - Version info
   - `/api/cron-refresh` - Triggered by Vercel Cron every 10 minutes
3. **Redis Cache**: Stores articles with AI categories (7-day TTL)

## Deployment Steps

1. **Add Environment Variables**
   ```bash
   # In Vercel Dashboard
   GEMINI_API_KEY=your-key-here
   REDIS_URL=your-redis-url-here
   CRON_SECRET=your-random-secret-here
   ```

2. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Configure Vercel serverless with cron jobs"
   git push
   ```

3. **Vercel Auto-Deploy**
   - Vercel will automatically detect changes and deploy
   - Wait 2-3 minutes for deployment to complete

4. **Verify Cron is Running**
   - Check Vercel Dashboard > Deployments > Logs
   - You should see cron executions every 10 minutes
   - Look for: `= Cron job triggered - refreshing articles...`

## Testing Locally

Run the local server to process the backlog faster:
```bash
npm start
```

This will categorize 40 articles every 10 minutes. With 289 articles pending, it will take ~70 minutes to complete all.

## Monitoring

### Check AI Progress
Open developer console on https://windfarm-zeta.vercel.app:
```javascript
showAIStats()  // View AI categorization statistics
```

### Check Articles
```javascript
showArticles(10)  // View first 10 articles with AI data
```

## Adjusting Cron Frequency

Edit `vercel.json` to change frequency:
```json
{
  "crons": [
    {
      "path": "/api/cron-refresh",
      "schedule": "*/15 * * * *"  // Every 15 minutes
    }
  ]
}
```

Common schedules:
- `*/10 * * * *` - Every 10 minutes (current)
- `*/15 * * * *` - Every 15 minutes
- `*/30 * * * *` - Every 30 minutes
- `0 * * * *` - Every hour

## Redis Setup (if needed)

If you don't have Redis yet, you can use:
1. **Upstash Redis** (Vercel Integration) - Free tier available
2. **Redis Cloud** - Free 30MB tier
3. **Railway** - Deploy Redis in minutes

### Upstash (Recommended)
1. Go to Vercel Dashboard > Integrations
2. Search for "Upstash Redis"
3. Click "Add Integration"
4. Follow setup wizard
5. Environment variable `REDIS_URL` will be auto-added
