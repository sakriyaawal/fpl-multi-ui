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

// Tab Switching Listener
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    const tabId = e.target.getAttribute('data-tab');

    document.querySelectorAll('.view').forEach(view => view.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

    document.getElementById(tabId).classList.add('active');
    e.target.classList.add('active');

    // Lazy load winners tab
    if (tabId === 'gw-winners' && !document.getElementById('winners-tbody').dataset.loaded) {
      fetchWinners();
    }
  });
});

// Listener for Gameweek History Dropdown
document.getElementById('gw-select').addEventListener('change', (e) => {
  fetchGameweekHistory(e.target.value);
});

// 1. Fetch Live Data & Standings (Uses LEAGUE_ID for live API)
async function fetchLiveData() {
  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/live/standings?league_id=${LEAGUE_ID}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch data for league ID: ${LEAGUE_ID}`);
    }

    const data = await response.json();

    // Update Header Text & Badge
    document.getElementById('league-title').innerText = data.league_name || `FPL League (${LEAGUE_KEY})`;
    document.getElementById('league-subtitle').innerText = `Live Status • ${data.current_gameweek_name}`;
    document.getElementById('current-gw-badge').innerText = data.current_gameweek_name;

    // Populate Current GW Table (Sorted by GW Points)
    const currentGwSorted = [...data.standings].sort((a, b) => b.event_total - a.event_total);
    const currentGwTbody = document.getElementById('current-gw-tbody');
    currentGwTbody.innerHTML = currentGwSorted.map((item, index) => `
      <tr>
        <td><strong>#${index + 1}</strong></td>
        <td><strong>${item.team_name}</strong><br><small style="color:var(--text-muted);">${item.manager_name}</small></td>
        <td><strong>${item.event_total}</strong></td>
        <td>${item.total_points}</td>
      </tr>
    `).join('');

    // Populate Overall Standings Table
    const overallTbody = document.getElementById('overall-tbody');
    overallTbody.innerHTML = data.standings.map((item) => {
      let rankChangeHtml = '<span class="rank-same">-</span>';
      if (item.rank_change > 0) rankChangeHtml = `<span class="rank-up">▲ ${item.rank_change}</span>`;
      if (item.rank_change < 0) rankChangeHtml = `<span class="rank-down">▼ ${Math.abs(item.rank_change)}</span>`;

      return `
        <tr>
          <td><strong>#${item.overall_rank}</strong></td>
          <td>${rankChangeHtml}</td>
          <td><strong>${item.team_name}</strong><br><small style="color:var(--text-muted);">${item.manager_name}</small></td>
          <td>${item.event_total}</td>
          <td><strong>${item.total_points}</strong></td>
        </tr>
      `;
    }).join('');

    // Populate GW Selector options up to current GW
    populateGwSelector(data.current_gameweek_id);

  } catch (err) {
    console.error("Error fetching live data:", err);
    document.getElementById('league-title').innerText = "League Not Found";
    document.getElementById('league-subtitle').innerText = `Could not load data for "${LEAGUE_KEY}"`;
    document.getElementById('current-gw-tbody').innerHTML = `<tr><td colspan="4" class="loader">Failed to load league data. Check your connection or API status.</td></tr>`;
    document.getElementById('overall-tbody').innerHTML = `<tr><td colspan="5" class="loader">Failed to load overall standings.</td></tr>`;
  }
}

// Populate Gameweek Dropdown Selector
function populateGwSelector(currentGw) {
  const select = document.getElementById('gw-select');
  select.innerHTML = '';
  for (let i = currentGw; i >= 1; i--) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `Gameweek ${i}`;
    select.appendChild(option);
  }
  if (currentGw > 0) {
    fetchGameweekHistory(currentGw);
  }
}

// 2. Fetch Gameweek Historical Data from Worker KV (Uses LEAGUE_KEY)
async function fetchGameweekHistory(gw) {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = `<tr><td colspan="6" class="loader">Loading GW ${gw} history...</td></tr>`;

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/gw?league_key=${encodeURIComponent(LEAGUE_KEY)}&gw=${gw}`);
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="6" class="loader">No stored historical data found for Gameweek ${gw}.</td></tr>`;
      return;
    }

    const data = await response.json();
    tbody.innerHTML = data.managers.map(m => `
      <tr>
        <td><strong>${m.team_name}</strong><br><small style="color:var(--text-muted);">${m.manager_name}</small></td>
        <td>${m.points}</td>
        <td style="color:${m.transfer_cost < 0 ? 'var(--fpl-pink)' : 'inherit'}">${m.transfer_cost}</td>
        <td><strong>${m.net_points}</strong></td>
        <td>${m.chip ? `<span class="badge" style="background:#e90052;color:white;">${m.chip}</span>` : '-'}</td>
        <td>${m.points_on_bench}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="loader">Failed to load gameweek history.</td></tr>`;
  }
}

// 3. Fetch Gameweek Winners from Worker KV (Uses LEAGUE_KEY)
async function fetchWinners() {
  const tbody = document.getElementById('winners-tbody');
  tbody.innerHTML = `<tr><td colspan="3" class="loader">Loading winners from KV...</td></tr>`;

  try {
    const response = await fetch(`${WORKER_BASE_URL}/api/kv/winners?league_key=${encodeURIComponent(LEAGUE_KEY)}`);
    if (!response.ok) {
      tbody.innerHTML = `<tr><td colspan="3" class="loader">No winners data found in KV for this league.</td></tr>`;
      return;
    }

    const data = await response.json();
    tbody.dataset.loaded = "true";

    const winnersEntries = Object.values(data.winners || {});
    if (winnersEntries.length === 0) {
      tbody.innerHTML = `<tr><td colspan="3" class="loader">No winners recorded yet.</td></tr>`;
      return;
    }

    tbody.innerHTML = winnersEntries.map(gwObj => {
      const winnerNames = gwObj.winners.map(w => `<strong>${w.team_name}</strong> (${w.manager_name})`).join(', ');
      return `
        <tr>
          <td><strong>Gameweek ${gwObj.gameweek}</strong></td>
          <td><strong>${gwObj.net_points} pts</strong></td>
          <td>${winnerNames}</td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="3" class="loader">Failed to load winners data.</td></tr>`;
  }
}

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  fetchLiveData();
});
