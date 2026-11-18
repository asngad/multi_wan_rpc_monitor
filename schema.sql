-- ====================================================================
-- Database Schema: multi_wan_rpc_db
-- Sistem Monitoring Kinerja Multi-WAN Berbasis RPC & Deteksi Dini Anomali
-- Mahasiswa: Mohammad Asngad - Universitas Nahdlatul Ulama Al Ghazali (UNUGHA)
-- ====================================================================

CREATE DATABASE IF NOT EXISTS `multi_wan_rpc_db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `multi_wan_rpc_db`;

-- 1. TABEL: Master Antarmuka WAN (Citranet, Indibiz, Starlink, Starlite)
DROP TABLE IF EXISTS `anomaly_logs`;
DROP TABLE IF EXISTS `wan_telemetry_history`;
DROP TABLE IF EXISTS `wan_interfaces`;

CREATE TABLE `wan_interfaces` (
  `id` VARCHAR(50) NOT NULL COMMENT 'ID Unik WAN: wan-citra, wan-indibiz, dll',
  `name` VARCHAR(100) NOT NULL COMMENT 'Nama antarmuka WAN',
  `isp` VARCHAR(120) NOT NULL COMMENT 'Nama Penyedia Jasa Internet / Provider',
  `gateway` VARCHAR(45) NOT NULL COMMENT 'Alamat IP Gateway ISP',
  `dns_target` VARCHAR(45) NOT NULL COMMENT 'Target ping / DNS untuk uji RTT',
  `capacity_mbps` INT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Kapasitas Bandwidth Pipa (Mbps)',
  `baseline_latency_ms` DECIMAL(6,2) NOT NULL DEFAULT 10.00 COMMENT 'Baseline RTT normal (ms)',
  `baseline_loss_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Baseline toleransi packet loss (%)',
  `role` VARCHAR(50) NOT NULL DEFAULT 'PRIMARY' COMMENT 'Peran dalam Load Balancing',
  `color_code` VARCHAR(20) NOT NULL DEFAULT '#06b6d4' COMMENT 'Warna penanda di chart web',
  `status` ENUM('UP', 'DOWN', 'DEGRADED', 'FLAPPING') NOT NULL DEFAULT 'UP',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. TABEL: Riwayat Telemetri Data Stream (Dikirim via RPC)
CREATE TABLE `wan_telemetry_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `wan_id` VARCHAR(50) NOT NULL,
  `rtt_ms` DECIMAL(8,2) NOT NULL COMMENT 'Round Trip Time (ms)',
  `jitter_ms` DECIMAL(8,2) NOT NULL DEFAULT 0.00 COMMENT 'Variasi latensi / Jitter (ms)',
  `packet_loss_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00 COMMENT 'Packet Loss (%)',
  `rx_throughput_mbps` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Kecepatan Download (Mbps)',
  `tx_throughput_mbps` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'Kecepatan Upload (Mbps)',
  `total_throughput_mbps` DECIMAL(10,2) GENERATED ALWAYS AS (`rx_throughput_mbps` + `tx_throughput_mbps`) STORED,
  `health_score` TINYINT UNSIGNED NOT NULL DEFAULT 100 COMMENT 'Skor Kesehatan Link (0 - 100)',
  `has_anomaly` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1 jika terdeteksi anomali, 0 jika normal',
  `rpc_method` VARCHAR(50) NOT NULL DEFAULT 'ingestWANMetrics' COMMENT 'Prosedur RPC pemanggil',
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wan_time` (`wan_id`, `recorded_at`),
  KEY `idx_has_anomaly` (`has_anomaly`, `recorded_at`),
  CONSTRAINT `fk_telemetry_wan` FOREIGN KEY (`wan_id`) REFERENCES `wan_interfaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. TABEL: Log Insiden Deteksi Dini Anomali (Z-Score & Multi-WAN Rules)
CREATE TABLE `anomaly_logs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `wan_id` VARCHAR(50) NOT NULL,
  `anomaly_type` VARCHAR(100) NOT NULL COMMENT 'ZSCORE_LATENCY_SPIKE, ASYMMETRIC_LOSS, BUFFERBLOAT, FLAPPING, dll',
  `severity` ENUM('INFO', 'WARNING', 'CRITICAL') NOT NULL DEFAULT 'WARNING',
  `z_score` DECIMAL(6,3) DEFAULT NULL COMMENT 'Nilai deviasi Z-Score (Z = (X - μ) / σ)',
  `metric_value` DECIMAL(10,2) NOT NULL COMMENT 'Nilai terukur saat anomali',
  `threshold_value` DECIMAL(10,2) DEFAULT NULL COMMENT 'Nilai ambang batas / baseline',
  `message` VARCHAR(255) NOT NULL COMMENT 'Deskripsi detail anomali',
  `recommendation` TEXT DEFAULT NULL COMMENT 'Rekomendasi mitigasi rute / failover',
  `is_acknowledged` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Sudah di-acknowledge admin atau belum',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_severity_time` (`severity`, `created_at`),
  KEY `idx_wan_anomaly` (`wan_id`, `created_at`),
  CONSTRAINT `fk_anomaly_wan` FOREIGN KEY (`wan_id`) REFERENCES `wan_interfaces` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. TABEL: Telemetri Core Router MikroTik (PCC Load Balancing & Resource)
DROP TABLE IF EXISTS `mikrotik_core_telemetry`;
CREATE TABLE `mikrotik_core_telemetry` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `router_name` VARCHAR(100) NOT NULL DEFAULT 'MikroTik CCR1036-8G-2S+',
  `cpu_usage_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `memory_usage_pct` DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  `active_connections` INT UNSIGNED NOT NULL DEFAULT 0,
  `load_balance_status` VARCHAR(50) NOT NULL DEFAULT 'BALANCED',
  `recorded_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_core_time` (`recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. TABEL: Riwayat Uji Komparasi Ilmiah RPC vs REST
DROP TABLE IF EXISTS `benchmark_history`;
CREATE TABLE `benchmark_history` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `iterations` INT UNSIGNED NOT NULL COMMENT 'Jumlah panggilan telemetri diuji',
  `rpc_avg_latency_ms` DECIMAL(8,3) NOT NULL COMMENT 'Rata-rata latensi JSON-RPC (ms)',
  `rest_avg_latency_ms` DECIMAL(8,3) NOT NULL COMMENT 'Rata-rata latensi HTTP REST (ms)',
  `rpc_p95_ms` DECIMAL(8,3) NOT NULL COMMENT 'Latensi persentil 95 RPC',
  `rest_p95_ms` DECIMAL(8,3) NOT NULL COMMENT 'Latensi persentil 95 REST',
  `rpc_rps` DECIMAL(10,2) NOT NULL COMMENT 'Throughput RPC (Requests Per Second)',
  `rest_rps` DECIMAL(10,2) NOT NULL COMMENT 'Throughput REST (Requests Per Second)',
  `efficiency_percent` DECIMAL(5,2) NOT NULL COMMENT 'Persentase keunggulan latensi RPC terhadap REST (%)',
  `tested_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SEEDING DATA AWAL: 4 WAN UNUGHA
INSERT INTO `wan_interfaces` 
(`id`, `name`, `isp`, `gateway`, `dns_target`, `capacity_mbps`, `baseline_latency_ms`, `baseline_loss_pct`, `role`, `color_code`, `status`) 
VALUES
('wan-citra', 'WAN 1 (Citranet Fiber)', 'Citra (Citranet Dedicated)', '103.253.112.1', '8.8.8.8', 100, 6.00, 0.05, 'PRIMARY_DEDICATED', '#06b6d4', 'UP'),
('wan-indibiz', 'WAN 2 (Indibiz Enterprise)', 'Indibiz (Telkom Enterprise)', '180.252.1.1', '1.1.1.1', 100, 14.00, 0.10, 'LOAD_BALANCE_PRIMARY', '#ef4444', 'UP'),
('wan-starlink', 'WAN 3 (Starlink Satellite)', 'Starlink (SpaceX LEO Satellite)', '192.168.100.1', '9.9.9.9', 150, 32.00, 0.25, 'HIGH_SPEED_BURST', '#a855f7', 'UP'),
('wan-starlite', 'WAN 4 (Starlite Metro)', 'Starlite (Starlight Metro Fiber)', '103.144.12.1', '208.67.222.222', 50, 16.00, 0.10, 'FAILOVER_BACKUP', '#10b981', 'UP')
ON DUPLICATE KEY UPDATE 
  `name` = VALUES(`name`),
  `capacity_mbps` = VALUES(`capacity_mbps`),
  `baseline_latency_ms` = VALUES(`baseline_latency_ms`);

-- 6. TABEL: Pengguna & Otentikasi Petugas NOC (Login & Registrasi)
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `fullname` VARCHAR(100) NOT NULL,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `email` VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role` ENUM('admin', 'operator', 'viewer') NOT NULL DEFAULT 'admin',
  `last_login` TIMESTAMP NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- SEEDING AKUN DEFAULT: Administrator Mohammad Asngad (Password: admin123)
INSERT INTO `users` (`fullname`, `username`, `email`, `password_hash`, `role`) 
VALUES ('Mohammad Asngad', 'admin', 'admin@unugha.ac.id', '7f520ca5b9611699f2295873e7aa1a0f4fb9c5188b531c2bd85c0dc84599e159519ff4775001dc29b2095ed8d9f235aae623341c72999f489d16ac28866573cc', 'admin')
ON DUPLICATE KEY UPDATE `fullname` = VALUES(`fullname`);
