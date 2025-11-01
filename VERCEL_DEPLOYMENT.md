# Vercel Deployment Guide (Hobby Plan)

> **Note**: Vercel Cron Jobs require a Pro plan. This guide uses free alternatives for the Hobby plan.

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

### Automated Cron (Free Options)

Since Vercel Hobby plan doesn't support cron jobs, we use free alternatives:

#### **Option 1: GitHub Actions** (Recommended - Already Set Up!)
- Free for public repositories
- Runs every 10 minutes automatically
- Configured in `.github/workflows/categorize-articles.yml`
- No additional setup needed - just push to GitHub!

#### **Option 2: Cron-job.org**
1. Sign up at https://cron-job.org/en/ (free)
2. Create new cron job:
   - URL: `https://windfarm-zeta.vercel.app/api/cron-refresh`
   - Interval: Every 10 minutes
3. Done!

#### **Option 3: UptimeRobot**
1. Sign up at https://uptimerobot.com/ (free)
2. Create HTTP(s) monitor:
   - URL: `https://windfarm-zeta.vercel.app/api/cron-refresh`
   - Interval: 5 minutes (minimum)
3. Done!

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

### For GitHub Actions
Edit `.github/workflows/categorize-articles.yml`:
```yaml
on:
  schedule:
    - cron: '*/15 * * * *'  # Every 15 minutes
```

Common schedules:
- `*/10 * * * *` - Every 10 minutes (current)
- `*/15 * * * *` - Every 15 minutes
- `*/30 * * * *` - Every 30 minutes
- `0 * * * *` - Every hour

### For Cron-job.org or UptimeRobot
Simply adjust the interval in their web dashboard.

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
