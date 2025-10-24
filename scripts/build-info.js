const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
            branch: branch,
            buildDate: new Date().toISOString()
        };
    } catch (error) {
        console.error('Error getting git info:', error.message);
        return {
            buildDate: new Date().toISOString(),
            error: 'Git information not available'
        };
    }
}

const buildInfo = getGitInfo();
const outputPath = path.join(__dirname, '..', 'build-info.json');

fs.writeFileSync(outputPath, JSON.stringify(buildInfo, null, 2));
console.log('Build info saved to build-info.json');
console.log(JSON.stringify(buildInfo, null, 2));
