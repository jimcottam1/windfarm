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
const trendingGrid = document.getElementById('trendingGrid');

// Province filter checkboxes
const filterMunster = document.getElementById('filterMunster');
const filterLeinster = document.getElementById('filterLeinster');
const filterConnacht = document.getElementById('filterConnacht');
const filterUlster = document.getElementById('filterUlster');
const filterNational = document.getElementById('filterNational');


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

    // Load cached news first if available
    loadCachedNews();

    // Check if we need to fetch fresh news
    function shouldFetchFreshNews() {
        try {
            const cached = localStorage.getItem('wind_farm_news_cache');
            if (!cached) {
                return true;
            }
            const data = JSON.parse(cached);
            const ageMinutes = (Date.now() - data.timestamp) / (1000 * 60);
            return ageMinutes >= CONFIG.REFRESH_INTERVAL;
        } catch (error) {
            console.error('Error checking cache age:', error);
            return true;
        }
    }

    // Only load fresh news if cache is stale or missing
    if (shouldFetchFreshNews()) {
        loadNews();
    } else {
        showLoading(false);
        applyFilters();
        updateStats();
    }

    // Initialize filter count on page load
    updateActiveFilterCount();

    // Event listeners
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keyup', function(e) {
        if (e.key === 'Enter') performSearch();
    });

    // Filter toggle for mobile and desktop
    if (filterToggle) {
        filterToggle.addEventListener('click', function() {
            const isOpening = !filterToggle.classList.contains('open');
            filterToggle.classList.toggle('open');
            filterContent.classList.toggle('open');

            // When closing filters, collapse all sub-sections
            if (!isOpening) {
                document.querySelectorAll('.filter-section-header').forEach(header => {
                    header.classList.remove('open');
                    const filterGroup = header.nextElementSibling;
                    if (filterGroup && filterGroup.classList.contains('filter-group')) {
                        filterGroup.classList.add('collapsed');
                    }
                });
            }
        });
    }

    // Collapsible filter sections - accordion style (only one open at a time)
    document.querySelectorAll('.filter-section-header').forEach(header => {
        header.addEventListener('click', function() {
            const wasOpen = this.classList.contains('open');
            const filterGroup = this.nextElementSibling;

            // Close all other sections
            document.querySelectorAll('.filter-section-header').forEach(otherHeader => {
                otherHeader.classList.remove('open');
                const otherGroup = otherHeader.nextElementSibling;
                if (otherGroup && otherGroup.classList.contains('filter-group')) {
                    otherGroup.classList.add('collapsed');
                }
            });

            // If this section wasn't open, open it
            if (!wasOpen && filterGroup && filterGroup.classList.contains('filter-group')) {
                this.classList.add('open');
                filterGroup.classList.remove('collapsed');
            }
        });
    });

    // Province filter listeners with tracking
    filterMunster.addEventListener('change', () => {
        trackEvent('filter_change', { filter_type: 'province', filter_value: 'Munster', checked: filterMunster.checked });
        applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterMunster);
    });
    filterLeinster.addEventListener('change', () => {
        trackEvent('filter_change', { filter_type: 'province', filter_value: 'Leinster', checked: filterLeinster.checked });
        applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterLeinster);
    });
    filterConnacht.addEventListener('change', () => {
        trackEvent('filter_change', { filter_type: 'province', filter_value: 'Connacht', checked: filterConnacht.checked });
        applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterConnacht);
    });
    filterUlster.addEventListener('change', () => {
        trackEvent('filter_change', { filter_type: 'province', filter_value: 'Ulster', checked: filterUlster.checked });
        applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterUlster);
    });
    filterNational.addEventListener('change', () => {
        trackEvent('filter_change', { filter_type: 'province', filter_value: 'National', checked: filterNational.checked });
        applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterNational);
    });

    // View toggle with tracking
    viewButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const view = this.dataset.view;
            trackEvent('view_change', { view_type: view });
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

        } else {
            allArticles = [];
        }

        // Cache articles to localStorage
        cacheNews();

        // Apply filters and display
        applyFilters();
        updateStats();
        updateTicker();
        updateTrending();

    } catch (error) {
        console.error('Error loading news:', error);

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
                updateTrending();
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

    // Apply province filters
    filtered = filtered.filter(article => {
        return activeProvinceFilters[article.province];
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
    const searchQuery = searchInput.value.trim();
    if (searchQuery) {
        trackEvent('search', { search_term: searchQuery });
    }
    applyFilters();
    updateActiveFilterCount();
}

function updateActiveFilterCount() {
    let activeFilters = 0;

    // Count how many filters are LIMITING results (not showing everything)
    // Province filters - only count if not all are selected
    const allProvincesChecked = filterMunster.checked && filterLeinster.checked &&
                                filterConnacht.checked && filterUlster.checked &&
                                filterNational.checked;
    if (!allProvincesChecked) {
        activeFilters++;
    }

    // Search filter
    if (searchInput && searchInput.value.trim()) {
        activeFilters++;
    }

    if (activeFilterCount) {
        if (activeFilters === 0) {
            activeFilterCount.textContent = '';
        } else {
            activeFilterCount.textContent = `(${activeFilters})`;
        }
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
    const articlesBeforeLoad = displayedArticles.length;

    // Don't increment currentPage - we use displayedArticles.length instead
    displayArticles(false);

    const articlesLoaded = displayedArticles.length - articlesBeforeLoad;
    trackEvent('load_more', { articles_loaded: articlesLoaded });

    // Scroll to the first newly loaded article
    const firstNewArticle = newsGrid.children[displayedArticles.length - ARTICLES_PER_PAGE];
    if (firstNewArticle) {
        setTimeout(() => {
            firstNewArticle.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
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

    const timeAgo = getTimeAgo(article.date);

    // Add province badge
    const provinceBadge = `<span class="province-badge province-${article.province.toLowerCase()}">${article.province}</span>`;

    // Add AI category badges
    const tagsHTML = article.tags.map(tag =>
        `<span class="tag ${tag}">${tag}</span>`
    ).join('');

    // Encode URLs for sharing
    const encodedUrl = encodeURIComponent(article.url);
    const encodedTitle = encodeURIComponent(article.title);
    const encodedDescription = encodeURIComponent(article.description || '');

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
                <div class="news-card-footer-left">
                    <span class="news-card-source">${article.source}</span>
                    <div class="share-buttons">
                        <button class="share-btn" data-share="twitter" data-url="${article.url}" data-title="${article.title}" title="Share on Twitter">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                            </svg>
                        </button>
                        <button class="share-btn" data-share="linkedin" data-url="${article.url}" data-title="${article.title}" title="Share on LinkedIn">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                            </svg>
                        </button>
                        <button class="share-btn" data-share="facebook" data-url="${article.url}" title="Share on Facebook">
                            <svg viewBox="0 0 24 24" fill="currentColor">
                                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                            </svg>
                        </button>
                        <button class="share-btn" data-share="email" data-url="${article.url}" data-title="${article.title}" data-description="${article.description || ''}" title="Share via Email">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                                <polyline points="22,6 12,13 2,6"/>
                            </svg>
                        </button>
                    </div>
                </div>
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

    // Count articles by province
    const provinceCounts = {
        Munster: 0,
        Leinster: 0,
        Connacht: 0,
        Ulster: 0,
        National: 0
    };

    allArticles.forEach(article => {
        // Count provinces
        if (provinceCounts[article.province] !== undefined) {
            provinceCounts[article.province]++;
        }
    });

    // Update province badges
    document.getElementById('badgeMunster').textContent = provinceCounts.Munster;
    document.getElementById('badgeLeinster').textContent = provinceCounts.Leinster;
    document.getElementById('badgeConnacht').textContent = provinceCounts.Connacht;
    document.getElementById('badgeUlster').textContent = provinceCounts.Ulster;
    document.getElementById('badgeNational').textContent = provinceCounts.National;
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

function collapseFilterSection(filterElement) {
    // Find the filter section containing this element
    const filterSection = filterElement.closest('.filter-section');
    if (filterSection) {
        const header = filterSection.querySelector('.filter-section-header');
        const filterGroup = filterSection.querySelector('.filter-group');

        if (header && filterGroup && !filterGroup.classList.contains('collapsed')) {
            // Collapse it
            header.classList.remove('open');
            filterGroup.classList.add('collapsed');
        }
    }
}

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
   TRENDING SECTION
   ======================================== */

function updateTrending() {
    if (!trendingGrid) return;

    // Get the 5 most recent articles
    const trendingArticles = allArticles
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, 5);

    if (trendingArticles.length === 0) {
        trendingGrid.innerHTML = '<p style="text-align: center; color: var(--text-light);">No trending articles available</p>';
        return;
    }

    // Clear existing content
    trendingGrid.innerHTML = '';

    // Create trending cards
    trendingArticles.forEach(article => {
        const card = document.createElement('div');
        card.className = 'trending-card';

        const timeAgo = getTimeAgo(article.date);
        const primaryTag = article.tags[0] || 'news';

        card.innerHTML = `
            <div class="trending-card-image">
                ${article.image ?
                    `<img loading="lazy" src="${article.image}" alt="${article.title}">` :
                    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>
                    </svg>`
                }
                <div class="trending-badge">
                    <svg viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2l2.4 7.4h7.6l-6 4.6 2.3 7-6.3-4.6-6.3 4.6 2.3-7-6-4.6h7.6z"/>
                    </svg>
                    Trending
                </div>
            </div>
            <div class="trending-card-content">
                <h3>${article.title}</h3>
                <div class="trending-card-tags">
                    <span class="tag ${primaryTag}">${primaryTag}</span>
                </div>
                <div class="trending-card-meta">
                    <span>${article.source}</span>
                    <span>${timeAgo}</span>
                </div>
                <a href="${article.url}" target="_blank" class="trending-card-link">
                    Read more
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                </a>
            </div>
        `;

        trendingGrid.appendChild(card);
    });

    console.log(`Trending section updated with ${trendingArticles.length} articles`);
}

/* ========================================
   ANALYTICS & TRACKING
   ======================================== */

/**
 * Track custom events with Google Analytics 4
 */
function trackEvent(eventName, params = {}) {
    if (typeof gtag === 'function') {
        gtag('event', eventName, params);
        console.log(`Tracked event: ${eventName}`, params);
    }
}

// Track article link clicks
document.addEventListener('click', function(e) {
    const articleLink = e.target.closest('.news-card-link');
    if (articleLink) {
        const url = articleLink.getAttribute('href');
        const card = articleLink.closest('.news-card');
        const title = card ? card.querySelector('h3')?.textContent : 'Unknown';
        trackEvent('article_click', {
            article_url: url,
            article_title: title,
            link_text: 'Read more'
        });
    }
});

/* ========================================
   SOCIAL SHARING
   ======================================== */

// Event delegation for share buttons
document.addEventListener('click', function(e) {
    const shareBtn = e.target.closest('.share-btn');
    if (!shareBtn) return;

    e.preventDefault();

    const shareType = shareBtn.getAttribute('data-share');
    const url = shareBtn.getAttribute('data-url');
    const title = shareBtn.getAttribute('data-title');
    const description = shareBtn.getAttribute('data-description') || '';

    // Track share event with GA4
    trackEvent('share', {
        'method': shareType,
        'content_type': 'article',
        'item_id': url
    });

    // Open share window
    let shareUrl = '';

    switch(shareType) {
        case 'twitter':
            shareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
            break;
        case 'linkedin':
            shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
            break;
        case 'facebook':
            shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
            break;
        case 'email':
            shareUrl = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(description + '\n\n' + url)}`;
            window.location.href = shareUrl;
            return;
    }

    if (shareUrl) {
        window.open(shareUrl, 'share-dialog', 'width=626,height=436');
    }
});

/* ========================================
   WEEKLY DIGEST
   ======================================== */

// Build digest HTML from data
function buildDigestHTML(data) {
    let html = `
        <div class="digest-summary">
            <h3>Executive Summary</h3>
            <p>${data.summary}</p>
            ${data.dateRange ? `<span class="digest-date">Period: ${data.dateRange}</span>` : ''}
            <span class="digest-meta">${data.articlesAnalyzed || data.totalArticles} articles analyzed</span>
        </div>
    `;

    if (data.topStories && data.topStories.length > 0) {
        html += `
            <div class="digest-top-stories">
                <h3>Top Stories</h3>
                <ol class="top-stories-list">
        `;
        data.topStories.forEach(story => {
            html += `
                <li>
                    <strong>${story.title}</strong>
                    <p>${story.significance}</p>
                    <span class="story-category category-${story.category}">${story.category}</span>
                </li>
            `;
        });
        html += `</ol></div>`;
    }

    if (data.insights && data.insights.length > 0) {
        html += `
            <div class="digest-insights">
                <h3>Key Insights & Trends</h3>
                <ul class="insights-list">
        `;
        data.insights.forEach(insight => {
            html += `<li>${insight}</li>`;
        });
        html += `</ul></div>`;
    }

    if (data.breakdown) {
        html += `
            <div class="digest-breakdown">
                <h3>Coverage Breakdown</h3>
                <div class="breakdown-grid">
        `;

        if (data.breakdown.offshore !== undefined || data.breakdown.onshore !== undefined) {
            html += `
                <div class="breakdown-card">
                    <h4>Type</h4>
                    <div class="breakdown-stats">
                        <span>Offshore: <strong>${data.breakdown.offshore || 0}</strong></span>
                        <span>Onshore: <strong>${data.breakdown.onshore || 0}</strong></span>
                    </div>
                </div>
            `;
        }

        if (data.breakdown.provinces) {
            const provinces = data.breakdown.provinces;
            html += `
                <div class="breakdown-card">
                    <h4>By Province</h4>
                    <div class="breakdown-stats">
            `;
            Object.entries(provinces).forEach(([province, count]) => {
                html += `<span>${province}: <strong>${count}</strong></span>`;
            });
            html += `</div></div>`;
        }

        html += `</div></div>`;
    }

    html += `<div class="digest-footer">Generated: ${new Date(data.generated).toLocaleString('en-IE')}</div>`;
    return html;
}

// Load Weekly Digest
async function loadWeeklyDigest() {
    const digestContent = document.getElementById('weeklyDigestContent');
    digestContent.classList.remove('collapsed');
    digestContent.innerHTML = '<div class="digest-loading">Generating AI weekly digest...</div>';

    try {
        const response = await fetch('/api/digest/weekly');
        const data = await response.json();

        if (data.error) {
            digestContent.innerHTML = `<div class="digest-error">Error: ${data.error}</div>`;
            return;
        }

        digestContent.innerHTML = buildDigestHTML(data);
    } catch (error) {
        console.error('Error loading weekly digest:', error);
        digestContent.innerHTML = '<div class="digest-error">Failed to load weekly digest. Please try again.</div>';
    }
}

// Toggle digest collapse/expand
function toggleDigest(headerElement, contentElement) {
    headerElement.classList.toggle('collapsed');
    contentElement.classList.toggle('collapsed');
}

// Initialize digest
document.addEventListener('DOMContentLoaded', function() {
    const weeklyDigestHeader = document.getElementById('weeklyDigestHeader');
    const weeklyDigestContent = document.getElementById('weeklyDigestContent');
    const refreshWeeklyDigestBtn = document.getElementById('refreshWeeklyDigest');

    if (weeklyDigestHeader && weeklyDigestContent) {
        // Start collapsed
        weeklyDigestHeader.classList.add('collapsed');

        // Toggle on header click
        weeklyDigestHeader.addEventListener('click', (e) => {
            if (e.target.closest('.refresh-digest-btn')) return; // Don't toggle when clicking refresh
            toggleDigest(weeklyDigestHeader, weeklyDigestContent);

            // Load content if it hasn't been loaded yet
            if (!weeklyDigestHeader.classList.contains('collapsed') &&
                weeklyDigestContent.querySelector('.digest-loading')) {
                loadWeeklyDigest();
            }
        });

        if (refreshWeeklyDigestBtn) {
            refreshWeeklyDigestBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadWeeklyDigest();
            });
        }
    }
});

/* ========================================
   ECONOMIC IMPACT CALCULATOR
   ======================================== */

// Industry standard multipliers (based on Irish & EU wind energy data)
const CALCULATOR_CONSTANTS = {
    // Jobs per MW (combined construction + operations)
    // Construction: ~15 jobs per MW for 2-3 years
    // Operations: ~0.3 jobs per MW for 25+ years
    // Average: ~10 jobs per MW over lifetime
    JOBS_PER_MW: 10,

    // Investment cost per MW (€ millions)
    // Onshore: €1.2-1.5M per MW
    // Offshore: €3-4M per MW
    // Average: €2M per MW
    INVESTMENT_PER_MW: 2.0, // in millions

    // CO2 savings (tonnes per year per MW)
    // Based on displacing fossil fuel generation
    // Average: 2,000 tonnes CO2 per MW per year
    CO2_TONNES_PER_MW_YEAR: 2000,

    // Homes powered per MW
    // Average Irish home: ~4,200 kWh per year
    // 1 MW wind turbine: ~2,500 MWh per year (capacity factor ~30%)
    // Therefore: 2,500,000 / 4,200 ≈ 595 homes per MW
    HOMES_PER_MW: 595
};

function calculateImpact(capacityMW) {
    return {
        jobs: Math.round(capacityMW * CALCULATOR_CONSTANTS.JOBS_PER_MW),
        investmentMillions: (capacityMW * CALCULATOR_CONSTANTS.INVESTMENT_PER_MW).toFixed(1),
        co2Tonnes: Math.round(capacityMW * CALCULATOR_CONSTANTS.CO2_TONNES_PER_MW_YEAR),
        homes: Math.round(capacityMW * CALCULATOR_CONSTANTS.HOMES_PER_MW)
    };
}

function formatNumber(num) {
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function updateCalculatorResults() {
    const capacityInput = document.getElementById('capacityInput');
    const capacity = parseInt(capacityInput.value) || 0;

    if (capacity < 1) {
        document.getElementById('jobsCreated').textContent = '-';
        document.getElementById('investment').textContent = '-';
        document.getElementById('co2Saved').textContent = '-';
        document.getElementById('homesPowered').textContent = '-';
        return;
    }

    const impact = calculateImpact(capacity);

    document.getElementById('jobsCreated').textContent = formatNumber(impact.jobs);
    document.getElementById('investment').textContent = '€' + formatNumber(impact.investmentMillions) + 'M';
    document.getElementById('co2Saved').textContent = formatNumber(impact.co2Tonnes) + ' tonnes';
    document.getElementById('homesPowered').textContent = formatNumber(impact.homes);
}

// Initialize calculator
document.addEventListener('DOMContentLoaded', function() {
    const capacityInput = document.getElementById('capacityInput');
    const presetButtons = document.querySelectorAll('.preset-btn');

    if (capacityInput) {
        // Update on input change
        capacityInput.addEventListener('input', updateCalculatorResults);

        // Initial calculation
        updateCalculatorResults();
    }

    // Preset buttons
    presetButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const capacity = this.getAttribute('data-capacity');
            capacityInput.value = capacity;
            updateCalculatorResults();
        });
    });
});

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
