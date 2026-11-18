# 📘 RENCANA & IDE PEMBANGUNAN APLIKASI WEB

## Integrasi RPC (Remote Procedure Call) Sistem Monitoring Kinerja Multi-WAN Berbasis Web Real-Time untuk Deteksi Dini Anomali Trafik Jaringan

| Informasi | Keterangan |
| :--- | :--- |
| **Jenis Proyek** | Aplikasi Web Monitoring Jaringan (NOC Dashboard) + Penelitian Skripsi |
| **Paradigma** | Real-Time Telemetry berbasis RPC |
| **Runtime** | Node.js v18+ / v20+ |
| **Lingkungan Pengembangan** | Visual Studio Code (VS Code) |
| **Versi Rencana** | 1.0 |
| **Tanggal** | November 2026 |

---

## 1. IDE UTAMA & LATAR BELAKANG

### 1.1 Ide Sentral
> **"Menggantikan polling HTTP/SNMP yang berat dan lambat dengan panggilan prosedur jarak jauh (RPC) yang ringan, lalu mengalirkan telemetri tersebut secara real-time ke dashboard web untuk mendeteksi anomali sejak detik pertama."**

Sistem ini dirancang sebagai **"NOC (Network Operations Center) mini"** berbasis web yang memantau beberapa koneksi WAN (ISP) secara bersamaan. Alih-alih menunggu agen mengirim data lewat request HTTP berulang (polling) yang boros *header* dan latency, sistem menggunakan **JSON-RPC 2.0** untuk memanggil fungsi pengiriman metrik langsung ke server. Data langsung didorong (push) ke browser lewat **WebSocket** sehingga grafik bergerak tanpa *refresh*.

### 1.2 Masalah yang Dipecahkan
1. **Overhead Protokol Konvensional** — REST polling / SNMP mengirim header berulang, boros bandwidth, dan latensi tinggi pada frekuensi tinggi.
2. **Deteksi Anomali Lambat** — Threshold statis gagal mengenali pola dinamis (jam sibuk vs sepi), sehingga anomali baru terdeteksi setelah dampaknya terasa.
3. **Degradasi Parsial Sulit Terlihat** — *WAN flapping*, *asymmetric loss*, dan *bufferbloat* sering tidak terlihat pada monitoring rata-rata biasa.

### 1.3 Nilai Inovasi
- ✅ RPC ringan (payload kecil, latensi sub-milidetik) untuk telemetri multi-WAN.
- ✅ Baseline adaptif dengan **EWMA** + deviasi statistik **Z-Score** (bukan sekadar ambang batas tetap).
- ✅ Aturan domain khusus Multi-WAN (flapping, asimetris, saturasi, failover).
- ✅ Dashboard real-time dengan injeksi skenario & benchmark RPC vs REST untuk pembuktian ilmiah.

---

## 2. TUJUAN & LUARAN

| Tujuan | Luaran (Deliverable) |
| :--- | :--- |
| Membangun kanal telemetri RPC yang efisien | `rpcServer.js`, `rpcClientProbe.js` |
| Mendeteksi anomali secara dini & adaptif | `anomalyEngine.js`, `ewmaFilter.js`, `zScore.js`, `multiWanRules.js` |
| Menyajikan data real-time di browser | Dashboard `index.html` + `app.js` (Socket.io + Chart.js) |
| Membuktikan keunggulan RPC | `benchmarkService.js` + tabel komparasi di UI |
| Memenuhi kebutuhan akademik | Unit test Jest + dokumentasi Bab 1–5 skripsi |

---

## 3. ARSITEKTUR SISTEM

```
┌──────────────────────────────────────────────────────────────────────┐
│                        LAPIS PENGAMBIL DATA (PROBE)                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐                     │
│  │ WAN 1      │  │ WAN 2      │  │ WAN 3      │   ← Simulasi /       │
│  │ IndiHome   │  │ Biznet     │  │ Seluler    │     Router OS probe  │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘                     │
│        └───────────────┼───────────────┘                            │
│                        │ JSON-RPC 2.0 (jayson)                      │
│                        ▼                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              RPC SERVER (Node.js + Express)                   │  │
│  │  Method: ingestWANMetrics, pingRpc, getStatus, injectScenario │  │
│  └───────────────┬──────────────────────────┬─────────────────────┘  │
│                  │                          │                       │
│                  ▼                          ▼                       │
│  ┌────────────────────────┐   ┌──────────────────────────────────┐  │
│  │  ANOMALY ENGINE        │   │  WAN STORE (Time-series cache)   │  │
│  │  • EWMA baseline       │   │  • History metrik per interface  │  │
│  │  • Z-Score deviation   │◄──►  • Status & health score         │  │
│  │  • Multi-WAN rules     │   │  • Alert log                     │  │
│  └───────────┬────────────┘   └──────────────────────────────────┘  │
│              │ Socket.io (WebSocket push)                           │
│              ▼                                                      │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │              WEB DASHBOARD (Browser - Real-Time)               │  │
│  │  Grafik latensi · Bandwidth · Packet Loss · Health Score       │  │
│  │  Panel injeksi skenario · Benchmark RPC vs REST · Alert toast  │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.1 Komponen Utama
| Komponen | Peran | File |
| :--- | :--- | :--- |
| **RPC Server** | Menerima panggilan prosedur telemetri dari probe | `src/rpc/rpcServer.js` |
| **RPC Client Probe** | Agen background pengirim metrik tiap interval | `src/rpc/rpcClientProbe.js` |
| **Anomaly Engine** | Koordinator deteksi + skoring health | `src/anomaly/anomalyEngine.js` |
| **EWMA Filter** | Membentuk baseline dinamis | `src/anomaly/ewmaFilter.js` |
| **Z-Score** | Mengukur deviasi dari baseline | `src/anomaly/zScore.js` |
| **Multi-WAN Rules** | Flapping, bufferbloat, asimetris, failover | `src/anomaly/multiWanRules.js` |
| **WAN Store** | Cache time-series & status antarmuka | `src/services/wanStore.js` |
| **Alert Service** | Riwayat insiden & notifikasi | `src/services/alertService.js` |
| **Simulator** | Generator telemetri + skenario uji | `src/services/simulator.js` |
| **Benchmark Service** | Uji empiris RPC vs REST | `src/services/benchmarkService.js` |
| **API Controller** | Endpoint REST untuk dashboard & konfigurasi | `src/controllers/apiController.js` |
| **Bootstrap Server** | Inisialisasi Express, Socket.io, RPC | `src/server.js` |

---

## 4. STACK TEKNOLOGI (Node.js di VS Code)

| Lapisan | Teknologi | Alasan Pemilihan |
| :--- | :--- | :--- |
| **Runtime** | Node.js v18+ | Async I/O, cocok untuk telemetri konkuren |
| **Web Framework** | Express.js | Ringan, stabil, mudah integrasi RPC & static |
| **RPC Engine** | `jayson` (JSON-RPC 2.0) | Standar RPC, payload kecil, µs-level parsing |
| **Real-Time** | Socket.io (WebSocket) | Push data ke browser tanpa polling |
| **Frontend** | HTML5 + Tailwind CSS + FontAwesome | Dashboard cepat, tema gelap NOC |
| **Charting** | Chart.js | Grafik real-time latency/bandwidth |
| **Analitik** | EWMA + Z-Score + Rule engine | Deteksi adaptif & deterministik |
| **Testing** | Jest | Unit test algoritma & RPC |
| **Tooling** | VS Code (F5 debug, tasks, extensions) | Pengembangan & debugging langsung |
| **Eksekusi** | `jalankan.bat` / `npm start` | Convenience script |

### 4.1 Konfigurasi VS Code yang Disarankan
- **`.vscode/launch.json`** → konfigurasi *"Jalankan Server Multi-WAN Monitoring"* (F5 debug).
- **`.vscode/tasks.json`** → task npm: `start`, `dev`, `test`, `test:coverage`.
- **`.vscode/extensions.json`** → rekomendasi:
  - `dbaeumer.vscode-eslint`
  - `esbenp.prettier-vscode`
  - `ms-vscode.vscode-js-debug`
  - `bradlc.vscode-tailwindcss`

---

## 5. DAFTAR FITUR

### 5.1 Fitur Inti
- [x] Ingest telemetri multi-WAN via **JSON-RPC 2.0**.
- [x] Penyimpanan time-series in-memory (history metrik per interface).
- [x] Status koneksi & *health score* per WAN (IndiHome, Biznet, Seluler).
- [x] REST API untuk mengambil snapshot, history, dan konfigurasi.

### 5.2 Fitur Deteksi Anomali
- [x] **Z-Score Spike Detection** — lonjakan latensi/bandwidth di atas $+3\sigma$.
- [x] **EWMA Adaptive Baseline** — baseline mengikuti pola harian (peak/off-peak).
- [x] **WAN Flapping Detection** — perubahan UP/DOWN berulang cepat.
- [x] **Asymmetric Packet Loss** — loss hanya di satu ISP (indikasi peering rusak).
- [x] **Saturation & Bufferbloat** — bandwidth ≥95% + latensi antrean naik.
- [x] **Total Link Down & Failover** — beban dialihkan ke WAN cadangan.

### 5.3 Fitur Dashboard Real-Time
- [x] Grafik latensi, bandwidth, packet loss (Chart.js, update via Socket.io).
- [x] Kartu status tiap WAN + health score.
- [x] Panel **Injeksi Skenario** (6 skenario gangguan) untuk demo.
- [x] Panel **Benchmark RPC vs REST** (latensi, P95, throughput, overhead byte).
- [x] Alert toast + suara *beep* saat CRITICAL.
- [x] Riwayat insiden (alert log).

### 5.4 Fitur Pengujian
- [x] Unit test EWMA, Z-Score, Multi-WAN Rules, Anomaly Engine, RPC.
- [x] Coverage report via Jest.

---

## 6. STRUKTUR DIREKTORI

```
multi-wan-rpc-monitor/
├── .vscode/
│   ├── launch.json            # Debug F5
│   ├── tasks.json             # Task npm
│   └── extensions.json        # Rekomendasi ekstensi
├── jalankan.bat               # Script cepat Windows
├── package.json               # Dependensi & script
├── README.md                  # Dokumentasi sistem
├── PLAN_PENGEMBANGAN.md       # ← Dokumen rencana ini
├── src/
│   ├── server.js              # Bootstrap Express + Socket.io + RPC
│   ├── config/default.js      # Konfigurasi WAN & ambang anomali
│   ├── rpc/
│   │   ├── rpcServer.js       # Prosedur RPC
│   │   └── rpcClientProbe.js  # Agen telemetri
│   ├── anomaly/
│   │   ├── ewmaFilter.js
│   │   ├── zScore.js
│   │   ├── multiWanRules.js
│   │   └── anomalyEngine.js
│   ├── services/
│   │   ├── wanStore.js
│   │   ├── alertService.js
│   │   ├── simulator.js
│   │   └── benchmarkService.js
│   ├── controllers/apiController.js
│   └── public/
│       ├── index.html         # Dashboard NOC
│       ├── css/style.css
│       └── js/app.js          # Consumer Socket.io + Chart.js
└── tests/
    ├── ewma.test.js
    ├── zScore.test.js
    ├── multiWanRules.test.js
    ├── anomalyEngine.test.js
    └── rpc.test.js
```

---

## 7. ROADMAP PENGEMBANGAN

| Fase | Nama | Aktivitas | Output |
| :--- | :--- | :--- | :--- |
| **1** | Fondasi & Setup VS Code | Init project, install dependensi, `launch.json`, `tasks.json` | Project siap dijalankan F5 |
| **2** | Kanal Telemetri RPC | Implementasi `jayson` server + probe, method `ingestWANMetrics`, `pingRpc` | RPC client → server bekerja |
| **3** | Message Bus & Penyimpanan | `wanStore` time-series, Socket.io push ke browser | Grafik bergerak real-time |
| **4** | Mesin Deteksi Anomali | EWMA → Z-Score → multi-WAN rules → health scoring | Alert otomatis muncul |
| **5** | Dashboard & Skenario UI | Chart.js, panel injeksi, alert toast, tema NOC | Dashboard interaktif lengkap |
| **6** | Benchmark & Pembuktian | `benchmarkService` RPC vs REST (latensi, P95, throughput, overhead) | Tabel komparasi di UI |
| **7** | Testing & Dokumentasi | Jest unit test, coverage, README, naskah Bab 1–5 | Proyek siap sidang |

### 7.1 Estimasi Fokus per Fase
- Fase 1–2: ⚙️ Infrastruktur (30%)
- Fase 3–4: 🧠 Logika inti & deteksi (40%)
- Fase 5–6: 🎨 Presentasi & pembuktian (20%)
- Fase 7: ✅ Kualitas & akademik (10%)

---

## 8. SPESIFIKASI PROTOKOL RPC

### 8.1 Method yang Diekspos
| Method | Parameter | Fungsi |
| :--- | :--- | :--- |
| `ingestWANMetrics` | `{ wanId, latency, bandwidth, loss, jitter, timestamp }` | Menerima telemetri dari probe |
| `pingRpc` | `{}` | Uji konektivitas & latensi RPC |
| `getWANStatus` | `{ wanId? }` | Ambil status terkini |
| `injectScenario` | `{ scenario }` | Injeksi skenario gangguan (demo) |
| `getHistory` | `{ wanId, limit }` | Ambil riwayat metrik |

### 8.2 Contoh Payload JSON-RPC 2.0
```json
{
  "jsonrpc": "2.0",
  "method": "ingestWANMetrics",
  "params": {
    "wanId": "WAN-1",
    "latency": 18.4,
    "bandwidth": 72.5,
    "loss": 0.2,
    "jitter": 3.1,
    "timestamp": 1731000000000
  },
  "id": 1
}
```

### 8.3 Format Respons
```json
{
  "jsonrpc": "2.0",
  "result": { "accepted": true, "healthScore": 96 },
  "id": 1
}
```

---

## 9. ALGORITMA DETEKSI ANOMALI

### 9.1 EWMA (Baseline Dinamis)
$$S_t = \alpha \cdot Y_t + (1 - \alpha) \cdot S_{t-1}$$
- $\alpha$ = faktor pemulusan (0 < α < 1).
- Menghasilkan baseline yang mengikuti tren, tidak kaku seperti rata-rata statis.

### 9.2 Z-Score (Deviasi Statistik)
$$Z = \frac{X - \mu}{\sigma}$$
- $|Z| > 3$ → anomali (lonjakan/turunan ekstrem).
- Digunakan untuk mendeteksi *spike* latensi & bandwidth.

### 9.3 Aturan Domain Multi-WAN
| Aturan | Kondisi | Rekomendasi |
| :--- | :--- | :--- |
| Flapping | Status UP/DOWN ≥ 3× dalam 10 detik | Isolasi rute |
| Asymmetric Loss | Loss WAN-2 > 20%, WAN lain 0% | Alihkan sesi interaktif |
| Bufferbloat | Bandwidth ≥ 95% + latency naik | Traffic shaping / queue discipline |
| Total Down | loss 100%, bandwidth 0 | Failover ke WAN cadangan |

### 9.4 Health Score
Gabungan bobot latency, loss, jitter, dan status aturan → skor 0–100 per WAN.

---

## 10. SKENARIO DEMONSTRASI (Untuk Sidang)

| # | Skenario | Efek yang Ditampilkan |
| :--- | :--- | :--- |
| 1 | Kondisi Normal | Semua WAN sehat (~100%) |
| 2 | Lonjakan Latensi Ekstrem | Z-Score > +3σ, alert CRITICAL + beep |
| 3 | Asymmetric Packet Loss | Deteksi peering ISP 2, saran alih sesi |
| 4 | WAN Flapping | Deteksi flapping, saran isolasi rute |
| 5 | Traffic Burst / DDoS | Saturasi 95% + bufferbloat, saran shaping |
| 6 | Total Link Down | Failover otomatis ke WAN cadangan |

**Demo Tambahan:** Klik *"Uji Komparasi RPC vs REST"* → 50 iterasi → tabel perbandingan latensi, P95, throughput, overhead byte, dan % efisiensi.

---

## 11. PANDUAN MENJALANKAN DI VS CODE

### 11.1 Prasyarat
- Node.js v18+ & npm terpasang.
- VS Code dengan ekstensi yang direkomendasikan.

### 11.2 Instalasi
```bash
cd c:\Users\asnga\Downloads\e-tahfidz\multi-wan-rpc-monitor
npm install
```

### 11.3 Menjalankan
- **Opsi A (Debugger):** Buka folder di VS Code → `Ctrl+Shift+D` → pilih *"Jalankan Server Multi-WAN Monitoring"* → **F5**.
- **Opsi B (Terminal):**
  ```bash
  npm start     # produksi
  npm run dev   # auto-reload
  ```
- **Opsi C:** Jalankan `jalankan.bat`.

### 11.4 Akses Dashboard
👉 **http://localhost:4000**

### 11.5 Pengujian
```bash
npm test              # unit test
npm run test:coverage # laporan coverage
```

---

## 12. METRIK KEBERHASILAN

| Metrik | Target |
| :--- | :--- |
| Latensi RPC vs REST | RPC ≥ 30% lebih rendah |
| Overhead payload | RPC jauh lebih kecil dari REST |
| Waktu deteksi anomali | < 1 detik setelah injeksi |
| Akurasi deteksi 6 skenario | 6/6 terdeteksi |
| Unit test lulus | 100% test suite hijau |

---

## 13. RISIKO & MITIGASI

| Risiko | Mitigasi |
| :--- | :--- |
| Probe belum bisa baca interface fisik | Gunakan simulator dulu; later integrasi MikroTik API / eBPF |
| EWMA terlalu sensitif | Kalibrasi $\alpha$ lewat konfigurasi `default.js` |
| Socket.io putus | Auto-reconnect bawaan + fallback status indicator |
| Overhead benchmark bias |jalankan iterasi cukup banyak & rata-rata |

---

## 14. RENCANA PENGEMBANGAN LANJUT (Opsional)
- 🔌 Integrasi nyata ke **MikroTik RouterOS API** / **Linux eBPF probe**.
- 🗄️ Persistensi time-series ke **InfluxDB / TimescaleDB**.
- 📱 Notifikasi **Telegram / Email / Webhook** untuk alert.
- 🔐 Autentikasi & role-based access untuk dashboard NOC.
- 📊 Ekspor laporan PDF & histori anomali.

---

> **Catatan:** Dokumen ini adalah rencana/ide pembangunan. Implementasi aktual sudah tersedia di folder ini — silakan gunakan rencana ini sebagai panduan pengembangan, presentasi, atau lampiran naskah skripsi (Bab 3 Metodologi).
