/* ========================================
   IRELAND WIND FARM NEWS - APPLICATION
   ======================================== */

// Configuration
const CONFIG = {
    // Backend API endpoint
    API_ENDPOINT: window.location.origin + '/api/articles',

    // Auto-refresh interval (minutes)
    REFRESH_INTERVAL: 60
};

// Global state
let allArticles = [];
let filteredArticles = [];
let currentView = 'list';

// DOM Elements
const newsGrid = document.getElementById('newsGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const lastUpdated = document.getElementById('lastUpdated');
const autoRefreshStatus = document.getElementById('autoRefreshStatus');

// Province filter checkboxes
const filterMunster = document.getElementById('filterMunster');
const filterLeinster = document.getElementById('filterLeinster');
const filterConnacht = document.getElementById('filterConnacht');
const filterUlster = document.getElementById('filterUlster');
const filterNational = document.getElementById('filterNational');

// Type filter checkboxes
const filterOffshore = document.getElementById('filterOffshore');
const filterOnshore = document.getElementById('filterOnshore');
const filterPlanning = document.getElementById('filterPlanning');
const filterConstruction = document.getElementById('filterConstruction');

// View buttons
const viewButtons = document.querySelectorAll('.view-btn');

// Stat counters
const offshoreCount = document.getElementById('offshoreCount');
const onshoreCount = document.getElementById('onshoreCount');
const planningCount = document.getElementById('planningCount');
const totalArticles = document.getElementById('totalArticles');

/* ========================================
   INITIALIZATION
   ======================================== */

document.addEventListener('DOMContentLoaded', function() {
    console.log('Ireland Wind Farm News initialized');

    // Load cached news first if available
    loadCachedNews();

    // Load fresh news
    loadNews();

    // Event listeners
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') performSearch();
    });

    // Province filter listeners
    filterMunster.addEventListener('change', applyFilters);
    filterLeinster.addEventListener('change', applyFilters);
    filterConnacht.addEventListener('change', applyFilters);
    filterUlster.addEventListener('change', applyFilters);
    filterNational.addEventListener('change', applyFilters);

    // Type filter listeners
    filterOffshore.addEventListener('change', applyFilters);
    filterOnshore.addEventListener('change', applyFilters);
    filterPlanning.addEventListener('change', applyFilters);
    filterConstruction.addEventListener('change', applyFilters);

    // View toggle
    viewButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            switchView(view);
        });
    });

    // Auto-refresh every 60 minutes
    let refreshCountdown = CONFIG.REFRESH_INTERVAL * 60;
    setInterval(() => {
        refreshCountdown--;
        updateAutoRefreshStatus(refreshCountdown);

        if (refreshCountdown <= 0) {
            console.log('Auto-refreshing news...');
            animateRefreshIcon();
            loadNews();
            refreshCountdown = CONFIG.REFRESH_INTERVAL * 60;
        }
    }, 1000); // Update every second
});

/* ========================================
   LOAD NEWS
   ======================================== */

async function loadNews() {
    showLoading(true);
    updateLastRefreshed();

    try {
        console.log('Fetching news from backend API...');

        // Fetch from backend API
        const response = await fetch(CONFIG.API_ENDPOINT);

        if (!response.ok) {
            throw new Error(`API request failed: ${response.status}`);
        }

        const data = await response.json();

        if (data.articles && data.articles.length > 0) {
            // Convert date strings back to Date objects
            allArticles = data.articles.map(article => ({
                ...article,
                date: new Date(article.date)
            }));

            console.log(`Successfully loaded ${allArticles.length} articles from backend`);
            console.log(`Backend last updated: ${new Date(data.lastUpdate).toLocaleTimeString()}`);
        } else {
            console.log('No articles found from backend.');
            allArticles = [];
        }

        // Cache articles to localStorage
        cacheNews();

        // Apply filters and display
        applyFilters();
        updateStats();

    } catch (error) {
        console.error('Error loading news:', error);
        console.log('Falling back to cached news...');

        // Try to load from cache if API fails
        if (allArticles.length === 0) {
            loadCachedNews();
        }

        applyFilters();
        updateStats();
    } finally {
        showLoading(false);
    }
}

// Load cached news from localStorage
function loadCachedNews() {
    try {
        const cached = localStorage.getItem('wind_farm_news_cache');
        if (cached) {
            const data = JSON.parse(cached);
            const cacheAge = Date.now() - data.timestamp;

            // Use cache if less than 15 minutes old
            if (cacheAge < CONFIG.REFRESH_INTERVAL * 60 * 1000) {
                console.log('Loading cached news...');
                allArticles = data.articles.map(article => ({
                    ...article,
                    date: new Date(article.date)
                }));
                applyFilters();
                updateStats();
                updateLastRefreshed();
                console.log(`Loaded ${allArticles.length} cached articles`);
            } else {
                console.log('Cache expired, will fetch fresh news');
            }
        }
    } catch (error) {
        console.error('Error loading cached news:', error);
    }
}

// Cache news to localStorage
function cacheNews() {
    try {
        const cacheData = {
            timestamp: Date.now(),
            articles: allArticles
        };
        localStorage.setItem('wind_farm_news_cache', JSON.stringify(cacheData));
        console.log('News cached successfully');
    } catch (error) {
        console.error('Error caching news:', error);
    }
}

/* ========================================
   FILTERING & SEARCH
   ======================================== */

function applyFilters() {
    let filtered = [...allArticles];

    // Get active province filters
    const activeProvinceFilters = {
        Munster: filterMunster.checked,
        Leinster: filterLeinster.checked,
        Connacht: filterConnacht.checked,
        Ulster: filterUlster.checked,
        National: filterNational.checked
    };

    // Get active type filters
    const activeTypeFilters = {
        offshore: filterOffshore.checked,
        onshore: filterOnshore.checked,
        planning: filterPlanning.checked,
        construction: filterConstruction.checked
    };

    // Apply province filters
    filtered = filtered.filter(article => {
        return activeProvinceFilters[article.province];
    });

    // Apply type tag filters
    filtered = filtered.filter(article => {
        // Check if article has any of the active filter tags
        return article.tags.some(tag => activeTypeFilters[tag]);
    });

    // Apply search filter if search text exists
    const searchText = searchInput.value.trim().toLowerCase();
    if (searchText) {
        filtered = filtered.filter(article => {
            return article.title.toLowerCase().includes(searchText) ||
                   article.description.toLowerCase().includes(searchText) ||
                   article.source.toLowerCase().includes(searchText);
        });
    }

    filteredArticles = filtered;
    displayArticles();
}

function performSearch() {
    applyFilters();
}

/* ========================================
   DISPLAY ARTICLES
   ======================================== */

function displayArticles() {
    newsGrid.innerHTML = '';

    if (filteredArticles.length === 0) {
        showEmptyState(true);
        return;
    }

    showEmptyState(false);

    filteredArticles.forEach(article => {
        const card = createNewsCard(article);
        newsGrid.appendChild(card);
    });

    updateStats();
}

function createNewsCard(article) {
    const card = document.createElement('div');
    card.className = 'news-card';

    const tagsHTML = article.tags.map(tag =>
        `<span class="tag ${tag}">${tag}</span>`
    ).join('');

    const timeAgo = getTimeAgo(article.date);

    // Add province badge
    const provinceBadge = `<span class="province-badge province-${article.province.toLowerCase()}">${article.province}</span>`;

    card.innerHTML = `
        <div class="news-card-image">
            ${article.image ?
                `<img src="${article.image}" alt="${article.title}" style="width: 100%; height: 100%; object-fit: cover;">` :
                `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
                </svg>`
            }
            ${provinceBadge}
        </div>
        <div class="news-card-content">
            <div class="news-card-header">
                <div class="news-card-tags">${tagsHTML}</div>
                <div class="news-card-date">${timeAgo}</div>
            </div>
            <h3>${article.title}</h3>
            <p class="news-card-description">${article.description || 'No description available.'}</p>
            <div class="news-card-footer">
                <span class="news-card-source">${article.source}</span>
                <a href="${article.url}" target="_blank" class="news-card-link">
                    Read more
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </a>
            </div>
        </div>
    `;

    return card;
}

/* ========================================
   STATISTICS
   ======================================== */

function updateStats() {
    const stats = {
        offshore: 0,
        onshore: 0,
        planning: 0,
        total: filteredArticles.length
    };

    filteredArticles.forEach(article => {
        if (article.tags.includes('offshore')) stats.offshore++;
        if (article.tags.includes('onshore')) stats.onshore++;
        if (article.tags.includes('planning')) stats.planning++;
    });

    // Animate counter update
    animateCounter(offshoreCount, stats.offshore);
    animateCounter(onshoreCount, stats.onshore);
    animateCounter(planningCount, stats.planning);
    animateCounter(totalArticles, stats.total);
}

function animateCounter(element, target) {
    const current = parseInt(element.textContent) || 0;
    const step = Math.ceil(Math.abs(target - current) / 20);

    if (current < target) {
        const newValue = Math.min(current + step, target);
        element.textContent = newValue;
        if (newValue < target) {
            requestAnimationFrame(() => animateCounter(element, target));
        }
    } else if (current > target) {
        const newValue = Math.max(current - step, target);
        element.textContent = newValue;
        if (newValue > target) {
            requestAnimationFrame(() => animateCounter(element, target));
        }
    }
}

/* ========================================
   VIEW SWITCHING
   ======================================== */

function switchView(view) {
    currentView = view;

    // Update button states
    viewButtons.forEach(btn => {
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update grid class
    newsGrid.className = `news-grid ${view}-view`;
}

/* ========================================
   UI HELPERS
   ======================================== */

function showLoading(show) {
    loadingState.style.display = show ? 'block' : 'none';
    newsGrid.style.display = show ? 'none' : 'grid';
}

function showEmptyState(show) {
    emptyState.style.display = show ? 'block' : 'none';
    newsGrid.style.display = show ? 'none' : 'grid';
}

function updateLastRefreshed() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-IE', {
        hour: '2-digit',
        minute: '2-digit'
    });
    lastUpdated.textContent = `Last updated: ${timeString}`;
}

function getTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);

    const intervals = {
        year: 31536000,
        month: 2592000,
        week: 604800,
        day: 86400,
        hour: 3600,
        minute: 60
    };

    for (const [unit, secondsInUnit] of Object.entries(intervals)) {
        const interval = Math.floor(seconds / secondsInUnit);
        if (interval >= 1) {
            return `${interval} ${unit}${interval > 1 ? 's' : ''} ago`;
        }
    }

    return 'Just now';
}

function updateAutoRefreshStatus(secondsRemaining) {
    if (!autoRefreshStatus) return;

    const minutes = Math.floor(secondsRemaining / 60);
    const seconds = secondsRemaining % 60;

    if (minutes > 0) {
        autoRefreshStatus.textContent = `Auto-refresh in ${minutes}m ${seconds}s`;
    } else {
        autoRefreshStatus.textContent = `Auto-refresh in ${seconds}s`;
    }
}

function animateRefreshIcon() {
    const refreshIcon = document.querySelector('.refresh-icon');
    if (refreshIcon) {
        refreshIcon.style.animation = 'spin 1s ease-in-out';
        setTimeout(() => {
            refreshIcon.style.animation = '';
        }, 1000);
    }
}

/* ========================================
   EXPORT FOR TESTING
   ======================================== */

// For testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        categorizeArticle,
        categorizeTags,
        getTimeAgo
    };
}
