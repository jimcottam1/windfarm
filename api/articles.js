const fetch = require('node-fetch');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Redis client (ioredis for traditional Redis)
let redis = null;
let redisReady = false;

if (process.env.REDIS_URL) {
    try {
        const Redis = require('ioredis');
        redis = new Redis(process.env.REDIS_URL, {
            maxRetriesPerRequest: 3,
            enableOfflineQueue: true, // Allow commands to queue while connecting
            connectTimeout: 10000,
            lazyConnect: false,
            retryStrategy: (times) => {
                if (times > 3) {
                    console.error('[Redis] Max retry attempts reached');
                    return null;
                }
                const delay = Math.min(times * 200, 2000);
                console.log(`[Redis] Retry attempt ${times}, waiting ${delay}ms`);
                return delay;
            }
        });

        // Connection event handlers
        redis.on('connect', () => {
            console.log('[Redis] Connecting to Redis...');
        });

        redis.on('ready', () => {
            console.log('[Redis] Successfully connected and ready');
            redisReady = true;
        });

        redis.on('error', (err) => {
            console.error('[Redis] Connection error:', err.message);
            redisReady = false;
        });

        redis.on('close', () => {
            console.log('[Redis] Connection closed');
            redisReady = false;
        });

        console.log('[Redis] Initialized with REDIS_URL');
    } catch (error) {
        console.error('[Redis] Failed to initialize:', error.message);
        redis = null;
    }
} else {
    console.log('[Redis] REDIS_URL not found - caching disabled');
}

// Initialize Gemini AI (optional - only if API key is provided)
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
        console.log('[AI] Gemini initialized for smart categorization');
    } catch (error) {
        console.log('[AI] Gemini initialization failed:', error.message);
    }
} else {
    console.log('[AI] Gemini API key not provided - AI categorization disabled');
}

// Redis Cache Helper Functions
async function loadCache() {
    if (!redis) {
        console.log('[Cache] Caching disabled - no Redis connection');
        return [];
    }

    try {
        // Wait for connection with timeout
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
        const dataPromise = redis.get('articles-cache');
        const data = await Promise.race([dataPromise, timeout]);

        if (data === null) {
            console.log('[Cache] No cached data found or timeout');
            return [];
        }

        const cached = JSON.parse(data);
        console.log(`[Cache] Loaded ${cached.length} articles from cache`);
        return cached || [];
    } catch (error) {
        console.error('[Cache] Error loading cache:', error.message);
        return [];
    }
}

async function saveCache(articles) {
    if (!redis) {
        console.log('[Cache] Caching disabled - skipping cache save');
        return false;
    }

    try {
        // Store with 7-day expiration (604800 seconds) with timeout
        const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 5000));
        const savePromise = redis.set('articles-cache', JSON.stringify(articles), 'EX', 604800);
        const result = await Promise.race([savePromise, timeout]);

        if (result === false) {
            console.log('[Cache] Save timeout after 5 seconds');
            return false;
        }

        console.log(`[Cache] Saved ${articles.length} articles to cache (7-day TTL)`);
        return true;
    } catch (error) {
        console.error('[Cache] Error saving cache:', error.message);
        return false;
    }
}

function mergeArticles(newArticles, cachedArticles) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Keep cached articles that are less than 7 days old
    const validCached = cachedArticles.filter(article => {
        const articleDate = new Date(article.date);
        return articleDate > sevenDaysAgo;
    });

    console.log(`[Merge] Valid cached articles (< 7 days): ${validCached.length}`);
    console.log(`[Merge] New articles fetched: ${newArticles.length}`);

    // Merge new and cached articles
    const allArticles = [...newArticles, ...validCached];

    // Deduplicate by title (case-insensitive)
    const seen = new Set();
    const uniqueArticles = allArticles.filter(article => {
        const key = article.title.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    console.log(`[Merge] After deduplication: ${uniqueArticles.length} articles`);
    return uniqueArticles;
}

// AI Categorization Functions
async function categorizeArticlesWithAI(articles) {
    if (!geminiModel || !articles || articles.length === 0) {
        console.log('[AI] Skipping AI categorization (no model or no articles)');
        return articles;
    }

    // Find articles that don't have AI categories yet
    const needsCategorization = articles.filter(article => !article.aiCategories);

    if (needsCategorization.length === 0) {
        console.log('[AI] All articles already have AI categories');
        return articles;
    }

    // Limit to first 40 articles to avoid timeout (can expand in subsequent runs)
    const MAX_TO_CATEGORIZE = 40;
    const articlesToProcess = needsCategorization.slice(0, MAX_TO_CATEGORIZE);

    console.log(`[AI] Categorizing ${articlesToProcess.length} of ${needsCategorization.length} articles with Gemini...`);
    if (needsCategorization.length > MAX_TO_CATEGORIZE) {
        console.log(`[AI] Remaining ${needsCategorization.length - MAX_TO_CATEGORIZE} will be categorized in next request`);
    }

    // Process in batches of 20 to avoid timeouts
    const BATCH_SIZE = 20;
    const batches = [];
    for (let i = 0; i < articlesToProcess.length; i += BATCH_SIZE) {
        batches.push(articlesToProcess.slice(i, i + BATCH_SIZE));
    }

    let totalCategorized = 0;

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex];
        console.log(`[AI] Processing batch ${batchIndex + 1}/${batches.length} (${batch.length} articles)`);

        try {
            const articlesList = batch.map((article, index) =>
                `Article ${index}:
Title: ${article.title}
Description: ${article.description}
Source: ${article.source}`
            ).join('\n\n');

            const prompt = `Analyze these ${batch.length} Irish wind energy news articles and categorize each one. Return ONLY a valid JSON array with one object per article (no markdown, no extra text).

${articlesList}

Return a JSON array in this exact format:
[
  {
    "index": 0,
    "projectStage": "planning|approved|construction|operational|objection|unknown",
    "sentiment": "positive|neutral|concerns|opposition",
    "keyTopics": ["jobs", "investment", "community", "environmental", "energy", "technology", "policy"],
    "urgency": "high|medium|low"
  },
  ... (one object for each article)
]

Rules:
- projectStage: Current stage of wind farm development
- sentiment: Overall tone of the article
- keyTopics: Array of 1-3 most relevant topics from the list above
- urgency: How timely/important the news is
- MUST return exactly ${batch.length} objects in the array

JSON:`;

            const result = await geminiModel.generateContent(prompt);
            const response = await result.response;
            let jsonText = response.text().trim();

            // Clean up response - remove markdown code blocks if present
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const categoriesArray = JSON.parse(jsonText);

            // Validate response is an array
            if (!Array.isArray(categoriesArray)) {
                console.log(`[AI] Batch ${batchIndex + 1}: Response is not an array`);
                continue;
            }

            // Apply AI categories to articles
            categoriesArray.forEach(cat => {
                if (cat.index !== undefined && cat.index < batch.length) {
                    const article = batch[cat.index];
                    article.aiCategories = {
                        projectStage: cat.projectStage,
                        sentiment: cat.sentiment,
                        keyTopics: cat.keyTopics || [],
                        urgency: cat.urgency
                    };
                    totalCategorized++;
                }
            });

            console.log(`[AI] Batch ${batchIndex + 1}: Successfully categorized ${categoriesArray.length} articles`);

        } catch (error) {
            console.log(`[AI] Batch ${batchIndex + 1} failed: ${error.message}`);
        }

        // Small delay between batches to avoid rate limiting
        if (batchIndex < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`[AI] Total categorized: ${totalCategorized}/${articlesToProcess.length}`);
    if (needsCategorization.length > totalCategorized) {
        console.log(`[AI] Note: ${needsCategorization.length - totalCategorized} articles still need categorization (will process in next run)`);
    }
    return articles;
}

// Get build info from pre-generated file
function getBuildInfo() {
    try {
        const buildInfoPath = path.join(__dirname, '..', 'build-info.json');
        const buildInfoContent = fs.readFileSync(buildInfoPath, 'utf8');
        return JSON.parse(buildInfoContent);
    } catch (error) {
        // If build-info.json doesn't exist, return null
        console.error('build-info.json not found:', error.message);
        return null;
    }
}

// Helper function to check if image URL is likely unwanted
function isUnwantedImage(imageUrl) {
    if (!imageUrl) return true;

    const url = imageUrl.toLowerCase();

    // Skip data URLs
    if (url.startsWith('data:')) return true;

    // Skip common unwanted patterns
    const unwantedPatterns = [
        'logo', 'icon', 'avatar', 'pixel', 'tracking',
        'button', 'badge', 'banner', 'ad.', 'ads.',
        'spacer', 'blank', '1x1', 'placeholder',
        'social', 'share', 'facebook', 'twitter', 'linkedin'
    ];

    return unwantedPatterns.some(pattern => url.includes(pattern));
}

// Helper function to extract og:image from article page
async function fetchArticleImage(url) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 5000 // 5 second timeout
        });

        if (!response.ok) return null;

        const html = await response.text();

        // Look for og:image meta tag
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);

        if (ogImageMatch) {
            return ogImageMatch[1];
        }

        // Fallback to twitter:image
        const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                                 html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i);

        if (twitterImageMatch) {
            return twitterImageMatch[1];
        }

        // Fallback to first suitable <img> tag in the article content
        // Look for img tags with src attribute
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        let imgMatch;

        while ((imgMatch = imgRegex.exec(html)) !== null) {
            const imgUrl = imgMatch[1];

            // Skip unwanted images
            if (isUnwantedImage(imgUrl)) continue;

            // Found a potentially good image
            return imgUrl;
        }

        return null;
    } catch (error) {
        console.error(`Error fetching image for ${url}:`, error.message);
        return null;
    }
}

// Configuration
const CONFIG = {
    GOOGLE_NEWS_FEEDS: [
        'https://news.google.com/rss/search?q=wind+farm+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=wind+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=offshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=onshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=renewable+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        // Local Limerick news sources
        'https://www.limerickpost.ie/feed/',
        // Limerick Leader sections
        'https://www.limerickleader.ie/rss.jsp?sezione=131', // Local news
        'https://www.limerickleader.ie/rss.jsp?sezione=308', // Sport
        'https://www.limerickleader.ie/rss.jsp?sezione=233', // Business
        'https://www.limerickleader.ie/rss.jsp?sezione=297', // Lifestyle
        'https://www.limerickleader.ie/rss.jsp?sezione=86',  // Opinion
        // Regional Irish news sources
        'https://www.clareecho.ie/feed/',                    // Clare Echo
        'https://www.corkbeo.ie/?service=rss'                // Cork Beo
    ],
    // Keywords to filter local news articles (same as Google News searches)
    FILTER_KEYWORDS: [
        'wind farm', 'wind energy', 'offshore wind', 'onshore wind',
        'renewable energy', 'wind power', 'wind turbine', 'windfarm',
        'solar energy', 'solar power', 'solar farm',
        'renewable power', 'green energy', 'clean energy',
        'energy project', 'power generation'
    ]
};

// Check if article matches energy-related keywords
function matchesEnergyKeywords(text) {
    const lowerText = text.toLowerCase();
    return CONFIG.FILTER_KEYWORDS.some(keyword => lowerText.includes(keyword));
}

// Province detection
function categorizeProvince(text) {
    const lowerText = text.toLowerCase();

    const munsterLocations = ['munster', 'clare', 'cork', 'kerry', 'limerick', 'tipperary', 'waterford',
        'ennis', 'shannon', 'tralee', 'killarney', 'clonmel', 'thurles', 'nenagh', 'cahir', 'dungarvan', 'lismore'];
    const leinsterLocations = ['leinster', 'dublin', 'wicklow', 'wexford', 'carlow', 'kildare', 'meath',
        'louth', 'westmeath', 'offaly', 'laois', 'longford', 'kilkenny', 'arklow', 'bray', 'drogheda',
        'dundalk', 'naas', 'newbridge', 'navan', 'trim', 'athlone', 'mullingar', 'tullamore', 'portlaoise'];
    const connachtLocations = ['connacht', 'connaught', 'galway', 'mayo', 'roscommon', 'sligo', 'leitrim',
        'castlebar', 'ballina', 'westport', 'tuam', 'ballinasloe', 'athenry'];
    const ulsterLocations = ['ulster', 'donegal', 'cavan', 'monaghan', 'letterkenny', 'buncrana', 'bundoran', 'ballyshannon'];

    for (const location of munsterLocations) {
        if (lowerText.includes(location)) return 'Munster';
    }
    for (const location of leinsterLocations) {
        if (lowerText.includes(location)) return 'Leinster';
    }
    for (const location of connachtLocations) {
        if (lowerText.includes(location)) return 'Connacht';
    }
    for (const location of ulsterLocations) {
        if (lowerText.includes(location)) return 'Ulster';
    }
    return 'National';
}

// Categorize article type
function categorizeArticle(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('offshore')) return 'offshore';
    if (lowerText.includes('onshore')) return 'onshore';
    return 'onshore';
}

// Categorize tags
function categorizeTags(text) {
    const lowerText = text.toLowerCase();
    const tags = [];

    if (lowerText.includes('offshore')) tags.push('offshore');
    if (lowerText.includes('onshore')) tags.push('onshore');
    if (lowerText.includes('planning') || lowerText.includes('approval') || lowerText.includes('permission')) {
        tags.push('planning');
    }
    if (lowerText.includes('construction') || lowerText.includes('building') || lowerText.includes('developing')) {
        tags.push('construction');
    }

    if (tags.length === 0) {
        tags.push(categorizeArticle(text));
    }
    return tags;
}

// Strip HTML tags
function stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').trim();
}

// Get placeholder image
function getPlaceholderImage(title, description) {
    const text = (title + ' ' + description).toLowerCase();

    if (text.includes('offshore')) {
        return 'https://images.unsplash.com/photo-1532601224476-15c79f2f7a51?w=800&q=80';
    } else if (text.includes('onshore')) {
        return 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=800&q=80';
    } else if (text.includes('planning') || text.includes('approval')) {
        return 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80';
    } else if (text.includes('construction') || text.includes('building')) {
        return 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&q=80';
    } else {
        return 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&q=80';
    }
}

// Fetch articles from Google News RSS
async function fetchGoogleNews() {
    console.log(`[${new Date().toISOString()}] Fetching from Google News RSS...`);

    const articles = [];
    const processedUrls = new Set();

    try {
        for (const rssUrl of CONFIG.GOOGLE_NEWS_FEEDS) {
            try {
                console.log(`Fetching: ${rssUrl}`);
                const response = await fetch(rssUrl);
                const xmlText = await response.text();

                // Parse XML
                const parser = new xml2js.Parser();
                const result = await parser.parseStringPromise(xmlText);

                if (result.rss && result.rss.channel && result.rss.channel[0].item) {
                    const items = result.rss.channel[0].item;
                    console.log(`Found ${items.length} items from feed`);

                    // Get channel title for use as fallback source
                    const channelTitle = result.rss.channel[0].title && result.rss.channel[0].title[0]
                        ? result.rss.channel[0].title[0]
                        : null;

                    // Determine default source based on URL
                    let defaultSource = 'Google News';
                    let isLocalSource = false;
                    if (rssUrl.includes('limerickpost.ie')) {
                        defaultSource = 'Limerick Post';
                        isLocalSource = true;
                    } else if (rssUrl.includes('limerickleader.ie')) {
                        defaultSource = 'Limerick Leader';
                        isLocalSource = true;
                    } else if (rssUrl.includes('clareecho.ie')) {
                        defaultSource = 'Clare Echo';
                        isLocalSource = true;
                    } else if (rssUrl.includes('corkbeo.ie')) {
                        defaultSource = 'Cork Beo';
                        isLocalSource = true;
                    } else if (channelTitle) {
                        defaultSource = channelTitle;
                    }

                    for (const item of items) {
                        const title = item.title ? item.title[0] : '';
                        const link = item.link ? item.link[0] : '#';
                        const pubDate = item.pubDate ? item.pubDate[0] : new Date().toISOString();
                        const description = item.description ? item.description[0] : '';
                        const source = item.source && item.source[0]._ ? item.source[0]._ : defaultSource;

                        // Filter local news sources by energy keywords
                        // Google News articles are already filtered by their search queries
                        if (isLocalSource) {
                            const articleText = title + ' ' + stripHTML(description);
                            if (!matchesEnergyKeywords(articleText)) {
                                continue; // Skip articles that don't match energy keywords
                            }
                            // Log when Limerick article matches energy keywords
                            console.log(`✓ LIMERICK MATCH: [${defaultSource}] ${title.substring(0, 80)}...`);
                        }

                        // Extract image from description or use placeholder
                        let image = null;
                        const imgMatch = description.match(/<img[^>]+src="([^">]+)"/i);
                        if (imgMatch) {
                            image = imgMatch[1];
                        } else {
                            image = getPlaceholderImage(title, description);
                        }

                        if (!processedUrls.has(link) && title) {
                            processedUrls.add(link);

                            articles.push({
                                title: title,
                                description: stripHTML(description).substring(0, 200) + '...',
                                source: source,
                                date: new Date(pubDate).toISOString(),
                                url: link,
                                image: image,
                                tags: categorizeTags(title + ' ' + description),
                                category: categorizeArticle(title + ' ' + description),
                                province: categorizeProvince(title + ' ' + description)
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error fetching RSS feed:`, error.message);
            }

            // Small delay between feeds
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        // Remove duplicates based on title
        const seen = new Set();
        const uniqueArticles = articles.filter(article => {
            const key = article.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // Sort by date (newest first)
        uniqueArticles.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // Limit to 400 articles
        const limitedArticles = uniqueArticles.slice(0, 400);

        // Fetch real images for articles with placeholder images (limit to first 30 to avoid timeout)
        console.log('Fetching featured images from article pages...');
        const articlesToEnhance = limitedArticles.slice(0, 30);
        let enhancedCount = 0;

        for (const article of articlesToEnhance) {
            // Check if using placeholder (Unsplash URL)
            if (article.image && article.image.includes('unsplash.com')) {
                const realImage = await fetchArticleImage(article.url);
                if (realImage) {
                    article.image = realImage;
                    enhancedCount++;
                }
                // Small delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        console.log(`Enhanced ${enhancedCount} articles with real images`);
        return limitedArticles;
    } catch (error) {
        console.error('Error in fetchGoogleNews:', error);
        throw error;
    }
}

// Vercel serverless function handler
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
        const startTime = Date.now();
        console.log(`[API] Starting article fetch at ${new Date().toISOString()}`);

        // 1. Load cached articles from Vercel KV
        const cachedArticles = await loadCache();

        // 2. Fetch fresh articles from RSS feeds
        const newArticles = await fetchGoogleNews();

        // 3. Merge cached and new articles (deduplicate, keep last 7 days)
        const mergedArticles = mergeArticles(newArticles, cachedArticles);

        // 4. Sort by date (newest first)
        mergedArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

        // 5. Limit to 400 articles
        let finalArticles = mergedArticles.slice(0, 400);
        console.log(`[API] Final article count: ${finalArticles.length}`);

        // 6. Run AI categorization on articles that don't have it yet
        if (geminiModel) {
            finalArticles = await categorizeArticlesWithAI(finalArticles);
        }

        // 7. Save to Vercel KV cache (includes AI categories)
        await saveCache(finalArticles);

        const processingTime = Date.now() - startTime;
        console.log(`[API] Total processing time: ${processingTime}ms`);

        // 8. Build and return response
        const now = new Date();
        const buildInfo = getBuildInfo();

        // Count articles with AI categories
        const aiCategorizedCount = finalArticles.filter(a => a.aiCategories).length;

        const response = {
            articles: finalArticles,
            lastUpdate: now.toISOString(),
            count: finalArticles.length,
            cached: cachedArticles.length,
            fresh: newArticles.length,
            aiCategorized: aiCategorizedCount,
            processingTime: processingTime,
            version: {
                version: version,
                feeds: 13,
                maxArticles: 400,
                cacheTTL: '7 days',
                aiEnabled: !!geminiModel,
                ...(buildInfo && { build: buildInfo })
            }
        };

        res.status(200).json(response);
    } catch (error) {
        console.error('[API] Error in serverless function:', error);
        res.status(500).json({
            error: 'Failed to fetch articles',
            message: error.message
        });
    }
};
