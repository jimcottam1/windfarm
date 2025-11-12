// api/sitemap.xml.js - Dynamic Sitemap Generator
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

// Base URL for the site
const SITE_URL = 'https://windfarm-news.vercel.app';

// Initialize Redis if available
let redis = null;
if (process.env.REDIS_URL) {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 50, 2000);
      }
    });
  } catch (error) {
    console.log('Redis unavailable for sitemap, will use file cache');
  }
}

/**
 * Get articles from cache (Redis or file system)
 */
async function getCachedArticles() {
  // Try Redis first
  if (redis) {
    try {
      const cached = await redis.get('wind_articles');
      if (cached) {
        const data = JSON.parse(cached);
        return data.articles || [];
      }
    } catch (error) {
      console.error('Redis error in sitemap:', error);
    }
  }

  // Fallback to file cache
  try {
    const cacheFilePath = path.join('/tmp', 'wind_articles_cache.json');
    if (fs.existsSync(cacheFilePath)) {
      const cached = JSON.parse(fs.readFileSync(cacheFilePath, 'utf8'));
      return cached.articles || [];
    }
  } catch (error) {
    console.error('File cache error in sitemap:', error);
  }

  return [];
}

/**
 * Generate XML sitemap
 */
function generateSitemap(articles) {
  const now = new Date().toISOString();

  // Static pages
  const staticPages = [
    {
      loc: SITE_URL,
      lastmod: now,
      changefreq: 'hourly',
      priority: '1.0'
    }
  ];

  // Article URLs (using article ID or URL as identifier)
  const articlePages = articles.slice(0, 50).map(article => ({
    loc: `${SITE_URL}/?article=${encodeURIComponent(article.url || article.title)}`,
    lastmod: article.publishedAt || now,
    changefreq: 'daily',
    priority: '0.8'
  }));

  const allPages = [...staticPages, ...articlePages];

  // Build XML
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  for (const page of allPages) {
    xml += '  <url>\n';
    xml += `    <loc>${escapeXml(page.loc)}</loc>\n`;
    xml += `    <lastmod>${page.lastmod}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += '  </url>\n';
  }

  xml += '</urlset>';

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

/**
 * Vercel serverless function handler
 */
module.exports = async (req, res) => {
  try {
    // Only allow GET requests
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get articles from cache
    const articles = await getCachedArticles();

    // Generate sitemap XML
    const sitemap = generateSitemap(articles);

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');

    // Return sitemap
    res.status(200).send(sitemap);
  } catch (error) {
    console.error('Sitemap generation error:', error);
    res.status(500).json({
      error: 'Failed to generate sitemap',
      message: error.message
    });
  }
};
