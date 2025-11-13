const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
        console.log('✓ Gemini AI initialized for digest generation');
    } catch (error) {
        console.error('Failed to initialize Gemini AI:', error.message);
    }
}

// Initialize Redis client (lazy initialization)
let redis = null;

function getRedisClient() {
    if (!redis && process.env.REDIS_URL) {
        try {
            const Redis = require('ioredis');
            redis = new Redis(process.env.REDIS_URL, {
                maxRetriesPerRequest: 3,
                enableOfflineQueue: true,
                connectTimeout: 5000,
                lazyConnect: false,
                retryStrategy: (times) => {
                    if (times > 3) return null;
                    return Math.min(times * 200, 2000);
                }
            });

            redis.on('error', (err) => {
                console.error('[Redis] Error:', err.message);
            });
        } catch (error) {
            console.error('[Redis] Failed to initialize:', error.message);
            redis = null;
        }
    }
    return redis;
}

// Load cached articles from Redis
async function loadArticlesFromCache() {
    const redisClient = getRedisClient();

    if (!redisClient) {
        console.log('[Digest] Redis not available, using empty cache');
        return [];
    }

    try {
        // Use timeout to prevent hanging
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
        const dataPromise = redisClient.get('articles-cache'); // Note: hyphen, not underscore
        const cached = await Promise.race([dataPromise, timeout]);

        if (cached) {
            const data = JSON.parse(cached);
            console.log(`[Digest] Loaded ${data.articles?.length || 0} articles from cache`);
            return data.articles || [];
        } else {
            console.log('[Digest] No cached articles found in Redis');
        }
    } catch (error) {
        console.error('[Digest] Error loading from Redis:', error.message);
    }
    return [];
}

// Generate weekly digest using Gemini AI
async function generateWeeklyDigest() {
    if (!geminiModel) {
        return {
            summary: 'AI digest not available - Gemini API key not configured',
            topStories: [],
            insights: [],
            generated: new Date().toISOString()
        };
    }

    try {
        // Get articles from cache
        const cachedArticles = await loadArticlesFromCache();

        // Get articles from the last 7 days
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const recentArticles = cachedArticles.filter(article => {
            const articleDate = new Date(article.date);
            return articleDate >= sevenDaysAgo;
        });

        if (recentArticles.length === 0) {
            return {
                summary: 'No articles found in the past 7 days',
                topStories: [],
                insights: [],
                generated: new Date().toISOString()
            };
        }

        // Prepare article data for AI (limit to top 150 most recent)
        const articlesToAnalyze = recentArticles.slice(0, 150);
        const articlesList = articlesToAnalyze.map((article, index) =>
            `${index + 1}. ${article.title} (${article.source}, ${new Date(article.date).toLocaleDateString('en-IE')})\n   ${article.description}`
        ).join('\n\n');

        const prompt = `Analyze these ${articlesToAnalyze.length} Irish wind farm news articles from the past week and create a comprehensive weekly digest. Return ONLY valid JSON (no markdown, no code blocks).

${articlesList}

Generate a weekly digest with:
1. A brief executive summary (2-3 sentences) of the week's major developments
2. Top 5 most important stories (with title and brief explanation of significance)
3. Key insights/trends (3-5 bullet points about patterns, themes, or notable developments)
4. Breakdown by category (offshore vs onshore, by province, by project stage)

Return JSON in this exact format:
{
  "summary": "Executive summary text here...",
  "topStories": [
    {"title": "Story title", "significance": "Why this matters...", "category": "offshore|onshore|policy"},
    ...5 stories total
  ],
  "insights": [
    "Key trend or pattern observed...",
    ...3-5 insights
  ],
  "breakdown": {
    "offshore": number of offshore articles,
    "onshore": number of onshore articles,
    "provinces": {"Munster": count, "Leinster": count, "Connacht": count, "Ulster": count, "National": count},
    "stages": {"planning": count, "construction": count, "operational": count}
  },
  "totalArticles": ${articlesToAnalyze.length},
  "dateRange": "Nov 6-13, 2025"
}

JSON:`;

        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let jsonText = response.text().trim();

        // Clean up response
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const digest = JSON.parse(jsonText);
        digest.generated = new Date().toISOString();
        digest.articlesAnalyzed = articlesToAnalyze.length;

        console.log('✓ Weekly digest generated successfully');
        return digest;

    } catch (error) {
        console.error('Error generating weekly digest:', error.message);
        return {
            summary: 'Error generating digest',
            topStories: [],
            insights: [],
            error: error.message,
            generated: new Date().toISOString()
        };
    }
}

// Cache for weekly digest
let digestCache = null;
let lastGenerated = null;

// Serverless function handler
module.exports = async (req, res) => {
    try {
        // Check if we have a cached digest that's less than 24 hours old
        if (digestCache && lastGenerated) {
            const hoursSinceLastDigest = (Date.now() - new Date(lastGenerated).getTime()) / (1000 * 60 * 60);
            if (hoursSinceLastDigest < 24) {
                console.log('Returning cached weekly digest');
                return res.status(200).json(digestCache);
            }
        }

        // Generate fresh digest
        console.log('Generating fresh weekly digest...');
        const digest = await generateWeeklyDigest();
        digestCache = digest;
        lastGenerated = digest.generated;

        res.status(200).json(digest);
    } catch (error) {
        console.error('Error in weekly digest endpoint:', error);
        res.status(500).json({
            error: 'Failed to generate weekly digest',
            message: error.message
        });
    }
};
