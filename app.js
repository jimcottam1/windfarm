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

// Type filter checkboxes - REMOVED (now using AI categories)

// AI Category filter checkboxes
const filterAllStages = document.getElementById('filterAllStages');
const filterPlanningSt = document.getElementById('filterPlanningSt');
const filterApproved = document.getElementById('filterApproved');
const filterConstructionSt = document.getElementById('filterConstructionSt');
const filterOperational = document.getElementById('filterOperational');
const filterObjection = document.getElementById('filterObjection');

const filterAllSentiment = document.getElementById('filterAllSentiment');
const filterPositive = document.getElementById('filterPositive');
const filterNeutral = document.getElementById('filterNeutral');
const filterConcerns = document.getElementById('filterConcerns');
const filterOpposition = document.getElementById('filterOpposition');

const filterAllTopics = document.getElementById('filterAllTopics');
const filterJobs = document.getElementById('filterJobs');
const filterInvestment = document.getElementById('filterInvestment');
const filterCommunity = document.getElementById('filterCommunity');
const filterEnvironmental = document.getElementById('filterEnvironmental');
const filterEnergy = document.getElementById('filterEnergy');
const filterTechnology = document.getElementById('filterTechnology');
const filterPolicy = document.getElementById('filterPolicy');

const filterAllUrgency = document.getElementById('filterAllUrgency');
const filterHighUrgency = document.getElementById('filterHighUrgency');
const filterMediumUrgency = document.getElementById('filterMediumUrgency');
const filterLowUrgency = document.getElementById('filterLowUrgency');

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

    // Province filter listeners
    filterMunster.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterMunster); });
    filterLeinster.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterLeinster); });
    filterConnacht.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterConnacht); });
    filterUlster.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterUlster); });
    filterNational.addEventListener('change', () => { applyFilters(); updateActiveFilterCount(); collapseFilterSection(filterNational); });

    // Type filter listeners - REMOVED (now using AI categories)

    // AI Category filter listeners - Project Stages
    if (filterAllStages) {
        filterAllStages.addEventListener('change', () => {
            const checked = filterAllStages.checked;
            [filterPlanningSt, filterApproved, filterConstructionSt, filterOperational, filterObjection].forEach(f => {
                if (f) { f.checked = !checked; f.disabled = checked; }
            });
            applyFilters();
            updateActiveFilterCount();
            // Auto-collapse section when "All" is selected
            if (checked) {
                collapseFilterSection(filterAllStages);
            }
        });

        [filterPlanningSt, filterApproved, filterConstructionSt, filterOperational, filterObjection].forEach(filter => {
            if (filter) {
                filter.addEventListener('change', () => {
                    filterAllStages.checked = false;
                    applyFilters();
                    updateActiveFilterCount();
                    collapseFilterSection(filter);
                });
            }
        });
    }

    // AI Category filter listeners - Sentiment
    if (filterAllSentiment) {
        filterAllSentiment.addEventListener('change', () => {
            const checked = filterAllSentiment.checked;
            [filterPositive, filterNeutral, filterConcerns, filterOpposition].forEach(f => {
                if (f) { f.checked = !checked; f.disabled = checked; }
            });
            applyFilters();
            updateActiveFilterCount();
            // Auto-collapse section when "All" is selected
            if (checked) {
                collapseFilterSection(filterAllSentiment);
            }
        });

        [filterPositive, filterNeutral, filterConcerns, filterOpposition].forEach(filter => {
            if (filter) {
                filter.addEventListener('change', () => {
                    filterAllSentiment.checked = false;
                    applyFilters();
                    updateActiveFilterCount();
                    collapseFilterSection(filter);
                });
            }
        });
    }

    // AI Category filter listeners - Topics
    if (filterAllTopics) {
        filterAllTopics.addEventListener('change', () => {
            const checked = filterAllTopics.checked;
            [filterJobs, filterInvestment, filterCommunity, filterEnvironmental, filterEnergy, filterTechnology, filterPolicy].forEach(f => {
                if (f) { f.checked = !checked; f.disabled = checked; }
            });
            applyFilters();
            updateActiveFilterCount();
            // Auto-collapse section when "All" is selected
            if (checked) {
                collapseFilterSection(filterAllTopics);
            }
        });

        [filterJobs, filterInvestment, filterCommunity, filterEnvironmental, filterEnergy, filterTechnology, filterPolicy].forEach(filter => {
            if (filter) {
                filter.addEventListener('change', () => {
                    filterAllTopics.checked = false;
                    applyFilters();
                    updateActiveFilterCount();
                    collapseFilterSection(filter);
                });
            }
        });
    }

    // AI Category filter listeners - Urgency
    if (filterAllUrgency) {
        filterAllUrgency.addEventListener('change', () => {
            const checked = filterAllUrgency.checked;
            [filterHighUrgency, filterMediumUrgency, filterLowUrgency].forEach(f => {
                if (f) { f.checked = !checked; f.disabled = checked; }
            });
            applyFilters();
            updateActiveFilterCount();
            // Auto-collapse section when "All" is selected
            if (checked) {
                collapseFilterSection(filterAllUrgency);
            }
        });

        [filterHighUrgency, filterMediumUrgency, filterLowUrgency].forEach(filter => {
            if (filter) {
                filter.addEventListener('change', () => {
                    filterAllUrgency.checked = false;
                    applyFilters();
                    updateActiveFilterCount();
                    collapseFilterSection(filter);
                });
            }
        });
    }

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

            // Log AI categorization stats (only once on initial load)
            if (!window.statsLogged) {
                window.statsLogged = true;

                console.log(`✅ Successfully loaded ${allArticles.length} articles from backend`);
                console.log(`🕐 Backend last updated: ${new Date(data.lastUpdate).toLocaleTimeString()}`);

                const withAI = allArticles.filter(a => a.aiCategories).length;
                const withoutAI = allArticles.length - withAI;
                console.log(`\n🤖 AI CATEGORIZATION STATS:`);
                console.log(`   ✓ Articles with AI categories: ${withAI} (${Math.round(withAI/allArticles.length*100)}%)`);
                console.log(`   ✗ Articles without AI categories: ${withoutAI} (${Math.round(withoutAI/allArticles.length*100)}%)`);

                // Log sentiment breakdown
                if (withAI > 0) {
                    const sentiments = {
                        positive: 0,
                        neutral: 0,
                        concerns: 0,
                        opposition: 0
                    };
                    const stages = {
                        planning: 0,
                        approved: 0,
                        construction: 0,
                        operational: 0,
                        objection: 0,
                        unknown: 0
                    };
                    const urgency = {
                        high: 0,
                        medium: 0,
                        low: 0
                    };

                    allArticles.forEach(a => {
                        if (a.aiCategories) {
                            sentiments[a.aiCategories.sentiment] = (sentiments[a.aiCategories.sentiment] || 0) + 1;
                            stages[a.aiCategories.projectStage] = (stages[a.aiCategories.projectStage] || 0) + 1;
                            urgency[a.aiCategories.urgency] = (urgency[a.aiCategories.urgency] || 0) + 1;
                        }
                    });

                    console.log(`\n📊 SENTIMENT BREAKDOWN:`);
                    console.log(`   😊 Positive: ${sentiments.positive}`);
                    console.log(`   😐 Neutral: ${sentiments.neutral}`);
                    console.log(`   😟 Concerns: ${sentiments.concerns}`);
                    console.log(`   😠 Opposition: ${sentiments.opposition}`);

                    console.log(`\n🏗️ PROJECT STAGES:`);
                    console.log(`   📋 Planning: ${stages.planning}`);
                    console.log(`   ✅ Approved: ${stages.approved}`);
                    console.log(`   🚧 Construction: ${stages.construction}`);
                    console.log(`   ⚡ Operational: ${stages.operational}`);
                    console.log(`   ⚠️ Objection: ${stages.objection}`);
                    console.log(`   ❓ Unknown: ${stages.unknown}`);

                    console.log(`\n⚡ URGENCY LEVELS:`);
                    console.log(`   🔴 High: ${urgency.high}`);
                    console.log(`   🟡 Medium: ${urgency.medium}`);
                    console.log(`   🟢 Low: ${urgency.low}`);
                }
                console.log(''); // Empty line for readability
            }
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

    // Apply province filters
    filtered = filtered.filter(article => {
        return activeProvinceFilters[article.province];
    });

    // Apply AI Category filters - Project Stage
    if (filterAllStages && !filterAllStages.checked) {
        const activeStages = [];
        if (filterPlanningSt && filterPlanningSt.checked) activeStages.push('planning');
        if (filterApproved && filterApproved.checked) activeStages.push('approved');
        if (filterConstructionSt && filterConstructionSt.checked) activeStages.push('construction');
        if (filterOperational && filterOperational.checked) activeStages.push('operational');
        if (filterObjection && filterObjection.checked) activeStages.push('objection');

        if (activeStages.length > 0) {
            filtered = filtered.filter(article =>
                article.aiCategories && activeStages.includes(article.aiCategories.projectStage)
            );
        }
    }

    // Apply AI Category filters - Sentiment
    if (filterAllSentiment && !filterAllSentiment.checked) {
        const activeSentiments = [];
        if (filterPositive && filterPositive.checked) activeSentiments.push('positive');
        if (filterNeutral && filterNeutral.checked) activeSentiments.push('neutral');
        if (filterConcerns && filterConcerns.checked) activeSentiments.push('concerns');
        if (filterOpposition && filterOpposition.checked) activeSentiments.push('opposition');

        if (activeSentiments.length > 0) {
            filtered = filtered.filter(article =>
                article.aiCategories && activeSentiments.includes(article.aiCategories.sentiment)
            );
        }
    }

    // Apply AI Category filters - Topics
    if (filterAllTopics && !filterAllTopics.checked) {
        const activeTopics = [];
        if (filterJobs && filterJobs.checked) activeTopics.push('jobs');
        if (filterInvestment && filterInvestment.checked) activeTopics.push('investment');
        if (filterCommunity && filterCommunity.checked) activeTopics.push('community');
        if (filterEnvironmental && filterEnvironmental.checked) activeTopics.push('environmental');
        if (filterEnergy && filterEnergy.checked) activeTopics.push('energy');
        if (filterTechnology && filterTechnology.checked) activeTopics.push('technology');
        if (filterPolicy && filterPolicy.checked) activeTopics.push('policy');

        if (activeTopics.length > 0) {
            filtered = filtered.filter(article =>
                article.aiCategories && article.aiCategories.keyTopics &&
                article.aiCategories.keyTopics.some(topic => activeTopics.includes(topic))
            );
        }
    }

    // Apply AI Category filters - Urgency
    if (filterAllUrgency && !filterAllUrgency.checked) {
        const activeUrgency = [];
        if (filterHighUrgency && filterHighUrgency.checked) activeUrgency.push('high');
        if (filterMediumUrgency && filterMediumUrgency.checked) activeUrgency.push('medium');
        if (filterLowUrgency && filterLowUrgency.checked) activeUrgency.push('low');

        if (activeUrgency.length > 0) {
            filtered = filtered.filter(article =>
                article.aiCategories && activeUrgency.includes(article.aiCategories.urgency)
            );
        }
    }

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

    // AI Stages - only count if not "All"
    if (filterAllStages && !filterAllStages.checked) {
        activeFilters++;
    }

    // AI Sentiment - only count if not "All"
    if (filterAllSentiment && !filterAllSentiment.checked) {
        activeFilters++;
    }

    // AI Topics - only count if not "All"
    if (filterAllTopics && !filterAllTopics.checked) {
        activeFilters++;
    }

    // AI Urgency - only count if not "All"
    if (filterAllUrgency && !filterAllUrgency.checked) {
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

    const timeAgo = getTimeAgo(article.date);

    // Add province badge
    const provinceBadge = `<span class="province-badge province-${article.province.toLowerCase()}">${article.province}</span>`;

    // Add AI category badges
    let aiCategoriesHTML = '';
    let tagsHTML = '';

    if (article.aiCategories) {
        // Use AI categories if available
        const ai = article.aiCategories;
        const categories = [];

        if (ai.projectStage && ai.projectStage !== 'unknown') {
            categories.push(`<span class="ai-badge stage-${ai.projectStage}">${ai.projectStage}</span>`);
        }

        if (ai.sentiment) {
            const sentimentEmoji = {
                positive: '✓',
                neutral: '○',
                concerns: '⚠',
                opposition: '✕'
            };
            categories.push(`<span class="ai-badge sentiment-${ai.sentiment}">${sentimentEmoji[ai.sentiment] || ''} ${ai.sentiment}</span>`);
        }

        if (ai.keyTopics && ai.keyTopics.length > 0) {
            ai.keyTopics.slice(0, 3).forEach(topic => {
                categories.push(`<span class="ai-badge topic">${topic}</span>`);
            });
        }

        // Add type tags (offshore/onshore) to AI categories
        const typeTags = article.tags.filter(tag => tag === 'offshore' || tag === 'onshore');
        typeTags.forEach(tag => {
            categories.unshift(`<span class="ai-badge type-${tag}">${tag}</span>`);
        });

        if (categories.length > 0) {
            aiCategoriesHTML = `<div class="ai-categories">${categories.join('')}</div>`;
        }
    } else {
        // Fallback to old tags if no AI categories
        tagsHTML = article.tags.map(tag =>
            `<span class="tag ${tag}">${tag}</span>`
        ).join('');
    }

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
            ${aiCategoriesHTML}
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

    // Count AI categories
    const aiStageCounts = {
        planning: 0,
        approved: 0,
        construction: 0,
        operational: 0,
        objection: 0
    };

    const aiSentimentCounts = {
        positive: 0,
        neutral: 0,
        concerns: 0,
        opposition: 0
    };

    const aiTopicCounts = {
        jobs: 0,
        investment: 0,
        community: 0,
        environmental: 0,
        energy: 0,
        technology: 0,
        policy: 0
    };

    const aiUrgencyCounts = {
        high: 0,
        medium: 0,
        low: 0
    };

    // Count AI categories across all articles (considering current province filters)
    allArticles.forEach(article => {
        // Check if article matches active province filters
        const matchesProvinceFilter = provinceFilters[article.province];

        if (matchesProvinceFilter && article.aiCategories) {
            const ai = article.aiCategories;

            // Count project stages
            if (ai.projectStage && aiStageCounts[ai.projectStage] !== undefined) {
                aiStageCounts[ai.projectStage]++;
            }

            // Count sentiment
            if (ai.sentiment && aiSentimentCounts[ai.sentiment] !== undefined) {
                aiSentimentCounts[ai.sentiment]++;
            }

            // Count topics
            if (ai.keyTopics && Array.isArray(ai.keyTopics)) {
                ai.keyTopics.forEach(topic => {
                    if (aiTopicCounts[topic] !== undefined) {
                        aiTopicCounts[topic]++;
                    }
                });
            }

            // Count urgency
            if (ai.urgency && aiUrgencyCounts[ai.urgency] !== undefined) {
                aiUrgencyCounts[ai.urgency]++;
            }
        }
    });

    // Update AI category badges
    const updateBadge = (id, count) => {
        const badge = document.getElementById(id);
        if (badge) badge.textContent = count;
    };

    // Update project stage badges
    updateBadge('badgePlanningSt', aiStageCounts.planning);
    updateBadge('badgeApproved', aiStageCounts.approved);
    updateBadge('badgeConstructionSt', aiStageCounts.construction);
    updateBadge('badgeOperational', aiStageCounts.operational);
    updateBadge('badgeObjection', aiStageCounts.objection);

    // Update sentiment badges
    updateBadge('badgePositive', aiSentimentCounts.positive);
    updateBadge('badgeNeutral', aiSentimentCounts.neutral);
    updateBadge('badgeConcerns', aiSentimentCounts.concerns);
    updateBadge('badgeOpposition', aiSentimentCounts.opposition);

    // Update topic badges
    updateBadge('badgeJobs', aiTopicCounts.jobs);
    updateBadge('badgeInvestment', aiTopicCounts.investment);
    updateBadge('badgeCommunity', aiTopicCounts.community);
    updateBadge('badgeEnvironmental', aiTopicCounts.environmental);
    updateBadge('badgeEnergy', aiTopicCounts.energy);
    updateBadge('badgeTechnology', aiTopicCounts.technology);
    updateBadge('badgePolicy', aiTopicCounts.policy);

    // Update urgency badges
    updateBadge('badgeHighUrgency', aiUrgencyCounts.high);
    updateBadge('badgeMediumUrgency', aiUrgencyCounts.medium);
    updateBadge('badgeLowUrgency', aiUrgencyCounts.low);
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
   BACKEND LOGS VIEWER
   ======================================== */

async function fetchBackendLogs() {
    try {
        const response = await fetch(`${CONFIG.API_ENDPOINT.replace('/articles', '/logs')}?limit=20`);
        const data = await response.json();

        if (data.logs && data.logs.length > 0) {
            console.log(`\n📋 BACKEND ACTIVITY LOG (Last ${data.logs.length} entries):`);
            console.log('━'.repeat(60));

            data.logs.forEach(log => {
                const time = new Date(log.timestamp).toLocaleTimeString();
                const icon = {
                    'info': 'ℹ️',
                    'success': '✅',
                    'error': '❌',
                    'ai': '🤖'
                }[log.type] || '📝';

                console.log(`${icon} [${time}] ${log.message}`);
                if (log.details && Object.keys(log.details).length > 0) {
                    console.log(`   Details:`, log.details);
                }
            });
            console.log('━'.repeat(60));
        }
    } catch (error) {
        console.log('Could not fetch backend logs:', error.message);
    }
}

// Make functions available globally for manual calls from console
window.showBackendLogs = fetchBackendLogs;
window.showAIStats = function() {
    const withAI = allArticles.filter(a => a.aiCategories).length;
    const withoutAI = allArticles.length - withAI;

    console.log(`\n🤖 AI CATEGORIZATION STATS:`);
    console.log(`   ✓ Articles with AI categories: ${withAI} (${Math.round(withAI/allArticles.length*100)}%)`);
    console.log(`   ✗ Articles without AI categories: ${withoutAI} (${Math.round(withoutAI/allArticles.length*100)}%)`);

    if (withAI > 0) {
        const sentiments = {};
        const stages = {};
        const urgency = {};
        const topics = {};

        allArticles.forEach(a => {
            if (a.aiCategories) {
                sentiments[a.aiCategories.sentiment] = (sentiments[a.aiCategories.sentiment] || 0) + 1;
                stages[a.aiCategories.projectStage] = (stages[a.aiCategories.projectStage] || 0) + 1;
                urgency[a.aiCategories.urgency] = (urgency[a.aiCategories.urgency] || 0) + 1;

                // Count topics
                if (a.aiCategories.keyTopics) {
                    a.aiCategories.keyTopics.forEach(topic => {
                        topics[topic] = (topics[topic] || 0) + 1;
                    });
                }
            }
        });

        console.log(`\n📊 SENTIMENT:`);
        Object.entries(sentiments).sort((a, b) => b[1] - a[1]).forEach(([key, val]) => {
            console.log(`   ${key}: ${val}`);
        });

        console.log(`\n🏗️ PROJECT STAGES:`);
        Object.entries(stages).sort((a, b) => b[1] - a[1]).forEach(([key, val]) => {
            console.log(`   ${key}: ${val}`);
        });

        console.log(`\n📑 TOP TOPICS:`);
        Object.entries(topics).sort((a, b) => b[1] - a[1]).forEach(([key, val]) => {
            console.log(`   ${key}: ${val}`);
        });

        console.log(`\n⚡ URGENCY:`);
        Object.entries(urgency).sort((a, b) => b[1] - a[1]).forEach(([key, val]) => {
            console.log(`   ${key}: ${val}`);
        });
    }
};

window.refreshNews = function() {
    console.log('🔄 Manually refreshing news...');
    loadNews();
};

window.showArticles = function(count = 10) {
    console.log(`\n📰 Showing ${count} most recent articles:\n`);
    allArticles.slice(0, count).forEach((article, i) => {
        console.log(`${i + 1}. ${article.title}`);
        console.log(`   📍 ${article.province} | 📅 ${article.date.toLocaleDateString()}`);
        if (article.aiCategories) {
            console.log(`   🤖 ${article.aiCategories.sentiment} | ${article.aiCategories.projectStage} | ${article.aiCategories.urgency} urgency`);
            console.log(`   📑 Topics: ${article.aiCategories.keyTopics.join(', ')}`);
        }
        console.log('');
    });
};

window.searchArticles = function(keyword) {
    const results = allArticles.filter(a =>
        a.title.toLowerCase().includes(keyword.toLowerCase()) ||
        a.description.toLowerCase().includes(keyword.toLowerCase())
    );
    console.log(`\n🔍 Found ${results.length} articles matching "${keyword}":\n`);
    results.slice(0, 10).forEach((article, i) => {
        console.log(`${i + 1}. ${article.title}`);
        console.log(`   ${article.link}\n`);
    });
    return results;
};

// Show help message
window.showHelp = function() {
    console.log(`
╔════════════════════════════════════════════════════════════╗
║           🤖 Wind Farm News - Console Commands            ║
╠════════════════════════════════════════════════════════════╣
║                                                            ║
║  showBackendLogs()          - Show backend activity logs  ║
║  showAIStats()              - Show AI categorization stats║
║  showArticles(count)        - Show recent articles        ║
║  searchArticles("keyword")  - Search articles             ║
║  refreshNews()              - Manually refresh news       ║
║  showHelp()                 - Show this help message      ║
║                                                            ║
║  Examples:                                                 ║
║    showArticles(5)          - Show 5 most recent articles ║
║    searchArticles("wind")   - Find articles about wind    ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
`);
};

// Only show help message once on initial load (not on every refresh)
if (!window.consoleInitialized) {
    window.consoleInitialized = true;
    console.log(`\n💡 Type showHelp() for available console commands`);
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
