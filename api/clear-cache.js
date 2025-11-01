// Manual cache clearing endpoint
// Call this to immediately clear the Redis cache and force fresh article fetch
module.exports = async (req, res) => {
    // Verify authorization
    const authHeader = req.headers.authorization;

    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        // Initialize Redis client
        let redis = null;

        if (process.env.REDIS_URL) {
            const Redis = require('ioredis');
            redis = new Redis(process.env.REDIS_URL);

            // Delete the cache key
            await redis.del('articles-cache');
            await redis.quit();

            res.status(200).json({
                success: true,
                message: 'Cache cleared successfully',
                timestamp: new Date().toISOString()
            });
        } else {
            res.status(200).json({
                success: false,
                message: 'No Redis cache configured'
            });
        }
    } catch (error) {
        console.error('Error clearing cache:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
