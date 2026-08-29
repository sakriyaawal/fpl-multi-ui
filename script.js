// Worker base configuration
const WORKER_BASE_URL = "https://fpl-multi-worker.sakriyaawal.workers.dev";
const DEFAULT_LEAGUE_KEY = "bhaktapurian";

const LEAGUE_MAPPINGS = {
  "bhaktapurian": "164381",
  "shadowclassic": "887127",
  "shadowelimination": "887146"
};

const ITEMS_PER_PAGE = 50;

// Resolve League ID
const urlParams = new URLSearchParams(window.location.search);
const LEAGUE_KEY = urlParams.get('league') || DEFAULT_LEAGUE_KEY;
const LEAGUE_ID = LEAGUE_MAPPINGS[LEAGUE_KEY] || (/\d+/.test(LEAGUE_KEY) ? LEAGUE_KEY : LEAGUE_MAPPINGS[DEFAULT_LEAGUE_KEY]);

// Global state variables
let currentActiveGameweek = 1;
let gwSelectorInitialized = false;

// Standings & Page States
let currentGwPage = 1;
let currentGwHasNext = false;

let overallPage = 1;
let overallHasNext = false;

let currentHistoryData = [];
let currentSortColumn = 'net_points';
let isAscending = false;

// Tab Switching Listener
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tabId = e.target.getAttribute('data-tab');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    e.target.classList.add('active');

    if (tabId === 'gw-history' && !document.getElementById('history-tbody').dataset.loaded) {
      const selectedGw = document.getElementById('gw-select')?.value || currentActiveGameweek;
      fetchGameweekHistory(selectedGw);
    }

    if (tabId === 'gw-winners' && !document.getElementById('winners-tbody').dataset.loaded) {
      fetchWinners();
    }
  });
});

document.getElementById('gw-select')?.addEventListener('change', (e) => {
  fetchGameweekHistory(e.target.value);
});

document.querySelectorAll('#gw-history th.sortable').forEach(header => {
  header.addEventListener('click', () => {
    const column = header.getAttribute('data-sort');
    if (currentSortColumn === column) {
      isAscending = !isAscending;
    } else {
      currentSortColumn = column;
      isAscending = false;
    }
    renderSortedHistoryTable();
    updateSortHeaderIcons(header);
  });
});

function updateSortHeaderIcons(activeHeader) {
  document.querySelectorAll('#gw-history th.sortable .sort-icon').forEach(icon => icon.textContent = '');
  const activeIcon = activeHeader.querySelector('.sort-icon');
  if (activeIcon) {
    activeIcon.textContent = isAscending ? ' ▲' : ' ▼';
  }
}

// 1. Fetch Current Gameweek Standings (Per Page)
async function fetchCurrentGwStandings(page = 1) {
  const tbody = document.getElementById('current-gw-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="5" class="loader">Loading Current GW page ${page}...</td></tr>`;
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/live/standings?league_id=${LEAGUE_ID}&league_key=${encodeURIComponent(LEAGUE_KEY)}&page=${page}`);
    if (!response.ok) throw new Error("Failed to fetch live standings");

    const data = await response.json();

    // Directly use the accurate gameweek ID returned from bootstrap-static
    currentActiveGameweek = data.current_gameweek_id || 1;

    const leagueTitleEl = document.getElementById('league-title');
    const leagueSubtitleEl = document.getElementById('league-subtitle');
    const currentGwBadgeEl = document.getElementById('current-gw-badge');

    if (leagueTitleEl) leagueTitleEl.innerText = data.league_name || `FPL League (${LEAGUE_KEY})`;
    if (leagueSubtitleEl) leagueSubtitleEl.innerText = `Live Status • Gameweek ${currentActiveGameweek}`;
    if (currentGwBadgeEl) currentGwBadgeEl.innerText = `GW ${currentActiveGameweek}`;

    // Initialize selector with accurate Gameweek
    if (!gwSelectorInitialized) {
      populateGwSelector(currentActiveGameweek);
      gwSelectorInitialized = true;
    }

    const standings = data.standings || [];
    currentGwHasNext = data.has_next === true || data.standings_has_next === true;
    currentGwPage = page;

    if (tbody) {
      if (standings.length > 0) {
        const sortedStandings = [...standings].sort((a, b) => (b.event_total || 0) - (a.event_total || 0));

        tbody.innerHTML = sortedStandings.map((item, index) => {
          const serialNum = (page - 1) * ITEMS_PER_PAGE + index + 1;
          return `
            <tr>
              <td>${serialNum}</td>
              <td><strong>#${serialNum}</strong></td>
              <td><strong>${item.team_name || item.entry_name || 'N/A'}</strong><br><small style="color:var(--text-muted);">${item.manager_name || item.player_name || ''}</small></td>
              <td><strong>${item.event_total || 0}</strong></td>
              <td>${item.total_points || item.total || 0}</td>
            </tr>
          `;
        }).join('');

        renderApiPaginationControls('current-gw', currentGwPage, currentGwHasNext, (targetPage) => {
          fetchCurrentGwStandings(targetPage);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="5" class="loader">No standings found for page ${page}.</td></tr>`;
      }
    }

  } catch (err) {
    console.error("Error fetching Current GW standings:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="loader">Unable to load standings.</td></tr>`;
  }
}

// 2. Fetch Overall League Standings (Per Page)
async function fetchOverallStandings(page = 1) {
  const tbody = document.getElementById('overall-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="6" class="loader">Loading Overall Standings page ${page}...</td></tr>`;
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/live/standings?league_id=${LEAGUE_ID}&league_key=${encodeURIComponent(LEAGUE_KEY)}&page=${page}`);
    if (!response.ok) throw new Error("Failed to fetch overall standings");

    const data = await response.json();
    const standings = data.standings || [];

    overallHasNext = data.has_next === true || data.standings_has_next === true;
    overallPage = page;

    if (tbody) {
      if (standings.length > 0) {
        tbody.innerHTML = standings.map((item, index) => {
          const serialNum = (page - 1) * ITEMS_PER_PAGE + index + 1;
          let rankChangeHtml = '<span class="rank-same">-</span>';
          if (item.rank_change > 0) rankChangeHtml = `<span class="rank-up">▲ ${item.rank_change}</span>`;
          if (item.rank_change < 0) rankChangeHtml = `<span class="rank-down">▼ ${Math.abs(item.rank_change)}</span>`;

          return `
            <tr>
              <td>${serialNum}</td>
              <td><strong>#${item.overall_rank || item.rank || serialNum}</strong></td>
              <td>${rankChangeHtml}</td>
              <td><strong>${item.team_name || item.entry_name || 'N/A'}</strong><br><small style="color:var(--text-muted);">${item.manager_name || item.player_name || ''}</small></td>
              <td>${item.event_total || 0}</td>
              <td><strong>${item.total_points || item.total || 0}</strong></td>
            </tr>
          `;
        }).join('');

        renderApiPaginationControls('overall', overallPage, overallHasNext, (targetPage) => {
          fetchOverallStandings(targetPage);
        });
      } else {
        tbody.innerHTML = `<tr><td colspan="6" class="loader">No standings found for page ${page}.</td></tr>`;
      }
    }

  } catch (err) {
    console.error("Error fetching overall standings:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="loader">Unable to load overall standings.</td></tr>`;
  }
}

// Dynamic API Pagination Controls
function renderApiPaginationControls(prefix, currentPage, hasNext, onPageFetch) {
  const container = document.getElementById(`${prefix}-pagination`);
  const infoSpan = document.getElementById(`${prefix}-page-info`);
  const btnGroup = document.getElementById(`${prefix}-page-btns`);

  if (!container || !infoSpan || !btnGroup) return;

  if (currentPage === 1 && !hasNext) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  infoSpan.textContent = `Page ${currentPage}`;
  btnGroup.innerHTML = '';

  const prevBtn = document.createElement('button');
  prevBtn.className = 'pg-btn';
  prevBtn.textContent = '« Prev Page';
  prevBtn.disabled = currentPage === 1;
  prevBtn.onclick = () => {
    onPageFetch(currentPage - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  btnGroup.appendChild(prevBtn);

  const currBtn = document.createElement('button');
  currBtn.className = 'pg-btn active';
  currBtn.textContent = currentPage;
  btnGroup.appendChild(currBtn);

  const nextBtn = document.createElement('button');
  nextBtn.className = 'pg-btn';
  nextBtn.textContent = 'Next Page »';
  nextBtn.disabled = !hasNext;
  nextBtn.onclick = () => {
    onPageFetch(currentPage + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  btnGroup.appendChild(nextBtn);
}

// Populate Gameweek Dropdown Selector
function populateGwSelector(maxGw) {
  const select = document.getElementById('gw-select');
  if (!select) return;

  select.innerHTML = '';
  const limit = Math.max(maxGw, 1);

  for (let i = limit; i >= 1; i--) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Gameweek ${i}`;
    if (i === limit) option.selected = true;
    select.appendChild(option);
  }

  // Pre-fetch historical data for the latest active gameweek
  fetchGameweekHistory(limit);
}

// Fetch Gameweek Historical Data from Worker KV
async function fetchGameweekHistory(gw) {
  const tbody = document.getElementById('history-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="7" class="loader">Loading GW ${gw} history...</td></tr>`;
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/gw?league_key=${encodeURIComponent(LEAGUE_KEY)}&league_id=${LEAGUE_ID}&gw=${gw}`);
    if (!response.ok) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loader">No stored historical data found for Gameweek ${gw}.</td></tr>`;
      return;
    }

    const data = await response.json();
    if (tbody) tbody.dataset.loaded = "true";

    const managers = data.managers || data.standings || data.data || [];
    if (!Array.isArray(managers) || managers.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loader">No data recorded for Gameweek ${gw}.</td></tr>`;
      return;
    }

    currentHistoryData = managers.map(m => ({
      team_name: m.team_name || m.entry_name || '',
      manager_name: m.manager_name || m.player_name || '',
      points: m.points ?? m.event_total ?? 0,
      transfer_cost: m.transfer_cost ?? 0,
      net_points: m.net_points ?? m.points ?? m.event_total ?? 0,
      chip: m.chip || '',
      points_on_bench: m.points_on_bench ?? 0
    }));

    currentSortColumn = 'net_points';
    isAscending = false;

    const defaultActiveHeader = document.querySelector('#gw-history th[data-sort="net_points"]');
    if (defaultActiveHeader) updateSortHeaderIcons(defaultActiveHeader);

    renderSortedHistoryTable();
  } catch (err) {
    console.error("Error fetching GW history:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" class="loader">Failed to load gameweek history.</td></tr>`;
  }
}

function renderSortedHistoryTable() {
  const tbody = document.getElementById('history-tbody');
  if (!tbody) return;

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

// Fetch Gameweek Winners from Worker KV
async function fetchWinners() {
  const tbody = document.getElementById('winners-tbody');
  if (tbody) {
    tbody.innerHTML = `<tr><td colspan="4" class="loader">Loading winners from KV...</td></tr>`;
  }

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/winners?league_key=${encodeURIComponent(LEAGUE_KEY)}&league_id=${LEAGUE_ID}`);
    if (!response.ok) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="loader">No winners data found in KV for this league.</td></tr>`;
      return;
    }

    const data = await response.json();
    if (tbody) tbody.dataset.loaded = "true";

    let winnersList = Array.isArray(data) ? data : (data.winners ? (Array.isArray(data.winners) ? data.winners : Object.values(data.winners)) : Object.values(data));

    if (winnersList.length === 0) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="loader">No winners recorded yet.</td></tr>`;
      return;
    }

    if (tbody) {
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
    }
  } catch (err) {
    console.error("Error fetching winners:", err);
    if (tbody) tbody.innerHTML = `<tr><td colspan="4" class="loader">Failed to load winners data.</td></tr>`;
  }
}

// Initial Load
document.addEventListener('DOMContentLoaded', () => {
  fetchCurrentGwStandings(1);
  fetchOverallStandings(1);
});
