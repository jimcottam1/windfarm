// api/feed.xml.js - RSS Feed Generator
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
    console.log('Redis unavailable for RSS feed, will use file cache');
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
      console.error('Redis error in RSS feed:', error);
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
    console.error('File cache error in RSS feed:', error);
  }

  return [];
}

/**
 * Generate RSS feed XML
 */
function generateRSSFeed(articles) {
  const now = new Date().toUTCString();

  // Take the 50 most recent articles
  const recentArticles = articles
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 50);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">\n';
  xml += '  <channel>\n';
  xml += `    <title>Ireland Wind Farm News</title>\n`;
  xml += `    <link>${SITE_URL}</link>\n`;
  xml += `    <description>Real-time news and updates on wind farm developments across Ireland. Track offshore and onshore wind projects, planning approvals, and renewable energy developments.</description>\n`;
  xml += `    <language>en-ie</language>\n`;
  xml += `    <lastBuildDate>${now}</lastBuildDate>\n`;
  xml += `    <atom:link href="${SITE_URL}/api/feed.xml" rel="self" type="application/rss+xml"/>\n`;
  xml += `    <generator>Ireland Wind Farm News Aggregator</generator>\n`;
  xml += `    <ttl>60</ttl>\n`;

  for (const article of recentArticles) {
    xml += '    <item>\n';
    xml += `      <title>${escapeXml(article.title)}</title>\n`;
    xml += `      <link>${escapeXml(article.url)}</link>\n`;
    xml += `      <guid isPermaLink="false">${escapeXml(article.url)}</guid>\n`;
    xml += `      <description>${escapeXml(article.description || 'No description available.')}</description>\n`;
    xml += `      <pubDate>${new Date(article.date).toUTCString()}</pubDate>\n`;
    xml += `      <dc:creator>${escapeXml(article.source)}</dc:creator>\n`;

    // Add categories for tags
    if (article.tags && Array.isArray(article.tags)) {
      for (const tag of article.tags) {
        xml += `      <category>${escapeXml(tag)}</category>\n`;
      }
    }

    // Add province as category
    if (article.province) {
      xml += `      <category>${escapeXml(article.province)}</category>\n`;
    }

    // Add image enclosure if available
    if (article.image) {
      xml += `      <enclosure url="${escapeXml(article.image)}" type="image/jpeg"/>\n`;
    }

    xml += '    </item>\n';
  }

  xml += '  </channel>\n';
  xml += '</rss>';

  return xml;
}

/**
 * Escape XML special characters
 */
function escapeXml(unsafe) {
  if (!unsafe) return '';
  return String(unsafe).replace(/[<>&'"]/g, (c) => {
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

    if (articles.length === 0) {
      // Return empty feed if no articles
      const emptyFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Ireland Wind Farm News</title>
    <link>${SITE_URL}</link>
    <description>Real-time news and updates on wind farm developments across Ireland</description>
    <language>en-ie</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  </channel>
</rss>`;

      res.setHeader('Content-Type', 'application/rss+xml; charset=UTF-8');
      res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');
      return res.status(200).send(emptyFeed);
    }

    // Generate RSS feed XML
    const feed = generateRSSFeed(articles);

    // Set appropriate headers
    res.setHeader('Content-Type', 'application/rss+xml; charset=UTF-8');
    res.setHeader('Cache-Control', 's-maxage=600, stale-while-revalidate');

    // Return feed
    res.status(200).send(feed);
  } catch (error) {
    console.error('RSS feed generation error:', error);
    res.status(500).json({
      error: 'Failed to generate RSS feed',
      message: error.message
    });
  }
};
