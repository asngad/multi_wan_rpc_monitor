const multiWanDistributor = require('../src/services/multiWanDistributor');
const wanStore = require('../src/services/wanStore');

describe('Multi-WAN Real-Time Distributor & Internet Routing', () => {
  const mockWans = [
    { id: 'wan-citra', name: 'WAN (CitraNet)', ip: '192.168.113', capacityMbps: 100, status: 'UP' },
    { id: 'wan-indibiz', name: 'WAN1 (Indibiz Telkom)', ip: '100.113.241.46', capacityMbps: 100, status: 'UP' },
    { id: 'wan-starlink', name: 'WAN2 (Starlink Business)', ip: '192.168.250.2', capacityMbps: 220, status: 'UP' },
    { id: 'wan-starlite', name: 'WAN3 (Starlink Residential)', ip: '192.168.1.2', capacityMbps: 150, status: 'UP' },
  ];

  test('calculateDynamicPccDistribution returns normalized percentage and ratios', () => {
    const pcc = multiWanDistributor.calculateDynamicPccDistribution(mockWans);
    expect(pcc['wan-citra']).toBeDefined();
    expect(pcc['wan-starlink']).toBeGreaterThan(pcc['wan-citra']);
    const sum = Object.values(pcc).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  test('evaluateRouterInternetAccess routes router through active WAN with failover', () => {
    const router = {
      id: 'ea7500-01',
      name: 'GD-BEM01',
      ip: '10.27.22.45',
      status: 'UP'
    };

    const access = multiWanDistributor.evaluateRouterInternetAccess(router, mockWans);
    expect(access.status).toBe('ONLINE');
    expect(access.verified).toBe(true);
    expect(access.natGateway).toContain('10.27.42.1');
    expect(access.routingMark).toMatch(/to_WAN/);
    expect(access.dnsTarget).toContain('8.8.8.8');
    expect(access.failoverActive).toBe(false);
  });

  test('evaluateRouterInternetAccess switches to failover when assigned WAN is DOWN', () => {
    // 10.27.22.45 hash index is 3 (wan-starlite). If wan-starlite is DOWN, failover is triggered.
    const degradedWans = mockWans.map(w => w.id === 'wan-starlite' ? { ...w, status: 'DOWN' } : w);
    const router = {
      id: 'ea7500-01',
      name: 'GD-BEM01',
      ip: '10.27.22.45',
      status: 'UP'
    };

    const access = multiWanDistributor.evaluateRouterInternetAccess(router, degradedWans);
    expect(access.status).toBe('ONLINE');
    expect(access.failoverActive).toBe(true);
    expect(access.primaryWanId).not.toBe('wan-starlite');
  });

  test('generateMikrotikPccScript creates valid RouterOS v7 syntax', () => {
    const script = multiWanDistributor.generateMikrotikPccScript();
    expect(script).toContain('/routing table add name=to_WAN fib');
    expect(script).toContain('/ip firewall mangle');
    expect(script).toContain('per-connection-classifier=both-addresses-and-ports:4/');
    expect(script).toContain('/ip firewall nat');
    expect(script).toContain('action=masquerade');
    expect(script).toContain('10.27.42.1');
    expect(script).toContain('10.27.22.45');
    expect(script).toContain('10.27.51.12');
    expect(script).toContain('10.27.41.12');
  });

  test('generateOpenWrtConfig generates correct EA7500 network file', () => {
    const router = wanStore.getRouter('ea7500-01');
    const config = multiWanDistributor.generateOpenWrtConfig(router);
    const cleanIp = router.ip.split('/')[0];
    expect(config).toContain("config interface 'lan'");
    expect(config).toContain(`option ipaddr '${cleanIp}'`);
    expect(config).toContain("option gateway '10.27.42.1'");
    expect(config).toContain("list dns '8.8.8.8'");
  });
});
