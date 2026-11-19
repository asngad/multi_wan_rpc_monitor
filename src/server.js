/**
 * Main Application Server Entrypoint
 * Mengintegrasikan Express HTTP Server, WebSocket Socket.io, JSON-RPC 2.0 Handler,
 * dan background RPC Client Probes.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config/default');
const { testConnection } = require('./config/database');
const RpcServerModule = require('./rpc/rpcServer');
const RpcClientProbe = require('./rpc/rpcClientProbe');
const apiController = require('./controllers/apiController');
const authController = require('./controllers/authController');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware dasar
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Port dinamis untuk Railway / Vercel / Local
const PORT = process.env.PORT || config.server.port || 4000;

// 1. Inisialisasi RPC Server & Handler
const rpcServer = new RpcServerModule(io);
app.post(config.server.rpcEndpoint, rpcServer.middleware());

// 2. Inisialisasi Background RPC Client Probe
const rpcProbe = new RpcClientProbe(`http://127.0.0.1:${PORT}${config.server.rpcEndpoint}`);
apiController.setDependencies(rpcProbe, io);

// 3. Routing REST API
app.get('/api/status', (req, res) => apiController.getStatus(req, res));
app.get('/api/topology', (req, res) => apiController.getTopology(req, res));
app.get('/api/routers', (req, res) => apiController.getRouters(req, res));
app.post('/api/routers', (req, res) => apiController.createRouter(req, res));
app.put('/api/routers/:id', (req, res) => apiController.updateRouter(req, res));
app.delete('/api/routers/:id', (req, res) => apiController.deleteRouter(req, res));
app.get('/api/mikrotik', (req, res) => apiController.getMikrotik(req, res));
app.get('/api/history', (req, res) => apiController.getHistory(req, res));
app.get('/api/alerts', (req, res) => apiController.getAlerts(req, res));
app.post('/api/alerts/:id/ack', (req, res) => apiController.acknowledgeAlert(req, res));
app.post('/api/simulator/scenario', (req, res) => apiController.setScenario(req, res));
app.get('/api/simulator/scenario', (req, res) => apiController.getScenario(req, res));
app.post('/api/benchmark/run', (req, res) => apiController.runBenchmark(req, res));
app.post('/api/metrics/telemetry', (req, res) => apiController.ingestRestTelemetry(req, res));
app.get('/api/config', (req, res) => apiController.getConfig(req, res));
app.get('/api/db/history', (req, res) => apiController.getDbHistory(req, res));
app.get('/api/db/anomalies', (req, res) => apiController.getDbAnomalies(req, res));
app.get('/api/probe/mode', (req, res) => apiController.getProbeMode(req, res));
app.post('/api/probe/mode', (req, res) => apiController.setProbeMode(req, res));
app.post('/api/probe/ping', (req, res) => apiController.pingHost(req, res));
app.post('/api/probe/verify-all', (req, res) => apiController.verifyAllInternet(req, res));
app.get('/api/mikrotik/script', (req, res) => apiController.getMikrotikScript(req, res));
app.get('/api/routers/:id/openwrt-config', (req, res) => apiController.getOpenWrtConfig(req, res));
app.get('/api/export/csv', (req, res) => apiController.exportCsv(req, res));

// 4. Routing Otentikasi (Login & Registrasi Pengguna)
app.post('/api/auth/register', (req, res) => authController.register(req, res));
app.post('/api/auth/login', (req, res) => authController.login(req, res));
app.get('/api/auth/me', (req, res) => authController.me(req, res));
app.post('/api/auth/logout', (req, res) => authController.logout(req, res));

// Fallback untuk SPA Dashboard
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 4. WebSocket Connection Event
io.on('connection', (socket) => {
  // Kirim data inisial saat client web terhubung
  socket.emit('connected', {
    message: 'Terhubung ke Multi-WAN RPC Monitoring Engine',
    timestamp: Date.now()
  });

  socket.on('request_refresh', () => {
    socket.emit('status_response', {
      timestamp: Date.now()
    });
  });
});

// 5. Jalankan Server
const PORT = config.server.port;
server.listen(PORT, async () => {
  console.log('================================================================');
  console.log(`🚀 MULTI-WAN RPC MONITORING ENGINE BERHASIL DIJALANKAN`);
  console.log(`🌐 Dashboard Web Real-Time : http://localhost:${PORT}`);
  console.log(`⚡ JSON-RPC 2.0 Endpoint    : http://localhost:${PORT}${config.server.rpcEndpoint}`);
  console.log(`📊 REST API Base Endpoint  : http://localhost:${PORT}/api/status`);
  console.log('================================================================');

  // Uji koneksi ke database MySQL
  await testConnection();

  // Mulai probe background setelah server siap menerima koneksi
  rpcProbe.start();
  console.log('📡 RPC Client Probe aktif memantau antarmuka WAN-1, WAN-2, WAN-3');
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('Menerima sinyal SIGTERM. Menghentikan server...');
  rpcProbe.stop();
  server.close(() => process.exit(0));
});

module.exports = { app, server, rpcProbe };
