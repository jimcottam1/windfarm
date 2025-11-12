const fetch = require('node-fetch');

// Initialize Redis
let redis = null;
if (process.env.REDIS_URL) {
    const Redis = require('ioredis');
    redis = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: true
    });
}

// SEAI Wind Farms Data Source
const SEAI_WINDFARMS_CSV = 'https://seaiopendata.blob.core.windows.net/wind/WindFarmsConnectedJune2022.csv';

// Parse CSV to JSON
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');

    const windfarms = [];

    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',');
        if (values.length < headers.length) continue;

        const windfarm = {};
        headers.forEach((header, index) => {
            windfarm[header.trim()] = values[index]?.trim() || '';
        });

        // Clean up and standardize data
        windfarms.push({
            name: windfarm.Windfarm_Name || windfarm.windfarm_name || '',
            county: windfarm.County || windfarm.county || 'Unknown',
            status: windfarm.Present_Status || windfarm.status || 'Unknown',
            capacityMW: parseFloat(windfarm.Installed_Capacity__MW_ || windfarm['Installed_Capacity_(MW)'] || windfarm.MEC__MW_ || 0),
            connectionYear: parseInt(windfarm.Year_of_Connection || windfarm.year || 0),
            connectionDate: windfarm.Date_of_Connection || windfarm.date || '',
            type: windfarm.Type || windfarm.type || 'Wind',
            gate: windfarm.Gate || windfarm.gate || '',
            gridE: parseFloat(windfarm.Nat_Grid_E__substation_ || 0),
            gridN: parseFloat(windfarm.Nat_Grid_N__substation_ || 0),
            dsoTso: windfarm.DSO_TSO || '',
            node: windfarm.F110kV_Node_Name || ''
        });
    }

    return windfarms;
}

// Fetch and cache wind farms data
async function fetchWindFarms() {
    try {
        console.log('Fetching wind farms from SEAI...');

        const response = await fetch(SEAI_WINDFARMS_CSV, {
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const csvText = await response.text();
        const windfarms = parseCSV(csvText);

        console.log(`Parsed ${windfarms.length} wind farms`);

        // Save to Redis cache
        if (redis) {
            const cacheData = {
                windfarms: windfarms,
                timestamp: Date.now(),
                source: 'SEAI',
                dataDate: 'June 2022'
            };
            await redis.set('windfarms:cache', JSON.stringify(cacheData), 'EX', 604800); // 7 days
            console.log('Cached wind farms data in Redis');
        }

        return windfarms;
    } catch (error) {
        console.error('Error fetching wind farms:', error.message);
        throw error;
    }
}

// Load from Redis cache
async function loadCachedWindFarms() {
    if (!redis) return null;

    try {
        const data = await redis.get('windfarms:cache');
        if (data) {
            const parsed = JSON.parse(data);
            console.log(`Loaded ${parsed.windfarms.length} wind farms from cache`);
            return parsed;
        }
    } catch (error) {
        console.error('Error loading cached wind farms:', error.message);
    }

    return null;
}

// Calculate statistics
function calculateStats(windfarms) {
    const stats = {
        totalWindFarms: windfarms.length,
        totalCapacityMW: 0,
        byCounty: {},
        byStatus: {},
        byDecade: {},
        largestWindFarms: []
    };

    // Calculate totals and breakdowns
    windfarms.forEach(wf => {
        // Total capacity
        stats.totalCapacityMW += wf.capacityMW;

        // By county
        if (!stats.byCounty[wf.county]) {
            stats.byCounty[wf.county] = { count: 0, capacityMW: 0 };
        }
        stats.byCounty[wf.county].count++;
        stats.byCounty[wf.county].capacityMW += wf.capacityMW;

        // By status
        if (!stats.byStatus[wf.status]) {
            stats.byStatus[wf.status] = { count: 0, capacityMW: 0 };
        }
        stats.byStatus[wf.status].count++;
        stats.byStatus[wf.status].capacityMW += wf.capacityMW;

        // By decade
        if (wf.connectionYear) {
            const decade = Math.floor(wf.connectionYear / 10) * 10;
            const decadeLabel = `${decade}s`;
            if (!stats.byDecade[decadeLabel]) {
                stats.byDecade[decadeLabel] = { count: 0, capacityMW: 0 };
            }
            stats.byDecade[decadeLabel].count++;
            stats.byDecade[decadeLabel].capacityMW += wf.capacityMW;
        }
    });

    // Round total capacity
    stats.totalCapacityMW = Math.round(stats.totalCapacityMW * 100) / 100;

    // Get largest wind farms
    stats.largestWindFarms = [...windfarms]
        .sort((a, b) => b.capacityMW - a.capacityMW)
        .slice(0, 10)
        .map(wf => ({
            name: wf.name,
            county: wf.county,
            capacityMW: wf.capacityMW,
            year: wf.connectionYear
        }));

    return stats;
}

// Filter wind farms
function filterWindFarms(windfarms, filters) {
    let filtered = [...windfarms];

    if (filters.county) {
        filtered = filtered.filter(wf =>
            wf.county.toLowerCase() === filters.county.toLowerCase()
        );
    }

    if (filters.status) {
        filtered = filtered.filter(wf =>
            wf.status.toLowerCase() === filters.status.toLowerCase()
        );
    }

    if (filters.minCapacity) {
        const min = parseFloat(filters.minCapacity);
        filtered = filtered.filter(wf => wf.capacityMW >= min);
    }

    if (filters.maxCapacity) {
        const max = parseFloat(filters.maxCapacity);
        filtered = filtered.filter(wf => wf.capacityMW <= max);
    }

    if (filters.year) {
        const year = parseInt(filters.year);
        filtered = filtered.filter(wf => wf.connectionYear === year);
    }

    if (filters.search) {
        const search = filters.search.toLowerCase();
        filtered = filtered.filter(wf =>
            wf.name.toLowerCase().includes(search) ||
            wf.county.toLowerCase().includes(search)
        );
    }

    return filtered;
}

// Main handler
module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle OPTIONS
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    try {
        // Parse query filters
        const filters = {
            county: req.query.county,
            status: req.query.status,
            minCapacity: req.query.minCapacity,
            maxCapacity: req.query.maxCapacity,
            year: req.query.year,
            search: req.query.search
        };

        const forceRefresh = req.query.refresh === 'true';
        const includeCoordinates = req.query.coordinates === 'true';

        // Try to load from cache
        let cacheData = !forceRefresh ? await loadCachedWindFarms() : null;
        let windfarms;
        let fromCache = false;

        if (cacheData && cacheData.windfarms) {
            windfarms = cacheData.windfarms;
            fromCache = true;
        } else {
            // Fetch fresh data
            windfarms = await fetchWindFarms();
        }

        // Apply filters
        const filtered = filterWindFarms(windfarms, filters);

        // Remove coordinates unless specifically requested (reduce payload)
        const response = includeCoordinates ? filtered : filtered.map(wf => {
            const { gridE, gridN, ...rest } = wf;
            return rest;
        });

        // Calculate statistics
        const stats = calculateStats(filtered);

        res.status(200).json({
            windfarms: response,
            count: response.length,
            totalCount: windfarms.length,
            stats: stats,
            filters: filters,
            fromCache: fromCache,
            source: 'SEAI (Sustainable Energy Authority of Ireland)',
            dataDate: 'June 2022',
            lastUpdate: fromCache ? new Date(cacheData.timestamp).toISOString() : new Date().toISOString()
        });

    } catch (error) {
        console.error('Error in windfarms endpoint:', error);
        res.status(500).json({
            error: 'Failed to fetch wind farms data',
            message: error.message
        });
    }
};
