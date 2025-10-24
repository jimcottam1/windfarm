require('dotenv').config();

const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const xml2js = require('xml2js');
const cron = require('node-cron');
const { execSync } = require('child_process');
const { version } = require('./package.json');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

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
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        console.log('✓ Gemini AI initialized');
    } catch (error) {
        console.log('✗ Gemini AI initialization failed:', error.message);
    }
} else {
    console.log('ℹ Gemini API key not provided - AI summarization disabled');
}

// Extract article text from HTML
function extractArticleText(html) {
    try {
        // Remove script and style tags
        let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
        text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

        // Try to find article content (common patterns)
        const articlePatterns = [
            /<article[^>]*>([\s\S]*?)<\/article>/i,
            /<div[^>]*class="[^"]*article[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<div[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
            /<main[^>]*>([\s\S]*?)<\/main>/i
        ];

        for (const pattern of articlePatterns) {
            const match = text.match(pattern);
            if (match) {
                text = match[1];
                break;
            }
        }

        // Remove all HTML tags
        text = text.replace(/<[^>]+>/g, ' ');

        // Clean up whitespace
        text = text.replace(/\s+/g, ' ').trim();

        // Limit to first 3000 characters to stay within API limits
        return text.substring(0, 3000);
    } catch (error) {
        return '';
    }
}

// Summarize article using Gemini
async function summarizeArticle(title, articleText) {
    if (!geminiModel || !articleText || articleText.length < 100) {
        return null;
    }

    try {
        const prompt = `Summarize this Irish wind energy news article in 2-3 clear, informative sentences. Focus on the key facts like location, project size, companies involved, and current status.

Title: ${title}

Article: ${articleText}

Summary:`;

        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const summary = response.text().trim();

        return summary;
    } catch (error) {
        console.log(`  ✗ Gemini summarization failed: ${error.message}`);
        return null;
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

        // Get HTML even if response is not OK (e.g., 404 pages still return HTML)
        const html = await response.text();
        let image = null;

        // Only try to extract images if response was OK
        const tryImageExtraction = response.ok;

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

        // Extract text and generate summary with Gemini
        let summary = null;
        if (geminiModel) {
            const articleText = extractArticleText(html);
            if (articleText) {
                summary = await summarizeArticle(title, articleText);
                if (summary) {
                    console.log(`  ✓ Generated AI summary for ${url.substring(0, 50)}`);
                }
            }
        }

        return { image, summary };
    } catch (error) {
        console.log(`  ✗ Error fetching ${url.substring(0, 50)}: ${error.message}`);
        return { image: null, summary: null };
    }
}

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

        // Fetch real images for articles with placeholder images (process first 50)
        console.log('Fetching featured images from article pages...');
        console.log('This may take 20-30 seconds...');
        const articlesToEnhance = limitedArticles.slice(0, 50);
        let enhancedCount = 0;
        let attemptedCount = 0;

        // Process articles in batches of 3 for better success rate
        for (let i = 0; i < articlesToEnhance.length; i += 3) {
            const batch = articlesToEnhance.slice(i, i + 3);
            const batchNum = Math.floor(i / 3) + 1;
            const totalBatches = Math.ceil(articlesToEnhance.length / 3);

            console.log(`  Processing batch ${batchNum}/${totalBatches}...`);

            const promises = batch.map(async (article) => {
                // Check if using placeholder (Unsplash URL)
                if (article.image && article.image.includes('unsplash.com')) {
                    attemptedCount++;
                    const articleData = await fetchArticleData(article.url, article.title);
                    if (articleData.image && !isUnwantedImage(articleData.image)) {
                        article.image = articleData.image;
                        enhancedCount++;
                    }
                    // Add AI-generated summary if available
                    if (articleData.summary) {
                        article.aiSummary = articleData.summary;
                    }
                    return true;
                }
                return false;
            });

            await Promise.all(promises);
            // Delay between batches
            await new Promise(resolve => setTimeout(resolve, 600));
        }

        // Update real image count
        realImageCount = limitedArticles.filter(a => !a.image.includes('unsplash.com')).length;
        console.log(`Successfully enhanced ${enhancedCount}/${attemptedCount} articles with real images`);

        cachedArticles = limitedArticles;
        lastFetchTime = new Date();

        console.log(`Successfully cached ${cachedArticles.length} articles`);
        console.log(`Enhanced ${enhancedCount} articles with real images`);
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
