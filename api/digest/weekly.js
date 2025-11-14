const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
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

// Cache key for Redis
const DIGEST_CACHE_KEY = 'weekly-digest-cache';
const DIGEST_TTL = 24 * 60 * 60; // 24 hours in seconds

// Load cached digest from Redis
async function loadCachedDigest() {
    const redisClient = getRedisClient();
    if (!redisClient) return null;

    try {
        const cached = await redisClient.get(DIGEST_CACHE_KEY);
        if (cached) {
            const digest = JSON.parse(cached);
            console.log(`[Digest] Loaded cached digest from Redis (generated: ${digest.generated})`);
            return digest;
        }
    } catch (error) {
        console.error('[Digest] Error loading cached digest:', error.message);
    }
    return null;
}

// Save digest to Redis cache
async function saveCachedDigest(digest) {
    const redisClient = getRedisClient();
    if (!redisClient) return;

    try {
        await redisClient.set(DIGEST_CACHE_KEY, JSON.stringify(digest), 'EX', DIGEST_TTL);
        console.log('[Digest] Saved digest to Redis cache (24h TTL)');
    } catch (error) {
        console.error('[Digest] Error saving digest to cache:', error.message);
    }
}

// Serverless function handler
module.exports = async (req, res) => {
    try {
        // Try to load from Redis cache first
        const cachedDigest = await loadCachedDigest();

        if (cachedDigest) {
            const hoursSinceGeneration = (Date.now() - new Date(cachedDigest.generated).getTime()) / (1000 * 60 * 60);

            if (hoursSinceGeneration < 24) {
                console.log(`[Digest] Returning cached digest (${hoursSinceGeneration.toFixed(1)}h old)`);

                // Set cache headers to prevent browser from requesting too often
                res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
                res.setHeader('X-Digest-Source', 'redis-cache');
                res.setHeader('X-Digest-Age-Hours', hoursSinceGeneration.toFixed(1));

                return res.status(200).json(cachedDigest);
            }
        }

        // Generate fresh digest
        console.log('[Digest] Generating fresh weekly digest...');
        const digest = await generateWeeklyDigest();

        // Save to Redis cache
        await saveCachedDigest(digest);

        // Set cache headers
        res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
        res.setHeader('X-Digest-Source', 'fresh-generation');

        res.status(200).json(digest);
    } catch (error) {
        console.error('[Digest] Error in weekly digest endpoint:', error);
        res.status(500).json({
            error: 'Failed to generate weekly digest',
            message: error.message
        });
    }
};
