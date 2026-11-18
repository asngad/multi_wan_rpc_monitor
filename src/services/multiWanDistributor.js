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
   * Menghasilkan script MikroTik RouterOS v7 lengkap untuk PCC 4-WAN
   * Berdasarkan data IP nyata pengguna
   */
  generateMikrotikPccScript() {
    return `# ====================================================================
# SCRIPT KONFIGURASI MIKROTIK ROUTEROS v7 - LOAD BALANCING PCC 4-WAN
# Universitas Nahdlatul Ulama Al Ghazali (UNUGHA) Cilacap
# Dihasilkan otomatis oleh Multi-WAN RPC Monitoring Engine
# ====================================================================

/log info message="=== Memulai Konfigurasi PCC 4-WAN UNUGHA ==="

# 1. Konfigurasi Antarmuka LAN & Bridge Kampus
/interface bridge add name=bridge-LAN comment="Bridge Distribusi Kampus UNUGHA"
/ip address add address=10.27.42.1/24 interface=bridge-LAN comment="Gateway Core MikroTik CHR"

# 2. Konfigurasi IP 4 Jalur WAN ke Ruijie Gateway-LB
/ip address add address=192.168.113.2/24 interface=ether1 comment="WAN - Citra Dedicated Fiber (192.168.113)"
/ip address add address=100.113.241.46/24 interface=ether2 comment="WAN1 - Indibiz Telkom Enterprise"
/ip address add address=192.168.250.2/24 interface=ether3 comment="WAN2 - Starlink Satellite High Speed"
/ip address add address=192.168.1.2/24 interface=ether4 comment="WAN3 - Starlite Metro Fiber"

# 3. Routing Tables untuk Masing-Masing ISP
/routing table add name=to_WAN fib
/routing table add name=to_WAN1 fib
/routing table add name=to_WAN2 fib
/routing table add name=to_WAN3 fib

# 4. Default Gateway dengan Check-Gateway Ping (Auto Failover)
/ip route add dst-address=0.0.0.0/0 gateway=192.168.113.1 check-gateway=ping distance=1 routing-table=to_WAN comment="Route WAN Citra"
/ip route add dst-address=0.0.0.0/0 gateway=100.113.241.1 check-gateway=ping distance=1 routing-table=to_WAN1 comment="Route WAN1 Indibiz"
/ip route add dst-address=0.0.0.0/0 gateway=192.168.250.1 check-gateway=ping distance=1 routing-table=to_WAN2 comment="Route WAN2 Starlink"
/ip route add dst-address=0.0.0.0/0 gateway=192.168.1.1 check-gateway=ping distance=1 routing-table=to_WAN3 comment="Route WAN3 Starlite"

# Default Route Cadangan untuk Main Table
/ip route add dst-address=0.0.0.0/0 gateway=192.168.113.1,100.113.241.1,192.168.250.1,192.168.1.1 check-gateway=ping distance=1 comment="Main ECMP Gateway"

# 5. IP Firewall Mangle: PCC (Per Connection Classifier 4 Jalur)
/ip firewall mangle
# Pengecualian lalu lintas internal (Jangan di-load balance untuk antar subnet lokal)
add chain=prerouting dst-address=10.0.0.0/8 action=accept comment="Accept Local Subnets"
add chain=prerouting dst-address=192.168.0.0/16 action=accept comment="Accept Private Class C"

# Connection Tracking & Balancing 4-Stream (both-addresses-and-ports)
add chain=prerouting in-interface=bridge-LAN connection-state=new per-connection-classifier=both-addresses-and-ports:4/0 action=mark-connection new-connection-mark=WAN_conn passthrough=yes comment="PCC Stream 0 -> WAN"
add chain=prerouting in-interface=bridge-LAN connection-state=new per-connection-classifier=both-addresses-and-ports:4/1 action=mark-connection new-connection-mark=WAN1_conn passthrough=yes comment="PCC Stream 1 -> WAN1"
add chain=prerouting in-interface=bridge-LAN connection-state=new per-connection-classifier=both-addresses-and-ports:4/2 action=mark-connection new-connection-mark=WAN2_conn passthrough=yes comment="PCC Stream 2 -> WAN2"
add chain=prerouting in-interface=bridge-LAN connection-state=new per-connection-classifier=both-addresses-and-ports:4/3 action=mark-connection new-connection-mark=WAN3_conn passthrough=yes comment="PCC Stream 3 -> WAN3"

# Routing Mark berdasarkan Connection Mark
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN_conn action=mark-routing new-routing-mark=to_WAN passthrough=no
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN1_conn action=mark-routing new-routing-mark=to_WAN1 passthrough=no
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN2_conn action=mark-routing new-routing-mark=to_WAN2 passthrough=no
add chain=prerouting in-interface=bridge-LAN connection-mark=WAN3_conn action=mark-routing new-routing-mark=to_WAN3 passthrough=no

# 6. IP Firewall NAT: Masquerade ke Semua Port WAN
/ip firewall nat
add chain=srcnat out-interface=ether1 action=masquerade comment="NAT WAN Citra"
add chain=srcnat out-interface=ether2 action=masquerade comment="NAT WAN1 Indibiz"
add chain=srcnat out-interface=ether3 action=masquerade comment="NAT WAN2 Starlink"
add chain=srcnat out-interface=ether4 action=masquerade comment="NAT WAN3 Starlite"

# 7. Static IP Leases untuk 16 Router Linksys OpenWrt EA7500
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

/log info message="=== Konfigurasi PCC 4-WAN UNUGHA Berhasil Diaktifkan ==="
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
