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

// Pagination state
const ARTICLES_PER_PAGE = 30;
let currentPage = 1;
let displayedArticles = [];

// DOM Elements
const newsGrid = document.getElementById('newsGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const lastUpdated = document.getElementById('lastUpdated');
const autoRefreshStatus = document.getElementById('autoRefreshStatus');
const tickerContent = document.getElementById('tickerContent');
const filterToggle = document.getElementById('filterToggle');
const filterContent = document.getElementById('filterContent');
const activeFilterCount = document.getElementById('activeFilterCount');
const backToTopBtn = document.getElementById('backToTop');
const loadMoreContainer = document.getElementById('loadMoreContainer');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const loadMoreText = document.getElementById('loadMoreText');
const articlesShown = document.getElementById('articlesShown');
const articlesTotal = document.getElementById('articlesTotal');

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

    // Check if we need to fetch fresh news
    function shouldFetchFreshNews() {
        try {
            const cached = localStorage.getItem('wind_farm_news_cache');
            if (!cached) {
                console.log('No cached data found, will fetch fresh news');
                return true;
            }
            const data = JSON.parse(cached);
            const ageMinutes = (Date.now() - data.timestamp) / (1000 * 60);
            console.log(`Cached data age: ${ageMinutes.toFixed(1)} minutes`);
            return ageMinutes >= CONFIG.REFRESH_INTERVAL;
        } catch (error) {
            console.error('Error checking cache age:', error);
            return true;
        }
    }

    // Only load fresh news if cache is stale or missing
    if (shouldFetchFreshNews()) {
        console.log('Cache is stale or missing, fetching fresh news...');
        loadNews();
    } else {
        console.log('Using cached data (still fresh)');
        showLoading(false);
        applyFilters();
        updateStats();
    }

    // Event listeners
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') performSearch();
    });

    // Filter toggle for mobile
    if (filterToggle) {
        filterToggle.addEventListener('click', function() {
            filterToggle.classList.toggle('open');
            filterContent.classList.toggle('open');
        });
    }

    // Province filter listeners
    filterMunster.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterLeinster.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterConnacht.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterUlster.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterNational.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });

    // Type filter listeners
    filterOffshore.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterOnshore.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterPlanning.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });
    filterConstruction.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); });

    // View toggle
    viewButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            switchView(view);
        });
    });

    // Fix ticker animation on page visibility change and focus
    function restartTickerAnimation() {
        if (tickerContent) {
            // Force animation restart by re-triggering it
            tickerContent.style.animation = 'none';
            // Force reflow to ensure animation stops
            void tickerContent.offsetWidth;
            // Use longer delay for mobile browsers
            setTimeout(() => {
                tickerContent.style.animation = '';
            }, 50);
        }
    }

    document.addEventListener('visibilitychange', function() {
        if (!document.hidden) {
            restartTickerAnimation();
        }
    });

    // Also restart when window regains focus (for new tab scenarios)
    window.addEventListener('focus', function() {
        restartTickerAnimation();
    });

    // Handle back/forward cache (bfcache) on mobile browsers
    window.addEventListener('pageshow', function(event) {
        // If page is loaded from bfcache, restart animation
        if (event.persisted) {
            // Immediate restart for bfcache
            setTimeout(() => {
                restartTickerAnimation();
            }, 100);
        }
    });

    // Additional pagehide listener to ensure clean state
    window.addEventListener('pagehide', function() {
        if (tickerContent) {
            tickerContent.style.animation = 'none';
        }
    });

    // Back to top button functionality
    if (backToTopBtn) {
        // Show/hide button based on scroll position
        window.addEventListener('scroll', function() {
            if (window.pageYOffset > 300) {
                backToTopBtn.classList.add('visible');
            } else {
                backToTopBtn.classList.remove('visible');
            }
        });

        // Scroll to top when clicked
        backToTopBtn.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // Load more button functionality
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', loadMoreArticles);
    }

    // Auto-refresh every 60 minutes with persistent countdown
    function getTimeRemaining() {
        try {
            const cached = localStorage.getItem('wind_farm_news_cache');
            if (cached) {
                const data = JSON.parse(cached);
                const elapsedSeconds = Math.floor((Date.now() - data.timestamp) / 1000);
                const remainingSeconds = (CONFIG.REFRESH_INTERVAL * 60) - elapsedSeconds;
                return Math.max(0, remainingSeconds);
            }
        } catch (error) {
            console.error('Error calculating time remaining:', error);
        }
        return CONFIG.REFRESH_INTERVAL * 60;
    }

    let refreshCountdown = getTimeRemaining();
    console.log(`Countdown initialized to ${Math.floor(refreshCountdown / 60)}m ${refreshCountdown % 60}s`);

    // Update display immediately with current countdown
    updateAutoRefreshStatus(refreshCountdown);

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
        updateTicker();

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
                updateTicker();
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

    // Sort by date (newest first)
    filtered.sort((a, b) => {
        return new Date(b.date) - new Date(a.date);
    });

    filteredArticles = filtered;
    displayArticles();
}

function performSearch() {
    applyFilters();
}

function updateActiveFilterCount() {
    let count = 0;

    // Count active province filters
    if (filterMunster.checked) count++;
    if (filterLeinster.checked) count++;
    if (filterConnacht.checked) count++;
    if (filterUlster.checked) count++;
    if (filterNational.checked) count++;

    // Count active type filters
    if (filterOffshore.checked) count++;
    if (filterOnshore.checked) count++;
    if (filterPlanning.checked) count++;
    if (filterConstruction.checked) count++;

    if (activeFilterCount) {
        activeFilterCount.textContent = `(${count})`;
    }
}

/* ========================================
   DISPLAY ARTICLES
   ======================================== */

function displayArticles(resetPagination = true) {
    if (resetPagination) {
        currentPage = 1;
        displayedArticles = [];
        newsGrid.innerHTML = '';
    }

    if (filteredArticles.length === 0) {
        showEmptyState(true);
        hideLoadMoreButton();
        return;
    }

    showEmptyState(false);

    // Calculate which articles to display
    const startIndex = displayedArticles.length;
    const endIndex = Math.min(startIndex + ARTICLES_PER_PAGE, filteredArticles.length);
    const articlesToShow = filteredArticles.slice(startIndex, endIndex);

    // Add new articles to displayed list
    displayedArticles.push(...articlesToShow);

    // Render new articles
    articlesToShow.forEach(article => {
        const card = createNewsCard(article);
        newsGrid.appendChild(card);
    });

    // Update load more button
    updateLoadMoreButton();
    updateStats();
}

function loadMoreArticles() {
    currentPage++;
    displayArticles(false);
}

function updateLoadMoreButton() {
    if (!loadMoreContainer) return;

    const remaining = filteredArticles.length - displayedArticles.length;

    if (remaining > 0) {
        loadMoreContainer.style.display = 'block';

        // Update button text
        const articlesToLoad = Math.min(ARTICLES_PER_PAGE, remaining);
        loadMoreText.textContent = `Load ${articlesToLoad} More Article${articlesToLoad !== 1 ? 's' : ''}`;

        // Update counter
        articlesShown.textContent = displayedArticles.length;
        articlesTotal.textContent = filteredArticles.length;
    } else {
        loadMoreContainer.style.display = 'none';
    }
}

function hideLoadMoreButton() {
    if (loadMoreContainer) {
        loadMoreContainer.style.display = 'none';
    }
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
                `<img loading="lazy" src="${article.image}" alt="${article.title}" style="width: 100%; height: 100%; object-fit: cover;">` :
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

    // Update filter badges
    updateFilterBadges();
}

function updateFilterBadges() {
    // Get currently selected filters
    const provinceFilters = {
        Munster: document.getElementById('filterMunster').checked,
        Leinster: document.getElementById('filterLeinster').checked,
        Connacht: document.getElementById('filterConnacht').checked,
        Ulster: document.getElementById('filterUlster').checked,
        National: document.getElementById('filterNational').checked
    };

    const typeFilters = {
        offshore: document.getElementById('filterOffshore').checked,
        onshore: document.getElementById('filterOnshore').checked,
        planning: document.getElementById('filterPlanning').checked,
        construction: document.getElementById('filterConstruction').checked
    };

    // Count articles by province (considering active type filters)
    const provinceCounts = {
        Munster: 0,
        Leinster: 0,
        Connacht: 0,
        Ulster: 0,
        National: 0
    };

    // Count articles by type (considering active province filters)
    const typeCounts = {
        offshore: 0,
        onshore: 0,
        planning: 0,
        construction: 0
    };

    allArticles.forEach(article => {
        // Count provinces (only if article matches active type filters)
        const matchesTypeFilter = article.tags.some(tag => typeFilters[tag]);
        if (matchesTypeFilter && provinceCounts[article.province] !== undefined) {
            provinceCounts[article.province]++;
        }

        // Count types (only if article matches active province filters)
        const matchesProvinceFilter = provinceFilters[article.province];
        if (matchesProvinceFilter) {
            article.tags.forEach(tag => {
                if (typeCounts[tag] !== undefined) {
                    typeCounts[tag]++;
                }
            });
        }
    });

    // Update province badges
    document.getElementById('badgeMunster').textContent = provinceCounts.Munster;
    document.getElementById('badgeLeinster').textContent = provinceCounts.Leinster;
    document.getElementById('badgeConnacht').textContent = provinceCounts.Connacht;
    document.getElementById('badgeUlster').textContent = provinceCounts.Ulster;
    document.getElementById('badgeNational').textContent = provinceCounts.National;

    // Update type badges
    document.getElementById('badgeOffshore').textContent = typeCounts.offshore;
    document.getElementById('badgeOnshore').textContent = typeCounts.onshore;
    document.getElementById('badgePlanning').textContent = typeCounts.planning;
    document.getElementById('badgeConstruction').textContent = typeCounts.construction;
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
    // Get the actual timestamp from cache
    try {
        const cached = localStorage.getItem('wind_farm_news_cache');
        if (cached) {
            const data = JSON.parse(cached);
            const lastFetchTime = new Date(data.timestamp);
            const timeString = lastFetchTime.toLocaleTimeString('en-IE', {
                hour: '2-digit',
                minute: '2-digit'
            });
            lastUpdated.textContent = `Last updated: ${timeString}`;
            return;
        }
    } catch (error) {
        console.error('Error reading last updated time:', error);
    }

    // Fallback to current time if no cache
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
   NEWS TICKER
   ======================================== */

function updateTicker() {
    if (!tickerContent) return;

    // Filter articles for Limerick
    const limerickArticles = allArticles.filter(article => {
        const text = (article.title + ' ' + article.description).toLowerCase();
        return text.includes('limerick');
    });

    if (limerickArticles.length === 0) {
        tickerContent.innerHTML = '<span>No Limerick wind farm news available at this time</span>';
        return;
    }

    // Sort by date (newest first) and take the most recent 10
    const sortedArticles = limerickArticles
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 10);

    // Create ticker HTML with links
    const tickerHTML = sortedArticles
        .map(article => `<a href="${article.url}" target="_blank" rel="noopener noreferrer">${article.title} - ${article.source}</a>`)
        .join('');

    // Duplicate content for seamless loop
    tickerContent.innerHTML = tickerHTML + tickerHTML;

    console.log(`Ticker updated with ${limerickArticles.length} Limerick articles`);
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
