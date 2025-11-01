const { fetchAndProcessArticles } = require('../lib/news-fetcher');

// This endpoint will be called by Vercel Cron
module.exports = async (req, res) => {
    // Verify this is coming from Vercel Cron (optional security check)
    const authHeader = req.headers.authorization;

    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('🔄 Cron job triggered - refreshing articles...');
        const result = await fetchAndProcessArticles();

        res.status(200).json({
            success: true,
            articlesProcessed: result.articles.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error in cron refresh:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
