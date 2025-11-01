// This endpoint triggers article refresh by calling the articles API
// Used by GitHub Actions cron job every 10 minutes
module.exports = async (req, res) => {
    // Verify authorization (optional security check)
    const authHeader = req.headers.authorization;

    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        console.log('🔄 Cron job triggered - refreshing articles...');

        // Import and call the articles handler directly
        const articlesHandler = require('./articles');

        // Create a mock request/response to capture the result
        let capturedData = null;
        const mockRes = {
            setHeader: () => {},
            status: (code) => ({
                json: (data) => {
                    capturedData = data;
                    return mockRes;
                },
                end: () => {}
            })
        };

        // Call the articles API handler
        await articlesHandler(req, mockRes);

        // Return success response
        res.status(200).json({
            success: true,
            articlesProcessed: capturedData?.articles?.length || 0,
            totalArticles: capturedData?.totalArticles || 0,
            aiCategorized: capturedData?.aiCategorized || 0,
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
