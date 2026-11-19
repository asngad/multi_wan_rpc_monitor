# Sistem Monitoring Kinerja Multi-WAN Berbasis Web Real-Time Menggunakan Integrasi RPC Untuk Deteksi Dini Anomali Trafik Jaringan

Aplikasi ini dikembangkan khusus sebagai implementasi praktis dan penelitian skripsi Program Studi Teknik Informatika / Sistem Komputer di **Universitas Nahdlatul Ulama Al Ghazali (UNUGHA)** oleh **Mohammad Asngad**.

---

## 📌 Ringkasan Akademik Proposal Skripsi

| Komponen | Penjelasan |
|---|---|
| **Judul Skripsi** | Integrasi RPC (Remote Procedure Call) Sistem Monitoring Kinerja Multi-WAN Berbasis Web Real-Time Untuk Deteksi Dini Anomali Trafik Jaringan |
| **Masalah Utama** | 1. Overhead tinggi & latensi besar pada protokol konvensional (HTTP REST Polling / SNMP) saat pemantauan multi-gateway frekuensi tinggi.<br>2. Ketiadaan deteksi dini anomali otomatis yang adaptif terhadap pola trafik harian (*peak* vs *off-peak*).<br>3. Lambatnya deteksi degradasi parsial (*asymmetric loss*, *WAN flapping*, *bufferbloat*). |
| **Solusi yang Diusulkan** | 1. Integrasi protokol **RPC (JSON-RPC 2.0)** untuk pengiriman telemetri sub-milidetik yang ringan.<br>2. Kombinasi analitik **Z-Score** (deteksi deviasi lonjakan) dan **EWMA** (pembentukan baseline dinamis).<br>3. Dashboard NOC web berbasis **Node.js, Express, dan Socket.io** dengan visualisasi grafik real-time serta simulasi pengujian. |

---

## 🏗️ Arsitektur & Teknologi Sistem

- **Runtime & Backend**: Node.js v18+ / v20+
- **Framework Web**: Express.js (REST API & Web Static Serving)
- **Komunikasi Telemetri**: JSON-RPC 2.0 (`jayson` engine)
- **Real-Time Distribution**: Socket.io (WebSocket streaming sub-detik)
- **Engine Deteksi Anomali**:
  - **EWMA (Exponentially Weighted Moving Average)**: $S_t = \alpha Y_t + (1 - \alpha) S_{t-1}$
  - **Z-Score Statistical Deviation**: $Z = \frac{X - \mu}{\sigma}$
  - **Domain Multi-WAN Rules**: Detektor Flapping, Saturasi Bandwidth & Bufferbloat, Asymmetric Peering Loss, dan Failover.
- **Frontend Dashboard**: HTML5, Tailwind CSS, FontAwesome 6, dan Chart.js (Dark-Mode Cyberpunk NOC Theme).
- **Pengujian Sistem**: Jest Test Suite & Built-in Empirical RPC vs REST Benchmark.

---

## 🚀 Panduan Menjalankan Aplikasi di VS Code

### 1. Prasyarat
Pastikan Node.js dan NPM telah terpasang di komputer Anda.

### 2. Instalasi Dependensi
Buka terminal VS Code di dalam folder proyek ini:
```bash
cd c:\Users\asnga\Downloads\e-tahfidz\multi-wan-rpc-monitor
npm install
```

### 3. Menjalankan Server Aplikasi
Anda dapat memilih salah satu cara berikut:

#### Opsi A: Menggunakan Tombol Debugger VS Code (F5)
1. Buka folder `multi-wan-rpc-monitor` di VS Code.
2. Buka tab **Run and Debug** (`Ctrl + Shift + D`).
3. Pilih konfigurasi **"Jalankan Server Multi-WAN Monitoring"**.
4. Tekan tombol **Play hijau** atau tekan **F5**.

#### Opsi B: Menggunakan Terminal
```bash
npm start
# atau mode development auto-reload:
npm run dev
```

### 4. Mengakses Dashboard Web
Buka peramban (Chrome / Edge / Firefox) dan akses:
👉 **[http://localhost:4000](http://localhost:4000)**

---

## 🧪 Panduan Demonstrasi Saat Sidang Skripsi

Aplikasi telah dilengkapi dengan **Interactive Anomaly Injection Panel** dan **Empirical Benchmark Tool** yang siap didemonstrasikan di hadapan dosen penguji:

### Demonstrasi 1: Uji Komparasi Kinerja RPC vs REST (Untuk Bab 4 Skripsi)
1. Klik tombol **"Uji Komparasi RPC vs REST"** di pojok kanan atas dashboard.
2. Pilih jumlah iterasi (misal **50 Iterasi**).
3. Klik **"Mulai Uji Komparasi"**.
4. Sistem akan otomatis mengeksekusi panggilan telemetri secara berurutan menggunakan JSON-RPC 2.0 dan REST HTTP POST, lalu menampilkan tabel perbandingan:
   - Rata-rata Latensi Transmisi (ms)
   - 95th Percentile Latency (P95)
   - Throughput (Requests per Second)
   - Ukuran Header & Payload Overhead (Bytes)
   - Persentase efisiensi komunikasi yang dihasilkan!

### Demonstrasi 2: Injeksi Skenario Gangguan Multi-WAN
Klik tombol **"Injeksi Skenario"** dan pilih salah satu skenario berikut untuk menunjukkan kehandalan deteksi dini anomali:

1. **Kondisi Normal**: Semua antarmuka (WAN 1 IndiHome, WAN 2 Biznet, WAN 3 Seluler) berjalan normal dengan health score ~100%.
2. **Lonjakan Latensi Ekstrem (Z-Score Spikes)**: Injeksi latensi tinggi (180ms+) pada WAN 1. Perhatikan grafik latensi melonjak seketika, status Z-Score berubah menjadi $> +3.0\sigma$, dan muncul peringatan *CRITICAL* dengan suara *beep*.
3. **Asymmetric Packet Loss (Peering ISP 2 Rusak)**: Injeksi 20% packet loss pada WAN 2 sementara WAN 1 dan WAN 3 tetap 0%. Sistem mengenali bahwa kendala berada pada rute transit upstream ISP 2 dan menyarankan pengalihan sesi interaktif.
4. **WAN Flapping**: Status WAN 1 berulang kali berubah UP/DOWN secara cepat. Sistem mendeteksi *flapping condition* dan menyarankan isolasi rute agar tidak merusak tabel routing global.
5. **Traffic Burst / DDoS**: Lonjakan volume bandwidth hingga 95% kapasitas pipa + bufferbloat latensi. Sistem membunyikan peringatan dan menampilkan saran *traffic shaping / queue discipline*.
6. **Total Link Down & Failover**: WAN 1 mati total (0 Mbps, 100% loss). Beban dialihkan otomatis ke antarmuka cadangan.

---

## 🔬 Menjalankan Pengujian Otomatis (Unit Testing)

Untuk memvalidasi integritas kode, algoritma matematika, dan kehandalan RPC:
```bash
npm test
```
Untuk menghasilkan laporan cakupan kode (*code coverage report*):
```bash
npm run test:coverage
```

---

## 📂 Struktur Direktori Proyek

```
multi-wan-rpc-monitor/
├── .vscode/
│   └── launch.json              # Konfigurasi Debugging VS Code (F5)
├── package.json                 # Konfigurasi dependensi Node.js
├── README.md                    # Dokumentasi lengkap sistem
├── src/
│   ├── server.js                # Bootstrap Express, Socket.io, & RPC Server
│   ├── config/
│   │   └── default.js           # Konfigurasi interface WAN & ambang batas anomali
│   ├── rpc/
│   │   ├── rpcServer.js         # Prosedur remote ingestWANMetrics, pingRpc, dll.
│   │   └── rpcClientProbe.js    # Agen pemantau antarmuka Multi-WAN background
│   ├── anomaly/
│   │   ├── ewmaFilter.js        # Rumus pemulusan baseline EWMA
│   │   ├── zScore.js            # Perhitungan deviasi statistik Z-Score
│   │   ├── multiWanRules.js     # Aturan deteksi flapping, bufferbloat, asimetris
│   │   └── anomalyEngine.js     # Koordinator terpadu mesin deteksi anomali
│   ├── services/
│   │   ├── wanStore.js          # In-memory time-series cache & status antarmuka
│   │   ├── alertService.js      # Pengelola riwayat insiden & notifikasi
│   │   ├── simulator.js         # Generator telemetri & pengatur skenario uji
│   │   └── benchmarkService.js  # Modul pengujian empiris RPC vs REST
│   ├── controllers/
│   │   └── apiController.js     # REST API router untuk dashboard & konfigurasi
│   └── public/
│       ├── index.html           # Dashboard NOC Web Real-Time (Tailwind CSS)
│       ├── css/style.css        # Styling tema gelap Cyberpunk Glassmorphism
│       └── js/app.js            # Consumer Socket.io & render Chart.js real-time
└── tests/
    ├── ewma.test.js             # Pengujian unit rumus EWMA
    ├── zScore.test.js           # Pengujian unit kalkulasi Z-Score
    ├── multiWanRules.test.js    # Pengujian unit aturan domain Multi-WAN
    ├── anomalyEngine.test.js    # Pengujian integrasi mesin anomali & skoring
    └── rpc.test.js              # Pengujian pemanggilan prosedur remote RPC
```

---

## 🎓 Kontribusi Akademis untuk Naskah Skripsi

- **Bab 1 (Pendahuluan)**: Latar belakang pentingnya Multi-WAN, kelemahan polling konvensional, dan urgensi RPC dalam telemetri berkecepatan tinggi.
- **Bab 2 (Tinjauan Pustaka)**: Teori Multi-WAN, RPC (Remote Procedure Call), EWMA, Teorema Limit Terpusat / Z-Score, dan Arsitektur Real-Time Web (WebSocket).
- **Bab 3 (Metodologi Penelitian)**: Diagram Use Case, Arsitektur Sistem Antigravity, Diagram Sequence, Class Diagram, dan Matriks Pengujian Anomali.
- **Bab 4 (Hasil dan Pembahasan)**: Hasil implementasi dashboard NOC, pengujian fungsionalitas, hasil akurasi deteksi skenario injeksi anomali, serta data komparasi numerik pengujian performa RPC vs REST Polling.
- **Bab 5 (Kesimpulan dan Saran)**: Rekomendasi implementasi di router produksi (MikroTik RouterOS API / Linux eBPF probe).

---

## 🐳 Panduan Deployment Docker Compose & Cloudflare Tunnel (`/home/asngad/`)

Aplikasi ini telah dilengkapi konfigurasi kontainerisasi siap pakai (`Dockerfile`, `docker-compose.yml`) yang mengemas 3 layanan terkoordinasi:
1. **`app`**: Backend Node.js 20 & WebSocket Engine (Port 4000).
2. **`mysql`**: Database MySQL 8.0 dengan *persistent volume* dan inisialisasi skema otomatis (`schema.sql`).
3. **`tunnel`**: Cloudflare Tunnel resmi (`cloudflare/cloudflared`) yang memublikasikan sistem ke internet secara aman tanpa perlu IP Publik Statis atau Port Forwarding pada router.

### Langkah-langkah di Home Server (`/home/asngad/`):

1. **Masuk ke folder home server:**
   ```bash
   cd /home/asngad
   ```

2. **Clone repositori GitHub:**
   ```bash
   git clone https://github.com/asngad/multi_wan_rpc_monitor.git
   cd multi_wan_rpc_monitor
   ```

3. **(Opsional) Siapkan Environment:**
   ```bash
   cp .env.docker.example .env
   ```

4. **Jalankan seluruh stack kontainer di latar belakang:**
   ```bash
   docker compose up -d --build
   ```

5. **Lihat URL Publik Cloudflare Tunnel:**
   ```bash
   docker compose logs -f tunnel
   ```
   > URL HTTPS publik instan (misal: `https://xxxx.trycloudflare.com`) akan tampil di baris log. Sistem dapat langsung diakses dari HP atau luar jaringan kampus dengan enkripsi SSL resmi!

6. **Akses Lokal Jaringan Rumah / Kampus:**
   - Akses via browser: `http://<IP_HOME_SERVER>:4000` (contoh: `http://192.168.1.50:4000`)

7. **Perintah Manajemen Kontainer:**
   - Cek status kontainer: `docker compose ps`
   - Lihat log aplikasi: `docker compose logs -f app`
   - Matikan sistem: `docker compose down`
   - Restart sistem: `docker compose restart`
