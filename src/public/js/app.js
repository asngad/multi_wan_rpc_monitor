/**
 * Multi-WAN (Citra, Indibiz, Starlink, Starlite) & 16 Linksys EA7500 NOC Dashboard
 * UNUGHA NOC - Mohammad Asngad
 */

// 1. Audio Chime Sintetis (Web Audio API)
class AlertAudio {
  constructor() {
    this.audioCtx = null;
    this.isMuted = false;
  }

  _ensureContext() {
    if (!this.audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioContext();
    }
  }

  playBeep(severity = 'WARNING') {
    if (this.isMuted) return;
    try {
      this._ensureContext();
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);

      if (severity === 'CRITICAL') {
        osc.frequency.setValueAtTime(880, this.audioCtx.currentTime);
        osc.frequency.setValueAtTime(440, this.audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.35);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.35);
      } else {
        osc.frequency.setValueAtTime(587.33, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.12, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.2);
      }
    } catch (e) {}
  }
}

const audioPlayer = new AlertAudio();

// 2. Application State
const state = {
  wans: {},
  mikrotik: null,
  routers: {},
  historyMaxPoints: 20,
  activeAnomalies: new Set(),
  rpcCallsCount: 0,
  scenarioTimerInterval: null,
  routerSearchTerm: '',
  routerStatusFilter: 'ALL',
  selectedTraceRouterId: 'ea7500-01'
};

let throughputChart = null;
let latencyChart = null;
let packetLossChart = null;

Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = 'ui-sans-serif, system-ui, sans-serif';

// 3. Inisialisasi Charts (4 WANs: Citra, Indibiz, Starlink, Starlite)
function initCharts() {
  const chartCommonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: {
        position: 'top',
        labels: { boxWidth: 12, font: { size: 10 } }
      },
      tooltip: {
        mode: 'index',
        intersect: false,
        backgroundColor: '#0f172a',
        borderColor: '#334155',
        borderWidth: 1
      }
    },
    scales: {
      x: { grid: { color: 'rgba(51, 65, 85, 0.25)' }, ticks: { font: { size: 9 } } },
      y: { grid: { color: 'rgba(51, 65, 85, 0.25)' }, ticks: { font: { size: 9 } } }
    }
  };

  // 1. Throughput Chart (4 WANs)
  const ctxThroughput = document.getElementById('throughputChart').getContext('2d');
  throughputChart = new Chart(ctxThroughput, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Citra (100M)', data: [], borderColor: '#06b6d4', backgroundColor: 'rgba(6, 182, 212, 0.08)', tension: 0.3, borderWidth: 2 },
        { label: 'Indibiz (100M)', data: [], borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.08)', tension: 0.3, borderWidth: 2 },
        { label: 'Starlink (150M)', data: [], borderColor: '#a855f7', backgroundColor: 'rgba(168, 85, 247, 0.08)', tension: 0.3, borderWidth: 2 },
        { label: 'Starlite (50M)', data: [], borderColor: '#10b981', backgroundColor: 'rgba(16, 185, 129, 0.08)', tension: 0.3, borderWidth: 2 }
      ]
    },
    options: {
      ...chartCommonOptions,
      scales: {
        ...chartCommonOptions.scales,
        y: { ...chartCommonOptions.scales.y, beginAtZero: true, title: { display: true, text: 'Mbps', font: { size: 10 } } }
      }
    }
  });

  // 2. Latency Chart (4 WANs)
  const ctxLatency = document.getElementById('latencyChart').getContext('2d');
  latencyChart = new Chart(ctxLatency, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Citra RTT', data: [], borderColor: '#06b6d4', tension: 0.3, borderWidth: 2 },
        { label: 'Indibiz RTT', data: [], borderColor: '#ef4444', tension: 0.3, borderWidth: 2 },
        { label: 'Starlink RTT', data: [], borderColor: '#a855f7', tension: 0.3, borderWidth: 2 },
        { label: 'Starlite RTT', data: [], borderColor: '#10b981', tension: 0.3, borderWidth: 2 }
      ]
    },
    options: {
      ...chartCommonOptions,
      scales: {
        ...chartCommonOptions.scales,
        y: { ...chartCommonOptions.scales.y, beginAtZero: true, title: { display: true, text: 'RTT (ms)', font: { size: 10 } } }
      }
    }
  });

  // 3. Packet Loss Chart (4 WANs)
  const ctxLoss = document.getElementById('packetLossChart').getContext('2d');
  packetLossChart = new Chart(ctxLoss, {
    type: 'line',
    data: {
      labels: [],
      datasets: [
        { label: 'Citra Loss', data: [], borderColor: '#06b6d4', tension: 0.2, borderWidth: 1.5 },
        { label: 'Indibiz Loss', data: [], borderColor: '#ef4444', tension: 0.2, borderWidth: 1.5 },
        { label: 'Starlink Loss', data: [], borderColor: '#a855f7', tension: 0.2, borderWidth: 1.5 },
        { label: 'Starlite Loss', data: [], borderColor: '#10b981', tension: 0.2, borderWidth: 1.5 }
      ]
    },
    options: {
      ...chartCommonOptions,
      scales: {
        ...chartCommonOptions.scales,
        y: { ...chartCommonOptions.scales.y, beginAtZero: true, max: 100, title: { display: true, text: '% Loss', font: { size: 10 } } }
      }
    }
  });
}

// 4. Render Kartu Antarmuka 4 WAN
function renderWanCard(wan) {
  const container = document.getElementById('wanCardsContainer');
  let card = document.getElementById(`card-${wan.id}`);

  const statusColor = wan.status === 'UP' ? 'emerald' : 'rose';
  const zScoreDisplay = wan.baselines && typeof wan.baselines.zScoreRtt === 'number'
    ? (wan.baselines.zScoreRtt >= 0 ? `+${wan.baselines.zScoreRtt}σ` : `${wan.baselines.zScoreRtt}σ`)
    : '0.0σ';
  
  const zScoreColor = (wan.baselines && wan.baselines.zScoreRtt >= 2.0)
    ? (wan.baselines.zScoreRtt >= 3.0 ? 'text-rose-400 font-bold' : 'text-amber-400')
    : 'text-slate-400';

  const cardHtml = `
    <div class="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-sm wan-card relative overflow-hidden" id="card-${wan.id}">
      <div class="flex items-center justify-between pb-2.5 border-b border-slate-800/80">
        <div>
          <div class="flex items-center gap-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-${statusColor}-500 ${wan.status === 'UP' ? 'animate-pulse' : ''}"></span>
            <h3 class="text-xs font-bold text-white">${wan.name}</h3>
          </div>
          <p class="text-[11px] text-slate-400 font-sans flex items-center gap-1.5">${wan.isp} • <span class="font-mono text-cyan-400 font-semibold">IP: ${wan.gateway}</span></p>
        </div>
        <span class="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${wan.status === 'UP' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'}">
          ${wan.status}
        </span>
      </div>

      <div class="mt-3 flex items-center justify-between text-xs">
        <span class="text-slate-400 text-[11px]">Skor Kesehatan</span>
        <span class="font-mono font-bold ${wan.healthScore >= 80 ? 'text-emerald-400' : (wan.healthScore >= 50 ? 'text-amber-400' : 'text-rose-400')}">
          ${wan.healthScore}%
        </span>
      </div>
      <div class="w-full bg-slate-800 h-1 rounded-full mt-1 overflow-hidden">
        <div class="h-1 rounded-full transition-all duration-300 ${wan.healthScore >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}" style="width: ${wan.healthScore}%"></div>
      </div>

      <div class="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
        <div class="bg-slate-800/50 p-2 rounded border border-slate-800/80">
          <div class="text-[9px] text-slate-400 font-sans">Latensi (RTT)</div>
          <div class="text-sm font-bold text-white flex items-baseline gap-0.5">
            <span>${wan.rtt}</span><span class="text-[9px] text-slate-400">ms</span>
          </div>
          <div class="text-[9px] ${zScoreColor}">Z: ${zScoreDisplay}</div>
        </div>

        <div class="bg-slate-800/50 p-2 rounded border border-slate-800/80">
          <div class="text-[9px] text-slate-400 font-sans">Packet Loss</div>
          <div class="text-sm font-bold ${wan.loss > 3 ? 'text-rose-400' : 'text-white'} flex items-baseline gap-0.5">
            <span>${wan.loss}</span><span class="text-[9px] text-slate-400">%</span>
          </div>
          <div class="text-[9px] text-slate-400">Jitter: ${wan.jitter}ms</div>
        </div>

        <div class="bg-slate-800/50 p-2 rounded border border-slate-800/80">
          <div class="text-[9px] text-slate-400 font-sans">Rx / Tx Throughput</div>
          <div class="text-xs font-bold text-cyan-400">${wan.rxThroughput} <span class="text-[9px] text-slate-400">Mbps</span></div>
          <div class="text-[9px] text-slate-400">Tx: ${wan.txThroughput} Mbps</div>
        </div>

        <div class="bg-slate-800/50 p-2 rounded border border-slate-800/80">
          <div class="text-[9px] text-slate-400 font-sans">Kapasitas Pipa</div>
          <div class="text-xs font-bold text-slate-200">${wan.capacityMbps} <span class="text-[9px] text-slate-400">Mbps</span></div>
          <div class="text-[9px] text-slate-400">Beban: ${Math.round(((wan.rxThroughput + wan.txThroughput) / wan.capacityMbps) * 100)}%</div>
        </div>
      </div>

      ${wan.currentAnomalies && wan.currentAnomalies.length > 0 ? `
        <div class="mt-2 bg-rose-500/10 border border-rose-500/30 p-1.5 rounded text-[10px] text-rose-300 flex items-start gap-1 animate-pulse">
          <i class="fa-solid fa-triangle-exclamation text-[10px] mt-0.5 text-rose-400"></i>
          <div><strong>${wan.currentAnomalies[0].type}</strong>: ${wan.currentAnomalies[0].message}</div>
        </div>
      ` : ''}
    </div>
  `;

  if (!card) {
    container.insertAdjacentHTML('beforeend', cardHtml);
  } else {
    card.outerHTML = cardHtml;
  }
}

// 5. Render 16 Router Linksys EA7500 Cards
function renderRouterGrid() {
  const container = document.getElementById('routerGridContainer');
  const term = state.routerSearchTerm.toLowerCase();
  const filter = state.routerStatusFilter;

  const filteredRouters = Object.values(state.routers).filter(r => {
    const matchesSearch = r.name.toLowerCase().includes(term) ||
                          r.location.toLowerCase().includes(term) ||
                          r.ip.includes(term);
    if (!matchesSearch) return false;

    if (filter === 'UP') return r.status === 'UP' && r.clientUtilizationPercent < 90;
    if (filter === 'ALERT') return r.status === 'DOWN' || r.clientUtilizationPercent >= 90 || r.healthScore < 85;
    return true;
  });

  if (filteredRouters.length === 0) {
    container.innerHTML = `
      <div class="col-span-full py-8 text-center text-xs text-slate-500">
        Tidak ada Router Linksys EA7500 yang cocok dengan pencarian / filter ini.
      </div>
    `;
    return;
  }

  container.innerHTML = filteredRouters.map(r => {
    const isAlert = r.status === 'DOWN' || r.clientUtilizationPercent >= 90 || r.healthScore < 85;
    const borderClass = isAlert ? 'border-amber-500/50 bg-amber-950/10' : 'border-slate-800 bg-slate-900/60';
    const statusBg = r.status === 'UP' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400';

    return `
      <div class="border ${borderClass} rounded-xl p-3 shadow-sm hover:border-cyan-500/50 transition">
        <div class="flex items-center justify-between pb-2 border-b border-slate-800/60">
          <div class="flex items-center gap-1.5">
            <i class="fa-solid fa-wifi text-xs ${isAlert ? 'text-amber-400 animate-pulse' : 'text-slate-400'}"></i>
            <span class="text-xs font-bold text-white">${r.name.replace('Linksys EA7500 ', '')}</span>
          </div>
          <span class="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold ${statusBg}">
            ${r.status}
          </span>
        </div>

        <div class="mt-2">
          <div class="text-[11px] font-medium text-slate-200 truncate" title="${r.location}">${r.location}</div>
          <div class="text-[10px] text-slate-400 font-mono">${r.ip}</div>
        </div>

        <!-- Utilisasi Klien Wi-Fi -->
        <div class="mt-2.5">
          <div class="flex justify-between text-[10px] text-slate-400 mb-1">
            <span>Klien Wi-Fi</span>
            <span class="font-mono font-bold ${r.clientUtilizationPercent >= 90 ? 'text-rose-400' : 'text-indigo-400'}">
              ${r.activeClients}/${r.maxClients} (${r.clientUtilizationPercent}%)
            </span>
          </div>
          <div class="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
            <div class="h-1.5 rounded-full transition-all duration-300 ${r.clientUtilizationPercent >= 90 ? 'bg-rose-500' : 'bg-indigo-500'}" style="width: ${r.clientUtilizationPercent}%"></div>
          </div>
        </div>

        <!-- Metrik Singkat -->
        <div class="mt-2.5 pt-2 border-t border-slate-800/60 grid grid-cols-2 gap-1 text-[10px] font-mono text-slate-400">
          <div>RTT: <strong class="text-slate-200">${r.rttToMikrotik}ms</strong></div>
          <div>Health: <strong class="${r.healthScore >= 90 ? 'text-emerald-400' : 'text-amber-400'}">${r.healthScore}%</strong></div>
          <div>5G: <span class="text-cyan-400">Ch ${r.wifi5GhzChannel}</span></div>
          <div>Trafik: <span class="text-slate-300">${r.bandwidthRxMbps}M</span></div>
        </div>

        <!-- Tombol Trace Jalur di Diagram -->
        <button onclick="traceRouterFromCard('${r.id}')" class="mt-2.5 w-full bg-slate-800/80 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-500/50 text-[10px] text-slate-300 py-1.5 px-2 rounded-lg border border-slate-700/80 transition flex items-center justify-center gap-1.5 font-medium">
          <i class="fa-solid fa-route text-cyan-400"></i>
          <span>Trace di Topologi</span>
        </button>
      </div>
    `;
  }).join('');
}

// 5B. Render Tabel Distribusi Multi-WAN & Internet Akses 16 Router
function renderDashboardInternetTable(routersList) {
  const tbody = document.getElementById('dashboardInternetTableBody');
  if (!tbody) return;

  const routers = routersList || Object.values(state.routers);
  if (!routers || routers.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-6 text-center text-slate-500 italic">Memuat status distribusi internet 16 router kampus...</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = routers.map((r, idx) => {
    const access = r.internetAccess || {
      status: r.status === 'UP' ? 'ONLINE' : 'OFFLINE',
      primaryWanName: 'WAN (CitraNet)',
      primaryWanIp: '192.168.113',
      routingMark: 'to_WAN',
      pccStream: 'both-addresses-and-ports:4/0',
      pccColor: 'cyan',
      natGateway: '10.27.42.1 (Masquerade)',
      internetLatencyMs: (12 + (idx % 6) * 1.5).toFixed(1),
      dnsStatus: 'REACHABLE',
      failoverActive: false
    };

    const isOnline = access.status === 'ONLINE';
    const isFailover = access.status === 'FAILOVER';

    let statusBadge = '';
    if (isOnline) {
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          <span>ONLINE</span>
        </span>
      `;
    } else if (isFailover) {
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
          <i class="fa-solid fa-arrow-right-arrow-left text-[9px]"></i>
          <span>FAILOVER</span>
        </span>
      `;
    } else {
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <span class="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
          <span>OFFLINE</span>
        </span>
      `;
    }

    let wanBadgeColor = 'border-cyan-500/40 bg-cyan-950/40 text-cyan-300';
    if (access.routingMark === 'to_WAN1') wanBadgeColor = 'border-blue-500/40 bg-blue-950/40 text-blue-300';
    if (access.routingMark === 'to_WAN2') wanBadgeColor = 'border-indigo-500/40 bg-indigo-950/40 text-indigo-300';
    if (access.routingMark === 'to_WAN3') wanBadgeColor = 'border-purple-500/40 bg-purple-950/40 text-purple-300';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <!-- 1. Router & Model -->
        <td class="py-2.5 px-3">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-cyan-400 text-xs">
              <i class="fa-solid fa-wifi"></i>
            </div>
            <div>
              <div class="font-bold text-white text-xs">${r.name}</div>
              <div class="text-[10px] text-slate-400">${r.location || 'Kampus UNUGHA'}</div>
            </div>
          </div>
        </td>

        <!-- 2. IP Lokal -->
        <td class="py-2.5 px-3">
          <div class="font-mono text-xs font-semibold text-slate-200">${r.ip}</div>
          <div class="text-[10px] text-slate-400 font-mono">GW: 10.27.42.1</div>
        </td>

        <!-- 3. Status Internet -->
        <td class="py-2.5 px-3 text-center">
          ${statusBadge}
          <div class="text-[9px] text-slate-400 mt-0.5 font-mono">DNS 8.8.8.8 OK</div>
        </td>

        <!-- 4. Alur Jalur ISP (Egress PCC) -->
        <td class="py-2.5 px-3">
          <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border ${wanBadgeColor} text-[10px] font-mono font-semibold">
            <i class="fa-solid fa-network-wired text-[9px]"></i>
            <span>${access.primaryWanName || 'WAN'}</span>
            <span class="text-slate-400">(${access.primaryWanIp || '-'})</span>
          </div>
          <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1 font-mono">
            <span class="text-slate-500">PCC:</span>
            <code class="text-cyan-300">${access.routingMark || 'to_WAN'}</code>
            <span class="text-slate-500">•</span>
            <span>${access.pccStream || '4/0'}</span>
          </div>
        </td>

        <!-- 5. Latensi Internet -->
        <td class="py-2.5 px-3 text-center">
          <span class="font-bold ${access.internetLatencyMs < 20 ? 'text-emerald-400' : 'text-amber-400'}">${access.internetLatencyMs || 14} ms</span>
          <div class="text-[9px] text-slate-400">RTT ke DNS Global</div>
        </td>

        <!-- 6. Throughput & User -->
        <td class="py-2.5 px-3 text-right">
          <div class="font-bold text-slate-200 text-xs">${(r.bandwidthRxMbps || 0).toFixed(1)} <span class="text-[10px] text-slate-400">Mbps</span></div>
          <div class="text-[10px] text-indigo-400 font-mono">${r.activeClients || 0} User</div>
        </td>

        <!-- 7. Aksi -->
        <td class="py-2.5 px-3 text-center">
          <div class="flex items-center justify-center gap-1">
            <button onclick="traceRouterFromCard('${r.id}')" title="Trace di Topologi" class="px-2 py-1 bg-slate-800 hover:bg-cyan-950 hover:text-cyan-300 hover:border-cyan-500/50 rounded text-[10px] border border-slate-700 transition">
              <i class="fa-solid fa-route"></i>
            </button>
            <button onclick="quickPingRouter('${r.ip}', '${r.name}')" title="Uji Ping Internet Langsung" class="px-2 py-1 bg-slate-800 hover:bg-emerald-950 hover:text-emerald-300 hover:border-emerald-500/50 rounded text-[10px] border border-slate-700 transition">
              <i class="fa-solid fa-bolt"></i>
            </button>
            <button onclick="viewOpenWrtConfig('${r.id}')" title="Lihat Config OpenWrt" class="px-2 py-1 bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 hover:border-indigo-500/50 rounded text-[10px] border border-slate-700 transition">
              <i class="fa-solid fa-gear"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// 6. Update Aggregate & MikroTik
function updateAggregateSummary(agg) {
  if (!agg) return;

  const aggStatus = document.getElementById('aggStatus');
  const aggActiveCount = document.getElementById('aggActiveCount');
  const aggHealthScore = document.getElementById('aggHealthScore');
  const aggHealthBar = document.getElementById('aggHealthBar');
  const aggTotalThroughput = document.getElementById('aggTotalThroughput');
  const aggTotalCapacity = document.getElementById('aggTotalCapacity');
  const aggUtilPercent = document.getElementById('aggUtilPercent');
  const aggUtilBar = document.getElementById('aggUtilBar');

  const aggConnectedClients = document.getElementById('aggConnectedClients');
  const mikrotikCpuDisplay = document.getElementById('mikrotikCpuDisplay');
  const mikrotikCpuBar = document.getElementById('mikrotikCpuBar');
  const activeRoutersCount = document.getElementById('activeRoutersCount');

  aggStatus.textContent = agg.multiWanStatus;
  aggStatus.className = `text-2xl font-black ${agg.multiWanStatus === 'OPTIMAL' ? 'text-emerald-400' : (agg.multiWanStatus === 'DEGRADED' ? 'text-amber-400' : 'text-rose-400')}`;
  aggActiveCount.textContent = `(${agg.activeWans}/${agg.totalWans} Link Aktif)`;

  aggHealthScore.textContent = `${agg.averageHealthScore}%`;
  aggHealthBar.style.width = `${agg.averageHealthScore}%`;

  aggTotalThroughput.textContent = agg.totalThroughputMbps.toFixed(1);
  aggTotalCapacity.textContent = `${agg.totalCapacityMbps} Mbps`;
  aggUtilPercent.textContent = `${agg.utilizationPercent}%`;
  aggUtilBar.style.width = `${Math.min(100, agg.utilizationPercent)}%`;

  if (agg.totalConnectedClients !== undefined) {
    aggConnectedClients.textContent = agg.totalConnectedClients;
  }
  if (agg.mikrotikCpu !== undefined) {
    mikrotikCpuDisplay.textContent = `${agg.mikrotikCpu}%`;
    mikrotikCpuBar.style.width = `${agg.mikrotikCpu}%`;
    mikrotikCpuBar.className = `h-1.5 rounded-full transition-all duration-500 ${agg.mikrotikCpu > 80 ? 'bg-rose-500' : 'bg-indigo-500'}`;
  }
  if (agg.activeRouters !== undefined) {
    activeRoutersCount.textContent = `${agg.activeRouters}/${agg.totalRouters} UP`;
  }

  // Update status summary badge distribusi internet
  const internetBadge = document.getElementById('dashboardInternetSummaryBadge');
  const internetText = document.getElementById('dashboardInternetSummaryText');
  if (internetText && agg.routersWithInternet !== undefined) {
    internetText.textContent = `${agg.routersWithInternet}/${agg.totalRouters || 16} Router Online`;
    if (agg.internetReachabilityPercent >= 100) {
      if (internetBadge) internetBadge.className = 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5';
    } else {
      if (internetBadge) internetBadge.className = 'bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[11px] font-mono px-3 py-1 rounded-lg font-semibold flex items-center gap-1.5';
    }
  }
}

// 7. Add Alert To Feed
function addAlertToFeed(alert) {
  const container = document.getElementById('alertFeedContainer');
  const countDisplay = document.getElementById('activeAnomaliesCount');
  const statusIndicator = document.getElementById('anomalyStatusIndicator');

  if (container.querySelector('.text-center')) {
    container.innerHTML = '';
  }

  audioPlayer.playBeep(alert.severity);

  state.activeAnomalies.add(alert.id);
  if (countDisplay) {
    countDisplay.textContent = state.activeAnomalies.size;
    countDisplay.className = 'text-2xl font-black text-rose-400 font-mono';
  }
  if (statusIndicator) {
    statusIndicator.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-rose-400 text-[10px]"></i><span class="text-rose-400 font-medium">Anomali Terdeteksi Real-Time</span>`;
  }

  const timeStr = new Date(alert.timestamp).toLocaleTimeString();
  const severityClass = alert.severity === 'CRITICAL'
    ? 'border-rose-500/50 bg-rose-950/20 text-rose-200'
    : 'border-amber-500/50 bg-amber-950/20 text-amber-200';

  const alertItem = document.createElement('div');
  alertItem.className = `p-3 rounded-xl border ${severityClass} text-xs flex items-start gap-3 transition shadow-sm animate-pulse-subtle`;
  alertItem.innerHTML = `
    <div class="p-1.5 rounded-lg ${alert.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-400' : 'bg-amber-500/20 text-amber-400'}">
      <i class="fa-solid ${alert.severity === 'CRITICAL' ? 'fa-triangle-exclamation' : 'fa-bell'}"></i>
    </div>
    <div class="flex-1">
      <div class="flex items-center justify-between">
        <span class="font-bold uppercase tracking-wider text-[11px]">${alert.type} • ${alert.wanId ? alert.wanId.toUpperCase() : 'ROUTER'}</span>
        <span class="text-[10px] text-slate-400 font-mono">${timeStr}</span>
      </div>
      <p class="mt-0.5 text-slate-300 font-sans">${alert.message}</p>
      <div class="mt-1.5 flex flex-wrap items-center gap-2 text-[10px]">
        <span class="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-700/60 font-mono text-slate-300">${alert.metric}</span>
        <span class="text-cyan-400 italic"><i class="fa-solid fa-lightbulb mr-1"></i>${alert.recommendation}</span>
      </div>
    </div>
  `;

  container.prepend(alertItem);
}

// 8. Push Chart Data for 4 WANs
function pushChartData(timeLabel, wanMetricsMap) {
  if (!throughputChart || !latencyChart || !packetLossChart) return;

  const w1 = wanMetricsMap['wan-citra'] || { totalThroughput: 0, rtt: 0, loss: 0 };
  const w2 = wanMetricsMap['wan-indibiz'] || { totalThroughput: 0, rtt: 0, loss: 0 };
  const w3 = wanMetricsMap['wan-starlink'] || { totalThroughput: 0, rtt: 0, loss: 0 };
  const w4 = wanMetricsMap['wan-starlite'] || { totalThroughput: 0, rtt: 0, loss: 0 };

  const charts = [throughputChart, latencyChart, packetLossChart];
  charts.forEach(c => {
    if (c.data.labels.length >= state.historyMaxPoints) {
      c.data.labels.shift();
      c.data.datasets.forEach(d => d.data.shift());
    }
    c.data.labels.push(timeLabel);
  });

  // Throughput (4 WANs)
  throughputChart.data.datasets[0].data.push(w1.totalThroughput || (w1.rxThroughput + w1.txThroughput) || 0);
  throughputChart.data.datasets[1].data.push(w2.totalThroughput || (w2.rxThroughput + w2.txThroughput) || 0);
  throughputChart.data.datasets[2].data.push(w3.totalThroughput || (w3.rxThroughput + w3.txThroughput) || 0);
  throughputChart.data.datasets[3].data.push(w4.totalThroughput || (w4.rxThroughput + w4.txThroughput) || 0);

  // Latency (4 WANs)
  latencyChart.data.datasets[0].data.push(w1.rtt || 0);
  latencyChart.data.datasets[1].data.push(w2.rtt || 0);
  latencyChart.data.datasets[2].data.push(w3.rtt || 0);
  latencyChart.data.datasets[3].data.push(w4.rtt || 0);

  // Loss (4 WANs)
  packetLossChart.data.datasets[0].data.push(w1.loss || 0);
  packetLossChart.data.datasets[1].data.push(w2.loss || 0);
  packetLossChart.data.datasets[2].data.push(w3.loss || 0);
  packetLossChart.data.datasets[3].data.push(w4.loss || 0);

  throughputChart.update();
  latencyChart.update();
  packetLossChart.update();
}

// 9. Socket.io Connection & Events
function setupSocket() {
  const socket = io();

  const statusText = document.getElementById('socketStatusText');
  const rpcLatencyDisplay = document.getElementById('rpcLatencyDisplay');
  const rpcCallsSent = document.getElementById('rpcCallsSent');

  socket.on('connect', () => {
    statusText.textContent = 'RPC CONNECTED';
    statusText.className = 'text-emerald-400 font-semibold';
  });

  socket.on('disconnect', () => {
    statusText.textContent = 'DISCONNECTED';
    statusText.className = 'text-rose-400 font-semibold';
  });

  // WAN Telemetry Update
  socket.on('wan_update', (data) => {
    const { wan, aggregate } = data;
    state.wans[wan.id] = wan;
    state.rpcCallsCount++;

    rpcCallsSent.textContent = state.rpcCallsCount;
    const simulatedRpcLat = (0.75 + (Math.random() * 0.4)).toFixed(2);
    rpcLatencyDisplay.textContent = simulatedRpcLat;

    renderWanCard(wan);
    updateAggregateSummary(aggregate);

    const nowTime = new Date().toLocaleTimeString('id-ID', { hour12: false, minute: '2-digit', second: '2-digit' });
    pushChartData(nowTime, state.wans);
  });

  // MikroTik Core Update
  socket.on('mikrotik_update', (mikrotik) => {
    state.mikrotik = mikrotik;
    const mikrotikCpuDisplay = document.getElementById('mikrotikCpuDisplay');
    const mikrotikCpuBar = document.getElementById('mikrotikCpuBar');
    const mikrotikConnText = document.getElementById('mikrotikConnText');
    const pccRatioText = document.getElementById('pccRatioText');

    if (mikrotikCpuDisplay) mikrotikCpuDisplay.textContent = `${mikrotik.cpuUsagePercent}%`;
    if (mikrotikCpuBar) mikrotikCpuBar.style.width = `${mikrotik.cpuUsagePercent}%`;
    if (mikrotikConnText) mikrotikConnText.textContent = `Koneksi: ~${mikrotik.activeConnections.toLocaleString()} conn`;
    if (pccRatioText && mikrotik.loadBalancePcc && mikrotik.loadBalancePcc.distribution) {
      const d = mikrotik.loadBalancePcc.distribution;
      pccRatioText.textContent = `Rasio: ${d['wan-citra']}% : ${d['wan-indibiz']}% : ${d['wan-starlink']}% : ${d['wan-starlite']}%`;
    }
  });

  // Router Linksys EA7500 Update
  socket.on('router_update', (router) => {
    state.routers[router.id] = router;
    renderRouterGrid();
    renderDashboardInternetTable();
    if (state.selectedTraceRouterId === router.id) {
      updateInspectorMetrics(router);
    }
  });

  // Event Daftar Router Berubah (Tambah/Edit/Hapus)
  socket.on('routers_changed', (routers) => {
    if (Array.isArray(routers)) {
      state.routers = {};
      routers.forEach(r => { state.routers[r.id] = r; });
      renderRouterGrid();
      renderDashboardInternetTable();
      renderAdminRouterTable();
      populateOpenWrtSelect();
    }
  });

  // Anomaly Alert
  socket.on('anomaly_alert', (alert) => {
    addAlertToFeed(alert);
  });

  // Scenario Changed
  socket.on('scenario_changed', (res) => {
    handleScenarioBadge(res.scenario, res.durationSeconds);
  });
}

function handleScenarioBadge(scenario, durationSeconds) {
  const badge = document.getElementById('activeScenarioBadge');
  const name = document.getElementById('scenarioName');
  const timer = document.getElementById('scenarioTimer');

  if (state.scenarioTimerInterval) {
    clearInterval(state.scenarioTimerInterval);
  }

  if (scenario === 'NORMAL') {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
    return;
  }

  badge.classList.remove('hidden');
  badge.classList.add('flex');
  name.textContent = scenario;

  let remaining = durationSeconds;
  timer.textContent = `${remaining}s`;

  state.scenarioTimerInterval = setInterval(() => {
    remaining--;
    if (remaining <= 0) {
      clearInterval(state.scenarioTimerInterval);
      badge.classList.add('hidden');
      badge.classList.remove('flex');
    } else {
      timer.textContent = `${remaining}s`;
    }
  }, 1000);
}

// ====================================================================
// 10. Navigation Tab Switcher & Mobile Menu
// ====================================================================

function switchNavTab(tabName) {
  const tabs = ['dashboard', 'topologi', 'admin'];
  if (!tabs.includes(tabName)) tabName = 'dashboard';

  // Sembunyikan semua view dan tampilkan view yang dipilih
  tabs.forEach(t => {
    const view = document.getElementById(`view-${t}`);
    const navBtn = document.getElementById(`nav-btn-${t}`);
    
    if (t === tabName) {
      if (view) view.classList.remove('hidden');
      if (navBtn) {
        navBtn.className = 'nav-tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all duration-200 bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/30';
      }
    } else {
      if (view) view.classList.add('hidden');
      if (navBtn) {
        navBtn.className = 'nav-tab-btn flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition-all duration-200';
      }
    }
  });

  // Update style mobile menu buttons
  document.querySelectorAll('.mobile-nav-btn').forEach((btn, index) => {
    const targetTab = tabs[index];
    if (targetTab === tabName) {
      btn.className = 'mobile-nav-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
    } else {
      btn.className = 'mobile-nav-btn w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold text-slate-300 hover:bg-slate-800/70 border border-transparent';
    }
  });

  // Tutup drawer mobile setelah klik
  const drawer = document.getElementById('mobileMenuDrawer');
  const icon = document.getElementById('mobileMenuIcon');
  if (drawer && !drawer.classList.contains('hidden')) {
    drawer.classList.add('hidden');
    if (icon) icon.className = 'fa-solid fa-bars text-sm';
  }

  // Jika kembali ke Dashboard, picu Chart resize agar tidak blur/gepeng di perangkat mobile
  if (tabName === 'dashboard') {
    setTimeout(() => {
      if (throughputChart) throughputChart.resize();
      if (latencyChart) latencyChart.resize();
      if (packetLossChart) packetLossChart.resize();
    }, 100);
  }

  // Jika masuk ke Admin, muat otomatis data anomali MySQL & tabel CRUD router
  if (tabName === 'admin') {
    refreshDbAnomaliesTable();
    renderAdminRouterTable();
    initScriptGeneratorView();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleMobileMenu() {
  const drawer = document.getElementById('mobileMenuDrawer');
  const icon = document.getElementById('mobileMenuIcon');
  if (!drawer) return;

  const isHidden = drawer.classList.contains('hidden');
  if (isHidden) {
    drawer.classList.remove('hidden');
    if (icon) icon.className = 'fa-solid fa-xmark text-sm text-cyan-400';
  } else {
    drawer.classList.add('hidden');
    if (icon) icon.className = 'fa-solid fa-bars text-sm';
  }
}

// Muat data log anomali dari database MySQL
async function refreshDbAnomaliesTable() {
  const tbody = document.getElementById('dbAnomaliesTableBody');
  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="7" class="py-6 text-center text-slate-400">
        <i class="fa-solid fa-circle-notch animate-spin text-cyan-400 mr-2"></i>
        Mengambil log insiden dari tabel MySQL 'anomaly_logs'...
      </td>
    </tr>
  `;

  try {
    const res = await fetch('/api/db/anomalies?limit=20');
    const data = await res.json();
    
    if (data.success && data.records && data.records.length > 0) {
      let rows = '';
      data.records.forEach(r => {
        const timeStr = new Date(r.created_at).toLocaleTimeString('id-ID');
        const severityBadge = r.severity === 'CRITICAL'
          ? '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold">CRITICAL</span>'
          : '<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded text-[10px] font-bold">WARNING</span>';
        
        const zScoreStr = typeof r.z_score === 'number' 
          ? (r.z_score >= 0 ? `+${r.z_score}σ` : `${r.z_score}σ`)
          : '-';

        rows += `
          <tr class="hover:bg-slate-800/40 transition">
            <td class="py-2.5 px-3 text-slate-500 text-[10px]">#${r.id}</td>
            <td class="py-2.5 px-3 text-slate-400 whitespace-nowrap">${timeStr}</td>
            <td class="py-2.5 px-3 font-bold text-slate-200">${r.wan_id}</td>
            <td class="py-2.5 px-3 text-slate-300 text-[11px]">${r.anomaly_type}</td>
            <td class="py-2.5 px-3">${severityBadge}</td>
            <td class="py-2.5 px-3 text-amber-400 font-semibold">${zScoreStr}</td>
            <td class="py-2.5 px-3 text-[11px] text-slate-300">
              <div>${r.message}</div>
              ${r.recommendation ? `<div class="text-[10px] text-emerald-400 mt-0.5"><i class="fa-solid fa-wrench mr-1"></i>${r.recommendation}</div>` : ''}
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = rows;
    } else {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="py-6 text-center text-slate-500 italic">
            <i class="fa-solid fa-check-circle text-emerald-400 text-lg mb-1 block"></i>
            Tidak ada riwayat anomali pada database MySQL. Jaringan berjalan stabil.
          </td>
        </tr>
      `;
    }
  } catch (e) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-4 text-center text-rose-400 text-xs">
          Gagal mengambil data dari MySQL: ${e.message}
        </td>
      </tr>
    `;
  }
}

// ====================================================================
// 10B. TOPOLOGI MULTI-WAN INTERACTIVE TRACER & INSPECTOR
// ====================================================================

function updateInspectorMetrics(r) {
  if (!r) return;
  const inspectDevName = document.getElementById('inspectDevName');
  const inspectDevModel = document.getElementById('inspectDevModel');
  const inspectDevLoc = document.getElementById('inspectDevLoc');
  const inspectDevIp = document.getElementById('inspectDevIp');
  const inspectDevStatus = document.getElementById('inspectDevStatus');
  const inspectPortsInfo = document.getElementById('inspectPortsInfo');
  const inspectRtt = document.getElementById('inspectRtt');
  const inspectLoss = document.getElementById('inspectLoss');
  const inspectClients = document.getElementById('inspectClients');
  const inspectBandwidth = document.getElementById('inspectBandwidth');

  if (inspectDevName) inspectDevName.textContent = r.name || r.id;
  if (inspectDevModel) inspectDevModel.textContent = r.model || 'Linksys OpenWrt EA7500';
  if (inspectDevLoc) inspectDevLoc.textContent = r.location || 'Kampus UNUGHA';
  if (inspectDevIp) inspectDevIp.textContent = r.ip || '-';
  if (inspectDevStatus) {
    const isUp = r.status === 'UP';
    inspectDevStatus.textContent = isUp ? 'UP (Multi-WAN Optimal)' : 'DOWN (Terputus)';
    inspectDevStatus.className = isUp ? 'text-emerald-400 font-bold' : 'text-rose-400 font-bold';
  }
  if (inspectPortsInfo) {
    inspectPortsInfo.textContent = `Uplink: ${r.uplinkPath || 'Switch Distribusi'} ➔ Downlink: ${r.downlinkPath || 'Area Klien Wi-Fi'}`;
  }
  if (inspectRtt) inspectRtt.textContent = `${r.rttToMikrotik || 1.2} ms`;
  if (inspectLoss) inspectLoss.textContent = `${r.packetLoss || 0.0}%`;
  if (inspectClients) inspectClients.textContent = `${r.activeClients || 0} User (${r.clientUtilizationPercent || 0}%)`;
  if (inspectBandwidth) {
    inspectBandwidth.textContent = `Throughput: Rx ${r.bandwidthRxMbps || 0} Mbps / Tx ${r.bandwidthTxMbps || 0} Mbps`;
  }

  // Update Status Akses Internet & Jalur Egress PCC
  const inspectInternetStatus = document.getElementById('inspectInternetStatus');
  const inspectInternetRoute = document.getElementById('inspectInternetRoute');
  if (inspectInternetStatus) {
    const acc = r.internetAccess;
    if (acc && acc.status === 'ONLINE') {
      inspectInternetStatus.innerHTML = '<i class="fa-solid fa-circle text-[8px] animate-pulse"></i> <span>ONLINE (Internet Aktif)</span>';
      inspectInternetStatus.className = 'text-emerald-400 font-mono text-[11px] flex items-center gap-1 font-bold';
    } else if (acc && acc.status === 'FAILOVER') {
      inspectInternetStatus.innerHTML = '<i class="fa-solid fa-arrow-right-arrow-left text-[9px]"></i> <span>FAILOVER (Dialihkan)</span>';
      inspectInternetStatus.className = 'text-amber-400 font-mono text-[11px] flex items-center gap-1 font-bold';
    } else {
      inspectInternetStatus.innerHTML = '<i class="fa-solid fa-circle text-[8px]"></i> <span>OFFLINE (Terputus)</span>';
      inspectInternetStatus.className = 'text-rose-400 font-mono text-[11px] flex items-center gap-1 font-bold';
    }
  }
  if (inspectInternetRoute) {
    const acc = r.internetAccess;
    if (acc) {
      inspectInternetRoute.textContent = `Egress: ${acc.primaryWanName || 'WAN'} (${acc.routingMark}) • Ping: ${acc.internetLatencyMs}ms`;
    } else {
      inspectInternetRoute.textContent = 'Jalur: Gateway 10.27.42.1 (PCC Multi-WAN)';
    }
  }
}

function traceRouterPath(routerId) {
  if (!routerId) return;
  state.selectedTraceRouterId = routerId;

  // Sinkronkan dropdown traceDeviceSelect
  const select = document.getElementById('traceDeviceSelect');
  if (select && select.value !== routerId) {
    select.value = routerId;
  }

  const router = state.routers[routerId] || Object.values(state.routers).find(r => r.slug === routerId);
  if (!router) return;

  updateInspectorMetrics(router);

  // Render langkah-langkah hop-by-hop
  const stepsContainer = document.getElementById('inspectTraceRouteSteps');
  if (stepsContainer && router.traceRoute && Array.isArray(router.traceRoute)) {
    stepsContainer.innerHTML = router.traceRoute.map((step, idx) => {
      const isFirst = idx === 0;
      const isLast = idx === router.traceRoute.length - 1;
      let badgeClass = 'bg-slate-800 text-slate-200 border border-slate-700';
      let icon = '';

      if (isFirst) {
        badgeClass = 'bg-cyan-950/80 text-cyan-300 border border-cyan-500/40 font-bold';
        icon = '<i class="fa-solid fa-globe mr-1"></i>';
      } else if (isLast) {
        badgeClass = 'bg-emerald-950 text-emerald-300 border border-emerald-500/60 font-bold';
        icon = '<i class="fa-solid fa-wifi mr-1"></i>';
      } else if (step.includes('MikroTik') || step.includes('Virtual')) {
        badgeClass = 'bg-indigo-950 text-indigo-300 border border-indigo-700 font-bold';
        icon = '<i class="fa-solid fa-server mr-1"></i>';
      }

      const arrow = idx < router.traceRoute.length - 1 
        ? '<i class="fa-solid fa-arrow-right text-[10px] text-cyan-500 mx-0.5"></i>' 
        : '';

      return `
        <span class="${badgeClass} px-2 py-1 rounded-lg flex items-center gap-1 shadow-sm">
          ${icon}${step}
        </span>
        ${arrow}
      `;
    }).join('');
  }

  // Visual Highlight pada Kanvas Diagram
  document.querySelectorAll('.topo-node').forEach(el => el.classList.remove('active-trace'));

  // 1. Core Upstream Nodes selalu aktif karena semua router melewati Gateway & MikroTik CHR
  const coreNodes = ['gateway-lb', 'virtual-device', 'sw-rack'];
  coreNodes.forEach(id => {
    const el = document.querySelector(`[data-node-id="${id}"]`);
    if (el) el.classList.add('active-trace');
  });

  // 2. Node perangkat terpilih
  const targetEl = document.querySelector(`[data-node-id="${routerId}"]`);
  if (targetEl) targetEl.classList.add('active-trace');

  // 3. Node perantara per cabang
  // Cabang 1: Perpus & Rektorat
  const b1 = ['ea7500-01', 'ea7500-02', 'ea7500-03', 'ea7500-04', 'ea7500-05', 'ea7500-06', 'ea7500-07'];
  if (b1.includes(routerId)) {
    const dtb = document.querySelector('[data-node-id="perpus-dtb"]');
    if (dtb) dtb.classList.add('active-trace');

    if (['ea7500-01', 'ea7500-02'].includes(routerId)) {
      const swP = document.querySelector('[data-node-id="sw-perpus"]');
      if (swP) swP.classList.add('active-trace');
      if (routerId === 'ea7500-02') {
        const bem = document.querySelector('[data-node-id="ea7500-01"]');
        if (bem) bem.classList.add('active-trace');
      }
    } else {
      const swR = document.querySelector('[data-node-id="sw-rektorat"]');
      if (swR) swR.classList.add('active-trace');
      if (routerId === 'ea7500-06') {
        const b1Node = document.querySelector('[data-node-id="ea7500-05"]');
        if (b1Node) b1Node.classList.add('active-trace');
      }
    }
  }

  // Cabang 2: Gedung D & Kelas A
  const b2 = ['ea7500-08', 'ea7500-09', 'ea7500-10', 'ea7500-11', 'ea7500-12'];
  if (b2.includes(routerId)) {
    const gd1 = document.querySelector('[data-node-id="ea7500-08"]');
    if (gd1) gd1.classList.add('active-trace');

    if (['ea7500-10', 'ea7500-11', 'ea7500-12'].includes(routerId)) {
      const a5 = document.querySelector('[data-node-id="ea7500-09"]');
      if (a5) a5.classList.add('active-trace');
    }
    if (['ea7500-11', 'ea7500-12'].includes(routerId)) {
      const a6 = document.querySelector('[data-node-id="ea7500-10"]');
      if (a6) a6.classList.add('active-trace');
    }
    if (routerId === 'ea7500-12') {
      const a7 = document.querySelector('[data-node-id="ea7500-11"]');
      if (a7) a7.classList.add('active-trace');
    }
  }

  // Cabang 3: Lab Komputer & Gedung H
  const b3 = ['ea7500-13', 'ea7500-14', 'ea7500-15', 'ea7500-16'];
  if (b3.includes(routerId)) {
    const lab = document.querySelector('[data-node-id="ea7500-13"]');
    if (lab) lab.classList.add('active-trace');

    if (['ea7500-15', 'ea7500-16'].includes(routerId)) {
      const gh2 = document.querySelector('[data-node-id="ea7500-14"]');
      if (gh2) gh2.classList.add('active-trace');
    }
  }
}

function resetTrace() {
  state.selectedTraceRouterId = null;
  const select = document.getElementById('traceDeviceSelect');
  if (select) select.value = '';
  document.querySelectorAll('.topo-node').forEach(el => el.classList.remove('active-trace'));
  traceRouterPath('ea7500-01');
}

function traceRouterFromCard(routerId) {
  switchNavTab('topologi');
  traceRouterPath(routerId);
  setTimeout(() => {
    const panel = document.getElementById('routeInspectorPanel');
    if (panel) {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
}

// Inisialisasi data awal aplikasi dari API backend
async function loadInitialData() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    if (data.success) {
      if (data.wans && Array.isArray(data.wans)) {
        data.wans.forEach(w => {
          state.wans[w.id] = w;
          renderWanCard(w);
        });
      }
      if (data.mikrotik) {
        state.mikrotik = data.mikrotik;
      }
      if (data.routers && Array.isArray(data.routers)) {
        data.routers.forEach(r => {
          state.routers[r.id] = r;
        });
        renderRouterGrid();
        renderDashboardInternetTable();
      }
      if (data.aggregate) {
        updateAggregateSummary(data.aggregate);
      }
      // Mulai dengan trace GD-BEM01 secara otomatis
      traceRouterPath('ea7500-01');
    }
  } catch (e) {
    console.error('Gagal memuat initial data:', e);
  }
}

// Kontrol Mode Operasional (Dunia Nyata vs Hybrid vs Simulasi)
async function setOperationalMode(mode) {
  try {
    const res = await fetch('/api/probe/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode })
    });
    const data = await res.json();
    if (data.success) {
      updateModeButtons(data.mode);
    }
  } catch (e) {
    alert('Gagal menyetel mode operasional: ' + e.message);
  }
}

function updateModeButtons(activeMode) {
  const badge = document.getElementById('currentModeBadge');
  if (badge) badge.textContent = activeMode;

  const modes = ['HYBRID_SMART', 'REAL_PROBE', 'SIMULATION'];
  modes.forEach(m => {
    const btn = document.getElementById(`modeBtn-${m}`);
    if (btn) {
      if (m === activeMode) {
        btn.className = 'mode-select-btn p-2.5 rounded-xl border border-cyan-400 bg-cyan-950/50 text-left transition shadow-md';
      } else {
        btn.className = 'mode-select-btn p-2.5 rounded-xl border border-slate-800 bg-slate-900/60 text-left transition hover:border-slate-700';
      }
    }
  });
}

// Live ICMP Ping Tester Tool
async function runLivePing() {
  const input = document.getElementById('livePingInput');
  const resultBox = document.getElementById('livePingResult');
  const btn = document.getElementById('runPingBtn');
  if (!input || !resultBox) return;

  const ip = input.value.trim();
  if (!ip) {
    alert('Silakan masukkan alamat IP target.');
    return;
  }

  btn.disabled = true;
  resultBox.innerHTML = `<span class="text-cyan-400 flex items-center gap-2"><i class="fa-solid fa-circle-notch animate-spin"></i> Mengirim ICMP echo request ke ${ip}...</span>`;

  try {
    const res = await fetch('/api/probe/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, timeoutMs: 1200 })
    });
    const data = await res.json();
    if (data.success) {
      if (data.alive) {
        resultBox.innerHTML = `
          <div class="space-y-1 text-emerald-400">
            <div class="flex items-center gap-1.5 font-bold">
              <i class="fa-solid fa-circle-check text-emerald-400"></i>
              <span>REPLY DITERIMA dari ${data.ip}: RTT = ${data.rtt} ms (0% Loss)</span>
            </div>
            <div class="text-[10px] text-slate-400">Host dapat dijangkau langsung melalui network socket OS host.</div>
          </div>
        `;
      } else {
        resultBox.innerHTML = `
          <div class="space-y-1 text-rose-400">
            <div class="flex items-center gap-1.5 font-bold">
              <i class="fa-solid fa-circle-xmark text-rose-400"></i>
              <span>REQUEST TIMED OUT ke ${data.ip} (${data.loss}% Packet Loss)</span>
            </div>
            <div class="text-[10px] text-slate-400">Perangkat mati, kabel LAN terputus, atau ICMP diblokir firewall.</div>
          </div>
        `;
      }
    } else {
      resultBox.innerHTML = `<span class="text-rose-400">Error: ${data.message}</span>`;
    }
  } catch (e) {
    resultBox.innerHTML = `<span class="text-rose-400">Gagal menjalankan ping: ${e.message}</span>`;
  } finally {
    btn.disabled = false;
  }
}

// ====================================================================
// 10C. CRUD DEVICE MANAGEMENT (ROUTER / ACCESS POINT)
// ====================================================================

function renderAdminRouterTable() {
  const tbody = document.getElementById('adminRouterTableBody');
  const countDisplay = document.getElementById('adminRouterCount');
  const searchInput = document.getElementById('adminRouterSearchInput');
  if (!tbody) return;

  const term = (searchInput ? searchInput.value : '').toLowerCase();
  const allRouters = Object.values(state.routers);

  if (countDisplay) {
    countDisplay.textContent = `Total: ${allRouters.length} Router Terdaftar`;
  }

  const filtered = allRouters.filter(r => {
    return (r.name || '').toLowerCase().includes(term) ||
           (r.ip || '').includes(term) ||
           (r.location || '').toLowerCase().includes(term) ||
           (r.id || '').toLowerCase().includes(term);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="py-8 text-center text-slate-500 italic">
          Tidak ada router yang sesuai dengan kueri pencarian "${term}".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map((r, idx) => {
    const isUp = r.status === 'UP';
    const statusBadge = isUp 
      ? '<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded text-[10px] font-bold">UP</span>'
      : '<span class="bg-rose-500/20 text-rose-400 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold">DOWN</span>';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-3 text-slate-400 text-[11px] font-mono">${r.id}</td>
        <td class="py-2.5 px-3 font-bold text-white text-[11px]">${r.name}</td>
        <td class="py-2.5 px-3 text-amber-300 font-mono text-[11px]">${r.ip}</td>
        <td class="py-2.5 px-3 text-slate-300 text-[11px]">${r.model || 'OpenWrt EA7500'}</td>
        <td class="py-2.5 px-3 text-slate-400 text-[11px] max-w-[180px] truncate" title="${r.location}">${r.location}</td>
        <td class="py-2.5 px-3 text-slate-400 font-mono text-[10px] truncate max-w-[150px]" title="${r.uplinkPath}">${r.uplinkPath}</td>
        <td class="py-2.5 px-3 text-center">${statusBadge}</td>
        <td class="py-2.5 px-3 text-center">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="editRouter('${r.id}')" title="Edit Data Router" class="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-950 text-cyan-400 border border-slate-700 hover:border-cyan-500/50 transition">
              <i class="fa-solid fa-pen-to-square text-xs"></i>
            </button>
            <button onclick="deleteRouter('${r.id}')" title="Hapus Router" class="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-rose-400 border border-slate-700 hover:border-rose-500/50 transition">
              <i class="fa-solid fa-trash-can text-xs"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function openAddRouterModal() {
  const modal = document.getElementById('routerFormModal');
  const form = document.getElementById('routerEditForm');
  const mode = document.getElementById('routerFormMode');
  const title = document.getElementById('routerModalTitle');
  const idInput = document.getElementById('formRouterId');

  if (!modal || !form) return;

  mode.value = 'CREATE';
  title.textContent = 'Tambah Access Point Baru';
  idInput.readOnly = false;
  idInput.classList.remove('opacity-50', 'cursor-not-allowed');

  form.reset();
  const nextNum = Object.keys(state.routers).length + 1;
  idInput.value = 'ea7500-' + String(nextNum).padStart(2, '0');
  document.getElementById('formRouterMaxClients').value = '64';

  modal.classList.remove('hidden');
}

function closeRouterModal() {
  const modal = document.getElementById('routerFormModal');
  if (modal) modal.classList.add('hidden');
}

function editRouter(routerId) {
  const r = state.routers[routerId];
  if (!r) return;

  const modal = document.getElementById('routerFormModal');
  const mode = document.getElementById('routerFormMode');
  const title = document.getElementById('routerModalTitle');
  const idInput = document.getElementById('formRouterId');

  if (!modal) return;

  mode.value = 'EDIT';
  title.textContent = `Edit Router: ${r.name} (${r.id})`;
  idInput.value = r.id;
  idInput.readOnly = true;
  idInput.classList.add('opacity-50', 'cursor-not-allowed');

  document.getElementById('formRouterName').value = r.name || '';
  document.getElementById('formRouterIp').value = r.ip || '';
  document.getElementById('formRouterModel').value = r.model || 'Linksys OpenWrt EA7500';
  document.getElementById('formRouterLocation').value = r.location || '';
  document.getElementById('formRouterBranch').value = r.branchGroup || 'Perpus & Rektorat';
  document.getElementById('formRouterUplink').value = r.uplinkPath || '';
  document.getElementById('formRouterDownlink').value = r.downlinkPath || '';
  document.getElementById('formRouterMaxClients').value = r.maxClients || 64;

  modal.classList.remove('hidden');
}

async function handleRouterFormSubmit(event) {
  event.preventDefault();

  const mode = document.getElementById('routerFormMode').value;
  const routerId = document.getElementById('formRouterId').value.trim();
  const name = document.getElementById('formRouterName').value.trim();
  const ip = document.getElementById('formRouterIp').value.trim();
  const model = document.getElementById('formRouterModel').value;
  const location = document.getElementById('formRouterLocation').value.trim();
  const branchGroup = document.getElementById('formRouterBranch').value;
  const uplinkPath = document.getElementById('formRouterUplink').value.trim();
  const downlinkPath = document.getElementById('formRouterDownlink').value.trim();
  const maxClients = parseInt(document.getElementById('formRouterMaxClients').value, 10) || 64;

  const saveBtn = document.getElementById('saveRouterBtn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin"></i> Menyimpan...';

  try {
    const payload = {
      id: routerId,
      name,
      ip,
      model,
      location,
      branchGroup,
      uplinkPath,
      downlinkPath,
      maxClients
    };

    let url = '/api/routers';
    let method = 'POST';

    if (mode === 'EDIT') {
      url = `/api/routers/${encodeURIComponent(routerId)}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success) {
      if (data.router) {
        state.routers[data.router.id] = data.router;
      }
      renderAdminRouterTable();
      renderRouterGrid();
      closeRouterModal();
      alert(data.message || 'Data router berhasil disimpan.');
    } else {
      alert('Gagal: ' + data.message);
    }
  } catch (err) {
    alert('Terjadi kesalahan: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i><span>Simpan Perangkat</span>';
  }
}

async function deleteRouter(routerId) {
  const r = state.routers[routerId];
  const name = r ? r.name : routerId;
  const ok = confirm(`Apakah Anda yakin ingin menghapus access point "${name}" (${routerId}) dari sistem monitoring?`);
  if (!ok) return;

  try {
    const res = await fetch(`/api/routers/${encodeURIComponent(routerId)}`, {
      method: 'DELETE'
    });
    const data = await res.json();
    if (data.success) {
      delete state.routers[routerId];
      renderAdminRouterTable();
      renderRouterGrid();
      alert(`Router ${name} berhasil dihapus.`);
    } else {
      alert('Gagal menghapus: ' + data.message);
    }
  } catch (err) {
    alert('Terjadi kesalahan jaringan: ' + err.message);
  }
}

// Daftarkan fungsi ke window global scope
window.switchNavTab = switchNavTab;
window.toggleMobileMenu = toggleMobileMenu;
window.refreshDbAnomaliesTable = refreshDbAnomaliesTable;
window.traceRouterPath = traceRouterPath;
window.resetTrace = resetTrace;
window.traceRouterFromCard = traceRouterFromCard;
window.setOperationalMode = setOperationalMode;
window.runLivePing = runLivePing;
window.renderAdminRouterTable = renderAdminRouterTable;
window.openAddRouterModal = openAddRouterModal;
window.closeRouterModal = closeRouterModal;
window.editRouter = editRouter;
window.handleRouterFormSubmit = handleRouterFormSubmit;
window.deleteRouter = deleteRouter;

// ====================================================================
// 11. Event Listeners & Modals Initialization
// ====================================================================
document.addEventListener('DOMContentLoaded', () => {
  initCharts();
  loadInitialData();
  setupSocket();

  // Search & Filter 16 Router Linksys EA7500
  const searchInput = document.getElementById('searchRouterInput');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      state.routerSearchTerm = e.target.value;
      renderRouterGrid();
    });
  }

  const filterSelect = document.getElementById('filterRouterStatus');
  if (filterSelect) {
    filterSelect.addEventListener('change', (e) => {
      state.routerStatusFilter = e.target.value;
      renderRouterGrid();
    });
  }

  // Kontrol Tracer Jalur Topologi Multi-WAN
  const traceDeviceSelect = document.getElementById('traceDeviceSelect');
  if (traceDeviceSelect) {
    traceDeviceSelect.addEventListener('change', (e) => {
      if (e.target.value) {
        traceRouterPath(e.target.value);
      }
    });
  }

  const resetTraceBtn = document.getElementById('resetTraceBtn');
  if (resetTraceBtn) {
    resetTraceBtn.addEventListener('click', () => {
      resetTrace();
    });
  }

  // Interaktivitas Klik Langsung pada Node Diagram Topologi
  document.addEventListener('click', (e) => {
    const nodeEl = e.target.closest('.topo-node');
    if (nodeEl) {
      const nodeId = nodeEl.getAttribute('data-node-id');
      if (nodeId) {
        traceRouterPath(nodeId);
      }
    }
  });

  // Audio Toggle
  const toggleAudioBtn = document.getElementById('toggleAudioBtn');
  const audioIcon = document.getElementById('audioIcon');
  if (toggleAudioBtn) {
    toggleAudioBtn.addEventListener('click', () => {
      audioPlayer.isMuted = !audioPlayer.isMuted;
      if (audioPlayer.isMuted) {
        audioIcon.className = 'fa-solid fa-volume-xmark text-rose-400 text-xs sm:text-sm';
      } else {
        audioIcon.className = 'fa-solid fa-volume-high text-slate-300 text-xs sm:text-sm';
        audioPlayer.playBeep('WARNING');
      }
    });
  }

  // Clear Alerts Feed
  const clearBtn = document.getElementById('clearAlertsBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      document.getElementById('alertFeedContainer').innerHTML = `
        <div class="text-center py-10 text-slate-500 text-xs">
          <i class="fa-solid fa-circle-check text-emerald-500/50 text-3xl mb-2 block"></i>
          Belum ada insiden anomali terdeteksi. Sistem berjalan normal.
        </div>
      `;
      state.activeAnomalies.clear();
    });
  }

  // Tombol Skenario Simulasi Anomali di Tab Admin
  document.querySelectorAll('.scenario-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const scenario = btn.getAttribute('data-scenario');
      try {
        const res = await fetch('/api/simulator/scenario', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenario, durationSeconds: 40 })
        });
        const json = await res.json();
        if (json.success) {
          handleScenarioBadge(scenario, 40);
          
          // Efek visual tombol skenario aktif
          document.querySelectorAll('.scenario-btn').forEach(b => b.classList.remove('ring-2', 'ring-purple-400'));
          btn.classList.add('ring-2', 'ring-purple-400');
          setTimeout(() => btn.classList.remove('ring-2', 'ring-purple-400'), 2500);

          // Pindah langsung ke dashboard untuk melihat efek live grafik (opsional UX)
          switchNavTab('dashboard');
        }
      } catch (e) {
        alert('Gagal menyetel skenario: ' + e.message);
      }
    });
  });

  // Tombol Benchmark RPC vs REST di Tab Admin
  const startBenchmarkBtn = document.getElementById('startBenchmarkBtn');
  if (startBenchmarkBtn) {
    startBenchmarkBtn.addEventListener('click', async () => {
      const iterations = document.getElementById('benchmarkIterations').value;
      const loading = document.getElementById('benchmarkLoading');
      const resultsArea = document.getElementById('benchmarkResultsArea');

      loading.classList.remove('hidden');
      resultsArea.classList.add('hidden');

      try {
        const res = await fetch('/api/benchmark/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ iterations })
        });
        const data = await res.json();

        if (data.success && data.report) {
          const r = data.report;
          document.getElementById('rpcAvgLat').textContent = `${r.rpc.avgLatencyMs} ms`;
          document.getElementById('rpcMinMaxLat').textContent = `${r.rpc.minLatencyMs} / ${r.rpc.maxLatencyMs} ms`;
          document.getElementById('rpcP95Lat').textContent = `${r.rpc.p95LatencyMs} ms`;
          document.getElementById('rpcReqSec').textContent = `${r.rpc.reqPerSec} req/s`;
          document.getElementById('rpcBytes').textContent = `${r.rpc.avgBytesPerCall} bytes`;

          document.getElementById('restAvgLat').textContent = `${r.rest.avgLatencyMs} ms`;
          document.getElementById('restMinMaxLat').textContent = `${r.rest.minLatencyMs} / ${r.rest.maxLatencyMs} ms`;
          document.getElementById('restP95Lat').textContent = `${r.rest.p95LatencyMs} ms`;
          document.getElementById('restReqSec').textContent = `${r.rest.reqPerSec} req/s`;
          document.getElementById('restBytes').textContent = `${r.rest.avgBytesPerCall} bytes`;

          document.getElementById('benchmarkConclusionText').textContent = r.analysis.conclusion;

          loading.classList.add('hidden');
          resultsArea.classList.remove('hidden');

          // Segarkan data log MySQL karena benchmark otomatis tersimpan
          refreshDbAnomaliesTable();
        }
      } catch (e) {
        loading.classList.add('hidden');
        alert('Gagal menjalankan benchmark: ' + e.message);
      }
    });
  }

  // Resize listener agar Chart.js responsif saat orientasi HP berubah (Portrait <-> Landscape)
  window.addEventListener('resize', () => {
    if (throughputChart) throughputChart.resize();
    if (latencyChart) latencyChart.resize();
    if (packetLossChart) packetLossChart.resize();
  });

  // Inisialisasi status user login dari LocalStorage
  updateUserAuthUI();
});

// ====================================================================
// 12. Authentication & Exit Confirmation Logic (Login, Register, Logout)
// ====================================================================

// Sistem Notifikasi Toast Cantik
function showToast(title, message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-xl backdrop-blur-md transition-all duration-300 transform translate-y-2 opacity-0 text-xs animate-fadeInView';

  let borderBg = 'bg-slate-900/95 border-slate-700 text-slate-200';
  let iconHtml = '<i class="fa-solid fa-circle-info text-cyan-400 text-base mt-0.5"></i>';

  if (type === 'success') {
    borderBg = 'bg-emerald-950/90 border-emerald-500/40 text-emerald-100';
    iconHtml = '<i class="fa-solid fa-circle-check text-emerald-400 text-base mt-0.5"></i>';
  } else if (type === 'warning') {
    borderBg = 'bg-amber-950/90 border-amber-500/40 text-amber-100';
    iconHtml = '<i class="fa-solid fa-triangle-exclamation text-amber-400 text-base mt-0.5"></i>';
  } else if (type === 'error') {
    borderBg = 'bg-rose-950/90 border-rose-500/40 text-rose-100';
    iconHtml = '<i class="fa-solid fa-circle-xmark text-rose-400 text-base mt-0.5"></i>';
  }

  toast.className += ` ${borderBg}`;
  toast.innerHTML = `
    ${iconHtml}
    <div class="flex-1 min-w-0">
      <div class="font-bold text-white text-[12px]">${title}</div>
      <div class="text-[11px] opacity-90 mt-0.5 leading-snug">${message}</div>
    </div>
    <button onclick="this.parentElement.remove()" class="text-slate-400 hover:text-white p-0.5">
      <i class="fa-solid fa-xmark text-xs"></i>
    </button>
  `;

  container.appendChild(toast);

  // Animasi masuk
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  // Hapus otomatis setelah 4 detik
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// Buka Modal Auth
function openAuthModal(tab = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  hideAuthAlert();

  const userJson = localStorage.getItem('multiwan_user');
  const loggedInView = document.getElementById('authLoggedInView');

  if (userJson && tab !== 'login_form' && tab !== 'register') {
    // Jika user sudah login, tampilkan profil akun aktif dengan tombol Logout
    try {
      const user = JSON.parse(userJson);
      if (loggedInView) {
        loggedInView.classList.remove('hidden');
        const nameEl = document.getElementById('modalLoggedInName');
        const roleEl = document.getElementById('modalLoggedInRole');
        const emailEl = document.getElementById('modalLoggedInEmail');
        if (nameEl) nameEl.textContent = user.fullname || user.username;
        if (roleEl) roleEl.textContent = (user.role || 'operator').toUpperCase();
        if (emailEl) emailEl.textContent = user.email || `${user.username}@unugha.ac.id`;
      }
      const lForm = document.getElementById('loginForm');
      const rForm = document.getElementById('registerForm');
      if (lForm) lForm.classList.add('hidden');
      if (rForm) rForm.classList.add('hidden');
      return;
    } catch (e) {}
  }

  // Jika belum login atau sengaja memilih ganti akun
  if (loggedInView) loggedInView.classList.add('hidden');
  switchAuthTab(tab === 'login_form' ? 'login' : tab);
}

// Logout langsung dari Modal Login
function logoutFromAuthModal() {
  closeAuthModal();
  promptExitApp();
}

// Beralih dari tampilan sesi ke form login
function switchLoggedInToLoginForm() {
  const loggedInView = document.getElementById('authLoggedInView');
  if (loggedInView) loggedInView.classList.add('hidden');
  switchAuthTab('login');
}

// Tutup Modal Auth
function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.add('hidden');
}

// Ganti Tampilan Masuk vs Registrasi
function switchAuthTab(tab = 'login') {
  const loginForm = document.getElementById('loginForm');
  const regForm = document.getElementById('registerForm');
  const modalTitle = document.getElementById('authModalTitle');
  const modalSub = document.getElementById('authModalSubtitle');

  hideAuthAlert();

  if (tab === 'login') {
    if (loginForm) loginForm.classList.remove('hidden');
    if (regForm) regForm.classList.add('hidden');
    if (modalTitle) modalTitle.textContent = 'Masuk ke Sistem NOC';
    if (modalSub) modalSub.textContent = 'Monitoring Jaringan Multi-WAN UNUGHA';
  } else {
    if (loginForm) loginForm.classList.add('hidden');
    if (regForm) regForm.classList.remove('hidden');
    if (modalTitle) modalTitle.textContent = 'Registrasi Akun Petugas NOC';
    if (modalSub) modalSub.textContent = 'Daftarkan akun operator/admin baru';
  }
}

function showAuthAlert(message, type = 'error') {
  const box = document.getElementById('authAlertBox');
  if (!box) return;
  box.classList.remove('hidden');
  if (type === 'error') {
    box.className = 'mb-4 p-2.5 rounded-lg text-xs flex items-center gap-2 bg-rose-950/60 border border-rose-500/40 text-rose-300';
    box.innerHTML = `<i class="fa-solid fa-circle-exclamation text-rose-400"></i><span>${message}</span>`;
  } else {
    box.className = 'mb-4 p-2.5 rounded-lg text-xs flex items-center gap-2 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300';
    box.innerHTML = `<i class="fa-solid fa-circle-check text-emerald-400"></i><span>${message}</span>`;
  }
}

function hideAuthAlert() {
  const box = document.getElementById('authAlertBox');
  if (box) box.classList.add('hidden');
}

// Demo Akun Cepat Penguji Sidang
function fillAdminCredentials() {
  const idInput = document.getElementById('loginIdentifier');
  const passInput = document.getElementById('loginPassword');
  if (idInput) idInput.value = 'admin';
  if (passInput) passInput.value = 'admin123';
  showAuthAlert('Kredensial default admin berhasil diisi otomatis.', 'success');
}

// Form Submission: Login
async function handleLoginSubmit(event) {
  event.preventDefault();
  const usernameOrEmail = document.getElementById('loginIdentifier').value;
  const password = document.getElementById('loginPassword').value;
  const btn = document.getElementById('loginSubmitBtn');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin mr-1"></i> Memvalidasi...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password })
    });
    const data = await res.json();

    if (data.success && data.user) {
      localStorage.setItem('multiwan_user', JSON.stringify(data.user));
      updateUserAuthUI();
      closeAuthModal();
      showToast('Login Berhasil!', `Selamat datang, ${data.user.fullname} (${data.user.role.toUpperCase()})`, 'success');
      audioPlayer.playBeep('WARNING'); // Suara login
    } else {
      showAuthAlert(data.message || 'Login gagal. Periksa kembali username/password.');
    }
  } catch (err) {
    showAuthAlert('Terjadi kesalahan koneksi server: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-right-to-bracket mr-1.5"></i> Masuk ke Sistem';
  }
}

// Form Submission: Register
async function handleRegisterSubmit(event) {
  event.preventDefault();
  const fullname = document.getElementById('regFullname').value;
  const username = document.getElementById('regUsername').value;
  const email = document.getElementById('regEmail').value;
  const password = document.getElementById('regPassword').value;
  const role = document.getElementById('regRole').value;
  const btn = document.getElementById('regSubmitBtn');

  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-circle-notch animate-spin mr-1"></i> Mendaftarkan...';

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullname, username, email, password, role })
    });
    const data = await res.json();

    if (data.success) {
      switchAuthTab('login');
      document.getElementById('loginIdentifier').value = username;
      document.getElementById('loginPassword').value = '';
      showAuthAlert('Registrasi sukses! Silakan masukkan kata sandi untuk login.', 'success');
      showToast('Akun Dibuat!', 'Silakan masuk menggunakan akun baru Anda.', 'success');
    } else {
      showAuthAlert(data.message || 'Pendaftaran akun gagal.');
    }
  } catch (err) {
    showAuthAlert('Gagal terhubung ke database server: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fa-solid fa-user-check mr-1.5"></i> Daftarkan Akun Baru';
  }
}

// Update Elemen Tampilan UI Navbar sesuai sesi login
function updateUserAuthUI() {
  const userJson = localStorage.getItem('multiwan_user');
  const openAuthBtn = document.getElementById('openAuthBtn');
  const profileChip = document.getElementById('userProfileChip');
  const userNameDisplay = document.getElementById('userNameDisplay');
  const userRoleDisplay = document.getElementById('userRoleDisplay');
  const mobileAuthBtnText = document.getElementById('mobileAuthBtnText');
  const mobileAuthActionBtn = document.getElementById('mobileAuthActionBtn');

  if (userJson) {
    try {
      const user = JSON.parse(userJson);
      if (openAuthBtn) openAuthBtn.classList.add('hidden');
      if (profileChip) {
        profileChip.classList.remove('hidden');
        profileChip.classList.add('flex');
      }
      if (userNameDisplay) userNameDisplay.textContent = user.fullname || user.username;
      if (userRoleDisplay) userRoleDisplay.textContent = (user.role || 'operator').toUpperCase();
      if (mobileAuthBtnText) mobileAuthBtnText.textContent = `Logout (${user.username})`;
      if (mobileAuthActionBtn) {
        mobileAuthActionBtn.className = 'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-500/40 transition';
        const icon = mobileAuthActionBtn.querySelector('i');
        if (icon) icon.className = 'fa-solid fa-arrow-right-from-bracket text-rose-400';
      }
      return;
    } catch (e) {}
  }

  // Jika belum login
  if (openAuthBtn) openAuthBtn.classList.remove('hidden');
  if (profileChip) {
    profileChip.classList.add('hidden');
    profileChip.classList.remove('flex');
  }
  if (mobileAuthBtnText) mobileAuthBtnText.textContent = 'Masuk / Registrasi Akun';
  if (mobileAuthActionBtn) {
    mobileAuthActionBtn.className = 'w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition';
    const icon = mobileAuthActionBtn.querySelector('i');
    if (icon) icon.className = 'fa-solid fa-right-to-bracket text-cyan-400';
  }
}

function handleMobileAuthClick() {
  const userJson = localStorage.getItem('multiwan_user');
  if (userJson) {
    promptExitApp();
  } else {
    openAuthModal('login');
  }
}

// ====================================================================
// DIALOG KONFIRMASI: MAU DI APLIKASI ATAU MAU KELUAR
// ====================================================================
function promptExitApp() {
  const modal = document.getElementById('exitConfirmModal');
  if (modal) modal.classList.remove('hidden');
}

function stayInApplication() {
  const modal = document.getElementById('exitConfirmModal');
  if (modal) modal.classList.add('hidden');
  showToast('Tetap di Aplikasi', 'Anda memilih tetap berada di dalam sistem monitoring multi-wan.', 'info');
}

async function confirmExitApplication() {
  const modal = document.getElementById('exitConfirmModal');
  if (modal) modal.classList.add('hidden');

  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {}

  localStorage.removeItem('multiwan_user');
  updateUserAuthUI();
  showToast('Keluar Berhasil', 'Anda telah keluar dari aplikasi monitoring.', 'warning');
}

// ====================================================================
// 12. FITUR MULTI-WAN REAL-TIME & PRODUCTION SCRIPT GENERATOR
// ====================================================================

let currentScriptTab = 'mikrotik';
let currentMikrotikScript = '';
let currentOpenWrtConfig = '';

async function initScriptGeneratorView() {
  populateOpenWrtSelect();
  if (currentScriptTab === 'mikrotik') {
    await fetchMikrotikScript();
  } else {
    await loadOpenWrtConfigForSelected();
  }
}

function populateOpenWrtSelect() {
  const select = document.getElementById('openwrtRouterSelect');
  if (!select) return;
  const currentVal = select.value;
  const routers = Object.values(state.routers);
  if (routers.length === 0) return;

  select.innerHTML = routers.map(r => `
    <option value="${r.id}">${r.name} (${r.ip}) - ${r.location || 'Kampus'}</option>
  `).join('');
  if (currentVal && state.routers[currentVal]) {
    select.value = currentVal;
  }
}

async function switchScriptTab(tab) {
  currentScriptTab = tab;
  const btnMikrotik = document.getElementById('tabBtnMikrotik');
  const btnOpenwrt = document.getElementById('tabBtnOpenwrt');
  const selectWrapper = document.getElementById('openwrtRouterSelectWrapper');
  const downloadLabel = document.getElementById('btnDownloadScriptLabel');

  if (tab === 'mikrotik') {
    if (btnMikrotik) btnMikrotik.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
    if (btnOpenwrt) btnOpenwrt.className = 'px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/60';
    if (selectWrapper) selectWrapper.classList.add('hidden');
    if (downloadLabel) downloadLabel.textContent = 'Unduh .RSC MikroTik';
    await fetchMikrotikScript();
  } else {
    if (btnMikrotik) btnMikrotik.className = 'px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/60';
    if (btnOpenwrt) btnOpenwrt.className = 'px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 bg-cyan-500/20 text-cyan-300 border border-cyan-500/40';
    if (selectWrapper) selectWrapper.classList.remove('hidden');
    if (downloadLabel) downloadLabel.textContent = 'Unduh Config OpenWrt';
    populateOpenWrtSelect();
    await loadOpenWrtConfigForSelected();
  }
}

async function fetchMikrotikScript() {
  const codeEl = document.getElementById('scriptDisplayCode');
  if (!codeEl) return;
  codeEl.textContent = '# Memuat skrip konfigurasi MikroTik RouterOS v7 PCC 4-WAN...';
  try {
    const res = await fetch('/api/mikrotik/script');
    const data = await res.json();
    if (data.success && data.script) {
      currentMikrotikScript = data.script;
      codeEl.textContent = data.script;
    } else {
      codeEl.textContent = '# Gagal memuat skrip MikroTik.';
    }
  } catch (err) {
    codeEl.textContent = `# Error saat mengambil skrip: ${err.message}`;
  }
}

async function loadOpenWrtConfigForSelected() {
  const codeEl = document.getElementById('scriptDisplayCode');
  const select = document.getElementById('openwrtRouterSelect');
  if (!codeEl || !select) return;
  const routerId = select.value || Object.keys(state.routers)[0] || 'ea7500-01';
  codeEl.textContent = `# Memuat konfigurasi OpenWrt untuk ${routerId}...`;
  try {
    const res = await fetch(`/api/routers/${routerId}/openwrt-config`);
    const data = await res.json();
    if (data.success && data.config) {
      currentOpenWrtConfig = data.config;
      codeEl.textContent = data.config;
    } else {
      codeEl.textContent = '# Gagal memuat konfigurasi OpenWrt.';
    }
  } catch (err) {
    codeEl.textContent = `# Error saat mengambil konfigurasi: ${err.message}`;
  }
}

function downloadCurrentScript() {
  if (currentScriptTab === 'mikrotik') {
    window.location.href = '/api/mikrotik/script?format=text';
  } else {
    const select = document.getElementById('openwrtRouterSelect');
    const routerId = (select && select.value) ? select.value : 'ea7500-01';
    window.location.href = `/api/routers/${routerId}/openwrt-config?format=text`;
  }
}

async function copyCurrentScript() {
  const codeEl = document.getElementById('scriptDisplayCode');
  if (!codeEl) return;
  try {
    await navigator.clipboard.writeText(codeEl.textContent);
    showToast('Skrip Disalin', 'Skrip konfigurasi berhasil disalin ke clipboard sistem Anda.', 'success');
  } catch (err) {
    showToast('Gagal Salin', 'Gagal menyalin skrip secara otomatis.', 'error');
  }
}

function viewOpenWrtConfig(routerId) {
  switchNavTab('admin');
  switchScriptTab('openwrt');
  setTimeout(() => {
    const select = document.getElementById('openwrtRouterSelect');
    if (select) {
      select.value = routerId;
      loadOpenWrtConfigForSelected();
      select.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 150);
}

async function quickPingRouter(ip, name) {
  showToast('Menguji Ping', `Mengirim paket ICMP echo ke ${name} (${ip})...`, 'info');
  try {
    const res = await fetch('/api/probe/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: ip })
    });
    const result = await res.json();
    if (result.alive) {
      showToast('Koneksi Normal', `${name} (${ip}) merespon dalam ${result.time} ms. Internet reachability OK.`, 'success');
    } else {
      showToast('Ping RTO', `${name} (${ip}) tidak merespon (Host Unreachable).`, 'warning');
    }
  } catch (err) {
    showToast('Error Probe', `Gagal melakukan ping: ${err.message}`, 'error');
  }
}

async function runInstantInternetVerification() {
  const btn = document.getElementById('btnVerifyAllDashboard');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin text-xs"></i> <span>Menguji Akses 16 Router...</span>';
  }
  showToast('Verifikasi Multi-WAN', 'Memeriksa akses internet ke 16 router Linksys & gateway MikroTik...', 'info');

  try {
    const res = await fetch('/api/probe/verify-all', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      if (Array.isArray(result.results)) {
        result.results.forEach(r => {
          if (state.routers[r.id]) {
            state.routers[r.id].internetAccess = r.internetAccess;
            state.routers[r.id].status = r.status;
            state.routers[r.id].rttToMikrotik = r.rttToMikrotik;
          }
        });
      }
      renderRouterGrid();
      renderDashboardInternetTable();
      if (state.selectedTraceRouterId && state.routers[state.selectedTraceRouterId]) {
        updateInspectorMetrics(state.routers[state.selectedTraceRouterId]);
      }
      const count = result.summary.onlineRouters ?? result.summary.onlineCount ?? 16;
      showToast(
        'Verifikasi Sukses',
        `${count}/${result.summary.totalRouters || 16} Router Online & terhubung ke internet via 4 ISP Multi-WAN!`,
        'success'
      );
    } else {
      showToast('Verifikasi Gagal', result.message || 'Terjadi kesalahan sistem saat pengujian', 'error');
    }
  } catch (err) {
    showToast('Gagal Hubungi Server', err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// Daftarkan fungsi ke Window Scope
window.showToast = showToast;
window.openAuthModal = openAuthModal;
window.closeAuthModal = closeAuthModal;
window.switchAuthTab = switchAuthTab;
window.fillAdminCredentials = fillAdminCredentials;
window.handleLoginSubmit = handleLoginSubmit;
window.handleRegisterSubmit = handleRegisterSubmit;
window.promptExitApp = promptExitApp;
window.stayInApplication = stayInApplication;
window.confirmExitApplication = confirmExitApplication;
window.logoutFromAuthModal = logoutFromAuthModal;
window.switchLoggedInToLoginForm = switchLoggedInToLoginForm;
window.updateUserAuthUI = updateUserAuthUI;
window.handleMobileAuthClick = handleMobileAuthClick;
window.renderDashboardInternetTable = renderDashboardInternetTable;
window.runInstantInternetVerification = runInstantInternetVerification;
window.quickPingRouter = quickPingRouter;
window.viewOpenWrtConfig = viewOpenWrtConfig;
window.switchScriptTab = switchScriptTab;
window.loadOpenWrtConfigForSelected = loadOpenWrtConfigForSelected;
window.downloadCurrentScript = downloadCurrentScript;
window.copyCurrentScript = copyCurrentScript;
window.fetchMikrotikScript = fetchMikrotikScript;
