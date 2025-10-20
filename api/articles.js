const fetch = require('node-fetch');
const xml2js = require('xml2js');

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
        'https://news.google.com/rss/search?q=renewable+energy+ireland&hl=en-IE&gl=IE&ceid=IE:en'
    ]
};

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

        // Limit to 200 articles
        const limitedArticles = uniqueArticles.slice(0, 200);

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
        const articles = await fetchGoogleNews();
        const now = new Date();

        res.status(200).json({
            articles: articles,
            lastUpdate: now.toISOString(),
            count: articles.length
        });
    } catch (error) {
        console.error('Error in serverless function:', error);
        res.status(500).json({
            error: 'Failed to fetch articles',
            message: error.message
        });
    }
};
