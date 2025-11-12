require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const cron = require('node-cron');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const NewsAPI = require('newsapi');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Activity log for frontend to consume
const activityLog = [];
const MAX_LOG_ENTRIES = 100;

function logActivity(type, message, details = {}) {
    const entry = {
        timestamp: new Date().toISOString(),
        type, // 'info', 'success', 'error', 'ai'
        message,
        details
    };
    activityLog.unshift(entry); // Add to beginning
    if (activityLog.length > MAX_LOG_ENTRIES) {
        activityLog.pop(); // Remove oldest
    }
    console.log(`[${type.toUpperCase()}] ${message}`);
}

// Get git commit info for build tracking
function getGitInfo() {
    try {
        const commitHash = execSync('git rev-parse HEAD').toString().trim();
        const commitShort = execSync('git rev-parse --short HEAD').toString().trim();
        const commitDate = execSync('git log -1 --format=%cI').toString().trim();
        const commitMessage = execSync('git log -1 --format=%s').toString().trim();
        const branch = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();

        return {
            commit: commitShort,
            commitFull: commitHash,
            commitDate: commitDate,
            commitMessage: commitMessage,
            branch: branch
        };
    } catch (error) {
        // If git is not available or not a git repo, return null
        return null;
    }
}

// Build info
const gitInfo = getGitInfo();
const BUILD_INFO = {
    version: version,
    serverStarted: new Date().toISOString(),
    feeds: 13,
    maxArticles: 400,
    ...(gitInfo && {
        git: gitInfo
    })
};

// Initialize Gemini AI (optional - only if API key is provided)
let genAI = null;
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
    try {
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
        console.log('✓ Gemini AI initialized for smart categorization');
    } catch (error) {
        console.log('✗ Gemini AI initialization failed:', error.message);
    }
} else {
    console.log('ℹ Gemini API key not provided - AI categorization disabled');
}

// Initialize NewsAPI (optional - only if API key is provided)
let newsapi = null;
if (process.env.NEWSAPI_KEY) {
    try {
        newsapi = new NewsAPI(process.env.NEWSAPI_KEY);
        console.log('✓ NewsAPI initialized for news aggregation');
    } catch (error) {
        console.log('✗ NewsAPI initialization failed:', error.message);
    }
} else {
    console.log('ℹ NewsAPI key not provided - using RSS feeds only');
}

// Verify articles are about wind farms using Gemini AI (batch processing)
async function verifyArticleRelevance(articles) {
    if (!geminiModel || !articles || articles.length === 0) {
        return articles.map(() => true); // If no AI, accept all
    }

    try {
        const articlesList = articles.map((article, index) =>
            `Article ${index}: ${article.title}`
        ).join('\n');

        const prompt = `Analyze these news article titles and determine if they are directly related to wind farms, wind turbines, or wind energy projects in Ireland. Return ONLY a valid JSON array (no markdown, no extra text).

${articlesList}

For each article, return true if it's about:
- Wind farms (onshore or offshore)
- Wind turbines or wind energy projects
- Wind energy policy, planning, construction, or operations
- Community impacts of wind farms
- Wind energy investment or development

Return false if it's about:
- General renewable energy without specific wind focus
- Solar, hydro, or other non-wind energy
- Generic energy policy without wind specifics
- Air pollution or other environmental topics not related to wind
- General company news unless specifically about wind projects

Return a JSON array in this exact format:
[true, false, true, ...]

One boolean for each of the ${articles.length} articles, in order.

JSON:`;

        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let jsonText = response.text().trim();

        // Clean up response
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const relevanceArray = JSON.parse(jsonText);

        if (!Array.isArray(relevanceArray)) {
            console.log(`  ✗ AI relevance check returned invalid format`);
            return articles.map(() => true); // Accept all if AI fails
        }

        return relevanceArray;
    } catch (error) {
        console.log(`  ✗ AI relevance check failed: ${error.message}`);
        return articles.map(() => true); // Accept all if AI fails
    }
}

// Categorize multiple articles using Gemini AI (batch processing)
async function categorizeArticlesWithAI(articles) {
    if (!geminiModel || !articles || articles.length === 0) {
        return [];
    }

    try {
        // Build article list for prompt
        const articlesList = articles.map((article, index) =>
            `Article ${index}:
Title: ${article.title}
Description: ${article.description}
Source: ${article.source}`
        ).join('\n\n');

        const prompt = `Analyze these ${articles.length} Irish wind energy news articles and categorize each one. Return ONLY a valid JSON array with one object per article (no markdown, no extra text).

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
- MUST return exactly ${articles.length} objects in the array

JSON:`;

        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        let jsonText = response.text().trim();

        // Clean up response - remove markdown code blocks if present
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const categoriesArray = JSON.parse(jsonText);

        // Validate response is an array
        if (!Array.isArray(categoriesArray)) {
            console.log(`  ✗ AI response is not an array`);
            return [];
        }

        // Validate each category has required fields
        const validCategories = categoriesArray.filter(cat =>
            cat.projectStage && cat.sentiment && cat.keyTopics && cat.index !== undefined
        );

        return validCategories;
    } catch (error) {
        console.log(`  ✗ Batch AI categorization failed: ${error.message}`);
        return [];
    }
}

// Helper function to check if image URL is likely unwanted
function isUnwantedImage(imageUrl) {
    if (!imageUrl) return true;
    const url = imageUrl.toLowerCase();
    if (url.startsWith('data:')) return true;

    // Filter out Google News images (they're low quality thumbnails)
    if (url.includes('gstatic.com') || url.includes('ggpht.com') || url.includes('googleusercontent.com')) return true;

    const unwantedPatterns = [
        'logo', 'icon', 'avatar', 'pixel', 'tracking',
        'button', 'badge', 'banner', 'ad.', 'ads.',
        'spacer', 'blank', '1x1', 'placeholder',
        'social', 'share', 'facebook', 'twitter', 'linkedin',
        'gravatar', 'emoji', 'gif'
    ];
    return unwantedPatterns.some(pattern => url.includes(pattern));
}

// Helper function to extract article promo/hero image and content from article page
async function fetchArticleData(url, title) {
    try {
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Cache-Control': 'no-cache'
            },
            timeout: 8000,
            follow: 5
        });
        if (!response.ok) return { image: null, summary: null };
        const html = await response.text();

        let image = null;

        // Priority 1: Look for og:image meta tag (best quality)
        const ogImageMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                            html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["'][^>]*>/i);
        if (ogImageMatch && !isUnwantedImage(ogImageMatch[1])) {
            console.log(`  ✓ Found og:image for ${url.substring(0, 50)}`);
            image = ogImageMatch[1];
        }

        // Priority 2: Twitter card image
        if (!image) {
            const twitterImageMatch = html.match(/<meta[^>]*name=["']twitter:image["'][^>]*content=["']([^"']+)["'][^>]*>/i) ||
                                     html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']twitter:image["'][^>]*>/i);
            if (twitterImageMatch && !isUnwantedImage(twitterImageMatch[1])) {
                console.log(`  ✓ Found twitter:image for ${url.substring(0, 50)}`);
                image = twitterImageMatch[1];
            }
        }

        // Priority 3: Look for article/hero/featured images by class/id
        if (!image) {
            const heroPatterns = [
                /<img[^>]*class=["'][^"']*(?:hero|featured|article-image|main-image|lead-image|promo)[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i,
                /<img[^>]*id=["'][^"']*(?:hero|featured|article-image|main-image)[^"']*["'][^>]*src=["']([^"']+)["'][^>]*>/i,
                /<picture[^>]*>[\s\S]*?<img[^>]*src=["']([^"']+)["'][^>]*>/i
            ];

            for (const pattern of heroPatterns) {
                const match = html.match(pattern);
                if (match && !isUnwantedImage(match[1])) {
                    console.log(`  ✓ Found hero image for ${url.substring(0, 50)}`);
                    image = match[1];
                    break;
                }
            }
        }

        // Priority 4: First large image in article content
        if (!image) {
            const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
            let imgMatch;
            let candidateImages = [];

            while ((imgMatch = imgRegex.exec(html)) !== null) {
                const imgUrl = imgMatch[1];
                const fullMatch = imgMatch[0];

                // Skip if unwanted
                if (isUnwantedImage(imgUrl)) continue;

                // Check if image has width/height attributes suggesting it's large enough
                const widthMatch = fullMatch.match(/width=["']?(\d+)/i);
                const heightMatch = fullMatch.match(/height=["']?(\d+)/i);

                const width = widthMatch ? parseInt(widthMatch[1]) : 0;
                const height = heightMatch ? parseInt(heightMatch[1]) : 0;

                // Prefer images that are at least 400px wide or don't specify size
                if (width === 0 || width >= 400) {
                    candidateImages.push(imgUrl);
                }
            }

            if (candidateImages.length > 0) {
                console.log(`  ✓ Found candidate image for ${url.substring(0, 50)}`);
                image = candidateImages[0];
            }
        }

        return { image };
    } catch (error) {
        console.log(`  ✗ Error fetching ${url.substring(0, 50)}: ${error.message}`);
        return { image: null };
    }
}

// Enable CORS for all origins
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from public directory

// Configuration
const CONFIG = {
    GOOGLE_NEWS_FEEDS: [
        'https://news.google.com/rss/search?q=wind+farm+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=wind+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=offshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=onshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=renewable+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en'
    ],
    REFRESH_INTERVAL: 10 // minutes
};

// Cache configuration
const CACHE_FILE = path.join(__dirname, '.cache', 'articles-cache.json');
const CACHE_MAX_AGE_DAYS = 7; // Keep articles for 7 days

// In-memory cache
let cachedArticles = [];
let lastFetchTime = null;
let lastNewsAPIFetch = null;
let isFetching = false;
const NEWSAPI_FETCH_INTERVAL_HOURS = 1; // Fetch from NewsAPI only once per hour to stay within 100 req/day limit

// Ensure cache directory exists
function ensureCacheDirectory() {
    const cacheDir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(cacheDir)) {
        fs.mkdirSync(cacheDir, { recursive: true });
    }
}

// Load cached articles from file
function loadCachedArticles() {
    try {
        ensureCacheDirectory();
        if (fs.existsSync(CACHE_FILE)) {
            const data = fs.readFileSync(CACHE_FILE, 'utf8');
            const parsed = JSON.parse(data);

            // Filter out old articles (older than CACHE_MAX_AGE_DAYS)
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_AGE_DAYS);

            const validArticles = parsed.articles.filter(article => {
                const articleDate = new Date(article.date);
                return articleDate >= cutoffDate;
            });

            console.log(`Loaded ${validArticles.length} cached articles from disk (${parsed.articles.length - validArticles.length} expired)`);
            return validArticles;
        }
    } catch (error) {
        console.error('Error loading cached articles:', error.message);
    }
    return [];
}

// Save articles to cache file
function saveCachedArticles(articles) {
    try {
        ensureCacheDirectory();
        const cacheData = {
            timestamp: Date.now(),
            articles: articles
        };
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheData, null, 2), 'utf8');
        console.log(`Saved ${articles.length} articles to disk cache`);
    } catch (error) {
        console.error('Error saving cached articles:', error.message);
    }
}

// Merge new articles with cached ones, preserving AI categories
function mergeArticlesWithCache(newArticles, cachedArticles) {
    const merged = [...newArticles];
    const newArticleUrls = new Set(newArticles.map(a => a.url));

    // Add cached articles that aren't in the new feed (but keep their AI categories)
    cachedArticles.forEach(cachedArticle => {
        if (!newArticleUrls.has(cachedArticle.url) && cachedArticle.aiCategories) {
            // Check if article is still within cache age
            const articleDate = new Date(cachedArticle.date);
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - CACHE_MAX_AGE_DAYS);

            if (articleDate >= cutoffDate) {
                merged.push(cachedArticle);
            }
        }
    });

    // For articles in both new and cached, preserve AI categories from cache
    merged.forEach(article => {
        const cached = cachedArticles.find(c => c.url === article.url);
        if (cached && cached.aiCategories && !article.aiCategories) {
            article.aiCategories = cached.aiCategories;
        }
    });

    return merged;
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

// Fetch articles from NewsAPI
async function fetchNewsAPI() {
    if (!newsapi) {
        console.log('NewsAPI not initialized, skipping...');
        return [];
    }

    // Check if we've fetched recently to avoid exceeding rate limit
    if (lastNewsAPIFetch) {
        const hoursSinceLastFetch = (Date.now() - lastNewsAPIFetch) / (1000 * 60 * 60);
        if (hoursSinceLastFetch < NEWSAPI_FETCH_INTERVAL_HOURS) {
            console.log(`NewsAPI: Skipping (last fetch ${hoursSinceLastFetch.toFixed(1)}h ago, waiting ${NEWSAPI_FETCH_INTERVAL_HOURS}h between fetches)`);
            return [];
        }
    }

    console.log('Fetching from NewsAPI...');
    const articles = [];
    const processedUrls = new Set();

    try {
        // Search for wind energy news in Ireland
        // Using multiple searches to maximize relevant results
        const queries = [
            'wind farm Ireland',
            'wind energy Ireland',
            'offshore wind Ireland'
        ];

        for (const query of queries) {
            try {
                const response = await newsapi.v2.everything({
                    q: query,
                    language: 'en',
                    sortBy: 'publishedAt',
                    pageSize: 20, // Limit results per query to manage rate limit
                    domains: 'irishtimes.com,independent.ie,rte.ie,thejournal.ie,businesspost.ie,examiner.ie'
                });

                if (response.articles && response.articles.length > 0) {
                    console.log(`Found ${response.articles.length} articles for "${query}"`);

                    for (const item of response.articles) {
                        const url = item.url || '#';

                        if (!processedUrls.has(url) && item.title) {
                            processedUrls.add(url);

                            const article = {
                                title: item.title,
                                description: item.description || item.content?.substring(0, 200) + '...' || '',
                                source: item.source.name || 'NewsAPI',
                                date: new Date(item.publishedAt).toISOString(),
                                url: url,
                                image: item.urlToImage || getPlaceholderImage(item.title, item.description || ''),
                                tags: categorizeTags(item.title + ' ' + (item.description || '')),
                                category: categorizeArticle(item.title + ' ' + (item.description || '')),
                                province: categorizeProvince(item.title + ' ' + (item.description || ''))
                            };

                            articles.push(article);
                        }
                    }
                }

                // Small delay between queries to be respectful of API
                await new Promise(resolve => setTimeout(resolve, 500));

            } catch (error) {
                console.error(`Error fetching from NewsAPI for "${query}":`, error.message);
            }
        }

        console.log(`NewsAPI returned ${articles.length} unique articles`);

        // Update last fetch time
        lastNewsAPIFetch = Date.now();

        return articles;

    } catch (error) {
        console.error('Error in fetchNewsAPI:', error.message);
        return [];
    }
}

// Fetch articles from Google News RSS
async function fetchGoogleNews() {
    if (isFetching) {
        console.log('Already fetching, skipping...');
        return;
    }

    isFetching = true;
    console.log(`[${new Date().toISOString()}] Fetching news from all sources...`);

    // Load previously cached articles (including AI categories)
    const previouslyCached = loadCachedArticles();

    const articles = [];
    const processedUrls = new Set();
    let realImageCount = 0;
    let placeholderCount = 0;

    try {
        // Fetch from NewsAPI first (if available)
        const newsApiArticles = await fetchNewsAPI();
        console.log(`NewsAPI provided ${newsApiArticles.length} articles`);

        // Add NewsAPI articles to our collection
        newsApiArticles.forEach(article => {
            if (!processedUrls.has(article.url)) {
                processedUrls.add(article.url);
                articles.push(article);
            }
        });

        // Then fetch from Google News RSS feeds
        console.log('Fetching from Google News RSS feeds...');
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

                    for (const item of items) {
                        const title = item.title ? item.title[0] : '';
                        const link = item.link ? item.link[0] : '#';
                        const pubDate = item.pubDate ? item.pubDate[0] : new Date().toISOString();
                        const description = item.description ? item.description[0] : '';
                        const source = item.source && item.source[0]._ ? item.source[0]._ : 'Google News';

                        // Extract image from description, but filter out Google images
                        let image = null;
                        const imgMatch = description.match(/<img[^>]+src="([^">]+)"/i);
                        if (imgMatch && !isUnwantedImage(imgMatch[1])) {
                            image = imgMatch[1];
                            realImageCount++;
                        } else {
                            // Use placeholder for now, will try to fetch real image later
                            image = getPlaceholderImage(title, description);
                            placeholderCount++;
                        }

                        if (!processedUrls.has(link) && title) {
                            processedUrls.add(link);

                            const article = {
                                title: title,
                                description: stripHTML(description).substring(0, 200) + '...',
                                source: source,
                                date: new Date(pubDate).toISOString(),
                                url: link,
                                image: image,
                                tags: categorizeTags(title + ' ' + description),
                                category: categorizeArticle(title + ' ' + description),
                                province: categorizeProvince(title + ' ' + description)
                            };

                            articles.push(article);
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

        console.log(`\nTotal unique articles before AI filtering: ${uniqueArticles.length}`);

        // AI relevance filtering - apply to ALL articles from both sources
        let filteredArticles = uniqueArticles;
        if (geminiModel && uniqueArticles.length > 0) {
            console.log('Verifying article relevance with AI (all sources)...');

            // Process in batches of 50 to avoid overwhelming the AI
            const FILTER_BATCH_SIZE = 50;
            const relevantArticles = [];

            for (let i = 0; i < uniqueArticles.length; i += FILTER_BATCH_SIZE) {
                const batch = uniqueArticles.slice(i, i + FILTER_BATCH_SIZE);
                console.log(`  Processing batch ${Math.floor(i / FILTER_BATCH_SIZE) + 1} (${batch.length} articles)...`);

                const relevanceFlags = await verifyArticleRelevance(batch);

                batch.forEach((article, index) => {
                    const isRelevant = relevanceFlags[index];
                    if (!isRelevant) {
                        console.log(`  ✗ Filtered out: "${article.title.substring(0, 80)}..."`);
                    } else {
                        relevantArticles.push(article);
                    }
                });
            }

            console.log(`  ✓ ${relevantArticles.length}/${uniqueArticles.length} articles verified as wind farm related\n`);
            filteredArticles = relevantArticles;
        }

        // Merge with cached articles to preserve AI categories
        const mergedArticles = mergeArticlesWithCache(filteredArticles, previouslyCached);

        // Sort by date (newest first)
        mergedArticles.sort((a, b) => {
            return new Date(b.date) - new Date(a.date);
        });

        // Limit to 400 articles
        const limitedArticles = mergedArticles.slice(0, 400);

        // Batch process AI categorization (40 articles at once for efficiency)
        // Only categorize NEW articles that don't already have AI categories
        logActivity('ai', 'Starting AI categorization...');
        const BATCH_SIZE = 40;

        // Filter out articles that already have AI categories
        const articlesNeedingCategories = limitedArticles.filter(article => !article.aiCategories);
        const articlesToCategorize = articlesNeedingCategories.slice(0, BATCH_SIZE);
        const alreadyCategorized = limitedArticles.filter(article => article.aiCategories).length;

        let categorizedCount = 0;

        if (alreadyCategorized > 0) {
            logActivity('info', `Found ${alreadyCategorized} articles with existing AI categories (skipping)`);
        }

        if (geminiModel && articlesToCategorize.length > 0) {
            logActivity('ai', `Processing ${articlesToCategorize.length} NEW articles in a single batch...`);

            const aiCategoriesArray = await categorizeArticlesWithAI(articlesToCategorize);

            if (aiCategoriesArray && aiCategoriesArray.length > 0) {
                // Map categories back to articles by index
                aiCategoriesArray.forEach(categoryData => {
                    const article = articlesToCategorize[categoryData.index];
                    if (article) {
                        article.aiCategories = {
                            projectStage: categoryData.projectStage,
                            sentiment: categoryData.sentiment,
                            keyTopics: categoryData.keyTopics,
                            urgency: categoryData.urgency
                        };
                        categorizedCount++;
                        console.log(`  ✓ Article ${categoryData.index}: Stage=${categoryData.projectStage}, Sentiment=${categoryData.sentiment}, Topics=[${categoryData.keyTopics.join(', ')}], Urgency=${categoryData.urgency}`);
                    }
                });
                logActivity('success', `Successfully categorized ${categorizedCount}/${articlesToCategorize.length} NEW articles`, {
                    total: articlesToCategorize.length,
                    successful: categorizedCount
                });
            } else {
                console.log('  ✗ Batch categorization returned no results');
            }
        } else if (articlesToCategorize.length === 0 && alreadyCategorized > 0) {
            console.log('All articles already have AI categories - no new categorization needed');
        }

        // Fetch real images for articles with placeholder images (optional, separate from AI)
        const articlesToEnhance = limitedArticles.slice(0, 10);
        let enhancedCount = 0;
        let attemptedCount = 0;

        if (articlesToEnhance.some(a => a.image && a.image.includes('unsplash.com'))) {
            console.log('\nFetching featured images...');
            for (let i = 0; i < articlesToEnhance.length; i++) {
                const article = articlesToEnhance[i];

                // Fetch image if using placeholder (Unsplash URL)
                if (article.image && article.image.includes('unsplash.com')) {
                    attemptedCount++;
                    const articleData = await fetchArticleData(article.url, article.title);
                    if (articleData.image && !isUnwantedImage(articleData.image)) {
                        article.image = articleData.image;
                        enhancedCount++;
                    }
                }
            }
        }

        // Update real image count
        realImageCount = limitedArticles.filter(a => !a.image.includes('unsplash.com')).length;
        console.log(`Successfully enhanced ${enhancedCount}/${attemptedCount} articles with real images`);
        console.log(`Successfully categorized ${categorizedCount} articles with AI`);

        cachedArticles = limitedArticles;
        lastFetchTime = new Date();

        // Save articles to disk cache (preserves AI categories across restarts)
        saveCachedArticles(cachedArticles);

        console.log(`Successfully cached ${cachedArticles.length} articles`);
        console.log(`Enhanced ${enhancedCount} articles with real images`);
        console.log(`AI Categorized ${categorizedCount} articles`);
        console.log(`Images: ${realImageCount} real, ${placeholderCount} placeholders`);
    } catch (error) {
        console.error('Error in fetchGoogleNews:', error);
    } finally {
        isFetching = false;
    }
}

// API endpoint to get articles
app.get('/api/articles', (req, res) => {
    res.json({
        articles: cachedArticles,
        lastUpdate: lastFetchTime,
        count: cachedArticles.length
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        lastFetch: lastFetchTime,
        articleCount: cachedArticles.length,
        isFetching: isFetching
    });
});

// Version endpoint
app.get('/api/version', (req, res) => {
    res.json(BUILD_INFO);
});

// Activity logs endpoint
app.get('/api/logs', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    res.json({
        logs: activityLog.slice(0, limit),
        total: activityLog.length
    });
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📦 Version: ${BUILD_INFO.version} (${BUILD_INFO.feeds} feeds, max ${BUILD_INFO.maxArticles} articles)`);
    if (BUILD_INFO.git) {
        console.log(`🔧 Build: ${BUILD_INFO.git.commit} on ${BUILD_INFO.git.branch} - ${BUILD_INFO.git.commitMessage}`);
    }
    console.log(`📰 API endpoint: http://localhost:${PORT}/api/articles`);
    console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
    console.log(`ℹ️  Version info: http://localhost:${PORT}/api/version`);
    console.log(`🔄 Auto-refresh interval: ${CONFIG.REFRESH_INTERVAL} minutes`);

    // Fetch news immediately on startup
    fetchGoogleNews();

    // Schedule automatic refresh every 15 minutes
    cron.schedule(`*/${CONFIG.REFRESH_INTERVAL} * * * *`, () => {
        console.log('\n⏰ Scheduled refresh triggered');
        fetchGoogleNews();
    });
});
