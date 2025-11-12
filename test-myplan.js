const fetch = require('node-fetch');

async function testMyPlanAPI() {
    console.log('Testing MyPlan.ie API...\n');

    // Try to get planning applications with wind-related keywords
    const queries = [
        // Main service info
        'https://webgis.myplan.ie/arcgis/rest/services/PlanningApplications/MapServer?f=json',

        // Layer 0 query for wind applications
        'https://webgis.myplan.ie/arcgis/rest/services/PlanningApplications/MapServer/0/query?where=ApplicationDescription LIKE \'%wind%\' OR ApplicationDescription LIKE \'%turbine%\'&outFields=*&returnGeometry=false&f=json&resultRecordCount=5',

        // Alternative: search by development type
        'https://webgis.myplan.ie/arcgis/rest/services/PlanningApplications/MapServer/0/query?where=DevelopmentType LIKE \'%wind%\'&outFields=*&returnGeometry=false&f=json&resultRecordCount=5',

        // Get recent applications
        'https://webgis.myplan.ie/arcgis/rest/services/PlanningApplications/MapServer/0/query?where=1=1&outFields=ApplicationNumber,ApplicationDescription,ApplicationDate,DecisionDate,Decision,County&orderByFields=ApplicationDate DESC&returnGeometry=false&f=json&resultRecordCount=3'
    ];

    for (let i = 0; i < queries.length; i++) {
        console.log(`\n=== Test ${i + 1} ===`);
        console.log(`URL: ${queries[i].substring(0, 100)}...`);

        try {
            const response = await fetch(queries[i], {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000
            });

            console.log(`Status: ${response.status}`);

            if (response.ok) {
                const data = await response.json();
                console.log(`Response keys:`, Object.keys(data));

                if (data.features) {
                    console.log(`Found ${data.features.length} features`);
                    if (data.features[0]) {
                        console.log('Sample record:');
                        console.log(JSON.stringify(data.features[0], null, 2));
                    }
                } else if (data.layers) {
                    console.log(`Found ${data.layers.length} layers`);
                    console.log('Layers:', data.layers.map(l => ({ id: l.id, name: l.name })));
                } else {
                    console.log('Response:', JSON.stringify(data, null, 2).substring(0, 500));
                }
            }
        } catch (error) {
            console.log(`Error: ${error.message}`);
        }
    }
}

testMyPlanAPI().catch(console.error);
