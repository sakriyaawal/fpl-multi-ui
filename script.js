// Worker base configuration
const WORKER_BASE_URL = "https://fpl-multi-worker.sakriyaawal.workers.dev";
const DEFAULT_LEAGUE_KEY = "bhaktapurian";

// Map string keys to numeric FPL League IDs
const LEAGUE_MAPPINGS = {
  "bhaktapurian": "164381",
  "shadowclassic": "887127",
  "shadowelimination": "887146"
};

// 1. Get league key from URL (?league=bhaktapurian), default to "bhaktapurian"
const urlParams = new URLSearchParams(window.location.search);
const LEAGUE_KEY = urlParams.get('league') || DEFAULT_LEAGUE_KEY;

// 2. Resolve numeric league_id from mapping (or use direct input if numeric)
const LEAGUE_ID = LEAGUE_MAPPINGS[LEAGUE_KEY] || (/\d+/.test(LEAGUE_KEY) ? LEAGUE_KEY : "164381");

// Global variable to store active current gameweek number
let currentActiveGameweek = 1;

// Tab Switching Listener
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tabId = e.target.getAttribute('data-tab');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    e.target.classList.add('active');

    // Lazy load history or winners tab when switched
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

// 1. Fetch Live Data & Standings
async function fetchLiveData() {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/live/standings?league_id=${LEAGUE_ID}&league_key=${encodeURIComponent(LEAGUE_KEY)}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data for league ID: ${LEAGUE_ID}`);
    }

    const data = await response.json();

    // Resolve Gameweek Number (Fix Gameweek 0 issue)
    let gwNumber = data.current_gameweek_id || data.current_event || 0;
    let gwDisplayTitle = data.current_gameweek_name || (gwNumber > 0 ? `Gameweek ${gwNumber}` : "Pre-Season / GW 1");

    // If GW is 0 from API, default selector/lookup to GW 1
    currentActiveGameweek = gwNumber > 0 ? gwNumber : 1;

    // Update Header Text & Badge
    document.getElementById('league-title').innerText = data.league_name || `FPL League (${LEAGUE_KEY})`;
    document.getElementById('league-subtitle').innerText = `Live Status • ${gwDisplayTitle}`;
    document.getElementById('current-gw-badge').innerText = gwNumber > 0 ? `GW ${gwNumber}` : "GW 1";

    // Populate Current GW Table
    const standings = data.standings || [];
    if (standings.length > 0) {
      const currentGwSorted = [...standings].sort((a, b) => (b.event_total || 0) - (a.event_total || 0));
      const currentGwTbody = document.getElementById('current-gw-tbody');
      currentGwTbody.innerHTML = currentGwSorted.map((item, index) => `
        <tr>
          <td><strong>#${index + 1}</strong></td>
          <td><strong>${item.team_name || item.entry_name}</strong><br><small style="color:var(--text-muted);">${item.manager_name || item.player_name}</small></td>
          <td><strong>${item.event_total || 0}</strong></td>
          <td>${item.total_points || item.total || 0}</td>
        </tr>
      `).join('');

      // Populate Overall Standings Table
      const overallTbody = document.getElementById('overall-tbody');
      overallTbody.innerHTML = standings.map((item, index) => {
        let rankChangeHtml = '<span class="rank-same">-</span>';
        if (item.rank_change > 0) rankChangeHtml = `<span class="rank-up">▲ ${item.rank_change}</span>`;
        if (item.rank_change < 0) rankChangeHtml = `<span class="rank-down">▼ ${Math.abs(item.rank_change)}</span>`;

        return `
          <tr>
            <td><strong>#${item.overall_rank || item.rank || (index + 1)}</strong></td>
            <td>${rankChangeHtml}</td>
            <td><strong>${item.team_name || item.entry_name}</strong><br><small style="color:var(--text-muted);">${item.manager_name || item.player_name}</small></td>
            <td>${item.event_total || 0}</td>
            <td><strong>${item.total_points || item.total || 0}</strong></td>
          </tr>
        `;
      }).join('');
    } else {
      document.getElementById('current-gw-tbody').innerHTML = `<tr><td colspan="4" class="loader">No live standings available yet.</td></tr>`;
      document.getElementById('overall-tbody').innerHTML = `<tr><td colspan="5" class="loader">No overall standings available yet.</td></tr>`;
    }

    // Populate GW Selector options up to 38 (or current GW)
    populateGwSelector(currentActiveGameweek);

  } catch (err) {
    console.error("Error fetching live data:", err);
    document.getElementById('league-title').innerText = "League Dashboard";
    document.getElementById('league-subtitle').innerText = `Viewing "${LEAGUE_KEY}"`;
    document.getElementById('current-gw-tbody').innerHTML = `<tr><td colspan="4" class="loader">Unable to fetch live standings. Showing archived KV data if available.</td></tr>`;
    
    // Fallback dropdown population
    populateGwSelector(38);
  }
}

// Populate Gameweek Dropdown Selector
function populateGwSelector(maxGw) {
  const select = document.getElementById('gw-select');
  select.innerHTML = '';
  
  // Upper range bound at 38 gameweeks
  const limit = Math.max(maxGw, 1);
  for (let i = limit; i >= 1; i--) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Gameweek ${i}`;
    select.appendChild(option);
  }

  // Pre-load current GW history
  fetchGameweekHistory(limit);
}

// 2. Fetch Gameweek Historical Data from Worker KV
async function fetchGameweekHistory(gw) {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="loader">Loading GW ${gw} history...</td></tr>`;

  try {
    // Pass both league_key AND league_id parameters to guarantee KV match
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/gw?league_key=${encodeURIComponent(LEAGUE_KEY)}&league_id=${LEAGUE_ID}&gw=${gw}`);
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="loader">No stored historical data found for Gameweek ${gw}.</td></tr>`;
      return;
    }

    const data = await response.json();
    tbody.dataset.loaded = "true";

    const managers = data.managers || data.standings || data.data || [];
    if (!Array.isArray(managers) || managers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="loader">No data recorded for Gameweek ${gw}.</td></tr>`;
      return;
    }

    tbody.innerHTML = managers.map(m => `
      <tr>
        <td><strong>${m.team_name || m.entry_name}</strong><br><small style="color:var(--text-muted);">${m.manager_name || m.player_name}</small></td>
        <td>${m.points ?? m.event_total ?? '-'}</td>
        <td style="color:${(m.transfer_cost || 0) < 0 ? 'var(--fpl-pink)' : 'inherit'}">${m.transfer_cost ?? 0}</td>
        <td><strong>${m.net_points ?? m.points ?? m.event_total ?? '-'}</strong></td>
        <td>${m.chip ? `<span class="badge" style="background:#e90052;color:white;">${m.chip}</span>` : '-'}</td>
        <td>${m.points_on_bench ?? 0}</td>
      </tr>
    `).join('');
  } catch (err) {
    console.error("Error fetching GW history:", err);
    tbody.innerHTML = `<tr><td colspan="6" class="loader">Failed to load gameweek history.</td></tr>`;
  }
}

// 3. Fetch Gameweek Winners from Worker KV
async function fetchWinners() {
  const tbody = document.getElementById('winners-tbody');
  tbody.innerHTML = `<tr><td colspan="3" class="loader">Loading winners from KV...</td></tr>`;

  try {
    // Pass both league_key AND league_id parameters
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/winners?league_key=${encodeURIComponent(LEAGUE_KEY)}&league_id=${LEAGUE_ID}`);
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="3" class="loader">No winners data found in KV for this league.</td></tr>`;
      return;
    }

    const data = await response.json();
    tbody.dataset.loaded = "true";

    // Handle array or object mapping structures returned by KV
    let winnersList = [];
    if (Array.isArray(data)) {
      winnersList = data;
    } else if (data.winners) {
      winnersList = Array.isArray(data.winners) ? data.winners : Object.values(data.winners);
    } else {
      winnersList = Object.values(data);
    }

    if (winnersList.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="loader">No winners recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = winnersList.map(gwObj => {
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
          <td><strong>Gameweek ${gwNum}</strong></td>
          <td><strong>${pts} pts</strong></td>
          <td>${winnerNames}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    console.error("Error fetching winners:", err);
    tbody.innerHTML = `<tr><td colspan="3" class="loader">Failed to load winners data.</td></tr>`;
  }
}

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  fetchLiveData();
});
