const fetch = require('node-fetch');

async function testPlanningAPIs() {
    console.log('Testing alternative planning data sources...\n');

    const tests = [
        {
            name: 'Data.gov.ie - Wind Energy Locations',
            url: 'https://data.gov.ie/api/3/action/package_search?q=wind+energy&rows=5'
        },
        {
            name: 'planning.ie search page',
            url: 'https://www.planning.ie/'
        },
        {
            name: 'An Bord Pleanála',
            url: 'https://www.pleanala.ie/'
        }
    ];

    for (const test of tests) {
        console.log(`\n=== ${test.name} ===`);
        console.log(`URL: ${test.url}`);

        try {
            const response = await fetch(test.url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            console.log(`Status: ${response.status}`);

            if (response.ok) {
                const contentType = response.headers.get('content-type');
                console.log(`Content-Type: ${contentType}`);

                if (contentType && contentType.includes('application/json')) {
                    const data = await response.json();
                    console.log('Response keys:', Object.keys(data));
                    if (data.result) {
                        console.log('Results:', data.result.count || 'N/A');
                    }
                    console.log(JSON.stringify(data, null, 2).substring(0, 500));
                } else {
                    const text = await response.text();
                    console.log(`HTML Response (first 200 chars): ${text.substring(0, 200)}`);
                }
            }
        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
    }
}

testPlanningAPIs().catch(console.error);
