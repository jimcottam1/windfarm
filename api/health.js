// Initialize Redis
let redis = null;
if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: true
    });
}

// Vercel serverless function for health check
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS request for CORS preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        let cacheData = null;
        let cronData = null;

        // Try to get cache and cron status from Redis
        if (redis) {
            try {
                const cacheRaw = await redis.get('articles-cache');
                const cronRaw = await redis.get('cron:last-run');

                if (cacheRaw) {
                    cacheData = JSON.parse(cacheRaw);
                }
                if (cronRaw) {
                    cronData = JSON.parse(cronRaw);
                }
            } catch (error) {
                console.error('Redis error:', error.message);
            }
        }

        const response = {
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Serverless function is running',
            cache: cacheData ? {
                articlesCount: cacheData.articles?.length || 0,
                lastUpdate: new Date(cacheData.timestamp).toISOString(),
                ageMinutes: Math.round((Date.now() - cacheData.timestamp) / 1000 / 60)
            } : null,
            cron: cronData ? {
                lastRun: new Date(cronData.timestamp).toISOString(),
                minutesAgo: Math.round((Date.now() - cronData.timestamp) / 1000 / 60),
                articlesProcessed: cronData.articlesProcessed,
                articlesFiltered: cronData.articlesFiltered,
                newsApiCount: cronData.newsApiCount,
                rssCount: cronData.rssCount,
                success: cronData.success
            } : null
        };

        res.status(200).json(response);
    } catch (error) {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            message: 'Serverless function is running',
            error: 'Could not fetch cache/cron status'
        });
    }
};
