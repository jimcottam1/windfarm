const { version } = require('../package.json');
const fs = require('fs');
const path = require('path');

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

    const buildInfo = getBuildInfo();

    const versionInfo = {
        version: version,
        serverStarted: new Date().toISOString(),
        feeds: 13,
        maxArticles: 400,
        ...(buildInfo && { build: buildInfo })
    };

    res.status(200).json(versionInfo);
};
