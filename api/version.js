const { execSync } = require('child_process');
const { version } = require('../package.json');

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

    const gitInfo = getGitInfo();

    const versionInfo = {
        version: version,
        serverStarted: new Date().toISOString(),
        feeds: 13,
        maxArticles: 400,
        ...(gitInfo && { git: gitInfo })
    };

    res.status(200).json(versionInfo);
};
