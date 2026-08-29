// Worker base configuration
const WORKER_BASE_URL = "https://fpl-multi-worker.sakriyaawal.workers.dev";
const DEFAULT_LEAGUE_KEY = "bhaktapurian";

// Map string keys to numeric FPL League IDs
const LEAGUE_MAPPINGS = {
  "bhaktapurian": "164381",
  "shadowclassic": "887127",
  "shadowelimination": "887146"
};

const ITEMS_PER_PAGE = 50;

// 1. Get league key from URL (?league=bhaktapurian), default to "bhaktapurian"
const urlParams = new URLSearchParams(window.location.search);
const LEAGUE_KEY = urlParams.get('league') || DEFAULT_LEAGUE_KEY;

// 2. Resolve numeric league_id from mapping (or use direct input if numeric)
const LEAGUE_ID = LEAGUE_MAPPINGS[LEAGUE_KEY] || (/\d+/.test(LEAGUE_KEY) ? LEAGUE_KEY : LEAGUE_MAPPINGS[DEFAULT_LEAGUE_KEY]);

// Global state variables
let currentActiveGameweek = 1;

// Data arrays for pagination
let currentGwData = [];
let overallData = [];

let currentGwPage = 1;
let overallPage = 1;

let currentHistoryData = []; // Cached array for sorting
let currentSortColumn = 'net_points'; // Default sort
let isAscending = false; // Default sort direction (descending for highest points)

// Tab Switching Listener
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tabId = e.target.getAttribute('data-tab');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    e.target.classList.add('active');

    if (tabId === 'gw-history' && !document.getElementById('history-tbody').dataset.loaded) {
      const selectedGw = document.getElementById('gw-select').value || currentActiveGameweek;
      fetchGameweekHistory(selectedGw);
    }

    if (tabId === 'gw-winners' && !document.getElementById('winners-tbody').dataset.loaded) {
      fetchWinners();
    }
  });
});

// Listener for Gameweek History Dropdown
document.getElementById('gw-select').addEventListener('change', (e) => {
  fetchGameweekHistory(e.target.value);
});

// Column Sort Click Listener for GW History Table Header
document.querySelectorAll('#gw-history th.sortable').forEach(header => {
  header.addEventListener('click', () => {
    const column = header.getAttribute('data-sort');
    
    if (currentSortColumn === column) {
      isAscending = !isAscending; // Toggle order
    } else {
      currentSortColumn = column;
      isAscending = false; // Default to descending when switching columns
    }

    renderSortedHistoryTable();
    updateSortHeaderIcons(header);
  });
});

// Update Sorting Arrows on Th Headers
function updateSortHeaderIcons(activeHeader) {
  document.querySelectorAll('#gw-history th.sortable .sort-icon').forEach(icon => icon.textContent = '');
  const activeIcon = activeHeader.querySelector('.sort-icon');
  if (activeIcon) {
    activeIcon.textContent = isAscending ? ' ▲' : ' ▼';
  }
}

// 1. Fetch Live Data & Standings
async function fetchLiveData() {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/live/standings?league_id=${LEAGUE_ID}&league_key=${encodeURIComponent(LEAGUE_KEY)}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data for league ID: ${LEAGUE_ID}`);
    }

    const data = await response.json();

    // Resolve Gameweek Number
    let gwNumber = data.current_gameweek_id || data.current_event || 0;
    let gwDisplayTitle = data.current_gameweek_name || (gwNumber > 0 ? `Gameweek ${gwNumber}` : "Pre-Season / GW 1");

    currentActiveGameweek = gwNumber > 0 ? gwNumber : 1;

    // Update Header Text & Badge
    document.getElementById('league-title').innerText = data.league_name || `FPL League (${LEAGUE_KEY})`;
    document.getElementById('league-subtitle').innerText = `Live Status • ${gwDisplayTitle}`;
    document.getElementById('current-gw-badge').innerText = gwNumber > 0 ? `GW ${gwNumber}` : "GW 1";

    const standings = data.standings || [];
    if (standings.length > 0) {
      // Current GW sorted by GW Points
      currentGwData = [...standings].sort((a, b) => (b.event_total || 0) - (a.event_total || 0));
      // Overall sorted as provided
      overallData = [...standings];

      currentGwPage = 1;
      overallPage = 1;

      renderCurrentGwPage();
      renderOverallPage();
    } else {
      document.getElementById('current-gw-tbody').innerHTML = `<tr><td colspan="5" class="loader">No live standings available yet.</td></tr>`;
      document.getElementById('overall-tbody').innerHTML = `<tr><td colspan="6" class="loader">No overall standings available yet.</td></tr>`;
    }

    populateGwSelector(currentActiveGameweek);

  } catch (err) {
    console.error("Error fetching live data:", err);
    document.getElementById('league-title').innerText = "League Dashboard";
    document.getElementById('league-subtitle').innerText = `Viewing "${LEAGUE_KEY}"`;
    document.getElementById('current-gw-tbody').innerHTML = `<tr><td colspan="5" class="loader">Unable to fetch live standings. Showing archived KV data if available.</td></tr>`;
    document.getElementById('overall-tbody').innerHTML = `<tr><td colspan="6" class="loader">Unable to fetch overall standings.</td></tr>`;
    
    populateGwSelector(38);
  }
}

// Render Paginated Current Gameweek Table
function renderCurrentGwPage() {
  const tbody = document.getElementById('current-gw-tbody');
  const totalItems = currentGwData.length;
  const startIdx = (currentGwPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
  const pageItems = currentGwData.slice(startIdx, endIdx);

  tbody.innerHTML = pageItems.map((item, index) => {
    const serialNum = startIdx + index + 1;
    return `
      <tr>
        <td>${serialNum}</td>
        <td><strong>#${serialNum}</strong></td>
        <td><strong>${item.team_name || item.entry_name}</strong><br><small style="color:var(--text-muted);">${item.manager_name || item.player_name}</small></td>
        <td><strong>${item.event_total || 0}</strong></td>
        <td>${item.total_points || item.total || 0}</td>
      </tr>
    `;
  }).join('');

  renderPaginationControls('current-gw', currentGwPage, totalItems, (newPage) => {
    currentGwPage = newPage;
    renderCurrentGwPage();
  });
}

// Render Paginated Overall Standings Table
function renderOverallPage() {
  const tbody = document.getElementById('overall-tbody');
  const totalItems = overallData.length;
  const startIdx = (overallPage - 1) * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, totalItems);
  const pageItems = overallData.slice(startIdx, endIdx);

  tbody.innerHTML = pageItems.map((item, index) => {
    const serialNum = startIdx + index + 1;
    let rankChangeHtml = '<span class="rank-same">-</span>';
    if (item.rank_change > 0) rankChangeHtml = `<span class="rank-up">▲ ${item.rank_change}</span>`;
    if (item.rank_change < 0) rankChangeHtml = `<span class="rank-down">▼ ${Math.abs(item.rank_change)}</span>`;

    return `
      <tr>
        <td>${serialNum}</td>
        <td><strong>#${item.overall_rank || item.rank || serialNum}</strong></td>
        <td>${rankChangeHtml}</td>
        <td><strong>${item.team_name || item.entry_name}</strong><br><small style="color:var(--text-muted);">${item.manager_name || item.player_name}</small></td>
        <td>${item.event_total || 0}</td>
        <td><strong>${item.total_points || item.total || 0}</strong></td>
      </tr>
    `;
  }).join('');

  renderPaginationControls('overall', overallPage, totalItems, (newPage) => {
    overallPage = newPage;
    renderOverallPage();
  });
}

// Reusable Pagination Controller
function renderPaginationControls(prefix, currentPage, totalItems, onPageChange) {
  const container = document.getElementById(`${prefix}-pagination`);
  const infoSpan = document.getElementById(`${prefix}-page-info`);
  const btnGroup = document.getElementById(`${prefix}-page-btns`);

  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  if (totalPages <= 1) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';

  const startIdx = (currentPage - 1) * ITEMS_PER_PAGE + 1;
  const endIdx = Math.min(currentPage * ITEMS_PER_PAGE, totalItems);
  infoSpan.textContent = `Showing ${startIdx}-${endIdx} of ${totalItems}`;

  btnGroup.innerHTML = '';

  // Prev Button
  const prevBtn = document.createElement('button');
  prevBtn.className = 'pg-btn';
  prevBtn.textContent = '« Prev';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => onPageChange(currentPage - 1);
  btnGroup.appendChild(prevBtn);

  // Page Numbers
  for (let i = 1; i <= totalPages; i++) {
    const pBtn = document.createElement('button');
    pBtn.className = `pg-btn ${i === currentPage ? 'active' : ''}`;
    pBtn.textContent = i;
    pBtn.onclick = () => onPageChange(i);
    btnGroup.appendChild(pBtn);
  }

  // Next Button
  const nextBtn = document.createElement('button');
  nextBtn.className = 'pg-btn';
  nextBtn.textContent = 'Next »';
  nextBtn.disabled = currentPage === totalPages;
  nextBtn.onclick = () => onPageChange(currentPage + 1);
  btnGroup.appendChild(nextBtn);
}

// Populate Gameweek Dropdown Selector
function populateGwSelector(maxGw) {
  const select = document.getElementById('gw-select');
  select.innerHTML = '';
  
  const limit = Math.max(maxGw, 1);
  for (let i = limit; i >= 1; i--) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Gameweek ${i}`;
    select.appendChild(option);
  }

  fetchGameweekHistory(limit);
}

// 2. Fetch Gameweek Historical Data from Worker KV
async function fetchGameweekHistory(gw) {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = `<tr><td colspan="7" class="loader">Loading GW ${gw} history...</td></tr>`;

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/gw?league_key=${encodeURIComponent(LEAGUE_KEY)}&league_id=${LEAGUE_ID}&gw=${gw}`);
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="7" class="loader">No stored historical data found for Gameweek ${gw}.</td></tr>`;
      return;
    }

    const data = await response.json();
    tbody.dataset.loaded = "true";

    const managers = data.managers || data.standings || data.data || [];
    if (!Array.isArray(managers) || managers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" class="loader">No data recorded for Gameweek ${gw}.</td></tr>`;
      return;
    }

    // Cache historical data for sorting
    currentHistoryData = managers.map(m => ({
      team_name: m.team_name || m.entry_name || '',
      manager_name: m.manager_name || m.player_name || '',
      points: m.points ?? m.event_total ?? 0,
      transfer_cost: m.transfer_cost ?? 0,
      net_points: m.net_points ?? m.points ?? m.event_total ?? 0,
      chip: m.chip || '',
      points_on_bench: m.points_on_bench ?? 0
    }));

    // Reset sort state to net points descending for fresh GW fetch
    currentSortColumn = 'net_points';
    isAscending = false;

    const defaultActiveHeader = document.querySelector('#gw-history th[data-sort="net_points"]');
    if (defaultActiveHeader) {
      updateSortHeaderIcons(defaultActiveHeader);
    }

    renderSortedHistoryTable();
  } catch (err) {
    console.error("Error fetching GW history:", err);
    tbody.innerHTML = `<tr><td colspan="7" class="loader">Failed to load gameweek history.</td></tr>`;
  }
}

// Render GW History Rows based on Active Sorting State
function renderSortedHistoryTable() {
  const tbody = document.getElementById('history-tbody');

  currentHistoryData.sort((a, b) => {
    let valA = a[currentSortColumn];
    let valB = b[currentSortColumn];

    if (typeof valA === 'string') {
      valA = valA.toLowerCase();
      valB = valB.toLowerCase();
      return isAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    return isAscending ? valA - valB : valB - valA;
  });

  tbody.innerHTML = currentHistoryData.map((m, index) => `
    <tr>
      <td>${index + 1}</td>
      <td><strong>${m.team_name}</strong><br><small style="color:var(--text-muted);">${m.manager_name}</small></td>
      <td>${m.points}</td>
      <td style="color:${m.transfer_cost < 0 ? 'var(--fpl-pink)' : 'inherit'}">${m.transfer_cost}</td>
      <td><strong>${m.net_points}</strong></td>
      <td>${m.chip ? `<span class="badge" style="background:#e90052;color:white;">${m.chip}</span>` : '-'}</td>
      <td>${m.points_on_bench}</td>
    </tr>
  `).join('');
}

// 3. Fetch Gameweek Winners from Worker KV
async function fetchWinners() {
  const tbody = document.getElementById('winners-tbody');
  tbody.innerHTML = `<tr><td colspan="4" class="loader">Loading winners from KV...</td></tr>`;

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/winners?league_key=${encodeURIComponent(LEAGUE_KEY)}&league_id=${LEAGUE_ID}`);
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="4" class="loader">No winners data found in KV for this league.</td></tr>`;
      return;
    }

    const data = await response.json();
    tbody.dataset.loaded = "true";

    let winnersList = [];
    if (Array.isArray(data)) {
      winnersList = data;
    } else if (data.winners) {
      winnersList = Array.isArray(data.winners) ? data.winners : Object.values(data.winners);
    } else {
      winnersList = Object.values(data);
    }

    if (winnersList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="loader">No winners recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = winnersList.map((gwObj, index) => {
      const gwNum = gwObj.gameweek || gwObj.gw || '-';
      const pts = gwObj.net_points || gwObj.points || '-';
      
      let winnerNames = "N/A";
      if (Array.isArray(gwObj.winners)) {
        winnerNames = gwObj.winners.map(w => `<strong>${w.team_name || w.entry_name}</strong> (${w.manager_name || w.player_name})`).join(', ');
      } else if (typeof gwObj.winner === 'string') {
        winnerNames = gwObj.winner;
      }

      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>Gameweek ${gwNum}</strong></td>
          <td><strong>${pts} pts</strong></td>
          <td>${winnerNames}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Error fetching winners:", err);
    tbody.innerHTML = `<tr><td colspan="4" class="loader">Failed to load winners data.</td></tr>`;
  }
}

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  fetchLiveData();
});
