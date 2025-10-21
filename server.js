const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all origins
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Configuration
const CONFIG = {
    GOOGLE_NEWS_FEEDS: [
        'https://news.google.com/rss/search?q=wind+farm+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=wind+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=offshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=onshore+wind+ireland&hl=en-IE&gl=IE&ceid=IE:en',
        'https://news.google.com/rss/search?q=renewable+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en'
    ],
    REFRESH_INTERVAL: 15 // minutes
};

// In-memory cache
let cachedArticles = [];
let lastFetchTime = null;
let isFetching = false;

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
    if (isFetching) {
        console.log('Already fetching, skipping...');
        return;
    }

    isFetching = true;
    console.log(`[${new Date().toISOString()}] Fetching from Google News RSS...`);

    const articles = [];
    const processedUrls = new Set();
    let realImageCount = 0;
    let placeholderCount = 0;

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

                    for (const item of items) {
                        const title = item.title ? item.title[0] : '';
                        const link = item.link ? item.link[0] : '#';
                        const pubDate = item.pubDate ? item.pubDate[0] : new Date().toISOString();
                        const description = item.description ? item.description[0] : '';
                        const source = item.source && item.source[0]._ ? item.source[0]._ : 'Google News';

                        // Extract image from description or use placeholder
                        let image = null;
                        const imgMatch = description.match(/<img[^>]+src="([^">]+)"/i);
                        if (imgMatch) {
                            image = imgMatch[1];
                            realImageCount++;
                        } else {
                            image = getPlaceholderImage(title, description);
                            placeholderCount++;
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

        // Limit to 200 articles
        cachedArticles = uniqueArticles.slice(0, 200);
        lastFetchTime = new Date();

        console.log(`Successfully cached ${cachedArticles.length} articles`);
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

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/index.html');
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📰 API endpoint: http://localhost:${PORT}/api/articles`);
    console.log(`💚 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔄 Auto-refresh interval: ${CONFIG.REFRESH_INTERVAL} minutes`);

    // Fetch news immediately on startup
    fetchGoogleNews();

    // Schedule automatic refresh every 15 minutes
    cron.schedule(`*/${CONFIG.REFRESH_INTERVAL} * * * *`, () => {
        console.log('\n⏰ Scheduled refresh triggered');
        fetchGoogleNews();
    });
});
