const fetch = require('node-fetch');

async function exploreDataGov() {
    console.log('Exploring Data.gov.ie wind energy datasets...\n');

    // Search for wind energy datasets
    const response = await fetch('https://data.gov.ie/api/3/action/package_search?q=wind+energy+planning+OR+wind+farm&rows=20');
    const data = await response.json();

    console.log(`Found ${data.result.count} datasets\n`);
    console.log('='.repeat(80) + '\n');

    for (let i = 0; i < Math.min(20, data.result.results.length); i++) {
        const pkg = data.result.results[i];
        console.log(`${i + 1}. ${pkg.title}`);
        console.log(`   Organization: ${pkg.organization?.title || 'N/A'}`);
        console.log(`   Resources: ${pkg.num_resources}`);
        console.log(`   Updated: ${pkg.metadata_modified?.substring(0, 10) || 'N/A'}`);

        if (pkg.resources && pkg.resources.length > 0) {
            console.log(`   Files:`);
            pkg.resources.slice(0, 3).forEach(r => {
                console.log(`     - ${r.name || r.description || 'Unnamed'} (${r.format})`);
                console.log(`       URL: ${r.url.substring(0, 80)}${r.url.length > 80 ? '...' : ''}`);
            });
        }
        console.log('');
    }

    // Try to fetch a specific wind farm dataset
    console.log('\n' + '='.repeat(80));
    console.log('\nFetching sample wind farm dataset...\n');

    const sampleDatasets = [
        'wind-farms-onshore',
        'wind-energy-development',
        'renewable-energy-planning'
    ];

    for (const name of sampleDatasets) {
        try {
            const pkgResponse = await fetch(`https://data.gov.ie/api/3/action/package_show?id=${name}`);
            if (pkgResponse.ok) {
                const pkgData = await pkgResponse.json();
                if (pkgData.success) {
                    console.log(`Found dataset: ${pkgData.result.title}`);
                    console.log(`Resources: ${pkgData.result.resources.length}`);
                    if (pkgData.result.resources[0]) {
                        console.log(`Sample resource: ${pkgData.result.resources[0].url}`);
                    }
                    break;
                }
            }
        } catch (error) {
            // Continue to next
        }
    }
}

exploreDataGov().catch(console.error);
