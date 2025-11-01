const fetch = require('node-fetch');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');
const { version } = require('../package.json');

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
        redis.on('ready', () => {
            redisReady = true;
        });

        redis.on('error', (err) => {
            console.error('[Redis] Connection error:', err.message);
            redisReady = false;
        });

        redis.on('close', () => {
            redisReady = false;
        });
    } catch (error) {
        console.error('[Redis] Failed to initialize:', error.message);
        redis = null;
    }
}

// Redis Cache Helper Functions
async function loadCache() {
    if (!redis) {
        return [];
    }

    try {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(null), 5000));
        const dataPromise = redis.get('articles-cache');
        const data = await Promise.race([dataPromise, timeout]);

        if (data === null) {
            return [];
        }

        const cached = JSON.parse(data);
        return cached || [];
    } catch (error) {
        console.error('[Cache] Error loading cache:', error.message);
        return [];
    }
}

async function saveCache(articles) {
    if (!redis) {
        return false;
    }

    try {
        const timeout = new Promise((resolve) => setTimeout(() => resolve(false), 5000));
        const savePromise = redis.set('articles-cache', JSON.stringify(articles), 'EX', 604800);
        const result = await Promise.race([savePromise, timeout]);
        return result !== false;
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

    return uniqueArticles;
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

// Fetch a single RSS feed with timeout
async function fetchSingleFeed(rssUrl, timeout = 3000) {
    const articles = [];

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(rssUrl, { signal: controller.signal });
        clearTimeout(timeoutId);

        const xmlText = await response.text();
        const parser = new xml2js.Parser();
        const result = await parser.parseStringPromise(xmlText);

        if (result.rss && result.rss.channel && result.rss.channel[0].item) {
            const items = result.rss.channel[0].item;
            const channelTitle = result.rss.channel[0].title?.[0] || null;

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
                const title = item.title?.[0] || '';
                const link = item.link?.[0] || '#';
                const pubDate = item.pubDate?.[0] || new Date().toISOString();
                const description = item.description?.[0] || '';
                const source = item.source?.[0]?._ || defaultSource;

                // Filter local news sources by energy keywords
                if (isLocalSource) {
                    const articleText = title + ' ' + stripHTML(description);
                    if (!matchesEnergyKeywords(articleText)) {
                        continue;
                    }
                }

                // Extract image from description or use placeholder
                let image = null;
                const imgMatch = description.match(/<img[^>]+src="([^">]+)"/i);
                if (imgMatch) {
                    image = imgMatch[1];
                } else {
                    image = getPlaceholderImage(title, description);
                }

                if (title) {
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
        // Silently fail individual feeds
    }

    return articles;
}

// Fetch articles from Google News RSS (parallel fetching)
async function fetchGoogleNews() {
    try {
        // Fetch all feeds in parallel with 3-second timeout per feed
        const feedPromises = CONFIG.GOOGLE_NEWS_FEEDS.map(url => fetchSingleFeed(url, 3000));
        const feedResults = await Promise.all(feedPromises);

        // Flatten all articles from all feeds
        const allArticles = feedResults.flat();

        // Remove duplicates based on URL
        const seen = new Set();
        const uniqueArticles = allArticles.filter(article => {
            if (seen.has(article.url)) return false;
            seen.add(article.url);
            return true;
        });

        // Sort by date (newest first)
        uniqueArticles.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Limit to 400 articles
        return uniqueArticles.slice(0, 400);
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
        // Parse query parameters for filtering
        const filters = {
            province: req.query.province,
            category: req.query.category,
            tag: req.query.tag
        };

        // Check for force refresh parameter
        const forceRefresh = req.query.refresh === 'true';

        // 1. Load cached articles from Redis
        const cachedArticles = await loadCache();

        let finalArticles = [];
        let fromCache = false;

        // If we have cached articles and not forcing refresh, use cache
        if (cachedArticles.length > 0 && !forceRefresh) {
            finalArticles = cachedArticles;
            fromCache = true;
        } else {
            // Fetch fresh articles only if cache is empty or refresh requested
            const newArticles = await fetchGoogleNews();

            // Merge with any cached articles and deduplicate
            const mergedArticles = mergeArticles(newArticles, cachedArticles);
            mergedArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
            finalArticles = mergedArticles.slice(0, 400);

            // Save to cache for next request
            await saveCache(finalArticles);
        }

        // 2. Apply filters if any are specified
        let filteredArticles = finalArticles;
        let filterApplied = false;

        if (filters.province) {
            filteredArticles = filteredArticles.filter(a => a.province === filters.province);
            filterApplied = true;
        }

        if (filters.category) {
            filteredArticles = filteredArticles.filter(a => a.category === filters.category);
            filterApplied = true;
        }

        if (filters.tag) {
            filteredArticles = filteredArticles.filter(a => a.tags && a.tags.includes(filters.tag));
            filterApplied = true;
        }

        // 3. Build and return response
        const buildInfo = getBuildInfo();

        const response = {
            articles: filteredArticles,
            lastUpdate: new Date().toISOString(),
            count: filteredArticles.length,
            totalArticles: finalArticles.length,
            fromCache: fromCache,
            filtersApplied: filterApplied ? filters : null,
            version: {
                version: version,
                feeds: 13,
                maxArticles: 400,
                cacheTTL: '7 days',
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
