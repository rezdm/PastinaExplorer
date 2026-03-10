// Global state
let poisData = [];
let currentFilter = 'all';
let searchTerm = '';
let debounceTimer = null;
const DATA_VERSION = String(window.PASTINA_DATA_VERSION || '').trim();

const DAY_NAME_TO_INDEX = {
    sunday: 0,
    sun: 0,
    monday: 1,
    mon: 1,
    tuesday: 2,
    tue: 2,
    wednesday: 3,
    wed: 3,
    thursday: 4,
    thu: 4,
    friday: 5,
    fri: 5,
    saturday: 6,
    sat: 6
};

const DAY_NAME_PATTERNS = [
    'sun(?:day)?',
    'mon(?:day)?',
    'tue(?:sday)?',
    'wed(?:nesday)?',
    'thu(?:rsday)?',
    'fri(?:day)?',
    'sat(?:urday)?'
];
const DAY_PATTERN = '(?:sun(?:day)?|mon(?:day)?|tue(?:sday)?|wed(?:nesday)?|thu(?:rsday)?|fri(?:day)?|sat(?:urday)?)';
const DEFAULT_CATEGORY_ICONS = {
    Restaurant: '&#127869;&#65039;',
    Shop: '&#128717;&#65039;',
    Services: '&#9881;&#65039;'
};
const WINDOWS_1252_CODE_POINT_TO_BYTE = new Map([
    [0x20AC, 0x80],
    [0x201A, 0x82],
    [0x0192, 0x83],
    [0x201E, 0x84],
    [0x2026, 0x85],
    [0x2020, 0x86],
    [0x2021, 0x87],
    [0x02C6, 0x88],
    [0x2030, 0x89],
    [0x0160, 0x8A],
    [0x2039, 0x8B],
    [0x0152, 0x8C],
    [0x017D, 0x8E],
    [0x2018, 0x91],
    [0x2019, 0x92],
    [0x201C, 0x93],
    [0x201D, 0x94],
    [0x2022, 0x95],
    [0x2013, 0x96],
    [0x2014, 0x97],
    [0x02DC, 0x98],
    [0x2122, 0x99],
    [0x0161, 0x9A],
    [0x203A, 0x9B],
    [0x0153, 0x9C],
    [0x017E, 0x9E],
    [0x0178, 0x9F]
]);

document.addEventListener('DOMContentLoaded', () => {
    initializePage();
});

async function initializePage() {
    try {
        await loadPOIsFromJSON();
        renderFilterTags();
        renderPOIs();
        setupEventListeners();
        setupBackToTop();
    } catch (error) {
        console.error('Error initializing page:', error);
        showError('Failed to load data. Please check that the page files are present and readable.');
    }
}

async function loadPOIsFromJSON() {
    const embeddedPOIs = getEmbeddedPOIs();

    if (window.location.protocol === 'file:' && embeddedPOIs) {
        poisData = embeddedPOIs.map(normalizePOI);
        return;
    }

    try {
        const response = await fetch(buildPOIsDataUrl(), { cache: 'no-store' });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const ds = new DecompressionStream('gzip');
        const decompressed = response.body.pipeThrough(ds);
        const text = await new Response(decompressed).text();
        const data = JSON.parse(text);
        poisData = (Array.isArray(data.pois) ? data.pois : []).map(normalizePOI);
    } catch (error) {
        if (embeddedPOIs) {
            console.warn('Falling back to embedded POI data:', error);
            poisData = embeddedPOIs.map(normalizePOI);
            return;
        }

        console.error('Error loading POIs data:', error);
        showError('Error loading places data. Please check if pois-data.json exists and is valid.');
        throw error;
    }
}

function buildPOIsDataUrl() {
    if (!DATA_VERSION) {
        return 'pois-data.json.gz';
    }

    return `pois-data.json.gz?v=${encodeURIComponent(DATA_VERSION)}`;
}

function getEmbeddedPOIs() {
    const embeddedData = window.PASTINA_POIS_DATA || window.POIS_DATA;
    if (embeddedData && Array.isArray(embeddedData.pois)) {
        return embeddedData.pois;
    }

    return null;
}

function normalizePOI(poi) {
    return {
        ...poi,
        name: repairMojibake(poi.name),
        category: repairMojibake(poi.category),
        description: repairMojibake(poi.description),
        image: repairMojibake(poi.image),
        address: repairMojibake(poi.address),
        hours: repairMojibake(poi.hours),
        features: Array.isArray(poi.features) ? poi.features.map(repairMojibake) : [],
        contacts: poi.contacts
            ? {
                ...poi.contacts,
                phone: repairMojibake(poi.contacts.phone),
                email: repairMojibake(poi.contacts.email),
                website: repairMojibake(poi.contacts.website)
            }
            : null
    };
}

function repairMojibake(value) {
    if (typeof value !== 'string' || !/[\u00C3\u00C2\u00E2\u00F0\u00EF]/.test(value)) {
        return value || '';
    }

    try {
        const bytes = [];
        for (const character of value) {
            const codePoint = character.codePointAt(0);
            const byte = codePoint <= 0xFF ? codePoint : WINDOWS_1252_CODE_POINT_TO_BYTE.get(codePoint);

            if (typeof byte !== 'number') {
                return value;
            }

            bytes.push(byte);
        }

        return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes));
    } catch {
        return value;
    }
}

function setupEventListeners() {
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');

    if (searchInput) {
        searchInput.addEventListener('input', (event) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                searchTerm = event.target.value.trim();
                renderPOIs();
                updateSearchClearVisibility();
            }, 300);
        });

        searchInput.addEventListener('input', updateSearchClearVisibility);
    }

    if (searchClear) {
        searchClear.addEventListener('click', clearSearch);
    }

    document.addEventListener('click', handleDynamicClicks);
    document.addEventListener('keydown', handleKeyboardNavigation);
}

function updateSearchClearVisibility() {
    const searchInput = document.getElementById('search-input');
    const searchClear = document.getElementById('search-clear');

    if (!searchInput || !searchClear) {
        return;
    }

    searchClear.hidden = searchInput.value.length === 0;
}

function clearSearch() {
    const searchInput = document.getElementById('search-input');
    if (!searchInput) {
        return;
    }

    searchInput.value = '';
    searchInput.focus();
    searchTerm = '';
    renderPOIs();
    updateSearchClearVisibility();
}

function handleDynamicClicks(event) {
    const readMoreButton = event.target.closest('.read-more-btn');
    if (readMoreButton) {
        const description = document.getElementById(readMoreButton.getAttribute('aria-controls'));
        if (description && description.classList.contains('poi-description')) {
            const isExpanded = description.classList.contains('expanded');
            description.classList.toggle('truncated', isExpanded);
            description.classList.toggle('expanded', !isExpanded);
            readMoreButton.textContent = isExpanded ? 'Read more' : 'Read less';
            readMoreButton.setAttribute('aria-expanded', String(!isExpanded));
        }
        return;
    }

    const filterTag = event.target.closest('.filter-tag');
    if (filterTag) {
        const category = filterTag.dataset.category;
        if (category) {
            setFilter(category);
        }
        return;
    }

    const suggestionChip = event.target.closest('.suggestion-chip');
    if (suggestionChip) {
        const suggestion = suggestionChip.dataset.suggestion;
        if (suggestion) {
            setFilter(suggestion);
        }
    }
}

function handleKeyboardNavigation(event) {
    if (!event.target.classList.contains('filter-tag')) {
        return;
    }

    const filterTags = Array.from(document.querySelectorAll('.filter-tag'));
    const currentIndex = filterTags.indexOf(event.target);

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        const nextIndex = (currentIndex + 1) % filterTags.length;
        filterTags[nextIndex].focus();
        return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        const previousIndex = (currentIndex - 1 + filterTags.length) % filterTags.length;
        filterTags[previousIndex].focus();
        return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.target.click();
    }
}

function setupBackToTop() {
    const backToTop = document.getElementById('back-to-top');
    if (!backToTop) {
        return;
    }

    window.addEventListener('scroll', () => {
        backToTop.hidden = window.scrollY <= 400;
    });

    backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function getCategoryCounts() {
    const counts = { all: poisData.length };

    poisData.forEach((poi) => {
        counts[poi.category] = (counts[poi.category] || 0) + 1;
    });

    return counts;
}

function renderFilterTags() {
    if (!poisData.length) {
        return;
    }

    const categories = ['all', ...new Set(poisData.map((poi) => poi.category))];
    const counts = getCategoryCounts();
    const filterContainer = document.getElementById('filter-tags');

    if (!filterContainer) {
        return;
    }

    filterContainer.innerHTML = categories.map((category) => `
        <button
            type="button"
            class="filter-tag ${category === currentFilter ? 'active' : ''}"
            role="tab"
            aria-controls="pois-container"
            aria-selected="${category === currentFilter}"
            tabindex="${category === currentFilter ? '0' : '-1'}"
            data-category="${escapeHtml(category)}"
        >
            ${category === 'all' ? 'All Places' : escapeHtml(category)}
            <span class="filter-tag-count">${counts[category]}</span>
        </button>
    `).join('');
}

function setFilter(category) {
    currentFilter = category;
    renderFilterTags();
    renderPOIs();

    const activeFilter = document.querySelector('.filter-tag.active');
    if (activeFilter) {
        activeFilter.focus();
    }
}

function isOpenNow(hours) {
    if (!hours) {
        return null;
    }

    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();
    const hoursLower = hours.toLowerCase();

    if (hoursLower.includes('24/7') || hoursLower.includes('24 hours')) {
        return true;
    }

    if (isExplicitlyClosedToday(hoursLower, currentDay, currentTime)) {
        return false;
    }

    const explicitOpenDays = getExplicitOpenDays(hoursLower);
    if (explicitOpenDays && !explicitOpenDays.includes(currentDay)) {
        return false;
    }

    const timeRanges = extractTimeRanges(hoursLower);
    if (timeRanges.length > 0) {
        return timeRanges.some((range) => currentTime >= range.start && currentTime <= range.end);
    }

    const opensFromMatch = hoursLower.match(/\bfrom\s+(\d{1,2}):(\d{2})\b/);
    if (opensFromMatch) {
        const startTime = parseInt(opensFromMatch[1], 10) * 60 + parseInt(opensFromMatch[2], 10);
        if (currentTime < startTime) {
            return false;
        }
    }

    return null;
}

function isExplicitlyClosedToday(hoursLower, currentDay, currentTime) {
    const dayPattern = DAY_NAME_PATTERNS[currentDay];
    const dayBasePattern = `${dayPattern}s?`;

    if (new RegExp(`\\bclosed\\s+${dayBasePattern}\\b`).test(hoursLower)) {
        return true;
    }

    if (new RegExp(`\\b${dayPattern}\\s+morning\\s+closed\\b`).test(hoursLower) && currentTime < 14 * 60) {
        return true;
    }

    if (new RegExp(`\\b${dayPattern}\\s+afternoon\\s+closed\\b`).test(hoursLower) && currentTime >= 12 * 60) {
        return true;
    }

    if (new RegExp(`\\b${dayPattern}\\s+evening\\s+closed\\b`).test(hoursLower) && currentTime >= 17 * 60) {
        return true;
    }

    return false;
}

function getExplicitOpenDays(hoursLower) {
    const openDayMatch = hoursLower.match(new RegExp(`\\b(${DAY_PATTERN})(?:\\s*-\\s*(${DAY_PATTERN}))?\\s*:`));
    if (!openDayMatch) {
        return null;
    }

    const startDay = DAY_NAME_TO_INDEX[openDayMatch[1]];
    const endDay = openDayMatch[2] ? DAY_NAME_TO_INDEX[openDayMatch[2]] : null;

    if (typeof startDay !== 'number') {
        return null;
    }

    if (typeof endDay !== 'number') {
        return [startDay];
    }

    return expandDayRange(startDay, endDay);
}

function expandDayRange(startDay, endDay) {
    const days = [];
    let currentDay = startDay;

    while (true) {
        days.push(currentDay);
        if (currentDay === endDay) {
            break;
        }
        currentDay = (currentDay + 1) % 7;
    }

    return days;
}

function extractTimeRanges(text) {
    const timeRanges = [];
    const timeRangeRegex = /(\d{1,2}):(\d{2})\s*(?:-|to)\s*(\d{1,2}):(\d{2})/g;
    let match = timeRangeRegex.exec(text);

    while (match) {
        timeRanges.push({
            start: parseInt(match[1], 10) * 60 + parseInt(match[2], 10),
            end: parseInt(match[3], 10) * 60 + parseInt(match[4], 10)
        });
        match = timeRangeRegex.exec(text);
    }

    return timeRanges;
}

function getStatusBadge(hours) {
    const openStatus = isOpenNow(hours);

    if (openStatus === true) {
        return '<div class="poi-status-badge open"><span class="status-dot"></span>Open</div>';
    }

    if (openStatus === false) {
        return '<div class="poi-status-badge closed">Closed</div>';
    }

    return '';
}

function needsTruncation(text) {
    return text && text.length > 150;
}

function updateResultsCount(count, total) {
    const resultsCountElement = document.getElementById('results-count');
    const announcementElement = document.getElementById('results-announcement');

    let message = '';
    if (searchTerm || currentFilter !== 'all') {
        message = `Showing ${count} of ${total} places`;
        if (currentFilter !== 'all') {
            message += ` in ${currentFilter}`;
        }
        if (searchTerm) {
            message += ` matching "${searchTerm}"`;
        }
    } else {
        message = `Showing all ${total} places`;
    }

    if (resultsCountElement) {
        resultsCountElement.textContent = message;
    }

    if (announcementElement) {
        announcementElement.textContent = message;
    }
}

function renderPOIs() {
    const container = document.getElementById('pois-container');
    if (!container) {
        return;
    }

    if (!poisData.length) {
        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">&#128451;</div>
                <h3>No data available</h3>
                <p>Please check if the data file is loaded correctly.</p>
            </div>
        `;
        updateResultsCount(0, 0);
        return;
    }

    let filteredPOIs = poisData;

    if (currentFilter !== 'all') {
        filteredPOIs = filteredPOIs.filter((poi) => poi.category === currentFilter);
    }

    if (searchTerm) {
        const normalizedSearchTerm = searchTerm.toLowerCase();
        filteredPOIs = filteredPOIs.filter((poi) =>
            poi.name.toLowerCase().includes(normalizedSearchTerm) ||
            poi.description.toLowerCase().includes(normalizedSearchTerm) ||
            poi.category.toLowerCase().includes(normalizedSearchTerm) ||
            poi.features.some((feature) => feature.toLowerCase().includes(normalizedSearchTerm))
        );
    }

    updateResultsCount(filteredPOIs.length, poisData.length);

    if (!filteredPOIs.length) {
        const suggestions = [...new Set(poisData.map((poi) => poi.category))].slice(0, 4);
        container.innerHTML = `
            <div class="no-results">
                <div class="no-results-icon">&#128269;</div>
                <h3>No places found</h3>
                <p>Try adjusting your search or filter criteria.</p>
                <div class="no-results-suggestions">
                    <span>Try:</span>
                    ${suggestions.map((suggestion) => `
                        <button type="button" class="suggestion-chip" data-suggestion="${escapeHtml(suggestion)}">
                            ${escapeHtml(suggestion)}
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
        return;
    }

    container.innerHTML = filteredPOIs.map((poi, index) => createPOICard(poi, index)).join('');
}

function createPOICard(poi, index) {
    if (!poi.coordinates) {
        console.warn(`POI "${poi.name}" is missing coordinates`);
    }

    const googleMapsUrl = poi.coordinates
        ? `https://maps.google.com?q=${poi.coordinates.lat},${poi.coordinates.lng}`
        : `https://maps.google.com?q=${encodeURIComponent(poi.address || `${poi.name} Pastina Santa Luce`)}`;

    const descriptionId = `poi-description-${index}-${createIdFragment(poi.name)}`;
    const fallbackIcon = getFallbackIcon(poi);
    const statusBadge = getStatusBadge(poi.hours);
    const shouldTruncate = needsTruncation(poi.description);
    const descriptionClass = shouldTruncate ? 'poi-description truncated' : 'poi-description';
    const readMoreButton = shouldTruncate
        ? `<button type="button" class="read-more-btn" aria-controls="${descriptionId}" aria-expanded="false">Read more</button>`
        : '';
    const featureTags = poi.features.length > 0
        ? `<div class="poi-feature-tags">${poi.features.slice(0, 4).map((feature) => `<span class="poi-feature-tag">${escapeHtml(feature)}</span>`).join('')}</div>`
        : '';

    return `
        <article class="poi-card" tabindex="0" aria-label="${escapeHtml(poi.name)} - ${escapeHtml(poi.category)}">
            <div class="poi-content">
                <div class="poi-topline">
                    <span class="poi-category">${escapeHtml(poi.category)}</span>
                    ${statusBadge}
                </div>

                <div class="poi-header">
                    <div class="poi-icon" aria-hidden="true">${fallbackIcon}</div>
                    <div class="poi-header-copy">
                        <h3 class="poi-name">${escapeHtml(poi.name)}</h3>
                    </div>
                </div>

                <p id="${descriptionId}" class="${descriptionClass}">${escapeHtml(poi.description)}</p>
                ${readMoreButton}
                ${featureTags}

                <div class="poi-details">
                    ${poi.address ? `
                        <div class="poi-detail">
                            <div class="poi-detail-icon" aria-hidden="true">&#128205;</div>
                            <div class="poi-detail-content">
                                <div class="poi-detail-label">Address</div>
                                <div class="poi-detail-value">${escapeHtml(poi.address)}</div>
                            </div>
                        </div>
                    ` : ''}

                    ${poi.hours ? `
                        <div class="poi-detail">
                            <div class="poi-detail-icon" aria-hidden="true">&#128339;</div>
                            <div class="poi-detail-content">
                                <div class="poi-detail-label">Hours</div>
                                <div class="poi-detail-value">${escapeHtml(poi.hours)}</div>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="poi-contact-links">
                    ${poi.contacts?.phone ? `<a href="tel:${escapeHtml(poi.contacts.phone)}" class="contact-link">&#128222; Call</a>` : ''}
                    ${poi.contacts?.email ? `<a href="mailto:${escapeHtml(poi.contacts.email)}" class="contact-link">&#128231; Email</a>` : ''}
                    ${poi.contacts?.website ? `<a href="${escapeHtml(poi.contacts.website)}" target="_blank" rel="noopener noreferrer" class="contact-link">&#127760; Website</a>` : ''}
                    <a href="${googleMapsUrl}" target="_blank" rel="noopener noreferrer" class="contact-link map-link">&#128506;&#65039; Directions</a>
                </div>
            </div>
        </article>
    `;
}

function getFallbackIcon(poi) {
    return poi.image || DEFAULT_CATEGORY_ICONS[poi.category] || '&#128205;';
}

function createIdFragment(text) {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40) || 'item';
}

function escapeHtml(text) {
    if (typeof text !== 'string') {
        return '';
    }

    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        '\'': '&#039;'
    };

    return text.replace(/[&<>"']/g, (match) => map[match]);
}

function showError(message) {
    const container = document.getElementById('pois-container');
    if (!container) {
        return;
    }

    container.innerHTML = `
        <div class="no-results">
            <div class="no-results-icon">&#9888;&#65039;</div>
            <h3>Error</h3>
            <p>${escapeHtml(message)}</p>
        </div>
    `;
}

