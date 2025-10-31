const fetch = require('node-fetch');

async function testAPI() {
    try {
        const response = await fetch('http://localhost:3000/api/articles');
        const data = await response.json();

        console.log('Total articles:', data.articles.length);
        console.log('\nFirst 3 articles with AI categories:\n');

        let found = 0;
        for (let i = 0; i < data.articles.length && found < 3; i++) {
            const article = data.articles[i];
            if (article.aiCategories) {
                found++;
                console.log(`Article ${i + 1}: "${article.title.substring(0, 60)}..."`);
                console.log('AI Categories:', JSON.stringify(article.aiCategories, null, 2));
                console.log('---');
            }
        }

        if (found === 0) {
            console.log('No articles with aiCategories found!');
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testAPI();
