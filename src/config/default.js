/**
 * Konfigurasi Sistem Monitoring Multi-WAN & Hierarki Jaringan Kampus UNUGHA
 * Topologi: 4 WAN (Citra, Indibiz, Starlink, Starlite) -> Load Balancing -> MikroTik Core -> 16 Router Linksys EA7500
 */

module.exports = {
  server: {
    port: process.env.PORT || 4000,
    rpcEndpoint: '/rpc',
    telemetryIntervalMs: 1000 // Frekuensi telemetri real-time 1 detik
  },

  // 1. TIER 1: LAPISAN MULTI-WAN / ISP
  wanInterfaces: [
    {
      id: 'wan-citra',
      name: 'WAN (Citranet Fiber)',
      isp: 'Citra (Citranet Dedicated)',
      gateway: '192.168.113',
      dnsTarget: '8.8.8.8',
      capacityMbps: 100,
      baselineLatencyMs: 6,
      baselineLossPercent: 0.05,
      role: 'PRIMARY_DEDICATED',
      color: '#06b6d4' // Cyan
    },
    {
      id: 'wan-indibiz',
      name: 'WAN 1 (Indibiz Enterprise)',
      isp: 'Indibiz (Telkom Enterprise)',
      gateway: '100.113.241.46',
      dnsTarget: '1.1.1.1',
      capacityMbps: 100,
      baselineLatencyMs: 14,
      baselineLossPercent: 0.1,
      role: 'LOAD_BALANCE_PRIMARY',
      color: '#ef4444' // Red Indibiz
    },
    {
      id: 'wan-starlink',
      name: 'WAN 2 (Starlink Satellite)',
      isp: 'Starlink (SpaceX LEO Satellite)',
      gateway: '192.168.250.2',
      dnsTarget: '9.9.9.9',
      capacityMbps: 150,
      baselineLatencyMs: 32,
      baselineLossPercent: 0.25,
      role: 'HIGH_SPEED_BURST',
      color: '#a855f7' // Purple Satellite
    },
    {
      id: 'wan-starlite',
      name: 'WAN 3 (Starlite Metro)',
      isp: 'Starlite (Starlight Metro Fiber)',
      gateway: '192.168.1.2',
      dnsTarget: '208.67.222.222',
      capacityMbps: 50,
      baselineLatencyMs: 16,
      baselineLossPercent: 0.1,
      role: 'FAILOVER_BACKUP',
      color: '#10b981' // Emerald
    }
  ],

  // 2. TIER 2: LOAD BALANCING ENGINE
  loadBalancer: {
    method: 'MikroTik PCC (Per Connection Classifier)',
    classifier: 'src-address-and-port to dst-address-and-port',
    ratio: '1:1:1:1 (Dynamic Auto-Failover)',
    healthCheckIntervalSeconds: 3,
    status: 'OPTIMAL'
  },

  // 3. TIER 3: MIKROTIK CORE ROUTER GATEWAY & HARDWARE INFRASTRUCTURE
  gatewayLB: {
    id: 'gateway-lb',
    name: 'Gateway-LB',
    model: 'Ruijie RG1510XS',
    ip: '10.255.0.1/30',
    uplinkPorts: ['WAN', 'WAN1', 'WAN2', 'WAN3'],
    downlinkPort: 'LAN0',
    role: 'HARDWARE_LOAD_BALANCER'
  },

  virtualDevice: {
    id: 'virtual-device',
    name: 'Virtual device',
    model: 'MikroTik Cloud Hosted Router (CHR)',
    ip: '10.27.42.1/24',
    uplinkPort: 'Uplink Port (from Gateway-LB LAN0)',
    downlinkPort: 'eth6-hab1 (to 012-SW-Rack G11)',
    role: 'CORE_PCC_ROUTER_GATEWAY'
  },

  coreSwitch: {
    id: '012-sw-rack',
    name: '012-SW-Rack',
    model: 'Ruijie NBS5100-24GT4SFP-V2',
    ip: '10.0.0.2/24',
    uplinkPort: 'G11 (from eth6-hab1)',
    branches: [
      { port: 'G10', target: 'PerpusNew-DTB', label: 'Perpustakaan & Rektorat' },
      { port: 'G17', target: 'GD1-LT1', label: 'Gedung D & Akses Kelas' },
      { port: 'G20', target: 'LabKOM', label: 'Lab Komputer & Gedung H' }
    ]
  },

  distSwitches: [
    { id: 'perpusnew-dtb', name: 'PerpusNew-DTB', model: 'Managed Distribution Switch', ip: '10.0.1.2/24', uplink: '012-SW-Rack [Port G10 ➔ bridge1-...]' },
    { id: 'sw-perpus', name: 'SW-Perpus', model: 'Ruijie ES208GC', ip: '10.0.2.1/24', uplink: 'PerpusNew-DTB [Port 1 ➔ Port 8]' },
    { id: 'sw-rektorat', name: 'SW-Rektorat', model: 'Ruijie ES208GC', ip: '10.0.3.1/24', uplink: 'PerpusNew-DTB [Port 2 ➔ Port 8]' },
    { id: 'sw-labkom', name: 'LabKOM', model: 'Switch Distribusi Lab (Unmanaged)', ip: '10.27.41.12/24', uplink: '012-SW-Rack [Port G20 ➔ WAN]' }
  ],

  mikrotikCore: {
    id: 'core-mikrotik',
    name: 'Virtual device (MikroTik CHR Gateway)',
    hardwareModel: 'MikroTik Cloud Hosted Router (CHR)',
    ip: '10.27.42.1',
    role: 'CORE_PCC_ROUTER_GATEWAY',
    osVersion: 'RouterOS v7.15.2 CHR',
    uptimeHours: 342,
    cpuCores: 8,
    baselineCpuUsagePercent: 18,
    baselineMemoryUsagePercent: 32,
    totalMemoryMb: 4096,
    maxConcurrentConnections: 100000
  },

  // 4. TIER 4: SELURUH ROUTER LINKSYS OPENWRT EA7500 & AKSES KAMPUS UNUGHA (PERSIS GAMBAR TOPOLOGI)
  accessRouters: [
    // --- CABANG 1: PERPUSTAKAAN & REKTORAT (via Port G10 -> PerpusNew-DTB) ---
    { 
      id: 'ea7500-01', 
      slug: 'gd-bem01',
      name: 'GD-BEM01', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Gedung BEM Lt. 1', 
      ip: '10.0.2.10/24', 
      mac: 'C4:41:1E:02:10:A1', 
      uplinkPath: 'SW-Perpus [Port 2] ➔ WAN', 
      downlinkPath: 'Port 2 ➔ Perpus-Atas [WAN]', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (10.0.0.2:Port G10)', 'PerpusNew-DTB (Port 1)', 'SW-Perpus (Port 2)', 'GD-BEM01 (10.0.2.10)'],
      maxClients: 64, baselineClients: 24 
    },
    { 
      id: 'ea7500-02', 
      slug: 'perpus-atas',
      name: 'Perpus-Atas', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Perpustakaan Gedung Atas', 
      ip: '10.27.22.45/24', 
      mac: 'C4:41:1E:02:20:A2', 
      uplinkPath: 'GD-BEM01 [Port 2] ➔ WAN', 
      downlinkPath: 'Area Baca Pemustaka', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G10)', 'PerpusNew-DTB (Port 1)', 'SW-Perpus', 'GD-BEM01 (Port 2)', 'Perpus-Atas (10.27.22.45)'],
      maxClients: 64, baselineClients: 42 
    },
    { 
      id: 'ea7500-03', 
      slug: 'biro1-b',
      name: 'Biro1-B', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Biro Administrasi Umum 1B', 
      ip: '10.0.3.10/24', 
      mac: 'C4:41:1E:03:10:B1', 
      uplinkPath: 'SW-Rektorat [Port 2] ➔ WAN', 
      downlinkPath: 'Pelayanan Kantor Biro 1B', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G10)', 'PerpusNew-DTB (Port 2)', 'SW-Rektorat (Port 2)', 'Biro1-B (10.0.3.10)'],
      maxClients: 64, baselineClients: 22 
    },
    { 
      id: 'ea7500-04', 
      slug: 'biro1a',
      name: 'Biro1A', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Biro Administrasi Akademik 1A', 
      ip: '10.0.3.11/24', 
      mac: 'C4:41:1E:03:11:B2', 
      uplinkPath: 'SW-Rektorat [Port 5] ➔ WAN', 
      downlinkPath: 'Pelayanan Akademik BAAK', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G10)', 'PerpusNew-DTB (Port 2)', 'SW-Rektorat (Port 5)', 'Biro1A (10.0.3.11)'],
      maxClients: 64, baselineClients: 28 
    },
    { 
      id: 'ea7500-05', 
      slug: 'biro1',
      name: 'Biro1', 
      model: 'Linksys OpenWrt EA7500 v2 (AC1900)', 
      location: 'Biro Keuangan & SDM Pusat', 
      ip: '10.27.23.23/24', 
      mac: 'C4:41:1E:03:12:B3', 
      uplinkPath: 'SW-Rektorat [Port 6] ➔ WAN', 
      downlinkPath: 'Downlink Port ➔ FMIKOM [WAN]', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G10)', 'PerpusNew-DTB (Port 2)', 'SW-Rektorat (Port 6)', 'Biro1 (10.27.23.23)'],
      maxClients: 64, baselineClients: 30 
    },
    { 
      id: 'ea7500-06', 
      slug: 'fmikom',
      name: 'FMIKOM', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Fakultas MIKOM (Dosen & TU)', 
      ip: '10.27.23.17/24', 
      mac: 'C4:41:1E:03:20:B4', 
      uplinkPath: 'Biro1 [Downlink] ➔ WAN', 
      downlinkPath: 'Ruang Dosen & Lab FMIKOM', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G10)', 'PerpusNew-DTB (Port 2)', 'SW-Rektorat', 'Biro1', 'FMIKOM (10.27.23.17)'],
      maxClients: 64, baselineClients: 48 
    },
    { 
      id: 'ea7500-07', 
      slug: 'ap-rektorat',
      name: 'AP-Rektorat', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Ruang Pimpinan & Rektorat', 
      ip: '10.0.3.30/24', 
      mac: 'C4:41:1E:03:30:B5', 
      uplinkPath: 'SW-Rektorat [Port 7] ➔ WAN', 
      downlinkPath: 'VIP Rektorat & Konferensi', 
      branchGroup: 'Perpus & Rektorat',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G10)', 'PerpusNew-DTB (Port 2)', 'SW-Rektorat (Port 7)', 'AP-Rektorat (10.0.3.30)'],
      maxClients: 64, baselineClients: 18 
    },

    // --- CABANG 2: GEDUNG D & KELAS A5-A8 (via Port G17 -> GD1-LT1) ---
    { 
      id: 'ea7500-08', 
      slug: 'gd1-lt1',
      name: 'GD1-LT1', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Gedung D Lt. 1', 
      ip: '10.27.51.12/24', 
      mac: 'C4:41:1E:04:01:C1', 
      uplinkPath: '012-SW-Rack [Port G17] ➔ WAN', 
      downlinkPath: 'port4 ➔ A5 [WAN]', 
      branchGroup: 'Gedung D & Kelas A',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (10.0.0.2:Port G17)', 'GD1-LT1 (10.27.51.12)'],
      maxClients: 64, baselineClients: 35 
    },
    { 
      id: 'ea7500-09', 
      slug: 'a5',
      name: 'A5', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Ruang Perkuliahan A-5', 
      ip: '10.0.4.5/24', 
      mac: 'C4:41:1E:04:05:C2', 
      uplinkPath: 'GD1-LT1 [port4] ➔ WAN', 
      downlinkPath: '5G Mesh Wireless ➔ A6 [WAN]', 
      branchGroup: 'Gedung D & Kelas A',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G17)', 'GD1-LT1 (port4)', 'A5 (10.0.4.5)'],
      maxClients: 64, baselineClients: 32 
    },
    { 
      id: 'ea7500-10', 
      slug: 'a6',
      name: 'A6', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Ruang Perkuliahan A-6', 
      ip: '10.0.4.6/24', 
      mac: 'C4:41:1E:04:06:C3', 
      uplinkPath: 'A5 [5G Mesh Wireless] ➔ WAN', 
      downlinkPath: '5G Mesh Wireless ➔ A7 [WAN]', 
      branchGroup: 'Gedung D & Kelas A',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G17)', 'GD1-LT1', 'A5 (5G)', 'A6 (10.0.4.6)'],
      maxClients: 64, baselineClients: 34 
    },
    { 
      id: 'ea7500-11', 
      slug: 'a7',
      name: 'A7', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Ruang Perkuliahan A-7', 
      ip: '10.0.4.7/24', 
      mac: 'C4:41:1E:04:07:C4', 
      uplinkPath: 'A6 [5G Mesh Wireless] ➔ WAN', 
      downlinkPath: '5G Mesh Wireless ➔ A8 [WAN]', 
      branchGroup: 'Gedung D & Kelas A',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G17)', 'GD1-LT1', 'A5', 'A6 (5G)', 'A7 (10.0.4.7)'],
      maxClients: 64, baselineClients: 30 
    },
    { 
      id: 'ea7500-12', 
      slug: 'a8',
      name: 'A8', 
      model: 'Linksys OpenWrt EA7500 (EW1200G-PRO)', 
      location: 'Ruang Perkuliahan A-8', 
      ip: '10.0.4.8/24', 
      mac: 'C4:41:1E:04:08:C5', 
      uplinkPath: 'A7 [5G Mesh Wireless] ➔ WAN', 
      downlinkPath: 'Area Wi-Fi Mahasiswa Kelas A-8', 
      branchGroup: 'Gedung D & Kelas A',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G17)', 'GD1-LT1', 'A5', 'A6', 'A7 (5G)', 'A8 (10.0.4.8)'],
      maxClients: 64, baselineClients: 26 
    },

    // --- CABANG 3: LAB KOMPUTER & GEDUNG H (via Port G20 -> LabKOM) ---
    { 
      id: 'ea7500-13', 
      slug: 'labkom',
      name: 'LabKOM', 
      model: 'Switch Distribusi Lab (Unmanaged)', 
      location: 'Lab Komputer & Jaringan Utama', 
      ip: '10.27.41.12/24', 
      mac: 'C4:41:1E:05:01:D1', 
      uplinkPath: '012-SW-Rack [Port G20] ➔ WAN', 
      downlinkPath: 'LAN2 ➔ GH2-LT2 [WAN]', 
      branchGroup: 'LabKOM & Gedung H',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G20)', 'LabKOM (10.27.41.12)'],
      maxClients: 64, baselineClients: 45 
    },
    { 
      id: 'ea7500-14', 
      slug: 'gh2-lt2',
      name: 'GH2-LT2', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Gedung H Lt. 2', 
      ip: '10.27.43.81/24', 
      mac: 'C4:41:1E:05:20:D2', 
      uplinkPath: 'LabKOM [LAN2] ➔ WAN', 
      downlinkPath: 'LAN3 ➔ GH2-LT3, Lan2 ➔ GH2-RDown', 
      branchGroup: 'LabKOM & Gedung H',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G20)', 'LabKOM (LAN2)', 'GH2-LT2 (10.27.43.81)'],
      maxClients: 64, baselineClients: 38 
    },
    { 
      id: 'ea7500-15', 
      slug: 'gh2-lt3',
      name: 'GH2-LT3', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Gedung H Lt. 3', 
      ip: '10.0.5.30/24', 
      mac: 'C4:41:1E:05:30:D3', 
      uplinkPath: 'GH2-LT2 [LAN3] ➔ WAN', 
      downlinkPath: 'Ruang Perkuliahan Gedung H Lt. 3', 
      branchGroup: 'LabKOM & Gedung H',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G20)', 'LabKOM', 'GH2-LT2 (LAN3)', 'GH2-LT3 (10.0.5.30)'],
      maxClients: 64, baselineClients: 34 
    },
    { 
      id: 'ea7500-16', 
      slug: 'gh2-rdown',
      name: 'GH2-RDown', 
      model: 'Linksys OpenWrt EA7500 / EA6200', 
      location: 'Gedung H Sayap Bawah', 
      ip: '10.27.43.80/24', 
      mac: 'C4:41:1E:05:40:D4', 
      uplinkPath: 'GH2-LT2 [Lan2] ➔ WAN', 
      downlinkPath: 'Area Wi-Fi Sayap Bawah Gedung H', 
      branchGroup: 'LabKOM & Gedung H',
      ispSupport: '4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)',
      traceRoute: ['4 WAN (WAN: 192.168.113, WAN1: 100.113.241.46, WAN2: 192.168.250.2, WAN3: 192.168.1.2)', 'Gateway-LB (10.255.0.1:LAN0)', 'Virtual device (MikroTik CHR:10.27.42.1)', '012-SW-Rack (Port G20)', 'LabKOM', 'GH2-LT2 (Lan2)', 'GH2-RDown (10.27.43.80)'],
      maxClients: 64, baselineClients: 25 
    }
  ],

  // 5. PARAMETER DETEKSI ANOMALI
  anomalyDetection: {
    ewma: {
      alpha: 0.2,
      minSamples: 5
    },
    zScore: {
      windowSize: 25,
      thresholdWarning: 2.0,
      thresholdCritical: 3.0
    },
    rules: {
      latencyMultiplierWarning: 1.8,
      latencyMultiplierCritical: 2.5,
      packetLossWarningPercent: 5.0,
      packetLossCriticalPercent: 15.0,
      flappingTogglesThreshold: 3,
      flappingWindowSeconds: 60,
      bandwidthSaturationPercent: 90.0,
      asymmetricLossDifferential: 12.0,
      starlinkRainFadeJitterMs: 18.0, // Starlink spesifik anomali cuaca / rain fade
      routerClientOverloadPercent: 85.0 // Linksys overload jika client > 85% kapasitas
    }
  }
};
