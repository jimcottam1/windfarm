// Simple test for windfarms API endpoint
const handler = require('./api/windfarms');

// Mock request and response objects
const mockReq = {
    method: 'GET',
    query: {}
};

const mockRes = {
    statusCode: null,
    headers: {},
    body: null,
    setHeader: function(key, value) {
        this.headers[key] = value;
    },
    status: function(code) {
        this.statusCode = code;
        return this;
    },
    json: function(data) {
        this.body = data;
        console.log(`\nStatus: ${this.statusCode}`);
        console.log(`\nResults:`);
        console.log(`- Total wind farms: ${data.totalCount || 0}`);
        console.log(`- Filtered results: ${data.count || 0}`);
        if (data.stats) {
            console.log(`- Total capacity: ${data.stats.totalCapacityMW} MW`);
            console.log(`\nTop 5 Counties by Capacity:`);
            const counties = Object.entries(data.stats.byCounty)
                .sort((a, b) => b[1].capacityMW - a[1].capacityMW)
                .slice(0, 5);
            counties.forEach(([county, stats]) => {
                console.log(`  ${county}: ${stats.count} farms, ${Math.round(stats.capacityMW)} MW`);
            });

            console.log(`\nLargest Wind Farms:`);
            data.stats.largestWindFarms.slice(0, 5).forEach((wf, i) => {
                console.log(`  ${i + 1}. ${wf.name} (${wf.county}) - ${wf.capacityMW} MW`);
            });
        }
        if (data.windfarms) {
            console.log(`\nSample Wind Farm:`);
            console.log(JSON.stringify(data.windfarms[0], null, 2));
        }
    },
    end: function() {}
};

console.log('Testing /api/windfarms endpoint...\n');

handler(mockReq, mockRes).catch(error => {
    console.error('Error:', error.message);
});
