const RpcServerModule = require('../src/rpc/rpcServer');
const wanStore = require('../src/services/wanStore');

describe('Pengujian Prosedur Remote RPC (JSON-RPC 2.0)', () => {
  let rpcModule;
  let jaysonServer;

  beforeEach(() => {
    wanStore.reset();
    rpcModule = new RpcServerModule();
    jaysonServer = rpcModule.server;
  });

  test('Memanggil prosedur pingRpc menghasilkan respons PONG', (done) => {
    const request = {
      jsonrpc: '2.0',
      method: 'pingRpc',
      id: 1
    };

    jaysonServer.call(request, (err, response) => {
      expect(err).toBeNull();
      expect(response.result).toBeDefined();
      expect(response.result.message).toBe('PONG');
      done();
    });
  });

  test('Memanggil prosedur ingestWANMetrics berhasil memperbarui telemetri', (done) => {
    const telemetry = {
      wanId: 'wan-citra',
      rtt: 6.2,
      jitter: 0.8,
      loss: 0.0,
      rxThroughput: 42.5,
      txThroughput: 14.2,
      status: 'UP'
    };

    const request = {
      jsonrpc: '2.0',
      method: 'ingestWANMetrics',
      params: telemetry,
      id: 2
    };

    jaysonServer.call(request, (err, response) => {
      expect(err).toBeNull();
      expect(response.result).toBeDefined();
      expect(response.result.status).toBe('ACK');
      expect(response.result.wanId).toBe('wan-citra');
      expect(response.result.healthScore).toBeGreaterThanOrEqual(90);

      // Verifikasi di wanStore
      const wan = wanStore.getWan('wan-citra');
      expect(wan.rtt).toBe(6.2);
      expect(wan.rxThroughput).toBe(42.5);
      done();
    });
  });

  test('Menolak panggilan ingestWANMetrics tanpa parameter wanId', (done) => {
    const request = {
      jsonrpc: '2.0',
      method: 'ingestWANMetrics',
      params: { rtt: 15 },
      id: 3
    };

    jaysonServer.call(request, (err, response) => {
      const errorObj = err ? (err.error || err) : (response && response.error);
      expect(errorObj).toBeDefined();
      expect(errorObj.code).toBe(-32602);
      done();
    });
  });

  test('Memanggil prosedur getWANStatus mengembalikan seluruh 4 interface dan agregat', (done) => {
    const request = {
      jsonrpc: '2.0',
      method: 'getWANStatus',
      id: 4
    };

    jaysonServer.call(request, (err, response) => {
      expect(err).toBeNull();
      expect(response.result.wans.length).toBe(4);
      expect(response.result.aggregate).toBeDefined();
      expect(response.result.aggregate.totalWans).toBe(4);
      done();
    });
  });

  test('Memanggil prosedur ingestRouterMetrics untuk Router Linksys EA7500', (done) => {
    const request = {
      jsonrpc: '2.0',
      method: 'ingestRouterMetrics',
      params: {
        id: 'ea7500-01',
        rttToMikrotik: 1.4,
        loss: 0.0,
        activeClients: 30,
        rxMbps: 14.5,
        txMbps: 4.2,
        status: 'UP'
      },
      id: 5
    };

    jaysonServer.call(request, (err, response) => {
      expect(err).toBeNull();
      expect(response.result).toBeDefined();
      expect(response.result.status).toBe('ACK');
      expect(response.result.routerId).toBe('ea7500-01');
      expect(response.result.healthScore).toBeGreaterThanOrEqual(90);
      done();
    });
  });

  test('Memanggil prosedur getTopologyStatus mengembalikan 4-tier hierarki jaringan', (done) => {
    const request = {
      jsonrpc: '2.0',
      method: 'getTopologyStatus',
      id: 6
    };

    jaysonServer.call(request, (err, response) => {
      expect(err).toBeNull();
      expect(response.result.tier1_wans.length).toBe(4);
      expect(response.result.tier2_loadbalancer).toBeDefined();
      expect(response.result.tier3_core.name).toContain('MikroTik');
      expect(response.result.tier4_access_routers.length).toBe(16);
      done();
    });
  });
});
