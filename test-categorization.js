// Test script to verify AI categorization
const fetch = require('node-fetch');

async function testCategorization() {
    try {
        // Wait for server to start
        console.log('Waiting for server...');
        await new Promise(resolve => setTimeout(resolve, 40000)); // Wait 40 seconds for AI processing

        console.log('Fetching articles from API...');
        const response = await fetch('http://localhost:3000/api/articles');
        const data = await response.json();

        console.log(`\nTotal articles: ${data.articles.length}`);

        // Count articles with AI categories
        const articlesWithAI = data.articles.filter(a => a.aiCategories);
        console.log(`Articles with AI categorization: ${articlesWithAI.length}`);

        if (articlesWithAI.length > 0) {
            console.log('\n✓ AI CATEGORIZATION IS WORKING!\n');
            console.log('Sample categorized articles:');
            console.log('═══════════════════════════════════════════\n');

            // Show first 3 categorized articles
            articlesWithAI.slice(0, 3).forEach((article, index) => {
                console.log(`${index + 1}. ${article.title.substring(0, 70)}...`);
                console.log(`   Source: ${article.source}`);
                if (article.aiCategories) {
                    console.log(`   Project Stage: ${article.aiCategories.projectStage || 'N/A'}`);
                    console.log(`   Sentiment: ${article.aiCategories.sentiment || 'N/A'}`);
                    console.log(`   Topics: ${article.aiCategories.keyTopics ? article.aiCategories.keyTopics.join(', ') : 'N/A'}`);
                    console.log(`   Urgency: ${article.aiCategories.urgency || 'N/A'}`);
                }
                console.log('');
            });
        } else {
            console.log('\n✗ No AI categorization found yet.');
            console.log('The server may still be processing articles.');
        }

    } catch (error) {
        console.error('Error testing categorization:', error.message);
    }
}

testCategorization();
