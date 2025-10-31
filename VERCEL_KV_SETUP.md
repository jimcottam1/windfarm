# Vercel KV Setup Guide

This guide explains how to set up Vercel KV for persistent caching in the Ireland Wind Farm News application.

## What is Vercel KV?

Vercel KV is a serverless Redis database that provides:
- **Persistent storage** across all serverless function invocations
- **Shared state** between all function containers
- **Fast performance** with global edge network
- **7-day cache** for articles with automatic expiration
- **AI categorization persistence** - articles are only categorized once

## Benefits for This Application

### Without Vercel KV (File System Only):
- ❌ Cache lost between deployments
- ❌ Each container has separate cache
- ❌ AI categories recalculated unnecessarily
- ❌ Inconsistent data across requests
- ❌ Wasted API calls to RSS feeds and Gemini

### With Vercel KV:
- ✅ Cache persists across all deployments
- ✅ All containers share same cache
- ✅ AI categories preserved (saves money)
- ✅ Consistent data for all users
- ✅ Reduced RSS feed fetching
- ✅ Better performance

## Setup Instructions

### Step 1: Create KV Database in Vercel

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your project (windfarm)
3. Navigate to **Storage** tab
4. Click **Create Database**
5. Select **KV (Redis)**
6. Name it: `windfarm-cache`
7. Select region: Choose closest to your users (e.g., `iad1` for US East)
8. Click **Create**

Vercel will automatically add these environment variables to your project:
```
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...
```

### Step 2: Verify Environment Variables

1. Go to **Settings** → **Environment Variables**
2. Confirm you see the three KV variables listed above
3. They should be available for all environments (Production, Preview, Development)

### Step 3: Add Gemini API Key (Optional, for AI Categorization)

If you want AI-powered categorization:

1. Get a Gemini API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. In Vercel Dashboard → **Settings** → **Environment Variables**
3. Add new variable:
   - **Name**: `GEMINI_API_KEY`
   - **Value**: Your Gemini API key
   - **Environments**: Production, Preview, Development
4. Click **Save**

### Step 4: Redeploy

After adding the KV database and environment variables:

```bash
git add .
git commit -m "Add Vercel KV caching support"
git push
```

Vercel will automatically redeploy with KV enabled.

### Step 5: Verify It's Working

After deployment, check the function logs in Vercel:

1. Go to **Deployments** → Select latest deployment
2. Click on **Functions** tab
3. Find the `api/articles` function
4. Look for these log messages:

```
[KV] Loaded 0 articles from cache          (first run)
[KV] Saved 400 articles to cache (7-day TTL)
```

On subsequent requests:
```
[KV] Loaded 400 articles from cache
[AI] All articles already have AI categories
```

## Local Development

To test KV locally:

### Option 1: Use Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Link to your project
vercel link

# Pull environment variables (includes KV credentials)
vercel env pull

# Run development server with KV access
vercel dev
```

### Option 2: Mock KV Locally

Create a `.env.local` file (for local testing without real KV):

```bash
# Mock KV locally by setting empty values
KV_REST_API_URL=http://localhost:6379
KV_REST_API_TOKEN=mock-token
```

The app will gracefully handle KV failures and fall back to fetching fresh data.

## How It Works

### 1. **First Request** (Cold Start)
```
User Request → Load from KV (empty) → Fetch RSS feeds
→ Categorize with AI (if enabled) → Save to KV → Return articles
```

### 2. **Subsequent Requests** (Cache Hit)
```
User Request → Load from KV (400 articles)
→ Fetch new RSS items → Merge with cache → Deduplicate
→ AI categorize only new articles → Update KV → Return articles
```

### 3. **Cache Management**
- Articles older than **7 days** are automatically removed
- Cache has **7-day TTL** (auto-expires after 7 days)
- Articles are deduplicated by title
- AI categories persist across requests

## Data Stored in KV

### Key: `articles-cache`
**Type**: JSON Array
**Size**: ~800 KB (400 articles with AI data)
**TTL**: 7 days (604800 seconds)
**Structure**:
```json
[
  {
    "title": "Article title",
    "description": "Article description...",
    "source": "Source name",
    "date": "2025-10-31T12:00:00.000Z",
    "url": "https://...",
    "image": "https://...",
    "tags": ["offshore", "planning"],
    "category": "offshore",
    "province": "Munster",
    "aiCategories": {
      "projectStage": "planning",
      "sentiment": "positive",
      "keyTopics": ["jobs", "investment"],
      "urgency": "high"
    }
  }
]
```

## Cost Estimate

For typical usage of Ireland Wind Farm News:

| Resource | Usage | Free Tier Limit | Status |
|----------|-------|-----------------|---------|
| Storage | ~1 MB | 256 MB | ✅ Well within |
| Commands/day | ~100-200 | 3,000 | ✅ Well within |
| Bandwidth | ~10 MB/month | 100 GB | ✅ Well within |

**Expected Cost**: **$0/month** (free tier sufficient)

## Monitoring KV Usage

### Via Vercel Dashboard:
1. Go to **Storage** tab
2. Select `windfarm-cache` database
3. View metrics:
   - Commands per day
   - Storage used
   - Bandwidth

### Via Code (Response Metadata):
The API returns cache statistics:
```json
{
  "count": 400,
  "cached": 350,
  "fresh": 75,
  "aiCategorized": 400,
  "processingTime": 2500
}
```

## Troubleshooting

### Issue: "KV Error loading cache"
**Solution**: Check that environment variables are set correctly in Vercel Dashboard

### Issue: AI categorization not working
**Solutions**:
1. Verify `GEMINI_API_KEY` is set in environment variables
2. Check function logs for AI errors
3. Ensure you're on Vercel Pro plan if timeout occurs (60s limit vs 10s)

### Issue: Cache not persisting
**Solution**: Verify KV database is created and linked to your project

### Issue: Timeout errors
**Solutions**:
1. Reduce AI batch size in code (currently 20 articles per batch)
2. Upgrade to Vercel Pro for 60-second timeout
3. Disable AI categorization temporarily

## Maintenance

### Clear Cache
If you need to clear the cache:

```bash
# Using Vercel CLI with Redis commands
vercel env pull
# Then use a Redis client to connect and run:
# DEL articles-cache
```

Or wait 7 days for automatic expiration.

### Update Cache Structure
If you change article schema:
1. Update the code
2. Clear the cache (or wait 7 days)
3. New structure will be cached on next request

## Additional Resources

- [Vercel KV Documentation](https://vercel.com/docs/storage/vercel-kv)
- [Redis Commands Reference](https://redis.io/commands)
- [@vercel/kv Package](https://www.npmjs.com/package/@vercel/kv)

## Support

For issues with Vercel KV:
- Vercel Support: https://vercel.com/support
- Community: https://github.com/vercel/vercel/discussions
