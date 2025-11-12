const fetch = require('node-fetch');
const xml2js = require('xml2js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const NewsAPI = require('newsapi');

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

// Initialize Gemini AI
let geminiModel = null;
if (process.env.GEMINI_API_KEY) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash-lite' });
}

// Initialize NewsAPI
let newsapi = null;
if (process.env.NEWSAPI_KEY) {
    newsapi = new NewsAPI(process.env.NEWSAPI_KEY);
}

// Verify articles are about wind farms using Gemini AI
async function verifyArticleRelevance(articles) {
    if (!geminiModel || !articles || articles.length === 0) {
        return articles.map(() => true);
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
        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const relevanceArray = JSON.parse(jsonText);
        if (!Array.isArray(relevanceArray)) {
            console.log('  ✗ AI relevance check returned invalid format');
            return articles.map(() => true);
        }

        return relevanceArray;
    } catch (error) {
        console.log(`  ✗ AI relevance check failed: ${error.message}`);
        return articles.map(() => true);
    }
}

// Helper functions
function categorizeProvince(text) {
    const lowerText = text.toLowerCase();
    const munsterLocations = ['munster', 'clare', 'cork', 'kerry', 'limerick', 'tipperary', 'waterford'];
    const leinsterLocations = ['leinster', 'dublin', 'wicklow', 'wexford', 'carlow', 'kildare', 'meath'];
    const connachtLocations = ['connacht', 'connaught', 'galway', 'mayo', 'roscommon', 'sligo', 'leitrim'];
    const ulsterLocations = ['ulster', 'donegal', 'cavan', 'monaghan'];

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

function categorizeArticle(text) {
    const lowerText = text.toLowerCase();
    if (lowerText.includes('offshore')) return 'offshore';
    if (lowerText.includes('onshore')) return 'onshore';
    return 'onshore';
}

function categorizeTags(text) {
    const lowerText = text.toLowerCase();
    const tags = [];
    if (lowerText.includes('offshore')) tags.push('offshore');
    if (lowerText.includes('onshore')) tags.push('onshore');
    if (lowerText.includes('planning') || lowerText.includes('approval')) tags.push('planning');
    if (lowerText.includes('construction') || lowerText.includes('building')) tags.push('construction');
    if (tags.length === 0) tags.push(categorizeArticle(text));
    return tags;
}

function stripHTML(html) {
    return html.replace(/<[^>]*>/g, '').trim();
}

function getPlaceholderImage(title, description) {
    const text = (title + ' ' + description).toLowerCase();
    if (text.includes('offshore')) {
        return 'https://images.unsplash.com/photo-1532601224476-15c79f2f7a51?w=800&q=80';
    } else if (text.includes('onshore')) {
        return 'https://images.unsplash.com/photo-1466611653911-95081537e5b7?w=800&q=80';
    }
    return 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?w=800&q=80';
}

// Fetch from NewsAPI
async function fetchNewsAPI() {
    if (!newsapi) return [];

    console.log('Fetching from NewsAPI...');
    const articles = [];
    const processedUrls = new Set();

    const queries = ['wind farm Ireland', 'wind energy Ireland', 'offshore wind Ireland'];

    for (const query of queries) {
        try {
            const response = await newsapi.v2.everything({
                q: query,
                language: 'en',
                sortBy: 'publishedAt',
                pageSize: 20,
                domains: 'irishtimes.com,independent.ie,rte.ie,thejournal.ie,businesspost.ie,examiner.ie'
            });

            if (response.articles && response.articles.length > 0) {
                for (const item of response.articles) {
                    const url = item.url || '#';
                    if (!processedUrls.has(url) && item.title) {
                        processedUrls.add(url);
                        articles.push({
                            title: item.title,
                            description: item.description || item.content?.substring(0, 200) + '...' || '',
                            source: item.source.name || 'NewsAPI',
                            date: new Date(item.publishedAt).toISOString(),
                            url: url,
                            image: item.urlToImage || getPlaceholderImage(item.title, item.description || ''),
                            tags: categorizeTags(item.title + ' ' + (item.description || '')),
                            category: categorizeArticle(item.title + ' ' + (item.description || '')),
                            province: categorizeProvince(item.title + ' ' + (item.description || ''))
                        });
                    }
                }
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`NewsAPI error for "${query}":`, error.message);
        }
    }

    console.log(`NewsAPI returned ${articles.length} articles`);
    return articles;
}

// Fetch from RSS feeds
async function fetchRSSFeeds() {
    const CONFIG = {
        GOOGLE_NEWS_FEEDS: [
            'https://news.google.com/rss/search?q=wind+farm+ireland&hl=en-IE&gl=IE&ceid=IE:en',
            'https://news.google.com/rss/search?q=wind+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en',
            'https://news.google.com/rss/search?q=offshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
            'https://news.google.com/rss/search?q=onshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
            'https://news.google.com/rss/search?q=renewable+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en'
        ]
    };

    console.log('Fetching from RSS feeds...');
    const articles = [];
    const processedUrls = new Set();

    for (const rssUrl of CONFIG.GOOGLE_NEWS_FEEDS) {
        try {
            const response = await fetch(rssUrl, { timeout: 3000 });
            const xmlText = await response.text();
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(xmlText);

            if (result.rss && result.rss.channel && result.rss.channel[0].item) {
                const items = result.rss.channel[0].item;

                for (const item of items) {
                    const title = item.title ? item.title[0] : '';
                    const link = item.link ? item.link[0] : '#';
                    const pubDate = item.pubDate ? item.pubDate[0] : new Date().toISOString();
                    const description = item.description ? item.description[0] : '';
                    const source = item.source && item.source[0]._ ? item.source[0]._ : 'Google News';

                    const imgMatch = description.match(/<img[^>]+src="([^">]+)"/i);
                    const image = imgMatch ? imgMatch[1] : getPlaceholderImage(title, description);

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
            console.error(`RSS error for ${rssUrl}:`, error.message);
        }
        await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`RSS feeds returned ${articles.length} articles`);
    return articles;
}

// Main handler
module.exports = async (req, res) => {
    console.log('[Cron] Starting article refresh...');

    try {
        // 1. Fetch from all sources
        const newsApiArticles = await fetchNewsAPI();
        const rssArticles = await fetchRSSFeeds();

        // 2. Combine and deduplicate
        const allArticles = [...newsApiArticles, ...rssArticles];
        const seen = new Set();
        const uniqueArticles = allArticles.filter(article => {
            const key = article.title.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        console.log(`Total unique articles before AI filtering: ${uniqueArticles.length}`);

        // 3. AI relevance filtering (process in batches)
        let filteredArticles = uniqueArticles;
        if (geminiModel && uniqueArticles.length > 0) {
            console.log('Applying AI relevance filtering...');
            const BATCH_SIZE = 50;
            const relevantArticles = [];

            for (let i = 0; i < uniqueArticles.length; i += BATCH_SIZE) {
                const batch = uniqueArticles.slice(i, i + BATCH_SIZE);
                const relevanceFlags = await verifyArticleRelevance(batch);

                batch.forEach((article, index) => {
                    if (relevanceFlags[index]) {
                        relevantArticles.push(article);
                    }
                });
            }

            console.log(`  ✓ ${relevantArticles.length}/${uniqueArticles.length} articles verified as wind farm related`);
            filteredArticles = relevantArticles;
        }

        // 4. Sort and limit
        filteredArticles.sort((a, b) => new Date(b.date) - new Date(a.date));
        const finalArticles = filteredArticles.slice(0, 400);

        // 5. Save to Redis
        if (redis) {
            const cacheData = {
                articles: finalArticles,
                timestamp: Date.now()
            };
            await redis.set('articles-cache', JSON.stringify(cacheData), 'EX', 604800); // 7 days
            console.log(`Saved ${finalArticles.length} articles to Redis cache`);

            // Save cron execution log
            const cronLog = {
                timestamp: Date.now(),
                articlesProcessed: uniqueArticles.length,
                articlesFiltered: finalArticles.length,
                newsApiCount: newsApiArticles.length,
                rssCount: rssArticles.length,
                success: true
            };
            await redis.set('cron:last-run', JSON.stringify(cronLog), 'EX', 604800);
            console.log('Saved cron execution log');
        }

        res.status(200).json({
            success: true,
            articlesProcessed: uniqueArticles.length,
            articlesFiltered: finalArticles.length,
            newsApiCount: newsApiArticles.length,
            rssCount: rssArticles.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('[Cron] Error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
};
