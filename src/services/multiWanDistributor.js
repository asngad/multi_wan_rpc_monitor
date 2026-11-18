/**
 * Multi-WAN Dynamic Internet Distributor & PCC Engine
 * Mendistribusikan lalu lintas 4 ISP (WAN, WAN1, WAN2, WAN3) ke MikroTik Core (10.27.42.1),
 * lalu mendistribusikannya ke seluruh router Linksys OpenWrt dan perangkat kampus secara real-time.
 */

const config = require('../config/default');

class MultiWanDistributor {
  constructor() {
    this.wanMap = new Map();
    this.routerStreamMap = new Map();
    this.initWanData();
  }

  initWanData() {
    config.wanInterfaces.forEach(w => {
      this.wanMap.set(w.id, {
        id: w.id,
        name: w.name,
        isp: w.isp,
        gateway: w.gateway,
        capacityMbps: w.capacityMbps,
        baselineLatencyMs: w.baselineLatencyMs,
        status: 'UP'
      });
    });
  }

  /**
   * Menghitung rasio alokasi dinamis PCC berdasarkan status kesehatan & kapasitas 4 WAN
   * @param {Array} currentWans Daftar status WAN real-time
   * @returns {Object} Rasio persentase per WAN ID
   */
  calculateDynamicPccDistribution(currentWans = []) {
    const activeWans = (currentWans.length ? currentWans : Array.from(this.wanMap.values()))
      .filter(w => w.status === 'UP');

    if (activeWans.length === 0) {
      return {
        'wan-citra': 0,
        'wan-indibiz': 0,
        'wan-starlink': 0,
        'wan-starlite': 0
      };
    }

    const totalActiveCapacity = activeWans.reduce((sum, w) => sum + w.capacityMbps, 0);
    const distribution = {
      'wan-citra': 0,
      'wan-indibiz': 0,
      'wan-starlink': 0,
      'wan-starlite': 0
    };

    activeWans.forEach(w => {
      distribution[w.id] = Math.round((w.capacityMbps / totalActiveCapacity) * 100);
    });

    // Koreksi pembulatan agar total = 100%
    const currentSum = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (currentSum > 0 && currentSum !== 100) {
      const primaryActive = activeWans[0].id;
      distribution[primaryActive] += (100 - currentSum);
    }

    return distribution;
  }

  /**
   * Menentukan alokasi jalur internet keluar (Egress Route) untuk router tertentu
   * menggunakan simulasi hashing PCC (src-ip & src-port hashing)
   * @param {Object} router Objek router
   * @param {Array} currentWans Status 4 WAN saat ini
   * @returns {Object} Status internet & rincian routing PCC
   */
  evaluateRouterInternetAccess(router, currentWans = []) {
    const wans = currentWans.length ? currentWans : Array.from(this.wanMap.values());
    const upWans = wans.filter(w => w.status === 'UP');
    const pccDistribution = this.calculateDynamicPccDistribution(wans);

    // Jika seluruh WAN mati atau router dalam keadaan DOWN
    if (upWans.length === 0 || router.status === 'DOWN') {
      return {
        status: 'OFFLINE',
        verified: false,
        activeGateway: '10.27.42.1 (MikroTik CHR)',
        primaryWanId: null,
        primaryWanName: 'TIDAK TERHUBUNG',
        primaryWanIp: '-',
        routingMark: 'NO_ROUTE',
        pccStream: 'None',
        natGateway: '10.27.42.1',
        internetLatencyMs: 999,
        dnsTarget: '8.8.8.8',
        dnsStatus: 'UNREACHABLE',
        wanDistribution: pccDistribution,
        failoverActive: false,
        summary: `Akses internet terputus pada ${router.name} (${router.ip})`,
        lastChecked: Date.now()
      };
    }

    // Hash IP address dan router ID untuk penentuan alur default PCC
    // Di MikroTik asli: per-connection-classifier=both-addresses-and-ports:4/X
    const ipDigits = (router.ip || '10.0.0.1').replace(/[^0-9]/g, '');
    const hashVal = ipDigits.split('').reduce((acc, d) => acc + parseInt(d, 10), 0);
    const preferredIndex = hashVal % wans.length;
    let assignedWan = wans[preferredIndex];

    let failoverActive = false;
    // Jika WAN yang ditugaskan sedang DOWN -> lakukan AUTO-FAILOVER ke WAN aktif pertama
    if (assignedWan.status !== 'UP') {
      assignedWan = upWans[0];
      failoverActive = true;
    }

    // Mapping routing mark MikroTik
    const routingMarks = {
      'wan-citra': { mark: 'to_WAN', pcc: '4/0', color: '#06b6d4' },
      'wan-indibiz': { mark: 'to_WAN1', pcc: '4/1', color: '#ef4444' },
      'wan-starlink': { mark: 'to_WAN2', pcc: '4/2', color: '#a855f7' },
      'wan-starlite': { mark: 'to_WAN3', pcc: '4/3', color: '#10b981' }
    };

    const routingMeta = routingMarks[assignedWan.id] || { mark: 'to_WAN', pcc: '4/0', color: '#06b6d4' };

    // Total latensi internet end-to-end: Latensi Router-ke-MikroTik + Latensi WAN-ke-Internet
    const rttToMikrotik = router.rttToMikrotik || 1.2;
    const wanLatency = assignedWan.rtt || assignedWan.baselineLatencyMs || 10;
    const totalInternetLatency = Number((rttToMikrotik + wanLatency).toFixed(1));

    return {
      status: 'ONLINE',
      verified: true,
      activeGateway: '10.27.42.1 (MikroTik CHR)',
      primaryWanId: assignedWan.id,
      primaryWanName: assignedWan.name,
      primaryWanIp: assignedWan.gateway,
      routingMark: routingMeta.mark,
      pccStream: `both-addresses-and-ports:${routingMeta.pcc}`,
      pccColor: routingMeta.color,
      natGateway: '10.27.42.1 (Masquerade)',
      internetLatencyMs: totalInternetLatency,
      dnsTarget: '8.8.8.8 (Google DNS)',
      dnsStatus: 'REACHABLE',
      wanDistribution: pccDistribution,
      failoverActive,
      summary: failoverActive 
        ? `Jalur utama failover dialihkan ke ${assignedWan.name} (${assignedWan.gateway})`
        : `Terkoneksi normal via MikroTik PCC ➔ ${assignedWan.name} (${assignedWan.gateway})`,
      lastChecked: Date.now()
    };
  }

  /**
   * Menghasilkan script MikroTik RouterOS v7 lengkap untuk Weighted PCC 4-WAN
   * Berdasarkan data IP nyata pengguna dan rasio kapasitas bandwidth:
   * WAN Citra (100M, 18%) : WAN1 Indibiz (100M, 18%) : WAN2 Starlink (220M, 36%) : WAN3 Starlite (150M, 27%)
   */
  generateMikrotikPccScript() {
    return `# ====================================================================
# SCRIPT KONFIGURASI MIKROTIK ROUTEROS v7 - LOAD BALANCING PCC 4-WAN
# Universitas Nahdlatul Ulama Al Ghazali (UNUGHA) Cilacap
# Weighted Bandwidth Proportional (100M : 100M : 220M : 150M)
# Dihasilkan otomatis oleh Multi-WAN RPC Monitoring Engine
# ====================================================================

/log info message="=== Memulai Konfigurasi Weighted PCC 4-WAN UNUGHA ==="

# --------------------------------------------------------------------
# 1. Konfigurasi Antarmuka LAN & Bridge Kampus
# --------------------------------------------------------------------
/interface bridge add name=bridge-LAN comment="Bridge Distribusi Kampus UNUGHA"
/interface bridge set bridge-LAN arp=proxy-arp comment="Aktifkan Proxy-ARP agar seluruh subnet router bisa jangkau gateway 10.27.42.1"
/interface bridge port add bridge=bridge-LAN interface=eth6-hab1 comment="Port Trunk Downlink ke 012-SW-Rack G11"
/ip address add address=10.27.42.1/24 interface=bridge-LAN comment="Gateway Core MikroTik CHR"

# --------------------------------------------------------------------
# 2. Konfigurasi IP 4 Jalur WAN ke Ruijie Gateway-LB / Modem ISP
# --------------------------------------------------------------------
/ip address add address=192.168.113.2/24 interface=ether1 comment="WAN - Citra Dedicated Fiber (100 Mbps)"
/ip address add address=100.113.241.46/24 interface=ether2 comment="WAN1 - Indibiz Telkom Enterprise (100 Mbps)"
/ip address add address=192.168.250.2/24 interface=ether3 comment="WAN2 - Starlink High-Speed Satellite (220 Mbps)"
/ip address add address=192.168.1.2/24 interface=ether4 comment="WAN3 - Starlite Metro Fiber (150 Mbps)"

# --------------------------------------------------------------------
# 3. Routing Tables untuk Masing-Masing ISP (RouterOS v7)
# --------------------------------------------------------------------
/routing table add name=to_WAN fib
/routing table add name=to_WAN1 fib
/routing table add name=to_WAN2 fib
/routing table add name=to_WAN3 fib

# --------------------------------------------------------------------
# 4. RECURSIVE ROUTING FAILOVER (Deteksi Internet Nyata via DNS Publik)
# Mencegah rute tetap aktif jika modem ON tetapi kabel ISP putus
# --------------------------------------------------------------------
/ip route
# Target DNS per-WAN (Scope=10)
add dst-address=8.8.8.8/32 gateway=192.168.113.1 scope=10 comment="Host Check DNS Citra (8.8.8.8)"
add dst-address=1.1.1.1/32 gateway=100.113.241.1 scope=10 comment="Host Check DNS Indibiz (1.1.1.1)"
add dst-address=9.9.9.9/32 gateway=192.168.250.1 scope=10 comment="Host Check DNS Starlink (9.9.9.9)"
add dst-address=208.67.222.222/32 gateway=192.168.1.1 scope=10 comment="Host Check DNS Starlite (208.67.222.222)"

# Rute Tabel Khusus dengan Recursive Target-Scope=11
add dst-address=0.0.0.0/0 gateway=8.8.8.8 check-gateway=ping distance=1 target-scope=11 routing-table=to_WAN comment="Recursive WAN Citra"
add dst-address=0.0.0.0/0 gateway=1.1.1.1 check-gateway=ping distance=1 target-scope=11 routing-table=to_WAN1 comment="Recursive WAN1 Indibiz"
add dst-address=0.0.0.0/0 gateway=9.9.9.9 check-gateway=ping distance=1 target-scope=11 routing-table=to_WAN2 comment="Recursive WAN2 Starlink"
add dst-address=0.0.0.0/0 gateway=208.67.222.222 check-gateway=ping distance=1 target-scope=11 routing-table=to_WAN3 comment="Recursive WAN3 Starlite"

# Default Route Failover Cadangan pada Main Table
add dst-address=0.0.0.0/0 gateway=8.8.8.8 check-gateway=ping distance=1 target-scope=11 comment="Default Primary WAN Citra"
add dst-address=0.0.0.0/0 gateway=1.1.1.1 check-gateway=ping distance=2 target-scope=11 comment="Default Backup WAN1 Indibiz"
add dst-address=0.0.0.0/0 gateway=9.9.9.9 check-gateway=ping distance=3 target-scope=11 comment="Default Backup WAN2 Starlink"
add dst-address=0.0.0.0/0 gateway=208.67.222.222 check-gateway=ping distance=4 target-scope=11 comment="Default Backup WAN3 Starlite"

# --------------------------------------------------------------------
# 5. FIREWALL MANGLE: WEIGHTED PCC (RASIO 2 : 2 : 4 : 3 = 11 STREAM)
# Sesuai kapasitas: 100M (18%) : 100M (18%) : 220M (36%) : 150M (27%)
# --------------------------------------------------------------------
/ip firewall mangle
# Pengecualian Subnet Lokal (Agar traffic antar router kampus tidak di-load balance)
add chain=prerouting dst-address=10.0.0.0/8 action=accept comment="Accept Subnet Lokal Kampus"
add chain=prerouting dst-address=192.168.0.0/16 action=accept comment="Accept Private Subnets"

# TCP MSS Clamping (Mencegah MTU Blackhole pada Starlink & Fiber)
add chain=forward protocol=tcp tcp-flags=syn action=change-mss new-mss=clamp-to-pmtu comment="Clamp TCP MSS to PMTU"

# Sticky Session untuk Layanan Perbankan & SIAKAD (Port 443 / HTTPS)
# Mempertahankan session agar tidak logout sendiri saat pindah IP
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/0 action=mark-connection new-connection-mark=WAN_conn passthrough=yes comment="HTTPS Sticky Citra 1/2"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/1 action=mark-connection new-connection-mark=WAN_conn passthrough=yes comment="HTTPS Sticky Citra 2/2"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/2 action=mark-connection new-connection-mark=WAN1_conn passthrough=yes comment="HTTPS Sticky Indibiz 1/2"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/3 action=mark-connection new-connection-mark=WAN1_conn passthrough=yes comment="HTTPS Sticky Indibiz 2/2"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/4 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="HTTPS Sticky Starlink 1/4"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/5 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="HTTPS Sticky Starlink 2/4"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/6 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="HTTPS Sticky Starlink 3/4"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/7 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="HTTPS Sticky Starlink 4/4"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/8 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="HTTPS Sticky Starlite 1/3"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/9 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="HTTPS Sticky Starlite 2/3"
add chain=prerouting in-interface=bridge-LAN protocol=tcp dst-port=443 connection-state=new per-connection-classifier=src-address:11/10 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="HTTPS Sticky Starlite 3/3"

# Weighted PCC untuk Seluruh Trafik Baru (both-addresses-and-ports: 11 Stream)
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/0 action=mark-connection new-connection-mark=WAN_conn passthrough=yes comment="PCC Citra 100M (Stream 0/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/1 action=mark-connection new-connection-mark=WAN_conn passthrough=yes comment="PCC Citra 100M (Stream 1/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/2 action=mark-connection new-connection-mark=WAN1_conn passthrough=yes comment="PCC Indibiz 100M (Stream 2/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/3 action=mark-connection new-connection-mark=WAN1_conn passthrough=yes comment="PCC Indibiz 100M (Stream 3/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/4 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="PCC Starlink 220M (Stream 4/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/5 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="PCC Starlink 220M (Stream 5/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/6 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="PCC Starlink 220M (Stream 6/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/7 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="PCC Starlink 220M (Stream 7/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/8 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="PCC Starlite 150M (Stream 8/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/9 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="PCC Starlite 150M (Stream 9/11)"
add chain=prerouting in-interface=bridge-LAN connection-state=new connection-mark=no-mark per-connection-classifier=both-addresses-and-ports:11/10 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="PCC Starlite 150M (Stream 10/11)"

# Routing Mark berdasarkan Connection Mark
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN_conn action=mark-routing new-routing-mark=to_WAN passthrough=no
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN1_conn action=mark-routing new-routing-mark=to_WAN1 passthrough=no
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN2_conn action=mark-routing new-routing-mark=to_WAN2 passthrough=no
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN3_conn action=mark-routing new-routing-mark=to_WAN3 passthrough=no

# --------------------------------------------------------------------
# 6. FIREWALL FILTER (INPUT PROTECTION & FASTTRACK BYPASS)
# --------------------------------------------------------------------
/ip firewall filter
add chain=input in-interface=bridge-LAN action=accept comment="Allow all LAN clients to Gateway 10.27.42.1"
add chain=input protocol=icmp action=accept comment="Allow ICMP Ping to Gateway 10.27.42.1"
add chain=forward action=fasttrack-connection connection-state=established,related connection-mark=no-mark comment="Fasttrack only unmarked traffic"

# --------------------------------------------------------------------
# 7. IP FIREWALL NAT: MASQUERADE KE SEMUA PORT WAN
# --------------------------------------------------------------------
/ip firewall nat
add chain=srcnat out-interface=ether1 action=masquerade comment="NAT WAN Citra"
add chain=srcnat out-interface=ether2 action=masquerade comment="NAT WAN1 Indibiz"
add chain=srcnat out-interface=ether3 action=masquerade comment="NAT WAN2 Starlink"
add chain=srcnat out-interface=ether4 action=masquerade comment="NAT WAN3 Starlite"

# --------------------------------------------------------------------
# 8. QUALITY OF SERVICE (QoS): PCQ (PER CONNECTION QUEUE) UNTUK KLIEN
# Menjamin keadilan bandwidth agar tidak ada router/klien yang mendominasi
# --------------------------------------------------------------------
/queue type
add name=PCQ-Download kind=pcq pcq-classifier=dst-address pcq-rate=25M pcq-total-limit=4000
add name=PCQ-Upload kind=pcq pcq-classifier=src-address pcq-rate=10M pcq-total-limit=4000

/queue tree
add name="Total-Download-Kampus" parent=bridge-LAN max-limit=550M
add name="PCQ-Download-Clients" parent="Total-Download-Kampus" queue=PCQ-Download priority=4
add name="Total-Upload-Kampus" parent=global max-limit=200M
add name="PCQ-Upload-Clients" parent="Total-Upload-Kampus" queue=PCQ-Upload priority=4

# --------------------------------------------------------------------
# 9. STATIC IP LEASES UNTUK 16 ROUTER LINKSYS OPENWRT EA7500
# --------------------------------------------------------------------
/ip dhcp-server lease
add address=10.0.2.10 comment="GD-BEM01 (Gedung BEM Lt 1)" mac-address=C4:41:1E:02:10:A1
add address=10.27.22.45 comment="Perpus-Atas (Perpustakaan Lt 3)" mac-address=C4:41:1E:02:20:A2
add address=10.0.3.10 comment="Biro1-B (Biro Umum 1B)" mac-address=C4:41:1E:03:10:B1
add address=10.0.3.11 comment="Biro1A (Biro Akademik 1A)" mac-address=C4:41:1E:03:11:B2
add address=10.27.23.23 comment="Biro1 (Biro Keuangan)" mac-address=C4:41:1E:03:12:B3
add address=10.27.23.17 comment="FMIKOM (Fakultas MIKOM)" mac-address=C4:41:1E:03:20:B4
add address=10.0.3.30 comment="AP-Rektorat (Ruang Pimpinan)" mac-address=C4:41:1E:03:30:B5
add address=10.27.51.12 comment="GD1-LT1 (Gedung D Lt 1)" mac-address=C4:41:1E:04:01:C1
add address=10.0.4.5 comment="A5 (Kelas A-5)" mac-address=C4:41:1E:04:05:C2
add address=10.0.4.6 comment="A6 (Kelas A-6)" mac-address=C4:41:1E:04:06:C3
add address=10.0.4.7 comment="A7 (Kelas A-7)" mac-address=C4:41:1E:04:07:C4
add address=10.0.4.8 comment="A8 (Kelas A-8)" mac-address=C4:41:1E:04:08:C5
add address=10.27.41.12 comment="LabKOM (Lab Komputer Utama)" mac-address=C4:41:1E:05:01:D1
add address=10.27.43.81 comment="GH2-LT2 (Gedung H Lt 2)" mac-address=C4:41:1E:05:20:D2
add address=10.0.5.30 comment="GH2-LT3 (Gedung H Lt 3)" mac-address=C4:41:1E:05:30:D3
add address=10.27.43.80 comment="GH2-RDown (Gedung H Sayap Bawah)" mac-address=C4:41:1E:05:40:D4

/log info message="=== Konfigurasi Weighted PCC 4-WAN UNUGHA Berhasil Diaktifkan ==="
`;
  }

  /**
   * Menghasilkan konfigurasi OpenWrt (/etc/config/network) untuk Router Linksys EA7500
   * @param {Object} router Objek router target
   */
  generateOpenWrtConfig(router) {
    const cleanIp = (router.ip || '10.27.22.45/24').split('/')[0];
    return `# Konfigurasi OpenWrt /etc/config/network untuk ${router.name} (${router.model})
# Gateway default diarahkan ke Core MikroTik CHR 10.27.42.1 (PCC Multi-WAN)

config interface 'loopback'
	option device 'lo'
	option proto 'static'
	option ipaddr '127.0.0.1'
	option netmask '255.0.0.0'

config interface 'lan'
	option device 'br-lan'
	option proto 'static'
	option ipaddr '${cleanIp}'
	option netmask '255.255.255.0'
	option gateway '10.27.42.1'
	list dns '10.27.42.1'
	list dns '8.8.8.8'
	list dns '1.1.1.1'

config interface 'wan'
	option device 'eth0'
	option proto 'static'
	option ipaddr '${cleanIp}'
	option netmask '255.255.255.0'
	option gateway '10.27.42.1'
	list dns '10.27.42.1'
	list dns '8.8.8.8'
`;
  }
}

module.exports = new MultiWanDistributor();
